import { ApiError, isRecord, parseArray } from '../../lib/api.ts';
import type { ApiRequest } from '../../types/api.ts';

export const MEETING_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export interface MicrosoftStatus {
  configured: boolean;
  linked: boolean;
  email: string | null;
  linkedAt: string | null;
}

export interface MeetingPerson { id: string; fullName: string }

export interface Meeting {
  id: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: MeetingStatus;
  joinUrl: string | null;
  recordingUrl: string | null;
  cancelledAt: string | null;
  project: { id: string; title: string } | null;
  organizer: MeetingPerson;
  participants: MeetingPerson[];
}

export interface CancelledMeeting extends Meeting { teamsSynced: boolean }

export interface MeetingProject { id: string; title: string }
export interface ProjectMember { userId: string; fullName: string; email: string; projectRole: string }

export interface CreateMeetingInput {
  reason: string;
  startsAt: string;
  durationMinutes: number;
  projectId?: string | null;
  participantIds: string[];
}

export interface MeetingFilters { status?: MeetingStatus; from?: string; to?: string; limit?: number }

function fail(): never { throw new ApiError(0); }
function str(value: unknown): string { if (typeof value !== 'string') fail(); return value; }
function nullableStr(value: unknown): string | null { if (value === null || value === undefined) return null; return str(value); }
function bool(value: unknown): boolean { if (typeof value !== 'boolean') fail(); return value; }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) fail(); return value; }

function parsePerson(value: unknown): MeetingPerson {
  const r = record(value);
  return { id: str(r.id), fullName: str(r.fullName) };
}

function parseStatus(value: unknown): MeetingStatus {
  const s = str(value);
  if (!(MEETING_STATUSES as readonly string[]).includes(s)) fail();
  return s as MeetingStatus;
}

export function parseMicrosoftStatus(value: unknown): MicrosoftStatus {
  const r = record(value);
  return { configured: bool(r.configured), linked: bool(r.linked), email: nullableStr(r.email), linkedAt: nullableStr(r.linkedAt) };
}

export function parseMeeting(value: unknown): Meeting {
  const r = record(value);
  const durationMinutes = r.durationMinutes;
  if (typeof durationMinutes !== 'number' || !Number.isFinite(durationMinutes)) fail();
  let project: Meeting['project'] = null;
  if (r.project !== null && r.project !== undefined) {
    const p = record(r.project);
    project = { id: str(p.id), title: str(p.title) };
  }
  return {
    id: str(r.id),
    reason: str(r.reason),
    startsAt: str(r.startsAt),
    endsAt: str(r.endsAt),
    durationMinutes,
    status: parseStatus(r.status),
    joinUrl: nullableStr(r.joinUrl),
    recordingUrl: nullableStr(r.recordingUrl),
    cancelledAt: nullableStr(r.cancelledAt),
    project,
    organizer: parsePerson(r.organizer),
    participants: parseArray(r.participants, parsePerson),
  };
}

function parseCancelled(value: unknown): CancelledMeeting {
  return { ...parseMeeting(value), teamsSynced: bool(record(value).teamsSynced) };
}

function parseProject(value: unknown): MeetingProject {
  const r = record(value);
  return { id: str(r.id), title: str(r.title) };
}

function parseMember(value: unknown): ProjectMember {
  const r = record(value);
  const user = record(r.user);
  return { userId: str(user.id), fullName: str(user.fullName), email: str(user.email), projectRole: str(r.projectRole) };
}

const enc = encodeURIComponent;

export async function getMicrosoftStatus(request: ApiRequest): Promise<MicrosoftStatus> {
  return parseMicrosoftStatus(await request('/api/integrations/microsoft/status'));
}

/** Pide la URL de consentimiento; el navegador debe navegar a ella (no es un inicio de sesión). */
export async function getMicrosoftConnectUrl(request: ApiRequest): Promise<string> {
  const url = str(record(await request('/api/integrations/microsoft/connect?format=json')).url);
  let parsed: URL;
  try { parsed = new URL(url); } catch { return fail(); }
  if (parsed.protocol !== 'https:') fail();
  return url;
}

export async function unlinkMicrosoft(request: ApiRequest): Promise<void> {
  await request('/api/integrations/microsoft/link', { method: 'DELETE' });
}

export async function getMeetings(request: ApiRequest, filters: MeetingFilters = {}): Promise<Meeting[]> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  const query = params.toString();
  return parseArray(await request(`/api/meetings${query ? `?${query}` : ''}`), parseMeeting);
}

export async function getMeeting(request: ApiRequest, id: string): Promise<Meeting> {
  return parseMeeting(await request(`/api/meetings/${enc(id)}`));
}

export async function createMeeting(request: ApiRequest, input: CreateMeetingInput): Promise<Meeting> {
  return parseMeeting(await request('/api/meetings', { method: 'POST', body: input }));
}

export async function changeMeetingStatus(
  request: ApiRequest,
  id: string,
  status: Exclude<MeetingStatus, 'SCHEDULED'>,
  comment?: string | null,
): Promise<Meeting | CancelledMeeting> {
  const body = status === 'CANCELLED' && comment ? { status, comment } : { status };
  const result = await request(`/api/meetings/${enc(id)}/status`, { method: 'PATCH', body });
  return status === 'CANCELLED' ? parseCancelled(result) : parseMeeting(result);
}

export async function setMeetingRecording(request: ApiRequest, id: string, recordingUrl: string | null): Promise<Meeting> {
  return parseMeeting(await request(`/api/meetings/${enc(id)}/recording`, { method: 'PUT', body: { recordingUrl } }));
}

export async function getMeetingProjects(request: ApiRequest): Promise<MeetingProject[]> {
  return parseArray(await request('/api/projects'), parseProject);
}

export async function getProjectMembers(request: ApiRequest, projectId: string): Promise<ProjectMember[]> {
  return parseArray(await request(`/api/projects/${enc(projectId)}/members`), parseMember);
}
