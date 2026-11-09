import { parseDocumentListQuery } from './document-list-query.dto';

describe('parseDocumentListQuery', () => {
  it('usa la página 1 y 20 elementos por defecto', () => {
    expect(parseDocumentListQuery({})).toEqual({ ok: true, value: { page: 1, pageSize: 20 } });
  });

  it('lee page y pageSize', () => {
    expect(parseDocumentListQuery({ page: '2', pageSize: '100' })).toEqual({ ok: true, value: { page: 2, pageSize: 100 } });
  });

  it('rechaza valores fuera de rango y campos desconocidos', () => {
    expect(parseDocumentListQuery({ page: '0' })).toEqual({ ok: false, errors: ['page debe ser un entero mayor o igual que 1.'] });
    expect(parseDocumentListQuery({ pageSize: '101' })).toEqual({
      ok: false,
      errors: ['pageSize debe ser un entero entre 1 y 100.'],
    });
    expect(parseDocumentListQuery({ search: 'x' })).toEqual({ ok: false, errors: ['Campos no permitidos: search.'] });
  });

  it('rechaza una query que no es un objeto', () => {
    expect(parseDocumentListQuery('page=1')).toEqual({ ok: false, errors: ['Los parámetros de consulta no son válidos.'] });
  });
});
