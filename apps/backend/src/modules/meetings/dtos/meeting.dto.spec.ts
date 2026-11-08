import {
  MAX_DURATION,
  MAX_PARTICIPANTS,
  MIN_DURATION,
  parseChangeMeetingStatus,
  parseCreateMeeting,
  parseListMeetings,
  parseRecording,
} from './meeting.dto';

const NOW = new Date('2026-11-06T12:00:00.000Z');
const USER_A = '3f1b6f1e-9d2a-4c3b-8a7e-0f1d2c3b4a59';
const USER_B = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const PROJECT_ID = '0b9d7c1a-2e3f-4a5b-9c6d-7e8f9a0b1c2d';

const NOT_OBJECT = ['El cuerpo debe ser un objeto JSON.'];
const START_FORMAT =
  'startsAt debe ser una fecha y hora ISO 8601 con zona horaria, p. ej. 2026-11-20T15:00:00-05:00.';
const START_FUTURE = 'startsAt debe ser una fecha futura.';
const DURATION = 'durationMinutes debe ser un entero entre 5 y 480.';
const PARTICIPANTS = 'participantIds debe ser una lista de 1 a 100 UUID de usuarios.';
const REASON = 'reason es obligatorio (máximo 200 caracteres).';
const PROJECT = 'projectId debe ser un UUID.';

const validCreate = {
  reason: 'Revisión de avances',
  startsAt: '2026-11-20T15:00:00-05:00',
  durationMinutes: 60,
  projectId: PROJECT_ID,
  participantIds: [USER_A, USER_B],
};

function createErrors(input: unknown, now: Date = NOW): string[] {
  const result = parseCreateMeeting(input, now);
  return result.ok ? [] : result.errors;
}

function statusErrors(input: unknown): string[] {
  const result = parseChangeMeetingStatus(input);
  return result.ok ? [] : result.errors;
}

function recordingErrors(input: unknown): string[] {
  const result = parseRecording(input);
  return result.ok ? [] : result.errors;
}

function listErrors(input: unknown): string[] {
  const result = parseListMeetings(input);
  return result.ok ? [] : result.errors;
}

describe('constantes', () => {
  it('expone los límites acordados', () => {
    expect(MIN_DURATION).toBe(5);
    expect(MAX_DURATION).toBe(480);
    expect(MAX_PARTICIPANTS).toBe(100);
  });
});

