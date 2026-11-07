import type { ApiRequest } from '../../types/api.ts';
import { ApiError, isRecord, parseArray } from '../../lib/api.ts';

const KINDS = ['NEWS', 'COMMUNICATION', 'CHANGE', 'NOTIFICATION'] as const;
const CHANNELS = ['EMAIL', 'WHATSAPP'] as const;
type Kind = (typeof KINDS)[number];
type Channel = (typeof CHANNELS)[number];

export interface CreatedUser { id: string; email: string; fullName: string; status: string; roles: string[]; hasPassword: boolean; createdAt: string }
export interface AnnouncementAudience { type: string; role?: string; faculty?: { id: string; name: string }; area?: { id: string; name: string }; project?: { id: string; title: string } }
export interface Announcement { id: string; kind: Kind; title: string; content: string; publishedAt: string; author: { id: string; fullName: string }; audiences: AnnouncementAudience[]; queuedDeliveries?: number }
export interface DeliverySummary { EMAIL: Record<'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED', number>; WHATSAPP: Record<'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED', number> }
export interface NotificationPreference { kind: Kind; channel: Channel; enabled: boolean }
export interface NotificationPreferences { phone: string | null; preferences: NotificationPreference[] }
export type WhatsAppStatus = { transport: 'log' | 'disabled' } | ({ transport: 'builderbot'; provider: string; state: string; connectedPhone: string | null; qr?: string | null; pairingCode?: string | null; detail?: string | null; updatedAt?: string });

function fail(): never { throw new ApiError(0); }
function stringValue(value: unknown): string { return typeof value === 'string' ? value : fail(); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : fail(); }
function parseUser(value: unknown): CreatedUser {
  const v = record(value);
  return { id: stringValue(v.id), email: stringValue(v.email), fullName: stringValue(v.fullName), status: stringValue(v.status), roles: parseArray(v.roles, stringValue), hasPassword: typeof v.hasPassword === 'boolean' ? v.hasPassword : fail(), createdAt: stringValue(v.createdAt) };
}
function parseAnnouncement(value: unknown): Announcement {
  const v = record(value); const author = record(v.author);
  return { id: stringValue(v.id), kind: KINDS.includes(v.kind as Kind) ? v.kind as Kind : fail(), title: stringValue(v.title), content: stringValue(v.content), publishedAt: stringValue(v.publishedAt), author: { id: stringValue(author.id), fullName: stringValue(author.fullName) }, audiences: parseArray(v.audiences, parseAudience), ...(typeof v.queuedDeliveries === 'number' ? { queuedDeliveries: v.queuedDeliveries } : {}) };
}
function parseAudience(value: unknown): AnnouncementAudience {
  const v = record(value); const type = stringValue(v.type);
  const result: AnnouncementAudience = { type };
  if (typeof v.role === 'string') result.role = v.role;
  if (isRecord(v.faculty)) result.faculty = { id: stringValue(v.faculty.id), name: stringValue(v.faculty.name) };
  if (isRecord(v.area)) result.area = { id: stringValue(v.area.id), name: stringValue(v.area.name) };
  if (isRecord(v.project)) result.project = { id: stringValue(v.project.id), title: stringValue(v.project.title) };
  return result;
}
function parsePreferences(value: unknown): NotificationPreferences {
  const v = record(value);
  return { phone: v.phone === null ? null : stringValue(v.phone), preferences: parseArray(v.preferences, (item) => { const p = record(item); return { kind: KINDS.includes(p.kind as Kind) ? p.kind as Kind : fail(), channel: CHANNELS.includes(p.channel as Channel) ? p.channel as Channel : fail(), enabled: typeof p.enabled === 'boolean' ? p.enabled : fail() }; }) };
}
function parseDeliveries(value: unknown): DeliverySummary {
  const v = record(value); const parseChannel = (item: unknown) => { const c = record(item); return { PENDING: typeof c.PENDING === 'number' ? c.PENDING : fail(), SENT: typeof c.SENT === 'number' ? c.SENT : fail(), FAILED: typeof c.FAILED === 'number' ? c.FAILED : fail(), SKIPPED: typeof c.SKIPPED === 'number' ? c.SKIPPED : fail() }; };
  return { EMAIL: parseChannel(v.EMAIL), WHATSAPP: parseChannel(v.WHATSAPP) };
}
function parseStatus(value: unknown): WhatsAppStatus {
  const v = record(value); if (v.transport === 'log' || v.transport === 'disabled') return { transport: v.transport };
  if (v.transport !== 'builderbot') return fail();
  return { transport: 'builderbot', provider: stringValue(v.provider), state: stringValue(v.state), connectedPhone: v.connectedPhone === null ? null : stringValue(v.connectedPhone), qr: v.qr === null || v.qr === undefined ? null : stringValue(v.qr), pairingCode: v.pairingCode === null || v.pairingCode === undefined ? null : stringValue(v.pairingCode), detail: v.detail === null || v.detail === undefined ? null : stringValue(v.detail), updatedAt: v.updatedAt === undefined ? undefined : stringValue(v.updatedAt) };
}

export async function createInstitutionalUser(request: ApiRequest, body: { email: string; fullName: string; roles: string[]; password?: string }): Promise<CreatedUser> { return parseUser(await request('/api/users', { method: 'POST', body })); }
export async function getAnnouncements(request: ApiRequest, query: { kind?: Kind; limit?: number; before?: string } = {}): Promise<Announcement[]> { const params = new URLSearchParams(); if (query.kind) params.set('kind', query.kind); if (query.limit !== undefined) params.set('limit', String(query.limit)); if (query.before) params.set('before', query.before); const suffix = params.toString(); return parseArray(await request(`/api/announcements${suffix ? `?${suffix}` : ''}`), parseAnnouncement); }
export async function getAnnouncement(request: ApiRequest, id: string): Promise<Announcement> { return parseAnnouncement(await request(`/api/announcements/${encodeURIComponent(id)}`)); }
export async function createAnnouncement(request: ApiRequest, body: unknown): Promise<Announcement> { return parseAnnouncement(await request('/api/announcements', { method: 'POST', body })); }
export async function getAnnouncementDeliveries(request: ApiRequest, id: string): Promise<DeliverySummary> { return parseDeliveries(await request(`/api/announcements/${encodeURIComponent(id)}/deliveries`)); }
export async function removeAnnouncement(request: ApiRequest, id: string): Promise<void> { await request(`/api/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export async function getNotificationPreferences(request: ApiRequest): Promise<NotificationPreferences> { return parsePreferences(await request('/api/me/notification-preferences')); }
export async function updateNotificationPreferences(request: ApiRequest, body: unknown): Promise<NotificationPreferences> { return parsePreferences(await request('/api/me/notification-preferences', { method: 'PUT', body })); }
export async function getWhatsAppStatus(request: ApiRequest): Promise<WhatsAppStatus> { return parseStatus(await request('/api/integrations/whatsapp/status')); }
