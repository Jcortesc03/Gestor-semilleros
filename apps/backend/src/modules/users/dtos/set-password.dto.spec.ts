import { parseSetPassword } from './set-password.dto';

describe('parseSetPassword', () => {
  it('acepta una contraseña textual', () => {
    expect(parseSetPassword({ password: 'Temporal-1234' })).toEqual({ ok: true, value: { password: 'Temporal-1234' } });
  });

  it.each([null, {}, { password: 12 }, { password: 'x', extra: 1 }])('rechaza %p', (input) => {
    expect(parseSetPassword(input).ok).toBe(false);
  });
});
