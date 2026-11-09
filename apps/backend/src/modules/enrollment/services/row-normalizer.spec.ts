import { normalizeRow, parseSheet } from './row-normalizer';
import type { EnrollmentAreaType } from '../../../generated/prisma/enums';

const HEADERS = [
  'Nombres',
  'Apellidos',
  'Correo electrónico',
  'Tipo de documento',
  'Número de documento',
  'Facultad',
  'Área',
  'Período de inscripción',
  'Autorización de tratamiento de datos',
];
const ROW = ['Ana', 'Pérez', 'ana@example.test', 'CC', '00123', 'Ingeniería de Sistemas', 'Semillero', '2026-1'];

describe('autorización de tratamiento de datos', () => {
  it.each([
    'Sí',
    'Sí, acepto y autorizo el tratamiento de mis datos',
    'Autorizo el tratamiento de datos',
    'Acepto el tratamiento de datos',
  ])('acepta la respuesta afirmativa %s', (consent) => {
    const { normalized } = parseSheet(HEADERS, [[...ROW, consent]], 'SEEDLING' as EnrollmentAreaType);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].consent).toBe(true);
    expect(normalized[0].errors).not.toContain('Autorización de tratamiento de datos debe ser afirmativa.');
  });

  it.each(['No', 'No acepto y no autorizo el tratamiento de datos', ''])('rechaza la respuesta no afirmativa %s', (consent) => {
    const { normalized } = parseSheet(HEADERS, [[...ROW, consent]], 'SEEDLING' as EnrollmentAreaType);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].consent).toBe(false);
    expect(normalized[0].errors).toContain('Autorización de tratamiento de datos debe ser afirmativa.');
  });

  it('mantiene el contrato de fila completa', () => {
    const { headerMap } = parseSheet(HEADERS, [], 'SEEDLING' as EnrollmentAreaType);
    const row = normalizeRow([...ROW, 'Sí, acepto'], headerMap, 'SEEDLING' as EnrollmentAreaType, 2);
    expect(row.firstNames).toBe('Ana');
    expect(row.lastNames).toBe('Pérez');
    expect(row.documentNumber).toBe('00123');
  });
});
