import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueueMessage } from '@opennextjs/aws/types/overrides';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import cloudflareConfig from '../../../open-next.config';
import packageJson from '../../../package.json';
import wranglerConfig from '../../../wrangler.json';
import previewConfig from '../../../wrangler.preview.json';

const { waitUntilMock } = vi.hoisted(() => ({ waitUntilMock: vi.fn() }));

vi.mock('@opennextjs/cloudflare', async importOriginal => {
  const actual = await importOriginal<typeof import('@opennextjs/cloudflare')>();
  return {
    ...actual,
    getCloudflareContext: () => ({ env: {}, ctx: { waitUntil: waitUntilMock } }),
  };
});

type WranglerConfig = {
  durable_objects?: {
    bindings?: Array<{ name?: string; class_name?: string }>;
  };
  migrations?: Array<{ tag?: string; new_sqlite_classes?: string[] }>;
  services?: Array<{ binding?: string; service?: string }>;
};

const assertDurableQueueBinding = (config: unknown) => {
  const typedConfig = config as WranglerConfig;

  expect(typedConfig.durable_objects?.bindings).toContainEqual({
    name: 'NEXT_CACHE_DO_QUEUE',
    class_name: 'DOQueueHandler',
  });
  expect(typedConfig.migrations).toContainEqual({
    tag: 'v1',
    new_sqlite_classes: ['DOQueueHandler'],
  });
};

const resolveQueueOverride = (queue: unknown): typeof doQueue => {
  expect(queue).toBeTypeOf('function');
  return (queue as () => typeof doQueue)();
};

const MESSAGE: QueueMessage = {
  MessageDeduplicationId: 'dedupe-1',
  MessageBody: {
    host: 'myimageupscaler.com',
    url: 'https://myimageupscaler.com/',
    lastModified: 0,
    eTag: 'etag-1',
  },
  MessageGroupId: 'group-1',
};

const expectNonBlockingDelegation = async (queue: unknown) => {
  const resolvedQueue = resolveQueueOverride(queue);
  const sendSpy = vi.spyOn(doQueue, 'send').mockReturnValue(new Promise(() => {}));
  waitUntilMock.mockClear();

  const outcome = await Promise.race([
    resolvedQueue.send(MESSAGE).then(() => 'resolved' as const),
    new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 50)),
  ]);

  expect(outcome).toBe('resolved');
  expect(sendSpy).toHaveBeenCalledTimes(1);
  expect(sendSpy).toHaveBeenCalledWith(MESSAGE);
  expect(waitUntilMock).toHaveBeenCalledTimes(1);
  expect(waitUntilMock.mock.calls[0]?.[0]).toBeInstanceOf(Promise);

  sendSpy.mockRestore();
};

afterEach(() => {
  vi.restoreAllMocks();
  waitUntilMock.mockReset();
});

describe('OpenNext incremental cache configuration', () => {
  it('should configure an incremental cache for the Cloudflare adapter', () => {
    const incrementalCache = cloudflareConfig.default?.override?.incrementalCache;
    expect(incrementalCache).toBeTypeOf('function');
    const cache = (incrementalCache as () => { name: string })();
    expect(cache.name).toBe('cf-r2-incremental-cache');
    expect((cache as unknown as { opts: { mode: string } }).opts.mode).toBe('long-lived');
  });

  it('should configure the durable revalidation queue for the server bundle', async () => {
    const queue = resolveQueueOverride(cloudflareConfig.default?.override?.queue);
    expect(queue.name).toBe('durable-queue-non-blocking');
    await expectNonBlockingDelegation(cloudflareConfig.default?.override?.queue);
  });

  it('should serve cached ISR/SSG HTML before the server bundle by enabling interception', () => {
    // Shipped change: interception is back on now that the durable queue exists.
    // If this flips back to false, prerendered pages fall through to the Next server.
    expect(cloudflareConfig.dangerous?.enableCacheInterception).toBe(true);
  });

  it('should never enable interception without the durable queue configured', async () => {
    // Paired invariant from the 2026-08-31 outage: interception + dummy queue = 500s.
    const interceptionEnabled = cloudflareConfig.dangerous?.enableCacheInterception === true;
    await expectNonBlockingDelegation(cloudflareConfig.default?.override?.queue);

    expect(interceptionEnabled).toBe(true);
  });

  it('should propagate the durable queue to the middleware bundle', async () => {
    await expectNonBlockingDelegation(cloudflareConfig.middleware?.override?.queue);
  });

  it.each([
    ['production', wranglerConfig],
    ['preview', previewConfig],
  ])('should bind the durable queue and SQLite migration in %s', (_name, config) => {
    assertDurableQueueBinding(config);
  });

  it.each([
    ['production', wranglerConfig, 'myimageupscaler'],
    ['preview', previewConfig, 'myimageupscaler-cache-preview'],
  ])('should bind the worker self-reference service in %s', (_name, config, service) => {
    expect((config as WranglerConfig).services).toContainEqual({
      binding: 'WORKER_SELF_REFERENCE',
      service,
    });
  });

  it('should bind the incremental cache R2 bucket', () => {
    expect(wranglerConfig.r2_buckets).toContainEqual({
      binding: 'NEXT_INC_CACHE_R2_BUCKET',
      bucket_name: 'myimageupscaler-inc-cache',
    });
  });

  it('should isolate the cache preview from production routes', () => {
    expect(previewConfig.name).toBe('myimageupscaler-cache-preview');
    expect(previewConfig.workers_dev).toBe(true);
    expect('routes' in previewConfig).toBe(false);
    expect(previewConfig.r2_buckets).toContainEqual({
      binding: 'NEXT_INC_CACHE_R2_BUCKET',
      bucket_name: 'myimageupscaler-inc-cache',
    });
    expect(previewConfig.services).toContainEqual({
      binding: 'WORKER_SELF_REFERENCE',
      service: 'myimageupscaler-cache-preview',
    });
  });

  it('should use Webpack for the Cloudflare production bundle', () => {
    expect(packageJson.scripts.build).toBe('next build --webpack');
  });

  it('should purge regional HTML by tag on revalidation', () => {
    const cdnInvalidation = cloudflareConfig.default?.override?.cdnInvalidation;
    expect(cdnInvalidation).toBeDefined();
    const handler =
      typeof cdnInvalidation === 'function'
        ? (cdnInvalidation as unknown as () => { name: string })()
        : (cdnInvalidation as unknown as { name: string });
    expect(handler.name).toBe('cloudflare');
  });

  it('should bypass the tag cache on regional hits', () => {
    const incrementalCache = cloudflareConfig.default?.override?.incrementalCache;
    expect(incrementalCache).toBeTypeOf('function');
    const cache = (
      incrementalCache as unknown as () => { opts: { bypassTagCacheOnCacheHit?: boolean } }
    )();
    expect(cache.opts.bypassTagCacheOnCacheHit).toBe(true);
  });

  it('should never bypass the tag cache without cache purge', () => {
    const incrementalCache = cloudflareConfig.default?.override
      ?.incrementalCache as unknown as () => {
      opts: { bypassTagCacheOnCacheHit?: boolean };
    };
    const bypass = incrementalCache().opts.bypassTagCacheOnCacheHit === true;
    const cdnInvalidation = cloudflareConfig.default?.override?.cdnInvalidation;

    if (bypass) {
      expect(cdnInvalidation).toBeDefined();
      expect(cdnInvalidation).not.toBe('dummy');
    }
  });
});
