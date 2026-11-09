import {
  MAX_AREA_DESCRIPTION_LENGTH,
  MAX_CATALOG_NAME_LENGTH,
  parseAssignDean,
  parseCreateArea,
  parseFacultyName,
  parseUpdateArea,
} from './catalog-admin.dto';

function errorsOf(result: { ok: boolean; errors?: string[] }): string[] {
  return result.ok ? [] : (result.errors ?? []);
}

describe('parseCreateArea', () => {
  it('normaliza el nombre y trata la descripción vacía como null', () => {
    expect(parseCreateArea({ name: '  Área   de  Datos ', description: '  ' })).toEqual({
      ok: true,
      value: { name: 'Área de Datos', description: null },
    });
  });

  it('acepta descripción y la omite como null', () => {
    expect(parseCreateArea({ name: 'A', description: ' Texto ' })).toEqual({ ok: true, value: { name: 'A', description: 'Texto' } });
    expect(parseCreateArea({ name: 'A' })).toEqual({ ok: true, value: { name: 'A', description: null } });
  });

  it('informa todos los errores', () => {
    const errors = errorsOf(parseCreateArea({ description: 5, extra: 1 }));
    expect(errors).toEqual(['Campos no permitidos: extra.', 'name es obligatorio.', 'description debe ser texto o null.']);
  });

  it('rechaza límites de longitud y cuerpos no objeto', () => {
    expect(errorsOf(parseCreateArea({ name: 'x'.repeat(MAX_CATALOG_NAME_LENGTH + 1) }))).toHaveLength(1);
    expect(errorsOf(parseCreateArea({ name: 'a', description: 'x'.repeat(MAX_AREA_DESCRIPTION_LENGTH + 1) }))).toHaveLength(1);
    expect(errorsOf(parseCreateArea(null))).toEqual(['El cuerpo debe ser un objeto JSON.']);
    expect(errorsOf(parseCreateArea([]))).toHaveLength(1);
  });
});

describe('parseUpdateArea', () => {
  it('acepta cambios parciales y permite borrar la descripción', () => {
    expect(parseUpdateArea({ name: ' Nuevo ' })).toEqual({ ok: true, value: { name: 'Nuevo' } });
    expect(parseUpdateArea({ description: null })).toEqual({ ok: true, value: { description: null } });
  });

  it('exige al menos un campo y rechaza nombre vacío', () => {
    expect(errorsOf(parseUpdateArea({}))).toEqual(['Indica al menos un campo a modificar: name o description.']);
    expect(errorsOf(parseUpdateArea({ name: '  ' }))).toEqual(['name es obligatorio.']);
  });
});

describe('parseFacultyName', () => {
  it('valida el nombre', () => {
    expect(parseFacultyName({ name: ' Ingeniería ' })).toEqual({ ok: true, value: { name: 'Ingeniería' } });
    expect(errorsOf(parseFacultyName({}))).toEqual(['name es obligatorio.']);
    expect(errorsOf(parseFacultyName({ name: 'a', description: 'x' }))).toEqual(['Campos no permitidos: description.']);
  });
});

describe('parseAssignDean', () => {
  it('exige un UUID', () => {
    const id = '5f0f3f3e-1b2c-4d5e-8f90-123456789abc';
    expect(parseAssignDean({ userId: id })).toEqual({ ok: true, value: { userId: id } });
    expect(errorsOf(parseAssignDean({ userId: 'x' }))).toHaveLength(1);
    expect(errorsOf(parseAssignDean({}))).toHaveLength(1);
  });
});
