import { contentDisposition, CONTENT_MISMATCH_ERROR, inspectFile, sanitizeFileName, UNSUPPORTED_FORMAT_ERROR } from './document-file';

const bytes = (...values: number[]) => Buffer.from([...values, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const text = (value: string) => Buffer.concat([Buffer.from(value, 'latin1'), Buffer.alloc(16)]);

const PDF = text('%PDF-1.7');
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);

describe('inspectFile', () => {
  it.each([
    ['a.pdf', PDF, 'PDF', 'application/pdf'],
    ['a.DOC', OLE, 'WORD', 'application/msword'],
    ['a.docx', ZIP, 'WORD', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['a.xls', OLE, 'EXCEL', 'application/vnd.ms-excel'],
    ['a.xlsx', ZIP, 'EXCEL', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['a.png', PNG, 'IMAGE', 'image/png'],
    ['a.jpg', JPEG, 'IMAGE', 'image/jpeg'],
    ['a.jpeg', JPEG, 'IMAGE', 'image/jpeg'],
    ['a.webp', WEBP, 'IMAGE', 'image/webp'],
  ])('acepta %s con su firma', (name, content, format, mimeType) => {
    expect(inspectFile(name, content)).toEqual({ ok: true, format, mimeType });
  });

  it('rechaza una firma que no corresponde a la extensión', () => {
    expect(inspectFile('a.pdf', PNG)).toEqual({ ok: false, error: CONTENT_MISMATCH_ERROR });
    expect(inspectFile('a.docx', OLE)).toEqual({ ok: false, error: CONTENT_MISMATCH_ERROR });
    expect(inspectFile('a.webp', Buffer.from('RIFF....WAVE'))).toEqual({ ok: false, error: CONTENT_MISMATCH_ERROR });
    expect(inspectFile('a.png', Buffer.alloc(0))).toEqual({ ok: false, error: CONTENT_MISMATCH_ERROR });
  });

  it('rechaza extensiones no admitidas o ausentes', () => {
    for (const name of ['a.exe', 'a', 'a.', 'a.pdf.exe', 'a.constructor', 'a.__proto__']) {
      expect(inspectFile(name, PDF)).toEqual({ ok: false, error: UNSUPPORTED_FORMAT_ERROR });
    }
  });
});

describe('sanitizeFileName', () => {
  it('quita rutas y caracteres de control', () => {
    expect(sanitizeFileName('../../etc/informe.pdf')).toBe('informe.pdf');
    expect(sanitizeFileName('C:\\Users\\x\\tesis.docx')).toBe('tesis.docx');
    expect(sanitizeFileName('  a\u0000b\n.pdf ')).toBe('ab.pdf');
  });

  it('devuelve vacío si no queda nombre', () => {
    expect(sanitizeFileName('')).toBe('');
    expect(sanitizeFileName('a/')).toBe('');
    expect(sanitizeFileName('..')).toBe('');
  });

  it('recorta a 255 caracteres conservando la extensión', () => {
    const result = sanitizeFileName(`${'x'.repeat(400)}.pdf`);
    expect(result).toHaveLength(255);
    expect(result.endsWith('.pdf')).toBe(true);
  });
});

describe('contentDisposition', () => {
  it('codifica el nombre según RFC 5987', () => {
    expect(contentDisposition("Informe (final) ñ's.pdf", false)).toBe(
      "attachment; filename*=UTF-8''Informe%20%28final%29%20%C3%B1%27s.pdf",
    );
    expect(contentDisposition('a.pdf', true)).toBe("inline; filename*=UTF-8''a.pdf");
  });
});
