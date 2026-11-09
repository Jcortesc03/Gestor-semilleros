import { can, isLeader, isTutor, type ProjectAccess } from './project-access';

/** Acceso base sin privilegios; cada caso sobrescribe lo que necesita. */
const acceso = (overrides: Partial<ProjectAccess> = {}): ProjectAccess => ({
  projectId: 'proyecto-1',
  userId: 'usuario-1',
  isAdmin: false,
  isDean: false,
  isAreaManager: false,
  role: null,
  ...overrides,
});

type Caso = {
  caso: string;
  acceso: ProjectAccess;
  esperado: Record<keyof typeof can, boolean>;
};

/** Matriz de permisos por relación con el proyecto (docs/domain/roles-permissions.md). */
const MATRIZ: Caso[] = [
  {
    caso: 'administrador sin rol de proyecto',
    acceso: acceso({ isAdmin: true }),
    esperado: {
      manageProject: true,
      manageTutors: true,
      manageStudents: true,
      manageBoards: true,
      manageActivities: true,
      review: true,
    },
  },
  {
    caso: 'decano sin rol de proyecto',
    acceso: acceso({ isDean: true }),
    esperado: {
      manageProject: true,
      manageTutors: true,
      manageStudents: true,
      manageBoards: false,
      manageActivities: false,
      review: false,
    },
  },
  {
    caso: 'encargado de área sin rol de proyecto',
    acceso: acceso({ isAreaManager: true }),
    esperado: {
      manageProject: true,
      manageTutors: true,
      manageStudents: true,
      manageBoards: false,
      manageActivities: false,
      review: false,
    },
  },
  {
    caso: 'decano y encargado de área a la vez',
    acceso: acceso({ isDean: true, isAreaManager: true }),
    esperado: {
      manageProject: true,
      manageTutors: true,
      manageStudents: true,
      manageBoards: false,
      manageActivities: false,
      review: false,
    },
  },
  {
    caso: 'tutor',
    acceso: acceso({ role: 'TUTOR' }),
    esperado: {
      manageProject: false,
      manageTutors: false,
      manageStudents: true,
      manageBoards: true,
      manageActivities: true,
      review: true,
    },
  },
  {
    caso: 'estudiante líder',
    acceso: acceso({ role: 'STUDENT_LEADER' }),
    esperado: {
      manageProject: false,
      manageTutors: false,
      manageStudents: false,
      manageBoards: false,
      manageActivities: true,
      review: false,
    },
  },
  {
    caso: 'estudiante',
    acceso: acceso({ role: 'STUDENT' }),
    esperado: {
      manageProject: false,
      manageTutors: false,
      manageStudents: false,
      manageBoards: false,
      manageActivities: false,
      review: false,
    },
  },
  {
    caso: 'usuario sin acceso',
    acceso: acceso(),
    esperado: {
      manageProject: false,
      manageTutors: false,
      manageStudents: false,
      manageBoards: false,
      manageActivities: false,
      review: false,
    },
  },
];

const definirPermiso = (permiso: keyof typeof can) => {
  describe(`can.${permiso}`, () => {
    const filas = MATRIZ.map((c) => [c.caso, c.acceso, c.esperado[permiso]] as const);

    it.each(filas)('%s → devuelve el valor esperado', (_caso, accesoDelCaso, esperado) => {
      expect(can[permiso](accesoDelCaso)).toBe(esperado);
    });
  });
};

const PERMISOS: Array<keyof typeof can> = [
  'manageProject',
  'manageTutors',
  'manageStudents',
  'manageBoards',
  'manageActivities',
  'review',
];

describe('permisos por proyecto', () => {
  PERMISOS.forEach(definirPermiso);

  it('cubre la matriz completa de casos esperados', () => {
    expect(MATRIZ).toHaveLength(8);
    for (const { esperado } of MATRIZ) {
      expect(Object.keys(esperado).sort()).toEqual([...PERMISOS].sort());
    }
  });
});

describe('isTutor', () => {
  it.each([
    ['tutor', acceso({ role: 'TUTOR' }), true],
    ['estudiante líder', acceso({ role: 'STUDENT_LEADER' }), false],
    ['estudiante', acceso({ role: 'STUDENT' }), false],
    ['administrador', acceso({ isAdmin: true }), false],
    ['decano', acceso({ isDean: true }), false],
    ['sin acceso', acceso(), false],
  ] as const)('%s → %s', (_caso, accesoDelCaso, esperado) => {
    expect(isTutor(accesoDelCaso)).toBe(esperado);
  });
});

describe('isLeader', () => {
  it.each([
    ['estudiante líder', acceso({ role: 'STUDENT_LEADER' }), true],
    ['tutor', acceso({ role: 'TUTOR' }), false],
    ['estudiante', acceso({ role: 'STUDENT' }), false],
    ['administrador', acceso({ isAdmin: true }), false],
    ['decano', acceso({ isDean: true }), false],
    ['sin acceso', acceso(), false],
  ] as const)('%s → %s', (_caso, accesoDelCaso, esperado) => {
    expect(isLeader(accesoDelCaso)).toBe(esperado);
  });
});
