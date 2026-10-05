import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import dummyTagCache from '@opennextjs/aws/overrides/tagCache/dummy.js';
import cloudflareConfig from '../../../open-next.config';
import wranglerConfig from '../../../wrangler.json';
import previewConfig from '../../../wrangler.preview.json';

vi.mock('@opennextjs/aws/adapters/config/index.js', () => ({
  NextConfig: {},
  PrerenderManifest: {
    routes: {
      '/en/blog/how-to-upscale-youtube-thumbnails': { initialRevalidateSeconds: 86400 },
      '/en/blog/unrelated-post': { initialRevalidateSeconds: 86400 },
    },
  },
}));
vi.mock('@opennextjs/aws/adapters/logger.js', () => ({ debug: () => {}, error: () => {} }));

const PATH = '/en/blog/how-to-upscale-youtube-thumbnails';
const TAG = `_N_T_${PATH}`;
const OTHER_PATH = '/en/blog/unrelated-post';
const cachedAt = 1000;

const eventFor = (path = PATH) => ({
  type: 'core' as const,
  method: 'GET',
  rawPath: path,
  url: `https://myimageupscaler.com${path}`,
  headers: { host: 'myimageupscaler.com' },
  query: {},
  cookies: {},
  remoteAddress: '127.0.0.1',
});
const cachedEntry = (path = PATH) => ({
  value: {
    type: 'app',
    html: '<article>old copy</article>',
    rsc: 'old-rsc',
    revalidate: 86400,
    meta: { headers: { 'x-next-cache-tags': `_N_T_${path}` } },
  },
  lastModified: cachedAt,
});

const configuredTagCache = () => {
  const override = cloudflareConfig.default?.override?.tagCache;
  expect(override).toBeTypeOf('function');
  return (
    override as () => {
      name: string;
      mode: string;
      writeTags: (tags: string[]) => Promise<void>;
      hasBeenRevalidated: (tags: string[], lastModified: number) => Promise<boolean>;
    }
  )();
};

// Real adapter/interceptor; only external Cache API and DO RPC I/O are isolated.
describe('OpenNext blog on-demand revalidation', () => {
  const globals = globalThis as Record<string | symbol, unknown>;
  const contextSymbol = Symbol.for('__cloudflare-context__');
  const saved = new Map<string | symbol, unknown>();
  let writes: Map<string, number>;

  beforeEach(() => {
    for (const key of ['openNextConfig', 'incrementalCache', 'tagCache', 'queue', contextSymbol]) {
      saved.set(key, globals[key]);
    }
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    writes = new Map();
    const stub = {
      writeTags: vi.fn(async (tags: string[], time: number) => {
        tags.forEach(tag => writes.set(tag, time));
      }),
      hasBeenRevalidated: vi.fn(async (tags: string[], modified: number) =>
        tags.some(tag => (writes.get(tag) ?? 0) > modified)
      ),
    };
    globals[contextSymbol] = {
      env: { NEXT_TAG_CACHE_DO_SHARDED: { idFromName: (name: string) => name, get: () => stub } },
      ctx: { waitUntil: vi.fn() },
    };
    globals.openNextConfig = cloudflareConfig;
    globals.incrementalCache = { get: vi.fn(async (path: string) => cachedEntry(path)) };
    globals.queue = { send: vi.fn() };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, value] of saved) {
      if (value === undefined) delete globals[key];
      else globals[key] = value;
    }
    saved.clear();
  });

  it.each([
    ['server', cloudflareConfig.default],
    ['middleware', cloudflareConfig.middleware],
  ])('configures persistent next-mode tags in the %s bundle', (_name, bundle) => {
    const override = bundle?.override?.tagCache;
    expect(override).toBeTypeOf('function');
    expect((override as () => { name: string; mode: string })()).toMatchObject({
      name: 'do-sharded-tag-cache',
      mode: 'nextMode',
    });
  });

  it.each([
    ['production', wranglerConfig],
    ['preview', previewConfig],
  ])('adds the tag binding with a new migration, retaining the queue in %s', (_name, config) => {
    expect(config.durable_objects.bindings).toContainEqual({
      name: 'NEXT_TAG_CACHE_DO_SHARDED',
      class_name: 'DOShardedTagCache',
    });
    expect(config.migrations).toContainEqual({ tag: 'v1', new_sqlite_classes: ['DOQueueHandler'] });
    expect(config.migrations).toContainEqual({
      tag: 'v2-tag-cache',
      new_sqlite_classes: ['DOShardedTagCache'],
    });
  });

  it('reproduces the old dummy-tag no-op despite an API invalidation write', async () => {
    globals.openNextConfig = defineCloudflareConfig();
    globals.tagCache = dummyTagCache;
    await dummyTagCache.writeTags([TAG]);
    const { cacheInterceptor } = await import('@opennextjs/aws/core/routing/cacheInterceptor.js');
    const result = await cacheInterceptor(eventFor());
    expect(result).toHaveProperty('headers.x-opennext-cache', 'HIT');
  });

  it('bypasses pre-edit HTML after writing the page tag, not unrelated cached pages', async () => {
    const tagCache = configuredTagCache();
    globals.tagCache = tagCache;
    const { cacheInterceptor } = await import('@opennextjs/aws/core/routing/cacheInterceptor.js');
    expect(await cacheInterceptor(eventFor())).toHaveProperty('headers.x-opennext-cache', 'HIT');
    await tagCache.writeTags([TAG]);
    expect(writes.get(TAG)).toBe(2000);
    expect(await tagCache.hasBeenRevalidated([TAG], cachedAt)).toBe(true);
    const event = eventFor();
    expect(await cacheInterceptor(event)).toBe(event);
    expect(await cacheInterceptor(eventFor(OTHER_PATH))).toHaveProperty(
      'headers.x-opennext-cache',
      'HIT'
    );
  });

  it('checks invalidation even on a warm regional HTML cache hit', async () => {
    const tagCache = configuredTagCache();
    globals.tagCache = tagCache;
    const override = cloudflareConfig.default?.override?.incrementalCache;
    const regional = (
      override as unknown as () => {
        getCacheInstance: () => Promise<unknown>;
        get: (key: string) => Promise<unknown>;
      }
    )();
    vi.spyOn(r2IncrementalCache, 'get').mockResolvedValue(null);
    vi.spyOn(regional, 'getCacheInstance').mockResolvedValue({
      match: vi.fn(async () => ({ json: async () => cachedEntry() })),
    });
    globals.incrementalCache = regional;
    await tagCache.writeTags([TAG]);
    const entry = await regional.get(PATH);
    expect(entry).toHaveProperty('shouldBypassTagCache', false);
    const { cacheInterceptor } = await import('@opennextjs/aws/core/routing/cacheInterceptor.js');
    const event = eventFor();
    expect(await cacheInterceptor(event)).toBe(event);
  });
});
