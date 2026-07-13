import { describe, it, expect, vi } from 'vitest';
import { jwtVerify, importSPKI, decodeJwt } from 'jose';
import { parseServiceAccount, mintCustomToken, mintGoogleAccessToken } from '../src/auth.js';
import { TEST_SERVICE_ACCOUNT, TEST_SERVICE_ACCOUNT_JSON } from './fixtures/testServiceAccount.js';

// Public key matching test/fixtures/testServiceAccount.js's private key, used
// only to verify signatures produced in these tests.
const TEST_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlKuBkrIcKIxmG9VFBJF2
8q+NJLqE9QAIztGShnJXia4zyfZL+GQ4sNP4Ll8mUFTTTDVF4KIbEohGfAh7Nqhs
9QlOb0x2MqHk7ElvFHHC/PYwmF9fw7IyjAc0VEg2EvefsAAYTIexqtT1SsVsKaFa
IaVOlCR9O83TFDwZQr2+ymFqOrajmoJwfkirjECSHZCnZhkPrWSPZa8NYGXRsIVD
kIk//kqEMGfi4i/yT3VqYxaS1jQhGoWY/8CX0CwznbEpX+N1xagqlXCKDd/SY/rT
4DX1JokKfliORdWrLBrtj/qjWG9oPPmSM29LF8uXEtpdbsICkd/B0ZJK6bowIVc9
oQIDAQAB
-----END PUBLIC KEY-----
`;

describe('parseServiceAccount', () => {
  it('extracts projectId/clientEmail/privateKey from raw JSON', () => {
    const sa = parseServiceAccount(TEST_SERVICE_ACCOUNT_JSON);
    expect(sa.projectId).toBe('watch-together-test');
    expect(sa.clientEmail).toBe(TEST_SERVICE_ACCOUNT.clientEmail);
    expect(sa.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseServiceAccount('not json')).toThrow();
  });

  it('throws when required fields are missing', () => {
    expect(() => parseServiceAccount(JSON.stringify({ project_id: 'x' }))).toThrow();
  });
});

describe('mintCustomToken', () => {
  it('produces a JWT with the Firebase-documented custom-token claim structure', async () => {
    const token = await mintCustomToken(TEST_SERVICE_ACCOUNT, 'uid-123', { roomCode: 'AB12CD' });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const publicKey = await importSPKI(TEST_PUBLIC_KEY_PEM, 'RS256');
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      audience:
        'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      issuer: TEST_SERVICE_ACCOUNT.clientEmail,
      subject: TEST_SERVICE_ACCOUNT.clientEmail,
    });

    expect(protectedHeader.alg).toBe('RS256');
    expect(payload.uid).toBe('uid-123');
    expect(payload.claims).toEqual({ roomCode: 'AB12CD' });
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it('scopes the token to the given roomCode claim (different rooms get different claims)', async () => {
    const tokenA = await mintCustomToken(TEST_SERVICE_ACCOUNT, 'uid-1', { roomCode: 'ROOMAA' });
    const tokenB = await mintCustomToken(TEST_SERVICE_ACCOUNT, 'uid-1', { roomCode: 'ROOMBB' });
    const payloadA = decodeJwt(tokenA);
    const payloadB = decodeJwt(tokenB);
    expect(payloadA.claims.roomCode).toBe('ROOMAA');
    expect(payloadB.claims.roomCode).toBe('ROOMBB');
    expect(payloadA.claims.roomCode).not.toBe(payloadB.claims.roomCode);
  });
});

describe('mintGoogleAccessToken', () => {
  it('signs a JWT-bearer assertion and exchanges it via the injected fetchFn', async () => {
    const fetchFn = vi.fn(async (url, options) => {
      expect(url).toBe('https://oauth2.googleapis.com/token');
      expect(options.method).toBe('POST');
      expect(options.body).toContain('grant_type=urn');
      expect(options.body).toContain('assertion=');
      return new Response(JSON.stringify({ access_token: 'fake-access-token', expires_in: 3600 }), {
        status: 200,
      });
    });

    const token = await mintGoogleAccessToken(
      TEST_SERVICE_ACCOUNT,
      ['https://www.googleapis.com/auth/firebase.database'],
      fetchFn
    );
    expect(token).toBe('fake-access-token');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('throws when the token endpoint responds with a non-2xx status', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 401 }));
    await expect(
      mintGoogleAccessToken(TEST_SERVICE_ACCOUNT, ['scope'], fetchFn)
    ).rejects.toThrow();
  });

  it('throws when the response is missing access_token', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    await expect(
      mintGoogleAccessToken(TEST_SERVICE_ACCOUNT, ['scope'], fetchFn)
    ).rejects.toThrow();
  });
});
