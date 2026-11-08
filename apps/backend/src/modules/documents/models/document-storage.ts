import type { Readable } from 'node:stream';

/** Token de inyección del almacenamiento de binarios; permite sustituirlo en pruebas. */
export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

/** Puerto del almacenamiento de objetos (AWS S3 en producción, RustFS en desarrollo; ADR 0013). */
export interface DocumentStorage {
  /** false si faltan el bucket o las credenciales: los endpoints de documentos responden 503. */
  isConfigured(): boolean;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Devuelve el contenido como flujo. Lanza si el objeto no existe o el almacenamiento falla. */
  get(key: string): Promise<Readable>;
  /** Borra el objeto (solo para limpiar subidas fallidas; la eliminación de documentos es lógica). */
  remove(key: string): Promise<void>;
  /** Tamaño del objeto o null si no existe. */
  head(key: string): Promise<{ sizeBytes: number } | null>;
}
