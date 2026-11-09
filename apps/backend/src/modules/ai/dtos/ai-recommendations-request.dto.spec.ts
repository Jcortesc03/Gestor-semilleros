import { AI_DEFAULTS, AI_LIMITS, parseAiRecommendationsRequest, type AiRecommendationsRequest } from './ai-recommendations-request.dto';

const UUID = '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b';

const EMPTY_FILTERS = {
  from: null,
  to: null,
  areaId: null,
  facultyId: null,
  projectId: null,
  tutorId: null,
  projectStatus: null,
};

/** Devuelve los errores de una entrada inválida; falla la prueba si la entrada es válida. */
function errorsOf(input: unknown): string[] {
  const result = parseAiRecommendationsRequest(input);
  if (result.ok) throw new Error('Se esperaba una entrada inválida.');
  return result.errors;
}

/** Devuelve el valor de una entrada válida; falla la prueba si la entrada es inválida. */
function valueOf(input: unknown): AiRecommendationsRequest {
  const result = parseAiRecommendationsRequest(input);
  if (!result.ok) throw new Error(`Se esperaba una entrada válida: ${result.errors.join(' | ')}`);
  return result.value;
}

describe('parseAiRecommendationsRequest', () => {
  it('un cuerpo vacío o undefined usa los valores por defecto', () => {
    const expected = {
      filters: EMPTY_FILTERS,
      focuses: ['GENERAL'],
      depth: 'STANDARD',
      style: 'EXECUTIVE',
      perspective: null,
      maxRecommendations: 5,
      rankingSize: 5,
      minSample: 5,
      includeComparison: true,
      includeMonthly: true,
      includeWeekdays: false,
      anonymize: true,
      question: null,
      refresh: false,
    };

    expect(valueOf(undefined)).toEqual(expected);
    expect(valueOf({})).toEqual(expected);
    expect(AI_DEFAULTS).toMatchObject({ focuses: ['GENERAL'], depth: 'STANDARD', style: 'EXECUTIVE', anonymize: true });
  });

  it('acepta filtros de analítica válidos y los normaliza', () => {
    const value = valueOf({
      from: '2026-01-01',
      to: '2026-06-30',
      areaId: UUID.toUpperCase(),
      projectStatus: 'ACTIVE',
    });

    expect(value.filters).toEqual({ ...EMPTY_FILTERS, from: '2026-01-01', to: '2026-06-30', areaId: UUID, projectStatus: 'ACTIVE' });
  });

  it('ignora los filtros vacíos (cadena vacía o null)', () => {
    const value = valueOf({ from: '', to: null, areaId: '', facultyId: null, projectId: '', tutorId: null, projectStatus: '' });

    expect(value.filters).toEqual(EMPTY_FILTERS);
  });

  it('rechaza campos desconocidos', () => {
    expect(errorsOf({ foo: 1, limit: 5 })).toContain('Campos no permitidos: foo, limit.');
  });

  it('rechaza un cuerpo que no es objeto', () => {
    expect(errorsOf([])).toEqual(['El cuerpo de la petición debe ser un objeto JSON.']);
    expect(errorsOf('texto')).toEqual(['El cuerpo de la petición debe ser un objeto JSON.']);
  });

  describe('focuses', () => {
    it('rechaza una lista vacía', () => {
      expect(errorsOf({ focuses: [] })).toEqual([`focuses debe ser una lista de 1 a ${AI_LIMITS.maxFocuses} enfoques.`]);
    });

    it('rechaza más de 4 enfoques', () => {
      expect(errorsOf({ focuses: ['GENERAL', 'ACTIVITIES', 'TUTORS', 'UNITS', 'TRENDS'] })).toEqual([
        `focuses debe ser una lista de 1 a ${AI_LIMITS.maxFocuses} enfoques.`,
      ]);
    });

    it('rechaza un valor que no es lista', () => {
      expect(errorsOf({ focuses: 'GENERAL' })).toEqual([`focuses debe ser una lista de 1 a ${AI_LIMITS.maxFocuses} enfoques.`]);
    });

    it('rechaza un enfoque inválido', () => {
      const errors = errorsOf({ focuses: ['GENERAL', 'INVENTADO'] });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/^Cada enfoque debe ser uno de: GENERAL, ACTIVITIES/);
    });

    it('deduplica los enfoques conservando el orden', () => {
      expect(valueOf({ focuses: ['ACTIVITIES', 'TUTORS', 'ACTIVITIES'] }).focuses).toEqual(['ACTIVITIES', 'TUTORS']);
    });

    it('acepta exactamente 4 enfoques', () => {
      expect(valueOf({ focuses: ['GENERAL', 'ACTIVITIES', 'TUTORS', 'UNITS'] }).focuses).toHaveLength(4);
    });
  });

  describe('enumerados', () => {
    it('rechaza depth, style y perspective inválidos', () => {
      expect(errorsOf({ depth: 'LARGO' })).toEqual(['depth debe ser uno de: BRIEF, STANDARD, DETAILED.']);
      expect(errorsOf({ style: 'FORMAL' })).toEqual(['style debe ser uno de: EXECUTIVE, OPERATIONAL, ACADEMIC.']);
      expect(errorsOf({ perspective: 'ESTUDIANTE' })).toEqual(['perspective debe ser uno de: ADMIN, AREA_MANAGER, DEAN.']);
    });

    it('acepta perspective null y los roles válidos', () => {
      expect(valueOf({ perspective: null }).perspective).toBeNull();
      expect(valueOf({ perspective: 'DEAN' }).perspective).toBe('DEAN');
    });
  });

  describe('enteros', () => {
    it.each([
      ['maxRecommendations', 0, 'un entero entre 1 y 10'],
      ['maxRecommendations', 11, 'un entero entre 1 y 10'],
      ['maxRecommendations', 2.5, 'un entero entre 1 y 10'],
      ['maxRecommendations', '5', 'un entero entre 1 y 10'],
      ['rankingSize', -1, 'un entero entre 0 y 10'],
      ['rankingSize', 11, 'un entero entre 0 y 10'],
      ['minSample', 0, 'un entero entre 1 y 50'],
      ['minSample', 51, 'un entero entre 1 y 50'],
      ['minSample', 3.5, 'un entero entre 1 y 50'],
    ])('rechaza %s = %p', (key, value, mensaje) => {
      expect(errorsOf({ [key]: value })).toEqual([`${key} debe ser ${mensaje}.`]);
    });

    it('acepta los límites inclusivos', () => {
      const value = valueOf({ maxRecommendations: 10, rankingSize: 0, minSample: 1 });
      expect(value).toMatchObject({ maxRecommendations: 10, rankingSize: 0, minSample: 1 });
      expect(valueOf({ maxRecommendations: 1, rankingSize: 10, minSample: 50 })).toMatchObject({
        maxRecommendations: 1,
        rankingSize: 10,
        minSample: 50,
      });
    });
  });

  describe('booleanos', () => {
    it.each(['includeComparison', 'includeMonthly', 'includeWeekdays', 'anonymize', 'refresh'])('rechaza %s que no es booleano', (key) => {
      expect(errorsOf({ [key]: 'si' })).toEqual([`${key} debe ser true o false.`]);
      expect(errorsOf({ [key]: 1 })).toEqual([`${key} debe ser true o false.`]);
    });

    it('acepta true y false', () => {
      expect(valueOf({ includeWeekdays: true, anonymize: false, refresh: true })).toMatchObject({
        includeWeekdays: true,
        anonymize: false,
        refresh: true,
      });
    });
  });

  describe('question', () => {
    it('rechaza más de 500 caracteres', () => {
      expect(errorsOf({ question: 'a'.repeat(501) })).toEqual(['question no puede superar 500 caracteres.']);
    });

    it('acepta exactamente 500 caracteres', () => {
      expect(valueOf({ question: 'a'.repeat(500) }).question).toHaveLength(500);
    });

    it('rechaza un valor que no es texto', () => {
      expect(errorsOf({ question: 123 })).toEqual(['question debe ser texto.']);
    });

    it('colapsa espacios y recorta los extremos', () => {
      expect(valueOf({ question: '  ¿Cómo\t va \n\n el   semestre?  ' }).question).toBe('¿Cómo va el semestre?');
    });

    it('convierte una cadena vacía o solo con espacios en null', () => {
      expect(valueOf({ question: '' }).question).toBeNull();
      expect(valueOf({ question: '   \n ' }).question).toBeNull();
      expect(valueOf({ question: null }).question).toBeNull();
    });

    it('la longitud se mide después de colapsar espacios', () => {
      const spaced = `${'a'.repeat(240)}${' '.repeat(300)}${'b'.repeat(240)}`;
      expect(valueOf({ question: spaced }).question).toBe(`${'a'.repeat(240)} ${'b'.repeat(240)}`);
    });
  });

  describe('filtros de analítica', () => {
    it('propaga los errores del parser de analítica (from posterior a to)', () => {
      expect(errorsOf({ from: '2026-05-02', to: '2026-05-01' })).toEqual(['from no puede ser posterior a to.']);
    });

    it('propaga errores de formato de fecha y de UUID', () => {
      expect(errorsOf({ from: '2026-02-30' })).toEqual(['from debe ser una fecha válida con formato YYYY-MM-DD.']);
      expect(errorsOf({ tutorId: 'no-es-uuid' })).toEqual(['tutorId debe ser un UUID válido.']);
    });

    it('acumula errores de filtros junto con errores propios', () => {
      const errors = errorsOf({ from: '2026-05-02', to: '2026-05-01', depth: 'X', extra: true });
      expect(errors).toEqual(
        expect.arrayContaining([
          'from no puede ser posterior a to.',
          'depth debe ser uno de: BRIEF, STANDARD, DETAILED.',
          'Campos no permitidos: extra.',
        ]),
      );
    });
  });
});
