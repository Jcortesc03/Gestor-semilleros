import { parseCreateProject, parseUpdateProject } from './project.dto';

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const AREA_ID = uuid(1);
const FACULTY_A = uuid(2);
const FACULTY_B = uuid(3);

const validCreate = {
  title: 'Semillero de IA',
  description: 'Proyecto de investigación',
  areaId: AREA_ID,
  facultyIds: [FACULTY_A, FACULTY_B],
  startsOn: '2026-01-15',
  endsOn: '2026-06-30',
};

const TITLE_ERROR = 'title es obligatorio (máximo 200 caracteres).';
const AREA_ERROR = 'areaId debe ser un UUID.';
const FACULTY_ERROR = 'facultyIds debe ser una lista con al menos un UUID de facultad.';
const DATE_ORDER_ERROR = 'endsOn no puede ser anterior a startsOn.';
const NO_FIELDS_ERROR = 'Debe indicar al menos un campo para actualizar.';

function createErrorsOf(input: unknown): string[] {
  const result = parseCreateProject(input);
  return result.ok ? [] : result.errors;
}

function updateErrorsOf(input: unknown): string[] {
  const result = parseUpdateProject(input);
  return result.ok ? [] : result.errors;
}

describe('parseCreateProject', () => {
  it('acepta un cuerpo válido y normaliza título, descripción, facultades y fechas', () => {
    expect(
      parseCreateProject({
        title: '  Semillero   de IA  ',
        description: '  Proyecto de investigación  ',
        areaId: AREA_ID,
        facultyIds: [FACULTY_A, FACULTY_B, FACULTY_A],
        startsOn: '2026-01-15',
        endsOn: '2026-06-30',
      }),
    ).toEqual({
      ok: true,
      value: {
        title: 'Semillero   de IA',
        description: 'Proyecto de investigación',
        areaId: AREA_ID,
        facultyIds: [FACULTY_A, FACULTY_B],
        startsOn: new Date('2026-01-15T00:00:00.000Z'),
        endsOn: new Date('2026-06-30T00:00:00.000Z'),
      },
    });
  });

  it('convierte en null los campos opcionales ausentes', () => {
    expect(parseCreateProject({ title: 'Proyecto', areaId: AREA_ID, facultyIds: [FACULTY_A] })).toEqual({
      ok: true,
      value: {
        title: 'Proyecto',
        description: null,
        areaId: AREA_ID,
        facultyIds: [FACULTY_A],
        startsOn: null,
        endsOn: null,
      },
    });
  });

  it('convierte en null una descripción vacía o null y acepta null en las fechas', () => {
    const blank = parseCreateProject({ ...validCreate, description: '   ' });
    expect(blank.ok && blank.value.description).toBeNull();

    const explicitNull = parseCreateProject({ ...validCreate, description: null, startsOn: null, endsOn: null });
    expect(explicitNull.ok && explicitNull.value).toMatchObject({ description: null, startsOn: null, endsOn: null });
  });

  it('permite que endsOn sea igual a startsOn', () => {
    expect(parseCreateProject({ ...validCreate, startsOn: '2026-03-01', endsOn: '2026-03-01' }).ok).toBe(true);
  });

  it('elimina facultades duplicadas conservando el orden', () => {
    const result = parseCreateProject({ ...validCreate, facultyIds: [FACULTY_B, FACULTY_A, FACULTY_B] });
    expect(result.ok && result.value.facultyIds).toEqual([FACULTY_B, FACULTY_A]);
  });

  it('rechaza cuerpos que no son objetos', () => {
    expect(createErrorsOf(null)).toEqual(['El cuerpo debe ser un objeto JSON.']);
    expect(createErrorsOf([])).toEqual(['El cuerpo debe ser un objeto JSON.']);
    expect(createErrorsOf('texto')).toEqual(['El cuerpo debe ser un objeto JSON.']);
  });

  it('acumula todos los errores en orden', () => {
    expect(createErrorsOf({})).toEqual([TITLE_ERROR, AREA_ERROR, FACULTY_ERROR]);
  });

  it.each([
    ['título ausente', { ...validCreate, title: undefined }, /title es obligatorio/],
    ['título vacío', { ...validCreate, title: '   ' }, /title es obligatorio/],
    ['título demasiado largo', { ...validCreate, title: 'a'.repeat(201) }, /title es obligatorio/],
    ['título no textual', { ...validCreate, title: 123 }, /title es obligatorio/],
    ['descripción no textual', { ...validCreate, description: 42 }, /description debe ser texto/],
    ['descripción demasiado larga', { ...validCreate, description: 'a'.repeat(5001) }, /máximo 5000/],
    ['areaId ausente', { ...validCreate, areaId: undefined }, /areaId debe ser un UUID/],
    ['areaId inválido', { ...validCreate, areaId: 'area-1' }, /areaId debe ser un UUID/],
    ['facultyIds ausente', { ...validCreate, facultyIds: undefined }, /facultyIds debe ser una lista/],
    ['facultyIds vacío', { ...validCreate, facultyIds: [] }, /facultyIds debe ser una lista/],
    ['facultyIds con un valor inválido', { ...validCreate, facultyIds: [FACULTY_A, 'no-uuid'] }, /facultyIds debe ser una lista/],
    ['startsOn con formato incorrecto', { ...validCreate, startsOn: '15-01-2026' }, /startsOn debe ser una fecha válida/],
    ['endsOn con fecha inexistente', { ...validCreate, endsOn: '2026-02-30' }, /endsOn debe ser una fecha válida/],
  ])('rechaza: %s', (_caso, input, pattern) => {
    expect(createErrorsOf(input).join(' ')).toMatch(pattern);
  });

  it('rechaza un rango de fechas invertido', () => {
    expect(createErrorsOf({ ...validCreate, startsOn: '2026-06-30', endsOn: '2026-01-15' })).toEqual([DATE_ORDER_ERROR]);
  });

  it('rechaza campos no permitidos', () => {
    expect(createErrorsOf({ ...validCreate, status: 'ACTIVE', extra: true })).toEqual([
      'Campos no permitidos: status, extra.',
    ]);
  });

  it('acumula errores de campos y de campos desconocidos', () => {
    expect(createErrorsOf({ title: '', areaId: 'x', facultyIds: [], unknown: 1 })).toEqual([
      'Campos no permitidos: unknown.',
      TITLE_ERROR,
      AREA_ERROR,
      FACULTY_ERROR,
    ]);
  });
});

