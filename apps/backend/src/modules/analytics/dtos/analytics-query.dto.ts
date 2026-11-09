import { ProjectStatus } from '../../../generated/prisma/enums';
import {
  asObject,
  fail,
  isUuid,
  ok,
  parseDateOnly,
  parseEnum,
  unknownFieldsError,
  type ValidationResult,
} from '../../../common/utils/validation';

/** Filtros validados de GET /api/analytics. Las fechas son claves locales `YYYY-MM-DD`. */
export interface AnalyticsQuery {
  from: string | null;
  to: string | null;
  areaId: string | null;
  facultyId: string | null;
  projectId: string | null;
  tutorId: string | null;
  projectStatus: ProjectStatus | null;
}

export const MAX_PERIOD_DAYS = 366;
const ALLOWED_FIELDS = ['from', 'to', 'areaId', 'facultyId', 'projectId', 'tutorId', 'projectStatus'] as const;
const UUID_FIELDS = ['areaId', 'facultyId', 'projectId', 'tutorId'] as const;

export function parseAnalyticsQuery(input: unknown): ValidationResult<AnalyticsQuery> {
  const query = asObject(input);
  if (query === null) return fail(['Los parámetros de consulta no son válidos.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(query, ALLOWED_FIELDS);
  if (unknown !== null) errors.push(unknown);

  const dates: Record<'from' | 'to', string | null> = { from: null, to: null };
  for (const field of ['from', 'to'] as const) {
    if (query[field] === undefined) continue;
    const date = parseDateOnly(query[field]);
    if (date === null) errors.push(`${field} debe ser una fecha válida con formato YYYY-MM-DD.`);
    else dates[field] = date.toISOString().slice(0, 10);
  }
  if (dates.from !== null && dates.to !== null) {
    const days = (Date.parse(dates.to) - Date.parse(dates.from)) / 86_400_000 + 1;
    if (days < 1) errors.push('from no puede ser posterior a to.');
    else if (days > MAX_PERIOD_DAYS) errors.push(`El periodo no puede superar ${MAX_PERIOD_DAYS} días.`);
  }

  const ids: Record<(typeof UUID_FIELDS)[number], string | null> = { areaId: null, facultyId: null, projectId: null, tutorId: null };
  for (const field of UUID_FIELDS) {
    if (query[field] === undefined) continue;
    if (!isUuid(query[field])) errors.push(`${field} debe ser un UUID válido.`);
    else ids[field] = (query[field] as string).toLowerCase();
  }

  let projectStatus: ProjectStatus | null = null;
  if (query.projectStatus !== undefined) {
    projectStatus = parseEnum(query.projectStatus, ProjectStatus);
    if (projectStatus === null) errors.push(`projectStatus debe ser uno de: ${Object.values(ProjectStatus).join(', ')}.`);
  }

  if (errors.length > 0) return fail(errors);
  return ok({ ...dates, ...ids, projectStatus });
}

/** `true` si hay algún filtro estructural (todo menos el periodo). */
export function hasStructuralFilter(q: AnalyticsQuery): boolean {
  return q.areaId !== null || q.facultyId !== null || q.projectId !== null || q.tutorId !== null || q.projectStatus !== null;
}
