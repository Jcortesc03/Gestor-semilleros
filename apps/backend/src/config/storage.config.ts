/**
 * Lectura de las variables de entorno del almacenamiento S3 (ADR 0013).
 * Todo es opcional: sin bucket o sin credenciales el almacenamiento queda "no configurado".
 */
import { EnvValidationError } from './env';
import type { StorageConfig } from './storage.config.types';

const DEFAULT_REGION = 'us-east-1';

function optional(source: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = source[key]?.trim();
  return value ? value : undefined;
}

function bool(source: NodeJS.ProcessEnv, key: string): boolean {
  const raw = optional(source, key)?.toLowerCase();
  if (raw === undefined || raw === 'false') return false;
  if (raw === 'true') return true;
  throw new EnvValidationError(`${key} debe ser true o false.`);
}

export function loadStorageConfig(source: NodeJS.ProcessEnv): StorageConfig | null {
  const forcePathStyle = bool(source, 'S3_FORCE_PATH_STYLE');
  const createBucket = bool(source, 'S3_CREATE_BUCKET');
  const endpoint = optional(source, 'S3_ENDPOINT');
  if (endpoint !== undefined) {
    try {
      const protocol = new URL(endpoint).protocol;
      if (protocol !== 'http:' && protocol !== 'https:') throw new Error('protocolo');
    } catch {
      throw new EnvValidationError('S3_ENDPOINT debe ser una URL http(s) válida.');
    }
  }
  const bucket = optional(source, 'S3_BUCKET');
  const accessKeyId = optional(source, 'S3_ACCESS_KEY_ID');
  const secretAccessKey = optional(source, 'S3_SECRET_ACCESS_KEY');
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    region: optional(source, 'S3_REGION') ?? DEFAULT_REGION,
    endpoint: endpoint ?? null,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    createBucket,
  };
}
