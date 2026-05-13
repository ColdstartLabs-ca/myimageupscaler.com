# SEO Growth Skills Report - myimageupscaler.com - 2026-05-13

Source skills commit: `308f2ac21eb0972d1f1332efe12554ee319ca3c7`

Purpose: apply the project SEO growth skills added in the commit to current GSC, GA4, blog CTR, cannibalization, CTA, pSEO, and attribution data, then turn the findings into one prioritized execution report.

## Data Used

| Source | File | Period | Notes |
| ------ | ---- | ------ | ----- |
| Google Search Console | `/tmp/gsc-miu-report.json` | 2026-04-13 to 2026-05-10 | 28-day pull, Pacific time. GSC normally lags 2-3 days. |
| GA4 | `/tmp/ga-miu-report.json` | 2026-04-15 to 2026-05-12 | Organic Search plus source/medium and landing page data. |
| SEO synthesis | `/tmp/seo-plan-miu-report.json` | matched GSC/GA windows | 298 joined URLs, 82 with both GSC and GA data. |
| Blog CTR audit | `/tmp/blog-audit-miu-report.json` | GSC-backed | 137 published posts, 122 posts with GSC page data. |
| pSEO inventory | `/tmp/pseo-inventory-miu-report.json` | code inventory | 358 programmatic SEO URLs from `app/seo/data/*.json`. |

## Executive Finding

The biggest bottleneck is not visibility. GSC impressions rose 9.26% while clicks fell 16.81%, which points to CTR, query/page overlap, and snippet quality. GA4 also shows 2,698 Organic Search sessions with 72.91% engagement and zero Organic conversions while total-site conversions exist, so attribution repair must happen before judging organic conversion ROI.

## Baseline

| Metric | Value | Note |
| ------ | ----: | ---- |
| GSC clicks | 1,979 | Down 16.81% vs previous period. |
| GSC impressions | 77,805 | Up 9.26% vs previous period. |
| GSC average CTR | 2.54% | Sitewide average hides severe blog CTR leaks. |
| GSC average position | 10.62 | Many pages are in striking distance. |
| GA4 Organic Search sessions | 2,698 | Up 13.79% vs previous period. |
| GA4 Organic Search engagement rate | 72.91% | Traffic quality is not the primary issue. |
| GA4 Organic Search conversions | 0 | Attribution or key-event continuity is suspect. |
| Total GA4 conversions | 29 | All 29 conversions are under `(not set)`. |
| GSC clicks / GA organic sessions | 0.73 | Normal join sanity check. |
| Joined URLs | 298 | 82 URLs have both GSC and GA evidence. |

## Priority Actions

| Priority | Cluster | Evidence | Action | Owner / Skill | Success Metric |
| -------: | ------- | -------- | ------ | ------------- | -------------- |
| 1 | Organic attribution repair | 29 total conversions, 0 Organic conversions, `(not set)` has 29 conversions | Preserve source/session/client attribution through auth, dashboard, upload, checkout, and purchase events | `organic-funnel-attribution-repair-technique` | Organic conversions appear; `(not set)` conversion share falls |
| 2 | Best free image upscaler CTR | `/blog/best-free-ai-image-upscaler-2026-tested-compared` has 20,595 impressions, 14 clicks, 0.07% CTR, avg position 7.9 | Rewrite title/meta/H1/direct answer/FAQ and request indexing | `serp-ctr-snippet-rewrite-technique` | CTR moves toward 1.5% to 2.0% after 14-28 days |
| 3 | Best free upscaler cannibalization | Main query has 3,288 impressions, 0 clicks, 3 URLs competing | Make the tested comparison page canonical; retarget or support weaker pages | `cannibalization-consolidation-technique` | GSC query-page impressions consolidate to one URL |
| 4 | Upscaling vs sharpening zero-click rank | Exact explainer query ranks avg 2.21 with 245 impressions and 0 clicks | Rewrite answer block/snippet and subordinate overlapping page | `serp-ctr-snippet-rewrite-technique`, `cannibalization-consolidation-technique` | Nonzero clicks on exact explainer queries |
| 5 | Intent-matched CTAs | High-engagement landing pages have zero measured conversions | Add page-specific CTAs and telemetry, but interpret results only after attribution repair | `search-intent-cta-mapping-technique`, `seo-money-page-lift-technique` | CTA click, upload start, signup start, checkout start by organic landing page |
| 6 | pSEO quality gates | 358 pSEO pages; many large families have FAQ but zero explicit CTA fields | Fix CTA and unique-content gaps before scaling more pSEO pages | `pseo-page-quality-scoring-technique` | Family-level CTA coverage, indexed URLs, GSC impressions, GA engagement |

