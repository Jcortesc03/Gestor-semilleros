import { BULK_EMAIL_DOMAIN, BULK_NAME_SUFFIX, generateBulkData, parseBulkScale } from './bulk-seed-data';

const now = new Date('2026-11-08T15:00:00Z');
const data = generateBulkData({ scale: 1, now });

describe('generateBulkData', () => {
  it('genera varios miles de filas', () => {
    expect(data.users.length).toBeGreaterThan(900);
    expect(data.projects.length).toBeGreaterThan(100);
    expect(data.activities.length).toBeGreaterThan(3000);
    expect(data.attachments.length).toBeGreaterThan(1500);
    expect(data.meetings.length).toBeGreaterThan(500);
  });

  it('es determinista', () => {
    const again = generateBulkData({ scale: 1, now });
    expect(again.activities.slice(0, 20)).toEqual(data.activities.slice(0, 20));
    expect(again.users.length).toBe(data.users.length);
  });

  it('usa solo datos marcados como ficticios', () => {
    expect(data.users.every((u) => u.email.endsWith(`@${BULK_EMAIL_DOMAIN}`))).toBe(true);
    expect(new Set(data.users.map((u) => u.email)).size).toBe(data.users.length);
    expect([...data.areas, ...data.faculties].every((x) => x.name.endsWith(BULK_NAME_SUFFIX))).toBe(true);
  });

  it('respeta las restricciones de membresía (P-03, P-05, P-25)', () => {
    const studentProjects = new Map<string, number>();
    const leaders = new Map<string, number>();
    const primaries = new Map<string, number>();
    const pairs = new Set<string>();
    for (const m of data.members) {
      const pair = `${m.projectId}:${m.userId}`;
      expect(pairs.has(pair)).toBe(false);
      pairs.add(pair);
      if (m.projectRole !== 'TUTOR') studentProjects.set(m.userId, (studentProjects.get(m.userId) ?? 0) + 1);
      if (m.projectRole === 'STUDENT_LEADER') leaders.set(m.projectId, (leaders.get(m.projectId) ?? 0) + 1);
      if (m.isPrimary) {
        expect(m.projectRole).toBe('TUTOR');
        primaries.set(m.projectId, (primaries.get(m.projectId) ?? 0) + 1);
      }
    }
    expect(Math.max(...studentProjects.values())).toBe(1);
    expect(Math.max(...leaders.values())).toBe(1);
    expect(Math.max(...primaries.values())).toBe(1);
  });

  it('mantiene coherentes aprobación, terminación, adjuntos y reuniones', () => {
    for (const a of data.activities) {
      expect(a.approvalStatus === 'PENDING').toBe(a.approvedById === null && a.approvedAt === null);
      expect(a.progressStatus === 'DONE').toBe(a.completedAt !== null);
      if (a.approvalStatus !== 'PENDING') expect(a.progressStatus).toBe('DONE');
      if (a.completedAt) expect(a.completedAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
    for (const b of data.boards) expect(b.progressStatus === 'DONE').toBe(b.completedAt !== null);
    const documents = new Set(data.documents.map((d) => d.id));
    for (const t of data.attachments) {
      if (t.kind === 'LINK') expect(t.url !== null && t.documentId === null).toBe(true);
      else expect(t.url === null && t.documentId !== null && documents.has(t.documentId)).toBe(true);
    }
    for (const m of data.meetings) {
      expect(m.status === 'CANCELLED').toBe(m.cancelledAt !== null);
      expect(m.durationMinutes).toBeGreaterThan(0);
      expect(m.participantIds).not.toContain(m.organizerId);
    }
    expect(data.documents.every((d) => d.sizeBytes > 0)).toBe(true);
  });

  it('produce variedad útil para la analítica', () => {
    const statuses = new Set(data.activities.map((a) => a.progressStatus));
    expect([...statuses].sort()).toEqual(['CANCELLED', 'DONE', 'IN_PROGRESS', 'PENDING']);
    const weekend = data.activities.filter((a) => a.completedAt && [0, 6].includes(new Date(a.completedAt.getTime() - 5 * 3_600_000).getUTCDay())).length;
    const done = data.activities.filter((a) => a.completedAt).length;
    expect(weekend / done).toBeLessThan(0.2);
  });
});

describe('parseBulkScale', () => {
  it.each([[undefined, 1], ['', 1], ['3', 3], ['10', 10], ['0', null], ['11', null], ['2.5', null], ['x', null]])('%p → %p', (raw, expected) => {
    expect(parseBulkScale(raw)).toBe(expected);
  });
});
