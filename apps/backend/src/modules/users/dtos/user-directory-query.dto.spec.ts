import { DEFAULT_DIRECTORY_PAGE_SIZE, parseUserDirectoryQuery } from './user-directory-query.dto';

function errorsOf(input: unknown): string[] {
  const result = parseUserDirectoryQuery(input);
  return result.ok ? [] : result.errors;
}

describe('parseUserDirectoryQuery', () => {
  it.each(['ACTIVE', 'INACTIVE', 'ALL'])('acepta status=%s', (status) => {
    expect(parseUserDirectoryQuery({ status })).toMatchObject({ ok: true, value: { status } });
  });

  it.each(['active', 'TODOS', '', 5])('rechaza status inválido (%p)', (status) => {
    expect(errorsOf({ status }).join(' ')).toMatch(/status debe ser uno de/);
  });

  it('usa valores por defecto cuando no hay parámetros', () => {
    expect(parseUserDirectoryQuery({})).toEqual({
      ok: true,
      value: { search: null, role: null, status: null, page: 1, pageSize: DEFAULT_DIRECTORY_PAGE_SIZE },
    });
  });

  it('recorta la búsqueda y convierte la página a número', () => {
    expect(parseUserDirectoryQuery({ search: '  Ana  ', role: 'TUTOR', page: '2', pageSize: '5' })).toEqual({
      ok: true,
      value: { search: 'Ana', role: 'TUTOR', status: null, page: 2, pageSize: 5 },
    });
  });

  it('acepta el tamaño de página máximo (100)', () => {
    expect(parseUserDirectoryQuery({ pageSize: '100' })).toMatchObject({ ok: true, value: { pageSize: 100 } });
  });

  it('rechaza cuerpos que no son objetos', () => {
    expect(errorsOf(undefined)).toHaveLength(1);
    expect(errorsOf(['search'])).toHaveLength(1);
  });

  it('informa todos los errores a la vez', () => {
    expect(errorsOf({ foo: '1', role: 'SUPERUSER', pageSize: '0' })).toEqual([
      'Campos no permitidos: foo.',
      'role debe ser uno de: ADMIN, AREA_MANAGER, DEAN, TUTOR, STUDENT.',
      'pageSize debe ser un entero entre 1 y 100.',
    ]);
  });

  it.each([
    ['búsqueda de un carácter', { search: 'a' }, /search/],
    ['búsqueda solo con espacios', { search: '   ' }, /search/],
    ['búsqueda demasiado larga', { search: 'a'.repeat(101) }, /search/],
    ['búsqueda repetida (lista)', { search: ['ana', 'luis'] }, /search/],
    ['rol desconocido', { role: 'tutor' }, /role/],
    ['tamaño no numérico', { pageSize: 'diez' }, /pageSize/],
    ['tamaño decimal', { pageSize: '1.5' }, /pageSize/],
    ['tamaño cero', { pageSize: '0' }, /pageSize/],
    ['tamaño por encima del máximo', { pageSize: '101' }, /pageSize/],
    ['página cero', { page: '0' }, /page debe/],
    ['página negativa', { page: '-1' }, /page debe/],
    ['página repetida (lista)', { page: ['1', '2'] }, /page debe/],
    ['limit ya no se admite', { limit: '5' }, /Campos no permitidos: limit/],
    ['parámetro desconocido', { orderBy: 'id' }, /orderBy/],
  ])('rechaza: %s', (_caso, input, pattern) => {
    expect(errorsOf(input).join(' ')).toMatch(pattern);
  });
});
