import { describe, expect, it } from 'vitest';
import {
  diffLock,
  extractSeoFields,
  normalizeSeoPath,
  type ISeoLockEntry,
} from '@/lib/seo/seo-lock';
import { buildSeoLock, selectLockRows } from '@/scripts/seo/seo-lock-regen';

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
