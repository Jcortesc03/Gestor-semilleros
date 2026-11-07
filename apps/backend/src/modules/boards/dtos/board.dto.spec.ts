import { parseCreateBoard, parseUpdateBoard } from './board.dto';

const TUTOR_ID = '3f1b6f1e-9d2a-4c3b-8a7e-0f1d2c3b4a59';
const STUDENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const validCreate = {
  title: 'Tablero de prueba',
  dueDate: '2026-11-30',
  responsibleTutorId: TUTOR_ID,
  responsibleStudentId: STUDENT_ID,
};

function createErrors(input: unknown): string[] {
  const result = parseCreateBoard(input);
  return result.ok ? [] : result.errors;
}

function updateErrors(input: unknown): string[] {
  const result = parseUpdateBoard(input);
  return result.ok ? [] : result.errors;
}

describe('parseCreateBoard', () => {
  it('acepta un cuerpo válido y normaliza el título y la fecha', () => {
    expect(parseCreateBoard({ ...validCreate, title: '  Tablero   de prueba  ' })).toEqual({
      ok: true,
      value: {
        title: 'Tablero   de prueba',
        dueDate: new Date('2026-11-30T00:00:00.000Z'),
        responsibleTutorId: TUTOR_ID,
        responsibleStudentId: STUDENT_ID,
      },
    });
  });

  it('rechaza cuerpos que no son objetos JSON', () => {
    for (const input of [null, undefined, 'texto', 42, [validCreate]]) {
      expect(createErrors(input)).toEqual(['El cuerpo debe ser un objeto JSON.']);
    }
  });

  it('informa todos los campos obligatorios ausentes a la vez', () => {
    expect(createErrors({})).toEqual([
      'title es obligatorio.',
      'dueDate es obligatorio.',
      'responsibleTutorId es obligatorio.',
      'responsibleStudentId es obligatorio.',
    ]);
  });

  it.each([
    ['título vacío', { ...validCreate, title: '   ' }, /title es obligatorio/],
    ['título no textual', { ...validCreate, title: 42 }, /title es obligatorio/],
    ['título demasiado largo', { ...validCreate, title: 'a'.repeat(201) }, /title admite como máximo 200 caracteres/],
    ['fecha con formato incorrecto', { ...validCreate, dueDate: '30-11-2026' }, /dueDate debe tener formato AAAA-MM-DD/],
    ['fecha inexistente', { ...validCreate, dueDate: '2026-02-30' }, /dueDate debe tener formato AAAA-MM-DD/],
    ['fecha no textual', { ...validCreate, dueDate: 20261130 }, /dueDate debe tener formato AAAA-MM-DD/],
    ['tutor que no es UUID', { ...validCreate, responsibleTutorId: 'tutor-1' }, /responsibleTutorId debe ser un UUID válido/],
    ['estudiante que no es UUID', { ...validCreate, responsibleStudentId: '' }, /responsibleStudentId debe ser un UUID válido/],
    ['campos no permitidos', { ...validCreate, status: 'ACTIVE', extra: true }, /Campos no permitidos: status, extra\./],
  ])('rechaza: %s', (_caso, input, pattern) => {
    expect(createErrors(input).join(' ')).toMatch(pattern);
  });
});

describe('parseUpdateBoard', () => {
  it('acepta una actualización completa y normaliza sus campos', () => {
    expect(
      parseUpdateBoard({
        title: '  Nuevo título  ',
        dueDate: '2026-12-01',
        progressStatus: 'IN_PROGRESS',
        result: null,
        responsibleTutorId: TUTOR_ID,
        responsibleStudentId: STUDENT_ID,
      }),
    ).toEqual({
      ok: true,
      value: {
        title: 'Nuevo título',
        dueDate: new Date('2026-12-01T00:00:00.000Z'),
        progressStatus: 'IN_PROGRESS',
        result: null,
        responsibleTutorId: TUTOR_ID,
        responsibleStudentId: STUDENT_ID,
      },
    });
  });

  it('solo incluye en el resultado los campos presentes', () => {
    expect(parseUpdateBoard({ progressStatus: 'DONE' })).toEqual({ ok: true, value: { progressStatus: 'DONE' } });
    expect(parseUpdateBoard({ result: 'SUCCESS' })).toEqual({ ok: true, value: { result: 'SUCCESS' } });
  });

  it('permite borrar el resultado con null', () => {
    expect(parseUpdateBoard({ result: null })).toEqual({ ok: true, value: { result: null } });
  });

  it('exige al menos un campo para actualizar', () => {
    expect(updateErrors({})).toEqual(['Debe indicar al menos un campo para actualizar.']);
    expect(updateErrors({ title: undefined })).toEqual(['Debe indicar al menos un campo para actualizar.']);
  });

  it('rechaza cuerpos que no son objetos JSON', () => {
    expect(updateErrors(null)).toEqual(['El cuerpo debe ser un objeto JSON.']);
    expect(updateErrors([])).toEqual(['El cuerpo debe ser un objeto JSON.']);
  });

  it('acumula todos los errores de los campos incluidos', () => {
    const errors = updateErrors({
      title: '   ',
      dueDate: '2026/12/01',
      progressStatus: 'ARCHIVED',
      result: 'OK',
      responsibleTutorId: 'x',
      responsibleStudentId: 7,
    });
    expect(errors).toHaveLength(6);
    expect(errors.join(' ')).toMatch(/title es obligatorio/);
    expect(errors.join(' ')).toMatch(/dueDate debe tener formato AAAA-MM-DD/);
    expect(errors.join(' ')).toMatch(/progressStatus no es válido/);
    expect(errors.join(' ')).toMatch(/result no es válido/);
    expect(errors.join(' ')).toMatch(/responsibleTutorId debe ser un UUID válido/);
    expect(errors.join(' ')).toMatch(/responsibleStudentId debe ser un UUID válido/);
  });

  it('rechaza campos desconocidos', () => {
    expect(updateErrors({ title: 'Válido', ownerId: TUTOR_ID })).toEqual([
      'Campos no permitidos: ownerId.',
    ]);
  });
});