## De-Duplication Against Backlog And Git History

Do not execute every recommendation above as a fresh task. Several items have already been partially or fully addressed in recent SEO maintenance work and should be skipped until post-deploy/post-indexing data can evaluate them.

| Report Recommendation | Current Status | Evidence Checked | What To Do Now |
| --------------------- | -------------- | ---------------- | -------------- |
| Rewrite `/blog/best-free-ai-image-upscaler-2026-tested-compared` title/meta/H1/direct answer/FAQ | Skip duplicate content rewrite for now | Backlog 2026-05-12 says the Supabase-backed post was refreshed with first sentence, short-answer block, comparison table, FAQs, canonical sharpening guide link, and metadata. Commit history includes `2b7bef19` SEO fixes and 2026-05-12/2026-05-13 blog maintenance reports. | Request indexing after deploy/content publish cycle, then recheck CTR after 14 and 28 complete GSC days. |
| Rewrite `/blog/ai-image-upscaling-vs-sharpening-explained` answer/snippet/FAQ | Skip duplicate content rewrite for now | Backlog 2026-05-06 says featured-snippet support was added: answer block, comparison table, FAQ, and internal tool links. Unit fixture `tests/unit/seo/seo-next-steps-blog-refresh.unit.spec.ts` confirms refreshed Three Kings copy for this slug. | Request indexing and recheck exact-query CTR after refreshed snippet settles. |
| Rewrite `/blog/best-ai-image-quality-enhancer-free` around sharpener/unblur intent | Skip broad rewrite for now | Backlog 2026-05-06 says this post was part of the Batch 1 Three Kings refresh. Unit fixture confirms title/H1/first sentence target `best free ai image sharpener online 2026`. Blog recovery report says to add a sharpener/unblur comparison module only if the next run still declines. | Recheck after indexing; add a focused comparison module only if decline persists. |
| Consolidate `/blog/best-free-ai-image-upscaler-tools-2026` and `/blog/best-image-upscaling-tools-2026` into the canonical best-free comparison page | Already addressed in code; skip new redirect work | `next.config.js` redirects both URLs to `/blog/best-free-ai-image-upscaler-2026-tested-compared`. `middleware.ts` also redirects `/blog/best-free-ai-image-upscaler-tools-2026`. Tests include cannibalization redirect coverage. | Verify production redirects after deploy and monitor residual GSC impressions caused by lag. |
| Make `/blog/ai-image-upscaling-vs-sharpening-explained` primary over `/blog/photo-enhancement-upscaling-vs-quality` | Already addressed in code; skip new redirect work | `next.config.js` and `middleware.ts` redirect `/blog/photo-enhancement-upscaling-vs-quality` to the explainer. Backlog 2026-05-06 records the consolidation work. | Verify production redirect/canonical behavior and internal links; monitor GSC lag. |
| Repair Organic Search conversion attribution | Partially addressed; not fully closed | Commit `f58228ec` fixed GA4 landing page `(not set)` and forwarded purchase events. Commit `2b7bef19` added first-touch attribution fields and GA4 event mapping. Commit `505e8e0a` repaired revenue funnel telemetry/checkout. Backlog still has an open GA4 Admin key-event confirmation item. | Skip duplicate code mapping unless validation fails. Complete GA4 Admin key-event setup and run one fresh organic journey validation. |
| Add SEO funnel event coverage for upload, signup, checkout, and purchase | Mostly addressed in code; admin/live validation remains | `shared/analytics/types.ts` contains `GA4_EVENT_MAP` and `GA4_CONVERSION_EVENTS`; `tests/unit/analytics/analytics-fixes.unit.spec.ts` asserts coverage for `image_uploaded`, `image_upscale_started`, `upscale_completed`, `signup_started`, `signup_completed`, `checkout_opened`, `checkout_started`, `checkout_completed`, and `purchase_confirmed`. | Confirm these are marked as key events in GA4 Admin and check live/debug events by landing page/source. |
| Add pSEO CTA telemetry | Already present at template level; family data gaps remain | pSEO `HeroSection` and `CTASection` track `pseo_cta_clicked`. Several templates supply fallback CTA text/URLs even when JSON family data has no explicit CTA fields. | Do not add duplicate telemetry. Improve family-level CTA fields only where missing data weakens template fit, especially `platform-format`, `format-scale`, `scale`, and thin families. |

