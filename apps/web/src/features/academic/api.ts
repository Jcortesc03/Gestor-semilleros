import type { ApiRequest } from '../../types/api.ts';
import { ApiError, isRecord, parseArray } from '../../lib/api.ts';
import type { DocumentFormat } from '../documents/api.ts';

export type ProjectStatus = 'ACTIVE' | 'FINISHED' | 'CANCELLED';
export type ProjectRole = 'TUTOR' | 'STUDENT' | 'STUDENT_LEADER';
export type ProgressStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type ResultStatus = 'SUCCESS' | 'FAILURE';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface Project { id: string; title: string; description: string | null; status: ProjectStatus; area: { id: string; name: string }; faculties: Array<{ id: string; name: string }>; startsOn: string | null; endsOn: string | null; createdAt: string }
export interface Member { id: string; user: { id: string; fullName: string; email: string }; projectRole: ProjectRole; isPrimary: boolean; status: 'ACTIVE' | 'INACTIVE'; joinedAt: string; leftAt: string | null }
export interface Board { id: string; projectId: string; title: string; dueDate: string; progressStatus: ProgressStatus; result: ResultStatus | null; responsibleTutor: { id: string; fullName: string }; responsibleStudent: { id: string; fullName: string }; activityCount: number; createdAt: string }
export interface Activity { id: string; boardId: string; title: string; description: string | null; progressStatus: ProgressStatus; result: ResultStatus | null; approvalStatus: ApprovalStatus; approvedBy: { id: string; fullName: string } | null; approvedAt: string | null; author: { id: string; fullName: string }; assignees: Array<{ user: { id: string; fullName: string }; assignedAt: string }>; attachments: Attachment[]; createdAt: string; updatedAt: string }
export interface AttachmentDocument { id: string; fileName: string; format: DocumentFormat; sizeBytes: number }
export interface Attachment { id: string; kind: 'LINK' | 'DOCUMENT'; url: string | null; documentId: string | null; document: AttachmentDocument | null; createdBy: { id: string; fullName: string }; createdAt: string }

const text = (value: unknown): value is string => typeof value === 'string';
const id = (value: unknown): value is string => text(value) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): Record<string, unknown> => { if (!isRecord(value)) throw new ApiError(0); return value; };
const requiredText = (value: unknown, name: string) => { if (!text(value)) throw new ApiError(0); return value; };
const person = (value: unknown) => { const v = object(value); return { id: requiredId(v.id), fullName: requiredText(v.fullName, 'fullName') }; };
const requiredId = (value: unknown) => { if (!id(value)) throw new ApiError(0); return value; };
const oneOf = <const T extends string>(value: unknown, values: readonly T[]): T => { if (typeof value !== 'string' || !values.includes(value as T)) throw new ApiError(0); return value as T; };

