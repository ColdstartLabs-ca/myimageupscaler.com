import seoEquitySnapshotRaw from '@/content/seo-equity.json';
import type { ISeoEquitySnapshot } from './seo-equity.schema';

const BLOG_PATH_PREFIX = '/blog/';

function toBlogSlug(url: string): string {
  return url.startsWith(BLOG_PATH_PREFIX)
    ? url.slice(BLOG_PATH_PREFIX.length)
    : url.replace(/^\//, '');
}

function toBlogUrl(slugOrUrl: string): string {
  return slugOrUrl.startsWith('/') ? slugOrUrl : `${BLOG_PATH_PREFIX}${slugOrUrl}`;
}

const defaultSeoEquitySnapshot = seoEquitySnapshotRaw as ISeoEquitySnapshot;

export function getSeoEquitySnapshot(): ISeoEquitySnapshot {
  return defaultSeoEquitySnapshot;
}

export function getHomepageBlogPicks(
  snapshot: ISeoEquitySnapshot = getSeoEquitySnapshot(),
  max = snapshot.surfaces.homepageBlogPicks.length
): string[] {
  return snapshot.surfaces.homepageBlogPicks.slice(0, max).map(toBlogSlug);
}

export function getBlogIndexFeatured(
  snapshot: ISeoEquitySnapshot = getSeoEquitySnapshot(),
  max = snapshot.surfaces.blogIndexFeatured.length
): string[] {
  return snapshot.surfaces.blogIndexFeatured.slice(0, max).map(toBlogSlug);
}

export function getBlogStartHere(
  snapshot: ISeoEquitySnapshot = getSeoEquitySnapshot(),
  max = snapshot.surfaces.blogStartHere.length
): ISeoEquitySnapshot['surfaces']['blogStartHere'] {
  return snapshot.surfaces.blogStartHere.slice(0, max);
}

export function getRelatedPostsForSlug(
  slug: string,
  snapshot: ISeoEquitySnapshot = getSeoEquitySnapshot(),
  max = 3
): string[] {
  const currentUrl = toBlogUrl(slug);
  const relatedUrls = snapshot.surfaces.blogFooterRelated[currentUrl] ?? [];
  return relatedUrls
    .filter(url => url !== currentUrl)
    .slice(0, max)
    .map(toBlogSlug);
}

export function getPseoRelatedBlogPosts(
  path: string,
  snapshot: ISeoEquitySnapshot = getSeoEquitySnapshot(),
  max = 3
): string[] {
  return (snapshot.surfaces.pseoRelatedBlogPosts[path] ?? []).slice(0, max).map(toBlogSlug);
}

export interface ISeoEquityInventory {
  blogSlugs: string[];
  routes: string[];
}

/**
 * Count inbound links from the configured promotion surfaces.
 *
 * A source is counted once per target even if the target appears in two
 * selectors rendered by that same page. This measures inbound pages, not raw
 * anchor occurrences.
 */
export function getSeoEquityInboundLinkCounts(
  snapshot: ISeoEquitySnapshot,
  inventory: Pick<ISeoEquityInventory, 'blogSlugs'>,
  renderedInboundCounts: Record<string, number> | Map<string, number> = {}
): Map<string, number> {
  const validBlogUrls = new Set(inventory.blogSlugs.map(toBlogUrl));
  const counts = new Map<string, number>();
  const countedLinks = new Set<string>();

  for (const slug of inventory.blogSlugs) counts.set(`/blog/${slug}`, 0);

  const addInbound = (source: string, target: string): void => {
    const targetUrl = toBlogUrl(target);
    if (!validBlogUrls.has(targetUrl) || source === targetUrl) return;

    const key = `${source}->${targetUrl}`;
    if (countedLinks.has(key)) return;
    countedLinks.add(key);

    const targetSlug = toBlogSlug(targetUrl);
    counts.set(`/blog/${targetSlug}`, (counts.get(`/blog/${targetSlug}`) ?? 0) + 1);
  };

  for (const url of snapshot.surfaces.homepageBlogPicks) addInbound('/', url);
  for (const url of snapshot.surfaces.blogIndexFeatured) addInbound('/blog', url);
  for (const item of snapshot.surfaces.blogStartHere) addInbound('/blog', item.href);
  for (const [source, urls] of Object.entries(snapshot.surfaces.blogFooterRelated)) {
    for (const url of urls) addInbound(source, url);
  }
  // pseoRelatedBlogPosts and hubSpokeLinks are snapshot/configuration surfaces
  // without a live renderer today. They must not satisfy the hard inbound-link
  // contract until a rendered consumer supplies counts through the optional
  // `renderedInboundCounts` argument.

  const renderedEntries =
    renderedInboundCounts instanceof Map
      ? renderedInboundCounts.entries()
      : Object.entries(renderedInboundCounts);
  for (const [slugOrUrl, count] of renderedEntries) {
    const slug = toBlogSlug(slugOrUrl);
    if (!validBlogUrls.has(toBlogUrl(slug))) continue;
    counts.set(`/blog/${slug}`, (counts.get(`/blog/${slug}`) ?? 0) + Math.max(0, count));
  }

  return counts;
}

export function validateSeoEquityPromotedUrls(
  snapshot: ISeoEquitySnapshot,
  inventory: ISeoEquityInventory
): string[] {
  const validBlogUrls = new Set(inventory.blogSlugs.map(toBlogUrl));
  const validRoutes = new Set(inventory.routes);
  const promotedUrls = new Set<string>();

  for (const url of snapshot.surfaces.homepageBlogPicks) promotedUrls.add(url);
  for (const url of snapshot.surfaces.blogIndexFeatured) promotedUrls.add(url);
  for (const item of snapshot.surfaces.blogStartHere) promotedUrls.add(item.href);
  for (const [source, urls] of Object.entries(snapshot.surfaces.blogFooterRelated)) {
    promotedUrls.add(source);
    for (const url of urls) promotedUrls.add(url);
  }
  for (const [source, urls] of Object.entries(snapshot.surfaces.pseoRelatedBlogPosts)) {
    promotedUrls.add(source);
    for (const url of urls) promotedUrls.add(url);
  }
  for (const [source, urls] of Object.entries(snapshot.surfaces.hubSpokeLinks)) {
    promotedUrls.add(source);
    for (const url of urls) promotedUrls.add(url);
  }

  const invalidPromotedUrls = Array.from(promotedUrls)
    .filter(url =>
      url.startsWith(BLOG_PATH_PREFIX) ? !validBlogUrls.has(url) : !validRoutes.has(url)
    )
    .sort();

  const inboundLinkCounts = getSeoEquityInboundLinkCounts(snapshot, inventory);
  const underlinkedBlogUrls = inventory.blogSlugs
    .map(slug => `/blog/${slug}`)
    .filter(url => (inboundLinkCounts.get(url) ?? 0) < 2)
    .map(url => `${url} has ${inboundLinkCounts.get(url) ?? 0} inbound internal links (minimum 2)`)
    .sort();

  return [...invalidPromotedUrls, ...underlinkedBlogUrls].sort();
}
