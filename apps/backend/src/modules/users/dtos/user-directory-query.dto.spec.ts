import { DEFAULT_DIRECTORY_LIMIT, MAX_DIRECTORY_LIMIT, parseUserDirectoryQuery } from './user-directory-query.dto';

function errorsOf(input: unknown): string[] {
  const result = parseUserDirectoryQuery(input);
  return result.ok ? [] : result.errors;
}

describe('parseUserDirectoryQuery', () => {
  it('usa valores por defecto cuando no hay parámetros', () => {
    expect(parseUserDirectoryQuery({})).toEqual({
      ok: true,
      value: { search: null, role: null, limit: DEFAULT_DIRECTORY_LIMIT },
    });
  });

  it('recorta la búsqueda y convierte el límite a número', () => {
    expect(parseUserDirectoryQuery({ search: '  Ana  ', role: 'TUTOR', limit: '5' })).toEqual({
      ok: true,
      value: { search: 'Ana', role: 'TUTOR', limit: 5 },
    });
  });

  it('acepta el límite máximo', () => {
    expect(parseUserDirectoryQuery({ limit: String(MAX_DIRECTORY_LIMIT) })).toMatchObject({
      ok: true,
      value: { limit: MAX_DIRECTORY_LIMIT },
    });
  });

  it('rechaza cuerpos que no son objetos', () => {
    expect(errorsOf(undefined)).toHaveLength(1);
    expect(errorsOf(['search'])).toHaveLength(1);
  });

  it('informa todos los errores a la vez', () => {
    expect(errorsOf({ foo: '1', role: 'SUPERUSER', limit: '0' })).toEqual([
      'Campos no permitidos: foo.',
      'role debe ser uno de: ADMIN, AREA_MANAGER, DEAN, TUTOR, STUDENT.',
      'limit debe ser un entero entre 1 y 50.',
    ]);
  });

  it.each([
    ['búsqueda de un carácter', { search: 'a' }, /search/],
    ['búsqueda solo con espacios', { search: '   ' }, /search/],
    ['búsqueda demasiado larga', { search: 'a'.repeat(101) }, /search/],
    ['búsqueda repetida (lista)', { search: ['ana', 'luis'] }, /search/],
    ['rol desconocido', { role: 'tutor' }, /role/],
    ['límite no numérico', { limit: 'diez' }, /limit/],
    ['límite decimal', { limit: '1.5' }, /limit/],
    ['límite negativo', { limit: '-1' }, /limit/],
    ['límite cero', { limit: '0' }, /limit/],
    ['límite por encima del máximo', { limit: '51' }, /limit/],
    ['límite repetido (lista)', { limit: ['1', '2'] }, /limit/],
    ['parámetro desconocido', { orderBy: 'id' }, /orderBy/],
  ])('rechaza: %s', (_caso, input, pattern) => {
    expect(errorsOf(input).join(' ')).toMatch(pattern);
  });
});
