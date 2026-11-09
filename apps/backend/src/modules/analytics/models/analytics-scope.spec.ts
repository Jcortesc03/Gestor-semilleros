import { filteredBoardWhere, filteredProjectWhere, scopeProjectWhere, visibleProjectFaculties } from './analytics-scope';

const empty = { from: null, to: null, areaId: null, facultyId: null, projectId: null, tutorId: null, projectStatus: null };

describe('alcance de la analítica', () => {
  it('global ve todos los proyectos no archivados', () => {
    expect(scopeProjectWhere({ global: true, areas: [], faculties: [] })).toEqual({ deletedAt: null });
  });

  it('suma áreas asignadas y facultades con decanato', () => {
    const where = scopeProjectWhere({ global: false, areas: [{ id: 'a1', name: 'A' }], faculties: [{ id: 'f1', name: 'F' }] });
    expect(where).toEqual({
      deletedAt: null,
      OR: [{ areaId: { in: ['a1'] } }, { faculties: { some: { facultyId: { in: ['f1'] } } } }],
    });
  });

  it('intersecta el alcance con los filtros', () => {
    const scope = { global: true, areas: [], faculties: [] };
    const where = filteredProjectWhere(scope, { ...empty, areaId: 'a1', projectStatus: 'ACTIVE', tutorId: 't1' });
    expect(where.AND).toEqual([
      { deletedAt: null },
      { areaId: 'a1' },
      { status: 'ACTIVE' },
      { boards: { some: { deletedAt: null, responsibleTutorId: 't1' } } },
    ]);
    expect(filteredBoardWhere(scope, { ...empty, tutorId: 't1' })).toMatchObject({ deletedAt: null, responsibleTutorId: 't1' });
  });

  it('el decano solo ve sus facultades en proyectos compartidos, salvo que le lleguen por su área', () => {
    const faculties = [{ id: 'fA' }, { id: 'fB' }];
    const dean = { global: false, areas: [], faculties: [{ id: 'fA', name: 'A' }] };
    expect(visibleProjectFaculties(dean, 'ar1', faculties)).toEqual([{ id: 'fA' }]);
    const deanAndManager = { ...dean, areas: [{ id: 'ar1', name: 'Área' }] };
    expect(visibleProjectFaculties(deanAndManager, 'ar1', faculties)).toEqual(faculties);
    expect(visibleProjectFaculties({ global: true, areas: [], faculties: [] }, 'ar1', faculties)).toEqual(faculties);
  });
});
