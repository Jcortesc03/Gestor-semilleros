import type { ApiRequest } from '../../types/api.ts';
import { ApiError, isRecord, parseArray } from '../../lib/api.ts';
import { DOCUMENT_FORMATS, type DocumentFormat } from '../documents/api.ts';

/** Contratos: `docs/api/users.md`, `announcements.md` y `notification-preferences.md`. */

export const GLOBAL_ROLES = ['ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR', 'STUDENT'] as const;
export const ANNOUNCEMENT_KINDS = ['NEWS', 'COMMUNICATION', 'CHANGE', 'NOTIFICATION'] as const;
/** Las preferencias añaden `MEETING` (avisos de reuniones) a los tipos de novedad. */
export const NOTIFICATION_KINDS = [...ANNOUNCEMENT_KINDS, 'MEETING'] as const;
export const NOTIFICATION_CHANNELS = ['EMAIL', 'WHATSAPP'] as const;
const AUDIENCE_TYPES = ['ALL', 'ROLE', 'FACULTY', 'AREA', 'PROJECT'] as const;
const DELIVERY_STATUSES = ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const;

export type GlobalRole = (typeof GLOBAL_ROLES)[number];
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export interface CreateUserInput { email: string; fullName: string; roles: GlobalRole[]; password?: string }
export interface CreatedUser { id: string; email: string; fullName: string; status: string; roles: string[]; hasPassword: boolean; createdAt: string }

/** Estado de una cuenta (`docs/api/users.md`, gestión de usuarios). */
export const USER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
/** Filtro de `GET /api/users?status=`; el servidor usa `ACTIVE` por defecto. */
export type UserStatusFilter = UserStatus | 'ALL';

