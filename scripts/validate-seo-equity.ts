#!/usr/bin/env tsx

import { getAllPublishedSlugsStrict } from '@server/services/blog.service';
import { BLOCKED_BLOG_SLUGS } from '@shared/constants/blocked-blog-slugs';
import { getSeoEquitySnapshot, validateSeoEquityPromotedUrls } from '@lib/seo/seo-equity';
import { reconcileHistoricalBaselineSlugs } from './seo/blog-indexation-report';

async function main(): Promise<void> {
  const snapshot = getSeoEquitySnapshot();
  const snapshotBlogSlugs = snapshot.entities
    .filter(entity => entity.type === 'blog')
    .map(entity => entity.url.replace(/^\/blog\//, ''));
  const blogSlugs = [...new Set([...snapshotBlogSlugs, ...(await getAllPublishedSlugsStrict())])].filter(
    slug => !BLOCKED_BLOG_SLUGS.has(slug)
  );
  const historicalBaseline = reconcileHistoricalBaselineSlugs(blogSlugs);
  const routes = [
    ...snapshot.entities.filter(entity => entity.type !== 'blog').map(entity => entity.url),
    ...Object.keys(snapshot.surfaces.pseoRelatedBlogPosts),
    ...Object.keys(snapshot.surfaces.hubSpokeLinks),
  ];
  const issues = validateSeoEquityPromotedUrls(snapshot, { blogSlugs, routes });

  if (issues.length > 0) {
    console.error('SEO equity validation failed:');
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `SEO equity validation passed (${blogSlugs.length} published blog posts checked; ${historicalBaseline.notCurrentlyPublishedUrls.length} historical baseline URLs explicitly reconciled as not currently published: ${historicalBaseline.notCurrentlyPublishedUrls.join(', ')}).`
  );
}

main().catch(error => {
  console.error(
    `SEO equity validation failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
