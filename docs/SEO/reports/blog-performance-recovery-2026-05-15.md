# Blog Quality Monitor - 2026-05-15

Data:

- GSC source: Search Console API, `sc-domain:myimageupscaler.com`
- Freshness: latest complete date is 2026-05-12; GSC data after that is still incomplete
- Default monitor comparison from fetcher: 2026-04-15 to 2026-05-12 vs 2026-03-18 to 2026-04-14
- Blog filter: URL paths matching `/blog/`
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, `docs/SEO/reports/blog-performance-recovery-2026-05-13.md`, `docs/SEO/reports/blog-opportunities-publisher-2026-05-13.md`, `docs/SEO/reports/3-kings-skill-run-2026-05-14.md`

## Blog URLs Losing Visibility

| URL                                                      |                                                GSC change | Recent change correlation                                                                                          | Likely cause                                                                                   | Action                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Impr. 25,186 -> 19,630; clicks 7 -> 15; pos. 7.36 -> 8.01 | Refreshed 2026-05-06 and 2026-05-12; current GSC only partially reflects May 12                                    | Impression loss with CTR improvement; still near-zero CTR for major best-free-upscaler queries | Do not rewrite again before post-refresh data settles; request indexing and monitor        |
| `/blog/free-ai-upscaler-no-watermark`                    |    Impr. 4,154 -> 1,832; clicks 4 -> 5; pos. 5.44 -> 8.64 | Refreshed 2026-05-06; overlaps canonical best-free/no-signup cluster                                               | Position loss plus supporting/canonical intent overlap                                         | Keep as supporting page; strengthen links to canonical comparison if next run remains weak |
| `/blog/best-image-upscaling-tools-2026`                  |      Impr. 1,917 -> 183; clicks 0 -> 0; pos. 8.13 -> 8.75 | April consolidation unpublished/redirected this duplicate                                                          | Expected consolidation drop                                                                    | No recovery action; keep redirect/canonical cleanup                                        |
| `/blog/best-free-ai-image-upscaler-tools-2026`           |      Impr. 1,352 -> 422; clicks 7 -> 0; pos. 8.61 -> 9.06 | April consolidation intended canonicalization to `best-free-ai-image-upscaler-2026-tested-compared`                | Expected duplicate decay plus residual indexing                                                | No new post; verify retired URL keeps pointing to canonical                                |
| `/blog/upscale-image-online-free`                        |        Impr. 828 -> 362; clicks 3 -> 0; pos. 6.58 -> 6.62 | Production redirects this old intent to `/blog/free-ai-upscaler-no-watermark` per 2026-05-14 report                | Cannibalization/old URL residual impressions                                                   | No edit; allow redirect/indexing to consolidate                                            |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       |    Impr. 2,509 -> 2,140; clicks 0 -> 1; pos. 3.45 -> 4.62 | Refreshed 2026-05-06; still has residual overlap with `photo-enhancement-upscaling-vs-quality`                     | Strong rank but very low CTR; SERP/snippet issue and residual cannibalization                  | Request indexing/recheck before further edits                                              |
| `/blog/how-to-make-png-background-transparent-free`      |       Impr. 381 -> 17; clicks 0 -> 0; pos. 11.15 -> 15.47 | Spanish background-removal post was published 2026-04-25; tool pages and locale variants may be taking this demand | Intent/localization split; old English post lost background-removal visibility                 | Watch one more run; consider refresh only if English transparent-PNG demand remains down   |
| `/blog/upscale-image-for-print-300-dpi-guide`            |    Impr. 3,048 -> 2,697; clicks 4 -> 9; pos. 9.73 -> 7.68 | Refreshed 2026-05-06                                                                                               | Healthy click and rank improvement despite fewer impressions                                   | No edit needed                                                                             |
| `/blog/photo-enhancement-upscaling-vs-quality`           |    Impr. 2,916 -> 2,629; clicks 1 -> 0; pos. 6.94 -> 6.86 | April consolidation intended this URL to stop competing with the explainer                                         | Residual index/query overlap                                                                   | Keep redirect/canonical behavior; do not revive duplicate intent                           |

