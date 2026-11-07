import { asObject, fail, isUuid, ok, unknownFieldsError, type ValidationResult } from '../../../common/utils/validation';

export const MAX_CATALOG_NAME_LENGTH = 150;
export const MAX_AREA_DESCRIPTION_LENGTH = 2000;

export interface CreateAreaDto {
  name: string;
  description: string | null;
}

export interface UpdateAreaDto {
  name?: string;
  description?: string | null;
}

export interface FacultyNameDto {
  name: string;
}

export interface AssignDeanDto {
  userId: string;
}

/** Recorta y colapsa espacios internos; devuelve null si queda vacío o supera el máximo. */
function parseName(value: unknown, errors: string[]): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push('name es obligatorio.');
    return null;
  }
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length > MAX_CATALOG_NAME_LENGTH) {
    errors.push(`name admite como máximo ${MAX_CATALOG_NAME_LENGTH} caracteres.`);
    return null;
  }
  return name;
}

/** Vacío o null significan sin descripción. `undefined` significa que no viene. */
function parseDescription(value: unknown, errors: string[]): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    errors.push('description debe ser texto o null.');
    return null;
  }
  const text = value.trim();
  if (text.length > MAX_AREA_DESCRIPTION_LENGTH) {
    errors.push(`description admite como máximo ${MAX_AREA_DESCRIPTION_LENGTH} caracteres.`);
    return null;
  }
  return text.length === 0 ? null : text;
}

function objectOrError(input: unknown, allowed: readonly string[]): { body: Record<string, unknown>; errors: string[] } | string[] {
  const body = asObject(input);
  if (!body) return ['El cuerpo debe ser un objeto JSON.'];
  const extra = unknownFieldsError(body, allowed);
  return { body, errors: extra ? [extra] : [] };
}

export function parseCreateArea(input: unknown): ValidationResult<CreateAreaDto> {
  const parsed = objectOrError(input, ['name', 'description']);
  if (Array.isArray(parsed)) return fail(parsed);
  const { body, errors } = parsed;
  const name = parseName(body.name, errors);
  const description = body.description === undefined ? null : parseDescription(body.description, errors);
  return errors.length > 0 || name === null ? fail(errors) : ok({ name, description });
}

export function parseUpdateArea(input: unknown): ValidationResult<UpdateAreaDto> {
  const parsed = objectOrError(input, ['name', 'description']);
  if (Array.isArray(parsed)) return fail(parsed);
  const { body, errors } = parsed;
  const value: UpdateAreaDto = {};
  if (body.name !== undefined) {
    const name = parseName(body.name, errors);
    if (name !== null) value.name = name;
  }
  if (body.description !== undefined) value.description = parseDescription(body.description, errors);
  if (errors.length === 0 && body.name === undefined && body.description === undefined) {
    errors.push('Indica al menos un campo a modificar: name o description.');
  }
  return errors.length > 0 ? fail(errors) : ok(value);
}

/** Cuerpo de POST y PATCH de facultades. */
export function parseFacultyName(input: unknown): ValidationResult<FacultyNameDto> {
  const parsed = objectOrError(input, ['name']);
  if (Array.isArray(parsed)) return fail(parsed);
  const { body, errors } = parsed;
  const name = parseName(body.name, errors);
  return errors.length > 0 || name === null ? fail(errors) : ok({ name });
}

export function parseAssignDean(input: unknown): ValidationResult<AssignDeanDto> {
  const parsed = objectOrError(input, ['userId']);
  if (Array.isArray(parsed)) return fail(parsed);
  const { body, errors } = parsed;
  if (!isUuid(body.userId)) errors.push('userId es obligatorio y debe ser un UUID.');
  return errors.length > 0 ? fail(errors) : ok({ userId: body.userId as string });
}
