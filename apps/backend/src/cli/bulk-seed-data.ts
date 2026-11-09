/**
 * Generador puro de datos masivos de desarrollo (miles de filas) para probar la analítica (ADR 0016).
 * Es determinista: la misma semilla, escala y fecha producen las mismas filas.
 * Todos los datos son ficticios (dominio `semillero.example.test`, nombres inventados).
 * Respeta las restricciones SQL de las migraciones (docs/database/data-model.md §6).
 */
import type {
  ApprovalStatus,
  AttachmentKind,
  DocumentFormat,
  MeetingStatus,
  ProgressStatus,
  ProjectRole,
  ProjectStatus,
  Role,
  UserStatus,
  WorkResult,
} from '../generated/prisma/enums';

export const BULK_EMAIL_DOMAIN = 'semillero.example.test';
/** Sufijo de las áreas y facultades creadas por la seed masiva (permite borrarlas con seguridad). */
export const BULK_NAME_SUFFIX = ' · demo';
export const MAX_BULK_SCALE = 10;

const DAY = 86_400_000;
/** Bogotá está en UTC−5 todo el año: las horas locales se convierten sumando 5. */
const UTC_OFFSET_HOURS = 5;

// ─── Catálogos ficticios ───

/** Facultades con su "disciplina" base (probabilidad relativa de completar a tiempo). */
const FACULTIES: ReadonlyArray<[string, number]> = [
  ['Facultad de Ingeniería', 0.82],
  ['Facultad de Ciencias de la Salud', 0.88],
  ['Facultad de Ciencias Económicas', 0.74],
  ['Facultad de Ciencias Humanas y Sociales', 0.68],
  ['Facultad de Ciencias Básicas', 0.79],
  ['Facultad de Artes y Diseño', 0.63],
  ['Facultad de Derecho', 0.71],
  ['Facultad de Educación', 0.76],
];
const AREAS = [
  'Inteligencia artificial',
  'Energías renovables',
  'Salud pública',
  'Biotecnología',
  'Desarrollo sostenible',
  'Educación y tecnología',
  'Economía digital',
];
const FIRST_NAMES = [
  'Ana', 'Andrés', 'Camila', 'Carlos', 'Daniela', 'David', 'Diana', 'Felipe', 'Gabriela', 'Juan', 'Julián', 'Laura',
  'Luis', 'Manuela', 'María', 'Mateo', 'Natalia', 'Nicolás', 'Paula', 'Santiago', 'Sara', 'Sebastián', 'Sofía',
  'Valentina', 'Valeria', 'Alejandro', 'Isabella', 'Samuel', 'Mariana', 'Tomás', 'Lucía', 'Emilio', 'Juliana', 'Martín',
];
const LAST_NAMES = [
  'García', 'Rodríguez', 'Martínez', 'López', 'González', 'Hernández', 'Pérez', 'Sánchez', 'Ramírez', 'Torres',
  'Flórez', 'Rivera', 'Gómez', 'Díaz', 'Moreno', 'Muñoz', 'Rojas', 'Vargas', 'Castro', 'Ortiz', 'Jiménez', 'Ruiz',
  'Suárez', 'Cárdenas', 'Herrera', 'Medina', 'Aguilar', 'Castillo', 'Mejía', 'Restrepo', 'Ospina', 'Quintero',
];
const PROJECT_TOPICS = [
  'Detección temprana de', 'Modelo predictivo de', 'Plataforma para', 'Análisis de', 'Prototipo de', 'Estudio sobre',
  'Sistema de monitoreo de', 'Estrategia de', 'Evaluación de', 'Diseño de',
];
const PROJECT_SUBJECTS = [
  'la calidad del agua', 'enfermedades respiratorias', 'la deserción estudiantil', 'cultivos urbanos', 'microempresas locales',
  'la movilidad sostenible', 'residuos sólidos', 'la salud mental universitaria', 'paneles solares de bajo costo',
  'la inclusión digital', 'la biodiversidad regional', 'el consumo energético', 'la lectura crítica', 'la economía circular',
];
const BOARD_TITLES = [
  'Revisión de literatura', 'Marco teórico', 'Diseño metodológico', 'Recolección de datos', 'Análisis de resultados',
  'Prototipo inicial', 'Pruebas de campo', 'Informe parcial', 'Artículo para evento', 'Socialización', 'Informe final',
];
const ACTIVITY_TITLES = [
  'Buscar fuentes en bases de datos', 'Redactar resumen', 'Preparar encuesta', 'Aplicar entrevistas', 'Depurar datos',
  'Construir gráficas', 'Escribir sección de discusión', 'Revisar citas y referencias', 'Preparar presentación',
  'Documentar el prototipo', 'Ejecutar pruebas', 'Corregir observaciones del tutor', 'Subir evidencias', 'Elaborar póster',
];
const FORMATS: ReadonlyArray<[DocumentFormat, number, string, string]> = [
  ['PDF', 50, 'application/pdf', 'pdf'],
  ['WORD', 25, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['EXCEL', 15, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['IMAGE', 10, 'image/png', 'png'],
];
/** Peso relativo de cada día ISO (1 lunes … 7 domingo) para entregas y reuniones. */
const WEEKDAY_WEIGHTS = [0.9, 1.2, 1.3, 1.15, 1.0, 0.35, 0.2];

// ─── Filas ───

export interface BulkUser { id: string; email: string; fullName: string; status: UserStatus; createdAt: Date; roles: Role[] }
export interface BulkArea { id: string; name: string; description: string }
export interface BulkFaculty { id: string; name: string }
export interface BulkProject {
  id: string; title: string; description: string; areaId: string; status: ProjectStatus;
  startsOn: Date; endsOn: Date; createdById: string; createdAt: Date; facultyIds: string[];
}
export interface BulkMember { projectId: string; userId: string; projectRole: ProjectRole; isPrimary: boolean; joinedAt: Date }
export interface BulkBoard {
  id: string; projectId: string; title: string; dueDate: Date; progressStatus: ProgressStatus; result: WorkResult | null;
  responsibleTutorId: string; responsibleStudentId: string; createdAt: Date; completedAt: Date | null;
}
export interface BulkActivity {
  id: string; boardId: string; authorId: string; title: string; description: string | null;
  progressStatus: ProgressStatus; result: WorkResult | null; approvalStatus: ApprovalStatus;
  approvedById: string | null; approvedAt: Date | null; createdAt: Date; completedAt: Date | null;
}
export interface BulkAssignee { activityId: string; userId: string; assignedById: string; assignedAt: Date }
export interface BulkDocument {
  id: string; projectId: string; uploadedById: string; fileName: string; format: DocumentFormat;
  mimeType: string; sizeBytes: number; storageKey: string; createdAt: Date;
}
export interface BulkAttachment {
  id: string; activityId: string; kind: AttachmentKind; url: string | null; documentId: string | null; createdById: string; createdAt: Date;
}
export interface BulkMeeting {
  id: string; projectId: string | null; organizerId: string; reason: string; startsAt: Date; durationMinutes: number;
  joinUrl: string; recordingUrl: string | null; status: MeetingStatus; cancelledAt: Date | null; createdAt: Date; participantIds: string[];
}

export interface BulkData {
  users: BulkUser[];
  areas: BulkArea[];
  faculties: BulkFaculty[];
  areaManagers: Array<{ areaId: string; userId: string }>;
  deans: Array<{ facultyId: string; userId: string; startsAt: Date }>;
  projects: BulkProject[];
  members: BulkMember[];
  boards: BulkBoard[];
  activities: BulkActivity[];
  assignees: BulkAssignee[];
  documents: BulkDocument[];
  attachments: BulkAttachment[];
  meetings: BulkMeeting[];
}

export interface BulkOptions {
  /** Multiplicador del volumen (1 = ~1.000 usuarios y ~6.000 actividades). */
  scale: number;
  now: Date;
  seed?: number;
}

/** Valida SEED_BULK_SCALE: entero 1–10; vacío equivale a 1. Devuelve `null` si no es válido. */
export function parseBulkScale(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return 1;
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(value) && value >= 1 && value <= MAX_BULK_SCALE ? value : null;
}

// ─── Aleatoriedad determinista ───

class Random {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  /** mulberry32: uniforme en [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [item, w] of items) if ((r -= w) < 0) return item;
    return items[items.length - 1][0];
  }
  sample<T>(items: readonly T[], count: number): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.min(count, copy.length));
  }
  uuid(): string {
    const hex = Array.from({ length: 32 }, () => Math.floor(this.next() * 16).toString(16));
    hex[12] = '4';
    hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Lleva el instante a una hora laboral local (8–21 h) y, con más peso, a un día entre semana. */
function workTime(rng: Random, base: Date): Date {
  const day = dateOnly(base);
  // ISO: getUTCDay 0 = domingo.
  const iso = ((day.getUTCDay() + 6) % 7) + 1;
  let shifted = day.getTime();
  if (!rng.chance(WEEKDAY_WEIGHTS[iso - 1] / 1.3)) {
    // Mover al día laborable más "activo" cercano (martes a jueves pesan más).
    const target = rng.weighted<number>([[2, 1.2], [3, 1.3], [4, 1.15], [1, 0.9], [5, 1.0]]);
    shifted += (target - iso) * DAY;
  }
  const hour = rng.weighted<number>([[8, 1], [9, 2], [10, 3], [11, 3], [14, 3], [15, 3], [16, 2], [17, 2], [19, 1.5], [21, 1.5]]);
  return new Date(shifted + (hour + UTC_OFFSET_HOURS) * 3_600_000 + rng.int(0, 59) * 60_000);
}

// ─── Generación ───

export function generateBulkData(options: BulkOptions): BulkData {
  const scale = clamp(Math.round(options.scale), 1, MAX_BULK_SCALE);
  const now = options.now;
  const rng = new Random(options.seed ?? 20261108);
  const data: BulkData = {
    users: [], areas: [], faculties: [], areaManagers: [], deans: [], projects: [], members: [], boards: [],
    activities: [], assignees: [], documents: [], attachments: [], meetings: [],
  };

  // Usuarios
  const emails = new Set<string>();
  const person = (roles: Role[], createdAt: Date): BulkUser => {
    const first = rng.pick(FIRST_NAMES);
    const last = `${rng.pick(LAST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    const base = `${ascii(first)}.${ascii(last.split(' ')[0])}`;
    let email = `${base}@${BULK_EMAIL_DOMAIN}`;
    for (let n = 2; emails.has(email); n++) email = `${base}${n}@${BULK_EMAIL_DOMAIN}`;
    emails.add(email);
    const user: BulkUser = {
      id: rng.uuid(), email, fullName: `${first} ${last}`, roles,
      status: rng.chance(0.03) ? 'INACTIVE' : 'ACTIVE', createdAt,
    };
    data.users.push(user);
    return user;
  };
  const since = (days: number) => new Date(now.getTime() - days * DAY);

  for (const name of AREAS) data.areas.push({ id: rng.uuid(), name: `${name}${BULK_NAME_SUFFIX}`, description: 'Área de demostración masiva.' });
  const facultyDiscipline = new Map<string, number>();
  for (const [name, discipline] of FACULTIES) {
    const faculty = { id: rng.uuid(), name: `${name}${BULK_NAME_SUFFIX}` };
    data.faculties.push(faculty);
    facultyDiscipline.set(faculty.id, discipline);
  }
  for (const area of data.areas) {
    const manager = person(['AREA_MANAGER'], since(rng.int(600, 720)));
    manager.status = 'ACTIVE';
    data.areaManagers.push({ areaId: area.id, userId: manager.id });
  }
  const deanOf = new Map<string, string>();
  for (const faculty of data.faculties) {
    const dean = person(['DEAN'], since(rng.int(600, 720)));
    dean.status = 'ACTIVE';
    deanOf.set(faculty.id, dean.id);
    data.deans.push({ facultyId: faculty.id, userId: dean.id, startsAt: since(rng.int(560, 700)) });
  }
  const tutors = Array.from({ length: 80 * scale }, () => person(['TUTOR'], since(rng.int(560, 700))));
  /** "Diligencia" de cada tutor: multiplica la probabilidad de terminar y de hacerlo a tiempo. */
  const diligence = new Map(tutors.map((t) => [t.id, 0.75 + rng.next() * 0.5]));
  /** Frecuencia de reuniones de cada tutor. */
  const meetingRate = new Map(tutors.map((t) => [t.id, 0.4 + rng.next() * 1.4]));
  const students = Array.from({ length: 900 * scale }, () => person(['STUDENT'], since(rng.int(30, 560))));

  // Proyectos, con estudiantes sin repetir (un proyecto activo por estudiante, P-25)
  let cursor = 0;
  while (cursor + 4 <= students.length) {
    const size = Math.min(rng.int(4, 8), students.length - cursor);
    const team = students.slice(cursor, cursor + size);
    cursor += size;
    const start = dateOnly(since(rng.int(45, 540)));
    const end = new Date(start.getTime() + rng.int(150, 420) * DAY);
    const facultyIds = rng.sample(data.faculties, rng.chance(0.2) ? 2 : 1).map((f) => f.id);
    const primary = rng.pick(tutors);
    const coTutor = rng.chance(0.3) ? rng.pick(tutors.filter((t) => t.id !== primary.id)) : null;
    const status: ProjectStatus = rng.chance(0.03) ? 'CANCELLED' : end < now && rng.chance(0.85) ? 'FINISHED' : 'ACTIVE';
    const project: BulkProject = {
      id: rng.uuid(),
      title: `${rng.pick(PROJECT_TOPICS)} ${rng.pick(PROJECT_SUBJECTS)}`,
      description: 'Proyecto de demostración generado para pruebas de analítica.',
      areaId: rng.pick(data.areas).id,
      status,
      startsOn: start,
      endsOn: end,
      createdById: deanOf.get(facultyIds[0]) as string,
      createdAt: start,
      facultyIds,
    };
    data.projects.push(project);
    for (const s of team) if (s.createdAt > start) s.createdAt = new Date(start.getTime() - rng.int(1, 30) * DAY);
    data.members.push({ projectId: project.id, userId: primary.id, projectRole: 'TUTOR', isPrimary: true, joinedAt: start });
    if (coTutor) data.members.push({ projectId: project.id, userId: coTutor.id, projectRole: 'TUTOR', isPrimary: false, joinedAt: start });
    team.forEach((s, i) =>
      data.members.push({ projectId: project.id, userId: s.id, projectRole: i === 0 ? 'STUDENT_LEADER' : 'STUDENT', isPrimary: false, joinedAt: start }),
    );

    const discipline = Math.max(...facultyIds.map((id) => facultyDiscipline.get(id) as number));
    buildBoards(rng, data, project, [primary.id, ...(coTutor ? [coTutor.id] : [])], team.map((s) => s.id), discipline, diligence, now);
    buildMeetings(rng, data, project, primary.id, coTutor?.id ?? null, team.map((s) => s.id), deanOf, meetingRate, now);
  }

  // Reuniones institucionales sin proyecto (decanos y encargados de área con tutores).
  const organizers = [...data.deans.map((d) => d.userId), ...data.areaManagers.map((m) => m.userId)];
  for (let i = 0; i < 40 * scale; i++) {
    const startsAt = workTime(rng, since(rng.int(-20, 520)));
    data.meetings.push(meeting(rng, null, rng.pick(organizers), 'Comité de investigación', startsAt, rng.sample(tutors, rng.int(3, 8)).map((t) => t.id), now));
  }
  return data;
}

function buildBoards(
  rng: Random,
  data: BulkData,
  project: BulkProject,
  tutorIds: string[],
  studentIds: string[],
  discipline: number,
  diligence: Map<string, number>,
  now: Date,
): void {
  const boardCount = rng.int(3, 8);
  const span = project.endsOn.getTime() - project.startsOn.getTime();
  for (let b = 0; b < boardCount; b++) {
    const tutorId = rng.pick(tutorIds);
    const created = new Date(project.startsOn.getTime() + (span * b) / boardCount + rng.int(0, 5) * DAY + 15 * 3_600_000);
    if (created > now) break;
    const due = dateOnly(new Date(created.getTime() + rng.int(10, 60) * DAY));
    const board: BulkBoard = {
      id: rng.uuid(), projectId: project.id, title: BOARD_TITLES[b % BOARD_TITLES.length], dueDate: due,
      progressStatus: 'PENDING', result: null, responsibleTutorId: tutorId, responsibleStudentId: rng.pick(studentIds),
      createdAt: created, completedAt: null,
    };
    data.boards.push(board);

    const skill = discipline * (diligence.get(tutorId) ?? 1);
    const activityCount = rng.weighted<number>([[rng.int(2, 5), 5], [rng.int(6, 12), 4], [rng.int(13, 20), 1]]);
    const statuses: ProgressStatus[] = [];
    let lastCompletion: Date | null = null;
    for (let a = 0; a < activityCount; a++) {
      const activity = buildActivity(rng, data, project, board, tutorId, studentIds, skill, activityCount, now);
      if (!activity) continue;
      statuses.push(activity.progressStatus);
      if (activity.completedAt && (!lastCompletion || activity.completedAt > lastCompletion)) lastCompletion = activity.completedAt;
    }
    const open = statuses.filter((s) => s === 'PENDING' || s === 'IN_PROGRESS').length;
    if (statuses.length > 0 && open === 0 && lastCompletion) {
      board.progressStatus = 'DONE';
      board.completedAt = lastCompletion;
      board.result = rng.chance(0.85) ? 'SUCCESS' : 'FAILURE';
    } else if (statuses.some((s) => s !== 'PENDING')) {
      board.progressStatus = rng.chance(0.03) ? 'CANCELLED' : 'IN_PROGRESS';
    }
  }
}

function buildActivity(
  rng: Random,
  data: BulkData,
  project: BulkProject,
  board: BulkBoard,
  tutorId: string,
  studentIds: string[],
  skill: number,
  boardSize: number,
  now: Date,
): BulkActivity | null {
  // Algunas actividades se crean después del vencimiento (patrón LEAD_TIME = PAST).
  const window = board.dueDate.getTime() - board.createdAt.getTime();
  const offset = rng.chance(0.08) ? window + rng.int(1, 10) * DAY : rng.next() * window * 0.8;
  const createdAt = workTime(rng, new Date(board.createdAt.getTime() + offset));
  if (createdAt > now) return null;

  const assigneeCount = rng.weighted<number>([[0, 1.5], [1, 4], [2, 3], [3, 1.5], [4, 0.6]]);
  const hasDescription = rng.chance(0.6);
  const willAttach = rng.chance(0.55);
  const leadDays = (board.dueDate.getTime() - createdAt.getTime()) / DAY;

  // Probabilidad de terminar: disciplina × patrones (encargados, descripción, adjuntos, tamaño del tablero).
  let pDone = 0.7 * skill;
  pDone *= [0.55, 1, 1.12, 1.18, 1.1][assigneeCount];
  pDone *= hasDescription ? 1.08 : 0.92;
  pDone *= willAttach ? 1.1 : 0.9;
  pDone *= boardSize > 15 ? 0.85 : 1;
  pDone = clamp(pDone, 0.05, 0.97);
  // A tiempo: más probable con antelación suficiente y tutores diligentes.
  const pOnTime = clamp(0.62 * skill + (leadDays >= 7 ? 0.12 : -0.15) + (assigneeCount >= 2 ? 0.05 : 0), 0.1, 0.97);

  let progressStatus: ProgressStatus = 'PENDING';
  let completedAt: Date | null = null;
  if (rng.chance(0.03)) progressStatus = 'CANCELLED';
  else if (rng.chance(pDone)) {
    const dueEnd = board.dueDate.getTime() + 20 * 3_600_000;
    const target = rng.chance(pOnTime)
      ? createdAt.getTime() + rng.next() * Math.max(DAY, dueEnd - createdAt.getTime())
      : Math.max(createdAt.getTime(), dueEnd) + rng.int(1, 25) * DAY;
    completedAt = workTime(rng, new Date(target));
    if (completedAt < createdAt) completedAt = new Date(createdAt.getTime() + 3_600_000);
    if (completedAt > now) completedAt = null;
    progressStatus = completedAt ? 'DONE' : 'IN_PROGRESS';
  } else if (rng.chance(0.5)) progressStatus = 'IN_PROGRESS';

  let result: WorkResult | null = null;
  let approvalStatus: ApprovalStatus = 'PENDING';
  let approvedAt: Date | null = null;
  if (progressStatus === 'DONE' && completedAt) {
    if (rng.chance(0.85)) result = rng.chance(willAttach ? 0.9 : 0.72) ? 'SUCCESS' : 'FAILURE';
    const review = rng.next();
    approvalStatus = review < 0.7 ? 'APPROVED' : review < 0.78 ? 'REJECTED' : 'PENDING';
    if (approvalStatus !== 'PENDING') {
      approvedAt = new Date(Math.min(now.getTime(), completedAt.getTime() + rng.int(1, 120) * 3_600_000));
    }
  }

  const activity: BulkActivity = {
    id: rng.uuid(),
    boardId: board.id,
    authorId: rng.chance(0.6) ? studentIds[0] : tutorId,
    title: rng.pick(ACTIVITY_TITLES),
    description: hasDescription ? 'Descripción de demostración con los entregables esperados.' : null,
    progressStatus,
    result,
    approvalStatus,
    approvedById: approvalStatus === 'PENDING' ? null : tutorId,
    approvedAt,
    createdAt,
    completedAt,
  };
  data.activities.push(activity);

  const assignees = rng.sample(studentIds, assigneeCount);
  for (const userId of assignees) {
    data.assignees.push({ activityId: activity.id, userId, assignedById: activity.authorId, assignedAt: createdAt });
  }

  if (willAttach) {
    const until = completedAt ?? now;
    const count = rng.weighted<number>([[1, 5], [2, 3], [3, 1.5]]);
    for (let i = 0; i < count; i++) {
      const at = workTime(rng, new Date(createdAt.getTime() + rng.next() * Math.max(0, until.getTime() - createdAt.getTime())));
      const attachedAt = at > now ? now : at < createdAt ? createdAt : at;
      const owner = assignees.length > 0 ? rng.pick(assignees) : studentIds[0];
      if (rng.chance(0.4)) {
        data.attachments.push({
          id: rng.uuid(), activityId: activity.id, kind: 'LINK', url: `https://drive.example.test/${activity.id.slice(0, 8)}/${i + 1}`,
          documentId: null, createdById: owner, createdAt: attachedAt,
        });
      } else {
        const [format, , mimeType, ext] = rng.weighted(FORMATS.map((f) => [f, f[1]] as const));
        const documentId = rng.uuid();
        data.documents.push({
          id: documentId, projectId: project.id, uploadedById: owner, fileName: `evidencia-${i + 1}.${ext}`, format, mimeType,
          sizeBytes: rng.int(20_000, 20_000_000), storageKey: `seed-bulk/${project.id}/${documentId}`, createdAt: attachedAt,
        });
        data.attachments.push({ id: rng.uuid(), activityId: activity.id, kind: 'DOCUMENT', url: null, documentId, createdById: owner, createdAt: attachedAt });
      }
    }
  }
  return activity;
}

