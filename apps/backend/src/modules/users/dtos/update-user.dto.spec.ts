import { parseUpdateUser } from './update-user.dto';

const errorsOf = (input: unknown) => {
  const result = parseUpdateUser(input);
  return result.ok ? [] : result.errors;
};

describe('parseUpdateUser', () => {
  it('acepta nombre y roles, recortando el nombre', () => {
    expect(parseUpdateUser({ fullName: '  Ana   Pérez ', roles: ['TUTOR', 'DEAN'] })).toEqual({
      ok: true,
      value: { fullName: 'Ana Pérez', roles: ['TUTOR', 'DEAN'] },
    });
  });

  it('acepta solo uno de los campos', () => {
    expect(parseUpdateUser({ roles: ['STUDENT'] })).toEqual({ ok: true, value: { roles: ['STUDENT'] } });
    expect(parseUpdateUser({ fullName: 'Ana' })).toEqual({ ok: true, value: { fullName: 'Ana' } });
  });

  it.each([
    ['cuerpo vacío', {}, /al menos uno/],
    ['no es objeto', [], /objeto JSON/],
    ['nombre vacío', { fullName: '  ' }, /fullName/],
    ['nombre largo', { fullName: 'a'.repeat(151) }, /fullName/],
    ['roles vacíos', { roles: [] }, /al menos un rol/],
    ['rol desconocido', { roles: ['SUPERUSER'] }, /SUPERUSER/],
    ['roles repetidos', { roles: ['TUTOR', 'TUTOR'] }, /repetidos/],
    ['campos no permitidos', { fullName: 'Ana', email: 'x@y.co', status: 'INACTIVE' }, /email, status/],
  ])('rechaza: %s', (_caso, input, pattern) => {
    expect(errorsOf(input).join(' ')).toMatch(pattern);
  });
});