## Remaining Execution Queue After Skips

1. Complete the open GA4 Admin item from `docs/SEO/maintenance/seo-changes-backlog.md`: mark the SEO funnel events as key events, then validate one fresh organic journey through landing page, auth, upload, checkout, and purchase.
2. After the next deploy/content publish cycle, complete `docs/SEO/maintenance/gsc-request-indexing-backlog.md` for the refreshed blog URLs.
3. Verify production redirect/canonical behavior for deprecated cannibalizing URLs, especially `/blog/photo-enhancement-upscaling-vs-quality`, `/blog/best-free-ai-image-upscaler-tools-2026`, and `/blog/best-image-upscaling-tools-2026`.
4. Wait for post-refresh GSC data before making more copy edits to the already-refreshed pages. The next meaningful checks are 14 and 28 complete GSC days after deploy/indexing.
5. Build the pSEO family scorecard/join before changing broad pSEO templates. Only update family CTA fields after the inventory-to-GSC/GA join confirms priority families.

## Execution Status - 2026-05-13

| Queue Item | Status | Evidence |
| ---------- | ------ | -------- |
| GA4 SEO funnel key events | Completed | After GA4 Editor access was granted, `.claude/skills/ga-analysis/scripts/ga4-key-events.cjs --create` created all expected internal SEO funnel key events and the emitted GA4 event names used by `GA4_EVENT_MAP`: `select_content`, `generate_lead`, `sign_up`, `begin_checkout`, `add_payment_info`, and existing `purchase`. GA4 Admin API now reports no missing expected key events. |
| GSC request indexing backlog | Still manual/post-deploy | `docs/SEO/maintenance/gsc-request-indexing-backlog.md` remains the operational queue for refreshed blog URLs. |
| Production redirects for deprecated blog URLs | Verified complete | Production returns `308` redirects for `/blog/photo-enhancement-upscaling-vs-quality` -> `/blog/ai-image-upscaling-vs-sharpening-explained`, `/blog/best-free-ai-image-upscaler-tools-2026` -> `/blog/best-free-ai-image-upscaler-2026-tested-compared`, and `/blog/best-image-upscaling-tools-2026` -> `/blog/best-free-ai-image-upscaler-2026-tested-compared`. |
| Locale sitemap and `/it` GSC association | Verified complete | Production `sitemap-static.xml` includes `/de`, `/es`, `/fr`, `/it`, `/ja`, and `/pt`. GSC URL Inspection for `https://myimageupscaler.com/it` reports `PASS`, `Submitted and indexed`, and sitemap `https://myimageupscaler.com/sitemap.xml`. |
| Post-refresh copy changes | Skipped until data lands | Backlog and git history show the target blog posts were already refreshed. More copy edits should wait for 14 and 28 complete GSC days after deploy/indexing. |
| pSEO family scorecard | Deferred until joined scoring run | Do not change broad pSEO templates before joining inventory to GSC/GA by family; existing template-level CTA telemetry is already present. |

## 7-Day Plan

1. Complete GA4 Admin key-event setup and validate one fresh organic journey before reporting SEO conversion ROI.
2. Request indexing for the refreshed best-free comparison, upscaling-vs-sharpening, sharpener/enhancer, and no-watermark posts after the next deploy/content publish cycle.
3. Confirm production redirects/canonicals for the best-free upscaler and upscaling-vs-sharpening URL clusters; do not create new redirects unless the existing ones fail.
4. Verify funnel event coverage by organic landing page in GA4 DebugView or an exploration; do not add duplicate event names unless validation shows a missing event.
5. Score the top pSEO families by CTA coverage, unique data, GSC, and GA evidence, then pick one family to improve instead of publishing more pages.

## 30-Day Plan

1. Compare post-change CTR and clicks for rewritten pages after at least 14 complete GSC days, then again at 28 days.
2. Expand CTR rewrites only to pages without a recent refresh or pages whose post-refresh data still shows strong impressions and weak rank-band CTR.
3. Build a pSEO family scorecard that joins inventory URLs to GSC and GA evidence by family.
4. Move pages with overlapping intent into explicit primary/support/redirect/noindex roles only where current redirects/canonicals do not already resolve the overlap.
5. Re-run the synthesis weekly and keep tracking repair above content work until Organic Search conversions are measurable.

