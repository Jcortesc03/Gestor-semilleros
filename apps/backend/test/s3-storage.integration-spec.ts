// Integración manual contra un servidor compatible con S3 (RustFS de docker/compose.yaml).
// No forma parte de la suite por defecto. Ejecución desde apps/backend:
//   docker compose -f ../../docker/compose.yaml up -d --wait s3
//   S3_ENDPOINT=http://localhost:9000 S3_BUCKET=semilleros-documentos S3_ACCESS_KEY_ID=semilleros \
//   S3_SECRET_ACCESS_KEY=semilleros-local S3_FORCE_PATH_STYLE=true S3_CREATE_BUCKET=true \
//   node --experimental-vm-modules node_modules/jest/bin/jest.js --config test/jest-e2e.config.js \
//     --testRegex 'integration-spec\.ts$' --runInBand
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env';
import { S3DocumentStorage } from '../src/modules/documents/services/s3-document-storage';

const enabled = Boolean(process.env.S3_ENDPOINT);

(enabled ? describe : describe.skip)('S3DocumentStorage contra un servidor real', () => {
  it('crea el bucket y hace put, head, get y remove', async () => {
    const storage = new S3DocumentStorage(loadEnv());
    expect(storage.isConfigured()).toBe(true);
    await storage.onModuleInit();

    const key = `projects/integracion/${randomUUID()}`;
    const body = Buffer.from('%PDF-1.7 contenido de integración ñ');
    await storage.put(key, body, 'application/pdf');
    expect(await storage.head(key)).toEqual({ sizeBytes: body.length });

    const chunks: Buffer[] = [];
    for await (const chunk of await storage.get(key)) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).equals(body)).toBe(true);

    await storage.remove(key);
    expect(await storage.head(key)).toBeNull();
    await expect(storage.get(key)).rejects.toThrow();
  });
});
