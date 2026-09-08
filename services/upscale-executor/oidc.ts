import { OAuth2Client, type TokenPayload } from 'google-auth-library';

export interface IOidcAuthorizerOptions {
  audience?: string;
  serviceAccountEmail?: string;
  verify?: (token: string, audience: string) => Promise<TokenPayload | undefined>;
}

export function createOidcAuthorizer(
  options: IOidcAuthorizerOptions
): (request: Request) => Promise<boolean> {
  const client = new OAuth2Client();
  const verify =
    options.verify ??
    (async (token, audience) =>
      (await client.verifyIdToken({ idToken: token, audience })).getPayload());
  return async request => {
    if (!options.audience || !options.serviceAccountEmail) return false;
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ') || authorization.length > 16_384) return false;
    try {
      const claims = await verify(authorization.slice(7), options.audience);
      return Boolean(
        claims &&
        ['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) &&
        claims.aud === options.audience &&
        claims.email === options.serviceAccountEmail &&
        claims.email_verified === true &&
        claims.exp * 1000 > Date.now()
      );
    } catch {
      return false;
    }
  };
}
