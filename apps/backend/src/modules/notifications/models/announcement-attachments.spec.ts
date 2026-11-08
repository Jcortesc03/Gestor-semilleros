import { attachmentsNotice, inspectAttachments, parseMultipartData } from './announcement-attachments';

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(8)]);
const file = (originalname: string, buffer = pdf) => ({ originalname, buffer });

describe('parseMultipartData', () => {
  it('lee el JSON del campo data', () => {
    expect(parseMultipartData({ data: '{"a":1}' })).toEqual({ ok: true, value: { a: 1 } });
  });

  it.each([undefined, null, {}, { data: 5 }, { data: '{roto' }, { data: '{}', otro: 'x' }])('rechaza %j', (body) => {
    expect(parseMultipartData(body).ok).toBe(false);
  });
});

describe('inspectAttachments', () => {
  it('sin archivos es válido para cualquier tipo', () => {
    expect(inspectAttachments('COMMUNICATION', [])).toEqual({ ok: true, value: [] });
  });

  it('solo NEWS admite archivos', () => {
    expect(inspectAttachments('CHANGE', [file('a.pdf')])).toEqual({
      ok: false,
      errors: ['Solo las noticias (NEWS) admiten archivos adjuntos.'],
    });
  });

  it('rechaza más de 5 archivos', () => {
    const files = Array.from({ length: 6 }, (_, i) => file(`${i}.pdf`));
    expect(inspectAttachments('NEWS', files).ok).toBe(false);
    expect(inspectAttachments('NEWS', files.slice(0, 5)).ok).toBe(true);
  });

  it('valida extensión y firma, y sanea el nombre', () => {
    const good = inspectAttachments('NEWS', [file('../carpeta/informe.pdf')]);
    expect(good).toMatchObject({ ok: true, value: [{ fileName: 'informe.pdf', format: 'PDF', mimeType: 'application/pdf' }] });
    expect(inspectAttachments('NEWS', [file('falso.pdf', Buffer.from('xx'))]).ok).toBe(false);
    expect(inspectAttachments('NEWS', [file('virus.exe')]).ok).toBe(false);
  });
});

describe('attachmentsNotice', () => {
  it('usa la frase del contrato', () => {
    expect(attachmentsNotice(3)).toBe('Incluye 3 archivo(s) adjunto(s): consúltalos en la plataforma.');
  });
});