/** Fila del listado de administración: datos del directorio más el estado. */
export interface AdminUserListItem { id: string; fullName: string; email: string; roles: GlobalRole[]; status: UserStatus }
/** `UserDetail`: nunca incluye la contraseña ni su hash. */
export interface UserDetail extends AdminUserListItem {
  hasPassword: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface ListUsersQuery { search?: string; role?: GlobalRole; status: UserStatusFilter; limit?: number }
/** Actualización parcial de `PATCH /api/users/:id`: solo se envían los campos que cambian. */
export interface UpdateUserInput { fullName?: string; roles?: GlobalRole[] }

export interface AnnouncementAudience {
  type: (typeof AUDIENCE_TYPES)[number];
  role?: string;
  faculty?: { id: string; name: string };
  area?: { id: string; name: string };
  project?: { id: string; title: string };
}
export type AnnouncementAudienceInput =
  | { type: 'ALL' }
  | { type: 'ROLE'; role: GlobalRole }
  | { type: 'FACULTY'; facultyId: string }
  | { type: 'AREA'; areaId: string }
  | { type: 'PROJECT'; projectId: string };
export interface CreateAnnouncementInput { kind?: AnnouncementKind; title: string; content: string; audiences: AnnouncementAudienceInput[] }

/** Límites de adjuntos de una noticia (ADR 0015): hasta 5 archivos; el tamaño se valida con `validateDocumentFile`. */
export const MAX_ANNOUNCEMENT_ATTACHMENTS = 5;

/** Archivo adjunto de una noticia: solo metadatos; el contenido se descarga por `announcementAttachmentUrl`. */
export interface AnnouncementAttachment { id: string; fileName: string; format: DocumentFormat; mimeType: string; sizeBytes: number }
export interface Announcement { id: string; kind: AnnouncementKind; title: string; content: string; publishedAt: string; author: { id: string; fullName: string }; audiences: AnnouncementAudience[]; attachments: AnnouncementAttachment[]; queuedDeliveries?: number }
export interface AnnouncementQuery { kind?: AnnouncementKind; limit?: number; before?: string }

export type DeliveryCounts = Record<DeliveryStatus, number>;
export type DeliverySummary = Record<NotificationChannel, DeliveryCounts>;

export interface NotificationPreference { kind: NotificationKind; channel: NotificationChannel; enabled: boolean }
export interface NotificationPreferences { phone: string | null; preferences: NotificationPreference[] }
/** Actualización parcial: solo se envían los campos que cambian. */
export interface NotificationPreferencesUpdate { phone?: string | null; preferences?: NotificationPreference[] }

export type WhatsAppStatus =
  | { transport: 'log' }
  | { transport: 'disabled' }
  | {
      transport: 'builderbot';
      provider: string;
      state: string;
      connectedPhone: string | null;
      /** Contenido de la credencial de vinculación: la interfaz no lo muestra. */
      qr: string | null;
      pairingCode: string | null;
      detail: string | null;
      updatedAt: string | undefined;
    };

export const WHATSAPP_QR_PATH = '/api/integrations/whatsapp/qr';

/**
 * URL de la imagen PNG del QR (`GET /api/integrations/whatsapp/qr`). Se usa en una etiqueta `img`
 * del mismo origen, así que el navegador envía la cookie de sesión. `version` evita reutilizar
 * una imagen anterior tras consultar de nuevo el estado.
 */
export function whatsappQrUrl(version = ''): string {
  return version ? `${WHATSAPP_QR_PATH}?v=${encodeURIComponent(version)}` : WHATSAPP_QR_PATH;
}

function fail(): never { throw new ApiError(0); }
function stringValue(value: unknown): string { return typeof value === 'string' ? value : fail(); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : fail(); }
function booleanValue(value: unknown): boolean { return typeof value === 'boolean' ? value : fail(); }
function countValue(value: unknown): number { return typeof value === 'number' ? value : fail(); }
function oneOf<T extends string>(allowed: readonly T[], value: unknown): T { return allowed.find((item) => item === value) ?? fail(); }
function nullableString(value: unknown): string | null { return value === null || value === undefined ? null : stringValue(value); }
function sizeValue(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fail(); }

function parseUser(value: unknown): CreatedUser {
  const v = record(value);
  return {
    id: stringValue(v.id),
    email: stringValue(v.email),
    fullName: stringValue(v.fullName),
    status: stringValue(v.status),
    roles: parseArray(v.roles, stringValue),
    hasPassword: booleanValue(v.hasPassword),
    createdAt: stringValue(v.createdAt),
  };
}

function parseAudience(value: unknown): AnnouncementAudience {
  const v = record(value);
  const result: AnnouncementAudience = { type: oneOf(AUDIENCE_TYPES, v.type) };
  if (typeof v.role === 'string') result.role = v.role;
  if (isRecord(v.faculty)) result.faculty = { id: stringValue(v.faculty.id), name: stringValue(v.faculty.name) };
  if (isRecord(v.area)) result.area = { id: stringValue(v.area.id), name: stringValue(v.area.name) };
  if (isRecord(v.project)) result.project = { id: stringValue(v.project.id), title: stringValue(v.project.title) };
  return result;
}

function parseAttachment(value: unknown): AnnouncementAttachment {
  const v = record(value);
  return {
    id: stringValue(v.id),
    fileName: stringValue(v.fileName),
    format: oneOf(DOCUMENT_FORMATS, v.format),
    mimeType: stringValue(v.mimeType),
    sizeBytes: sizeValue(v.sizeBytes),
  };
}

function parseAnnouncement(value: unknown): Announcement {
  const v = record(value);
  const author = record(v.author);
  return {
    id: stringValue(v.id),
    kind: oneOf(ANNOUNCEMENT_KINDS, v.kind),
    title: stringValue(v.title),
    content: stringValue(v.content),
    publishedAt: stringValue(v.publishedAt),
    author: { id: stringValue(author.id), fullName: stringValue(author.fullName) },
    audiences: parseArray(v.audiences, parseAudience),
    // Si el servidor no envía `attachments` (novedades anteriores a ADR 0015) se trata como lista vacía.
    attachments: v.attachments === undefined || v.attachments === null ? [] : parseArray(v.attachments, parseAttachment),
    ...(typeof v.queuedDeliveries === 'number' ? { queuedDeliveries: v.queuedDeliveries } : {}),
  };
}

function parseCounts(value: unknown): DeliveryCounts {
  const c = record(value);
  return { PENDING: countValue(c.PENDING), SENT: countValue(c.SENT), FAILED: countValue(c.FAILED), SKIPPED: countValue(c.SKIPPED) };
}

function parseDeliveries(value: unknown): DeliverySummary {
  const v = record(value);
  return { EMAIL: parseCounts(v.EMAIL), WHATSAPP: parseCounts(v.WHATSAPP) };
}

function parsePreference(value: unknown): NotificationPreference {
  const p = record(value);
  return { kind: oneOf(NOTIFICATION_KINDS, p.kind), channel: oneOf(NOTIFICATION_CHANNELS, p.channel), enabled: booleanValue(p.enabled) };
}

function parsePreferences(value: unknown): NotificationPreferences {
  const v = record(value);
  return { phone: nullableString(v.phone), preferences: parseArray(v.preferences, parsePreference) };
}

function parseWhatsAppStatus(value: unknown): WhatsAppStatus {
  const v = record(value);
  if (v.transport === 'log') return { transport: 'log' };
  if (v.transport === 'disabled') return { transport: 'disabled' };
  if (v.transport !== 'builderbot') return fail();
  return {
    transport: 'builderbot',
    provider: stringValue(v.provider),
    state: stringValue(v.state),
    connectedPhone: nullableString(v.connectedPhone),
    qr: nullableString(v.qr),
    pairingCode: nullableString(v.pairingCode),
    detail: nullableString(v.detail),
    updatedAt: v.updatedAt === undefined ? undefined : stringValue(v.updatedAt),
  };
}

export async function createInstitutionalUser(request: ApiRequest, body: CreateUserInput): Promise<CreatedUser> {
  return parseUser(await request('/api/users', { method: 'POST', body }));
}

function parseAdminUser(value: unknown): AdminUserListItem {
  const v = record(value);
  return {
    id: stringValue(v.id),
    fullName: stringValue(v.fullName),
    email: stringValue(v.email),
    roles: parseArray(v.roles, (item) => oneOf(GLOBAL_ROLES, item)),
    status: oneOf(USER_STATUSES, v.status),
  };
}

function parseUserDetail(value: unknown): UserDetail {
  const v = record(value);
  return {
    ...parseAdminUser(v),
    hasPassword: booleanValue(v.hasPassword),
    mustChangePassword: booleanValue(v.mustChangePassword),
    createdAt: stringValue(v.createdAt),
    updatedAt: stringValue(v.updatedAt),
  };
}

/** `GET /api/users` para administración: el filtro de estado siempre se envía de forma explícita. */
export async function listInstitutionalUsers(request: ApiRequest, query: ListUsersQuery): Promise<AdminUserListItem[]> {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.role) params.set('role', query.role);
  params.set('status', query.status);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  return parseArray(await request(`/api/users?${params.toString()}`), parseAdminUser);
}

