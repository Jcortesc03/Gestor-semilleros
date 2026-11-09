import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApiRequest } from '../src/lib/api.ts';
import {
  canPreviewInline,
  deleteDocument,
  documentUrl,
  listDocuments,
  MAX_DOCUMENT_BYTES,
  parseDocument,
  uploadDocument,
  validateDocumentFile,
} from '../src/features/documents/api.ts';
import { formatFileSize } from '../src/features/documents/format.ts';

const projectId = '00000000-0000-0000-0000-000000000010';
const documentId = '00000000-0000-0000-0000-000000000070';
const dto = {
  id: documentId, projectId, fileName: 'informe-avance.pdf', format: 'PDF', mimeType: 'application/pdf',
  sizeBytes: 183042, uploadedBy: { id: '00000000-0000-0000-0000-000000000030', fullName: 'Tatiana Tutora Demo' },
  createdAt: '2026-11-07T20:00:00.000Z',
};

test('parseDocument acepta el DocumentDto del contrato y descarta cualquier campo extra', () => {
  assert.deepEqual(parseDocument({ ...dto, storageKey: 'projects/x/secret' }), dto);
});

test('parseDocument rechaza formatos fuera del contrato y tipos incorrectos', () => {
  assert.throws(() => parseDocument({ ...dto, format: 'ZIP' }), ApiError);
  assert.throws(() => parseDocument({ ...dto, sizeBytes: '183042' }), ApiError);
  assert.throws(() => parseDocument({ ...dto, id: 'no-es-uuid' }), ApiError);
  assert.throws(() => parseDocument({ ...dto, uploadedBy: null }), ApiError);
  assert.throws(() => parseDocument(null), ApiError);
});

test('listDocuments pide la ruta del proyecto y valida cada elemento', async () => {
  const request = createApiRequest(async (input, init) => {
    assert.equal(input, `/api/projects/${projectId}/documents`);
    assert.equal(init?.method, 'GET');
    return Response.json({ items: [dto], total: 1, page: 1, pageSize: 20 });
  });
  assert.deepEqual(await listDocuments(request, projectId), { items: [dto], total: 1, page: 1, pageSize: 20 });

  const broken = createApiRequest(async () => Response.json({ items: [{ ...dto, format: 'ZIP' }], total: 1, page: 1, pageSize: 20 }));
  await assert.rejects(listDocuments(broken, projectId), ApiError);
});

test('listDocuments envía la página y el tamaño de página solo cuando difieren del valor por defecto', async () => {
  const calls: string[] = [];
  const page = { items: [dto], total: 45, page: 3, pageSize: 100 };
  const request = createApiRequest(async (input) => { calls.push(String(input)); return Response.json(page); });

  assert.deepEqual(await listDocuments(request, projectId, { page: 3, pageSize: 100 }), page);
  await listDocuments(request, projectId, { page: 1 });
  assert.deepEqual(calls, [
    `/api/projects/${projectId}/documents?page=3&pageSize=100`,
    `/api/projects/${projectId}/documents`,
  ]);
});

test('uploadDocument envía un FormData con el campo file y sin Content-Type propio', async () => {
  const file = new File(['%PDF-1.4'], 'informe-avance.pdf', { type: 'application/pdf' });
  const request = createApiRequest(async (input, init) => {
    assert.equal(input, `/api/projects/${projectId}/documents`);
    assert.equal(init?.method, 'POST');
    assert.ok(init?.body instanceof FormData);
    const sent = init.body.get('file');
    assert.ok(sent instanceof File);
    assert.equal(sent.name, 'informe-avance.pdf');
    assert.equal([...init.body.keys()].length, 1);
    assert.equal(new Headers(init.headers).get('Content-Type'), null);
    return Response.json(dto, { status: 201 });
  });
  assert.deepEqual(await uploadDocument(request, projectId, file), dto);
});

test('uploadDocument propaga el 413 del backend con su mensaje', async () => {
  const file = new File(['x'], 'grande.pdf', { type: 'application/pdf' });
  const request = createApiRequest(async () => Response.json({ message: 'El archivo supera el tamaño máximo de 25 MB.' }, { status: 413 }));
  await assert.rejects(uploadDocument(request, projectId, file), (error: unknown) => error instanceof ApiError
    && error.status === 413
    && error.message === 'El archivo supera el tamaño máximo de 25 MB.');
});

test('deleteDocument usa DELETE sobre el documento', async () => {
  const request = createApiRequest(async (input, init) => {
    assert.equal(input, `/api/documents/${documentId}`);
    assert.equal(init?.method, 'DELETE');
    return new Response(null, { status: 204 });
  });
  assert.equal(await deleteDocument(request, documentId), undefined);
});

test('documentUrl apunta a la descarga del backend y admite inline', () => {
  assert.equal(documentUrl(documentId), `/api/documents/${documentId}/download`);
  assert.equal(documentUrl(documentId, { inline: true }), `/api/documents/${documentId}/download?inline=true`);
  assert.equal(documentUrl(documentId, { inline: false }), `/api/documents/${documentId}/download`);
});

test('solo PDF e imágenes se previsualizan en línea', () => {
  assert.equal(canPreviewInline('PDF'), true);
  assert.equal(canPreviewInline('IMAGE'), true);
  assert.equal(canPreviewInline('WORD'), false);
  assert.equal(canPreviewInline('EXCEL'), false);
});

test('validateDocumentFile acepta las extensiones del contrato sin distinguir mayúsculas', () => {
  for (const name of ['a.pdf', 'b.DOC', 'c.docx', 'd.xls', 'e.XLSX', 'f.png', 'g.jpg', 'h.jpeg', 'i.webp']) {
    assert.equal(validateDocumentFile({ name, size: 10 }), null, name);
  }
});

test('validateDocumentFile rechaza extensiones no admitidas, sin extensión o disfrazadas', () => {
  for (const name of ['programa.exe', 'notas.txt', 'sinextension', 'informe.pdf.exe', '.pdf.zip']) {
    assert.match(validateDocumentFile({ name, size: 10 }) ?? '', /Formato no admitido/, name);
  }
});

test('validateDocumentFile aplica el límite de 25 MB y rechaza archivos vacíos', () => {
  assert.equal(MAX_DOCUMENT_BYTES, 25 * 1024 * 1024);
  assert.equal(validateDocumentFile({ name: 'ok.pdf', size: MAX_DOCUMENT_BYTES }), null);
  assert.equal(validateDocumentFile({ name: 'grande.pdf', size: MAX_DOCUMENT_BYTES + 1 }), 'El archivo supera el tamaño máximo de 25 MB.');
  assert.equal(validateDocumentFile({ name: 'vacio.pdf', size: 0 }), 'El archivo está vacío.');
});

test('formatFileSize muestra unidades legibles en español', () => {
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(183042), '179 KB');
  assert.equal(formatFileSize(5 * 1024 * 1024), '5,0 MB');
  assert.equal(formatFileSize(24.5 * 1024 * 1024), '25 MB');
  assert.equal(formatFileSize(-1), 'Tamaño no disponible');
});
