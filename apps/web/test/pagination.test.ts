import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '../src/lib/api.ts';
import { pageCount, parsePage, slicePage, withPage } from '../src/lib/pagination.ts';

describe('paginación (ADR 0017)', () => {
  it('valida el envoltorio y sus elementos', () => {
    const page = parsePage({ items: [1, 2], total: 12, page: 2, pageSize: 2 }, (v) => {
      if (typeof v !== 'number') throw new ApiError(0);
      return v;
    });
    assert.deepEqual(page, { items: [1, 2], total: 12, page: 2, pageSize: 2 });
  });

  it('rechaza formas inválidas', () => {
    for (const value of [null, [], { items: [], total: -1, page: 1, pageSize: 1 }, { items: [], total: 0, page: 0, pageSize: 1 }, { total: 0, page: 1, pageSize: 1 }]) {
      assert.throws(() => parsePage(value, (v) => v), ApiError);
    }
  });

  it('arma los parámetros y calcula páginas', () => {
    assert.equal(withPage(new URLSearchParams({ search: 'x' }), { page: 2, pageSize: 50 }).toString(), 'search=x&page=2&pageSize=50');
    assert.equal(withPage(new URLSearchParams()).toString(), '');
    assert.equal(pageCount(0, 20), 1);
    assert.equal(pageCount(41, 20), 3);
  });

  it('pagina en el cliente y ajusta la página fuera de rango', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    assert.deepEqual(slicePage(items, 2, 10).items, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    assert.deepEqual(slicePage(items, 9, 10), { items: [20, 21, 22, 23, 24], total: 25, page: 3, pageSize: 10 });
    assert.equal(slicePage([], 1, 10).page, 1);
  });
});
