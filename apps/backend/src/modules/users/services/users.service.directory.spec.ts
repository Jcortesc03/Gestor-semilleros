import type { PrismaService } from '../../../database/prisma.service';
import { normalizeForSearch } from '../../../common/utils/text';
import { UsersService } from './users.service';
import { PasswordService } from '../../auth';

const users = [
  { id: 'u1', fullName: 'Ana Zambrano', email: 'ana.zambrano@example.test', status: 'ACTIVE' as const, roles: [{ role: 'TUTOR' as const }] },
  { id: 'u2', fullName: 'José Álvarez', email: 'jose.alvarez@example.test', status: 'ACTIVE' as const, roles: [{ role: 'STUDENT' as const }, { role: 'DEAN' as const }] },
  { id: 'u3', fullName: 'Muñoz Pardo', email: 'munoz@example.test', status: 'ACTIVE' as const, roles: [{ role: 'TUTOR' as const }] },
];

function setup() {
  const findMany = jest.fn(async (args: { skip?: number; take?: number }) =>
    args.take === undefined ? users : users.slice(args.skip ?? 0, (args.skip ?? 0) + args.take),
  );
  const count = jest.fn(async () => users.length);
  const prisma = { user: { findMany, count } };
  return { service: new UsersService(prisma as unknown as PrismaService, new PasswordService()), findMany, count };
}

const query = (
  overrides: Partial<{ search: string | null; role: 'TUTOR' | null; page: number; pageSize: number; status: 'ALL' | 'INACTIVE' | null }> = {},
) => ({
  search: null,
  role: null,
  page: 1,
  pageSize: 20,
  status: null as 'ALL' | 'INACTIVE' | null,
  ...overrides,
});

describe('UsersService.listDirectory', () => {
  it('con status ALL no filtra por estado e incluye el campo status', async () => {
    const { service, findMany } = setup();
    const result = await service.listDirectory(query({ status: 'ALL' }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(result.items[0]).toMatchObject({ id: 'u1', status: 'ACTIVE' });
  });

  it('con status INACTIVE filtra solo inactivos', async () => {
    const { service, findMany } = setup();
    await service.listDirectory(query({ status: 'INACTIVE' }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'INACTIVE' } }));
  });

  it('solo consulta usuarios activos y devuelve id, nombre, correo y roles', async () => {
    const { service, findMany } = setup();
    const result = await service.listDirectory(query());

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'ACTIVE' } }));
    expect(result.items[0]).toEqual({ id: 'u1', fullName: 'Ana Zambrano', email: 'ana.zambrano@example.test', roles: ['TUTOR'] });
    expect(Object.keys(result.items[0]).sort()).toEqual(['email', 'fullName', 'id', 'roles']);
  });

  it('filtra por rol global en la base de datos', async () => {
    const { service, findMany } = setup();
    await service.listDirectory(query({ role: 'TUTOR' }));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE', roles: { some: { role: 'TUTOR' } } } }),
    );
  });

  it('sin búsqueda pagina en la consulta, con orden estable y total del mismo filtro', async () => {
    const { service, findMany, count } = setup();
    const result = await service.listDirectory(query({ page: 2, pageSize: 2 }));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2, take: 2, orderBy: [{ fullName: 'asc' }, { id: 'asc' }] }),
    );
    expect(count).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
    expect(result).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(result.items.map((u) => u.id)).toEqual(['u3']);
  });

  it('busca sin distinguir mayúsculas ni tildes en nombre y correo', async () => {
    const { service } = setup();
    expect((await service.listDirectory(query({ search: 'JOSE' }))).items.map((u) => u.id)).toEqual(['u2']);
    expect((await service.listDirectory(query({ search: 'josé' }))).items.map((u) => u.id)).toEqual(['u2']);
    expect((await service.listDirectory(query({ search: 'munoz' }))).items.map((u) => u.id)).toEqual(['u3']);
    expect((await service.listDirectory(query({ search: 'ana.zam' }))).items.map((u) => u.id)).toEqual(['u1']);
  });

  it('pagina después de filtrar por búsqueda y cuenta todas las coincidencias', async () => {
    const { service } = setup();
    const result = await service.listDirectory(query({ search: 'example', page: 2, pageSize: 1 }));
    expect(result).toMatchObject({ total: 3, page: 2, pageSize: 1 });
    expect(result.items.map((u) => u.id)).toEqual(['u2']);
  });

  it('una página más allá del final devuelve items vacíos con el total real', async () => {
    const { service } = setup();
    expect(await service.listDirectory(query({ search: 'example', page: 5, pageSize: 2 }))).toEqual({
      items: [],
      total: 3,
      page: 5,
      pageSize: 2,
    });
  });

  it('no devuelve resultados si nada coincide', async () => {
    const { service } = setup();
    expect(await service.listDirectory(query({ search: 'inexistente' }))).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });
});

describe('normalizeForSearch', () => {
  it.each([
    ['José Álvarez', 'jose alvarez'],
    ['ÁNGEL', 'angel'],
    ['Pingüino', 'pinguino'],
  ])('normaliza %s a %s', (input, expected) => {
    expect(normalizeForSearch(input)).toBe(expected);
  });

  it('reduce la eñe a n (limitación documentada)', () => {
    expect(normalizeForSearch('Muñoz')).toBe('munoz');
  });
});
