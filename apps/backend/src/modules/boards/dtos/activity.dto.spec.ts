import {
  parseApproval,
  parseAssignee,
  parseAttachmentLink,
  parseCreateActivity,
  parseUpdateActivity,
} from './activity.dto';

const USER_ID = '3f1b6f1e-9d2a-4c3b-8a7e-0f1d2c3b4a59';

function createErrors(input: unknown): string[] {
  const result = parseCreateActivity(input);
  return result.ok ? [] : result.errors;
}

function updateErrors(input: unknown): string[] {
  const result = parseUpdateActivity(input);
  return result.ok ? [] : result.errors;
}

function approvalErrors(input: unknown): string[] {
  const result = parseApproval(input);
  return result.ok ? [] : result.errors;
}

function assigneeErrors(input: unknown): string[] {
  const result = parseAssignee(input);
  return result.ok ? [] : result.errors;
}

function linkErrors(input: unknown): string[] {
  const result = parseAttachmentLink(input);
  return result.ok ? [] : result.errors;
}

describe('parseCreateActivity', () => {
  it('acepta un cuerpo válido y recorta título y descripción', () => {
    expect(parseCreateActivity({ title: '  Revisar avances  ', description: '  Leer el documento.  ' })).toEqual({
      ok: true,
      value: { title: 'Revisar avances', description: 'Leer el documento.' },
    });
  });

  it('convierte en null la descripción omitida, nula o vacía', () => {
    for (const description of [undefined, null, '', '   ']) {
      expect(parseCreateActivity({ title: 'Actividad', description })).toEqual({
        ok: true,
        value: { title: 'Actividad', description: null },
      });
    }
    expect(parseCreateActivity({ title: 'Actividad' })).toEqual({
      ok: true,
      value: { title: 'Actividad', description: null },
    });
  });

  it('rechaza cuerpos que no son objetos JSON', () => {
    expect(createErrors(null)).toEqual(['El cuerpo debe ser un objeto JSON.']);
    expect(createErrors([{ title: 'Actividad' }])).toEqual(['El cuerpo debe ser un objeto JSON.']);
  });

  it('acumula los errores de título y descripción', () => {
    expect(createErrors({ title: '   ', description: 123 })).toEqual([
      'title es obligatorio.',
      'description debe ser texto.',
    ]);
  });

  it.each([
    ['título ausente', { description: 'Texto' }, /title es obligatorio/],
    ['título demasiado largo', { title: 'a'.repeat(201) }, /title admite como máximo 200 caracteres/],
    ['descripción demasiado larga', { title: 'Actividad', description: 'a'.repeat(5001) }, /description admite como máximo 5000 caracteres/],
    ['campos no permitidos', { title: 'Actividad', status: 'DONE' }, /Campos no permitidos: status\./],
  ])('rechaza: %s', (_caso, input, pattern) => {
    expect(createErrors(input).join(' ')).toMatch(pattern);
  });
});

describe('parseUpdateActivity', () => {
  it('acepta una actualización completa y normaliza sus campos', () => {
    expect(
      parseUpdateActivity({
        title: '  Nueva actividad  ',
        description: '  Descripción nueva  ',
        progressStatus: 'IN_PROGRESS',
        result: 'FAILURE',
      }),
    ).toEqual({
      ok: true,
      value: {
        title: 'Nueva actividad',
        description: 'Descripción nueva',
        progressStatus: 'IN_PROGRESS',
        result: 'FAILURE',
      },
    });
  });

  it('solo incluye en el resultado los campos presentes', () => {
    expect(parseUpdateActivity({ title: 'Solo título' })).toEqual({ ok: true, value: { title: 'Solo título' } });
    expect(parseUpdateActivity({ progressStatus: 'PENDING' })).toEqual({
      ok: true,
      value: { progressStatus: 'PENDING' },
    });
  });

  it('permite borrar descripción y resultado con null', () => {
    expect(parseUpdateActivity({ description: null, result: null })).toEqual({
      ok: true,
      value: { description: null, result: null },
    });
  });

  it('convierte en null una descripción vacía', () => {
    expect(parseUpdateActivity({ description: '   ' })).toEqual({ ok: true, value: { description: null } });
  });

  it('exige al menos un campo para actualizar', () => {
    expect(updateErrors({})).toEqual(['Debe indicar al menos un campo para actualizar.']);
    expect(updateErrors({ description: undefined })).toEqual(['Debe indicar al menos un campo para actualizar.']);
  });

  it('rechaza cuerpos que no son objetos JSON', () => {
    expect(updateErrors('texto')).toEqual(['El cuerpo debe ser un objeto JSON.']);
  });

  it('acumula todos los errores de los campos incluidos', () => {
    const errors = updateErrors({ title: '   ', description: 42, progressStatus: 'ARCHIVED', result: 'OK' });
    expect(errors).toHaveLength(4);
    expect(errors.join(' ')).toMatch(/title es obligatorio/);
    expect(errors.join(' ')).toMatch(/description debe ser texto/);
    expect(errors.join(' ')).toMatch(/progressStatus no es válido/);
    expect(errors.join(' ')).toMatch(/result no es válido/);
  });

  it('rechaza campos desconocidos', () => {
    expect(updateErrors({ title: 'Válido', ownerId: USER_ID })).toEqual(['Campos no permitidos: ownerId.']);
  });
});

