# SEO Changes Backlog

Purpose: keep a concise operational trail of SEO changes so future audits can connect ranking, indexing, CTR, and attribution movement to actual site changes.

Maintenance rules:

- Add an entry every time SEO-facing code, metadata, content, sitemap, schema, canonical, hreflang, robots, redirects, IndexNow, GSC, GA4 attribution, pSEO data, or blog SEO changes.
- Keep entries short: what changed, why, files/surfaces touched, validation, and follow-up.
- If this file gets large, summarize older detailed entries into a monthly rollup and keep only recent operational detail.
- Link related reports, PRDs, or follow-up backlog files instead of pasting long analysis.

## Open Follow-Ups

- [ ] After next deploy, complete [GSC request indexing backlog](./gsc-request-indexing-backlog.md).
- [x] After next deploy, verify `https://myimageupscaler.com/sitemap-static.xml` includes `/de`, `/es`, `/fr`, `/it`, `/ja`, and `/pt`. Verified 2026-05-13.
- [x] After next deploy, re-inspect `https://myimageupscaler.com/it` in GSC and confirm it now has a referring sitemap. Verified 2026-05-13: URL Inspection reports `Submitted and indexed` with sitemap `https://myimageupscaler.com/sitemap.xml`.
- [x] In GA4 Admin, grant Editor access on property `519826120` to `cloudstartlabs-service-acc@coldstartlabs-auth.iam.gserviceaccount.com`, then run `node ./.claude/skills/ga-analysis/scripts/ga4-key-events.cjs --create` to mark the SEO funnel events and emitted GA4 event names as key events. Completed 2026-05-13.

## 2026-05-25

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-05-25.md](../reports/blog-opportunities-publisher-2026-05-25.md), [blog-performance-recovery-2026-05-25.md](../reports/blog-performance-recovery-2026-05-25.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC query+page data through 2026-05-22 and selected no new publish because the strongest candidates duplicate existing canonical blog clusters or are recent metadata tests still inside GSC lag.
- Ran the blog performance monitor against direct date+page+query GSC data, comparing 2026-04-25–2026-05-08 with 2026-05-09–2026-05-22.
- Confirmed no immediate `blog-edit` handoff was warranted because top actionable pages were updated on 2026-05-24, which is newer than the latest complete GSC date.

Validation:

- GSC exports completed for 90-day opportunity discovery and 31-day blog monitoring.
- Anti-cannibalization gate blocked duplicate publishing for existing best-free-upscaler, upscaling-vs-sharpening, sharpener/enhancer, transparent-background, and photo-restoration intents.
- Production redirect checks confirmed retired blog URLs return `308` to their canonical destinations.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- Re-run after 2026-06-03 for the first measurable read on the 2026-05-24 metadata pass, especially `/blog/best-ai-image-quality-enhancer-free`.
- Recheck the full 2026-05-24 metadata batch after 2026-06-07 for 14-day CTR movement.

## 2026-05-24

### GSC Click Recovery: Blog SERP CTR Metadata Pass

Source: [gsc-click-recovery-2026-05-24.md](../reports/gsc-click-recovery-2026-05-24.md)

Changes:

- Pulled fresh 56-day, 28-day, and 14-day GSC exports plus 56-day GA4 organic data.
- Confirmed the latest 14-day click loss is mainly a blog SERP CTR/ranking problem: clicks -40.89%, impressions -1.35%, CTR -40.08%, average position weaker by 4.42.
- Confirmed GA4/GSC tracking cross-check is sane for the 56-day window: GSC clicks to GA organic sessions ratio 0.85.
- Updated production Supabase blog SEO titles and descriptions for `/blog/best-free-ai-image-upscaler-2026-tested-compared`, `/blog/ai-image-upscaling-vs-sharpening-explained`, `/blog/best-ai-upscaler`, `/blog/free-ai-upscaler-no-watermark`, and `/blog/how-to-upscale-anime-images-with-ai`.
- Kept the pass metadata-only because the backlog shows those pages received recent May body-content refreshes.

Validation:

- Blog API PATCH calls succeeded for all five posts.
- Blog API verification confirmed updated `seo_title`, `seo_description`, and `updated_at` values.
- Public frontend checks returned HTTP 200 for all five changed blog URLs.

Follow-up:

- Request indexing for the five changed URLs in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).
- Re-run CTR tracking after 2026-06-07 when 14 complete GSC days can reflect the new SERP snippets.

