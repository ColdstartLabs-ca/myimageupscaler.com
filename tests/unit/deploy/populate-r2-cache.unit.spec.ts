import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  buildEndpoint,
  collectCacheAssets,
  computeCacheKey,
  readBucketConfig,
  resolvePrefix,
} from '../../../scripts/deploy/populate-r2-cache';

const BUILD_ID = 'K-Q_wWz0JCuAfSQI-mlcW';

let cacheDir: string;

beforeAll(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-cache-'));
  const write = (relative: string, contents: string) => {
    const full = path.join(cacheDir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  };

  write(`${BUILD_ID}/about.cache`, 'about');
  write(`${BUILD_ID}/fr/blog/best-ai-upscaler.cache`, 'blog');
  write(`__fetch/${BUILD_ID}/some/fetch/entry`, 'fetched');
});

afterAll(() => {
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

describe('computeCacheKey', () => {
  // The Worker recomputes this key at runtime via @opennextjs/cloudflare. If the format
  // drifts, every prerendered page silently becomes a cache miss, so pin the exact shape.
  test('matches the OpenNext key format', () => {
    const hash = createHash('sha256').update('/fr/blog/best-ai-upscaler').digest('hex');

    expect(computeCacheKey('/fr/blog/best-ai-upscaler', { buildId: BUILD_ID })).toBe(
      `incremental-cache/${BUILD_ID}/${hash}.cache`
    );
  });

  test('uses the fetch suffix for fetch-cache entries', () => {
    expect(computeCacheKey('/some/fetch/entry', { buildId: BUILD_ID, cacheType: 'fetch' })).toMatch(
      new RegExp(`^incremental-cache/${BUILD_ID}/[0-9a-f]{64}\\.fetch$`)
    );
  });

  test('collapses duplicate slashes introduced by a trailing-slash prefix', () => {
    expect(computeCacheKey('/about', { prefix: 'custom/', buildId: BUILD_ID })).toBe(
      `custom/${BUILD_ID}/${createHash('sha256').update('/about').digest('hex')}.cache`
    );
  });

  test('falls back to the OpenNext no-build-id placeholder', () => {
    expect(computeCacheKey('/about', {})).toContain('incremental-cache/no-build-id/');
  });
});

describe('collectCacheAssets', () => {
  test('derives the build id and key from page cache paths', () => {
    const assets = collectCacheAssets(cacheDir);
    const blog = assets.find(a => a.fullPath.endsWith('best-ai-upscaler.cache'));

    expect(blog).toMatchObject({
      key: '/fr/blog/best-ai-upscaler',
      buildId: BUILD_ID,
      isFetch: false,
      size: 4,
    });
  });

  test('strips the __fetch segment from fetch cache paths', () => {
    const fetched = collectCacheAssets(cacheDir).find(a => a.isFetch);

    expect(fetched).toMatchObject({ key: '/some/fetch/entry', buildId: BUILD_ID });
  });

  test('collects every file exactly once', () => {
    expect(collectCacheAssets(cacheDir)).toHaveLength(3);
  });

  test('returns nothing when the build produced no cache directory', () => {
    expect(collectCacheAssets(path.join(cacheDir, 'missing'))).toEqual([]);
  });
});

describe('readBucketConfig', () => {
  test('reads the incremental cache bucket from the real wrangler config', () => {
    const wranglerConfig = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'wrangler.json'), 'utf8')
    );

    expect(readBucketConfig(wranglerConfig).bucket).toBe('myimageupscaler-inc-cache');
  });

  test('throws when the cache binding is missing so a deploy cannot silently skip it', () => {
    expect(() =>
      readBucketConfig({ r2_buckets: [{ binding: 'OTHER', bucket_name: 'x' }] })
    ).toThrow(/NEXT_INC_CACHE_R2_BUCKET/);
  });

  test('throws when the binding has no bucket name', () => {
    expect(() =>
      readBucketConfig({ r2_buckets: [{ binding: 'NEXT_INC_CACHE_R2_BUCKET' }] })
    ).toThrow(/bucket_name/);
  });
});

describe('resolvePrefix', () => {
  test('defaults to the OpenNext prefix', () => {
    expect(resolvePrefix({}, {})).toBe('incremental-cache');
  });

  test('prefers the environment override over the wrangler var', () => {
    const config = { vars: { NEXT_INC_CACHE_R2_PREFIX: 'from-config' } };

    expect(resolvePrefix(config, { NEXT_INC_CACHE_R2_PREFIX: 'from-env' })).toBe('from-env');
    expect(resolvePrefix(config, {})).toBe('from-config');
  });
});

describe('buildEndpoint', () => {
  test('builds the account S3 endpoint', () => {
    expect(buildEndpoint('acct123')).toBe('https://acct123.r2.cloudflarestorage.com');
  });

  test('includes the jurisdiction when the bucket has one', () => {
    expect(buildEndpoint('acct123', 'eu')).toBe('https://acct123.eu.r2.cloudflarestorage.com');
  });
});
