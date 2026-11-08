import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { APP_ENV, type AppEnv } from '../../../config/env';
import type { StorageConfig } from '../../../config/storage.config.types';
import type { DocumentStorage } from '../models/document-storage';

/** Implementación de `DocumentStorage` sobre AWS S3 o un servidor compatible (RustFS). */
@Injectable()
export class S3DocumentStorage implements DocumentStorage, OnModuleInit {
  private readonly logger = new Logger(S3DocumentStorage.name);
  private readonly config: StorageConfig | null;
  private readonly client: S3Client | null;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.config = env.storage;
    this.client = this.config
      ? new S3Client({
          region: this.config.region,
          ...(this.config.endpoint ? { endpoint: this.config.endpoint } : {}),
          forcePathStyle: this.config.forcePathStyle,
          credentials: { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey },
        })
      : null;
  }

  /** Crea el bucket si se pidió (desarrollo). Un fallo no impide arrancar. */
  async onModuleInit(): Promise<void> {
    if (!this.config?.createBucket || !this.client) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
        this.logger.log(`Bucket "${this.config.bucket}" creado.`);
      } catch (error) {
        this.logger.warn(`No se pudo crear el bucket "${this.config.bucket}": ${String(error)}`);
      }
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const { client, bucket } = this.require();
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.length }),
    );
  }

  async get(key: string): Promise<Readable> {
    const { client, bucket } = this.require();
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!(response.Body instanceof Readable)) throw new Error('Respuesta de S3 sin contenido.');
    return response.Body;
  }

  async remove(key: string): Promise<void> {
    const { client, bucket } = this.require();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async head(key: string): Promise<{ sizeBytes: number } | null> {
    const { client, bucket } = this.require();
    try {
      const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { sizeBytes: response.ContentLength ?? 0 };
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
      throw error;
    }
  }

  private require(): { client: S3Client; bucket: string } {
    if (!this.client || !this.config) throw new Error('El almacenamiento S3 no está configurado.');
    return { client: this.client, bucket: this.config.bucket };
  }
}