## 2026-05-22

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-05-22.md](../reports/blog-opportunities-publisher-2026-05-22.md), [blog-performance-recovery-2026-05-22.md](../reports/blog-performance-recovery-2026-05-22.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC query+page data through 2026-05-19 and selected no new publish because the strongest candidates duplicate existing canonical blog clusters.
- Ran the blog performance monitor against direct date+page+query GSC data, comparing 2026-04-22–2026-05-05 with 2026-05-06–2026-05-19.
- Confirmed no immediate `blog-edit` handoff was warranted because top affected pages were recently refreshed, intentionally redirected/consolidated, or improved clicks/rank despite lower impressions.

Validation:

- GSC exports completed for 90-day opportunity discovery and 28-day blog monitoring.
- Anti-cannibalization gate blocked duplicate publishing for existing best-free-upscaler, upscaling-vs-sharpening, sharpener/enhancer, photo-restoration, background-removal, and AI-upscaling-explainer intents.
- Production redirect checks confirmed retired blog URLs return `308` to their canonical destinations.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- Re-run after 2026-05-26 when more post-refresh GSC data is available, especially for `/blog/best-ai-image-quality-enhancer-free`.
- Request indexing for unchecked URLs in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).

## 2026-05-20

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-05-20.md](../reports/blog-opportunities-publisher-2026-05-20.md), [blog-performance-recovery-2026-05-20.md](../reports/blog-performance-recovery-2026-05-20.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC query+page data through 2026-05-17 and selected no new publish because the strongest candidates duplicate existing canonical blog clusters.
- Ran the blog performance monitor against direct date+page+query GSC data, comparing 2026-04-20–2026-05-03 with 2026-05-04–2026-05-17.
- Confirmed no immediate `blog-edit` handoff was warranted because top affected pages were recently refreshed, intentionally redirected/consolidated, or improved clicks/rank despite lower impressions.

Validation:

- GSC exports completed for 90-day opportunity discovery and 28-day blog monitoring.
- Anti-cannibalization gate blocked duplicate publishing for existing best-free-upscaler, upscaling-vs-sharpening, sharpener/enhancer, anime, Photoshop, 8x, and 16x intents.
- Production redirect checks confirmed retired blog URLs return `308` to their canonical destinations.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- Re-run after 2026-05-23 when more post-refresh GSC data is available, especially for `/blog/best-ai-image-quality-enhancer-free`.
- Request indexing for unchecked URLs in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).

## 2026-05-19

### GSC Click Recovery: Blog CTR Links + Sitemap Blocklist Cleanup

Changes:

- Verified the fresh 28-day GSC pull through 2026-05-16: clicks -29.42%, impressions -9.48%, CTR -22.03%, average position weaker by 0.79.
- Updated Supabase blog metadata and CTA destinations for `/blog/best-free-ai-image-upscaler-2026-tested-compared`, `/blog/best-ai-image-quality-enhancer-free`, and `/blog/free-ai-upscaler-no-watermark`.
- Repointed generic homepage CTAs in those posts to the matching tool routes where intent is clearer: `/tools/ai-image-upscaler` and `/tools/ai-photo-enhancer`.
- Verified all stale static blog blocklist URLs return production `200`, then removed those static slugs from `BLOCKED_BLOG_SLUGS` so they can re-enter `sitemap-blog.xml`.
- Kept deliberate cannibalization/redirect slugs blocked from sitemap output.
- Fixed static blog post date fallback in the blog detail page so static JSON posts use `post.date` instead of rendering `Invalid Date`.

Validation:

- Production HEAD checks returned `200` for the previously blocklisted static posts before unblocking.
- Blog API PATCH calls succeeded and revalidated the changed blog URLs.

Follow-up:

