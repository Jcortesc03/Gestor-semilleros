import { Injectable } from '@nestjs/common';
import { createSign } from 'node:crypto';
import type { GoogleSheetsConfig } from '../../../config/enrollment.config.types';
import type { SheetProvider } from '../models/sheet-provider';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_HOST = 'sheets.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

export class GoogleSheetsClient implements SheetProvider {
  constructor(private readonly config: GoogleSheetsConfig) {}

  async read(spreadsheetId: string, range: string): Promise<string[][]> {
    const token = await this.accessToken();
    const url = `https://${SHEETS_HOST}/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?alt=json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`Google Sheets respondió ${response.status}.`);
    const body = (await response.json()) as { values?: unknown };
    if (!Array.isArray(body.values)) return [];
    return body.values.map((row) => (Array.isArray(row) ? row.map((cell) => (cell === null || cell === undefined ? '' : String(cell))) : []));
  }

  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
      iss: this.config.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };
    const assertion = this.signJwt(header, claim);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`No se pudo obtener token de Google (${response.status}).`);
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) throw new Error('Token de Google ausente.');
    return body.access_token;
  }

  private signJwt(header: Record<string, unknown>, claim: Record<string, unknown>): string {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const signingInput = `${encode(header)}.${encode(claim)}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(this.config.privateKey, 'base64url');
    return `${signingInput}.${signature}`;
  }
}

@Injectable()
export class GoogleSheetsClientFactory {
  constructor() {}
  create(config: GoogleSheetsConfig): GoogleSheetsClient {
    return new GoogleSheetsClient(config);
  }
}