describe('parseCreateMeeting', () => {
  it('acepta un cuerpo válido y normaliza los campos', () => {
    expect(parseCreateMeeting({ ...validCreate, reason: '  Revisión de avances  ' }, NOW)).toEqual({
      ok: true,
      value: {
        reason: 'Revisión de avances',
        startsAt: new Date('2026-11-20T20:00:00.000Z'),
        durationMinutes: 60,
        projectId: PROJECT_ID,
        participantIds: [USER_A, USER_B],
        joinUrl: null,
      },
    });
  });

  describe('joinUrl', () => {
    it('es opcional y acepta un enlace https', () => {
      const result = parseCreateMeeting({ ...validCreate, joinUrl: 'https://meet.example.test/sala' }, NOW);
      expect(result.ok && result.value.joinUrl).toBe('https://meet.example.test/sala');
    });

    it.each([['http://meet.example.test/sala'], ['sala'], [123], ['https://x.test/' + 'a'.repeat(2048)]])(
      'rechaza %p',
      (joinUrl) => {
        const result = parseCreateMeeting({ ...validCreate, joinUrl }, NOW);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.join(' ')).toMatch(/joinUrl/);
      },
    );
  });

  it('usa null como projectId cuando está ausente o es null', () => {
    const { projectId: _omitted, ...withoutProject } = validCreate;
    for (const input of [withoutProject, { ...validCreate, projectId: null }]) {
      const result = parseCreateMeeting(input, NOW);
      expect(result.ok && result.value.projectId).toBeNull();
    }
  });

  it('usa la fecha actual por defecto cuando no se indica now', () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(parseCreateMeeting({ ...validCreate, startsAt: future }).ok).toBe(true);
    expect(parseCreateMeeting({ ...validCreate, startsAt: '2020-01-01T00:00:00Z' }).ok).toBe(false);
  });

  it('rechaza cuerpos que no son objetos JSON', () => {
    for (const input of [null, undefined, 'texto', 42, [validCreate]]) {
      expect(createErrors(input)).toEqual(NOT_OBJECT);
    }
  });

  it('informa todos los errores a la vez cuando el cuerpo está vacío', () => {
    expect(createErrors({})).toEqual([REASON, START_FORMAT, DURATION, PARTICIPANTS]);
  });

  it('rechaza campos desconocidos y los acumula con otros errores', () => {
    expect(createErrors({ ...validCreate, extra: 1, otro: 2 })).toEqual(['Campos no permitidos: extra, otro.']);
    expect(createErrors({ ...validCreate, extra: 1, reason: '' })).toEqual([
      'Campos no permitidos: extra.',
      REASON,
    ]);
  });

  describe('reason', () => {
    it('rechaza vacío, solo espacios, no texto y más de 200 caracteres', () => {
      for (const reason of ['', '   ', 5, null, undefined, 'a'.repeat(201)]) {
        expect(createErrors({ ...validCreate, reason })).toEqual([REASON]);
      }
    });

    it('acepta exactamente 200 caracteres y 1 carácter', () => {
      expect(createErrors({ ...validCreate, reason: 'a'.repeat(200) })).toEqual([]);
      expect(createErrors({ ...validCreate, reason: 'a' })).toEqual([]);
    });

    it('mide el límite después de recortar', () => {
      expect(createErrors({ ...validCreate, reason: ` ${'a'.repeat(200)} ` })).toEqual([]);
    });
  });

  describe('startsAt', () => {
    it('acepta Z, desplazamientos y fracciones de segundo', () => {
      const cases: Array<[string, string]> = [
        ['2026-11-20T15:00:00Z', '2026-11-20T15:00:00.000Z'],
        ['2026-11-20T15:00Z', '2026-11-20T15:00:00.000Z'],
        ['2026-11-20T15:00:00+02:30', '2026-11-20T12:30:00.000Z'],
        ['2026-11-20T15:00:00-05:00', '2026-11-20T20:00:00.000Z'],
        ['2026-11-20T15:00:00.5Z', '2026-11-20T15:00:00.500Z'],
        ['2026-11-20T15:00:00.123-05:00', '2026-11-20T20:00:00.123Z'],
      ];
      for (const [startsAt, iso] of cases) {
        const result = parseCreateMeeting({ ...validCreate, startsAt }, NOW);
        expect(result.ok && result.value.startsAt.toISOString()).toBe(iso);
      }
    });

    it('rechaza formatos sin zona, sin hora, no ISO o de otro tipo', () => {
      const invalid = [
        '2026-11-20T15:00:00',
        '2026-11-20',
        '2026-11-20 15:00:00Z',
        '2026-11-20T15:00:00+0500',
        '2026-11-20T15:00:00+05',
        '20 de noviembre de 2026',
        'mañana',
        '',
        1795000000000,
        null,
        undefined,
        {},
      ];
      for (const startsAt of invalid) {
        expect(createErrors({ ...validCreate, startsAt })).toEqual([START_FORMAT]);
      }
    });

    it('rechaza fechas y horas inexistentes', () => {
      const invalid = [
        '2026-02-30T10:00:00Z',
        '2026-13-01T10:00:00Z',
        '2026-11-31T10:00:00Z',
        '2026-11-20T24:00:00Z',
        '2026-11-20T10:60:00Z',
        '2026-11-20T10:00:60Z',
        '2026-11-20T10:00:00+24:00',
        '2026-11-20T10:00:00+05:60',
      ];
      for (const startsAt of invalid) {
        expect(createErrors({ ...validCreate, startsAt })).toEqual([START_FORMAT]);
      }
    });

    it('rechaza una fecha pasada o a menos de un minuto de now', () => {
      for (const startsAt of ['2026-11-05T12:00:00Z', '2026-11-06T12:00:00Z', '2026-11-06T12:00:59.999Z']) {
        expect(createErrors({ ...validCreate, startsAt })).toEqual([START_FUTURE]);
      }
    });

    it('acepta una fecha exactamente un minuto posterior a now', () => {
      expect(createErrors({ ...validCreate, startsAt: '2026-11-06T12:01:00Z' })).toEqual([]);
    });

    it('compara en tiempo real respetando la zona horaria', () => {
      // 07:30-05:00 equivale a 12:30Z (futuro); 07:30+05:00 equivale a 02:30Z (pasado).
      expect(createErrors({ ...validCreate, startsAt: '2026-11-06T07:30:00-05:00' })).toEqual([]);
      expect(createErrors({ ...validCreate, startsAt: '2026-11-06T07:30:00+05:00' })).toEqual([START_FUTURE]);
    });
  });

  describe('durationMinutes', () => {
    it('acepta los límites 5 y 480', () => {
      expect(createErrors({ ...validCreate, durationMinutes: 5 })).toEqual([]);
      expect(createErrors({ ...validCreate, durationMinutes: 480 })).toEqual([]);
    });

    it('rechaza fuera de rango, decimales, texto y valores no numéricos', () => {
      for (const durationMinutes of [4, 481, 0, -30, 30.5, '60', NaN, Infinity, null, undefined, true]) {
        expect(createErrors({ ...validCreate, durationMinutes })).toEqual([DURATION]);
      }
    });
  });

  describe('projectId', () => {
    it('rechaza valores que no son UUID', () => {
      for (const projectId of ['no-uuid', '', 5, true, {}, []]) {
        expect(createErrors({ ...validCreate, projectId })).toEqual([PROJECT]);
      }
    });
  });

  describe('participantIds', () => {
    it('elimina duplicados conservando el primer orden de aparición', () => {
      const result = parseCreateMeeting({ ...validCreate, participantIds: [USER_B, USER_A, USER_B, USER_A] }, NOW);
      expect(result.ok && result.value.participantIds).toEqual([USER_B, USER_A]);
    });

    it('rechaza lista ausente, vacía, no arreglo o con elementos inválidos', () => {
      const invalid = [
        undefined,
        null,
        [],
        USER_A,
        {},
        ['no-uuid'],
        [USER_A, 'no-uuid'],
        [USER_A, 5],
        [USER_A, null],
      ];
      for (const participantIds of invalid) {
        expect(createErrors({ ...validCreate, participantIds })).toEqual([PARTICIPANTS]);
      }
    });

    it('acepta 100 elementos y rechaza 101', () => {
      const ids = (count: number): string[] =>
        Array.from({ length: count }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
      expect(createErrors({ ...validCreate, participantIds: ids(100) })).toEqual([]);
      expect(createErrors({ ...validCreate, participantIds: ids(101) })).toEqual([PARTICIPANTS]);
    });

    it('el límite cuenta los elementos recibidos, incluidos los duplicados', () => {
      expect(createErrors({ ...validCreate, participantIds: Array(101).fill(USER_A) })).toEqual([PARTICIPANTS]);
    });
  });

  it('acumula errores de varios campos en orden y no lanza', () => {
    const input = {
      reason: '',
      startsAt: 'x',
      durationMinutes: 1,
      projectId: 'y',
      participantIds: [],
      foo: true,
    };
    expect(() => parseCreateMeeting(input, NOW)).not.toThrow();
    expect(createErrors(input)).toEqual([
      'Campos no permitidos: foo.',
      REASON,
      START_FORMAT,
      DURATION,
      PROJECT,
      PARTICIPANTS,
    ]);
  });
});

