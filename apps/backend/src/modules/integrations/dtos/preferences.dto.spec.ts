import { normalizePhone, parseUpdatePreferences } from './preferences.dto';

const validChange = { kind: 'NEWS', channel: 'EMAIL', enabled: true };

function updateErrors(input: unknown): string[] {
  const result = parseUpdatePreferences(input);
  return result.ok ? [] : result.errors;
}

describe('normalizePhone', () => {
  it.each([
    ['+573001234567', '+573001234567'],
    ['+57 300 123 4567', '+573001234567'],
    ['+57 (300) 123-4567', '+573001234567'],
    ['  +57.300.123.4567  ', '+573001234567'],
    ['+1 (555) 000-0001', '+15550000001'],
    ['+12345678', '+12345678'],
  ])('normaliza %s a %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    ['sin prefijo', '573001234567'],
    ['prefijo con cero', '+012345678'],
    ['demasiado corto', '+1234567'],
    ['demasiado largo', `+1${'0'.repeat(15)}`],
    ['vacío', ''],
    ['solo espacios', '   '],
    ['con letras', '+57300CALLME'],
    ['no textual', 573001234567],
    ['nulo', null],
    ['indefinido', undefined],
  ])('rechaza %s', (_caso, input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('parseUpdatePreferences', () => {
  it('permite borrar el teléfono con null', () => {
    expect(parseUpdatePreferences({ phone: null })).toEqual({ ok: true, value: { phone: null } });
  });

  it('normaliza el teléfono', () => {
    expect(parseUpdatePreferences({ phone: ' +57 (300) 000-0001 ' })).toEqual({
      ok: true,
      value: { phone: '+573000000001' },
    });
  });

  it('acepta una lista de preferencias válida', () => {
    expect(
      parseUpdatePreferences({
        preferences: [
          { kind: 'NEWS', channel: 'EMAIL', enabled: true },
          { kind: 'NEWS', channel: 'WHATSAPP', enabled: false },
          { kind: 'CHANGE', channel: 'EMAIL', enabled: false },
        ],
      }),
    ).toEqual({
      ok: true,
      value: {
        preferences: [
          { kind: 'NEWS', channel: 'EMAIL', enabled: true },
          { kind: 'NEWS', channel: 'WHATSAPP', enabled: false },
          { kind: 'CHANGE', channel: 'EMAIL', enabled: false },
        ],
      },
    });
  });

  it('acepta teléfono y preferencias a la vez', () => {
    expect(parseUpdatePreferences({ phone: '+573001234567', preferences: [validChange] })).toEqual({
      ok: true,
      value: { phone: '+573001234567', preferences: [validChange] },
    });
  });

  it('rechaza cuerpos que no son objetos JSON', () => {
    for (const input of [null, undefined, 'texto', 42, [validChange]]) {
      expect(updateErrors(input)).toEqual(['El cuerpo debe ser un objeto JSON.']);
    }
  });

  it('exige al menos un campo para actualizar', () => {
    expect(updateErrors({})).toEqual(['Debe indicar al menos un campo para actualizar.']);
    expect(updateErrors({ phone: undefined, preferences: undefined })).toEqual([
      'Debe indicar al menos un campo para actualizar.',
    ]);
  });

  it('rechaza campos desconocidos en el cuerpo', () => {
    expect(updateErrors({ phone: null, email: 'x' })).toEqual(['Campos no permitidos: email.']);
  });

  it('rechaza teléfonos no normalizables', () => {
    for (const phone of ['573001234567', '+012345678', 573001234567, true, '']) {
      expect(updateErrors({ phone })).toEqual([
        'phone debe estar en formato internacional E.164, p. ej. +573001234567.',
      ]);
    }
  });

  it('rechaza listas de preferencias fuera del rango 1..8', () => {
    expect(updateErrors({ preferences: 'NEWS' })).toEqual(['preferences debe ser una lista de 1 a 8 elementos.']);
    expect(updateErrors({ preferences: [] })).toEqual(['preferences debe ser una lista de 1 a 8 elementos.']);
    expect(
      updateErrors({ preferences: Array.from({ length: 9 }, (_item, index) => ({ ...validChange, kind: index < 4 ? 'NEWS' : 'CHANGE', channel: index % 2 === 0 ? 'EMAIL' : 'WHATSAPP' })) }),
    ).toEqual(['preferences debe ser una lista de 1 a 8 elementos.']);
  });

  it('rechaza elementos de preferencias que no son objetos', () => {
    expect(updateErrors({ preferences: ['NEWS', null] })).toEqual([
      'preferences[0] debe ser un objeto.',
      'preferences[1] debe ser un objeto.',
    ]);
  });

  it('exige kind, channel y enabled en cada preferencia', () => {
    expect(updateErrors({ preferences: [{}] })).toEqual([
      'preferences[0].kind es obligatorio.',
      'preferences[0].channel es obligatorio.',
      'preferences[0].enabled es obligatorio.',
    ]);
  });

  it('rechaza valores inválidos con el prefijo del índice', () => {
    expect(updateErrors({ preferences: [{ kind: 'ALERT', channel: 'SMS', enabled: 'true' }] })).toEqual([
      'preferences[0].kind no es válido. Valores permitidos: NEWS, COMMUNICATION, CHANGE, NOTIFICATION.',
      'preferences[0].channel no es válido. Valores permitidos: EMAIL, WHATSAPP.',
      'preferences[0].enabled debe ser un booleano.',
    ]);
  });

  it('rechaza enabled no booleano aunque sea truthy', () => {
    for (const enabled of [1, 0, 'false', null, {}]) {
      expect(updateErrors({ preferences: [{ ...validChange, enabled }] })).toEqual([
        'preferences[0].enabled debe ser un booleano.',
      ]);
    }
  });

  it('rechaza campos extra dentro de una preferencia', () => {
    expect(updateErrors({ preferences: [{ ...validChange, extra: 1, phone: 'x' }] })).toEqual([
      'preferences[0]: campos no permitidos: extra, phone.',
    ]);
  });

  it('rechaza combinaciones repetidas de kind y channel', () => {
    expect(
      updateErrors({
        preferences: [
          { kind: 'NEWS', channel: 'EMAIL', enabled: true },
          { kind: 'CHANGE', channel: 'EMAIL', enabled: false },
          { kind: 'NEWS', channel: 'EMAIL', enabled: false },
        ],
      }),
    ).toEqual(['preferences contiene combinaciones repetidas de kind y channel.']);
  });

  it('permite mismo kind con distinto channel y viceversa', () => {
    expect(
      parseUpdatePreferences({
        preferences: [
          { kind: 'NEWS', channel: 'EMAIL', enabled: true },
          { kind: 'NEWS', channel: 'WHATSAPP', enabled: true },
          { kind: 'CHANGE', channel: 'EMAIL', enabled: true },
        ],
      }).ok,
    ).toBe(true);
  });

  it('acumula todos los errores de cuerpo y preferencias', () => {
    const errors = updateErrors({
      phone: 'invalido',
      preferences: [
        'texto',
        { kind: 'ALERT', channel: 'SMS', enabled: 'si' },
        { ...validChange, extra: true },
      ],
      email: 'x',
    });
    expect(errors).toHaveLength(7);
    expect(errors.join(' ')).toMatch(/Campos no permitidos: email/);
    expect(errors.join(' ')).toMatch(/phone debe estar en formato internacional E\.164/);
    expect(errors.join(' ')).toMatch(/preferences\[0\] debe ser un objeto/);
    expect(errors.join(' ')).toMatch(/preferences\[1\]\.kind no es válido/);
    expect(errors.join(' ')).toMatch(/preferences\[1\]\.channel no es válido/);
    expect(errors.join(' ')).toMatch(/preferences\[1\]\.enabled debe ser un booleano/);
  });
});
