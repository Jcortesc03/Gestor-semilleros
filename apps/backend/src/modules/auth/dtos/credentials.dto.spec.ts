import { MAX_PASSWORD_LENGTH, parseCredentials } from './credentials.dto';

describe('parseCredentials', () => {
  it('normaliza el correo (espacios y mayúsculas)', () => {
    expect(parseCredentials({ email: '  Ana@Example.TEST ', password: 'secreto' })).toEqual({
      email: 'ana@example.test',
      password: 'secreto',
    });
  });

  it('no modifica la contraseña', () => {
    expect(parseCredentials({ email: 'a@b.co', password: ' Con Espacios ' })?.password).toBe(' Con Espacios ');
  });

  it.each([
    ['entrada nula', null],
    ['sin campos', {}],
    ['tipos incorrectos', { email: 1, password: true }],
    ['correo inválido', { email: 'no-es-correo', password: 'x' }],
    ['contraseña vacía', { email: 'a@b.co', password: '' }],
    ['contraseña demasiado larga', { email: 'a@b.co', password: 'x'.repeat(MAX_PASSWORD_LENGTH + 1) }],
    ['correo demasiado largo', { email: `${'a'.repeat(250)}@b.co`, password: 'x' }],
  ])('rechaza %s', (_caso, input) => {
    expect(parseCredentials(input)).toBeNull();
  });
});
