import { generateKeyPairSync, sign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { describe, expect, it } from 'vitest';
import { createOidcAuthorizer } from './oidc';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const audience = 'https://executor.run.app';
const email = 'tasks@project.iam.gserviceaccount.com';
const verifier = new OAuth2Client();
const now = Math.floor(Date.now() / 1000);
function token(changes: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: audience,
      email,
      email_verified: true,
      sub: '123',
      iat: now,
      exp: now + 300,
      ...changes,
    })
  ).toString('base64url');
  const data = `${header}.${payload}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
}
const authorize = createOidcAuthorizer({
  audience,
  serviceAccountEmail: email,
  verify: async (jwt, aud) =>
    (
      await verifier.verifySignedJwtWithCertsAsync(
        jwt,
        { test: publicKey.export({ type: 'spki', format: 'pem' }).toString() },
        aud,
        ['https://accounts.google.com', 'accounts.google.com']
      )
    ).getPayload(),
});
describe('Google OIDC task identity', () => {
  it('accepts a signed token with the configured issuer, audience and verified service account', async () => {
    expect(
      await authorize(new Request(audience, { headers: { Authorization: `Bearer ${token()}` } }))
    ).toBe(true);
  });
  it.each([
    { aud: 'https://other.run.app' },
    { iss: 'https://attacker.example' },
    { email: 'wrong@project.iam.gserviceaccount.com' },
    { email_verified: false },
    { exp: now - 3600 },
  ])('rejects mismatched claims %j', async changes => {
    expect(
      await authorize(
        new Request(audience, { headers: { Authorization: `Bearer ${token(changes)}` } })
      )
    ).toBe(false);
  });
  it('rejects an unsigned token and the old static task token', async () => {
    expect(
      await authorize(
        new Request(audience, {
          headers: { Authorization: `Bearer ${token().split('.').slice(0, 2).join('.')}.` },
        })
      )
    ).toBe(false);
    expect(
      await authorize(new Request(audience, { headers: { 'X-Executor-Task-Token': 'secret' } }))
    ).toBe(false);
  });
});
