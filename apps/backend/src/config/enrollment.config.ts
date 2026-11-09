import { EnvValidationError } from './env';
import type { EnrollmentConfig, GoogleSheetsConfig } from './enrollment.config.types';

function optional(source: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = source[key]?.trim();
  return value ? value : undefined;
}

function positiveInt(raw: string | undefined, key: string, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new EnvValidationError(`${key} debe ser un entero positivo.`);
  return value;
}

function parseAllowlist(source: NodeJS.ProcessEnv): Record<string, string[]> {
  const raw = optional(source, 'ENROLLMENT_SHEETS_ALLOWLIST');
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EnvValidationError('ENROLLMENT_SHEETS_ALLOWLIST debe ser JSON válido.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new EnvValidationError('ENROLLMENT_SHEETS_ALLOWLIST debe ser un objeto.');
  }
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (Array.isArray(value)) result[key] = value.filter((v): v is string => typeof v === 'string');
    else if (typeof value === 'string') result[key] = [value];
    else throw new EnvValidationError(`ENROLLMENT_SHEETS_ALLOWLIST.${key} debe ser texto o arreglo de texto.`);
  }
  return result;
}

export function loadEnrollmentConfig(source: NodeJS.ProcessEnv, authSecret: string): EnrollmentConfig {
  const clientEmail = optional(source, 'ENROLLMENT_GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKeyRaw = source.ENROLLMENT_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  const privateKey = privateKeyRaw ? privateKeyRaw.replace(/\\n/g, '\n') : undefined;
  if (Boolean(clientEmail) !== Boolean(privateKey)) {
    throw new EnvValidationError('ENROLLMENT_GOOGLE_SERVICE_ACCOUNT_EMAIL y ENROLLMENT_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY deben definirse juntas.');
  }
  const google: GoogleSheetsConfig | null =
    clientEmail && privateKey
      ? {
          clientEmail,
          privateKey,
          timeoutMs: positiveInt(source.ENROLLMENT_GOOGLE_SHEETS_TIMEOUT_MS, 'ENROLLMENT_GOOGLE_SHEETS_TIMEOUT_MS', 10000),
        }
      : null;

  const previewTokenSecret = optional(source, 'ENROLLMENT_PREVIEW_TOKEN_SECRET') ?? authSecret;

  return {
    google,
    allowlist: parseAllowlist(source),
    previewTokenSecret,
    cleanupIntervalMs: positiveInt(source.ENROLLMENT_CLEANUP_INTERVAL_MS, 'ENROLLMENT_CLEANUP_INTERVAL_MS', 60000),
    maxSheetRows: positiveInt(source.ENROLLMENT_MAX_SHEET_ROWS, 'ENROLLMENT_MAX_SHEET_ROWS', 5000),
    exportMaxRows: positiveInt(source.ENROLLMENT_EXPORT_MAX_ROWS, 'ENROLLMENT_EXPORT_MAX_ROWS', 10000),
  };
}
