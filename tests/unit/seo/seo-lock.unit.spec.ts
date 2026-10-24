import { describe, expect, it, vi } from 'vitest';
import { fetch as nodeFetch } from 'undici';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  diffLock,
  extractSeoFields,
  loadEffectiveLock,
  normalizeSeoPath,
  type ISeoLockEntry,
} from '@/lib/seo/seo-lock';
import { buildSeoLock, selectLockRows, withRenderedServer } from '@/scripts/seo/seo-lock-regen';

const HTML = `
  <html>
    <head>
      <title>Locked &amp; useful title</title>
      <meta name="description" content="A locked description with &quot;quotes&quot;.">
      <meta name="robots" content="index,  follow">
      <link rel="canonical" href="https://myimageupscaler.com/blog/locked/">
      <link rel="alternate" hreflang="es" href="https://myimageupscaler.com/es/blog/locked/">
      <link rel="alternate" hreflang="en" href="https://myimageupscaler.com/blog/locked/">
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"BlogPosting","@graph":[{"@type":["Article","Thing"]}]}
      </script>
    </head>
    <body>
      <h1>Locked useful heading</h1>
      <main><p>First paragraph with   stable whitespace.</p><p>Other text.</p></main>
    </body>
  </html>
`;

describe('effective SEO lock', () => {
  it('includes auto entries and keeps signed JSON authoritative on collisions', async () => {
    const fields = await extractSeoFields(HTML);
    const signed = { ...fields, source: 'code' as const, clicks28d: 40 };
    const auto = { ...signed, title: 'Auto locked title' };
    expect(await loadEffectiveLock({ '/signed': signed }, async () => ({ '/signed': auto, '/auto': auto })))
      .toEqual({ '/signed': signed, '/auto': auto });
  });

  it('fails closed when the auto-lock store cannot be read', async () => {
    await expect(loadEffectiveLock({}, async () => { throw new Error('DB unavailable'); }))
      .rejects.toThrow('DB unavailable');
  });
});

describe('regeneration server lifecycle', () => {
  it('keeps the server alive until the asynchronous crawl finishes', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'seo-lock-server-'));
    const bin = join(repo, 'node_modules/next/dist/bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'next'), `
      const { createServer } = require('node:http');
      createServer((_req, res) => res.end(${JSON.stringify(HTML)}))
        .listen(Number(process.argv[process.argv.indexOf('--port') + 1]), 'localhost');
    `);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(repo);
    vi.stubGlobal('fetch', nodeFetch);
    try {
      const result = await withRenderedServer(undefined, async fetchPage => {
        await new Promise(resolve => setTimeout(resolve, 30));
        return Promise.all(['/first', '/second'].map(path => fetchPage(path)));
      });
      expect(result.map(page => page.status)).toEqual([200, 200]);
      expect(result.map(page => page.html)).toEqual([HTML, HTML]);
    } finally {
      cwd.mockRestore();
      vi.unstubAllGlobals();
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('SEO lock normalization', () => {
  it('extracts and normalizes the eight locked rendered fields', async () => {
    const fields = await extractSeoFields(HTML);

    expect(fields.title).toBe('Locked & useful title');
    expect(fields.description).toBe('A locked description with "quotes".');
    expect(fields.h1).toBe('Locked useful heading');
    expect(fields.introHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fields.canonical).toBe('https://myimageupscaler.com/blog/locked');
    expect(fields.robots).toBe('index, follow');
    expect(fields.hreflang).toEqual([
      'en=https://myimageupscaler.com/blog/locked',
      'es=https://myimageupscaler.com/es/blog/locked',
    ]);
    expect(fields.jsonLdTypes).toEqual(['Article', 'BlogPosting', 'Thing']);
  });

  it('normalizes paths without changing their URL ownership', () => {
    expect(normalizeSeoPath('https://myimageupscaler.com/blog/locked/?utm_source=test')).toBe(
      '/blog/locked'
    );
    expect(normalizeSeoPath('/')).toBe('/');
  });

  it('reports changed locked values and ignores audit metadata', () => {
    const entry: ISeoLockEntry = {
      title: 'Locked title',
      description: 'Locked description',
      h1: 'Locked heading',
      introHash: 'a'.repeat(64),
      canonical: 'https://myimageupscaler.com/blog/locked',
      robots: 'index, follow',
      hreflang: ['en=https://myimageupscaler.com/blog/locked'],
      jsonLdTypes: ['BlogPosting'],
      source: 'db',
      clicks28d: 21,
    };

    const diffs = diffLock(entry, {
      ...entry,
      title: 'Changed title',
      clicks28d: 999,
    });

    expect(diffs).toEqual([{ field: 'title', expected: 'Locked title', actual: 'Changed title' }]);
  });

  it('keeps only URLs above the click threshold and writes complete entries', async () => {
    const rows = [
      { page: 'https://myimageupscaler.com/blog/locked/', clicks: 20 },
      { page: 'https://myimageupscaler.com/blog/locked?utm_source=gsc', clicks: 2 },
      { page: 'https://myimageupscaler.com/tools/ai-image-upscaler', clicks: 21 },
    ];

    expect(selectLockRows(rows)).toEqual([
      { path: '/blog/locked', clicks28d: 22 },
      { path: '/tools/ai-image-upscaler', clicks28d: 21 },
    ]);

    const lock = await buildSeoLock(rows, async path => ({
      status: 200,
      html: HTML.replaceAll('/blog/locked', path),
    }));

    expect(Object.keys(lock)).toEqual(['/blog/locked', '/tools/ai-image-upscaler']);
    expect(lock['/blog/locked']).toMatchObject({ source: 'db', clicks28d: 22 });
    expect(lock['/tools/ai-image-upscaler']).toMatchObject({ source: 'code', clicks28d: 21 });
    for (const entry of Object.values(lock)) {
      expect(Object.keys(entry)).toEqual([
        'title',
        'description',
        'h1',
        'introHash',
        'canonical',
        'robots',
        'hreflang',
        'jsonLdTypes',
        'source',
        'clicks28d',
      ]);
    }
  });
});