export async function getInstitutionalUser(request: ApiRequest, id: string): Promise<UserDetail> {
  return parseUserDetail(await request(`/api/users/${encodeURIComponent(id)}`));
}

export async function updateInstitutionalUser(request: ApiRequest, id: string, body: UpdateUserInput): Promise<UserDetail> {
  return parseUserDetail(await request(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body }));
}

/** Desactiva o reactiva: `POST /api/users/:id/deactivate` o `/activate`. */
export async function setInstitutionalUserActive(request: ApiRequest, id: string, active: boolean): Promise<UserDetail> {
  const action = active ? 'activate' : 'deactivate';
  return parseUserDetail(await request(`/api/users/${encodeURIComponent(id)}/${action}`, { method: 'POST' }));
}

/** Fija una contraseña temporal: el usuario deberá cambiarla en su próximo inicio de sesión (204). */
export async function setTemporaryPassword(request: ApiRequest, id: string, password: string): Promise<void> {
  await request(`/api/users/${encodeURIComponent(id)}/password`, { method: 'PUT', body: { password } });
}

export async function getAnnouncements(request: ApiRequest, query: AnnouncementQuery = {}): Promise<Announcement[]> {
  const params = new URLSearchParams();
  if (query.kind) params.set('kind', query.kind);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.before) params.set('before', query.before);
  const suffix = params.toString();
  return parseArray(await request(`/api/announcements${suffix ? `?${suffix}` : ''}`), parseAnnouncement);
}

