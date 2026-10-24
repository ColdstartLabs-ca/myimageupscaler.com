import { normalizeSeoPath } from './seo-equity-scoring';

export { normalizeSeoPath };

export const SEO_LOCK_FIELDS = [
  'title',
  'description',
  'h1',
  'introHash',
  'canonical',
  'robots',
  'hreflang',
  'jsonLdTypes',
] as const;

export type TSeoLockField = (typeof SEO_LOCK_FIELDS)[number];

export interface ISeoLockFields {
  title: string;
  description: string;
  h1: string;
  introHash: string;
  canonical: string;
  robots: string;
  hreflang: string[];
  jsonLdTypes: string[];
}

export interface ISeoLockEntry extends ISeoLockFields {
  source: 'code' | 'db';
  clicks28d: number;
  change?: {
    approvedAt: string;
    baselineClicks28d: number;
    baselineEndDate: string;
    readbackDate: string;
    previousLockCommit: string;
  };
}

export type ISeoLock = Record<string, ISeoLockEntry>;

export function hasValidSeoChangeMetadata(change: ISeoLockEntry['change']): boolean {
  if (!change) return false;
  const dates = [change.approvedAt, change.baselineEndDate, change.readbackDate];
  if (
    !dates.every(value => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T12:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    })
  )
    return false;
  return (
    change.baselineEndDate < change.approvedAt &&
    Date.parse(change.readbackDate) - Date.parse(change.approvedAt) >= 14 * 86400000 &&
    /^[a-f0-9]{40}$/i.test(change.previousLockCommit) &&
    Number.isFinite(change.baselineClicks28d) &&
    change.baselineClicks28d > 0
  );
}

export async function loadEffectiveLock(
  signedLock: ISeoLock,
  loadAutoEntries: () => Promise<ISeoLock>
): Promise<ISeoLock> {
  return { ...(await loadAutoEntries()), ...signedLock };
}

export interface ISeoLockDiff {
  field: TSeoLockField;
  expected: unknown;
  actual: unknown;
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
};

export function normalize(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:amp|quot|#39|apos|lt|gt|nbsp);|&#(?:x[\da-f]+|\d+);/gi, entity => {
    const named = HTML_ENTITIES[entity.toLowerCase()];
    if (named) return named;

    const hexadecimal = entity.match(/^&#x([\da-f]+);$/i);
    const decimal = entity.match(/^&#(\d+);$/);
    const codePoint = hexadecimal
      ? Number.parseInt(hexadecimal[1], 16)
      : decimal
        ? Number.parseInt(decimal[1], 10)
        : Number.NaN;
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
  });
}

function getAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? undefined : decodeHtmlEntities(value);
}

function stripTags(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function firstTagText(html: string, tagName: string): string {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}\\s*>`, 'i'));
  return match ? normalize(stripTags(match[1])) : '';
}

function firstMetaContent(html: string, name: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (getAttribute(tag, 'name')?.toLowerCase() === name.toLowerCase()) {
      return normalize(getAttribute(tag, 'content') ?? '');
    }
  }
  return '';
}

function normalizeCanonical(value: string): string {
  if (!value) return '';

  try {
    const url = new URL(value, 'https://myimageupscaler.com');
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/$/, '') || '/';
    return url.toString();
  } catch {
    return normalize(value).replace(/\/$/, '') || '/';
  }
}

function extractCanonical(html: string): string {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const rel = getAttribute(tag, 'rel')
      ?.split(/\s+/)
      .map(value => value.toLowerCase())
      .filter(Boolean);
    if (rel?.includes('canonical')) return normalizeCanonical(getAttribute(tag, 'href') ?? '');
  }
  return '';
}

function extractHreflang(html: string): string[] {
  const values: string[] = [];
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const rel = getAttribute(tag, 'rel')
      ?.split(/\s+/)
      .map(value => value.toLowerCase())
      .filter(Boolean);
    const language = getAttribute(tag, 'hreflang');
    const href = getAttribute(tag, 'href');
    if (!rel?.includes('alternate') || !language || !href) continue;
    values.push(`${normalize(language)}=${normalizeCanonical(href)}`);
  }
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function collectJsonLdTypes(value: unknown, types: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach(item => collectJsonLdTypes(item, types));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const type = record['@type'];
  if (typeof type === 'string') types.add(type);
  if (Array.isArray(type)) {
    type
      .filter((item): item is string => typeof item === 'string')
      .forEach(item => types.add(item));
  }
  Object.values(record).forEach(item => collectJsonLdTypes(item, types));
}

function extractJsonLdTypes(html: string): string[] {
  const types = new Set<string>();
  const scripts =
    html.match(
      /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
    ) ?? [];
  for (const script of scripts) {
    const content = script.replace(/^<[\s\S]*?>|<\/script>$/gi, '').trim();
    try {
      collectJsonLdTypes(JSON.parse(content), types);
    } catch {
      // A malformed JSON-LD block is represented as no extracted type; the render gate still
      // compares the resulting empty list and reports drift when the lock expects a type.
    }
  }
  return [...types].sort((a, b) => a.localeCompare(b));
}

export async function hashSeoText(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function extractSeoFields(html: string): Promise<ISeoLockFields> {
  const firstParagraph = firstTagText(html, 'p');

  return {
    title: firstTagText(html, 'title'),
    description: firstMetaContent(html, 'description'),
    h1: firstTagText(html, 'h1'),
    introHash: await hashSeoText(firstParagraph),
    canonical: extractCanonical(html),
    robots: firstMetaContent(html, 'robots').toLowerCase(),
    hreflang: extractHreflang(html),
    jsonLdTypes: extractJsonLdTypes(html),
  };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function diffLock(
  expected: Pick<ISeoLockEntry, TSeoLockField>,
  actual: Pick<ISeoLockEntry, TSeoLockField>
): ISeoLockDiff[] {
  return SEO_LOCK_FIELDS.flatMap(field =>
    valuesEqual(expected[field], actual[field])
      ? []
      : [{ field, expected: expected[field], actual: actual[field] }]
  );
}
