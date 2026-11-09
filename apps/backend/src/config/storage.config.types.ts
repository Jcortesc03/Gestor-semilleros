/** Configuración del almacenamiento S3 de documentos (ADR 0013). */
export interface StorageConfig {
  bucket: string;
  region: string;
  /** Solo para servidores compatibles con S3 (RustFS en desarrollo); null en AWS. */
  endpoint: string | null;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** Crea el bucket al arrancar si no existe (solo desarrollo). */
  createBucket: boolean;
}
