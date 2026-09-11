import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SUPPORTED_LOCALES } from '@/i18n/config';

/**
 * Blog posts render from `app/[locale]/blog/[slug]/page.tsx`, which is `force-static`
 * with `revalidate = 86400`. There is no non-locale `app/blog` route.
 *
 * `revalidatePath('/blog/my-slug')` therefore matches nothing: the rendered page keeps
 * serving the previous HTML for up to 24 hours after an edit, while the API reports a
 * successful update. Every blog edit since the locale refactor has silently failed to
 * reach readers this way — which is why entries in the GSC request-indexing backlog
 * record having to wait and re-check whether "API and live cached HTML matched".
 *
 * The locale segment has to be spelled out for the invalidation to land.
 */
const ROUTES = {
  patch: 'app/api/blog/posts/[slug]/route.ts',
  publish: 'app/api/blog/posts/[slug]/publish/route.ts',
  unpublish: 'app/api/blog/posts/[slug]/unpublish/route.ts',
} as const;

const BLOG_PAGE = 'app/[locale]/blog/[slug]/page.tsx';

describe('blog revalidation covers the locale-segmented route', () => {
  it('confirms the premise: the blog post page is a static [locale] route', () => {
    const page = readFileSync(BLOG_PAGE, 'utf8');
    expect(page).toContain("export const dynamic = 'force-static'");
    expect(page).toContain('export const revalidate =');
  });

  it('the shared helper spells out the locale segment for every supported locale', () => {
    const helper = readFileSync('lib/blog/revalidate-blog-paths.ts', 'utf8');

    expect(helper).toContain('SUPPORTED_LOCALES');
    expect(helper).toMatch(/revalidatePath\(\s*`\/\$\{locale\}\/blog\/\$\{slug\}`\s*\)/);
    expect(helper).toMatch(/revalidatePath\(\s*`\/\$\{locale\}\/blog`\s*\)/);
  });

  it.each(Object.entries(ROUTES))(
    '%s routes invalidation through the shared helper, never a bare /blog path',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');

      expect(source).toContain('revalidateBlogPaths(slug)');
      // A bare `/blog` path matches no route and would silently no-op.
      expect(source).not.toMatch(/revalidatePath\(\s*['"`]\/blog/);
    }
  );

  it('keeps every locale in one list so a new locale cannot be missed', () => {
    expect(SUPPORTED_LOCALES).toContain('en');
    expect(SUPPORTED_LOCALES.length).toBeGreaterThan(1);
  });
});
