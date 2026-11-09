import { MAX_PAGE_SIZE, pageArgs, parsePageQuery, toPage } from './pagination';

describe('paginación', () => {
  it('usa los valores por defecto', () => {
    const errors: string[] = [];
    expect(parsePageQuery({}, errors)).toEqual({ page: 1, pageSize: 20 });
    expect(parsePageQuery({}, errors, 50)).toEqual({ page: 1, pageSize: 50 });
    expect(errors).toEqual([]);
  });

  it('acepta valores válidos y calcula skip/take', () => {
    const q = parsePageQuery({ page: '3', pageSize: '25' }, []);
    expect(q).toEqual({ page: 3, pageSize: 25 });
    expect(pageArgs(q)).toEqual({ skip: 50, take: 25 });
    expect(toPage(['a'], 51, q)).toEqual({ items: ['a'], total: 51, page: 3, pageSize: 25 });
  });

  it.each([
    [{ page: '0' }, 'page debe ser'],
    [{ page: '-1' }, 'page debe ser'],
    [{ page: '1.5' }, 'page debe ser'],
    [{ pageSize: '0' }, 'pageSize debe ser'],
    [{ pageSize: String(MAX_PAGE_SIZE + 1) }, 'pageSize debe ser'],
    [{ pageSize: ['10'] }, 'pageSize debe ser'],
  ])('rechaza %j', (query, message) => {
    const errors: string[] = [];
    parsePageQuery(query, errors);
    expect(errors.join(' ')).toContain(message);
  });
});
