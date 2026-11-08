import { hasStructuralFilter, parseAnalyticsQuery } from './analytics-query.dto';

const UUID = '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b';

describe('parseAnalyticsQuery', () => {
  it('acepta una consulta vacía', () => {
    const r = parseAnalyticsQuery({});
    expect(r).toEqual({
      ok: true,
      value: { from: null, to: null, areaId: null, facultyId: null, projectId: null, tutorId: null, projectStatus: null },
    });
  });

  it('acepta todos los filtros válidos', () => {
    const r = parseAnalyticsQuery({ from: '2026-01-01', to: '2026-12-31', areaId: UUID.toUpperCase(), projectStatus: 'ACTIVE' });
    expect(r.ok && r.value).toMatchObject({ from: '2026-01-01', to: '2026-12-31', areaId: UUID, projectStatus: 'ACTIVE' });
  });

  it.each([
    [{ from: '2026-02-30' }, 'from debe ser una fecha válida'],
    [{ from: '2026-05-02', to: '2026-05-01' }, 'from no puede ser posterior a to'],
    [{ from: '2025-01-01', to: '2026-01-02' }, 'no puede superar 366'],
    [{ tutorId: 'x' }, 'tutorId debe ser un UUID'],
    [{ projectStatus: 'DRAFT' }, 'projectStatus debe ser uno de'],
    [{ limit: '5' }, 'Campos no permitidos: limit'],
  ])('rechaza %j', (query, message) => {
    const r = parseAnalyticsQuery(query);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain(message);
  });

  it('detecta filtros estructurales', () => {
    const base = { from: '2026-01-01', to: null, areaId: null, facultyId: null, projectId: null, tutorId: null, projectStatus: null };
    expect(hasStructuralFilter(base)).toBe(false);
    expect(hasStructuralFilter({ ...base, tutorId: UUID })).toBe(true);
  });
});
