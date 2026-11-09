import { backoffMs } from '../services/delivery-dispatcher.service';
import { effectivePreferences, wantsCopy } from './preferences';

describe('preferencias de copias', () => {
  it('aplica los valores por defecto: correo sí, WhatsApp no', () => {
    const all = effectivePreferences([]);
    expect(all).toHaveLength(10);
    expect(all.every((p) => p.enabled === (p.channel === 'EMAIL'))).toBe(true);
  });

  it('respeta lo guardado y completa el resto', () => {
    const stored = [{ kind: 'NEWS', channel: 'EMAIL', enabled: false }] as const;
    expect(wantsCopy(stored, 'NEWS', 'EMAIL')).toBe(false);
    expect(wantsCopy(stored, 'CHANGE', 'EMAIL')).toBe(true);
    expect(wantsCopy(stored, 'NEWS', 'WHATSAPP')).toBe(false);
  });
});

describe('backoffMs', () => {
  it('crece de forma exponencial con tope de una hora', () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([60_000, 120_000, 240_000]);
    expect(backoffMs(20)).toBe(60 * 60_000);
  });
});