describe('parseUpdateProject', () => {
  it('normaliza solo los campos presentes', () => {
    expect(
      parseUpdateProject({
        title: '  Nuevo título  ',
        description: '  Nueva descripción  ',
        facultyIds: [FACULTY_B, FACULTY_B],
        status: 'FINISHED',
      }),
    ).toEqual({
      ok: true,
      value: {
        title: 'Nuevo título',
        description: 'Nueva descripción',
        facultyIds: [FACULTY_B],
        status: 'FINISHED',
      },
    });
  });

  it('acepta null explícito en description y en las fechas', () => {
    expect(parseUpdateProject({ description: null, startsOn: null, endsOn: null })).toEqual({
      ok: true,
      value: { description: null, startsOn: null, endsOn: null },
    });
  });

  it('convierte en null una descripción vacía', () => {
    expect(parseUpdateProject({ description: '   ' })).toEqual({ ok: true, value: { description: null } });
  });

  it('acepta cualquiera de los campos editables por separado', () => {
    expect(parseUpdateProject({ areaId: AREA_ID })).toEqual({ ok: true, value: { areaId: AREA_ID } });
    expect(parseUpdateProject({ startsOn: '2026-02-01' })).toEqual({
      ok: true,
      value: { startsOn: new Date('2026-02-01T00:00:00.000Z') },
    });
    expect(parseUpdateProject({ status: 'CANCELLED' })).toEqual({ ok: true, value: { status: 'CANCELLED' } });
  });

  it('no exige orden de fechas cuando solo viene una', () => {
    expect(parseUpdateProject({ endsOn: '2020-01-01' }).ok).toBe(true);
    expect(parseUpdateProject({ startsOn: '2030-01-01' }).ok).toBe(true);
  });

  it('valida el orden de fechas solo si ambas vienen en el cuerpo', () => {
    expect(updateErrorsOf({ startsOn: '2026-06-30', endsOn: '2026-01-15' })).toEqual([DATE_ORDER_ERROR]);
    expect(parseUpdateProject({ startsOn: '2026-06-30', endsOn: '2026-06-30' }).ok).toBe(true);
  });

  it('rechaza un cuerpo vacío', () => {
    expect(updateErrorsOf({})).toEqual([NO_FIELDS_ERROR]);
  });

  it('ignora los campos con valor undefined y exige al menos uno', () => {
    expect(updateErrorsOf({ title: undefined, description: undefined })).toEqual([NO_FIELDS_ERROR]);
  });

  it('acumula el error de cuerpo vacío con el de campos desconocidos', () => {
    expect(updateErrorsOf({ foo: 1 })).toEqual(['Campos no permitidos: foo.', NO_FIELDS_ERROR]);
  });

  it('rechaza cuerpos que no son objetos', () => {
    expect(updateErrorsOf(null)).toEqual(['El cuerpo debe ser un objeto JSON.']);
    expect(updateErrorsOf([])).toEqual(['El cuerpo debe ser un objeto JSON.']);
  });

  it('acumula todos los errores de campos', () => {
    expect(updateErrorsOf({ title: '   ', areaId: 'no-uuid', facultyIds: [], status: 'ARCHIVED' })).toEqual([
      TITLE_ERROR,
      AREA_ERROR,
      FACULTY_ERROR,
      'status debe ser uno de: ACTIVE, FINISHED, CANCELLED.',
    ]);
  });

  it.each([
    ['título demasiado largo', { title: 'a'.repeat(201) }, /title es obligatorio/],
    ['descripción demasiado larga', { description: 'a'.repeat(5001) }, /máximo 5000/],
    ['descripción no textual', { description: 42 }, /description debe ser texto/],
    ['facultyIds vacío', { facultyIds: [] }, /facultyIds debe ser una lista/],
    ['facultyIds inválido', { facultyIds: ['no-uuid'] }, /facultyIds debe ser una lista/],
    ['startsOn inválido', { startsOn: '2026/01/15' }, /startsOn debe ser una fecha válida/],
    ['endsOn inválido', { endsOn: 'ayer' }, /endsOn debe ser una fecha válida/],
    ['status inválido', { status: 'PAUSED' }, /status debe ser uno de/],
    ['campo desconocido junto a uno válido', { title: 'Proyecto', area: 'x' }, /Campos no permitidos: area/],
  ])('rechaza: %s', (_caso, input, pattern) => {
    expect(updateErrorsOf(input).join(' ')).toMatch(pattern);
  });
});
