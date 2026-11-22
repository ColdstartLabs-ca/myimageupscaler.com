/**
 * Contextual internal links from blog posts to the tool or alternative page
 * that owns the search intent (PRD-TR-2026-11-02 AC-4).
 *
 * Rules are ordered. The first match wins. Open SEO experiments are excluded
 * so their internal linking stays unchanged while tests run.
 */

export interface IBlogToolLink {
  href: string;
  anchor: string;
}

interface IBlogToolLinkRule {
  match: (slug: string) => boolean;
  links: readonly IBlogToolLink[];
}

const EXCLUDED_SLUGS = new Set([
  'tiktok-profile-picture-ideas',
  'topaz-labs-free-trial',
  'poster-size-dimensions-pixels',
  'best-free-ai-image-upscaler-2026-tested-compared',
]);

const BLOG_TOOL_LINK_RULES: readonly IBlogToolLinkRule[] = [
  {
    match: slug => /background|transparent|cutout/.test(slug),
    links: [
      { href: '/tools/remove-bg', anchor: 'Free background remover' },
      { href: '/tools/make-image-transparent', anchor: 'Make an image transparent' },
    ],
  },
  {
    match: slug => /adobe|photoshop/.test(slug),
    links: [
      {
        href: '/alternatives/vs-adobe-express',
        anchor: 'Adobe Express image upscaler alternative',
      },
    ],
  },
  {
    match: slug => slug === 'image-upscaler-8x',
    links: [{ href: '/tools/ai-image-upscaler', anchor: '8x AI image upscaler tool' }],
  },
  {
    match: slug => /upscal|resolution|enlarg/.test(slug),
    links: [{ href: '/', anchor: 'AI image upscaler' }],
  },
];

const MAX_LINKS = 2;

export function getBlogContextualToolLinks(slug: string): IBlogToolLink[] {
  if (EXCLUDED_SLUGS.has(slug)) return [];

  const rule = BLOG_TOOL_LINK_RULES.find(candidate => candidate.match(slug));
  return rule ? rule.links.slice(0, MAX_LINKS).map(link => ({ ...link })) : [];
}
