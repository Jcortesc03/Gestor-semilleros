import { Readable } from 'node:stream';
import type { DocumentStorage } from '../src/modules/documents';

/** Almacenamiento en memoria que sustituye a S3 en las pruebas e2e. */
export class MemoryStorage implements DocumentStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  failPut = false;

  constructor(private readonly configured = true) {}

  isConfigured(): boolean {
    return this.configured;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.failPut) throw new Error('almacenamiento caído');
    this.objects.set(key, { body, contentType });
  }

  async get(key: string): Promise<Readable> {
    const object = this.objects.get(key);
    if (!object) throw new Error('NoSuchKey');
    return Readable.from([object.body]);
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async head(key: string): Promise<{ sizeBytes: number } | null> {
    const object = this.objects.get(key);
    return object ? { sizeBytes: object.body.length } : null;
  }
}
