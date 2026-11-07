import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOBAL_ROLES, ROLE_LABELS } from '../src/lib/roles.ts';

test('presenta los cinco roles globales sin convertir al líder de proyecto en un rol global', () => {
  assert.deepEqual(GLOBAL_ROLES, ['ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR', 'STUDENT']);
  assert.deepEqual(ROLE_LABELS, {
    ADMIN: 'Administrador',
    AREA_MANAGER: 'Encargado de área',
    DEAN: 'Decano',
    TUTOR: 'Tutor',
    STUDENT: 'Estudiante',
  });
});
