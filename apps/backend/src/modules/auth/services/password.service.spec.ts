import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('genera hashes Argon2id que no contienen la contraseña', async () => {
    const hashed = await service.hash('Clave-Segura-123');
    expect(hashed.startsWith('$argon2id$')).toBe(true);
    expect(hashed).not.toContain('Clave-Segura-123');
  });

  it('genera hashes distintos para la misma contraseña (sal aleatoria)', async () => {
    expect(await service.hash('igual')).not.toBe(await service.hash('igual'));
  });

  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hashed = await service.hash('correcta');
    await expect(service.verify(hashed, 'correcta')).resolves.toBe(true);
    await expect(service.verify(hashed, 'incorrecta')).resolves.toBe(false);
  });

  it('trata un hash corrupto como contraseña incorrecta', async () => {
    await expect(service.verify('no-es-un-hash', 'x')).resolves.toBe(false);
  });
});
