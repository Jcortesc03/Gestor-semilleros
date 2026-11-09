import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../../config/env';
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../database/prisma.service';
import { CatalogsService } from '../../faculties';
import type { AuthUser } from '../../auth';
import { PasswordService } from '../../auth';
import type { SheetProvider } from '../models/sheet-provider';
import { SHEET_PROVIDER } from '../models/sheet-provider';
import { ENROLLMENT_APPROVAL_MAILER, type EnrollmentApprovalMailer } from './enrollment-approval-mailer';
import { Prisma } from '../../../generated/prisma/client';
import {
  EnrollmentAreaType,
  EnrollmentDocumentType,
  EnrollmentFaculty,
  EnrollmentStatus,
} from '../../../generated/prisma/enums';
import type { SourceConfigDto, ListQuery } from '../dtos/enrollment.dto';
import { parseSheet, type NormalizedRow } from './row-normalizer';

const FORBIDDEN = 'No tienes permisos para realizar esta acción.';
const NOT_FOUND = 'Inscripción no encontrada.';
const SERVICE_UNAVAILABLE = 'La integración con Google Sheets no está configurada.';
const MAX_CLEANUP_BATCH = 100;
const PREVIEW_TTL_MS = 15 * 60 * 1000;
const ACCEPTANCE_SUBJECT = 'Inscripción aprobada - Universidad de Colombia';

function acceptanceBody(email: string, temporaryPassword: string): string {
  return `Por parte de la Universidad de Colombia, ya tienes acceso a la plataforma de Semilleros. Correo: ${email}. Contraseña temporal: ${temporaryPassword}. Por tu seguridad, cambia la contraseña apenas ingresar.`;
}
const EMAIL_EXISTS_MESSAGE = 'Ya existe un usuario con ese correo.';

function generateTemporaryPassword(): string {
  for (;;) {
    const password = randomBytes(15).toString('base64url');
    if (/\p{L}/u.test(password) && /\p{N}/u.test(password)) return password;
  }
}

interface PreviewTokenPayload {
  v: number;
  actorId: string;
  areaId: string;
  source: { spreadsheetId: string; range: string; areaType: EnrollmentAreaType; updatedAt: string; revision: number };
  snapshotHash: string;
  exp: number;
}

interface PreviewRow {
  sourceRow: number;
  firstNames: string;
  lastNames: string;
  email: string;
  documentType: EnrollmentDocumentType | null;
  documentNumber: string;
  faculty: EnrollmentFaculty | null;
  areaType: EnrollmentAreaType;
  period: string;
  consent: boolean;
  errors: string[];
  duplicate: boolean;
}

interface PreviewSummary {
  read: number;
  valid: number;
  invalid: number;
  duplicates: number;
}

export interface PreviewResult {
  previewToken: string;
  rows: PreviewRow[];
  summary: PreviewSummary;
}

export interface EnrollmentItem {
  id: string;
  firstNames: string;
  lastNames: string;
  email: string;
  documentType: EnrollmentDocumentType;
  documentNumber: string;
  faculty: EnrollmentFaculty;
  areaId: string;
  areaType: EnrollmentAreaType;
  period: string;
  status: EnrollmentStatus;
  createdAt: Date;
  rejectedAt: Date | null;
}

