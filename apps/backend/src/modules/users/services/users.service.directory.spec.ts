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
  const findMany = jest.fn(async () => users);
  const prisma = { user: { findMany } };
  return { service: new UsersService(prisma as unknown as PrismaService, new PasswordService()), findMany };
}

const query = (overrides: Partial<{ search: string | null; role: 'TUTOR' | null; limit: number; status: 'ALL' | 'INACTIVE' | null }> = {}) => ({
  search: null,
  role: null,
  limit: 20,
  status: null as 'ALL' | 'INACTIVE' | null,
  ...overrides,
});

describe('UsersService.listDirectory', () => {
  it('con status ALL no filtra por estado e incluye el campo status', async () => {
    const { service, findMany } = setup();
    const result = await service.listDirectory(query({ status: 'ALL' }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(result[0]).toMatchObject({ id: 'u1', status: 'ACTIVE' });
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
    expect(result[0]).toEqual({ id: 'u1', fullName: 'Ana Zambrano', email: 'ana.zambrano@example.test', roles: ['TUTOR'] });
    expect(Object.keys(result[0]).sort()).toEqual(['email', 'fullName', 'id', 'roles']);
  });

  it('filtra por rol global en la base de datos', async () => {
    const { service, findMany } = setup();
    await service.listDirectory(query({ role: 'TUTOR' }));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE', roles: { some: { role: 'TUTOR' } } } }),
    );
  });

  it('sin búsqueda limita en la consulta', async () => {
    const { service, findMany } = setup();
    const result = await service.listDirectory(query({ limit: 2 }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
    expect(result.map((u) => u.id)).toEqual(['u1', 'u2']);
  });

  it('busca sin distinguir mayúsculas ni tildes en nombre y correo', async () => {
    const { service } = setup();
    expect((await service.listDirectory(query({ search: 'JOSE' }))).map((u) => u.id)).toEqual(['u2']);
    expect((await service.listDirectory(query({ search: 'josé' }))).map((u) => u.id)).toEqual(['u2']);
    expect((await service.listDirectory(query({ search: 'munoz' }))).map((u) => u.id)).toEqual(['u3']);
    expect((await service.listDirectory(query({ search: 'ana.zam' }))).map((u) => u.id)).toEqual(['u1']);
  });

  it('aplica el límite después de filtrar por búsqueda', async () => {
    const { service } = setup();
    const result = await service.listDirectory(query({ search: 'example', limit: 1 }));
    expect(result.map((u) => u.id)).toEqual(['u1']);
  });

  it('no devuelve resultados si nada coincide', async () => {
    const { service } = setup();
    expect(await service.listDirectory(query({ search: 'inexistente' }))).toEqual([]);
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
