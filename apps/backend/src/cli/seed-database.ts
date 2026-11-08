/**
 * Lógica de la seed de desarrollo: un usuario de cada tipo más los datos mínimos de contexto
 * (área, facultad, proyecto demo). Es idempotente y respeta las restricciones SQL de la migración inicial.
 * Todos los datos son ficticios (dominio example.test).
 */
import type { PrismaService } from '../database/prisma.service';
import { passwordPolicyErrors, type PasswordService } from '../modules/auth';
import type { Role } from '../generated/prisma/enums';
import type { TransactionClient } from '../generated/prisma/internal/prismaNamespace';

export const SEED_AREA_NAME = 'Semillero de investigación';
export const SEED_FACULTY_NAME = 'Facultad de Ingeniería (demo)';
export const SEED_PROJECT_TITLE = 'Proyecto demo de semillero';

export type SeedProjectRole = 'TUTOR' | 'STUDENT' | 'STUDENT_LEADER';

interface SeedUser {
  email: string;
  fullName: string;
  roles: Role[];
  /** Rol de proyecto en el proyecto demo (si aplica). */
  projectRole?: SeedProjectRole;
  /** Etiqueta legible para el resumen. */
  label: string;
}

export const SEED_USERS: readonly SeedUser[] = [
  { email: 'admin@example.test', fullName: 'Alejandra Administradora', roles: ['ADMIN'], label: 'ADMIN' },
  { email: 'encargado.area@example.test', fullName: 'Mauricio Encargado de Área', roles: ['AREA_MANAGER'], label: 'AREA_MANAGER' },
  { email: 'decano@example.test', fullName: 'Diego Decano Demo', roles: ['DEAN'], label: 'DEAN' },
  { email: 'tutor@example.test', fullName: 'Tatiana Tutora Demo', roles: ['TUTOR'], projectRole: 'TUTOR', label: 'TUTOR' },
  { email: 'lider@example.test', fullName: 'Laura Líder Estudiantil', roles: ['STUDENT'], projectRole: 'STUDENT_LEADER', label: 'STUDENT + STUDENT_LEADER' },
  { email: 'estudiante@example.test', fullName: 'Esteban Estudiante Demo', roles: ['STUDENT'], projectRole: 'STUDENT', label: 'STUDENT + STUDENT' },
];

export interface SeedSummary {
  users: { email: string; roles: string }[];
  area: string;
  faculty: string;
  project: string;
}

export type SeedPasswordResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Valida SEED_PASSWORD con la política de contraseñas del ADR 0011 (10–256, letra y número,
 * distinta del correo). Nunca incluye la contraseña en el error.
 */
export function parseSeedPassword(raw: string | undefined): SeedPasswordResult {
  if (raw === undefined || raw === '') {
    return { ok: false, error: 'SEED_PASSWORD es obligatoria (entre 10 y 256 caracteres, con letra y número).' };
  }
  // La seed usa la misma contraseña para todos los correos: se comprueba contra cada uno.
  const errors = new Set(
    [undefined, ...SEED_USERS.map((u) => u.email)].flatMap((email) => passwordPolicyErrors(raw, email)),
  );
  if (errors.size > 0) return { ok: false, error: `SEED_PASSWORD no es válida: ${[...errors].join(' ')}` };
  return { ok: true, value: raw };
}

export async function seedDatabase(prisma: PrismaService, passwords: PasswordService, password: string): Promise<SeedSummary> {
  const passwordHash = await passwords.hash(password);

  return prisma.$transaction(async (tx) => {
    const ids = new Map<string, string>();
    for (const seed of SEED_USERS) {
      const user = await tx.user.upsert({
        where: { email: seed.email },
        create: { email: seed.email, fullName: seed.fullName, passwordHash, status: 'ACTIVE' },
        update: { fullName: seed.fullName, passwordHash, status: 'ACTIVE', mustChangePassword: false },
      });
      ids.set(seed.email, user.id);
      for (const role of seed.roles) {
        await tx.userRole.upsert({
          where: { userId_role: { userId: user.id, role } },
          create: { userId: user.id, role },
          update: {},
        });
      }
    }
    const idOf = (email: string): string => ids.get(email) as string;

    const area = await tx.area.upsert({
      where: { name: SEED_AREA_NAME },
      create: { name: SEED_AREA_NAME, description: 'Área de demostración para desarrollo.' },
      update: {},
    });
    await tx.areaManager.upsert({
      where: { areaId_userId: { areaId: area.id, userId: idOf('encargado.area@example.test') } },
      create: { areaId: area.id, userId: idOf('encargado.area@example.test') },
      update: {},
    });

    const faculty = await tx.faculty.upsert({ where: { name: SEED_FACULTY_NAME }, create: { name: SEED_FACULTY_NAME }, update: {} });
    await ensureCurrentDean(tx, faculty.id, idOf('decano@example.test'));

    const project = await ensureProject(tx, area.id, faculty.id, idOf('decano@example.test'));

    for (const seed of SEED_USERS) {
      if (seed.projectRole) await ensureMembership(tx, project.id, idOf(seed.email), seed.projectRole);
    }

    return {
      users: SEED_USERS.map((u) => ({ email: u.email, roles: u.label })),
      area: area.name,
      faculty: faculty.name,
      project: project.title,
    };
  });
}

/** Deja al usuario como único decano vigente de la facultad (cierra el anterior si era otro). */
async function ensureCurrentDean(tx: TransactionClient, facultyId: string, userId: string): Promise<void> {
  const current = await tx.facultyDean.findFirst({ where: { facultyId, endsAt: null } });
  if (current?.userId === userId) return;
  if (current) await tx.facultyDean.update({ where: { id: current.id }, data: { endsAt: new Date() } });
  await tx.facultyDean.create({ data: { facultyId, userId } });
}

async function ensureProject(tx: TransactionClient, areaId: string, facultyId: string, createdById: string) {
  const existing = await tx.project.findFirst({ where: { title: SEED_PROJECT_TITLE } });
  const data = { areaId, createdById, status: 'ACTIVE' as const, deletedAt: null };
  const project = existing
    ? await tx.project.update({ where: { id: existing.id }, data })
    : await tx.project.create({
        data: { title: SEED_PROJECT_TITLE, description: 'Proyecto de demostración para desarrollo.', ...data },
      });
  await tx.projectFaculty.upsert({
    where: { projectId_facultyId: { projectId: project.id, facultyId } },
    create: { projectId: project.id, facultyId },
    update: {},
  });
  return project;
}

/** Garantiza una única membresía activa del usuario en el proyecto con el rol indicado. */
async function ensureMembership(tx: TransactionClient, projectId: string, userId: string, projectRole: SeedProjectRole): Promise<void> {
  const isPrimary = projectRole === 'TUTOR';
  const active = await tx.projectMember.findFirst({ where: { projectId, userId, status: 'ACTIVE' } });
  if (active) {
    if (active.projectRole !== projectRole || active.isPrimary !== isPrimary) {
      await tx.projectMember.update({ where: { id: active.id }, data: { projectRole, isPrimary } });
    }
    return;
  }
  await tx.projectMember.create({ data: { projectId, userId, projectRole, isPrimary } });
}
