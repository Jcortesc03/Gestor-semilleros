import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listProjects, createProject, listBoards, createActivity, approveActivity, addAttachment, parseProject } from '../src/features/academic/api.ts';

const project = {
  id: '00000000-0000-0000-0000-000000000010', title: 'Proyecto', description: null, status: 'ACTIVE',
  area: { id: '00000000-0000-0000-0000-000000000001', name: 'Área' }, faculties: [], startsOn: null, endsOn: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const activity = { id: '00000000-0000-0000-0000-000000000050', boardId: '00000000-0000-0000-0000-000000000040', title: 'Actividad', description: null, progressStatus: 'PENDING', result: null, approvalStatus: 'PENDING', approvedBy: null, approvedAt: null, author: { id: '00000000-0000-0000-0000-000000000030', fullName: 'Autor' }, assignees: [], attachments: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const board = { id: '00000000-0000-0000-0000-000000000040', projectId: project.id, title: 'Tablero', dueDate: '2026-12-01', progressStatus: 'PENDING', result: null, responsibleTutor: { id: '00000000-0000-0000-0000-000000000030', fullName: 'Tutor' }, responsibleStudent: { id: '00000000-0000-0000-0000-000000000031', fullName: 'Estudiante' }, activityCount: 0, createdAt: '2026-01-01T00:00:00.000Z' };

test('academic adapters use documented project and board routes', async () => {
  const calls: Array<[string, unknown]> = [];
  const request = async (path: string, options?: unknown) => { calls.push([path, options]); return path.endsWith('/boards') ? [board] : options ? project : [project]; };
  assert.deepEqual(await listProjects(request), [project]);
  await createProject(request, { title: 'Proyecto', areaId: '00000000-0000-0000-0000-000000000001', facultyIds: ['00000000-0000-0000-0000-000000000002'] });
  await listBoards(request, project.id);
  assert.deepEqual(calls, [
    ['/api/projects', undefined],
    ['/api/projects', { method: 'POST', body: { title: 'Proyecto', areaId: '00000000-0000-0000-0000-000000000001', facultyIds: ['00000000-0000-0000-0000-000000000002'] } }],
    [`/api/projects/${project.id}/boards`, undefined],
  ]);
});

test('academic adapters send activity approval and reject malformed responses', async () => {
  const calls: Array<[string, unknown]> = [];
  const request = async (path: string, options?: unknown) => { calls.push([path, options]); return path.includes('/approval') ? activity : activity; };
  await createActivity(request, '00000000-0000-0000-0000-000000000040', { title: 'Actividad' });
  await approveActivity(request, '00000000-0000-0000-0000-000000000050', 'APPROVED');
  assert.deepEqual(calls[1], ['/api/activities/00000000-0000-0000-0000-000000000050/approval', { method: 'POST', body: { status: 'APPROVED' } }]);
  assert.throws(() => parseProject({ nope: true }));
});

test('academic workspace exposes explicit submit controls and documented mutation surfaces', () => {
  const source = readFileSync(new URL('../src/features/academic/AcademicWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /type="submit"/);
  assert.doesNotMatch(source, /<Button disabled=\{busy\}/);
  assert.match(source, /updateProject/);
  assert.match(source, /updateBoard/);
  assert.match(source, /updateMember/);
  assert.match(source, /addAssignee/);
  assert.match(source, /addAttachment/);
  assert.match(source, /approveActivity/);
});

test('attachment adapter rejects unsafe protocols before making a request', async () => {
  let called = false;
  const request = async () => { called = true; return activity; };
  assert.throws(() => addAttachment(request, activity.id, 'javascript:alert(1)'), /http o https/i);
  assert.equal(called, false);
});