## Organic Funnel Attribution Repair

Primary symptom: GA4 shows 2,698 Organic Search sessions and 1,967 engaged Organic Search sessions, but zero Organic conversions. Total-site conversions are 29, and source/medium shows all 29 conversions under `(not set)`.

| Source / Medium | Sessions | Engagement Rate | Conversions | Interpretation |
| --------------- | -------: | --------------: | ----------: | -------------- |
| `google / organic` | 1,980 | 77.27% | 0 | Organic traffic is engaged but not receiving conversion credit. |
| `(not set)` | 107 | 0.00% | 29 | Conversion events are losing or missing acquisition context. |
| `(direct) / (none)` | 2,908 | 68.78% | 0 | Direct is large but not where conversions are currently landing. |
| `accounts.google.com / referral` | 682 | 44.72% | 0 | Auth referral volume needs callback/session continuity review. |
| `billing.stripe.com / referral` | 18 | 16.67% | 0 | Payment handoff should still be checked for attribution continuity. |

Repair checklist:

1. Trace one organic session through landing page -> auth callback -> dashboard -> upload -> checkout -> purchase.
2. Verify GA4 client ID, session ID, anonymous ID, authenticated user ID, and original landing page survive signup/login.
3. Confirm server-side purchase events include enough GA4 or warehouse attribution metadata to avoid `(not set)`.
4. Confirm auth and payment domains do not create new conversion referrers.
5. Validate with a fresh test journey and a GA4 exploration segmented by landing page, source/medium, event name, and transaction ID.

## SEO Money Page Lift

These are high-value pages, but the conversion data is attribution-gated. Treat zero conversion rate as a measurement problem until the repair above is done.

| Page | GSC Signal | GA4 Signal | Diagnosis | Recommended Lift |
| ---- | ---------- | ---------- | --------- | ---------------- |
| `/` | 1,631 clicks, 5,918 impressions, avg position 10.39 | 1,198 organic sessions, 79.80% engagement, 0 conversions | Homepage/product landing flow is valuable but attribution is broken | Preserve attribution, track upload/signup by landing page, then test above-fold upload CTA |
| `/dashboard` | 13 clicks, 1,168 impressions, avg position 1.86 | 1,169 organic sessions, 94.87% engagement, 0 conversions | Product/funnel page, not a search content target | Inspect auth/session stitching and dashboard event attribution |
| `/es` | 26 clicks, 400 impressions, avg position 17.86 | 130 organic sessions, 82.31% engagement, 0 conversions | Localized homepage is engaged but unmeasured | Add localized CTA telemetry and preserve source through locale/dashboard redirects |
| `/blog/best-free-ai-photo-enhancer-online` | 1,226 impressions, 21 clicks, avg position 23.54 | 60 sessions, 50% bounce | Has traffic, but ranking work is needed first | Add enhancer-specific CTA after sharpening/no-signup sections |
| `/scale/upscale-16x` | 44 clicks, 452 impressions, avg position 15.02 | 29 sessions, 13.79% bounce | Strong engagement for commercial pSEO page | Add internal links and clarify 16x limits/output CTA |

## SERP CTR Rewrite Briefs

### 1. `/blog/best-free-ai-image-upscaler-2026-tested-compared`

GSC evidence: 20,595 impressions, 14 clicks, 0.07% CTR, avg position 7.9. Main zero-click clusters include `best free ai image upscaler 2026`, `best free image upscaler 2026`, `best free ai image upscaler 2026 no signup`, and `best free ai image upscaler to 8k 2026`.

CTR diagnosis: the page is ranking for the right commercial/comparison intent, but the snippet is not earning clicks. Query modifiers show users care about no signup, no watermark, 4K/8K output, and tested comparisons.

Recommended snippet:

- Title tag: `Best Free Image Upscaler 2026: No Signup Options`
- Meta description: `Compare free AI image upscalers for 2026 by signup, watermark, 4K/8K output, quality, and limits before you upload.`
- H1: `Best Free AI Image Upscaler 2026: Tested for No Signup, No Watermark, and 8K`
- Direct answer block: Add a short top section naming best overall free tool, best no-signup option, best no-watermark option, best 8K option, and the main limitation users should know before uploading.
- FAQ additions: `What is the best free image upscaler in 2026?`, `Which free AI upscaler has no signup?`, `Which free AI upscaler has no watermark?`, `Can a free image upscaler export 8K?`
- Internal links: link from no-watermark, no-signup, best-image-upscaler, tools listicle, and 8K/scale pages using anchors that reinforce the canonical comparison intent.
- Validation: annotate the deploy date, request indexing, and compare page CTR/clicks after 14 and 28 complete GSC days.

