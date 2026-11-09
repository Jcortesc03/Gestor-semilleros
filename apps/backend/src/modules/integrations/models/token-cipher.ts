import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;
const DECRYPT_ERROR = 'No se pudo descifrar el dato.';

/**
 * Cifra y descifra datos sensibles (tokens de integraciones) con AES-256-GCM.
 * El resultado es autocontenido: `v1.<iv>.<tag>.<ciphertext>` en base64url.
 */
export class TokenCipher {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
      throw new Error('La clave de cifrado debe tener 32 bytes.');
    }
    this.key = key;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  decrypt(token: string): string {
    try {
      if (typeof token !== 'string') {
        throw new Error(DECRYPT_ERROR);
      }
      const parts = token.split('.');
      if (parts.length !== 4) {
        throw new Error(DECRYPT_ERROR);
      }
      const [version, ivPart, tagPart, ciphertextPart] = parts;
      if (version !== VERSION) {
        throw new Error(DECRYPT_ERROR);
      }
      const iv = decodeSegment(ivPart);
      const tag = decodeSegment(tagPart);
      const ciphertext = decodeSegment(ciphertextPart, true);
      if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
        throw new Error(DECRYPT_ERROR);
      }
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plain.toString('utf8');
    } catch {
      // Nunca se propaga el detalle: puede contener información del material cifrado.
      throw new Error(DECRYPT_ERROR);
    }
  }

  /** Sella un payload con caducidad; apto para el parámetro `state` de OAuth. */
  seal(payload: Record<string, unknown>, ttlMs: number, now = Date.now()): string {
    return this.encrypt(JSON.stringify({ p: payload, exp: now + ttlMs }));
  }

  /** Abre un sello; devuelve `null` si no descifra, el JSON es inválido o caducó. */
  open<T = Record<string, unknown>>(sealed: string, now = Date.now()): T | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.decrypt(sealed));
    } catch {
      return null;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const { p, exp } = parsed as { p?: unknown; exp?: unknown };
    if (typeof exp !== 'number' || !Number.isFinite(exp) || now >= exp) {
      return null;
    }
    if (typeof p !== 'object' || p === null) {
      return null;
    }
    return p as T;
  }
}

/** Decodifica base64url de forma estricta: rechaza alfabetos inválidos y codificaciones no canónicas. */
function decodeSegment(segment: string, allowEmpty = false): Buffer {
  if (segment.length === 0) {
    if (allowEmpty) {
      return Buffer.alloc(0);
    }
    throw new Error(DECRYPT_ERROR);
  }
  if (!BASE64URL_SEGMENT.test(segment)) {
    throw new Error(DECRYPT_ERROR);
  }
  const decoded = Buffer.from(segment, 'base64url');
  if (decoded.toString('base64url') !== segment) {
    throw new Error(DECRYPT_ERROR);
  }
  return decoded;
}