- After deploy, verify `sitemap-blog.xml` includes the restored static posts, especially `/blog/how-ai-image-upscaling-works-guide`.
- Request indexing for the three changed Supabase posts and the restored static sitemap URLs if GSC still reports sitemap association gaps.

## 2026-05-18

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-05-18.md](../reports/blog-opportunities-publisher-2026-05-18.md), [blog-performance-recovery-2026-05-18.md](../reports/blog-performance-recovery-2026-05-18.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC data through 2026-05-15 and selected no new publish because candidates were duplicate, recently refreshed, redirected/consolidated, navigational, or better handled by existing page refresh/indexing.
- Ran the blog performance monitor against the default 28-day fetcher comparison for blog URLs.
- Confirmed no immediate `blog-edit` handoff was warranted because top affected pages were recently refreshed, intentionally consolidated, or improved clicks/rank despite lower impressions.

Validation:

- GSC exports completed for 90-day opportunity discovery and 28-day blog monitoring.
- Anti-cannibalization gate blocked duplicate publishing for existing canonical blog intents.
- Redirect checks confirmed retired blog URLs return `308` to their canonical destinations.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- Request indexing for unchecked URLs in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md), then re-run after 2026-05-21 when more post-refresh data is available.

## 2026-05-15

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-05-15.md](../reports/blog-opportunities-publisher-2026-05-15.md), [blog-performance-recovery-2026-05-15.md](../reports/blog-performance-recovery-2026-05-15.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC data through 2026-05-12 and selected no new publish because candidates were duplicate, already published, navigational, or better handled by reindexing/refreshing existing URLs.
- Ran the blog performance monitor against the default 28-day fetcher comparison for blog URLs.
- Confirmed no immediate `blog-edit` handoff was warranted because top affected pages were recently refreshed or intentionally consolidated.

Validation:

- GSC exports completed for 90-day opportunity discovery and 28-day blog monitoring.
- Anti-cannibalization gate blocked duplicate publishing for existing canonical blog intents.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- Request indexing for unchecked URLs in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md), then re-run after 2026-05-19 when more post-refresh data is available.

## 2026-05-14

### Three Kings Blog Metadata Refresh

Source: [3-kings-skill-run-2026-05-14.md](../reports/3-kings-skill-run-2026-05-14.md)

Changes:

- Updated Supabase-backed blog Three Kings metadata and opening copy for `/blog/best-ai-upscaler`, `/blog/topaz-video-upscaler`, and `/blog/how-to-upscale-anime-images-with-ai`.
- Checked the optional P3 `/blog/upscale-image-online-free` and skipped keeping changes because production redirects it to `/blog/free-ai-upscaler-no-watermark`.
- Left the recently refreshed `/blog/best-free-ai-image-upscaler-2026-tested-compared`, `/blog/ai-image-upscaling-vs-sharpening-explained`, and `/blog/best-ai-image-quality-enhancer-free` unchanged per the report's 14-day GSC safeguard.
- Added the three changed URLs to [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).

Validation:

- Blog API GET/PATCH verification confirmed updated titles, descriptions, SEO titles, SEO descriptions, and opening content for all three changed URLs.
- Confirmed `/blog/upscale-image-online-free` returns `308` to `/blog/free-ai-upscaler-no-watermark`, so the optional P3 old-URL update was not retained.

Follow-up:

- Request indexing manually for the three changed URLs after deploy/content cache settles.
- Re-run GSC after 14 complete days before making another Three Kings pass.

## 2026-05-13

### Tool Pages CTR + Internal Linking Cleanup

Source: [tool-pages-seo-analysis-2026-05-13.md](../reports/tool-pages-seo-analysis-2026-05-13.md)

Changes:

- Removed duplicate `MyImageUpscaler` branding from high-value pSEO tool metadata in base and localized tool data.
- Strengthened static AI/background tool `relatedTools` clusters and updated related-page resolution so static `tools.json` relationships are honored before interactive fallback links.
- Improved `/tools` hub discovery with a popular-tools block, clearer category descriptions, descriptive anchors, and mapped interactive tool URLs.
- Documented intentional fallback `/tools/:slug` route policy in the pSEO validator and reduced noisy route warnings.
- Removed the empty `sitemap-images.xml` entry from the sitemap index expectations.

