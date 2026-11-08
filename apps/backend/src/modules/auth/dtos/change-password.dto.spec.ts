import { parseChangePassword } from './change-password.dto';

const errorsOf = (input: unknown) => {
  const result = parseChangePassword(input);
  return result.ok ? [] : result.errors;
};

describe('parseChangePassword', () => {
  it('acepta la contraseña actual y la nueva', () => {
    expect(parseChangePassword({ currentPassword: 'vieja', newPassword: 'nueva' })).toEqual({
      ok: true,
      value: { currentPassword: 'vieja', newPassword: 'nueva' },
    });
  });

  it('la contraseña actual es opcional en la forma del cuerpo', () => {
    expect(parseChangePassword({ newPassword: 'nueva' })).toEqual({ ok: true, value: { currentPassword: null, newPassword: 'nueva' } });
  });

  it.each([
    ['sin cuerpo', null, /objeto JSON/],
    ['sin newPassword', {}, /newPassword es obligatorio/],
    ['newPassword no textual', { newPassword: 5 }, /newPassword es obligatorio/],
    ['currentPassword no textual', { currentPassword: 5, newPassword: 'x' }, /currentPassword debe ser texto/],
    ['campos no permitidos', { newPassword: 'x', status: 'ACTIVE' }, /status/],
  ])('rechaza: %s', (_caso, input, pattern) => {
    expect(errorsOf(input).join(' ')).toMatch(pattern);
  });
});