### 2. `/blog/ai-image-upscaling-vs-sharpening-explained`

GSC evidence: 2,280 page impressions, 0 clicks, avg position 4.6. Exact query `ai image upscaling vs sharpening explained` has 245 impressions, 0 clicks, avg position 2.21. Broader query `what is the difference between ai upscaling and sharpening` has 464 impressions, 0 clicks, avg position 5.33.

CTR diagnosis: this is a strong-rank, zero-click educational result. The page needs a better direct answer and a clearer snippet promise, not a new article.

Recommended snippet:

- Title tag: `AI Upscaling vs Sharpening: What Is the Difference?`
- Meta description: `Upscaling adds pixels and resolution. Sharpening boosts edge detail. See when to use each and how to choose the right AI tool.`
- H1: `AI Upscaling vs Sharpening: The Practical Difference`
- Direct answer block: Explain in 2-4 sentences that upscaling increases image dimensions, sharpening increases perceived edge clarity, and the right order depends on whether the image is too small, too soft, or both.
- FAQ additions: `Should I upscale or sharpen first?`, `Can sharpening replace upscaling?`, `Does AI upscaling make blurry photos sharp?`
- Internal links: link from `/blog/photo-enhancement-upscaling-vs-quality` to this page with anchor `AI upscaling vs sharpening`.
- Validation: monitor exact query CTR and whether Google keeps the explainer as the winning URL.

### 3. `/blog/best-ai-image-quality-enhancer-free`

GSC evidence: 4,493 impressions, 5 clicks, 0.11% CTR, avg position 9.65. Top queries are sharpener/enhancer/no-signup variants.

Recommended snippet:

- Title tag: `Best Free AI Image Sharpener 2026: Blur Tests`
- Meta description: `Compare free AI sharpeners for blurry photos by detail recovery, noise, no-signup access, and realistic output quality.`
- H1: `Best Free AI Image Sharpener Online 2026`
- CTA: `Sharpen a blurry photo`
- Destination: enhancer/sharpener tool route or upload flow.
- Validation: watch CTR for sharpener and unblur queries.

## Cannibalization Consolidation

| Priority | Query / Cluster | Primary URL | Competing URLs | Decision |
| -------: | --------------- | ----------- | -------------- | -------- |
| 1 | `best free ai image upscaler 2026` | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | `/blog/best-ai-image-quality-enhancer-free`, `/blog/best-image-upscaler` | Primary plus support/retarget. Do not create another best-free article. |
| 2 | `best free image upscaler 2026` | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | `/blog/best-image-upscaling-tools-2026`, `/`, `/blog/best-ai-image-quality-enhancer-free` | Consolidate internal links and avoid homepage/listicle ambiguity. |
| 3 | `best free ai image upscaler tools 2026` | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | `/blog/best-free-ai-image-upscaler-tools-2026`, `/blog/best-image-upscaling-tools-2026` | Redirect, canonicalize, or make old tools pages support the tested comparison page. |
| 4 | `best free ai image upscaler no signup 2026` | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | `/blog/free-ai-upscaler-no-watermark`, `/blog/free-upscaler-no-sign-up` | Keep support pages only if they satisfy distinct no-signup/no-watermark objections. |
| 5 | `what is the difference between ai upscaling and sharpening` | `/blog/ai-image-upscaling-vs-sharpening-explained` | `/blog/photo-enhancement-upscaling-vs-quality` | Make the explainer the primary page and retarget the broader quality page. |

Implementation notes:

1. Pick one primary URL per intent before rewriting titles across multiple pages.
2. Preserve useful sections from weaker pages before redirecting or retargeting.
3. Update internal links and anchors so Google sees the intended primary URL.
4. Monitor GSC query-page distribution after the normal GSC lag, then compare at 14 and 28 days.

## Search Intent CTA Map

