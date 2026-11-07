import { parseCreateAnnouncement, parseListAnnouncements } from './announcement.dto';

const FACULTY_ID = '3f1b6f1e-9d2a-4c3b-8a7e-0f1d2c3b4a59';
const AREA_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const PROJECT_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

const validAudience = { type: 'ALL' };

const validCreate = {
  title: 'Nueva convocatoria',
  content: 'Contenido de la novedad.',
  audiences: [validAudience],
};

function createErrors(input: unknown): string[] {
  const result = parseCreateAnnouncement(input);
  return result.ok ? [] : result.errors;
}

function listErrors(input: unknown): string[] {
  const result = parseListAnnouncements(input);
  return result.ok ? [] : result.errors;
}

describe('parseCreateAnnouncement', () => {
  it('acepta un cuerpo mínimo, usa NEWS por defecto y recorta title y content', () => {
    expect(
      parseCreateAnnouncement({
        title: '  Nueva convocatoria  ',
        content: '  Contenido de la novedad.  ',
        audiences: [{ type: 'ALL' }],
      }),
    ).toEqual({
      ok: true,
      value: {
        kind: 'NEWS',
        title: 'Nueva convocatoria',
        content: 'Contenido de la novedad.',
        audiences: [{ type: 'ALL' }],
      },
    });
  });

  it('acepta un cuerpo completo con todas las clases de audiencia', () => {
    expect(
      parseCreateAnnouncement({
        kind: 'COMMUNICATION',
        title: 'Aviso',
        content: 'Texto',
        audiences: [
          { type: 'ROLE', role: 'TUTOR' },
          { type: 'FACULTY', facultyId: FACULTY_ID },
          { type: 'AREA', areaId: AREA_ID },
          { type: 'PROJECT', projectId: PROJECT_ID },
        ],
      }),
    ).toEqual({
      ok: true,
      value: {
        kind: 'COMMUNICATION',
        title: 'Aviso',
        content: 'Texto',
        audiences: [
          { type: 'ROLE', role: 'TUTOR' },
          { type: 'FACULTY', facultyId: FACULTY_ID },
          { type: 'AREA', areaId: AREA_ID },
          { type: 'PROJECT', projectId: PROJECT_ID },
        ],
      },
    });
  });

  it('acepta los cuatro tipos de novedad', () => {
    for (const kind of ['NEWS', 'COMMUNICATION', 'CHANGE', 'NOTIFICATION'] as const) {
      expect(parseCreateAnnouncement({ ...validCreate, kind })).toEqual({
        ok: true,
        value: { kind, title: 'Nueva convocatoria', content: 'Contenido de la novedad.', audiences: [{ type: 'ALL' }] },
      });
    }
  });

  it('rechaza cuerpos que no son objetos JSON', () => {
    for (const input of [null, undefined, 'texto', 42, [validCreate]]) {
      expect(createErrors(input)).toEqual(['El cuerpo debe ser un objeto JSON.']);
    }
  });

  it('informa todos los campos obligatorios ausentes a la vez', () => {
    expect(createErrors({})).toEqual([
      'title es obligatorio (máximo 200 caracteres).',
      'content es obligatorio (máximo 5000 caracteres).',
      'audiences debe ser una lista de 1 a 20 audiencias.',
    ]);
  });

  it.each([
    ['kind desconocido', { ...validCreate, kind: 'ALERT' }, /kind no es válido\. Valores permitidos: NEWS, COMMUNICATION, CHANGE, NOTIFICATION\./],
    ['title vacío', { ...validCreate, title: '   ' }, /title es obligatorio \(máximo 200 caracteres\)\./],
    ['title no textual', { ...validCreate, title: 42 }, /title es obligatorio \(máximo 200 caracteres\)\./],
    ['title demasiado largo', { ...validCreate, title: 'a'.repeat(201) }, /title es obligatorio \(máximo 200 caracteres\)\./],
    ['content vacío', { ...validCreate, content: '  ' }, /content es obligatorio \(máximo 5000 caracteres\)\./],
    ['content no textual', { ...validCreate, content: null }, /content es obligatorio \(máximo 5000 caracteres\)\./],
    ['content demasiado largo', { ...validCreate, content: 'a'.repeat(5001) }, /content es obligatorio \(máximo 5000 caracteres\)\./],
    ['campos no permitidos', { ...validCreate, status: 'DRAFT', extra: true }, /Campos no permitidos: status, extra\./],
  ])('rechaza: %s', (_caso, input, pattern) => {
    expect(createErrors(input).join(' ')).toMatch(pattern);
  });

  it('rechaza audiencias que no son listas o que salen del rango 1..20', () => {
    expect(createErrors({ ...validCreate, audiences: 'ALL' })).toEqual([
      'audiences debe ser una lista de 1 a 20 audiencias.',
    ]);
    expect(createErrors({ ...validCreate, audiences: [] })).toEqual([
      'audiences debe ser una lista de 1 a 20 audiencias.',
    ]);
    expect(
      createErrors({ ...validCreate, audiences: Array.from({ length: 21 }, () => ({ type: 'ALL' })) }),
    ).toEqual(['audiences debe ser una lista de 1 a 20 audiencias.']);
  });

  it('rechaza audiencias que no son objetos', () => {
    expect(createErrors({ ...validCreate, audiences: ['ALL', null, 7] })).toEqual([
      'audiences[0] debe ser un objeto.',
      'audiences[1] debe ser un objeto.',
      'audiences[2] debe ser un objeto.',
    ]);
  });

  it('exige un type válido en cada audiencia', () => {
    expect(createErrors({ ...validCreate, audiences: [{}, { type: 'GROUP' }] })).toEqual([
      'audiences[0].type no es válido. Valores permitidos: ALL, ROLE, FACULTY, AREA, PROJECT.',
      'audiences[1].type no es válido. Valores permitidos: ALL, ROLE, FACULTY, AREA, PROJECT.',
    ]);
  });

  it('exige el campo de destino correspondiente a cada tipo', () => {
    expect(createErrors({ ...validCreate, audiences: [{ type: 'ROLE' }] })).toEqual([
      'audiences[0].role es obligatorio.',
    ]);
    expect(createErrors({ ...validCreate, audiences: [{ type: 'FACULTY' }] })).toEqual([
      'audiences[0].facultyId es obligatorio.',
    ]);
    expect(createErrors({ ...validCreate, audiences: [{ type: 'AREA' }] })).toEqual([
      'audiences[0].areaId es obligatorio.',
    ]);
    expect(createErrors({ ...validCreate, audiences: [{ type: 'PROJECT' }] })).toEqual([
      'audiences[0].projectId es obligatorio.',
    ]);
  });

  it('rechaza destinos inválidos', () => {
    expect(createErrors({ ...validCreate, audiences: [{ type: 'ROLE', role: 'OWNER' }] })).toEqual([
      'audiences[0].role no es válido.',
    ]);
    expect(createErrors({ ...validCreate, audiences: [{ type: 'FACULTY', facultyId: 'f-1' }] })).toEqual([
      'audiences[0].facultyId debe ser un UUID.',
    ]);
    expect(createErrors({ ...validCreate, audiences: [{ type: 'AREA', areaId: 42 }] })).toEqual([
      'audiences[0].areaId debe ser un UUID.',
    ]);
    expect(createErrors({ ...validCreate, audiences: [{ type: 'PROJECT', projectId: '' }] })).toEqual([
      'audiences[0].projectId debe ser un UUID.',
    ]);
  });

  it('rechaza campos extra en la audiencia', () => {
    expect(
      createErrors({ ...validCreate, audiences: [{ type: 'ROLE', role: 'TUTOR', facultyId: FACULTY_ID, extra: 1 }] }),
    ).toEqual(['audiences[0]: campos no permitidos: facultyId, extra.']);
    expect(createErrors({ ...validCreate, audiences: [{ type: 'ALL', role: 'TUTOR' }] })).toEqual([
      'audiences[0]: campos no permitidos: role.',
    ]);
  });

  it('elimina audiencias duplicadas conservando el orden', () => {
    expect(
      parseCreateAnnouncement({
        ...validCreate,
        audiences: [
          { type: 'ROLE', role: 'TUTOR' },
          { type: 'ROLE', role: 'ADMIN' },
          { type: 'ROLE', role: 'TUTOR' },
          { type: 'FACULTY', facultyId: FACULTY_ID },
          { type: 'FACULTY', facultyId: FACULTY_ID },
          { type: 'AREA', areaId: AREA_ID },
        ],
      }),
    ).toEqual({
      ok: true,
      value: {
        kind: 'NEWS',
        title: 'Nueva convocatoria',
        content: 'Contenido de la novedad.',
        audiences: [
          { type: 'ROLE', role: 'TUTOR' },
          { type: 'ROLE', role: 'ADMIN' },
          { type: 'FACULTY', facultyId: FACULTY_ID },
          { type: 'AREA', areaId: AREA_ID },
        ],
      },
    });
  });

  it('reduce a ALL cuando alguna audiencia es ALL', () => {
    const result = parseCreateAnnouncement({
      ...validCreate,
      audiences: [
        { type: 'ROLE', role: 'TUTOR' },
        { type: 'ALL' },
        { type: 'FACULTY', facultyId: FACULTY_ID },
      ],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'NEWS',
        title: 'Nueva convocatoria',
        content: 'Contenido de la novedad.',
        audiences: [{ type: 'ALL' }],
      },
    });
  });

  it('acumula todos los errores de varias audiencias', () => {
    const errors = createErrors({
      kind: 'ALERT',
      title: '',
      content: '',
      audiences: [
        'texto',
        { type: 'ROLE' },
        { type: 'FACULTY', facultyId: 'x' },
        { type: 'AREA', areaId: 'y', extra: true },
      ],
      ownerId: PROJECT_ID,
    });
    expect(errors).toHaveLength(9);
    expect(errors.join(' ')).toMatch(/Campos no permitidos: ownerId/);
    expect(errors.join(' ')).toMatch(/kind no es válido/);
    expect(errors.join(' ')).toMatch(/title es obligatorio/);
    expect(errors.join(' ')).toMatch(/content es obligatorio/);
    expect(errors.join(' ')).toMatch(/audiences\[0\] debe ser un objeto/);
    expect(errors.join(' ')).toMatch(/audiences\[1\]\.role es obligatorio/);
    expect(errors.join(' ')).toMatch(/audiences\[2\]\.facultyId debe ser un UUID/);
    expect(errors.join(' ')).toMatch(/audiences\[3\]: campos no permitidos: extra/);
    expect(errors.join(' ')).toMatch(/audiences\[3\]\.areaId debe ser un UUID/);
  });
});

