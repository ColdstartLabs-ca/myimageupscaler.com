#!/usr/bin/env tsx
/**
 * Populates the OpenNext incremental-cache R2 bucket.
 *
 * `opennextjs-cloudflare deploy` does this with `wrangler r2 bulk put`, which throttles
 * itself to 1100 objects per 5 minutes to stay under the Cloudflare REST API rate limit.
 * With ~4.3k cache objects that is a ~16 minute floor no matter how much concurrency or
 * bandwidth is available, and OpenNext pipes wrangler's stdout so the progress wrangler
 * does print never reaches the terminal.
 *
 * R2's S3-compatible API is not subject to that limit, so upload through it when R2 S3
 * credentials are available. Without credentials this falls back to `wrangler r2 bulk
 * put` with inherited stdio, which is the same speed as before but shows progress.
 *
 * The object keys produced here must match `computeCacheKey` in
 * `@opennextjs/cloudflare/dist/api/overrides/internal.js`, which is what the Worker uses
 * to read the cache at runtime.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { AwsClient } from 'aws4fetch';

/** Mirrors DEFAULT_PREFIX in @opennextjs/cloudflare. */
const DEFAULT_PREFIX = 'incremental-cache';
const R2_BINDING_NAME = 'NEXT_INC_CACHE_R2_BUCKET';
const R2_PREFIX_ENV_NAME = 'NEXT_INC_CACHE_R2_PREFIX';

const DEFAULT_CONCURRENCY = 64;
const MAX_ATTEMPTS = 4;

export interface ICacheAsset {
  fullPath: string;
  /** Cache key as OpenNext computes it, e.g. `/fr/blog/best-ai-upscaler`. */
  key: string;
  buildId: string;
  isFetch: boolean;
  size: number;
}

export interface IR2BucketConfig {
  bucket: string;
  jurisdiction?: string;
}

/**
 * Mirrors `computeCacheKey` in @opennextjs/cloudflare. The Worker recomputes this at
 * runtime, so any divergence silently turns every request into a cache miss.
 */
export function computeCacheKey(
  key: string,
  options: { prefix?: string; buildId?: string; cacheType?: 'cache' | 'fetch' }
): string {
  const { cacheType = 'cache', prefix = DEFAULT_PREFIX, buildId = 'no-build-id' } = options;
  const hash = createHash('sha256').update(key).digest('hex');
  return `${prefix}/${buildId}/${hash}.${cacheType}`.replace(/\/+/g, '/');
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Mirrors `getCacheAssets` in @opennextjs/cloudflare: `__fetch/<buildId>/<key>` holds
 * fetch-cache entries, everything else is `<buildId>/<key>.cache`.
 */
export function collectCacheAssets(cacheDir: string): ICacheAsset[] {
  if (!fs.existsSync(cacheDir)) return [];

  return listFiles(cacheDir).map(fullPath => {
    const relativePath = path.relative(cacheDir, fullPath).split(path.sep).join('/');
    const isFetch = relativePath.startsWith('__fetch/');
    const parts = (
      isFetch ? relativePath.slice('__fetch/'.length) : relativePath.slice(0, -'.cache'.length)
    ).split('/');
    const [buildId, ...keyParts] = parts;

    if (!isFetch && !relativePath.endsWith('.cache')) {
      throw new Error(`Invalid path for a cache asset file: ${relativePath}`);
    }
    if (!buildId || keyParts.length === 0) {
      throw new Error(`Invalid path for a cache asset file: ${relativePath}`);
    }

    return {
      fullPath,
      key: `/${keyParts.join('/')}`,
      buildId,
      isFetch,
      size: fs.statSync(fullPath).size,
    };
  });
}

/** Reads the incremental-cache bucket out of the Wrangler config. */
export function readBucketConfig(wranglerConfig: unknown): IR2BucketConfig {
  const buckets =
    (wranglerConfig as { r2_buckets?: Array<Record<string, string>> })?.r2_buckets ?? [];
  const binding = buckets.find(b => b.binding === R2_BINDING_NAME);

  if (!binding) throw new Error(`No R2 binding "${R2_BINDING_NAME}" found in the Wrangler config`);
  if (!binding.bucket_name) throw new Error(`R2 binding "${R2_BINDING_NAME}" has no "bucket_name"`);

  return { bucket: binding.bucket_name, jurisdiction: binding.jurisdiction };
}

export function resolvePrefix(
  wranglerConfig: unknown,
  env: Record<string, string | undefined> = process.env
): string {
  const vars = (wranglerConfig as { vars?: Record<string, string> })?.vars ?? {};
  return env[R2_PREFIX_ENV_NAME] || vars[R2_PREFIX_ENV_NAME] || DEFAULT_PREFIX;
}

export function buildEndpoint(accountId: string, jurisdiction?: string): string {
  const host = jurisdiction ? `${accountId}.${jurisdiction}` : accountId;
  return `https://${host}.r2.cloudflarestorage.com`;
}

function formatBytes(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Uploads every asset through R2's S3 API, which has no bulk-put rate cap. */
async function uploadViaS3(
  assets: ICacheAsset[],
  options: {
    client: AwsClient;
    endpoint: string;
    bucket: string;
    prefix: string;
    concurrency: number;
  }
): Promise<void> {
  const { client, endpoint, bucket, prefix, concurrency } = options;
  const totalBytes = assets.reduce((sum, a) => sum + a.size, 0);
  const startedAt = Date.now();

  let nextIndex = 0;
  let done = 0;
  let uploadedBytes = 0;
  let lastReport = 0;

  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < 1000) return;
    lastReport = now;
    const elapsed = now - startedAt;
    const rate = elapsed > 0 ? (uploadedBytes / elapsed) * 1000 : 0;
    const line = `  → ${done}/${assets.length} objects · ${formatBytes(uploadedBytes)}/${formatBytes(totalBytes)} · ${formatBytes(rate)}/s · ${formatDuration(elapsed)}`;
    if (process.stdout.isTTY) process.stdout.write(`\r\u001b[2K${line}`);
    else if (force || done % 500 === 0) process.stdout.write(`${line}\n`);
  };

  const put = async (asset: ICacheAsset) => {
    const objectKey = computeCacheKey(asset.key, {
      prefix,
      buildId: asset.buildId,
      cacheType: asset.isFetch ? 'fetch' : 'cache',
    });
    const url = `${endpoint}/${bucket}/${objectKey}`;
    const body = await fs.promises.readFile(asset.fullPath);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await client.fetch(url, { method: 'PUT', body });
      if (response.ok) return;

      const retriable = response.status === 429 || response.status >= 500;
      if (!retriable || attempt === MAX_ATTEMPTS) {
        throw new Error(`PUT ${objectKey} failed: ${response.status} ${await response.text()}`);
      }
      await new Promise(resolve => setTimeout(resolve, 2 ** attempt * 250));
    }
  };

  const worker = async () => {
    for (let i = nextIndex++; i < assets.length; i = nextIndex++) {
      const asset = assets[i];
      await put(asset);
      done++;
      uploadedBytes += asset.size;
      report();
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, assets.length) }, worker));
  report(true);
  if (process.stdout.isTTY) process.stdout.write('\n');
}