export async function getAnnouncement(request: ApiRequest, id: string): Promise<Announcement> {
  return parseAnnouncement(await request(`/api/announcements/${encodeURIComponent(id)}`));
}

/**
 * Publica una novedad. Sin archivos envía el JSON habitual; con archivos (solo noticias, ADR 0015) envía
 * `multipart/form-data` con el cuerpo JSON en `data` y cada archivo en `files`.
 */
export async function createAnnouncement(request: ApiRequest, body: CreateAnnouncementInput, files: readonly File[] = []): Promise<Announcement> {
  if (files.length === 0) {
    return parseAnnouncement(await request('/api/announcements', { method: 'POST', body }));
  }
  const form = new FormData();
  form.append('data', JSON.stringify(body));
  for (const file of files) form.append('files', file);
  return parseAnnouncement(await request('/api/announcements', { method: 'POST', body: form }));
}

/**
 * URL de descarga de un adjunto (mismo origen, con la cookie de sesión). `inline` sirve para previsualizar
 * PDF e imágenes en una pestaña nueva.
 */
export function announcementAttachmentUrl(announcementId: string, attachmentId: string, options: { inline?: boolean } = {}): string {
  const base = `/api/announcements/${encodeURIComponent(announcementId)}/attachments/${encodeURIComponent(attachmentId)}/download`;
  return options.inline ? `${base}?inline=true` : base;
}

export async function getAnnouncementDeliveries(request: ApiRequest, id: string): Promise<DeliverySummary> {
  return parseDeliveries(await request(`/api/announcements/${encodeURIComponent(id)}/deliveries`));
}

export async function removeAnnouncement(request: ApiRequest, id: string): Promise<void> {
  await request(`/api/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getNotificationPreferences(request: ApiRequest): Promise<NotificationPreferences> {
  return parsePreferences(await request('/api/me/notification-preferences'));
}

export async function updateNotificationPreferences(request: ApiRequest, body: NotificationPreferencesUpdate): Promise<NotificationPreferences> {
  return parsePreferences(await request('/api/me/notification-preferences', { method: 'PUT', body }));
}

export async function getWhatsAppStatus(request: ApiRequest): Promise<WhatsAppStatus> {
  return parseWhatsAppStatus(await request('/api/integrations/whatsapp/status'));
}

/** Proyecto elegible como destino de una novedad de tipo PROJECT (ADR 0010, sec. 8). */
export interface PublishableProject { id: string; title: string }

function parsePublishableProject(value: unknown): PublishableProject {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string') throw new ApiError(0);
  return { id: value.id, title: value.title };
}

/**
 * Proyectos destinatarios (docs/api/projects.md): `GET /api/projects` para administradores y decanos, y
 * `GET /api/projects/tutored` para tutores (proyectos donde son tutor `ACTIVE`). Si se piden ambas fuentes se
 * unen sin duplicados, conservando el orden de la primera. El servidor valida cada destino al publicar.
 */
export async function listProjectsForAudience(
  request: ApiRequest,
  sources: { visible: boolean; tutored: boolean },
): Promise<PublishableProject[]> {
  const visible = sources.visible ? parseArray(await request('/api/projects'), parsePublishableProject) : [];
  const tutored = sources.tutored ? parseArray(await request('/api/projects/tutored'), parsePublishableProject) : [];
  const seen = new Set(visible.map((item) => item.id));
  return [...visible, ...tutored.filter((item) => !seen.has(item.id))];
}
