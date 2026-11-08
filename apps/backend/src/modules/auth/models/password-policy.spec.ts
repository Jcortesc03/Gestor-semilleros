import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordPolicyErrors } from './password-policy';

describe('passwordPolicyErrors', () => {
  it('acepta una contraseña válida', () => {
    expect(passwordPolicyErrors('Clave-Segura-1', 'ana@example.test')).toEqual([]);
  });

  it('acepta los límites 10 y 256', () => {
    expect(passwordPolicyErrors('a'.repeat(MIN_PASSWORD_LENGTH - 1) + '1')).toEqual([]);
    expect(passwordPolicyErrors('a'.repeat(MAX_PASSWORD_LENGTH - 1) + '1')).toEqual([]);
  });

  it('rechaza menos de 10 y más de 256 caracteres', () => {
    expect(passwordPolicyErrors('abcd12345')).toEqual([expect.stringContaining('entre 10 y 256')]);
    expect(passwordPolicyErrors('a'.repeat(MAX_PASSWORD_LENGTH) + '1')).toEqual([expect.stringContaining('entre 10 y 256')]);
  });

  it.each(['SoloLetrasLargas', '12345678901234'])('exige una letra y un número (%s)', (password) => {
    expect(passwordPolicyErrors(password)).toEqual([expect.stringContaining('una letra y un número')]);
  });

  it('acepta letras con tilde y eñe', () => {
    expect(passwordPolicyErrors('contraseñaÁ1x')).toEqual([]);
  });

  it('rechaza una contraseña igual al correo sin distinguir mayúsculas', () => {
    expect(passwordPolicyErrors('Ana.Perez1@Example.test', 'ana.perez1@example.TEST')).toEqual([
      expect.stringContaining('igual al correo'),
    ]);
  });

  it('acumula varios incumplimientos y nunca incluye la contraseña', () => {
    const errors = passwordPolicyErrors('corta');
    expect(errors).toHaveLength(2);
    expect(errors.join(' ')).not.toContain('corta');
  });
});
