import { canPublishKind, canPublishTo, type PublishScope } from './publish-scope';

const none: PublishScope = {
  isAdmin: false,
  isAreaManager: false,
  isDean: false,
  isTutor: false,
  managedAreaIds: [],
  deanFacultyIds: [],
  deanProjectIds: [],
  tutorProjectIds: [],
};
const admin = { ...none, isAdmin: true };
const manager = { ...none, isAreaManager: true, managedAreaIds: ['area-1'] };
const dean = { ...none, isDean: true, deanFacultyIds: ['fac-1'], deanProjectIds: ['proj-1'] };
const tutor = { ...none, isTutor: true, tutorProjectIds: ['proj-1'] };

/** Suma los cargos de dos alcances (P-02): cada flag o lista se acumula. */
function sum(a: PublishScope, b: PublishScope): PublishScope {
  return {
    isAdmin: a.isAdmin || b.isAdmin,
    isAreaManager: a.isAreaManager || b.isAreaManager,
    isDean: a.isDean || b.isDean,
    isTutor: a.isTutor || b.isTutor,
    managedAreaIds: [...a.managedAreaIds, ...b.managedAreaIds],
    deanFacultyIds: [...a.deanFacultyIds, ...b.deanFacultyIds],
    deanProjectIds: [...a.deanProjectIds, ...b.deanProjectIds],
    tutorProjectIds: [...a.tutorProjectIds, ...b.tutorProjectIds],
  };
}

describe('canPublishTo', () => {
  it.each([
    ['admin', admin, { type: 'ALL' }, true],
    ['admin', admin, { type: 'ROLE', role: 'TUTOR' }, true],
    ['admin', admin, { type: 'FACULTY', facultyId: 'x' }, true],
    ['admin', admin, { type: 'PROJECT', projectId: 'x' }, true],
    ['encargado', manager, { type: 'AREA', areaId: 'area-1' }, true],
    ['encargado', manager, { type: 'AREA', areaId: 'area-2' }, false],
    ['encargado', manager, { type: 'ALL' }, false],
    ['encargado', manager, { type: 'ROLE', role: 'TUTOR' }, true],
    ['encargado', manager, { type: 'ROLE', role: 'STUDENT' }, true],
    ['encargado', manager, { type: 'ROLE', role: 'ADMIN' }, true],
    ['encargado', manager, { type: 'FACULTY', facultyId: 'fac-1' }, false],
    ['encargado', manager, { type: 'PROJECT', projectId: 'proj-1' }, false],
    ['decano', dean, { type: 'FACULTY', facultyId: 'fac-1' }, true],
    ['decano', dean, { type: 'FACULTY', facultyId: 'fac-2' }, false],
    ['decano', dean, { type: 'PROJECT', projectId: 'proj-1' }, true],
    ['decano', dean, { type: 'PROJECT', projectId: 'proj-2' }, false],
    ['decano', dean, { type: 'ALL' }, false],
    ['decano', dean, { type: 'ROLE', role: 'STUDENT' }, false],
    ['decano', dean, { type: 'AREA', areaId: 'area-1' }, false],
    ['tutor', tutor, { type: 'PROJECT', projectId: 'proj-1' }, true],
    ['tutor', tutor, { type: 'PROJECT', projectId: 'proj-2' }, false],
    ['tutor', tutor, { type: 'FACULTY', facultyId: 'fac-1' }, false],
    ['tutor', tutor, { type: 'AREA', areaId: 'area-1' }, false],
    ['tutor', tutor, { type: 'ROLE', role: 'STUDENT' }, false],
    ['tutor', tutor, { type: 'ALL' }, false],
    ['sin rol', none, { type: 'ALL' }, false],
    ['sin rol', none, { type: 'PROJECT', projectId: 'proj-1' }, false],
    // Los roles se suman (P-02): un usuario con varios roles acumula los permisos de cada uno.
    ['tutor y encargado', sum(tutor, manager), { type: 'AREA', areaId: 'area-1' }, true],
    ['tutor y encargado', sum(tutor, manager), { type: 'PROJECT', projectId: 'proj-1' }, true],
    ['tutor y encargado', sum(tutor, manager), { type: 'PROJECT', projectId: 'proj-2' }, false],
    ['tutor y encargado', sum(tutor, manager), { type: 'FACULTY', facultyId: 'fac-1' }, false],
    ['decano y tutor', sum(dean, tutor), { type: 'FACULTY', facultyId: 'fac-1' }, true],
    ['decano y tutor', sum(dean, tutor), { type: 'PROJECT', projectId: 'proj-1' }, true],
    ['decano y tutor', sum(dean, tutor), { type: 'PROJECT', projectId: 'proj-2' }, false],
    ['decano y tutor', sum(dean, { ...tutor, tutorProjectIds: ['proj-2'] }), { type: 'PROJECT', projectId: 'proj-2' }, true],
    ['decano y tutor', sum(dean, tutor), { type: 'AREA', areaId: 'area-1' }, false],
  ] as const)('%s → %j = %s', (_who, scope, audience, expected) => {
    expect(canPublishTo(scope, audience)).toBe(expected);
  });
});

describe('canPublishKind', () => {
  it('solo el decano y el administrador envían NOTIFICATION', () => {
    expect(canPublishKind(dean, 'NOTIFICATION')).toBe(true);
    expect(canPublishKind(admin, 'NOTIFICATION')).toBe(true);
    expect(canPublishKind(manager, 'NOTIFICATION')).toBe(false);
    expect(canPublishKind(tutor, 'NOTIFICATION')).toBe(false);
    expect(canPublishKind(sum(manager, tutor), 'NOTIFICATION')).toBe(false);
  });

  it('encargado de área, tutor y decano publican los demás tipos', () => {
    for (const kind of ['NEWS', 'COMMUNICATION', 'CHANGE'] as const) {
      expect(canPublishKind(manager, kind)).toBe(true);
      expect(canPublishKind(tutor, kind)).toBe(true);
      expect(canPublishKind(dean, kind)).toBe(true);
      expect(canPublishKind(none, kind)).toBe(false);
    }
  });
});
