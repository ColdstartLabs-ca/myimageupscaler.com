# SEO Changes Backlog

Purpose: keep a concise operational trail of SEO changes so future audits can connect ranking, indexing, CTR, and attribution movement to actual site changes.

Maintenance rules:

- Add an entry every time SEO-facing code, metadata, content, sitemap, schema, canonical, hreflang, robots, redirects, IndexNow, GSC, GA4 attribution, pSEO data, or blog SEO changes.
- Keep entries short: what changed, why, files/surfaces touched, validation, and follow-up.
- If this file gets large, summarize older detailed entries into a monthly rollup and keep only recent operational detail.
- Link related reports, PRDs, or follow-up backlog files instead of pasting long analysis.

## Open Follow-Ups

- [ ] After next deploy, complete [GSC request indexing backlog](./gsc-request-indexing-backlog.md).
- [ ] After next deploy, verify `https://myimageupscaler.com/sitemap-static.xml` includes `/de`, `/es`, `/fr`, `/it`, `/ja`, and `/pt`.
- [ ] After next deploy, re-inspect `https://myimageupscaler.com/it` in GSC and confirm it now has a referring sitemap.
- [ ] In GA4 Admin, confirm the SEO funnel events are marked as key events: `image_uploaded`, `image_upscale_started`, `upscale_completed`, `signup_started`, `signup_completed`, `checkout_opened`, `checkout_started`, `checkout_completed`, and `purchase_confirmed`.