## Changes Correlated

- 2026-04-06: duplicate/cannibalizing blog posts were unpublished and redirected; drops for old listicle URLs remain expected.
- 2026-05-06: Batch 1 Three Kings refresh touched the top affected pages and created the GSC indexing backlog.
- 2026-05-12: `16x-upscaling-does-it-work` was published and the canonical best-free-upscaler post was refreshed.
- 2026-05-14: Three Kings refresh updated `/blog/best-ai-upscaler`, `/blog/topaz-video-upscaler`, and `/blog/how-to-upscale-anime-images-with-ai`; these URLs appear as current-window visibility winners or new entrants, not recovery targets.

## Cannibalization Still Visible

Current-window query overlap:

- `what is the difference between ai upscaling and sharpening`: primary explainer has 453 impressions at position 5.3; `/blog/photo-enhancement-upscaling-vs-quality` still has 98 impressions at position 9.8.
- `best free ai image upscaler 2026`: canonical comparison has 2,776 impressions at position 8.8; minor residual impressions appear on `/blog/best-ai-image-quality-enhancer-free` and `/blog/best-image-upscaler`.
- `best free image upscaler 2026`: canonical comparison has 599 impressions at position 8.9; minor residual impressions appear on homepage and enhancer page.

## Positive Signals

- `/blog/topaz-video-upscaler`: 0 -> 3,042 impressions after the May 14 work; CTR is still low at 0.03%, so monitor after crawl settles.
- `/blog/best-free-ai-photo-enhancer-online`: 0 -> 1,552 impressions and 23 clicks; this is a strong new blog visibility gain.
- `/blog/how-to-upscale-anime-images-with-ai`: 246 -> 1,634 impressions after refresh, though CTR remains zero.
- `/blog/fix-blurry-photos-ai-methods-guide`: 990 -> 2,282 impressions with stable/improved position.

## Edit Briefs

No immediate `blog-edit` handoff was applied because the top affected pages either were recently refreshed, intentionally consolidated, or improved clicks/rank despite lower impressions.

### Edit Brief: `/blog/free-ai-upscaler-no-watermark`

Evidence:

- GSC: 4,154 -> 1,832 impressions, clicks 4 -> 5, position 5.44 -> 8.64.
- Recent change correlation: refreshed 2026-05-06; overlaps canonical best-free comparison.

Target query:

- `free ai upscaler no watermark`

Update:

- SEO title: keep current no-watermark/no-signup framing until fresh data after indexing.
- Meta description: keep CTA and accurate free-limit language.
- H1/title: no change before next GSC read.
- Internal links: if weakness persists, add/verify contextual link to `/blog/best-free-ai-image-upscaler-2026-tested-compared` as canonical comparison.
- Content additions: none this run.

### Edit Brief: `/blog/ai-image-upscaling-vs-sharpening-explained`

Evidence:

- GSC: 2,509 -> 2,140 impressions, clicks 0 -> 1, position 3.45 -> 4.62.
- Recent change correlation: refreshed 2026-05-06 with answer block, table, FAQ, and tool links.

Target query:

- `ai image upscaling vs sharpening explained`

Update:

- SEO title/meta/H1/first paragraph: keep current exact-intent framing.
- Internal links: continue consolidating links away from `photo-enhancement-upscaling-vs-quality` toward this explainer.
- Content additions: none until refreshed snippet has been crawled.

## Fixes Applied

- No Supabase blog content edits were applied during this monitor run.
- No `blog-edit` handoff was invoked.
- This report was saved for correlation with the next monitoring run.

## Open Actions

1. Manually request indexing for unchecked URLs in `docs/SEO/maintenance/gsc-request-indexing-backlog.md`; the file still lists four pending URLs and notes the May 14 quota stop.
2. Recheck the canonical best-free-upscaler and sharpener clusters after GSC has a fuller post-May-12/post-May-14 window.
3. Keep watching whether retired/cannibalizing URLs continue to receive impressions after redirects and indexing requests.

## Next Run

Recommended next check: 2026-05-19.
