import { describe, expect, it } from 'vitest';
import cloudflareConfig from '../../../open-next.config';
import packageJson from '../../../package.json';
import wranglerConfig from '../../../wrangler.json';
import previewConfig from '../../../wrangler.preview.json';

describe('OpenNext incremental cache configuration', () => {
  it('should configure an incremental cache for the Cloudflare adapter', () => {
    const incrementalCache = cloudflareConfig.default?.override?.incrementalCache;
    expect(incrementalCache).toBeTypeOf('function');
    const cache = (incrementalCache as () => { name: string })();
    expect(cache.name).toBe('cf-r2-incremental-cache');
    expect((cache as unknown as { opts: { mode: string } }).opts.mode).toBe('long-lived');
  });

  it('should intercept cached HTML before invoking the Next server bundle', () => {
    expect(cloudflareConfig.dangerous?.enableCacheInterception).toBe(true);
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
