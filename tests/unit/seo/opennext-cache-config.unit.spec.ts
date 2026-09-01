import { describe, expect, it } from 'vitest';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import cloudflareConfig from '../../../open-next.config';
import packageJson from '../../../package.json';
import wranglerConfig from '../../../wrangler.json';
import previewConfig from '../../../wrangler.preview.json';

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

describe('OpenNext incremental cache configuration', () => {
  it('should configure an incremental cache for the Cloudflare adapter', () => {
    const incrementalCache = cloudflareConfig.default?.override?.incrementalCache;
    expect(incrementalCache).toBeTypeOf('function');
    const cache = (incrementalCache as () => { name: string })();
    expect(cache.name).toBe('cf-r2-incremental-cache');
    expect((cache as unknown as { opts: { mode: string } }).opts.mode).toBe('long-lived');
  });

  it('should configure the durable revalidation queue for the server bundle', () => {
    expect(resolveQueueOverride(cloudflareConfig.default?.override?.queue)).toBe(doQueue);
  });

  it('should require the durable queue whether interception is enabled or disabled', () => {
    const interceptionEnabled = cloudflareConfig.dangerous?.enableCacheInterception === true;
    const queueConfigured =
      resolveQueueOverride(cloudflareConfig.default?.override?.queue) === doQueue;

    expect(!interceptionEnabled || queueConfigured).toBe(true);
    expect(interceptionEnabled || queueConfigured).toBe(true);
  });

  it('should propagate the durable queue to the middleware bundle', () => {
    expect(resolveQueueOverride(cloudflareConfig.middleware?.override?.queue)).toBe(doQueue);
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
});
