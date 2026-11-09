import { normalizeForSearch } from '../../../common/utils/text';
import type { EnrollmentAreaType, EnrollmentDocumentType, EnrollmentFaculty } from '../../../generated/prisma/enums';

const AFFIRMATIVE_TOKENS = new Set(['si', 'yes', 'true', '1', 'acepto', 'autorizo']);
const NEGATIVE_TOKENS = new Set(['no', 'false', '0']);

function isAffirmativeConsent(value: string): boolean {
  const normalized = normalizeForSearch(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (!normalized) return false;
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens[0] === 'no') return false;
  if (tokens.some((token) => NEGATIVE_TOKENS.has(token))) return false;
  return tokens.some((token) => AFFIRMATIVE_TOKENS.has(token));
}

export const FACULTY_LABELS: Record<string, EnrollmentFaculty> = {
  'systems_engineering': 'SYSTEMS_ENGINEERING',
  'system_engineering': 'SYSTEMS_ENGINEERING',
  'ingenieria de sistemas': 'SYSTEMS_ENGINEERING',
  'ingeniería de sistemas': 'SYSTEMS_ENGINEERING',
  'software_engineering': 'SOFTWARE_ENGINEERING',
  'ingenieria de software': 'SOFTWARE_ENGINEERING',
  'ingeniería de software': 'SOFTWARE_ENGINEERING',
};

export const DOCUMENT_LABELS: Record<string, EnrollmentDocumentType> = {
  cc: 'CC',
  'c.c.': 'CC',
  cedula: 'CC',
  cédula: 'CC',
  ti: 'TI',
  't.i.': 'TI',
  tarjeta: 'TI',
};

export interface NormalizedRow {
  sourceRow: number;
  firstNames: string;
  lastNames: string;
  email: string;
  documentType: EnrollmentDocumentType | null;
  documentNumber: string;
  faculty: EnrollmentFaculty | null;
  areaType: EnrollmentAreaType;
  outsideArea: boolean;
  period: string;
  consent: boolean;
  errors: string[];
  duplicate: boolean;
  raw: string[];
}

const HEADER_MAP: Record<string, string> = {
  'nombres': 'firstNames',
  'nombre': 'firstNames',
  'apellidos': 'lastNames',
  'apellido': 'lastNames',
  'primer nombre': 'firstName',
  'segundo nombre': 'middleName',
  'primer apellido': 'firstSurname',
  'segundo apellido': 'secondSurname',
  'correo electronico': 'email',
  'correo electrónico': 'email',
  'correo': 'email',
  'email': 'email',
  'tipo de documento': 'documentType',
  'tipo documento': 'documentType',
  'numero de documento': 'documentNumber',
  'número de documento': 'documentNumber',
  'numero documento': 'documentNumber',
  'número documento': 'documentNumber',
  'documento': 'documentNumber',
  'facultad': 'faculty',
  'area': 'area',
  'área': 'area',
  'periodo de inscripcion': 'period',
  'periodo de inscripción': 'period',
  'periodo': 'period',
  'período de inscripción': 'period',
  'período': 'period',
  'autorizacion de tratamiento de datos': 'consent',
  'autorización de tratamiento de datos': 'consent',
  'autorizacion tratamiento de datos': 'consent',
  'consentimiento': 'consent',
  'marca temporal': 'timestamp',
  'timestamp': 'timestamp',
};

export function normalizeHeader(header: string): string {
  return normalizeForSearch(header.trim().replace(/\s+/g, ' '));
}

export function mapHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, idx) => {
    const key = HEADER_MAP[normalizeHeader(h)];
    if (key && !(key in map)) map[key] = idx;
  });
  return map;
}

export function isTimestampHeader(header: string): boolean {
  const n = normalizeHeader(header);
  return n === 'marca temporal' || n === 'timestamp' || n === 'fecha' || n === 'fechahora';
}

