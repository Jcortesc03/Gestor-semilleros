import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, parseCreateUser } from './create-user.dto';

const valid = { email: 'nuevo@example.test', fullName: 'Usuario Nuevo', roles: ['STUDENT'], password: 'Clave-Segura-1' };

function errorsOf(input: unknown): string[] {
  const result = parseCreateUser(input);
  return result.ok ? [] : result.errors;
}

describe('parseCreateUser', () => {
  it('acepta un cuerpo válido y normaliza correo, nombre y roles', () => {
    expect(
      parseCreateUser({ email: ' Nuevo@Example.TEST ', fullName: '  Usuario   Nuevo ', roles: ['TUTOR', 'DEAN', 'TUTOR'], password: 'Clave-Segura-1' }),
    ).toEqual({
      ok: true,
      value: { email: 'nuevo@example.test', fullName: 'Usuario Nuevo', roles: ['TUTOR', 'DEAN'], password: 'Clave-Segura-1' },
    });
  });

  it('permite omitir la contraseña (usuario solo con Google)', () => {
    const result = parseCreateUser({ ...valid, password: undefined });
    expect(result.ok && result.value.password).toBeNull();
  });

  it('rechaza cuerpos que no son objetos', () => {
    expect(errorsOf(null)).toHaveLength(1);
    expect(errorsOf([valid])).toHaveLength(1);
  });

  it('informa todos los errores a la vez', () => {
    expect(errorsOf({})).toEqual([
      'email es obligatorio.',
      'fullName es obligatorio.',
      'roles debe ser una lista con al menos un rol.',
    ]);
  });

  it.each([
    ['correo inválido', { ...valid, email: 'no-es-correo' }, /email/],
    ['nombre vacío', { ...valid, fullName: '   ' }, /fullName/],
    ['nombre demasiado largo', { ...valid, fullName: 'a'.repeat(151) }, /fullName/],
    ['lista de roles vacía', { ...valid, roles: [] }, /roles/],
    ['rol desconocido', { ...valid, roles: ['SUPERUSER'] }, /SUPERUSER/],
    ['contraseña corta', { ...valid, password: 'x'.repeat(MIN_PASSWORD_LENGTH - 1) }, /password/],
    ['contraseña larga', { ...valid, password: 'x'.repeat(MAX_PASSWORD_LENGTH + 1) }, /password/],
    ['contraseña no textual', { ...valid, password: 12345678 }, /password/],
    ['campos no permitidos', { ...valid, status: 'INACTIVE', passwordHash: 'x' }, /status, passwordHash/],
  ])('rechaza: %s', (_caso, input, pattern) => {
    expect(errorsOf(input).join(' ')).toMatch(pattern);
  });
});
