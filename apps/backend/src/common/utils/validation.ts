/** Utilidades de validación de entrada (límites del sistema), sin dependencias externas. */
import { BadRequestException } from '@nestjs/common';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const ok = <T>(value: T): ValidationResult<T> => ({ ok: true, value });
export const fail = <T = never>(errors: string[]): ValidationResult<T> => ({ ok: false, errors });

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Devuelve el cuerpo como objeto plano o `null` si no lo es (null, arreglo, primitivo). */
export function asObject(input: unknown): Record<string, unknown> | null {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

/** Mensaje de error si el cuerpo contiene campos fuera de `allowed`, o `null`. */
export function unknownFieldsError(body: Record<string, unknown>, allowed: readonly string[]): string | null {
  const extra = Object.keys(body).filter((key) => !allowed.includes(key));
  return extra.length > 0 ? `Campos no permitidos: ${extra.join(', ')}.` : null;
}

/** Convierte 'YYYY-MM-DD' en una fecha UTC válida, o `null` si el formato o la fecha no son válidos. */
export function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? date : null;
}

/** Texto obligatorio: recorta espacios y exige entre 1 y `max` caracteres. */
export function parseRequiredText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
}

/** Valor de un enumerado (objeto `as const` generado por Prisma), o `null`. */
export function parseEnum<T extends string>(value: unknown, values: Record<string, T>): T | null {
  return typeof value === 'string' && (Object.values(values) as string[]).includes(value) ? (value as T) : null;
}

/** Devuelve el valor validado o responde 400 { message: 'Datos inválidos.', errors }. */
export function validated<T>(result: ValidationResult<T>): T {
  if (!result.ok) throw new BadRequestException({ message: 'Datos inválidos.', errors: result.errors });
  return result.value;
}
