import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Isolation contract for OpenNext cache interception.
 *
 * `enableCacheInterception: true` serves prerendered SSG/ISR responses from the
 * incremental cache before the Next server bundle loads. That is only safe if the
 * interceptor keeps the HTML and RSC variants apart, never intercepts server
 * actions or preview requests, and sends the durable revalidation message on a
 * stale hit (the 2026-08-31 outage was a stale hit reaching a dummy queue).
 *
 * This exercises the real `cacheInterceptor` shipped with the installed adapter
 * against a mocked cache/queue, so the assertions fail if a dependency upgrade
 * changes the contract.
 */

vi.mock('@opennextjs/aws/adapters/config/index.js', () => ({
  NextConfig: {},
  PrerenderManifest: { routes: { '/en': { initialRevalidateSeconds: 86400 } } },
}));

vi.mock('@opennextjs/aws/adapters/logger.js', () => ({
  debug: () => {},
  error: () => {},
}));

const APP_CACHE_KEY = '/en';
const REVALIDATE_SECONDS = 86400;

const makeCachedValue = () => ({
  type: 'app',
  html: '<html>document-variant</html>',
  rsc: 'rsc-variant-payload',
  revalidate: REVALIDATE_SECONDS,
  meta: { headers: {} },
});

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  rawPath: APP_CACHE_KEY,
  url: `https://myimageupscaler.com${APP_CACHE_KEY}`,
  headers: { host: 'myimageupscaler.com' },
  query: {},
  cookies: {},
  remoteAddress: '127.0.0.1',
  type: 'core' as const,
  method: 'GET',
  ...overrides,
});

const readBody = async (body: ReadableStream): Promise<string> => {
  const reader = (body as ReadableStream).getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value as Uint8Array);
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8');
};

let queueSend: ReturnType<typeof vi.fn>;
let cacheGet: ReturnType<typeof vi.fn>;

const loadInterceptor = async () => {
  const module = await import('@opennextjs/aws/core/routing/cacheInterceptor.js');
  return module.cacheInterceptor as (event: unknown) => Promise<Record<string, any>>;
};

describe('OpenNext cache interception — variant isolation and revalidation safety', () => {
  beforeEach(() => {
    queueSend = vi.fn().mockResolvedValue(undefined);
    cacheGet = vi.fn();
    (globalThis as Record<string, unknown>).queue = { send: queueSend };
    (globalThis as Record<string, unknown>).incrementalCache = { get: cacheGet };
    (globalThis as Record<string, unknown>).tagCache = {
      mode: 'nextMode',
      hasBeenRevalidated: vi.fn().mockResolvedValue(false),
    };
    (globalThis as Record<string, unknown>).openNextConfig = { dangerous: {} };
  });

  it('serves the HTML document variant for a normal request', async () => {
    cacheGet.mockResolvedValue({
      value: makeCachedValue(),
      lastModified: Date.now(),
      shouldBypassTagCache: true,
    });
    const cacheInterceptor = await loadInterceptor();

    const result = await cacheInterceptor(makeEvent());

    expect(result.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(result.headers['x-opennext-cache']).toBe('HIT');
    expect(await readBody(result.body)).toBe('<html>document-variant</html>');
  });

  it('serves the RSC variant, not the HTML variant, for an RSC data request', async () => {
    cacheGet.mockResolvedValue({
      value: makeCachedValue(),
      lastModified: Date.now(),
      shouldBypassTagCache: true,
    });
    const cacheInterceptor = await loadInterceptor();

    const result = await cacheInterceptor(makeEvent({ headers: { host: 'x', rsc: '1' } }));

    expect(result.headers['content-type']).toBe('text/x-component');
    expect(await readBody(result.body)).toBe('rsc-variant-payload');
  });

  it('advertises the RSC vary header so a shared cache cannot cross-serve variants', async () => {
    cacheGet.mockResolvedValue({
      value: makeCachedValue(),
      lastModified: Date.now(),
      shouldBypassTagCache: true,
    });
    const cacheInterceptor = await loadInterceptor();

    const result = await cacheInterceptor(makeEvent());

    expect(result.headers.vary).toContain('RSC');
    expect(result.headers.vary).toContain('Next-Router-State-Tree');
  });

  it('never intercepts server actions', async () => {
    cacheGet.mockResolvedValue({
      value: makeCachedValue(),
      lastModified: Date.now(),
      shouldBypassTagCache: true,
    });
    const cacheInterceptor = await loadInterceptor();
    const event = makeEvent({ headers: { host: 'x', 'next-action': 'action-id' } });

    const result = await cacheInterceptor(event);

    expect(result).toBe(event);
    expect(cacheGet).not.toHaveBeenCalled();
  });

  it('never intercepts preview-mode requests', async () => {
    cacheGet.mockResolvedValue({
      value: makeCachedValue(),
      lastModified: Date.now(),
      shouldBypassTagCache: true,
    });
    const cacheInterceptor = await loadInterceptor();
    const event = makeEvent({ headers: { host: 'x', cookie: '__prerender_bypass=token' } });

    const result = await cacheInterceptor(event);

    expect(result).toBe(event);
    expect(cacheGet).not.toHaveBeenCalled();
  });

  it('passes a cold cache miss through to the server instead of failing', async () => {
    cacheGet.mockResolvedValue(null);
    const cacheInterceptor = await loadInterceptor();
    const event = makeEvent();

    const result = await cacheInterceptor(event);

    expect(result).toBe(event);
  });

  it('sends the durable revalidation message on a stale hit', async () => {
    cacheGet.mockResolvedValue({
      value: makeCachedValue(),
      lastModified: Date.now() - (REVALIDATE_SECONDS + 3600) * 1000,
      shouldBypassTagCache: true,
    });
    const cacheInterceptor = await loadInterceptor();

    const result = await cacheInterceptor(makeEvent());

    expect(result.headers['x-opennext-cache']).toBe('STALE');
    expect(queueSend).toHaveBeenCalledTimes(1);
    expect(queueSend).toHaveBeenCalledWith(
      expect.objectContaining({
        MessageBody: expect.objectContaining({
          host: 'myimageupscaler.com',
          url: APP_CACHE_KEY,
        }),
      })
    );
  });
});
