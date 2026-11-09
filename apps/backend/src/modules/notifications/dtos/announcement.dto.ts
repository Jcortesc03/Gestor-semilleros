import { AnnouncementKind, AudienceType, Role } from '../../../generated/prisma/enums';
import {
  asObject,
  fail,
  isUuid,
  ok,
  parseEnum,
  parseRequiredText,
  unknownFieldsError,
  type ValidationResult,
} from '../../../common/utils/validation';
import { PAGE_FIELDS, parsePageQuery, type PageQuery } from '../../../common/utils/pagination';

/** Audiencia validada de una novedad: el tipo determina el destino. */
export type AudienceDto =
  | { type: 'ALL' }
  | { type: 'ROLE'; role: Role }
  | { type: 'FACULTY'; facultyId: string }
  | { type: 'AREA'; areaId: string }
  | { type: 'PROJECT'; projectId: string };

/** Cuerpo validado de creación de una novedad. */
export interface CreateAnnouncementDto {
  kind: AnnouncementKind;
  title: string;
  content: string;
  audiences: AudienceDto[];
}

/** Parámetros validados del listado de novedades (paginado según ADR 0017). */
export interface ListAnnouncementsQuery extends PageQuery {
  kind?: AnnouncementKind;
  before?: Date;
}

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 5000;
const MIN_AUDIENCES = 1;
const MAX_AUDIENCES = 20;
export const DEFAULT_ANNOUNCEMENTS_PAGE_SIZE = 50;
const CREATE_FIELDS = ['kind', 'title', 'content', 'audiences'] as const;
const LIST_FIELDS = ['kind', 'before', ...PAGE_FIELDS] as const;

const TITLE_ERROR = `title es obligatorio (máximo ${MAX_TITLE_LENGTH} caracteres).`;
const CONTENT_ERROR = `content es obligatorio (máximo ${MAX_CONTENT_LENGTH} caracteres).`;
const AUDIENCES_ERROR = `audiences debe ser una lista de ${MIN_AUDIENCES} a ${MAX_AUDIENCES} audiencias.`;
const BEFORE_ERROR = 'before debe ser una fecha ISO 8601.';

/** Campos permitidos en cada elemento de `audiences` según su tipo. */
const AUDIENCE_FIELDS: Record<AudienceType, readonly string[]> = {
  ALL: ['type'],
  ROLE: ['type', 'role'],
  FACULTY: ['type', 'facultyId'],
  AREA: ['type', 'areaId'],
  PROJECT: ['type', 'projectId'],
};

function kindError(): string {
  return `kind no es válido. Valores permitidos: ${Object.values(AnnouncementKind).join(', ')}.`;
}

function audienceTypeError(index: number): string {
  return `audiences[${index}].type no es válido. Valores permitidos: ${Object.values(AudienceType).join(', ')}.`;
}

function unknownAudienceFields(index: number, body: Record<string, unknown>, type: AudienceType | null): string | null {
  const allowed = type === null ? ['type'] : AUDIENCE_FIELDS[type];
  const extra = Object.keys(body).filter((key) => !allowed.includes(key));
  return extra.length > 0 ? `audiences[${index}]: campos no permitidos: ${extra.join(', ')}.` : null;
}

/** Valida un elemento de `audiences`, acumulando sus errores. */
function parseAudience(item: unknown, index: number, errors: string[]): AudienceDto | null {
  const prefix = `audiences[${index}]`;
  const body = asObject(item);
  if (body === null) {
    errors.push(`${prefix} debe ser un objeto.`);
    return null;
  }

  const type = parseEnum(body.type, AudienceType);
  if (type === null) errors.push(audienceTypeError(index));

  const unknown = unknownAudienceFields(index, body, type);
  if (unknown !== null) errors.push(unknown);

  if (type === null) return null;
  if (type === 'ALL') return { type: 'ALL' };

  if (type === 'ROLE') {
    if (body.role === undefined) {
      errors.push(`${prefix}.role es obligatorio.`);
      return null;
    }
    const role = parseEnum(body.role, Role);
    if (role === null) {
      errors.push(`${prefix}.role no es válido.`);
      return null;
    }
    return { type: 'ROLE', role };
  }

  const field = type === 'FACULTY' ? 'facultyId' : type === 'AREA' ? 'areaId' : 'projectId';
  const value = body[field];
  if (value === undefined) {
    errors.push(`${prefix}.${field} es obligatorio.`);
    return null;
  }
  if (!isUuid(value)) {
    errors.push(`${prefix}.${field} debe ser un UUID.`);
    return null;
  }

  if (type === 'FACULTY') return { type: 'FACULTY', facultyId: value };
  if (type === 'AREA') return { type: 'AREA', areaId: value };
  return { type: 'PROJECT', projectId: value };
}

