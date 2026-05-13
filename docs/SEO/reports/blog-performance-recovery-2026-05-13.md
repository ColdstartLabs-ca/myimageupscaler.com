# Blog Quality Monitor - 2026-05-13

Data:

- GSC source: Search Console API, `sc-domain:myimageupscaler.com`
- Freshness: latest complete date is 2026-05-10; GSC data after that is still incomplete
- Default monitor comparison: 2026-04-13 to 2026-04-26 vs 2026-04-27 to 2026-05-10
- Blog filter: URL paths matching `/blog/`
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, `docs/SEO/reports/blog-performance-recovery-2026-05-12.md`, `docs/SEO/reports/blog-opportunities-publisher-2026-05-12.md`, `docs/SEO/reports/traffic-growth-plan-2026-05-12.md`

## Blog URLs Losing Visibility

| URL                                                      |                                             GSC change | Recent change correlation                                                                       | Likely cause                                                                     | Action                                                                                         |
| -------------------------------------------------------- | -----------------------------------------------------: | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Impr. 12,991 -> 7,604; clicks 4 -> 10; pos. 8.0 -> 7.7 | Refreshed on 2026-05-06 and 2026-05-12; current GSC window still cannot evaluate May 12 changes | Impression loss with stable/improved rank; CTR improved but remains low at 0.13% | Do not rewrite again before post-refresh data lands; deploy/revalidate and request indexing    |
| `/blog/best-ai-image-quality-enhancer-free`              |    Impr. 3,620 -> 873; clicks 3 -> 2; pos. 9.4 -> 10.8 | Refreshed on 2026-05-06 for sharpener/unblur intent                                             | Position slipped and query demand contracted                                     | Recheck after indexing; add sharpener/unblur comparison module only if next run still declines |
| `/blog/photo-enhancement-upscaling-vs-quality`           |     Impr. 2,044 -> 898; clicks 0 -> 0; pos. 7.0 -> 6.5 | April consolidation intended this URL to stop competing with the explainer                      | Residual index/query overlap; rank is stable/improved but zero-click             | Verify production redirect/canonical behavior and internal links to the primary explainer      |
| `/blog/free-ai-upscaler-no-watermark`                    |     Impr. 1,389 -> 618; clicks 1 -> 4; pos. 6.7 -> 9.9 | Refreshed on 2026-05-06; overlaps canonical best-free page on no-watermark/no-signup variants   | Position loss plus cannibalization                                               | Keep as supporting intent; link clearly to canonical best-free comparison                      |
| `/blog/best-image-upscaling-tools-2026`                  |                          Impr. 459 -> 0; clicks 0 -> 0 | Listed as unpublished/redirected in April consolidation                                         | Expected consolidation drop                                                      | No recovery action; confirm 301 remains live                                                   |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       |     Impr. 1,365 -> 915; clicks 0 -> 0; pos. 4.5 -> 4.6 | Refreshed on 2026-05-06 with answer block, table, FAQ, and tool links                           | Strong ranking with zero clicks; SERP/snippet issue                              | Request indexing and recheck CTR after refreshed snippet settles                               |
| `/blog/upscale-image-online-free`                        |        Impr. 440 -> 52; clicks 0 -> 0; pos. 6.2 -> 6.7 | No recent direct edit found; overlaps best-free/no-signup cluster                               | Cannibalization and unclear ownership                                            | Retarget/support canonical best-free page rather than treating as recovery target              |

## Changes Correlated

- 2026-04-06: duplicate/cannibalizing blog posts were unpublished and redirected. Drops for `/blog/best-image-upscaling-tools-2026` remain expected.
- 2026-05-06: Batch 1 Three Kings refresh touched the top affected pages and created the current GSC indexing backlog.
- 2026-05-12: `16x-upscaling-does-it-work` was published, and `/blog/best-free-ai-image-upscaler-2026-tested-compared` received another content refresh. GSC through 2026-05-10 cannot evaluate those changes yet.
- The current monitor broadly confirms the 2026-05-12 performance report: biggest losses are in the best-free-upscaler, sharpener/enhancer, no-watermark, and upscaling-vs-sharpening clusters.

