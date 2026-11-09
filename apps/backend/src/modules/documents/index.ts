// API pública del módulo de documentos.
export { DocumentsModule } from './documents.module';
export { DOCUMENT_STORAGE, type DocumentStorage } from './models/document-storage';
export {
  contentDisposition,
  inspectFile,
  MAX_DOCUMENT_BYTES,
  sanitizeFileName,
  UNSUPPORTED_FORMAT_ERROR,
} from './models/document-file';
export { createUploadErrorFilter, decodeFileName } from './controllers/upload-error.filter';
export { STORAGE_UNAVAILABLE } from './services/documents.service';
