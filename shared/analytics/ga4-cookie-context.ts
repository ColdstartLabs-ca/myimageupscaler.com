const GA_CLIENT_ID_PATTERN = /^\d+\.\d+$/;
const GA_SESSION_ID_PATTERN = /^\d+$/;
const GA_COOKIE_CLIENT_ID_PATTERN = /^GA\d+\.\d+\.(.+)$/;
const GA_COOKIE_SESSION_GS2_PATTERN = /s(\d+)\$/;
const GA_COOKIE_SESSION_GS1_PREFIX_PATTERN = /^GS\d+$/;

export interface IGa4CookieContext {
  gaClientId?: string;
  gaSessionId?: string;
}

function parseSessionId(value: string): string | undefined {
  const gs2Match = GA_COOKIE_SESSION_GS2_PATTERN.exec(value);
  if (gs2Match && GA_SESSION_ID_PATTERN.test(gs2Match[1])) {
    return gs2Match[1];
  }

  const parts = value.split('.');
  if (
    parts.length >= 3 &&
    GA_COOKIE_SESSION_GS1_PREFIX_PATTERN.test(parts[0]) &&
    GA_SESSION_ID_PATTERN.test(parts[2])
  ) {
    return parts[2];
  }

  return undefined;
}

/**
 * Reads the GA4 client_id and session_id from first-party Google Analytics cookies
 * so server-side Measurement Protocol events join the browser's own session.
 */
export function parseGa4CookieContext(cookieHeader: string | null | undefined): IGa4CookieContext {
  const context: IGa4CookieContext = {};
  if (!cookieHeader) return context;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (name === '_ga' && !context.gaClientId) {
      const match = GA_COOKIE_CLIENT_ID_PATTERN.exec(value);
      if (match && GA_CLIENT_ID_PATTERN.test(match[1])) {
        context.gaClientId = match[1];
      }
    } else if (name.startsWith('_ga_') && !context.gaSessionId) {
      const sessionId = parseSessionId(value);
      if (sessionId) context.gaSessionId = sessionId;
    }
  }

  return context;
}