export function parseProject(value: unknown): Project { const v = object(value); const area = object(v.area); if (!id(v.id) || !text(v.title) || !['ACTIVE', 'FINISHED', 'CANCELLED'].includes(String(v.status)) || !id(area.id) || !text(area.name) || !Array.isArray(v.faculties)) throw new ApiError(0); return { id: v.id, title: v.title, description: v.description === null || text(v.description) ? v.description : null, status: v.status as ProjectStatus, area: { id: area.id, name: area.name }, faculties: v.faculties.map((f) => { const x = object(f); return { id: requiredId(x.id), name: requiredText(x.name, 'name') }; }), startsOn: v.startsOn === null || text(v.startsOn) ? v.startsOn : null, endsOn: v.endsOn === null || text(v.endsOn) ? v.endsOn : null, createdAt: requiredText(v.createdAt, 'createdAt') }; }
export function parseMember(value: unknown): Member { const v = object(value); const u = object(v.user); if (!id(v.id) || !id(u.id) || !text(u.fullName) || !text(u.email)) throw new ApiError(0); return { id: v.id, user: { id: u.id, fullName: u.fullName, email: u.email }, projectRole: oneOf(v.projectRole, ['TUTOR', 'STUDENT', 'STUDENT_LEADER']), isPrimary: v.isPrimary === true, status: oneOf(v.status, ['ACTIVE', 'INACTIVE']), joinedAt: requiredText(v.joinedAt, 'joinedAt'), leftAt: v.leftAt === null || text(v.leftAt) ? v.leftAt : null }; }
export function parseBoard(value: unknown): Board { const v = object(value); if (!id(v.id) || !id(v.projectId) || !text(v.title) || !text(v.dueDate)) throw new ApiError(0); return { id: v.id, projectId: v.projectId, title: v.title, dueDate: v.dueDate, progressStatus: oneOf(v.progressStatus, ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED']), result: v.result === null ? null : oneOf(v.result, ['SUCCESS', 'FAILURE']), responsibleTutor: person(v.responsibleTutor), responsibleStudent: person(v.responsibleStudent), activityCount: typeof v.activityCount === 'number' ? v.activityCount : 0, createdAt: requiredText(v.createdAt, 'createdAt') }; }
export function parseActivity(value: unknown): Activity { const v = object(value); if (!id(v.id) || !id(v.boardId) || !text(v.title)) throw new ApiError(0); return { id: v.id, boardId: v.boardId, title: v.title, description: v.description === null || text(v.description) ? v.description : null, progressStatus: oneOf(v.progressStatus, ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED']), result: v.result === null ? null : oneOf(v.result, ['SUCCESS', 'FAILURE']), approvalStatus: oneOf(v.approvalStatus, ['PENDING', 'APPROVED', 'REJECTED']), approvedBy: v.approvedBy === null ? null : person(v.approvedBy), approvedAt: v.approvedAt === null || text(v.approvedAt) ? v.approvedAt : null, author: person(v.author), assignees: Array.isArray(v.assignees) ? v.assignees.map((a) => { const x = object(a); return { user: person(x.user), assignedAt: requiredText(x.assignedAt, 'assignedAt') }; }) : [], attachments: Array.isArray(v.attachments) ? v.attachments.map(parseAttachment) : [], createdAt: requiredText(v.createdAt, 'createdAt'), updatedAt: requiredText(v.updatedAt, 'updatedAt') }; }
function parseAttachment(value: unknown): Attachment { const v = object(value); return { id: requiredId(v.id), kind: v.kind === 'DOCUMENT' ? 'DOCUMENT' : 'LINK', url: v.url === null || text(v.url) ? v.url : null, documentId: v.documentId === null || text(v.documentId) ? v.documentId : null, document: v.document === null || v.document === undefined ? null : parseAttachmentDocument(v.document), createdBy: person(v.createdBy), createdAt: requiredText(v.createdAt, 'createdAt') }; }
function parseAttachmentDocument(value: unknown): AttachmentDocument { const v = object(value); if (typeof v.sizeBytes !== 'number') throw new ApiError(0); return { id: requiredId(v.id), fileName: requiredText(v.fileName, 'fileName'), format: oneOf(v.format, ['PDF', 'WORD', 'EXCEL', 'IMAGE'] as const), sizeBytes: v.sizeBytes }; }
const path = (...parts: string[]) => parts.map((part) => encodeURIComponent(part)).join('/');
const write = async <T>(request: ApiRequest, url: string, body: unknown, parser: (v: unknown) => T) => parser(await request(url, { method: 'POST', body }));

export const listProjects = async (request: ApiRequest) => parseArray(await request('/api/projects'), parseProject);
export const getProject = async (request: ApiRequest, projectId: string) => parseProject(await request(`/api/projects/${path(projectId)}`));
export const createProject = (request: ApiRequest, body: unknown) => write(request, '/api/projects', body, parseProject);
export const updateProject = async (request: ApiRequest, projectId: string, body: unknown) => parseProject(await request(`/api/projects/${path(projectId)}`, { method: 'PATCH', body }));
export const deleteProject = (request: ApiRequest, projectId: string) => request(`/api/projects/${path(projectId)}`, { method: 'DELETE' });
export const listMembers = async (request: ApiRequest, projectId: string, includeInactive = false) => parseArray(await request(`/api/projects/${path(projectId)}/members${includeInactive ? '?includeInactive=true' : ''}`), parseMember);
export const addMember = (request: ApiRequest, projectId: string, body: unknown) => write(request, `/api/projects/${path(projectId)}/members`, body, parseMember);
export const updateMember = async (request: ApiRequest, projectId: string, memberId: string, body: unknown) => parseMember(await request(`/api/projects/${path(projectId)}/members/${path(memberId)}`, { method: 'PATCH', body }));
export const deleteMember = (request: ApiRequest, projectId: string, memberId: string) => request(`/api/projects/${path(projectId)}/members/${path(memberId)}`, { method: 'DELETE' });
export const listBoards = async (request: ApiRequest, projectId: string) => parseArray(await request(`/api/projects/${path(projectId)}/boards`), parseBoard);
export const createBoard = (request: ApiRequest, projectId: string, body: unknown) => write(request, `/api/projects/${path(projectId)}/boards`, body, parseBoard);
export const updateBoard = async (request: ApiRequest, boardId: string, body: unknown) => parseBoard(await request(`/api/boards/${path(boardId)}`, { method: 'PATCH', body }));
export const deleteBoard = (request: ApiRequest, boardId: string) => request(`/api/boards/${path(boardId)}`, { method: 'DELETE' });
export const listActivities = async (request: ApiRequest, boardId: string) => parseArray(await request(`/api/boards/${path(boardId)}/activities`), parseActivity);
export const createActivity = (request: ApiRequest, boardId: string, body: unknown) => write(request, `/api/boards/${path(boardId)}/activities`, body, parseActivity);
export const updateActivity = async (request: ApiRequest, activityId: string, body: unknown) => parseActivity(await request(`/api/activities/${path(activityId)}`, { method: 'PATCH', body }));
export const deleteActivity = (request: ApiRequest, activityId: string) => request(`/api/activities/${path(activityId)}`, { method: 'DELETE' });
export const approveActivity = (request: ApiRequest, activityId: string, status: ApprovalStatus) => write(request, `/api/activities/${path(activityId)}/approval`, { status }, parseActivity);
export const addAssignee = (request: ApiRequest, activityId: string, userId: string) => write(request, `/api/activities/${path(activityId)}/assignees`, { userId }, parseActivity);
export const removeAssignee = (request: ApiRequest, activityId: string, userId: string) => request(`/api/activities/${path(activityId)}/assignees/${path(userId)}`, { method: 'DELETE' }).then(parseActivity);
export const addAttachment = (request: ApiRequest, activityId: string, url: string) => {
  try { const parsed = new URL(url); if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error(); } catch { throw new Error('El enlace debe usar http o https.'); }
  return write(request, `/api/activities/${path(activityId)}/attachments`, { kind: 'LINK', url }, parseActivity);
};
/** Adjunta un documento del mismo proyecto (`docs/api/documents.md`); el servidor valida pertenencia y permisos. */
export const addDocumentAttachment = (request: ApiRequest, activityId: string, documentId: string) => write(request, `/api/activities/${path(activityId)}/attachments`, { kind: 'DOCUMENT', documentId }, parseActivity);
export const removeAttachment = (request: ApiRequest, activityId: string, attachmentId: string) => request(`/api/activities/${path(activityId)}/attachments/${path(attachmentId)}`, { method: 'DELETE' }).then(parseActivity);