/**
 * Wrangler path, used when no R2 S3 credentials are configured. Same 1100-objects-per-5
 * -minutes throttle OpenNext hits, but stdio is inherited so the progress is visible.
 */
function uploadViaWrangler(
  assets: ICacheAsset[],
  bucketConfig: IR2BucketConfig,
  prefix: string
): void {
  const objectList = assets.map(asset => ({
    key: computeCacheKey(asset.key, {
      prefix,
      buildId: asset.buildId,
      cacheType: asset.isFetch ? 'fetch' : 'cache',
    }),
    file: asset.fullPath,
  }));

  const listFile = path.join(
    fs.mkdtempSync(path.join(process.cwd(), '.open-next', 'r2-')),
    'bulk-list.json'
  );
  fs.writeFileSync(listFile, JSON.stringify(objectList));

  try {
    const args = [
      'wrangler',
      'r2',
      'bulk',
      'put',
      bucketConfig.bucket,
      '--filename',
      listFile,
      '--concurrency',
      '50',
    ];
    if (bucketConfig.jurisdiction) args.push('--jurisdiction', bucketConfig.jurisdiction);
    const result = spawnSync('npx', args, { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('wrangler r2 bulk put failed');
  } finally {
    fs.rmSync(path.dirname(listFile), { recursive: true, force: true });
  }
}

export async function populateR2Cache(): Promise<void> {
  const cacheDir = path.join(process.cwd(), '.open-next', 'cache');
  const wranglerConfig = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'wrangler.json'), 'utf8')
  );
  const bucketConfig = readBucketConfig(wranglerConfig);
  const prefix = resolvePrefix(wranglerConfig);

  const assets = collectCacheAssets(cacheDir);
  if (assets.length === 0) {
    console.log('  → No incremental cache assets to upload');
    return;
  }

  const totalBytes = assets.reduce((sum, a) => sum + a.size, 0);
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  console.log(
    `  → ${assets.length} cache objects (${formatBytes(totalBytes)}) → r2://${bucketConfig.bucket}/${prefix}`
  );

  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.log(
      '  ⚠ R2 S3 credentials not set (CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).'
    );
    console.log('  ⚠ Falling back to wrangler, which is rate limited to 1100 objects / 5 min.');
    uploadViaWrangler(assets, bucketConfig, prefix);
    return;
  }

  const concurrency = Math.max(1, Number(process.env.R2_UPLOAD_CONCURRENCY) || DEFAULT_CONCURRENCY);
  await uploadViaS3(assets, {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' }),
    endpoint: buildEndpoint(accountId, bucketConfig.jurisdiction),
    bucket: bucketConfig.bucket,
    prefix,
    concurrency,
  });
}

const isDirectRun =
  process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isDirectRun) {
  populateR2Cache().catch(error => {
    console.error(`  ✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