## Cannibalization Still Visible

Current-window query overlap:

- `what is the difference between ai upscaling and sharpening`: `/blog/ai-image-upscaling-vs-sharpening-explained` has 270 impressions at position 5.5; `/blog/photo-enhancement-upscaling-vs-quality` still has 26 impressions at position 9.8.
- `ai image upscaling vs sharpening explained`: primary explainer has 82 impressions at position 2.6; the photo-enhancement page still has 64 impressions at position 8.3.
- `best free ai image upscaler no watermark 2026`: canonical comparison has 66 impressions at position 8.0; `/blog/free-ai-upscaler-no-watermark` has 23 impressions at position 6.8.
- `best free ai image upscaler tools 2026`: canonical comparison has 52 impressions at position 11.6; `/blog/best-free-ai-image-upscaler-tools-2026` still has 16 impressions at position 8.7.

## Edit Briefs

## Edit Brief: `/blog/best-free-ai-image-upscaler-2026-tested-compared`

Evidence:

- GSC: 12,991 -> 7,604 impressions, clicks 4 -> 10, position 8.0 -> 7.7.
- Recent change correlation: refreshed 2026-05-06 and 2026-05-12; May 12 refresh is not yet measurable in complete GSC data.

Target query:

- `best free ai image upscaler 2026`

Update:

- SEO title: keep current May 12 title until post-refresh data lands.
- Meta description: keep current no-signup/no-watermark/4K/8K framing.
- H1/title: keep canonical 2026 best-free-upscaler framing.
- First paragraph: no further change recommended before next GSC read.
- Internal links: verify exact-anchor links from `/free`, `/tools/ai-image-upscaler`, `/blog/free-ai-upscaler-no-watermark`, and remaining support posts.
- Content additions: none before indexing/recheck; avoid churn.

## Edit Brief: `/blog/best-ai-image-quality-enhancer-free`

Evidence:

- GSC: 3,620 -> 873 impressions, clicks 3 -> 2, position 9.4 -> 10.8.
- Recent change correlation: refreshed on 2026-05-06 for sharpener intent.

Target query:

- `best free ai image sharpener online 2026`

Update:

- SEO title: keep sharpener-first framing unless production still shows stale metadata.
- Meta description: should include sharpener, unblur, blurry photos, soft detail, noise, online/free, and a CTA.
- H1/title: keep sharpener-first framing.
- First paragraph: verify it names blurry photos, soft detail, noise, and image quality enhancement.
- Internal links: add/verify links from sharpening, blurry-photo, and enhancer posts.
- Content additions: if the next run still declines, add a small comparison table for sharpening/unblur/noise tools.

## Edit Brief: `/blog/ai-image-upscaling-vs-sharpening-explained`

Evidence:

- GSC: 1,365 -> 915 impressions, position 4.5 -> 4.6, still zero clicks.
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

- No Supabase blog content edits were applied during this monitor run.
- No blog-edit handoff was invoked because the affected pages were refreshed recently and the latest GSC data cannot evaluate those changes yet.
- This report was saved for correlation with the next monitoring run.

## Open Actions

1. Deploy/revalidate the recent blog API and SEO changes if not already live.
2. Manually request indexing for the URLs already listed in `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, especially the five Priority 1 blog URLs and the May 12 blog/API updates.
3. Verify production redirects for deprecated/cannibalizing pages: `/blog/photo-enhancement-upscaling-vs-quality`, `/blog/best-image-upscaling-tools-2026`, and `/blog/best-free-ai-image-upscaler-tools-2026`.
4. Re-run this monitor after 2026-05-16 to 2026-05-19, when GSC can reflect the May 12 changes.

## Next Run

Recommended next check: 2026-05-19.

Watch specifically:

- Whether `/blog/best-free-ai-image-upscaler-2026-tested-compared` recovers impressions and raises CTR above 0.5%.
- Whether `/blog/best-ai-image-quality-enhancer-free` regains sharpener/unblur impressions after indexing.
- Whether retired/cannibalizing support pages keep receiving impressions after redirects and indexing requests.
