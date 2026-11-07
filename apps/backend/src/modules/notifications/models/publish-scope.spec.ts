import { canPublishKind, canPublishTo, type PublishScope } from './publish-scope';

const none: PublishScope = { isAdmin: false, isAreaManager: false, isDean: false, managedAreaIds: [], deanFacultyIds: [], deanProjectIds: [] };
const admin = { ...none, isAdmin: true };
const manager = { ...none, isAreaManager: true, managedAreaIds: ['area-1'] };
const dean = { ...none, isDean: true, deanFacultyIds: ['fac-1'], deanProjectIds: ['proj-1'] };

describe('canPublishTo', () => {
  it.each([
    ['admin', admin, { type: 'ALL' }, true],
    ['admin', admin, { type: 'FACULTY', facultyId: 'x' }, true],
    ['encargado', manager, { type: 'ALL' }, true],
    ['encargado', manager, { type: 'ROLE', role: 'TUTOR' }, true],
    ['encargado', manager, { type: 'AREA', areaId: 'area-1' }, true],
    ['encargado', manager, { type: 'AREA', areaId: 'area-2' }, false],
    ['encargado', manager, { type: 'FACULTY', facultyId: 'fac-1' }, false],
    ['encargado', manager, { type: 'PROJECT', projectId: 'proj-1' }, false],
    ['decano', dean, { type: 'FACULTY', facultyId: 'fac-1' }, true],
    ['decano', dean, { type: 'FACULTY', facultyId: 'fac-2' }, false],
    ['decano', dean, { type: 'PROJECT', projectId: 'proj-1' }, true],
    ['decano', dean, { type: 'PROJECT', projectId: 'proj-2' }, false],
    ['decano', dean, { type: 'ALL' }, false],
    ['decano', dean, { type: 'ROLE', role: 'STUDENT' }, false],
    ['decano', dean, { type: 'AREA', areaId: 'area-1' }, false],
    ['sin rol', none, { type: 'ALL' }, false],
  ] as const)('%s → %j = %s', (_who, scope, audience, expected) => {
    expect(canPublishTo(scope, audience)).toBe(expected);
  });
});

describe('canPublishKind', () => {
  it('solo el decano y el administrador envían NOTIFICATION', () => {
    expect(canPublishKind(dean, 'NOTIFICATION')).toBe(true);
    expect(canPublishKind(admin, 'NOTIFICATION')).toBe(true);
    expect(canPublishKind(manager, 'NOTIFICATION')).toBe(false);
  });

  it('encargado y decano publican los demás tipos', () => {
    for (const kind of ['NEWS', 'COMMUNICATION', 'CHANGE'] as const) {
      expect(canPublishKind(manager, kind)).toBe(true);
      expect(canPublishKind(dean, kind)).toBe(true);
      expect(canPublishKind(none, kind)).toBe(false);
    }
  });
});