| Intent | Page / Cluster | Primary CTA | Offer | Destination | Placement | Telemetry |
| ------ | -------------- | ----------- | ----- | ----------- | --------- | --------- |
| Best free / comparison | Best-free comparison page | `Upload an image free` | Free first test with visible quality comparison | Upload flow | First viewport and after comparison table | CTA click, upload started, upload completed |
| No signup | Best-free and no-signup pages | `Try without signup` | No-account preview or upload only if product supports it | Upload flow | First viewport, comparison row, FAQ | CTA click, upload started, signup started |
| No watermark | No-watermark support page | `Upscale without watermark` | Watermark-free output only if true | Tool or pricing, depending gating | Hero copy and FAQ | CTA click, upload completed, download, pricing click |
| 8K / scale | Best-free page and scale pages | `Check 8K output options` | Resolution and plan-limit clarity | `/scale/upscale-16x`, 8K/scale route, or pricing | Output-size section and comparison table | CTA click, pricing click, upload settings |
| Sharpen / unblur | Sharpener and enhancer posts | `Sharpen a blurry photo` | Blur-specific before/after result | Enhancer/sharpener upload route | After diagnosis and before/after section | CTA click, upload started, model selected |
| Upscaling vs sharpening | Explainer page | `Compare on your image` | Help user choose upscale vs sharpen | Tool-choice section or upload flow | After comparison table | CTA click, tool selected, upload started |
| Pricing / paid value | Homepage, pricing, dashboard | `See plans` or `Start with free credits` | Transparent limits and upgrade reason | Pricing or upload path | Above fold and sticky mobile footer | pricing click, checkout started, purchase |

Risk: do not promise "free", "no signup", "no watermark", "4K", "8K", or downloadable output unless current product behavior supports it.

## pSEO Page Quality Scoring

Inventory found 358 pSEO pages. Several large families have FAQ content but zero explicit CTA fields in the data inventory, which weakens both user routing and measurement.

| Family | Pages | CTA Pages | FAQ Pages | Avg Unique Fields | Preliminary Score | Action |
| ------ | ----: | --------: | --------: | ----------------: | ----------------: | ------ |
| `interactive-tools` | 38 | 38 | 38 | 4.32 | 82 | Keep/scale carefully; strongest template signal. |
| `ai-features` | 12 | 12 | 12 | 4.00 | 80 | Keep; add performance join before scaling. |
| `platform-format` | 43 | 0 | 43 | 3.00 | 58 | Improve; add intent-matched CTAs and stronger family-level routing. |
| `format-scale` | 36 | 0 | 36 | 3.00 | 58 | Improve; add scale/output CTA and internal links to proven scale pages. |
| `scale` | 17 | 0 | 17 | 3.06 | 60 | Improve; high commercial fit but missing CTA fields. |
| `competitor-comparisons` | 22 | 0 | 22 | 1.00 | 42 | Pause scaling; add unique comparison data or consolidate thin variants. |
| `alternatives` | 19 | 19 | 19 | 1.00 | 54 | Improve; CTA exists but unique data is thin. |
| `device-use` | 17 | 0 | 17 | 1.00 | 40 | Pause scaling; add specific device evidence or consider noindex/merge for weak pages. |
| `industry-insights` | 13 | 0 | 13 | 1.00 | 38 | Do not scale until unique value and CTA fit improve. |
| `use-cases` | 12 | 0 | 12 | 1.25 | 42 | Improve or merge by real demand and engagement. |

Next scoring step: join `inventory.url` to GSC and GA by normalized path, then calculate family-level performance percentiles. Until that join exists, the scores above are preliminary and based on inventory quality plus known joined examples.

## Measurement Plan

| Change | Primary Metric | Secondary Metric | Check Date |
| ------ | -------------- | ---------------- | ---------- |
| Attribution repair | Organic Search conversions by source/medium | `(not set)` conversions, transaction/event source continuity | First complete GA4 day after fix, then 7 days |
| Best-free snippet rewrite | GSC page CTR and clicks | Query-page concentration, avg position | 14 and 28 complete GSC days after deploy |
| Upscaling-vs-sharpening rewrite | Exact query CTR and clicks | Winning URL stability | 14 and 28 complete GSC days after deploy |
| Cannibalization link cleanup | Query impressions on primary URL | Competing URL impressions | 14 and 28 complete GSC days after deploy |
| CTA mapping | Organic CTA click -> upload started | signup started, checkout started, purchase | 7 and 28 days after instrumentation is confirmed |
| pSEO family fixes | Family impressions and engaged sessions | CTA click rate, indexed URL count | 28 days after deploy |

## Recommendation

Do the attribution repair and CTR consolidation before producing more content. The site already has enough search exposure to win incremental traffic: the immediate upside is making existing rankings clickable, making Google choose the correct URL, and making Organic Search conversions measurable.