function buildMeetings(
  rng: Random,
  data: BulkData,
  project: BulkProject,
  primaryId: string,
  coTutorId: string | null,
  studentIds: string[],
  deanOf: Map<string, string>,
  meetingRate: Map<string, number>,
  now: Date,
): void {
  const end = Math.min(project.endsOn.getTime(), now.getTime() + 30 * DAY);
  const months = Math.max(1, (end - project.startsOn.getTime()) / (30 * DAY));
  const count = Math.round(months * 1.2 * (meetingRate.get(primaryId) ?? 1));
  const dean = deanOf.get(project.facultyIds[0]) as string;
  for (let i = 0; i < count; i++) {
    const startsAt = workTime(rng, new Date(project.startsOn.getTime() + rng.next() * (end - project.startsOn.getTime())));
    const organizer = rng.weighted<string>([[primaryId, 8], [coTutorId ?? primaryId, 1], [dean, 1]]);
    const participants = new Set(rng.sample(studentIds, rng.int(2, studentIds.length)));
    if (organizer !== primaryId) participants.add(primaryId);
    if (rng.chance(0.1)) participants.add(dean);
    participants.delete(organizer);
    data.meetings.push(meeting(rng, project.id, organizer, rng.pick(['Seguimiento semanal', 'Revisión de avances', 'Asesoría metodológica', 'Preparación de entrega']), startsAt, [...participants], now));
  }
}

function meeting(rng: Random, projectId: string | null, organizerId: string, reason: string, startsAt: Date, participantIds: string[], now: Date): BulkMeeting {
  const id = rng.uuid();
  const durationMinutes = rng.weighted<number>([[30, 3], [45, 2], [60, 4], [90, 1]]);
  const past = startsAt.getTime() + durationMinutes * 60_000 < now.getTime();
  const cancelled = rng.chance(0.07);
  const status: MeetingStatus = cancelled ? 'CANCELLED' : past ? 'FINISHED' : 'SCHEDULED';
  return {
    id,
    projectId,
    organizerId,
    reason,
    startsAt,
    durationMinutes,
    joinUrl: `https://teams.example.test/meet/${id}`,
    recordingUrl: status === 'FINISHED' && rng.chance(0.35) ? `https://grabaciones.example.test/${id}` : null,
    status,
    cancelledAt: cancelled ? new Date(Math.min(now.getTime(), startsAt.getTime() - DAY)) : null,
    createdAt: new Date(startsAt.getTime() - rng.int(2, 14) * DAY),
    participantIds: participantIds.filter((p) => p !== organizerId),
  };
}