/** Clave de deduplicación de una audiencia: mismo tipo y mismo destino. */
function audienceKey(audience: AudienceDto): string {
  switch (audience.type) {
    case 'ALL':
      return 'ALL';
    case 'ROLE':
      return `ROLE:${audience.role}`;
    case 'FACULTY':
      return `FACULTY:${audience.facultyId}`;
    case 'AREA':
      return `AREA:${audience.areaId}`;
    case 'PROJECT':
      return `PROJECT:${audience.projectId}`;
  }
}

/** Elimina duplicados conservando el orden; `ALL` cubre a cualquier otra audiencia. */
function normalizeAudiences(audiences: AudienceDto[]): AudienceDto[] {
  if (audiences.some((audience) => audience.type === 'ALL')) return [{ type: 'ALL' }];

  const unique: AudienceDto[] = [];
  const seen = new Set<string>();
  for (const audience of audiences) {
    const key = audienceKey(audience);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(audience);
    }
  }
  return unique;
}

/** Valida y normaliza la entrada de creación de novedades. */
export function parseCreateAnnouncement(input: unknown): ValidationResult<CreateAnnouncementDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(body, CREATE_FIELDS);
  if (unknown !== null) errors.push(unknown);

  let kind: AnnouncementKind = 'NEWS';
  if (body.kind !== undefined) {
    const parsed = parseEnum(body.kind, AnnouncementKind);
    if (parsed === null) errors.push(kindError());
    else kind = parsed;
  }

  let title = '';
  const parsedTitle = parseRequiredText(body.title, MAX_TITLE_LENGTH);
  if (parsedTitle === null) errors.push(TITLE_ERROR);
  else title = parsedTitle;

  let content = '';
  const parsedContent = parseRequiredText(body.content, MAX_CONTENT_LENGTH);
  if (parsedContent === null) errors.push(CONTENT_ERROR);
  else content = parsedContent;

  const audiences: AudienceDto[] = [];
  if (!Array.isArray(body.audiences) || body.audiences.length < MIN_AUDIENCES || body.audiences.length > MAX_AUDIENCES) {
    errors.push(AUDIENCES_ERROR);
  } else {
    body.audiences.forEach((item, index) => {
      const audience = parseAudience(item, index, errors);
      if (audience !== null) audiences.push(audience);
    });
  }

  if (errors.length > 0) return fail(errors);
  return ok({ kind, title, content, audiences: normalizeAudiences(audiences) });
}

/** Valida y normaliza los parámetros de listado (`req.query`, valores string). */
export function parseListAnnouncements(query: unknown): ValidationResult<ListAnnouncementsQuery> {
  const raw = query === undefined || query === null ? {} : query;
  const body = asObject(raw);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(body, LIST_FIELDS);
  if (unknown !== null) errors.push(unknown);

  let kind: AnnouncementKind | undefined;
  if (body.kind !== undefined) {
    const parsed = parseEnum(body.kind, AnnouncementKind);
    if (parsed === null) errors.push(kindError());
    else kind = parsed;
  }

  const page = parsePageQuery(body, errors, DEFAULT_ANNOUNCEMENTS_PAGE_SIZE);

  let before: Date | undefined;
  if (body.before !== undefined) {
    const parsed = typeof body.before === 'string' ? Date.parse(body.before) : Number.NaN;
    if (Number.isNaN(parsed)) errors.push(BEFORE_ERROR);
    else before = new Date(parsed);
  }

  if (errors.length > 0) return fail(errors);

  const result: ListAnnouncementsQuery = { ...page };
  if (kind !== undefined) result.kind = kind;
  if (before !== undefined) result.before = before;
  return ok(result);
}
