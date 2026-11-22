/**
 * Blog consolidation vs sitemap, lists and metadata
 *
 * Every slug the 2026-11-21 index-bloat manifest merges or noindexes must be
 * blocked from the sitemap and every list, must have a plain and a
 * locale-prefixed 301 in next.config.js, and must not chain into another
 * redirect.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { BLOCKED_BLOG_SLUGS, isNoindexBlogSlug } from '@shared/constants/blocked-blog-slugs';
import consolidation from '@shared/constants/blog-consolidation.json';

const require = createRequire(import.meta.url);
const { GUARDED_SLUGS, OWNER_RULES } = require('../../../scripts/seo/audit-index-bloat.cjs');

const ROOT = resolve(__dirname, '../../..');
const LOCALE_PATTERN = ':locale(en|fr|de|es|it|ja|pt)';
const BLOG_PAGE = resolve(ROOT, 'app/[locale]/blog/[slug]/page.tsx');

interface IRedirect {
  source: string;
  destination: string;
  permanent?: boolean;
}

function loadNextRedirects(): IRedirect[] {
  const output = execFileSync(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      '-e',
      "import('./next.config.js').then(async ({ default: config }) => process.stdout.write(JSON.stringify(await config.redirects())))",
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  return JSON.parse(output) as IRedirect[];
}

describe('blog consolidation file', () => {
  it('points at the 2026-11-21 index-bloat manifest', () => {
    expect(consolidation.source).toBe('docs/SEO/reports/2026-11-21-index-bloat-manifest.json');
  });

  it('carries every MERGE_301 redirect and NOINDEX_UNPUBLISH slug', () => {
    expect(Object.keys(consolidation.redirects)).toHaveLength(66);
    expect(consolidation.noindex).toHaveLength(16);
    expect(Object.keys(consolidation.redirects)).toEqual(
      [...Object.keys(consolidation.redirects)].sort()
    );
    expect(consolidation.noindex).toEqual([...consolidation.noindex].sort());
  });
});

describe('blog consolidation redirects', () => {
  let redirects: IRedirect[];

  beforeAll(() => {
    redirects = loadNextRedirects();
  });

  it('registers every redirect in next.config.js as a plain and locale-prefixed 301', () => {
    for (const [slug, target] of Object.entries(consolidation.redirects)) {
      const plain = redirects.find(entry => entry.source === `/blog/${slug}`);
      const locale = redirects.find(entry => entry.source === `/${LOCALE_PATTERN}/blog/${slug}`);

      expect(plain, `missing plain redirect for ${slug}`).toBeDefined();
      expect(plain?.destination).toBe(target);
      expect(plain?.permanent).toBe(true);
      expect(locale, `missing locale redirect for ${slug}`).toBeDefined();
      expect(locale?.destination).toBe(target);
      expect(locale?.permanent).toBe(true);
    }
  });

  it('never redirects to a destination that redirects again', () => {
    const sources = new Set(redirects.map(entry => entry.source));
    const chains = Object.values(consolidation.redirects).filter(target => sources.has(target));

    expect(chains, `redirect chains: ${chains.join(', ')}`).toEqual([]);
  });

  it('merges only into owner pages or non-consolidated targets', () => {
    const ownerTargets = new Set(OWNER_RULES.map((rule: { target: string }) => rule.target));
    const targets = new Set(Object.values(consolidation.redirects));

    for (const target of targets) {
      if (!target.startsWith('/blog/')) continue;
      const slug = target.slice('/blog/'.length);

      if (GUARDED_SLUGS.includes(slug)) {
        expect(ownerTargets, `${target} is guarded but not an owner target`).toContain(target);
      }
      expect(consolidation.redirects, `${target} is itself a redirect source`).not.toHaveProperty(
        slug
      );
      expect(consolidation.noindex).not.toContain(slug);
    }
  });
});

describe('blog consolidation blocked slugs', () => {
  it('blocks every redirect and noindex slug from sitemaps and lists', () => {
    const slugs = [...Object.keys(consolidation.redirects), ...consolidation.noindex];

    for (const slug of slugs) {
      expect(BLOCKED_BLOG_SLUGS, `missing blocked slug: ${slug}`).toContain(slug);
    }
  });
});

describe('blog consolidation noindex metadata', () => {
  it('marks consolidation noindex slugs and leaves kept posts indexable', () => {
    expect(isNoindexBlogSlug(consolidation.noindex[0])).toBe(true);
    expect(isNoindexBlogSlug('best-image-upscaler')).toBe(false);
  });

  it('wires the noindex helper into blog post robots metadata with follow preserved', () => {
    const source = readFileSync(BLOG_PAGE, 'utf8');

    expect(source).toMatch(
      /robots:\s*\{[\s\S]*?index:\s*!isNoindexBlogSlug\(slug\)[\s\S]*?follow:\s*true,[\s\S]*?\}/
    );
  });
});