describe('parseChangeMeetingStatus', () => {
  it('acepta los tres estados manuales con comment nulo por defecto', () => {
    for (const status of ['IN_PROGRESS', 'FINISHED', 'CANCELLED']) {
      expect(parseChangeMeetingStatus({ status })).toEqual({ ok: true, value: { status, comment: null } });
    }
  });

  it('recorta el comentario', () => {
    expect(parseChangeMeetingStatus({ status: 'CANCELLED', comment: '  Se cancela por lluvia  ' })).toEqual({
      ok: true,
      value: { status: 'CANCELLED', comment: 'Se cancela por lluvia' },
    });
  });

  it('trata comment vacío, de espacios o null como null', () => {
    for (const comment of ['', '   ', null, undefined]) {
      expect(parseChangeMeetingStatus({ status: 'FINISHED', comment })).toEqual({
        ok: true,
        value: { status: 'FINISHED', comment: null },
      });
    }
  });

  it('acepta un comentario de 500 caracteres y rechaza 501', () => {
    expect(statusErrors({ status: 'FINISHED', comment: 'a'.repeat(500) })).toEqual([]);
    expect(statusErrors({ status: 'FINISHED', comment: 'a'.repeat(501) })).toEqual([
      'comment admite como máximo 500 caracteres.',
    ]);
    expect(statusErrors({ status: 'FINISHED', comment: ` ${'a'.repeat(500)} ` })).toEqual([]);
  });

  it('rechaza un comentario que no es texto', () => {
    for (const comment of [5, true, {}, []]) {
      expect(statusErrors({ status: 'FINISHED', comment })).toEqual(['comment admite como máximo 500 caracteres.']);
    }
  });

  it('rechaza estados ausentes o no permitidos, incluido SCHEDULED', () => {
    for (const status of [undefined, null, '', 'SCHEDULED', 'finished', 'OTHER', 5]) {
      expect(statusErrors({ status })).toEqual(['status debe ser IN_PROGRESS, FINISHED o CANCELLED.']);
    }
  });

  it('rechaza cuerpos que no son objetos JSON', () => {
    for (const input of [null, undefined, 'texto', 42, [{ status: 'FINISHED' }]]) {
      expect(statusErrors(input)).toEqual(NOT_OBJECT);
    }
  });

  it('rechaza campos desconocidos y acumula todos los errores', () => {
    expect(statusErrors({ status: 'FINISHED', extra: 1 })).toEqual(['Campos no permitidos: extra.']);
    expect(statusErrors({ status: 'X', comment: 'a'.repeat(501), extra: 1 })).toEqual([
      'Campos no permitidos: extra.',
      'status debe ser IN_PROGRESS, FINISHED o CANCELLED.',
      'comment admite como máximo 500 caracteres.',
    ]);
  });
});

