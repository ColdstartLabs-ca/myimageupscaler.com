import { revalidatePath } from 'next/cache';
import { SUPPORTED_LOCALES } from '@/i18n/config';

/**
 * Invalidate the rendered pages for a blog post across every locale.
 *
 * Blog posts render from `app/[locale]/blog/[slug]/page.tsx` — a `force-static` route
 * with a 24h `revalidate`. There is no non-locale `app/blog` route, so
 * `revalidatePath('/blog/my-slug')` matches nothing and the page keeps serving stale
 * HTML for up to a day while the API reports a successful update.
 *
 * The locale segment has to be spelled out for the invalidation to land.
 */
export function revalidateBlogPaths(slug: string): void {
  for (const locale of SUPPORTED_LOCALES) {
    revalidatePath(`/${locale}/blog/${slug}`);
    revalidatePath(`/${locale}/blog`);
  }
}
