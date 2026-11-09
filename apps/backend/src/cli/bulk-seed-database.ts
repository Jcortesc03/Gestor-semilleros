/**
 * Escritura de la seed masiva: inserción por lotes (`createMany`) y borrado selectivo de lo que creó.
 * Solo toca filas marcadas: usuarios `@semillero.example.test` y áreas/facultades con sufijo ` · demo`.
 */
import type { PrismaService } from '../database/prisma.service';
import type { TransactionClient } from '../generated/prisma/internal/prismaNamespace';
import { BULK_EMAIL_DOMAIN, BULK_NAME_SUFFIX, type BulkData } from './bulk-seed-data';

const CHUNK = 2_000;
const TX_OPTIONS = { timeout: 600_000, maxWait: 30_000 };

export type BulkCounts = Record<
  'users' | 'projects' | 'boards' | 'activities' | 'assignees' | 'documents' | 'attachments' | 'meetings' | 'participants',
  number
>;

async function inChunks<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) await write(rows.slice(i, i + CHUNK));
}

/** `true` si ya hay datos de la seed masiva. */
export async function hasBulkData(prisma: PrismaService): Promise<boolean> {
  return (await prisma.user.count({ where: { email: { endsWith: `@${BULK_EMAIL_DOMAIN}` } } })) > 0;
}

/** Borra solo los datos de la seed masiva, respetando las claves foráneas `RESTRICT`. */
export async function removeBulkData(prisma: PrismaService): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const users = (await tx.user.findMany({ where: { email: { endsWith: `@${BULK_EMAIL_DOMAIN}` } }, select: { id: true } })).map((u) => u.id);
    const projects = (await tx.project.findMany({ where: { createdById: { in: users } }, select: { id: true } })).map((p) => p.id);
    const inProjects = { board: { projectId: { in: projects } } };

    await tx.activityAttachment.deleteMany({ where: { activity: inProjects } });
    await tx.activityAssignee.deleteMany({ where: { activity: inProjects } });
    await tx.activity.deleteMany({ where: inProjects });
    await tx.board.deleteMany({ where: { projectId: { in: projects } } });
    await tx.document.deleteMany({ where: { projectId: { in: projects } } });
    await tx.meetingParticipant.deleteMany({ where: { OR: [{ userId: { in: users } }, { meeting: { projectId: { in: projects } } }] } });
    await tx.meeting.deleteMany({ where: { OR: [{ organizerId: { in: users } }, { projectId: { in: projects } }] } });
    await tx.projectMember.deleteMany({ where: { OR: [{ projectId: { in: projects } }, { userId: { in: users } }] } });
    await tx.project.deleteMany({ where: { id: { in: projects } } });
    await tx.facultyDean.deleteMany({ where: { userId: { in: users } } });
    await tx.area.deleteMany({ where: { name: { endsWith: BULK_NAME_SUFFIX }, projects: { none: {} } } });
    await tx.faculty.deleteMany({ where: { name: { endsWith: BULK_NAME_SUFFIX }, projects: { none: {} }, deans: { none: {} } } });
    await tx.user.deleteMany({ where: { id: { in: users } } });
  }, TX_OPTIONS);
}

/** Inserta todos los datos generados en una sola transacción. */
export async function insertBulkData(prisma: PrismaService, data: BulkData, passwordHash: string): Promise<BulkCounts> {
  const participants = data.meetings.flatMap((m) => m.participantIds.map((userId) => ({ meetingId: m.id, userId })));

  await prisma.$transaction(async (tx: TransactionClient) => {
    await inChunks(data.users, (rows) =>
      tx.user.createMany({
        data: rows.map((u) => ({ id: u.id, email: u.email, fullName: u.fullName, passwordHash, status: u.status, createdAt: u.createdAt, updatedAt: u.createdAt })),
      }),
    );
    await inChunks(data.users.flatMap((u) => u.roles.map((role) => ({ userId: u.id, role, assignedAt: u.createdAt }))), (rows) => tx.userRole.createMany({ data: rows }));
    await tx.area.createMany({ data: data.areas });
    await tx.faculty.createMany({ data: data.faculties });
    await tx.areaManager.createMany({ data: data.areaManagers });
    await tx.facultyDean.createMany({ data: data.deans });

    await inChunks(data.projects, (rows) =>
      tx.project.createMany({
        data: rows.map(({ facultyIds: _f, ...p }) => ({ ...p, updatedAt: p.createdAt })),
      }),
    );
    await inChunks(data.projects.flatMap((p) => p.facultyIds.map((facultyId) => ({ projectId: p.id, facultyId }))), (rows) => tx.projectFaculty.createMany({ data: rows }));
    await inChunks(data.members, (rows) => tx.projectMember.createMany({ data: rows }));
    await inChunks(data.boards, (rows) => tx.board.createMany({ data: rows.map((b) => ({ ...b, updatedAt: b.completedAt ?? b.createdAt })) }));
    await inChunks(data.activities, (rows) =>
      tx.activity.createMany({ data: rows.map((a) => ({ ...a, updatedAt: a.approvedAt ?? a.completedAt ?? a.createdAt })) }),
    );
    await inChunks(data.assignees, (rows) => tx.activityAssignee.createMany({ data: rows }));
    await inChunks(data.documents, (rows) => tx.document.createMany({ data: rows.map((d) => ({ ...d, sizeBytes: BigInt(d.sizeBytes) })) }));
    await inChunks(data.attachments, (rows) => tx.activityAttachment.createMany({ data: rows }));
    await inChunks(data.meetings, (rows) =>
      tx.meeting.createMany({ data: rows.map(({ participantIds: _p, ...m }) => ({ ...m, updatedAt: m.cancelledAt ?? m.createdAt })) }),
    );
    await inChunks(participants, (rows) => tx.meetingParticipant.createMany({ data: rows }));
  }, TX_OPTIONS);

  return {
    users: data.users.length,
    projects: data.projects.length,
    boards: data.boards.length,
    activities: data.activities.length,
    assignees: data.assignees.length,
    documents: data.documents.length,
    attachments: data.attachments.length,
    meetings: data.meetings.length,
    participants: participants.length,
  };
}