@Injectable()
export class EnrollmentService implements OnModuleInit, OnModuleDestroy {
  private readonly config: AppEnv['enrollment'];
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) env: AppEnv,
    @Inject(SHEET_PROVIDER) private readonly sheetProvider: SheetProvider,
    private readonly catalogs: CatalogsService,
    private readonly passwords: PasswordService,
    @Inject(ENROLLMENT_APPROVAL_MAILER) private readonly approvalMailer: EnrollmentApprovalMailer,
  ) {
    this.config = env.enrollment;
  }

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      await this.cleanupExpired().catch(() => undefined);
      this.cleanupTimer = setInterval(() => {
        void this.cleanupExpired().catch(() => undefined);
      }, this.config.cleanupIntervalMs);
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  // ---------- helpers ----------

  private async assertAreaAccess(user: AuthUser, areaId: string): Promise<void> {
    if (user.roles.includes('ADMIN')) return;
    if (user.roles.includes('AREA_MANAGER')) {
      const areas = await this.catalogs.listAreas('managed', user.id);
      if (areas.some((area) => area.id === areaId)) return;
    }
    throw new ForbiddenException(FORBIDDEN);
  }

  private async accessibleAreaIds(user: AuthUser): Promise<string[]> {
    const scope = user.roles.includes('ADMIN') ? null : 'managed';
    const areas = await this.catalogs.listAreas(scope, user.id);
    return areas.map((a) => a.id);
  }

  private async loadSource(areaId: string) {
    return this.prisma.enrollmentSource.findUnique({ where: { areaId } });
  }

  private trustedSpreadsheet(areaId: string, spreadsheetId: string): boolean {
    const allowed = this.config.allowlist[areaId];
    if (!allowed || allowed.length === 0) return false;
    return allowed.includes(spreadsheetId);
  }

  private hmac(data: string): string {
    return createHmac('sha256', this.config.previewTokenSecret).update(data).digest('base64url');
  }

  private signToken(payload: PreviewTokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.hmac(body)}`;
  }

  private verifyToken(token: string): PreviewTokenPayload {
    const parts = token.split('.');
    if (parts.length !== 2) throw new BadRequestException({ message: 'Datos inválidos.', errors: ['previewToken inválido.'] });
    const [body, sig] = parts;
    const expected = Buffer.from(this.hmac(body));
    const supplied = Buffer.from(sig);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['previewToken inválido.'] });
    }
    let payload: PreviewTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PreviewTokenPayload;
    } catch {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['previewToken inválido.'] });
    }
    if (payload.v !== 1 || !payload.actorId || !payload.areaId || !payload.source || !payload.snapshotHash || !payload.exp) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['previewToken inválido.'] });
    }
    if (Date.now() > payload.exp) throw new BadRequestException({ message: 'Datos inválidos.', errors: ['previewToken expirado.'] });
    return payload;
  }

  private snapshotHash(rawRows: string[][]): string {
    return createHash('sha256').update(JSON.stringify(rawRows)).digest('hex');
  }

  private receiptHash(areaId: string, row: NormalizedRow): string {
    // Stable across sorting, row insertion and source replacement, without retaining the identifier.
    return this.hmac(JSON.stringify(['enrollment-receipt', areaId, row.period, row.documentType, row.documentNumber]));
  }

  private audit(tx: Prisma.TransactionClient, action: string, actorId: string | null,
    areaId: string | null, affectedCount: number, details: Prisma.InputJsonValue = {}) {
    return tx.enrollmentAuditEvent.create({ data: { action, actorId, areaId, affectedCount, details } });
  }

  private async ensureSheetConfigured(areaId: string) {
    const source = await this.loadSource(areaId);
    if (!source) throw new ServiceUnavailableException(SERVICE_UNAVAILABLE);
    if (!this.trustedSpreadsheet(areaId, source.spreadsheetId)) throw new ForbiddenException(FORBIDDEN);
    if (!this.config.google) throw new ServiceUnavailableException(SERVICE_UNAVAILABLE);
    return source;
  }

  // ---------- options ----------

  async options(user: AuthUser) {
    const areas = await this.catalogs.listAreas(user.roles.includes('ADMIN') ? null : 'managed', user.id);
    const areaSources = await this.prisma.enrollmentSource.findMany({ where: { areaId: { in: areas.map((a) => a.id) } } });
    const sourceMap = new Map(areaSources.map((s) => [s.areaId, s]));
    return {
      areas: areas.map((a) => {
        const s = sourceMap.get(a.id);
        return {
          id: a.id,
          name: a.name,
          sourceConfigured: Boolean(s),
          source: s ? { spreadsheetId: s.spreadsheetId, range: s.range, areaType: s.areaType } : null,
        };
      }),
      faculties: [
        { value: 'SYSTEMS_ENGINEERING', label: 'Ingeniería de Sistemas' },
        { value: 'SOFTWARE_ENGINEERING', label: 'Ingeniería de Software' },
      ],
      areaTypes: [
        { value: 'SEEDLING', label: 'Semillero' },
        { value: 'DEGREE_PROJECT', label: 'Proyecto de grado' },
      ],
      documentTypes: [
        { value: 'CC', label: 'CC' },
        { value: 'TI', label: 'TI' },
      ],
      statuses: [
        { value: 'PENDING', label: 'Pendiente' },
        { value: 'ACCEPTED', label: 'Aceptada' },
        { value: 'REJECTED', label: 'Rechazada' },
      ],
    };
  }

  // ---------- sources ----------

  async configureSource(user: AuthUser, areaId: string, dto: SourceConfigDto) {
    await this.assertAreaAccess(user, areaId);
    const accessible = await this.accessibleAreaIds(user);
    if (!accessible.includes(areaId)) throw new NotFoundException('Área no encontrada.');
    if (!this.trustedSpreadsheet(areaId, dto.spreadsheetId)) {
      throw new ForbiddenException('La hoja no está autorizada para esta área.');
    }
    const saved = await this.prisma.$transaction(async (tx) => {
      const source = await tx.enrollmentSource.upsert({
        where: { areaId },
        update: { spreadsheetId: dto.spreadsheetId, range: dto.range, areaType: dto.areaType, revision: { increment: 1 } },
        create: { areaId, spreadsheetId: dto.spreadsheetId, range: dto.range, areaType: dto.areaType },
      });
      await this.audit(tx, 'SOURCE_CONFIGURED', user.id, areaId, 1, { areaType: dto.areaType });
      return source;
    });
    return { spreadsheetId: saved.spreadsheetId, range: saved.range, areaType: saved.areaType };
  }

  // ---------- preview ----------

  async preview(user: AuthUser, areaId: string): Promise<PreviewResult> {
    await this.assertAreaAccess(user, areaId);
    const source = await this.ensureSheetConfigured(areaId);
    // read sheet
    let values: string[][];
    try {
      values = await this.sheetProvider.read(source.spreadsheetId, source.range);
    } catch {
      throw new ServiceUnavailableException(SERVICE_UNAVAILABLE);
    }
    if (values.length > this.config.maxSheetRows + 1) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['La hoja supera el máximo de filas permitidas.'] });
    }
    const headers = values[0] ?? [];
    const dataRows = values.slice(1);
    const { normalized } = parseSheet(headers, dataRows, source.areaType as EnrollmentAreaType);

    // existing records for dedup
    const existing = await this.prisma.enrollmentApplication.findMany({ where: { areaId } });
    const existingDocKeys = new Set(existing.map((r) => `${r.areaId}|${r.period}|${r.documentType}|${r.documentNumber}`));
    const existingEmailKeys = new Set(existing.map((r) => `${r.areaId}|${r.period}|${r.email}`));
    const tombstones = await this.prisma.enrollmentImportTombstone.findMany({ where: { areaId } });
    const tombstoneSet = new Set(tombstones.map((t) => t.receiptHash));

    const seenDocKeys = new Set<string>();
    const seenEmailKeys = new Set<string>();

    const rows: PreviewRow[] = normalized.map((row) => {
      if (row.outsideArea) {
        return { sourceRow: row.sourceRow, firstNames: '', lastNames: '', email: '', documentType: null,
          documentNumber: '', faculty: null, areaType: row.areaType, period: '', consent: false,
          errors: row.errors, duplicate: false };
      }
      const rHash = this.receiptHash(areaId, row);
      let duplicate = false;
      if (row.errors.length === 0 && row.documentType && row.faculty) {
        const docKey = `${areaId}|${row.period}|${row.documentType}|${row.documentNumber}`;
        const emailKey = `${areaId}|${row.period}|${row.email}`;
        if (tombstoneSet.has(rHash)) duplicate = true;
        else if (existingDocKeys.has(docKey)) duplicate = true;
        else if (existingEmailKeys.has(emailKey)) duplicate = true;
        else if (seenDocKeys.has(docKey)) duplicate = true;
        else if (seenEmailKeys.has(emailKey)) duplicate = true;
        if (!duplicate) {
          seenDocKeys.add(docKey);
          seenEmailKeys.add(emailKey);
        }
      }
      return {
        sourceRow: row.sourceRow,
        firstNames: row.firstNames,
        lastNames: row.lastNames,
        email: row.email,
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        faculty: row.faculty,
        areaType: row.areaType,
        period: row.period,
        consent: row.consent,
        errors: row.errors,
        duplicate,
      };
    });

    const valid = rows.filter((r) => r.errors.length === 0 && !r.duplicate).length;
    const invalid = rows.filter((r) => r.errors.length > 0).length;
    const duplicates = rows.filter((r) => r.errors.length === 0 && r.duplicate).length;

    const token = this.signToken({
      v: 1,
      actorId: user.id,
      areaId,
      source: {
        spreadsheetId: source.spreadsheetId,
        range: source.range,
        areaType: source.areaType as EnrollmentAreaType,
        updatedAt: source.updatedAt.toISOString(),
        revision: source.revision,
      },
      snapshotHash: this.snapshotHash(values),
      exp: Date.now() + PREVIEW_TTL_MS,
    });

    return { previewToken: token, rows, summary: { read: rows.length, valid, invalid, duplicates } };
  }

  // ---------- import ----------

  async importData(user: AuthUser, previewToken: string) {
    const payload = this.verifyToken(previewToken);
    if (payload.actorId !== user.id) throw new ForbiddenException(FORBIDDEN);
    await this.assertAreaAccess(user, payload.areaId);

    const source = await this.ensureSheetConfigured(payload.areaId);
    if (source.revision !== payload.source.revision || source.spreadsheetId !== payload.source.spreadsheetId || source.range !== payload.source.range || source.areaType !== payload.source.areaType || source.updatedAt.toISOString() !== payload.source.updatedAt) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['La fuente cambió desde la vista previa.'] });
    }
    if (!this.config.google) throw new ServiceUnavailableException(SERVICE_UNAVAILABLE);

    let values: string[][];
    try {
      values = await this.sheetProvider.read(source.spreadsheetId, source.range);
    } catch {
      throw new ServiceUnavailableException(SERVICE_UNAVAILABLE);
    }
    if (this.snapshotHash(values) !== payload.snapshotHash) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['La hoja cambió desde la vista previa.'] });
    }

    const headers = values[0] ?? [];
    const dataRows = values.slice(1);
    const { normalized } = parseSheet(headers, dataRows, source.areaType as EnrollmentAreaType);

    const existing = await this.prisma.enrollmentApplication.findMany({ where: { areaId: payload.areaId } });
    const existingDocKeys = new Set(existing.map((r) => `${r.areaId}|${r.period}|${r.documentType}|${r.documentNumber}`));
    const existingEmailKeys = new Set(existing.map((r) => `${r.areaId}|${r.period}|${r.email}`));
    const tombstones = await this.prisma.enrollmentImportTombstone.findMany({ where: { areaId: payload.areaId } });
    const tombstoneSet = new Set(tombstones.map((t) => t.receiptHash));

    const seenDocKeys = new Set<string>();
    const seenEmailKeys = new Set<string>();

    let imported = 0;
    let duplicates = 0;
    let invalid = 0;

    const toCreate: Prisma.EnrollmentApplicationCreateManyInput[] = [];

    for (const row of normalized) {
      if (row.errors.length > 0 || !row.documentType || !row.faculty) {
        invalid++;
        continue;
      }
      const docKey = `${payload.areaId}|${row.period}|${row.documentType}|${row.documentNumber}`;
      const emailKey = `${payload.areaId}|${row.period}|${row.email}`;
      const rHash = this.receiptHash(payload.areaId, row);
      let isDup = false;
      if (tombstoneSet.has(rHash)) isDup = true;
      else if (existingDocKeys.has(docKey)) isDup = true;
      else if (existingEmailKeys.has(emailKey)) isDup = true;
      else if (seenDocKeys.has(docKey)) isDup = true;
      else if (seenEmailKeys.has(emailKey)) isDup = true;

      if (isDup) {
        duplicates++;
        continue;
      }
      seenDocKeys.add(docKey);
      seenEmailKeys.add(emailKey);

      toCreate.push({
        areaId: payload.areaId,
        firstNames: row.firstNames,
        lastNames: row.lastNames,
        email: row.email,
        documentType: row.documentType as EnrollmentDocumentType,
        documentNumber: row.documentNumber,
        faculty: row.faculty as EnrollmentFaculty,
        areaType: row.areaType as EnrollmentAreaType,
        period: row.period,
        consent: row.consent,
        status: 'PENDING' as EnrollmentStatus,
        sourceRow: row.sourceRow,
        sourceSpreadsheetId: source.spreadsheetId,
        sourceReceiptHash: rHash,
      });
      imported++;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ revision: number }[]>`
        SELECT revision FROM enrollment_sources WHERE area_id = ${payload.areaId}::uuid FOR SHARE`;
      if (locked[0]?.revision !== payload.source.revision || !this.trustedSpreadsheet(payload.areaId, source.spreadsheetId)) {
        throw new BadRequestException('La fuente cambió desde la vista previa.');
      }
      const result = toCreate.length ? await tx.enrollmentApplication.createMany({ data: toCreate, skipDuplicates: true }) : { count: 0 };
      await this.audit(tx, 'IMPORTED', user.id, payload.areaId, result.count,
        { read: normalized.length, invalid, duplicates: duplicates + toCreate.length - result.count });
      return result.count;
    });
    duplicates += imported - created;
    imported = created;

    return { imported, duplicates, invalid };
  }

  // ---------- list ----------

  async list(user: AuthUser, query: ListQuery) {
    const accessible = await this.accessibleAreaIds(user);
    const whereAreaIds = query.areaId ? [query.areaId] : accessible;
    // enforce scope
    for (const id of whereAreaIds) {
      if (!accessible.includes(id)) throw new ForbiddenException(FORBIDDEN);
    }
    const where: Prisma.EnrollmentApplicationWhereInput = {
      areaId: query.areaId ? query.areaId : { in: accessible },
    };
    if (query.faculty) where.faculty = query.faculty;
    if (query.period) where.period = query.period;
    if (query.status) where.status = query.status;
    if (query.search) {
      const s = query.search;
      where.OR = [
        { firstNames: { contains: s, mode: 'insensitive' } },
        { lastNames: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { documentNumber: { contains: s, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.enrollmentApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.enrollmentApplication.count({ where }),
    ]);
    return { items: items.map((i) => this.toItem(i)), total };
  }

  private toItem(i: any): EnrollmentItem {
    return {
      id: i.id,
      firstNames: i.firstNames,
      lastNames: i.lastNames,
      email: i.email,
      documentType: i.documentType,
      documentNumber: i.documentNumber,
      faculty: i.faculty,
      areaId: i.areaId,
      areaType: i.areaType,
      period: i.period,
      status: i.status,
      createdAt: i.createdAt,
      rejectedAt: i.rejectedAt,
    };
  }

  // ---------- status ----------

  async updateStatus(user: AuthUser, id: string, status: 'ACCEPTED' | 'REJECTED'): Promise<EnrollmentItem> {
    const record = await this.prisma.enrollmentApplication.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(NOT_FOUND);
    await this.assertAreaAccess(user, record.areaId);
    if (status === 'REJECTED') {
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.enrollmentApplication.updateMany({
          where: { id, areaId: record.areaId },
          data: { status, rejectedAt: new Date() },
        });
        if (result.count !== 1) throw new NotFoundException(NOT_FOUND);
        await this.audit(tx, 'STATUS_CHANGED', user.id, record.areaId, 1, { status });
        return tx.enrollmentApplication.findUniqueOrThrow({ where: { id } });
      });
      return this.toItem(updated);
    }
    const fullName = `${record.firstNames.trim()} ${record.lastNames.trim()}`;
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findFirst({
          where: { email: { equals: record.email, mode: 'insensitive' } },
          select: { id: true },
        });
        if (existingUser) throw new ConflictException(EMAIL_EXISTS_MESSAGE);
        await tx.user.create({
          data: {
            email: record.email,
            fullName,
            passwordHash,
            status: 'ACTIVE',
            mustChangePassword: true,
            roles: { create: [{ role: 'STUDENT' }] },
          },
        });
        const result = await tx.enrollmentApplication.updateMany({
          where: { id, areaId: record.areaId },
          data: { status, rejectedAt: null },
        });
        if (result.count !== 1) throw new NotFoundException(NOT_FOUND);
        await this.audit(tx, 'STATUS_CHANGED', user.id, record.areaId, 1, { status });
        return tx.enrollmentApplication.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(EMAIL_EXISTS_MESSAGE);
      }
      throw error;
    }
    try {
      await this.approvalMailer.sendApproval(record.email, ACCEPTANCE_SUBJECT, acceptanceBody(record.email, temporaryPassword));
    } catch {
      await this.prisma.enrollmentAuditEvent
        .create({
          data: {
            action: 'ENROLLMENT_ACCEPT_EMAIL_FAILED',
            actorId: user.id,
            areaId: record.areaId,
            affectedCount: 1,
            details: { status: 'ACCEPTED', emailDelivery: 'FAILED' },
          },
        })
        .catch(() => undefined);
    }
    return this.toItem(updated);
  }

  async bulkStatus(user: AuthUser, ids: string[], status: 'ACCEPTED' | 'REJECTED'): Promise<{ updated: number }> {
    if (status === 'ACCEPTED') {
      throw new BadRequestException({
        message: 'Datos inválidos.',
        errors: ['La aceptación masiva no está permitida; use la aceptación individual porque requiere crear un usuario y enviar un correo.'],
      });
    }
    const records = await this.prisma.enrollmentApplication.findMany({ where: { id: { in: ids } } });
    if (records.length !== ids.length) throw new NotFoundException(NOT_FOUND);
    const accessible = await this.accessibleAreaIds(user);
    for (const r of records) {
      if (!accessible.includes(r.areaId)) throw new ForbiddenException(FORBIDDEN);
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.enrollmentApplication.updateMany({
        where: { id: { in: ids }, areaId: { in: accessible } },
        data: { status, rejectedAt: new Date() },
      });
      if (updated.count !== ids.length) throw new NotFoundException(NOT_FOUND);
      await this.audit(tx, 'STATUS_CHANGED', user.id, records.length === 1 ? records[0].areaId : null, updated.count, { status });
      return updated;
    });
    return { updated: result.count };
  }

  // ---------- delete ----------

  async remove(user: AuthUser, id: string): Promise<void> {
    const record = await this.prisma.enrollmentApplication.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(NOT_FOUND);
    await this.assertAreaAccess(user, record.areaId);
    if (record.status !== 'REJECTED') throw new BadRequestException({ message: 'Datos inválidos.', errors: ['Solo se pueden eliminar inscripciones rechazadas.'] });
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.enrollmentApplication.deleteMany({ where: { id, areaId: record.areaId, status: 'REJECTED' } });
      if (removed.count !== 1) throw new BadRequestException('La inscripción ya no está rechazada.');
      if (record.sourceReceiptHash) {
        await tx.enrollmentImportTombstone.upsert({
          where: { areaId_receiptHash: { areaId: record.areaId, receiptHash: record.sourceReceiptHash } },
          update: {},
          create: { areaId: record.areaId, receiptHash: record.sourceReceiptHash },
        });
      }
      await this.audit(tx, 'DELETED', user.id, record.areaId, 1);
    });
  }

  // ---------- cleanup ----------

  async cleanupExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
    let total = 0;
    for (let cycle = 0; cycle < 10; cycle++) {
      const batch = await this.prisma.enrollmentApplication.findMany({
        where: { status: 'REJECTED', rejectedAt: { lte: cutoff } },
        take: MAX_CLEANUP_BATCH,
        select: { id: true, areaId: true, sourceReceiptHash: true },
      });
      if (batch.length === 0) break;
      const count = await this.prisma.$transaction(async (tx) => {
        const removed = await tx.$queryRaw<{ id: string; areaId: string; sourceReceiptHash: string | null }[]>`
          DELETE FROM enrollment_applications
          WHERE id IN (${Prisma.join(batch.map((row) => Prisma.sql`${row.id}::uuid`))})
            AND status = 'REJECTED' AND rejected_at <= ${cutoff}
          RETURNING id, area_id AS "areaId", source_receipt_hash AS "sourceReceiptHash"`;
        for (const r of removed) {
          if (r.sourceReceiptHash) {
            await tx.enrollmentImportTombstone.upsert({
              where: { areaId_receiptHash: { areaId: r.areaId, receiptHash: r.sourceReceiptHash } },
              update: {},
              create: { areaId: r.areaId, receiptHash: r.sourceReceiptHash },
            });
          }
        }
        if (removed.length) await this.audit(tx, 'RETENTION_PURGE', null, null, removed.length);
        return removed.length;
      });
      total += count;
      if (batch.length < MAX_CLEANUP_BATCH || count === 0) break;
    }
    return total;
  }

  // ---------- export ----------

  async exportXlsx(user: AuthUser, query: ListQuery): Promise<Buffer> {
    const result = await this.list(user, { ...query, limit: this.config.exportMaxRows + 1, offset: 0 });
    if (result.total > this.config.exportMaxRows) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: [`La exportación admite como máximo ${this.config.exportMaxRows} filas.`] });
    }
    const items = result.items;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inscripciones');
    sheet.columns = [
      { header: 'Nombres', key: 'firstNames', width: 20 },
      { header: 'Apellidos', key: 'lastNames', width: 20 },
      { header: 'Correo electrónico', key: 'email', width: 30 },
      { header: 'Tipo de documento', key: 'documentType', width: 12 },
      { header: 'Número de documento', key: 'documentNumber', width: 18 },
      { header: 'Facultad', key: 'faculty', width: 24 },
      { header: 'Tipo de área', key: 'areaType', width: 18 },
      { header: 'Período', key: 'period', width: 16 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Fecha de creación', key: 'createdAt', width: 22 },
      { header: 'Rechazada en', key: 'rejectedAt', width: 22 },
    ];
    for (const item of items) {
      const row = sheet.addRow({
        firstNames: item.firstNames,
        lastNames: item.lastNames,
        email: item.email,
        documentType: item.documentType,
        documentNumber: item.documentNumber,
        faculty: item.faculty,
        areaType: item.areaType,
        period: item.period,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        rejectedAt: item.rejectedAt ? item.rejectedAt.toISOString() : '',
      });
      // force document number as text
      const cell = row.getCell('documentNumber');
      cell.numFmt = '@';
      cell.value = item.documentNumber;
    }
    const buffer = await workbook.xlsx.writeBuffer();
    await this.audit(this.prisma, 'EXPORTED', user.id, query.areaId ?? null, items.length,
      { faculty: query.faculty ?? null, status: query.status ?? null, period: query.period ?? null, searchUsed: Boolean(query.search) });
    return Buffer.from(buffer);
  }
}
