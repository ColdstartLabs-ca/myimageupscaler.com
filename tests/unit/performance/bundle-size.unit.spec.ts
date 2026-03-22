/**
 * Bundle Size Regression Tests — Phase 2 (DevTools chunk elimination)
 *
 * Guards against re-introducing the 222 KiB `ed9f2dc4` / next-devtools chunk
 * that was eliminated in commit d85e761 via:
 *   1. `devIndicators: false` in next.config.js
 *   2. webpack alias: next/dist/compiled/next-devtools → dev-overlay.shim.js
 *
 * The devtools bundle weighs ~800 KB source / ~222 KiB transferred. Without
 * the alias, Next.js ships the full chunk to every client page load even though
 * HMR events never fire in production.
 *
 * Thresholds (uncompressed):
 *   - Total JS in .next/static/chunks/: < 8 MB  (current: ~3.25 MB; 5 MB headroom)
 *   - Largest single chunk:             < 450 KB (current: ~390 KB; devtools was 800 KB)
 *
 * If `.next` does not exist (e.g. fresh checkout without a build), the tests
 * skip gracefully so CI pipelines that run tests before building are not broken.
 */

import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const CHUNKS_DIR = join(ROOT, '.next', 'static', 'chunks');

/** Threshold constants — update these if you intentionally add large bundles */
const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // 8 MB uncompressed
const MAX_SINGLE_CHUNK_BYTES = 450 * 1024; // 450 KB uncompressed

/**
 * Reads every *.js file in CHUNKS_DIR and returns their stat sizes.
 * Returns null if the directory does not exist (pre-build environment).
 */
function readChunkSizes(): { name: string; bytes: number }[] | null {
  if (!existsSync(CHUNKS_DIR)) {
    return null;
  }

  const entries = readdirSync(CHUNKS_DIR);
  const jsFiles = entries.filter(f => f.endsWith('.js'));

  return jsFiles.map(name => ({
    name,
    bytes: statSync(join(CHUNKS_DIR, name)).size,
  }));
}

/**
 * Returns the set of chunk filenames that are loaded via React.lazy / dynamic import.
 * These chunks are only downloaded when the user triggers the feature (e.g. HeicConverter
 * loading heic2any), so they should not be held to the same eager-load size limit.
 * Large lazy chunks have their own separate size guard.
 *
 * Supports two build modes:
 *   - Webpack: reads `react-loadable-manifest.json`
 *   - Turbopack: scans chunk files for the Turbopack lazy-load pattern
 *     `Promise.all([...].map(t=>e.l(t)))` where `e.l` / `s.l` is the
 *     Turbopack chunk loader. Chunks listed only in those calls are lazy.
 */
function getLazyChunkNames(): Set<string> {
  // Webpack path
  const manifestPath = join(ROOT, '.next', 'react-loadable-manifest.json');
  if (existsSync(manifestPath)) {
    const manifest: Record<string, { files: string[] }> = JSON.parse(
      readFileSync(manifestPath, 'utf8')
    );
    const names = new Set<string>();
    for (const entry of Object.values(manifest)) {
      for (const file of entry.files ?? []) {
        names.add(basename(file));
      }
    }
    return names;
  }

  // Turbopack path: detect lazy chunks from the dynamic-import pattern.
  // In Turbopack output, a lazy chunk load looks like:
  //   Promise.all(["static/chunks/abc123.js"].map(t=>e.l(t))).then(...)
  // Chunks listed ONLY in such patterns are lazy; eagerly-loaded chunks
  // appear in `otherChunks:[...]` arrays at the top of entry chunks.
  if (!existsSync(CHUNKS_DIR)) return new Set();

  const entries = readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.js'));

  // Build a set of all chunk names referenced eagerly (otherChunks arrays)
  const eagerChunks = new Set<string>();
  // Build a set of all chunk names referenced lazily (Promise.all + e.l())
  const lazyReferences = new Set<string>();

  // Regex to capture chunks inside Promise.all([...].map(t=>?.l(t)))
  const lazyPattern = /Promise\.all\(\[([^\]]+)\]\.map\([^)]+\.l\(/g;
  // Regex to capture chunks inside otherChunks:[...]
  const eagerPattern = /otherChunks:\[([^\]]+)\]/g;
  // Regex to extract quoted chunk paths
  const chunkNameRe = /"static\/chunks\/([^"]+\.js)"/g;

  for (const name of entries) {
    let content: string;
    try {
      content = readFileSync(join(CHUNKS_DIR, name), 'utf8');
    } catch {
      continue;
    }

    let m: RegExpExecArray | null;

    eagerPattern.lastIndex = 0;
    while ((m = eagerPattern.exec(content)) !== null) {
      const block = m[1];
      chunkNameRe.lastIndex = 0;
      let nm: RegExpExecArray | null;
      while ((nm = chunkNameRe.exec(block)) !== null) {
        eagerChunks.add(nm[1]);
      }
    }

    lazyPattern.lastIndex = 0;
    while ((m = lazyPattern.exec(content)) !== null) {
      const block = m[1];
      chunkNameRe.lastIndex = 0;
      let nm: RegExpExecArray | null;
      while ((nm = chunkNameRe.exec(block)) !== null) {
        lazyReferences.add(nm[1]);
      }
    }
  }

  // A chunk is lazy if it appears in lazy references but NOT in eager otherChunks
  const lazyChunks = new Set<string>();
  for (const ref of lazyReferences) {
    if (!eagerChunks.has(ref)) {
      lazyChunks.add(basename(ref));
    }
  }
  return lazyChunks;
}