Validation:

- `yarn validate:seo:pseo` passed with 6 unrelated long-title warnings remaining outside the touched tool pages.
- `yarn validate:seo:pseo:verbose` passed and confirmed intentional fallback interactive tool routes.
- `yarn validate:seo:internal-links` passed.
- `yarn validate:seo:schema` passed.
- `yarn test:unit tests/pseo/qa/qa-related-pages-tools.test.ts` passed.
- `yarn verify` passed with existing lint warnings.

Follow-up:

- After deploy, monitor `/tools`, `/tools/ai-image-upscaler`, `/tools/ai-photo-enhancer`, and background-remover tool pages in GSC for CTR and internal-link routing improvements.

### GA4 SEO Funnel Key-Event Admin Check

Source: [seo-growth-skills-report-2026-05-13.md](../reports/seo-growth-skills-report-2026-05-13.md)

Changes:

- Checked GA4 Admin key events for property `519826120` using the configured service account.
- Confirmed the only currently configured key event visible through the API is `purchase`.
- Confirmed the SEO funnel events are not currently marked as GA4 key events: `image_uploaded`, `image_upscale_started`, `upscale_completed`, `signup_started`, `signup_completed`, `checkout_opened`, `checkout_started`, `checkout_completed`, and `purchase_confirmed`.
- Added `.claude/skills/ga-analysis/scripts/ga4-key-events.cjs` so the missing key events can be checked or created from the repo once the service account has GA4 Editor access.
- Updated the checker to cover both internal event names and the GA4 event names actually emitted after `GA4_EVENT_MAP` mapping: `select_content`, `generate_lead`, `sign_up`, `begin_checkout`, `add_payment_info`, and `purchase`.

Validation:

- GA4 Admin API list succeeded with read access for `cloudstartlabs-service-acc@coldstartlabs-auth.iam.gserviceaccount.com`.
- GA4 Admin API create attempts returned `403 PERMISSION_DENIED`, so the service account does not currently have permission to create key events.
- After GA4 Editor access was granted, `node ./.claude/skills/ga-analysis/scripts/ga4-key-events.cjs --create` created all nine internal SEO funnel key events and the five missing emitted GA4 key events successfully. `purchase` was already present.
- Focused analytics test passed: `yarn test:unit tests/unit/analytics/analytics-fixes.unit.spec.ts`.

Follow-up:

- Validate one fresh organic journey through landing page, auth, upload, checkout, and purchase after GA4 has processed new events.

### Production SEO Verification: Redirects + Locale Sitemap

Source: [seo-growth-skills-report-2026-05-13.md](../reports/seo-growth-skills-report-2026-05-13.md)

Changes:

- Verified production redirects for deprecated cannibalizing blog URLs instead of adding duplicate redirect work.
- Verified production `sitemap-static.xml` contains `/de`, `/es`, `/fr`, `/it`, `/ja`, and `/pt`.

Validation:

- `https://myimageupscaler.com/blog/photo-enhancement-upscaling-vs-quality` returns `308` to `/blog/ai-image-upscaling-vs-sharpening-explained`.
- `https://myimageupscaler.com/blog/best-free-ai-image-upscaler-tools-2026` returns `308` to `/blog/best-free-ai-image-upscaler-2026-tested-compared`.
- `https://myimageupscaler.com/blog/best-image-upscaling-tools-2026` returns `308` to `/blog/best-free-ai-image-upscaler-2026-tested-compared`.
- `https://myimageupscaler.com/sitemap-static.xml` includes all six localized homepage URLs.
- GSC URL Inspection for `https://myimageupscaler.com/it` reports `PASS`, `Submitted and indexed`, `INDEXING_ALLOWED`, Google canonical `https://myimageupscaler.com/it`, and sitemap `https://myimageupscaler.com/sitemap.xml`.

Follow-up:

- Complete the request-indexing backlog for recently refreshed blog URLs after the next content/deploy cycle.

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
