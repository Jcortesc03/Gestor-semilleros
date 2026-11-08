import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { MicrosoftConfig } from '../../../../config/microsoft.config.types';
import { PrismaService } from '../../../../database/prisma.service';
import { TokenCipher } from '../../models/token-cipher';
import { createPkcePair } from './microsoft-oauth.client';
import { MicrosoftAuthError, type MicrosoftProfile, type MicrosoftTokens } from './microsoft.types';

/** Tokens de inyección (las pruebas los reemplazan por implementaciones falsas). */
export const MICROSOFT_CONFIG = Symbol('MICROSOFT_CONFIG');
export const MICROSOFT_OAUTH = Symbol('MICROSOFT_OAUTH');
export const MICROSOFT_PROFILE = Symbol('MICROSOFT_PROFILE');

/** Lo que se usa del cliente OAuth. */
export interface MicrosoftOAuth {
  authorizeUrl(state: string, codeChallenge: string): string;
  exchangeCode(code: string, codeVerifier: string): Promise<MicrosoftTokens>;
  refresh(refreshToken: string): Promise<MicrosoftTokens>;
}

/** Lo que se usa de Graph para identificar la cuenta. */
export interface MicrosoftProfileReader {
  getMe(accessToken: string): Promise<MicrosoftProfile>;
}

export const MICROSOFT_NOT_CONFIGURED = 'La integración con Microsoft Teams no está configurada.';
export const MICROSOFT_NOT_LINKED = 'Vincula tu cuenta de Microsoft antes de crear reuniones (GET /api/integrations/microsoft/connect).';
export const MICROSOFT_LINK_EXPIRED = 'Tu vinculación con Microsoft expiró o fue revocada; vuelve a vincular tu cuenta.';
export const INVALID_LINK_STATE = 'El enlace de vinculación no es válido o expiró; vuelve a iniciar la vinculación.';
export const ACCOUNT_TAKEN = 'Esa cuenta de Microsoft ya está vinculada a otro usuario.';

/** Validez del `state` de OAuth: el usuario debe volver de Microsoft en este tiempo. */
const STATE_TTL_MS = 10 * 60_000;
/** Se renueva el access token si le queda menos que esto. */
const REFRESH_MARGIN_MS = 2 * 60_000;

export interface MicrosoftLinkStatus {
  configured: boolean;
  linked: boolean;
  email: string | null;
  linkedAt: string | null;
}

/**
 * Vinculación de la cuenta de Microsoft de cada usuario (OAuth 2.0 con PKCE, ADR 0007).
 * No es un inicio de sesión: Auth.js sigue siendo el único mecanismo de autenticación.
 */
@Injectable()
export class MicrosoftAccountService {
  private readonly logger = new Logger('Microsoft');
  private readonly cipher: TokenCipher | null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MICROSOFT_CONFIG) private readonly config: MicrosoftConfig | null,
    @Inject(MICROSOFT_OAUTH) private readonly oauth: MicrosoftOAuth | null,
    @Inject(MICROSOFT_PROFILE) private readonly profiles: MicrosoftProfileReader,
  ) {
    this.cipher = config ? new TokenCipher(config.tokenEncryptionKey) : null;
  }

  get configured(): boolean {
    return this.config !== null && this.oauth !== null;
  }

  async status(userId: string): Promise<MicrosoftLinkStatus> {
    const account = await this.prisma.microsoftAccount.findUnique({
      where: { userId },
      select: { email: true, linkedAt: true },
    });
    return {
      configured: this.configured,
      linked: account !== null,
      email: account?.email ?? null,
      linkedAt: account?.linkedAt.toISOString() ?? null,
    };
  }

  /** URL de Microsoft a la que se envía al usuario para dar su consentimiento. */
  connectUrl(userId: string): string {
    const { oauth, cipher } = this.require();
    const { verifier, challenge } = createPkcePair();
    const state = cipher.seal({ u: userId, v: verifier }, STATE_TTL_MS);
    return oauth.authorizeUrl(state, challenge);
  }

  /** Termina la vinculación con el código que devuelve Microsoft. */
  async completeLink(userId: string, code: string, state: string): Promise<MicrosoftLinkStatus> {
    const { oauth, cipher } = this.require();
    const payload = cipher.open<{ u?: string; v?: string }>(state);
    if (!payload || payload.u !== userId || typeof payload.v !== 'string') {
      throw new BadRequestException(INVALID_LINK_STATE);
    }

    let tokens: MicrosoftTokens;
    let profile: MicrosoftProfile;
    try {
      tokens = await oauth.exchangeCode(code, payload.v);
      profile = await this.profiles.getMe(tokens.accessToken);
    } catch (error) {
      this.logger.warn(`No se pudo vincular la cuenta de Microsoft: ${String((error as Error).message)}`);
      throw new BadRequestException('Microsoft rechazó la vinculación; inténtalo de nuevo.');
    }

    const owner = await this.prisma.microsoftAccount.findUnique({
      where: { microsoftUserId: profile.id },
      select: { userId: true },
    });
    if (owner && owner.userId !== userId) throw new ConflictException(ACCOUNT_TAKEN);

    const data = {
      microsoftUserId: profile.id,
      email: profile.email,
      ...this.encryptTokens(tokens),
    };
    await this.prisma.microsoftAccount.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data, linkedAt: new Date() },
    });
    return this.status(userId);
  }

  async unlink(userId: string): Promise<void> {
    await this.prisma.microsoftAccount.deleteMany({ where: { userId } });
  }

  /** Access token vigente del usuario; lo renueva si está por vencer. */
  async accessTokenFor(userId: string): Promise<string> {
    const { oauth, cipher } = this.require();
    const account = await this.prisma.microsoftAccount.findUnique({ where: { userId } });
    if (!account) throw new ConflictException(MICROSOFT_NOT_LINKED);

    if (account.accessTokenExpiresAt.getTime() - REFRESH_MARGIN_MS > Date.now()) {
      return cipher.decrypt(account.accessTokenEncrypted);
    }

    try {
      const tokens = await oauth.refresh(cipher.decrypt(account.refreshTokenEncrypted));
      await this.prisma.microsoftAccount.update({ where: { userId }, data: this.encryptTokens(tokens) });
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof MicrosoftAuthError && error.invalidGrant) {
        await this.unlink(userId);
        throw new ConflictException(MICROSOFT_LINK_EXPIRED);
      }
      throw new ServiceUnavailableException('No se pudo renovar el acceso a Microsoft; inténtalo más tarde.');
    }
  }

  private encryptTokens(tokens: MicrosoftTokens) {
    const { cipher } = this.require();
    return {
      accessTokenEncrypted: cipher.encrypt(tokens.accessToken),
      refreshTokenEncrypted: cipher.encrypt(tokens.refreshToken),
      accessTokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    };
  }

  private require(): { oauth: MicrosoftOAuth; cipher: TokenCipher } {
    if (!this.oauth || !this.cipher) throw new ServiceUnavailableException(MICROSOFT_NOT_CONFIGURED);
    return { oauth: this.oauth, cipher: this.cipher };
  }
}
