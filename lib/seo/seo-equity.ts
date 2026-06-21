import seoEquitySnapshotRaw from '@/content/seo-equity.json';
import type { ISeoEquitySnapshot } from './seo-equity.schema';

const BLOG_PATH_PREFIX = '/blog/';

function toBlogSlug(url: string): string {
  return url.startsWith(BLOG_PATH_PREFIX) ? url.slice(BLOG_PATH_PREFIX.length) : url.replace(/^\//, '');
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

export function validateSeoEquityPromotedUrls(
  snapshot: ISeoEquitySnapshot,
  inventory: { blogSlugs: string[]; routes: string[] }
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

  return Array.from(promotedUrls)
    .filter(url => (url.startsWith(BLOG_PATH_PREFIX) ? !validBlogUrls.has(url) : !validRoutes.has(url)))
    .sort();
}
