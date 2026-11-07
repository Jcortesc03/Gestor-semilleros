import { parseAddMember, parseUpdateMember } from './member.dto';

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const USER_ID = uuid(10);
const OTHER_USER_ID = uuid(11);

const USER_ID_ERROR = 'userId debe ser un UUID.';
const PROJECT_ROLE_ERROR = 'projectRole debe ser uno de: TUTOR, STUDENT, STUDENT_LEADER.';
const PRIMARY_ERROR = 'Solo un tutor puede ser principal.';
const UPDATE_ROLE_ERROR = 'projectRole solo puede cambiar entre STUDENT y STUDENT_LEADER.';
const IS_PRIMARY_ERROR = 'isPrimary debe ser un booleano.';
const NO_FIELDS_ERROR = 'Debe indicar al menos un campo para actualizar.';

function addErrorsOf(input: unknown): string[] {
  const result = parseAddMember(input);
  return result.ok ? [] : result.errors;
}

function updateErrorsOf(input: unknown): string[] {
  const result = parseUpdateMember(input);
  return result.ok ? [] : result.errors;
}

describe('parseAddMember', () => {
  it('acepta un tutor principal', () => {
    expect(parseAddMember({ userId: USER_ID, projectRole: 'TUTOR', isPrimary: true })).toEqual({
      ok: true,
      value: { userId: USER_ID, projectRole: 'TUTOR', isPrimary: true },
    });
  });

  it('acepta un estudiante y asigna isPrimary=false por defecto', () => {
    expect(parseAddMember({ userId: USER_ID, projectRole: 'STUDENT' })).toEqual({
      ok: true,
      value: { userId: USER_ID, projectRole: 'STUDENT', isPrimary: false },
    });
  });

  it('acepta STUDENT_LEADER no principal', () => {
    expect(parseAddMember({ userId: OTHER_USER_ID, projectRole: 'STUDENT_LEADER', isPrimary: false })).toEqual({
      ok: true,
      value: { userId: OTHER_USER_ID, projectRole: 'STUDENT_LEADER', isPrimary: false },
    });
  });

  it('rechaza cuerpos que no son objetos', () => {
    expect(addErrorsOf(null)).toEqual(['El cuerpo debe ser un objeto JSON.']);
    expect(addErrorsOf([])).toEqual(['El cuerpo debe ser un objeto JSON.']);
  });

  it('acumula todos los errores en orden', () => {
    expect(addErrorsOf({})).toEqual([USER_ID_ERROR, PROJECT_ROLE_ERROR]);
  });

  it('exige un tutor cuando isPrimary es true', () => {
    expect(addErrorsOf({ userId: USER_ID, projectRole: 'STUDENT', isPrimary: true })).toEqual([PRIMARY_ERROR]);
    expect(addErrorsOf({ userId: USER_ID, projectRole: 'STUDENT_LEADER', isPrimary: true })).toEqual([PRIMARY_ERROR]);
  });

  it.each([
    ['userId ausente', { userId: undefined, projectRole: 'TUTOR' }, /userId debe ser un UUID/],
    ['userId inválido', { userId: 'usuario-1', projectRole: 'TUTOR' }, /userId debe ser un UUID/],
    ['projectRole ausente', { userId: USER_ID }, /projectRole debe ser uno de/],
    ['projectRole inválido', { userId: USER_ID, projectRole: 'ADMIN' }, /projectRole debe ser uno de/],
    ['isPrimary no booleano', { userId: USER_ID, projectRole: 'TUTOR', isPrimary: 'sí' }, /isPrimary debe ser un booleano/],
    ['isPrimary null', { userId: USER_ID, projectRole: 'TUTOR', isPrimary: null }, /isPrimary debe ser un booleano/],
  ])('rechaza: %s', (_caso, input, pattern) => {
    expect(addErrorsOf(input).join(' ')).toMatch(pattern);
  });

  it('rechaza campos no permitidos', () => {
    expect(addErrorsOf({ userId: USER_ID, projectRole: 'TUTOR', status: 'ACTIVE' })).toEqual([
      'Campos no permitidos: status.',
    ]);
  });

  it('acumula errores de campos, de regla de negocio y de campos desconocidos', () => {
    expect(addErrorsOf({ userId: 'x', isPrimary: true, extra: 1 })).toEqual([
      'Campos no permitidos: extra.',
      USER_ID_ERROR,
      PROJECT_ROLE_ERROR,
      PRIMARY_ERROR,
    ]);
  });
});

describe('parseUpdateMember', () => {
  it('acepta STUDENT y isPrimary', () => {
    expect(parseUpdateMember({ projectRole: 'STUDENT', isPrimary: true })).toEqual({
      ok: true,
      value: { projectRole: 'STUDENT', isPrimary: true },
    });
  });

  it('acepta STUDENT_LEADER', () => {
    expect(parseUpdateMember({ projectRole: 'STUDENT_LEADER' })).toEqual({
      ok: true,
      value: { projectRole: 'STUDENT_LEADER' },
    });
  });

  it('acepta isPrimary=false por separado', () => {
    expect(parseUpdateMember({ isPrimary: false })).toEqual({ ok: true, value: { isPrimary: false } });
  });

  it('rechaza cambiar el rol a TUTOR', () => {
    expect(updateErrorsOf({ projectRole: 'TUTOR' })).toEqual([UPDATE_ROLE_ERROR]);
  });

  it('rechaza projectRole desconocido', () => {
    expect(updateErrorsOf({ projectRole: 'ADMIN' })).toEqual([UPDATE_ROLE_ERROR]);
  });

  it('rechaza un cuerpo vacío', () => {
    expect(updateErrorsOf({})).toEqual([NO_FIELDS_ERROR]);
  });

  it('ignora los campos con valor undefined y exige al menos uno', () => {
    expect(updateErrorsOf({ projectRole: undefined, isPrimary: undefined })).toEqual([NO_FIELDS_ERROR]);
  });

  it('acumula el error de cuerpo vacío con el de campos desconocidos', () => {
    expect(updateErrorsOf({ status: 'ACTIVE' })).toEqual(['Campos no permitidos: status.', NO_FIELDS_ERROR]);
  });

  it('rechaza cuerpos que no son objetos', () => {
    expect(updateErrorsOf(null)).toEqual(['El cuerpo debe ser un objeto JSON.']);
    expect(updateErrorsOf([])).toEqual(['El cuerpo debe ser un objeto JSON.']);
  });

  it('acumula todos los errores de campos', () => {
    expect(updateErrorsOf({ projectRole: 'TUTOR', isPrimary: 'sí' })).toEqual([UPDATE_ROLE_ERROR, IS_PRIMARY_ERROR]);
  });

  it('rechaza isPrimary no booleano', () => {
    expect(updateErrorsOf({ isPrimary: 1 })).toEqual([IS_PRIMARY_ERROR]);
  });
});
