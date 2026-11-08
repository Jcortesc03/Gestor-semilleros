import { EnvValidationError } from './env';
import { loadStorageConfig } from './storage.config';

const full = {
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 'id',
  S3_SECRET_ACCESS_KEY: 'secreto',
};

describe('loadStorageConfig', () => {
  it('queda no configurado sin bucket o sin credenciales', () => {
    expect(loadStorageConfig({})).toBeNull();
    expect(loadStorageConfig({ ...full, S3_BUCKET: ' ' })).toBeNull();
    expect(loadStorageConfig({ ...full, S3_SECRET_ACCESS_KEY: undefined })).toBeNull();
  });

  it('aplica valores por defecto', () => {
    expect(loadStorageConfig(full)).toEqual({
      bucket: 'bucket',
      region: 'us-east-1',
      endpoint: null,
      accessKeyId: 'id',
      secretAccessKey: 'secreto',
      forcePathStyle: false,
      createBucket: false,
    });
  });

  it('lee endpoint y banderas', () => {
    const config = loadStorageConfig({
      ...full,
      S3_REGION: 'eu-west-1',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_FORCE_PATH_STYLE: 'true',
      S3_CREATE_BUCKET: 'true',
    });
    expect(config).toMatchObject({ region: 'eu-west-1', endpoint: 'http://localhost:9000', forcePathStyle: true, createBucket: true });
  });

  it('rechaza valores inválidos', () => {
    expect(() => loadStorageConfig({ ...full, S3_ENDPOINT: 'no-es-url' })).toThrow(EnvValidationError);
    expect(() => loadStorageConfig({ ...full, S3_FORCE_PATH_STYLE: 'si' })).toThrow(EnvValidationError);
  });
});
