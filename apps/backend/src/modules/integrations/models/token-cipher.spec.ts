import { TokenCipher } from './token-cipher';

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);

function cipher(): TokenCipher {
  return new TokenCipher(KEY);
}

/** Cambia el primer carácter de un segmento base64url por otro válido distinto. */
function tamperSegment(token: string, index: number): string {
  const parts = token.split('.');
  const segment = parts[index];
  const replacement = segment[0] === 'A' ? 'B' : 'A';
  parts[index] = replacement + segment.slice(1);
  return parts.join('.');
}

describe('TokenCipher', () => {
  describe('construcción', () => {
    it('exige una clave de 32 bytes', () => {
      expect(() => new TokenCipher(Buffer.alloc(31))).toThrow('La clave de cifrado debe tener 32 bytes.');
      expect(() => new TokenCipher(Buffer.alloc(33))).toThrow('La clave de cifrado debe tener 32 bytes.');
      expect(() => new TokenCipher(Buffer.alloc(0))).toThrow('La clave de cifrado debe tener 32 bytes.');
    });

    it('acepta una clave de 32 bytes', () => {
      expect(() => new TokenCipher(Buffer.alloc(32))).not.toThrow();
    });
  });

  describe('encrypt/decrypt', () => {
    it('hace ida y vuelta con texto ASCII, tildes y emojis', () => {
      const examples = ['', 'token-123', 'contraseña con tildes: áéíóú ñ', 'emojis 🔐🧪 y símbolos ✓', 'línea\nnueva\ttabulada'];
      for (const plain of examples) {
        expect(cipher().decrypt(cipher().encrypt(plain))).toBe(plain);
      }
    });

    it('produce el formato v1 con cuatro segmentos base64url', () => {
      const token = cipher().encrypt('dato');
      const parts = token.split('.');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe('v1');
      for (const part of parts.slice(1)) {
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    it('usa un IV distinto en cada cifrado', () => {
      const instance = cipher();
      const first = instance.encrypt('mismo texto').split('.')[1];
      const second = instance.encrypt('mismo texto').split('.')[1];
      expect(first).not.toBe(second);
    });

    it('falla al manipular cualquier segmento', () => {
      const instance = cipher();
      const token = instance.encrypt('dato sensible');
      for (const index of [0, 1, 2, 3]) {
        expect(() => instance.decrypt(tamperSegment(token, index))).toThrow('No se pudo descifrar el dato.');
      }
    });

    it('falla con caracteres fuera del alfabeto base64url', () => {
      const instance = cipher();
      const parts = instance.encrypt('dato').split('.');
      parts[3] = `${parts[3]}=`;
      expect(() => instance.decrypt(parts.join('.'))).toThrow('No se pudo descifrar el dato.');
    });

    it('falla con formatos inválidos', () => {
      const instance = cipher();
      const invalid = [
        '',
        'basura',
        'v1',
        'v1.solo',
        'v1.a.b',
        'v1.a.b.c.d',
        'v2.a.b.c',
        `v1.${'A'.repeat(16)}.${'A'.repeat(22)}.${'A'.repeat(8)}`,
        instance.encrypt('dato').replace(/^v1/, 'v0'),
      ];
      for (const token of invalid) {
        expect(() => instance.decrypt(token)).toThrow('No se pudo descifrar el dato.');
      }
    });

    it('falla al descifrar con otra clave', () => {
      const token = cipher().encrypt('dato');
      expect(() => new TokenCipher(OTHER_KEY).decrypt(token)).toThrow('No se pudo descifrar el dato.');
    });
  });

  describe('seal/open', () => {
    it('sella y abre el payload antes de caducar', () => {
      const instance = cipher();
      const now = 1_000_000;
      const sealed = instance.seal({ userId: 'user-1', code: 'abc' }, 1_000, now);
      expect(sealed.split('.')[0]).toBe('v1');
      expect(sealed).toMatch(/^[A-Za-z0-9_.-]+$/);
      expect(instance.open(sealed, now)).toEqual({ userId: 'user-1', code: 'abc' });
      expect(instance.open(sealed, now + 999)).toEqual({ userId: 'user-1', code: 'abc' });
    });

    it('devuelve null al caducar', () => {
      const instance = cipher();
      const now = 1_000_000;
      const sealed = instance.seal({ userId: 'user-1' }, 1_000, now);
      expect(instance.open(sealed, now + 1_000)).toBeNull();
      expect(instance.open(sealed, now + 5_000)).toBeNull();
    });

    it('respeta el tipo solicitado al abrir', () => {
      const instance = cipher();
      const sealed = instance.seal({ userId: 'user-1' }, 1_000);
      expect(instance.open<{ userId: string }>(sealed)?.userId).toBe('user-1');
    });

    it('devuelve null con basura, con otra clave o con contenido no JSON', () => {
      const instance = cipher();
      expect(instance.open('basura')).toBeNull();
      expect(instance.open('')).toBeNull();
      expect(instance.open('v1.a.b.c')).toBeNull();
      expect(instance.open('v2.a.b.c')).toBeNull();
      const sealed = instance.seal({ userId: 'user-1' }, 1_000);
      expect(new TokenCipher(OTHER_KEY).open(sealed)).toBeNull();
      expect(instance.open(instance.encrypt('esto no es json'))).toBeNull();
      expect(instance.open(instance.encrypt('"solo texto"'))).toBeNull();
      expect(instance.open(instance.encrypt('null'))).toBeNull();
    });

    it('devuelve null si el sello no tiene caducidad válida', () => {
      const instance = cipher();
      expect(instance.open(instance.encrypt(JSON.stringify({ p: { a: 1 } })))).toBeNull();
      expect(instance.open(instance.encrypt(JSON.stringify({ p: { a: 1 }, exp: 'mañana' })))).toBeNull();
      expect(instance.open(instance.encrypt(JSON.stringify({ p: { a: 1 }, exp: Number.NaN })))).toBeNull();
    });
  });
});
