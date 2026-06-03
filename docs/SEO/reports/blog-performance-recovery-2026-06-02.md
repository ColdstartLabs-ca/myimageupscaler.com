# Blog Quality Monitor - 2026-06-02

Data:

- GSC: direct date/page/query comparison for blog URLs on `myimageupscaler.com`, fetched 2026-06-02. Latest complete date used: 2026-05-31 (`/tmp/gsc-blog-current-prev-2026-06-02.json`; helper summary `/tmp/miu-blog-maintenance-analysis-2026-06-02.json`).
- Comparison windows: previous `2026-05-04 -> 2026-05-17`, current `2026-05-18 -> 2026-05-31`; both windows are 14 days, so raw totals are comparable.
- Backlog/change files checked: `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, `docs/SEO/reports/blog-performance-recovery-2026-06-01.md`, `docs/SEO/reports/blog-opportunities-publisher-2026-06-01.md`, `docs/SEO/reports/3-kings-follow-up-2026-05-31.md`, and `docs/SEO/blog-content-tracking/topics-covered.md`.

## Blog URLs Losing Visibility

| URL                                        |                                                                                GSC change | Recent change correlation                                                                   | Likely cause                                                                           | Action                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------- |
| `/blog/how-ai-image-upscaling-works-guide` |        impressions `250 -> 98`; clicks `0 -> 0`; CTR `0.00% -> 0.00%`; pos `12.4 -> 11.6` | Static blog sitemap recovery was handled in May; no recent direct edit found                | Lower impressions, but ranking improved slightly and current impressions are below 100 | `defer-with-deadline` |
| `/blog/free-ai-upscaler-no-watermark`      |         impressions `633 -> 554`; clicks `0 -> 2`; CTR `0.00% -> 0.36%`; pos `8.1 -> 9.0` | 2026-05-24 metadata pass and 2026-05-26 growth work are still inside GSC lag                | Click/CTR improved despite lower impressions; do not churn                             | `defer-with-deadline` |
| `/blog/old-damaged-photos`                 |        impressions `107 -> 57`; clicks `0 -> 0`; CTR `0.00% -> 0.00%`; pos `68.0 -> 22.9` | No recent direct edit found                                                                 | Impression loss with materially better rank; not a critical regression                 | `defer-with-deadline` |
| `/blog/mejorar-calidad-imagen-ia-gratis`   |     impressions `273 -> 252`; clicks `12 -> 15`; CTR `4.40% -> 5.95%`; pos `41.1 -> 34.4` | No direct recent edit found                                                                 | Positive click/CTR movement; no action                                                 | `defer-with-deadline` |
| `/blog/best-free-ai-photo-enhancer-online` | impressions `1,168 -> 2,019`; clicks `11 -> 18`; CTR `0.94% -> 0.89%`; pos `37.9 -> 45.8` | Recent enhancer/sharpener cluster work exists, but page-level clicks and impressions are up | Broader low-rank query mix, not an edit-now loss                                       | `defer-with-deadline` |

Blog-only totals improved strongly: clicks `30 -> 83`, impressions `6,957 -> 23,395`; CTR softened `0.43% -> 0.35%`, while average position improved `27.7 -> 19.3` due to broader query coverage.

## Changes Correlated

- 2026-05-24 metadata CTR pass touched `/blog/best-free-ai-image-upscaler-2026-tested-compared`, `/blog/ai-image-upscaling-vs-sharpening-explained`, `/blog/best-ai-upscaler`, `/blog/free-ai-upscaler-no-watermark`, and `/blog/how-to-upscale-anime-images-with-ai`.
- 2026-05-26 growth execution touched or queued several ranking pages, including `/blog/topaz-video-upscaler`, `/blog/upscale-image-for-print-300-dpi-guide`, `/blog/best-ai-upscaler`, `/blog/free-ai-upscaler-no-watermark`, `/blog/fix-blurry-photos-ai-methods-guide`, `/blog/topaz-denoise-ai`, `/blog/photoshop-upscale-image`, `/blog/best-ai-image-enhancer`, and `/blog/sharpen-a-video`.
- Production redirect checks on 2026-06-02 confirmed retired duplicates still redirect: `/blog/photo-enhancement-upscaling-vs-quality -> 308 /blog/ai-image-upscaling-vs-sharpening-explained`, `/blog/best-free-ai-image-upscaler-tools-2026 -> 308 /blog/best-free-ai-image-upscaler-2026-tested-compared`, and `/blog/best-image-upscaling-tools-2026 -> 308 /blog/best-free-ai-image-upscaler-2026-tested-compared`.

## Escalations

| URL                                                      | Trigger                                                                                                                                                                                                                                                             | Deadline   | Required next action                                                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Current window has persistent zero-click striking-distance rows: `best free ai image upscaler 2026` (1,730 imps / 0 clicks / pos 5.2), `best free ai image upscaler online 2026` (753 / 0 / pos 5.1), and `best ai image upscaling tools 2026` (448 / 0 / pos 3.9). | 2026-06-07 | If rows remain 0-click at positions 3-7 after 14 complete days from the May 24/26 changes, run a narrow title/meta test on the canonical page; do not publish a duplicate post. |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       | `what is the difference between ai upscaling and sharpening` has 286 imps / 0 clicks / pos 4.45 in the current window.                                                                                                                                              | 2026-06-07 | If zero-click persists, prepare a content-depth `blog-edit` brief focused on visual examples and answer framing.                                                                |
| `/blog/topaz-video-upscaler`                             | `topaz video ai vs alternatives 2026` has 134 imps / 0 clicks / pos 7.07; 2026-05-31 report already flagged proof/comparison-depth need.                                                                                                                            | 2026-06-10 | Prepare content-depth `blog-edit` if the row does not improve after the 2026-05-26 changes are measurable.                                                                      |
| `/blog/best-ai-upscaler`                                 | `top ai image upscaler websites` has 130 imps / 0 clicks / pos 7.52 in the current window.                                                                                                                                                                          | 2026-06-10 | Wait one more window; title-test only if still 0-click at striking distance.                                                                                                    |
| `/blog/how-to-fix-a-grainy-photo`                        | `how to fix grainy photos` has 198 imps / 0 clicks / pos 10.75.                                                                                                                                                                                                     | 2026-06-10 | Recheck before editing; current position is just outside the 3-10 CTR leak threshold.                                                                                           |

## Edit Briefs

None applied in this run. Deferral is justified because the strongest actionable pages were changed on 2026-05-24 and/or 2026-05-26, while GSC currently ends on 2026-05-31. That provides only 5-7 complete GSC days for the latest changes, short of the 14-day post-refresh threshold.

## Fixes Applied

- No blog content, metadata, redirect, sitemap, or indexing-backlog changes were applied.
- Reports were saved for the recurring maintenance run.

## Open Actions

- Indexing backlog check: 10 unchecked `Request indexing` URLs in `docs/SEO/maintenance/gsc-request-indexing-backlog.md`; this is below the skill's `>10` alert threshold but should still be completed manually.
- Do not rewrite the May 24/26 metadata batch before the 2026-06-07 to 2026-06-10 checks.

## Next Run

Run after 2026-06-07. Act instead of monitoring if the best-free-upscaler or upscaling-vs-sharpening exact rows still show 0 clicks at positions 3-7, or after 2026-06-10 if Topaz/best-ai-upscaler/grainy-photo rows remain weak after the 2026-05-26 changes are measurable.
