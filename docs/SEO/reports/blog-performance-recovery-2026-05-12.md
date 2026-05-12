# Blog Quality Monitor - 2026-05-12

Data:

- GSC source: Search Console API, `sc-domain:myimageupscaler.com`
- Freshness: latest complete date is 2026-05-09; GSC data after that is still incomplete
- Default monitor comparison: 2026-04-12 to 2026-04-25 vs 2026-04-26 to 2026-05-09
- Blog filter: URL paths matching `/blog/`, excluding paginated blog archive URLs
- Rows pulled: 10,110 date/page/query rows, plus 3,268 aggregate query/page rows
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, `docs/SEO/reports/seo-next-steps-2026-05-05.md`, `docs/SEO/reports/traffic-growth-plan-2026-05-12.md`, recent git history

## Blog URLs Losing Visibility

| URL                                                      |                                           GSC change | Recent change correlation                                                                                                | Likely cause                                                                                          | Action                                                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Impr. 7,560 -> 4,048; clicks 1 -> 1; pos. 8.3 -> 7.7 | Refreshed on 2026-05-06 and again on 2026-05-12; current GSC window ends before the May 12 refresh can be measured       | Impression volatility on the biggest 2026 listicle query, not a ranking collapse; CTR still near zero | Do not rewrite again today. Deploy/revalidate, request indexing, then recheck after 2026-05-16                                 |
| `/blog/best-ai-image-quality-enhancer-free`              |  Impr. 1,369 -> 607; clicks 2 -> 0; pos. 9.9 -> 11.0 | Refreshed on 2026-05-06; May 12 growth plan still flags sharpener/unblur alignment                                       | Position worsened slightly and impressions fell across sharpener/unblur variants                      | Keep sharpener/unblur targeting; verify title/meta after deploy and request indexing                                           |
| `/blog/free-ai-upscaler-no-watermark`                    |    Impr. 775 -> 159; clicks 0 -> 0; pos. 6.7 -> 10.6 | Refreshed on 2026-05-06; currently overlaps with canonical best-free page on no-watermark/no-signup variants             | Cannibalization plus position loss                                                                    | Keep as supporting no-watermark/no-signup intent; add/verify canonical internal links to main 2026 comparison                  |
| `/blog/photo-enhancement-upscaling-vs-quality`           |     Impr. 611 -> 342; clicks 0 -> 0; pos. 9.6 -> 8.9 | Unpublished/redirect decision on 2026-04-06 was intended to reduce overlap, but GSC still shows impressions for this URL | Residual index/query overlap with the upscaling-vs-sharpening page                                    | Verify production redirect/canonical behavior; primary target should remain `/blog/ai-image-upscaling-vs-sharpening-explained` |
| `/blog/best-image-upscaling-tools-2026`                  |                        Impr. 204 -> 0; clicks 0 -> 0 | Listed as unpublished and redirected to canonical on 2026-04-06                                                          | Expected drop from consolidation                                                                      | No recovery action; confirm 301 remains live                                                                                   |
| `/blog/mejorar-calidad-imagen-ia-gratis`                 |    Impr. 166 -> 7; clicks 11 -> 0; pos. 68.4 -> 69.0 | No matching recent blog-edit entry found                                                                                 | Low-position Spanish traffic collapsed; likely unstable long-tail traffic                             | Monitor only unless Spanish blog becomes a priority                                                                            |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       |     Impr. 758 -> 630; clicks 0 -> 0; pos. 3.5 -> 4.2 | Refreshed on 2026-05-06 with answer block, table, FAQ, and tool links                                                    | Still ranks well but earns no clicks; SERP/snippet issue more than ranking issue                      | Request indexing; recheck CTR after the refreshed snippet has time to settle                                                   |
| `/blog/upscale-image-online-free`                        |      Impr. 136 -> 14; clicks 0 -> 0; pos. 6.2 -> 9.2 | No recent direct edit found; overlaps best-free/no-signup cluster                                                        | Cannibalization and weak ownership of online/free/no-signup modifiers                                 | Retarget or link strongly to canonical best-free comparison                                                                    |

## Top Lost Queries

| URL                                                      | Query                                                          | Impressions |     Position | Classification                             |
| -------------------------------------------------------- | -------------------------------------------------------------- | ----------: | -----------: | ------------------------------------------ |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | `best free ai image upscaler 2026`                             | 3,360 -> 70 |   8.2 -> 7.9 | Impressions down, position stable/improved |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | `best ai image upscaler online free 2026`                      |   417 -> 23 |  8.6 -> 12.3 | Impressions down, position worse           |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | `best free ai image upscaler tools 2026`                       |   247 -> 55 | 10.2 -> 11.7 | Impressions down, position slightly worse  |
| `/blog/free-ai-upscaler-no-watermark`                    | `best free ai image upscaler 2026 no watermark`                |    79 -> 17 |   5.7 -> 6.0 | Impressions down, position stable          |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       | `ai image upscaling vs sharpening explained`                   |   154 -> 96 |   1.9 -> 2.6 | Strong rank, zero-click SERP               |
| `/blog/best-ai-image-quality-enhancer-free`              | `best free online ai image enhancer unblur sharpen photo 2026` |     54 -> 0 |   8.3 -> n/a | Query disappeared from current window      |

## Changes Correlated