describe('parseApproval', () => {
  it('acepta un estado de aprobación válido', () => {
    expect(parseApproval({ status: 'APPROVED' })).toEqual({ ok: true, value: { status: 'APPROVED' } });
  });

  it('rechaza cuerpos que no son objetos JSON', () => {
    expect(approvalErrors(null)).toEqual(['El cuerpo debe ser un objeto JSON.']);
  });

  it('exige el estado y valida el enumerado', () => {
    expect(approvalErrors({})).toEqual(['status es obligatorio.']);
    expect(approvalErrors({ status: null }).join(' ')).toMatch(/status no es válido/);
    expect(approvalErrors({ status: 'OK' }).join(' ')).toMatch(/status no es válido/);
  });

  it('acumula el error de enumerado con los campos desconocidos', () => {
    expect(approvalErrors({ status: 'OK', note: 'x' })).toEqual([
      'Campos no permitidos: note.',
      'status no es válido. Valores permitidos: PENDING, APPROVED, REJECTED.',
    ]);
  });
});

describe('parseAssignee', () => {
  it('acepta un UUID válido', () => {
    expect(parseAssignee({ userId: USER_ID })).toEqual({ ok: true, value: { userId: USER_ID } });
  });

  it('rechaza cuerpos que no son objetos JSON', () => {
    expect(assigneeErrors([])).toEqual(['El cuerpo debe ser un objeto JSON.']);
  });

  it('exige un UUID válido', () => {
    expect(assigneeErrors({})).toEqual(['userId es obligatorio.']);
    expect(assigneeErrors({ userId: 'no-es-uuid' })).toEqual(['userId debe ser un UUID válido.']);
    expect(assigneeErrors({ userId: 42 })).toEqual(['userId debe ser un UUID válido.']);
  });

  it('rechaza campos desconocidos', () => {
    expect(assigneeErrors({ userId: USER_ID, extra: true })).toEqual(['Campos no permitidos: extra.']);
  });
});

describe('parseAttachmentLink', () => {
  it('acepta enlaces http y https devolviendo el texto recortado original', () => {
    expect(parseAttachmentLink({ url: '  https://example.test/ruta?x=1  ' })).toEqual({
      ok: true,
      value: { url: 'https://example.test/ruta?x=1' },
    });
    expect(parseAttachmentLink({ url: 'HTTPS://Example.TEST/Ruta' })).toEqual({
      ok: true,
      value: { url: 'HTTPS://Example.TEST/Ruta' },
    });
    expect(parseAttachmentLink({ url: 'http://example.test' }).ok).toBe(true);
  });

  it('rechaza cuerpos que no son objetos JSON', () => {
    expect(linkErrors(undefined)).toEqual(['El cuerpo debe ser un objeto JSON.']);
  });

  it('exige la URL', () => {
    for (const input of [{}, { url: '' }, { url: '   ' }, { url: 42 }, { url: null }]) {
      expect(linkErrors(input)).toEqual(['url es obligatoria.']);
    }
  });

  it.each([
    ['esquema javascript', { url: 'javascript:alert(1)' }],
    ['esquema ftp', { url: 'ftp://x' }],
    ['texto sin esquema', { url: 'example.test/ruta' }],
    ['URL relativa', { url: '/ruta/interna' }],
  ])('rechaza enlaces con %s', (_caso, input) => {
    expect(linkErrors(input)).toEqual(['url debe ser un enlace http(s) válido.']);
  });

  it('rechaza URLs demasiado largas', () => {
    const longUrl = `https://example.test/${'a'.repeat(2048)}`;
    expect(linkErrors({ url: longUrl })).toEqual(['url admite como máximo 2048 caracteres.']);
  });

  it('acumula longitud y formato inválido', () => {
    const tooLongAndInvalid = `javascript:${'a'.repeat(3000)}`;
    expect(linkErrors({ url: tooLongAndInvalid })).toEqual([
      'url admite como máximo 2048 caracteres.',
      'url debe ser un enlace http(s) válido.',
    ]);
  });

  it('rechaza campos desconocidos', () => {
    expect(linkErrors({ url: 'https://example.test', kind: 'LINK' })).toEqual([
      'Campos no permitidos: kind.',
    ]);
  });
});
