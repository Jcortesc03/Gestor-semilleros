import { parseCatalogScope } from './catalog-scope.dto';

describe('parseCatalogScope', () => {
  it('sin scope devuelve null', () => {
    expect(parseCatalogScope({}, ['managed'] as const)).toEqual({ ok: true, value: null });
  });

  it('acepta el valor permitido', () => {
    expect(parseCatalogScope({ scope: 'managed' }, ['managed'] as const)).toEqual({ ok: true, value: 'managed' });
  });

  it('rechaza un scope no permitido, vacío o repetido', () => {
    for (const query of [{ scope: 'dean' }, { scope: '' }, { scope: ['managed', 'dean'] }]) {
      const result = parseCatalogScope(query, ['managed'] as const);
      expect(result.ok).toBe(false);
      expect(result.ok ? [] : result.errors).toEqual(['scope debe ser uno de: managed.']);
    }
  });

  it('rechaza parámetros desconocidos', () => {
    const result = parseCatalogScope({ scope: 'dean', foo: '1' }, ['dean'] as const);
    expect(result).toEqual({ ok: false, errors: ['Campos no permitidos: foo.'] });
  });
});