## 2026-05-13

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-05-13.md](../reports/blog-opportunities-publisher-2026-05-13.md), [blog-performance-recovery-2026-05-13.md](../reports/blog-performance-recovery-2026-05-13.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC data through 2026-05-10 and selected no new publish because candidates either duplicate existing canonical posts or lack enough evidence.
- Ran the blog performance monitor against the default 14-day comparison window for blog URLs.
- Confirmed performance alerts remain concentrated in best-free-upscaler, sharpener/enhancer, no-watermark, and upscaling-vs-sharpening clusters.

Validation:

- GSC exports completed for 90-day opportunity discovery and 14-day blog monitoring.
- Anti-cannibalization gate prevented duplicate publishing for existing canonical blog intents.

Follow-up:

- Request indexing for the existing GSC backlog URLs and re-run after 2026-05-16 to 2026-05-19, when GSC can reflect May 12 blog changes.

## 2026-05-12

### Blog Quality Monitor: Default 14-Day Visibility Check

Source: [blog-performance-recovery-2026-05-12.md](../reports/blog-performance-recovery-2026-05-12.md)

Changes:

- Ran the blog performance monitor against GSC complete data through 2026-05-09.
- Compared 2026-04-12 to 2026-04-25 against 2026-04-26 to 2026-05-09 for blog URLs only.
- Confirmed the largest losses are concentrated in the best-free-upscaler, sharpener/enhancer, no-watermark, and upscaling-vs-sharpening clusters.
- Deferred further same-day content edits because the top affected page was already refreshed on 2026-05-12 and GSC cannot measure that change yet.

Follow-up:

- Deploy the blog API revalidation patch, request indexing for the existing Priority 1 blog URLs, and rerun the monitor after 2026-05-16.

### Traffic Growth Plan: GA4 SEO Funnel Key Events

Source: [traffic-growth-plan-2026-05-12.md](../reports/traffic-growth-plan-2026-05-12.md)

Changes:

- Started Priority 1 from the May 12 traffic growth plan by expanding GA4 event mapping and conversion/key-event candidates for the SEO funnel.
- Centralized browser GA4 event naming on the shared `GA4_EVENT_MAP` so client and server analytics do not drift.
- Covered upload, upscale, signup, checkout, and purchase milestones used to diagnose Organic Search conversion attribution.
- Implemented the Priority 6 sitemap policy decision in the live sitemap structure validator: English-only pSEO sitemaps now require only `en` and `x-default` hreflang entries, while localized sitemaps still require all supported locales.
- Refreshed the Supabase-backed `best-free-ai-image-upscaler-2026-tested-compared` post with May 12 Three Kings/modifier work: first sentence, short-answer block, comparison table, FAQs, canonical sharpening guide link, and metadata.
- Completed the Priority 8 metadata backlog: unpublished `sample-article-title-for-testing` to draft and expanded Supabase SEO descriptions for `ai-upscaler-muryou-osusume`, `old-damaged-photos`, `photo-noise-reduce`, `fixing-pixelated-photos`, `how-to-enlarge-photo-without-losing-quality`, and `free-photo-restoration-app`.

Validation:

- Focused unit test passed: `yarn test:unit tests/unit/analytics/analytics-fixes.unit.spec.ts`.
- Focused unit test passed: `yarn test:unit tests/unit/seo/sitemap-structure-validator.unit.spec.ts`.
- Blog API refetch confirmed updated Supabase content and metadata for `best-free-ai-image-upscaler-2026-tested-compared`.
- Blog API refetch confirmed `sample-article-title-for-testing` is draft and all six refreshed metadata records have SEO descriptions of at least 120 characters.

Follow-up:

- After deploy, confirm the matching events are marked as GA4 key events and verify Organic Search conversions no longer remain at 0 while conversions are reported as `Unassigned`.
- Request indexing for `https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared` after the next deploy or content publish cycle.
- Request indexing after the next deploy/content publish cycle for the six metadata-refreshed published posts.

## 2026-05-06

### SEO Next Steps Execution: Batch 1 CTR Refresh, Attribution, Sitemap

Source: [seo-next-steps-2026-05-05.md](../reports/seo-next-steps-2026-05-05.md)

Changes:

- Refreshed 5 database-backed blog posts with Three Kings updates: title/SEO title, H1, and first paragraph.
- Added featured-snippet support to `ai-image-upscaling-vs-sharpening-explained`: answer block, comparison table, FAQ, and internal tool links.
- Added first-touch attribution fields to client analytics events so high-intent events retain source context after redirects.
- Mapped `upscale_completed` to GA4 `generate_lead`.
- Added non-English locale homepages to `sitemap-static.xml`, including `/it`.
- Created [GSC request indexing backlog](./gsc-request-indexing-backlog.md).

Validation:

- Focused tests passed: `tests/unit/seo/seo-next-steps-blog-refresh.unit.spec.ts`, `tests/unit/seo/homepage-locale-links.unit.spec.ts`, `tests/unit/analytics/analytics-fixes.unit.spec.ts`.
- `yarn verify` passed with existing warnings.
- IndexNow accepted 6 URLs.
- Search Console API sitemap resubmission succeeded with `204`.
- GSC URL Inspection API showed the 5 refreshed blog posts as `Submitted and indexed`.
- GSC URL Inspection API showed `/it` as indexed but with no referring sitemap before deploy.

Follow-up:

- Manually request indexing in GSC after deploy for URLs in [GSC request indexing backlog](./gsc-request-indexing-backlog.md).
- Confirm `/it` gets sitemap association after deploy.

## April 2026 Rollup

### Late April: Analytics + SEO Reporting Foundation

Related commits: `a48521c4`, `69fa5d26`, `ab773797`, `f7009f7e`

Changes:

- Added GA4/Amplitude provider split and analytics multiplexer.
- Added SEO report for 2026-04-25 and content gap report for the high-impression `best-free-ai-image-upscaler-2026-tested-compared` page.
- Updated blog content tracking and blog changelog discipline.
- Added content-gap skill/reporting workflow.

Why it mattered:

- Created a clearer connection between SEO traffic, behavior, and conversion attribution.
- Established evidence for the May 2026 Batch 1 CTR refresh.

### 2026-04-23: pSEO Expansion + Sitemap Coverage + CTR Planning

Related commits: `0522dd3b`, `46e2ea01`, `657401e5`, `41337187`, `5746e0cb`, `37907518`, `81621be0`

Changes:

- Added FormatConverter pSEO pages and tests.
- Added expanded comparison, technical guide, and persona sitemap coverage.
- Added AI Photo Editor hub page and metadata handling.
- Added PRD for SEO CTR quick wins and tools enhancement.
- Consolidated 6 cannibalizing blog URLs with 301 redirects and sitemap exclusions.
- Added GA4 analysis skill for SEO-focused reporting.

Why it mattered:

- Improved sitemap completeness for new pSEO surfaces.
- Reduced duplicate/cannibalizing blog URLs.
- Set up the next CTR improvement workstream.

### Mid April: Blog SERP Validation + 3-Kings Sitemap

Related commits: `9891f9be`, `30242052`, `fe795b60`

Changes:

- Added blog CTR audit report for 2026-04-15.
- Added SERP length validation for blog SEO title/description fields.
- Added 3-Kings sitemap route tests.
- Added hreflang/data-aware SEO tests and cannibalization coverage.

Why it mattered:

- Made SEO metadata changes testable.
- Added infrastructure to keep ranking-opportunity pages discoverable and internally prioritized.

### Early April: Blog Cannibalization + CTR Fixes

Related commits: `8e6bfe8c`, `d4e18873`, `f2d8fc64`

Changes:

- Added blog changelog discipline and wired content skills to it.
- Fixed blog cannibalization with redirects/unpublishing duplicate intent posts.
- Added blog CTR metadata tests, blog sitemap tests, cannibalization redirect tests, and tool metadata tests.

Why it mattered:

- Reduced ranking-signal dilution across overlapping blog posts.
- Established the pattern that SEO changes need regression tests.

## March 2026 Rollup

### Late March: Schema, Referral, and 3-Kings Tracking

Related commits: `7854c880`, `e6380caf`, `5e166033`, `0b08c682`

Changes:

- Added referral classification, robots, and schema generator tests.
- Added 3-Kings refresh report for 2026-03-25.
- Updated schema generator and metadata factory for pricing/copy/regional free-credit changes.

Why it mattered:

- Improved AI/search attribution visibility.
- Created historical baseline for blog CTR and 3-Kings refresh work.