export function normalizeRow(raw: string[], headerMap: Record<string, number>, areaType: EnrollmentAreaType, sourceRow: number): NormalizedRow {
  const get = (key: string): string => {
    const idx = headerMap[key];
    if (idx === undefined) return '';
    const v = raw[idx];
    return v === null || v === undefined ? '' : String(v).trim();
  };

  const firstNames = headerMap.firstNames !== undefined
    ? get('firstNames')
    : [get('firstName'), get('middleName')].filter(Boolean).join(' ');
  const lastNames = headerMap.lastNames !== undefined
    ? get('lastNames')
    : [get('firstSurname'), get('secondSurname')].filter(Boolean).join(' ');
  const email = get('email').toLowerCase();
  const docTypeRaw = get('documentType');
  const documentNumber = get('documentNumber');
  const facultyRaw = get('faculty');
  const areaRaw = normalizeForSearch(get('area'));
  const period = get('period');
  const consentRaw = get('consent');

  const errors: string[] = [];
  if (!firstNames) errors.push('Nombres es obligatorio.');
  if (!lastNames) errors.push('Apellidos es obligatorio.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Correo electrónico inválido.');
  let documentType: EnrollmentDocumentType | null = null;
  const dtNorm = docTypeRaw.toLowerCase().replace(/\./g, '').trim();
  if (DOCUMENT_LABELS[dtNorm]) documentType = DOCUMENT_LABELS[dtNorm];
  else if (DOCUMENT_LABELS[docTypeRaw.toLowerCase()]) documentType = DOCUMENT_LABELS[docTypeRaw.toLowerCase()];
  if (!documentType) errors.push('Tipo de documento debe ser CC o TI.');
  if (!documentNumber || !/^\d+$/.test(documentNumber)) errors.push('Número de documento debe ser texto de dígitos.');
  let faculty: EnrollmentFaculty | null = null;
  const fNorm = normalizeForSearch(facultyRaw);
  if (FACULTY_LABELS[fNorm.replace(/\s+/g, ' ')]) faculty = FACULTY_LABELS[fNorm.replace(/\s+/g, ' ')];
  else if (FACULTY_LABELS[facultyRaw]) faculty = FACULTY_LABELS[facultyRaw];
  // also try direct enum
  if (!faculty && (facultyRaw === 'SYSTEMS_ENGINEERING' || facultyRaw === 'SOFTWARE_ENGINEERING')) faculty = facultyRaw as EnrollmentFaculty;
  if (!faculty) errors.push('Facultad debe ser Ingeniería de Sistemas o Ingeniería de Software.');
  const providedArea = areaRaw === 'semillero' ? 'SEEDLING'
    : areaRaw === 'proyecto de grado' ? 'DEGREE_PROJECT' : null;
  const outsideArea = providedArea !== null && providedArea !== areaType;
  if (!providedArea) errors.push('Área debe ser Semillero o Proyecto de grado.');
  else if (outsideArea) errors.push('El área de la respuesta no corresponde a la fuente seleccionada.');
  if (!period) errors.push('Período de inscripción es obligatorio.');
  const consent = isAffirmativeConsent(consentRaw);
  if (!consent) errors.push('Autorización de tratamiento de datos debe ser afirmativa.');

  return {
    sourceRow,
    firstNames,
    lastNames,
    email,
    documentType,
    documentNumber,
    faculty,
    areaType,
    outsideArea,
    period,
    consent,
    errors,
    duplicate: false,
    raw,
  };
}

export function parseSheet(headers: string[], rows: string[][], areaType: EnrollmentAreaType): { headerMap: Record<string, number>; normalized: NormalizedRow[] } {
  const headerMap = mapHeaders(headers);
  const required = ['firstNames', 'lastNames', 'email', 'documentType', 'documentNumber', 'faculty', 'period', 'consent'];
  // missing headers -> errors added per row? We'll just map; rows will error.
  const normalized: NormalizedRow[] = [];
  rows.forEach((row, idx) => {
    // skip completely empty rows
    if (row.every((c) => String(c ?? '').trim() === '')) return;
    normalized.push(normalizeRow(row, headerMap, areaType, idx + 2)); // +2: header row + 1-based
  });
  return { headerMap, normalized };
}