describe('Homepage JS payload — Phase 2 bundle size regression', () => {
  it('should skip gracefully when .next build directory does not exist', () => {
    if (!existsSync(CHUNKS_DIR)) {
      // No build present — nothing to assert. This is expected in CI before `next build`.
      console.info(
        '[bundle-size] .next/static/chunks not found — skipping bundle size checks (run `next build` first)'
      );
      return;
    }
    // Build exists — the remaining tests below cover the assertions.
    expect(existsSync(CHUNKS_DIR)).toBe(true);
  });

  it('total uncompressed JS in .next/static/chunks/ should be under 8 MB', () => {
    const chunks = readChunkSizes();

    if (chunks === null) {
      console.info('[bundle-size] No build found — skipping total size check');
      return;
    }

    const totalBytes = chunks.reduce((sum, c) => sum + c.bytes, 0);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

    console.info(
      `[bundle-size] Total uncompressed JS: ${totalMB} MB across ${chunks.length} chunks`
    );

    expect(totalBytes).toBeLessThan(
      MAX_TOTAL_BYTES,
      `Total JS bundle (${totalMB} MB) exceeds the 8 MB threshold. ` +
        `This may indicate a large dependency was accidentally added to the client bundle. ` +
        `Run: ls -lh .next/static/chunks/*.js | sort -rh`
    );
  });

  it('no eagerly-loaded chunk should exceed 450 KB uncompressed (guards against DevTools re-introduction)', () => {
    const chunks = readChunkSizes();

    if (chunks === null) {
      console.info('[bundle-size] No build found — skipping single-chunk size check');
      return;
    }

    // Lazy chunks (React.lazy / next/dynamic) are excluded: they are only downloaded
    // when the user triggers the specific feature. heic2any (1.35 MB) is a known
    // example — it is only loaded by HeicConverter and has its own size guard below.
    const lazyChunks = getLazyChunkNames();

    const oversizedChunks = chunks
      .filter(c => c.bytes > MAX_SINGLE_CHUNK_BYTES && !lazyChunks.has(c.name))
      .map(c => `  ${c.name}: ${(c.bytes / 1024).toFixed(1)} KB`)
      .sort();

    if (oversizedChunks.length > 0) {
      console.error('[bundle-size] Oversized eager chunks detected:');
      oversizedChunks.forEach(line => console.error(line));
    }

    expect(oversizedChunks).toHaveLength(
      0,
      `Found ${oversizedChunks.length} eagerly-loaded chunk(s) exceeding 450 KB:\n` +
        `${oversizedChunks.join('\n')}\n\n` +
        `The Next.js DevTools bundle (next/dist/compiled/next-devtools) weighs ~800 KB ` +
        `uncompressed. If that chunk has returned, verify that:\n` +
        `  1. next.config.js has devIndicators: false\n` +
        `  2. webpack alias for next/dist/compiled/next-devtools → dev-overlay.shim.js is in place\n` +
        `  3. The alias applies to !dev && !isServer builds`
    );
  });

  it('no lazy-loaded chunk should exceed 2 MB uncompressed (guards against unbounded lazy bundles)', () => {
    const chunks = readChunkSizes();

    if (chunks === null) {
      console.info('[bundle-size] No build found — skipping lazy-chunk size check');
      return;
    }

    const MAX_LAZY_CHUNK_BYTES = 2 * 1024 * 1024; // 2 MB
    const lazyChunks = getLazyChunkNames();

    const oversizedLazyChunks = chunks
      .filter(c => c.bytes > MAX_LAZY_CHUNK_BYTES && lazyChunks.has(c.name))
      .map(c => `  ${c.name}: ${(c.bytes / 1024).toFixed(1)} KB`)
      .sort();

    if (oversizedLazyChunks.length > 0) {
      console.error('[bundle-size] Oversized lazy chunks detected:');
      oversizedLazyChunks.forEach(line => console.error(line));
    }

    expect(oversizedLazyChunks).toHaveLength(
      0,
      `Found ${oversizedLazyChunks.length} lazy chunk(s) exceeding 2 MB:\n` +
        `${oversizedLazyChunks.join('\n')}\n\n` +
        `heic2any is the known-large lazy chunk (~1.35 MB). If a new chunk appears ` +
        `here, investigate what dependency was added.`
    );
  });

  it('should confirm the 62-chunk baseline is not dramatically exceeded (no accidental bundle explosion)', () => {
    const chunks = readChunkSizes();

    if (chunks === null) {
      console.info('[bundle-size] No build found — skipping chunk count check');
      return;
    }

    // Allow up to 100 chunks before flagging (current baseline: 62).
    // A sudden jump to 150+ chunks would indicate a build configuration regression.
    const MAX_CHUNK_COUNT = 100;

    console.info(
      `[bundle-size] Chunk count: ${chunks.length} (baseline: 62, limit: ${MAX_CHUNK_COUNT})`
    );

    expect(chunks.length).toBeLessThan(
      MAX_CHUNK_COUNT,
      `Chunk count (${chunks.length}) is unexpectedly high. ` +
        `Baseline is ~62 chunks. A large increase may indicate bundle splitting config regression.`
    );
  });
});