describe('parseRecording', () => {
  const RECORDING_ERROR = 'recordingUrl debe ser una URL http(s) válida o null.';

  it('acepta URLs http y https', () => {
    for (const recordingUrl of ['https://teams.example.test/rec/1', 'http://example.test/video?id=3#t=5']) {
      expect(parseRecording({ recordingUrl })).toEqual({ ok: true, value: { recordingUrl } });
    }
  });

  it('acepta null para borrar el enlace', () => {
    expect(parseRecording({ recordingUrl: null })).toEqual({ ok: true, value: { recordingUrl: null } });
  });

  it('exige que recordingUrl esté presente', () => {
    expect(recordingErrors({})).toEqual([RECORDING_ERROR]);
  });

  it('rechaza esquemas no http(s) y texto que no es URL', () => {
    const invalid = [
      'javascript:alert(1)',
      'ftp://example.test/archivo',
      'file:///etc/passwd',
      'data:text/html,hola',
      'no es una url',
      'example.test/video',
      '',
      5,
      true,
      {},
    ];
    for (const recordingUrl of invalid) {
      expect(recordingErrors({ recordingUrl })).toEqual([RECORDING_ERROR]);
    }
  });

  it('acepta hasta 2000 caracteres y rechaza más', () => {
    const base = 'https://example.test/';
    expect(recordingErrors({ recordingUrl: base + 'a'.repeat(2000 - base.length) })).toEqual([]);
    expect(recordingErrors({ recordingUrl: base + 'a'.repeat(2001 - base.length) })).toEqual([RECORDING_ERROR]);
  });

  it('rechaza cuerpos que no son objetos JSON', () => {
    for (const input of [null, undefined, 'texto', 42, [{ recordingUrl: null }]]) {
      expect(recordingErrors(input)).toEqual(NOT_OBJECT);
    }
  });

  it('rechaza campos desconocidos y los acumula con otros errores', () => {
    expect(recordingErrors({ recordingUrl: null, extra: 1 })).toEqual(['Campos no permitidos: extra.']);
    expect(recordingErrors({ extra: 1 })).toEqual(['Campos no permitidos: extra.', RECORDING_ERROR]);
  });
});

