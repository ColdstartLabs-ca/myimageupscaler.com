/** Shared Tailwind class strings for consistent blog UI */

export const blogPrimaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg shadow-accent/25 gradient-cta transition-all hover:scale-[1.02] hover:opacity-90 active:scale-[0.98]';

export const blogSecondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-main/40 px-6 py-3 text-sm font-semibold text-accent transition-all hover:border-accent/50 hover:bg-accent/10';

export const blogCompactPrimaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent/90';

export const blogHeroPrimaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/20 gradient-cta transition-all hover:opacity-90';

export const blogHeroSecondaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-main/40 px-4 py-2.5 text-sm font-medium text-accent transition-all hover:border-accent/50 hover:bg-accent/10';

export const blogCardClass = 'rounded-2xl border border-border bg-surface-light shadow-card';

export const blogCategoryBadgeClass =
  'inline-flex items-center rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent';

export const blogPostCardClass =
  'group rounded-2xl border border-border bg-surface-light transition-all duration-300 hover:-translate-y-1 hover:border-accent/50';

export const blogTagLinkClass =
  'text-xs text-text-secondary underline-offset-2 transition-colors hover:text-accent hover:underline';

export interface IBlogHeroTitleParts {
  lead: string;
  highlight: string | null;
}

/** Split long blog titles into a white lead + gradient highlight, mirroring the landing hero. */
export function splitBlogHeroTitle(title: string): IBlogHeroTitleParts {
  const colonIndex = title.indexOf(':');
  if (colonIndex > 0 && colonIndex < title.length - 2) {
    return {
      lead: title.slice(0, colonIndex + 1).trimEnd(),
      highlight: title.slice(colonIndex + 1).trim(),
    };
  }

  const dashMatch = title.match(/^(.+?\s[-–—]\s)(.+)$/);
  if (dashMatch) {
    return {
      lead: dashMatch[1].trimEnd(),
      highlight: dashMatch[2].trim(),
    };
  }

  const words = title.split(/\s+/);
  if (words.length >= 5) {
    const highlightWordCount = Math.min(4, Math.ceil(words.length / 3));
    return {
      lead: words.slice(0, -highlightWordCount).join(' '),
      highlight: words.slice(-highlightWordCount).join(' '),
    };
  }

  return { lead: title, highlight: null };
}
