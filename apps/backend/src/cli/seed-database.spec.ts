import { parseSeedPassword } from './seed-database';

describe('parseSeedPassword', () => {
  it('acepta una contraseña válida', () => {
    expect(parseSeedPassword('Clave-Demo-123')).toEqual({ ok: true, value: 'Clave-Demo-123' });
  });

  it.each([undefined, ''])('rechaza una contraseña ausente (%p)', (raw) => {
    expect(parseSeedPassword(raw)).toEqual({ ok: false, error: expect.stringContaining('obligatoria') });
  });

  it('rechaza contraseñas demasiado cortas o largas sin revelarlas', () => {
    for (const raw of ['corta', 'x'.repeat(257)]) {
      const result = parseSeedPassword(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).not.toContain(raw);
    }
  });

  it('acepta los límites 8 y 256', () => {
    expect(parseSeedPassword('x'.repeat(8)).ok).toBe(true);
    expect(parseSeedPassword('x'.repeat(256)).ok).toBe(true);
  });
});
