import { parseSeedPassword } from './seed-database';

describe('parseSeedPassword', () => {
  it('acepta una contraseña válida', () => {
    expect(parseSeedPassword('Clave-Demo-123')).toEqual({ ok: true, value: 'Clave-Demo-123' });
  });

  it.each([undefined, ''])('rechaza una contraseña ausente (%p)', (raw) => {
    expect(parseSeedPassword(raw)).toEqual({ ok: false, error: expect.stringContaining('obligatoria') });
  });

  it('rechaza contraseñas que incumplen la política sin revelarlas', () => {
    for (const raw of ['corta1', 'a1'.repeat(129), 'SoloLetrasLargas', '12345678901', 'admin@example.test']) {
      const result = parseSeedPassword(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).not.toContain(raw);
    }
  });

  it('acepta los límites 10 y 256', () => {
    expect(parseSeedPassword('a'.repeat(9) + '1').ok).toBe(true);
    expect(parseSeedPassword('a'.repeat(255) + '1').ok).toBe(true);
  });
});
