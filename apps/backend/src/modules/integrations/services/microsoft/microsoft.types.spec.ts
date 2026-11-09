import {
  accountKindFromTenantId,
  MICROSOFT_CONSUMERS_TENANT_ID,
  tenantIdFromIdToken,
} from './microsoft.types';

function jwt(payload: unknown): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part(payload)}.firma`;
}

describe('tipo de cuenta de Microsoft', () => {
  it('lee el tid del id_token', () => {
    expect(tenantIdFromIdToken(jwt({ tid: 'abc' }))).toBe('abc');
  });

  it.each([[null], [undefined], [''], ['no-es-jwt'], ['a.!!!.c'], [jwt({})], [jwt({ tid: 5 })], [jwt('texto')]])(
    'devuelve null con %p',
    (token) => {
      expect(tenantIdFromIdToken(token as string | null | undefined)).toBeNull();
    },
  );

  it('PERSONAL solo con el inquilino de consumidores', () => {
    expect(accountKindFromTenantId(MICROSOFT_CONSUMERS_TENANT_ID)).toBe('PERSONAL');
    expect(accountKindFromTenantId(MICROSOFT_CONSUMERS_TENANT_ID.toUpperCase())).toBe('PERSONAL');
    expect(accountKindFromTenantId('f8cdef31-a31e-4b4a-93e4-5f571e91255a')).toBe('WORK_OR_SCHOOL');
    expect(accountKindFromTenantId(null)).toBe('WORK_OR_SCHOOL');
  });
});
