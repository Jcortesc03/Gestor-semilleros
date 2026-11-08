import { asObject, fail, ok, unknownFieldsError, type ValidationResult } from '../../../common/utils/validation';

/**
 * Valida la query de GET /api/areas y GET /api/faculties. Solo admite `scope`, opcional,
 * con uno de los valores `allowed`. Sin `scope` devuelve `null` (comportamiento sin filtro).
 */
export function parseCatalogScope<T extends string>(input: unknown, allowed: readonly T[]): ValidationResult<T | null> {
  const query = asObject(input);
  if (query === null) return fail(['Los parámetros de consulta no son válidos.']);

  const errors: string[] = [];
  const extra = unknownFieldsError(query, ['scope']);
  if (extra) errors.push(extra);

  const scope = query.scope;
  if (scope === undefined) return errors.length > 0 ? fail(errors) : ok(null);
  if (typeof scope !== 'string' || !(allowed as readonly string[]).includes(scope)) {
    errors.push(`scope debe ser uno de: ${allowed.join(', ')}.`);
  }
  return errors.length > 0 ? fail(errors) : ok(scope as T);
}