describe('parseListMeetings', () => {
  it('usa limit 50 y no incluye filtros cuando no hay parámetros', () => {
    for (const input of [{}, undefined, null]) {
      expect(parseListMeetings(input)).toEqual({ ok: true, value: { limit: 50 } });
    }
  });

  it('acepta todos los filtros y los convierte', () => {
    expect(
      parseListMeetings({
        status: 'IN_PROGRESS',
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-30T23:59:59Z',
        limit: '25',
      }),
    ).toEqual({
      ok: true,
      value: {
        status: 'IN_PROGRESS',
        from: new Date('2026-11-01T00:00:00.000Z'),
        to: new Date('2026-11-30T23:59:59.000Z'),
        limit: 25,
      },
    });
  });

  it('acepta los cuatro estados', () => {
    for (const status of ['SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED']) {
      expect(listErrors({ status })).toEqual([]);
    }
  });

  it('rechaza estados desconocidos o que no son texto', () => {
    for (const status of ['OTHER', 'finished', '', ['FINISHED'], 5]) {
      expect(listErrors({ status })).toHaveLength(1);
      expect(listErrors({ status })[0]).toMatch(/^status no es válido\./);
    }
  });

  it('acepta fechas ISO solo con día', () => {
    const result = parseListMeetings({ from: '2026-11-01', to: '2026-11-02' });
    expect(result).toEqual({
      ok: true,
      value: { from: new Date('2026-11-01T00:00:00.000Z'), to: new Date('2026-11-02T00:00:00.000Z'), limit: 50 },
    });
  });

  it('rechaza from y to inválidos', () => {
    for (const bad of ['no-fecha', '', ['2026-11-01'], 5]) {
      expect(listErrors({ from: bad })).toEqual(['from debe ser una fecha ISO 8601.']);
      expect(listErrors({ to: bad })).toEqual(['to debe ser una fecha ISO 8601.']);
    }
  });

  it('rechaza to anterior a from y acepta to igual a from', () => {
    expect(listErrors({ from: '2026-11-10T00:00:00Z', to: '2026-11-09T00:00:00Z' })).toEqual([
      'to no puede ser anterior a from.',
    ]);
    expect(listErrors({ from: '2026-11-10T00:00:00Z', to: '2026-11-10T00:00:00Z' })).toEqual([]);
  });

  it('no valida el rango si alguna de las fechas es inválida', () => {
    expect(listErrors({ from: 'x', to: '2026-11-09T00:00:00Z' })).toEqual(['from debe ser una fecha ISO 8601.']);
  });

  it('acepta limit entre 1 y 100', () => {
    for (const [limit, expected] of [['1', 1], ['100', 100], ['050', 50]] as const) {
      const result = parseListMeetings({ limit });
      expect(result.ok && result.value.limit).toBe(expected);
    }
  });

  it('rechaza limit fuera de rango, decimal, negativo o que no es texto numérico', () => {
    for (const limit of ['0', '101', '-1', '1.5', 'abc', '', ' 5', '5 ', '1e2', 10, ['10']]) {
      expect(listErrors({ limit })).toEqual(['limit debe ser un entero entre 1 y 100.']);
    }
  });

  it('rechaza consultas que no son objetos', () => {
    for (const input of ['texto', 42, [{}]]) {
      expect(listErrors(input)).toEqual(NOT_OBJECT);
    }
  });

  it('rechaza campos desconocidos y acumula todos los errores', () => {
    expect(listErrors({ extra: '1' })).toEqual(['Campos no permitidos: extra.']);
    const input = { extra: '1', status: 'X', from: 'a', to: 'b', limit: '0' };
    expect(() => parseListMeetings(input)).not.toThrow();
    expect(listErrors(input)).toEqual([
      'Campos no permitidos: extra.',
      expect.stringMatching(/^status no es válido\./),
      'from debe ser una fecha ISO 8601.',
      'to debe ser una fecha ISO 8601.',
      'limit debe ser un entero entre 1 y 100.',
    ]);
  });
});
