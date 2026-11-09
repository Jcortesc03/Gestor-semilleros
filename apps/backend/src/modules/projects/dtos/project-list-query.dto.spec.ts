import { parseProjectListQuery } from './project-list-query.dto';

describe('parseProjectListQuery', () => {
  it('usa la página 1 y 20 elementos por defecto, sin búsqueda', () => {
    expect(parseProjectListQuery({})).toEqual({ ok: true, value: { search: null, page: 1, pageSize: 20 } });
  });

  it('lee page, pageSize y search recortado', () => {
    expect(parseProjectListQuery({ page: '3', pageSize: '50', search: '  robótica ' })).toEqual({
      ok: true,
      value: { search: 'robótica', page: 3, pageSize: 50 },
    });
  });

  it('exige una búsqueda de 1 a 100 caracteres', () => {
    for (const search of ['', '   ', 'x'.repeat(101)]) {
      const result = parseProjectListQuery({ search });
      expect(result).toEqual({ ok: false, errors: ['search debe tener entre 1 y 100 caracteres.'] });
    }
    expect(parseProjectListQuery({ search: 'x'.repeat(100) }).ok).toBe(true);
  });

  it('rechaza page y pageSize fuera de rango', () => {
    expect(parseProjectListQuery({ page: '0' })).toEqual({ ok: false, errors: ['page debe ser un entero mayor o igual que 1.'] });
    expect(parseProjectListQuery({ page: '1.5' }).ok).toBe(false);
    expect(parseProjectListQuery({ pageSize: '0' })).toEqual({
      ok: false,
      errors: ['pageSize debe ser un entero entre 1 y 100.'],
    });
    expect(parseProjectListQuery({ pageSize: '101' }).ok).toBe(false);
  });

  it('rechaza campos desconocidos y devuelve todos los errores juntos', () => {
    expect(parseProjectListQuery({ page: '0', areaId: 'x' })).toEqual({
      ok: false,
      errors: ['Campos no permitidos: areaId.', 'page debe ser un entero mayor o igual que 1.'],
    });
  });

  it('rechaza una query que no es un objeto', () => {
    expect(parseProjectListQuery(null)).toEqual({ ok: false, errors: ['Los parámetros de consulta no son válidos.'] });
    expect(parseProjectListQuery([])).toEqual({ ok: false, errors: ['Los parámetros de consulta no son válidos.'] });
  });
});