describe('parseListAnnouncements', () => {
  it('trata undefined y null como query vacía y usa limit 50', () => {
    expect(parseListAnnouncements(undefined)).toEqual({ ok: true, value: { limit: 50 } });
    expect(parseListAnnouncements(null)).toEqual({ ok: true, value: { limit: 50 } });
    expect(parseListAnnouncements({})).toEqual({ ok: true, value: { limit: 50 } });
  });

  it('acepta kind, limit y before válidos', () => {
    expect(parseListAnnouncements({ kind: 'CHANGE', limit: '25', before: '2026-11-30T12:00:00.000Z' })).toEqual({
      ok: true,
      value: { kind: 'CHANGE', limit: 25, before: new Date('2026-11-30T12:00:00.000Z') },
    });
  });

  it.each(['1', '50', '100'])('acepta el límite %s', (limit) => {
    const result = parseListAnnouncements({ limit });
    expect(result.ok && result.value.limit).toBe(Number(limit));
  });

  it('rechaza cuerpos de query que no son objetos', () => {
    for (const input of ['kind=NEWS', 42, ['NEWS']]) {
      expect(listErrors(input)).toEqual(['El cuerpo debe ser un objeto JSON.']);
    }
  });

  it.each([
    ['kind desconocido', { kind: 'ALERT' }, /kind no es válido\. Valores permitidos: NEWS, COMMUNICATION, CHANGE, NOTIFICATION\./],
    ['límite cero', { limit: '0' }, /limit debe ser un entero entre 1 y 100\./],
    ['límite alto', { limit: '101' }, /limit debe ser un entero entre 1 y 100\./],
    ['límite negativo', { limit: '-1' }, /limit debe ser un entero entre 1 y 100\./],
    ['límite decimal', { limit: '1.5' }, /limit debe ser un entero entre 1 y 100\./],
    ['límite no numérico', { limit: 'muchos' }, /limit debe ser un entero entre 1 y 100\./],
    ['límite vacío', { limit: '' }, /limit debe ser un entero entre 1 y 100\./],
    ['límite no textual', { limit: 5 }, /limit debe ser un entero entre 1 y 100\./],
    ['before inválido', { before: 'ayer' }, /before debe ser una fecha ISO 8601\./],
    ['before no textual', { before: 20261130 }, /before debe ser una fecha ISO 8601\./],
    ['campos no permitidos', { status: 'ACTIVE', page: '2' }, /Campos no permitidos: status, page\./],
  ])('rechaza: %s', (_caso, query, pattern) => {
    expect(listErrors(query).join(' ')).toMatch(pattern);
  });

  it('acumula todos los errores del query', () => {
    const errors = listErrors({ kind: 'ALERT', limit: '999', before: 'no-fecha', extra: 'x' });
    expect(errors).toHaveLength(4);
  });
});