- 2026-04-06: duplicate/cannibalizing blog posts were unpublished and redirected. Drops for `/blog/best-image-upscaling-tools-2026` are expected, not a recovery target.
- 2026-04-23 to 2026-04-27: CTR, metadata, and content-gap fixes targeted the same best-free-upscaler cluster.
- 2026-05-06: Batch 1 Three Kings refresh touched the top affected pages and created the current GSC indexing backlog.
- 2026-05-12: the traffic growth plan and blog changelog show another refresh of `/blog/best-free-ai-image-upscaler-2026-tested-compared`, but the GSC data in this run ends on 2026-05-09, so that refresh cannot be evaluated yet.
- Current local git diff includes blog API cache revalidation changes for PATCH/publish paths, which should help metadata edits show on generated blog pages after deploy.

## Cannibalization Still Visible

Current-window query overlap:

- `ai image upscaling vs sharpening explained`: `/blog/ai-image-upscaling-vs-sharpening-explained` has 96 impressions at position 2.6, while `/blog/photo-enhancement-upscaling-vs-quality` still has 80 impressions at position 8.3.
- `what is the difference between ai upscaling and sharpening`: primary page has 267 impressions at position 5.5, while the photo-enhancement page still has 30 impressions at position 9.8.
- `best free ai image upscaler no watermark 2026`: canonical comparison has 65 impressions at position 8.0, while `/blog/free-ai-upscaler-no-watermark` has 18 impressions at position 7.0.
- `best free ai image upscaler tools 2026`: canonical comparison has 55 impressions at position 11.7, while `/blog/best-free-ai-image-upscaler-tools-2026` still has 18 impressions at position 8.8.

## Edit Briefs

## Edit Brief: `/blog/best-free-ai-image-upscaler-2026-tested-compared`

Evidence:

- GSC: 7,560 -> 4,048 impressions, but average position improved from 8.3 to 7.7.
- Recent change correlation: refreshed 2026-05-06 and 2026-05-12; May 12 content is not yet in complete GSC data.

Target query:

- `best free ai image upscaler 2026`

Update:

- SEO title: keep current May 12 title until post-refresh data lands.
- Meta description: keep current May 12 no-signup/no-watermark/4K/8K framing.
- H1/title: keep canonical 2026 best-free-upscaler framing.
- First paragraph: no further same-day change recommended.
- Internal links: verify exact-anchor links from `/free`, `/tools/ai-image-upscaler`, `/blog/free-ai-upscaler-no-watermark`, and any remaining comparison/listicle support posts.
- Content additions: none before the next GSC read; avoid churn.

## Edit Brief: `/blog/best-ai-image-quality-enhancer-free`

Evidence:

- GSC: 1,369 -> 607 impressions, clicks 2 -> 0, position 9.9 -> 11.0.
- Recent change correlation: refreshed on 2026-05-06 for sharpener intent.

Target query:

- `best free ai image sharpener online 2026`

Update:

- SEO title: keep `Best Free AI Image Sharpener Online 2026: Tested` unless production still shows stale metadata.
- Meta description: should include sharpener, unblur, blurry photos, soft detail, noise, and online/free.
- H1/title: keep sharpener-first framing.
- First paragraph: verify it names blurry photos, soft detail, noise, and image quality enhancement.
- Internal links: add/verify links from sharpening, blurry-photo, and enhancer posts.
- Content additions: if rankings do not recover by the next run, add a small comparison table for sharpening/unblur/noise tools.

## Edit Brief: `/blog/ai-image-upscaling-vs-sharpening-explained`

Evidence:

- GSC: 758 -> 630 impressions, position 3.5 -> 4.2, still zero clicks.
- Recent change correlation: refreshed on 2026-05-06 with answer block, table, FAQ, and tool links.

Target query:

- `ai image upscaling vs sharpening explained`

Update:

- SEO title: keep exact explainer framing.
- Meta description: keep practical decision-guide framing.
- H1/title: keep `AI Upscaling vs Sharpening Explained`.
- First paragraph: no change before reindexing.
- Internal links: verify `/blog/photo-enhancement-upscaling-vs-quality` points to this page as the primary explainer.
- Content additions: none until refreshed snippet has been crawled.

## Fixes Applied

- No new Supabase blog content changes were applied during this monitor run. The biggest affected page was already edited earlier on 2026-05-12, and the complete GSC window ends on 2026-05-09.
- Report updated with the fresh default monitor window and current action handoff.
- Existing local code changes already add blog page revalidation on blog PATCH/publish paths; deploy those before judging whether metadata/content edits are visible to Google.

## Open Actions

1. Deploy the blog API revalidation patch.
2. Request indexing for the URLs already listed in `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, especially the five Priority 1 blog URLs.
3. Verify production redirects for deprecated/cannibalizing pages, especially `/blog/photo-enhancement-upscaling-vs-quality`, `/blog/best-image-upscaling-tools-2026`, and `/blog/best-free-ai-image-upscaler-tools-2026`.
4. Re-run this monitor on 2026-05-16 or 2026-05-19, when GSC has post-May-12 crawl data.

## Next Run

Next recommended check: 2026-05-16 to 2026-05-19.

Watch specifically:

- Whether `/blog/best-free-ai-image-upscaler-2026-tested-compared` recovers impressions for `best free ai image upscaler 2026`.
- Whether CTR moves above 0.5% for the top five refreshed posts.
- Whether retired/cannibalizing support pages keep receiving impressions after redirects and indexing requests.
