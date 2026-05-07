/**
 * Google Search Console Service
 *
 * Authenticates via a service account using Web Crypto API (compatible with
 * Cloudflare Workers / Cloudflare Pages edge runtime) and fetches Search
 * Analytics data.
 *
 * NOTE: This service intentionally does NOT import from @shared/config/env.
 * Callers (e.g. cron routes) are responsible for reading serverEnv and passing
 * email + privateKey as arguments.
 */

import type {
  IGscDateRange,
  IGscOAuthTokenResponse,
  IGscSearchAnalyticsRequest,
  IGscSearchAnalyticsResponse,
  IGscSearchAnalyticsRow,
} from './gsc.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROW_LIMIT = 25000;
const GSC_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const GSC_TOKEN_AUD = 'https://oauth2.googleapis.com/token';
const PACIFIC_TIMEZONE = 'America/Los_Angeles';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts escaped `\n` sequences (two literal characters) into real newlines.
 * Private keys stored in environment variables commonly have this encoding.
 */
export function normalizePemPrivateKey(raw: string): string {
  const trimmed = raw.trim();
  const unwrapped =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : raw;

  return unwrapped.replace(/\\n/g, '\n');
}

function getPacificTodayString(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PACIFIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const values = Object.fromEntries(
    parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Returns a stable GSC date window.
 *
 * @param days     Number of days of data to request (default 28).
 * @param lagDays  Days to subtract from "today" for the end date to avoid
 *                 incomplete GSC data (default 3).
 */
export function buildGscDateRange(days = 28, lagDays = 3): IGscDateRange {
  const pacificToday = getPacificTodayString();
  const endDate = shiftDateString(pacificToday, -lagDays);
  const startDate = shiftDateString(endDate, -(days - 1));
  return { startDate, endDate };
}

/**
 * Encode a string or ArrayBuffer to base64url (no padding).
 */
function base64url(data: string | ArrayBuffer): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Creates a short-lived Google OAuth2 access token for the GSC API using a
 * service account private key.
 *
 * Uses the Web Crypto API so it runs on Cloudflare Pages / Workers.
 */
export async function createGscAccessToken(email: string, privateKey: string): Promise<string> {
  const normalizedKey = normalizePemPrivateKey(privateKey);

  // Strip PEM headers/footers and decode base64 to ArrayBuffer
  const pemBody = normalizedKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  const binaryStr = atob(pemBody);
  const keyBuffer = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    keyBuffer[i] = binaryStr.charCodeAt(i);
  }

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: email,
      scope: GSC_SCOPE,
      aud: GSC_TOKEN_AUD,
      exp: now + 3600,
      iat: now,
    })
  );

  const signingInput = `${header}.${claims}`;
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64url(signatureBuffer)}`;

  const response = await fetch(GSC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GSC token request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as IGscOAuthTokenResponse;
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Paginates through all Search Analytics rows for the given request body.
 * The `rowLimit` in the body is used as the page size; pagination continues
 * until a page returns fewer rows than the limit.
 */
export async function queryAllSearchAnalyticsRows(
  accessToken: string,
  siteUrl: string,
  body: IGscSearchAnalyticsRequest
): Promise<IGscSearchAnalyticsRow[]> {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const allRows: IGscSearchAnalyticsRow[] = [];
  let startRow = 0;

  while (true) {
    const requestBody: IGscSearchAnalyticsRequest = {
      ...body,
      rowLimit: ROW_LIMIT,
      startRow,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GSC Search Analytics request failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as IGscSearchAnalyticsResponse;
    const rows = data.rows ?? [];
    allRows.push(...rows);

    if (rows.length < ROW_LIMIT) {
      break;
    }

    startRow += ROW_LIMIT;
  }

  return allRows;
}

/**
 * Fetches blog page performance data (dimensions: page only).
 */
export async function fetchBlogPagePerformance(
  accessToken: string,
  siteUrl: string,
  range: IGscDateRange
): Promise<IGscSearchAnalyticsRow[]> {
  return queryAllSearchAnalyticsRows(accessToken, siteUrl, {
    startDate: range.startDate,
    endDate: range.endDate,
    dimensions: ['page'],
    aggregationType: 'byPage',
    type: 'web',
    dataState: 'final',
    rowLimit: ROW_LIMIT,
    dimensionFilterGroups: [
      {
        filters: [
          {
            dimension: 'page',
            operator: 'contains',
            expression: '/blog/',
          },
        ],
      },
    ],
  });
}

/**
 * Fetches blog query+page performance data (dimensions: query, page).
 */
export async function fetchBlogQueryPagePerformance(
  accessToken: string,
  siteUrl: string,
  range: IGscDateRange
): Promise<IGscSearchAnalyticsRow[]> {
  return queryAllSearchAnalyticsRows(accessToken, siteUrl, {
    startDate: range.startDate,
    endDate: range.endDate,
    dimensions: ['query', 'page'],
    type: 'web',
    dataState: 'final',
    rowLimit: ROW_LIMIT,
    dimensionFilterGroups: [
      {
        filters: [
          {
            dimension: 'page',
            operator: 'contains',
            expression: '/blog/',
          },
        ],
      },
    ],
  });
}
