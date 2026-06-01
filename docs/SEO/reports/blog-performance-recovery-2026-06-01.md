# Blog Quality Monitor - 2026-06-01

Data:

- GSC: 14-day web export for `myimageupscaler.com`, fetched 2026-06-01, latest complete date 2026-05-29 (`/tmp/gsc-blog-monitor-14-2026-06-01.json`).
- Comparison windows: previous `2026-05-02 -> 2026-05-15`, current `2026-05-16 -> 2026-05-29`; both windows are 14 days, so raw totals are comparable.
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, `docs/SEO/reports/blog-performance-recovery-2026-05-25.md`, `docs/SEO/reports/gsc-growth-opportunity-report-2026-05-26.md`, `docs/SEO/reports/3-kings-follow-up-2026-05-31.md`, and `docs/SEO/blog-content-tracking/topics-covered.md`.

## Blog URLs Losing Visibility

| URL                                                  |                                                                             GSC change | Recent change correlation                                                                                     | Likely cause                                                                                              | Action                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------- |
| `/blog/fix-blurry-photos-ai-methods-guide`           |   impressions `1,067 -> 904`; clicks `0 -> 0`; CTR `0.00% -> 0.00%`; pos `9.3 -> 10.9` | Queued in 2026-05-26 indexing backlog; no older same-window content rewrite found                             | Still close to page 1, but not a critical threshold because rank only slipped 1.6 positions               | `defer-with-deadline` |
| `/blog/how-to-upscale-midjourney-images-for-print`   |      impressions `369 -> 211`; clicks `0 -> 2`; CTR `0.00% -> 0.95%`; pos `7.9 -> 8.8` | No recent high-priority edit found                                                                            | Impression decline with click/CTR improvement; not an edit-now regression                                 | `defer-with-deadline` |
| `/blog/how-to-upscale-images-without-losing-quality` |    impressions `582 -> 440`; clicks `0 -> 0`; CTR `0.00% -> 0.00%`; pos `10.3 -> 10.6` | No recent high-priority edit found                                                                            | Persistent low CTR, but position is stable and loss is below critical threshold                           | `defer-with-deadline` |
| `/blog/restore-old-photos-ai-enhancement-guide`      |    impressions `261 -> 122`; clicks `0 -> 0`; CTR `0.00% -> 0.00%`; pos `14.1 -> 16.6` | Related restoration cluster already had existing coverage and no-publish decisions                            | Lower-volume visibility loss outside positions 3-10                                                       | `defer-with-deadline` |
| `/blog/photoshop-upscaler-vs-ai-tools`               |     impressions `262 -> 136`; clicks `0 -> 0`; CTR `0.00% -> 0.00%`; pos `8.4 -> 11.6` | Photoshop cluster had recent adjacent work in growth reports, but this static post was not an edit-now target | Moderate drift, not critical threshold                                                                    | `defer-with-deadline` |
| `/blog/how-ai-image-upscaling-works-guide`           |    impressions `287 -> 172`; clicks `0 -> 0`; CTR `0.00% -> 0.00%`; pos `11.0 -> 12.1` | Static blog sitemap recovery was handled in May                                                               | Low-volume drift; avoid new post                                                                          | `defer-with-deadline` |
| `/blog/upscale-image-for-print-300-dpi-guide`        | impressions `1,406 -> 1,293`; clicks `6 -> 10`; CTR `0.43% -> 0.77%`; pos `7.8 -> 8.1` | Updated/queued in 2026-05-26 growth execution                                                                 | Positive click and CTR movement despite slight impression decline                                         | `defer-with-deadline` |
| `/blog/image-resolution-for-printing-complete-guide` |    impressions `668 -> 593`; clicks `2 -> 0`; CTR `0.30% -> 0.00%`; pos `21.7 -> 40.4` | No direct recent edit found                                                                                   | Position collapsed, but current rank is far from CTR-action zone; likely query mix/low-quality visibility | `defer-with-deadline` |
| `/blog/topaz-video-upscaler`                         | impressions `1,921 -> 1,871`; clicks `1 -> 1`; CTR `0.05% -> 0.05%`; pos `8.9 -> 10.6` | 2026-05-31 Three Kings follow-up already flagged content-depth/proof need                                     | Weak CTR and slight rank drift; content proof, not another metadata-only pass                             | `defer-with-deadline` |

Blog-only totals improved overall: clicks `74 -> 255`, impressions `21,006 -> 43,192`, CTR `0.35% -> 0.59%`; average position softened `11.3 -> 12.3` due to broader query mix.

## Changes Correlated

- 2026-05-24 metadata CTR pass touched `/blog/best-free-ai-image-upscaler-2026-tested-compared`, `/blog/ai-image-upscaling-vs-sharpening-explained`, `/blog/best-ai-upscaler`, `/blog/free-ai-upscaler-no-watermark`, and `/blog/how-to-upscale-anime-images-with-ai`. The latest GSC data through 2026-05-29 includes only five complete post-change days, so broad rewrites remain premature.
- 2026-05-26 growth execution updated/queued several ranking blog pages, including `/blog/topaz-video-upscaler`, `/blog/upscale-image-for-print-300-dpi-guide`, `/blog/best-ai-upscaler`, `/blog/free-ai-upscaler-no-watermark`, `/blog/fix-blurry-photos-ai-methods-guide`, `/blog/topaz-denoise-ai`, `/blog/photoshop-upscale-image`, `/blog/best-ai-image-enhancer`, and `/blog/sharpen-a-video`. Those changes are also inside GSC lag.
- Production redirect checks confirmed retired duplicates still redirect: `/blog/photo-enhancement-upscaling-vs-quality -> 308 /blog/ai-image-upscaling-vs-sharpening-explained`, `/blog/best-free-ai-image-upscaler-tools-2026 -> 308 /blog/best-free-ai-image-upscaler-2026-tested-compared`, and `/blog/best-image-upscaling-tools-2026 -> 308 /blog/best-free-ai-image-upscaler-2026-tested-compared`.
- Positive reads: `/blog/best-free-ai-image-upscaler-2026-tested-compared` improved clicks `17 -> 120`, impressions `5,652 -> 18,319`, CTR `0.30% -> 0.66%`, position `8.1 -> 6.4`; `/blog/how-to-upscale-youtube-thumbnails` improved clicks `5 -> 24`; `/blog/how-to-upscale-anime-images-with-ai` improved clicks `0 -> 4`.

## Escalations

| URL                                                      | Trigger                                                                                                                                                                                 | Deadline   | Required next action                                                                                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Page-level recovery is strong, but exact high-intent rows remain zero-click: `best free ai image upscaler 2026` has 1,474 impressions / 0 clicks / pos 5.6 in the current 14-day window | 2026-06-07 | If exact best-free rows remain 0-click at positions 3-7 after 14 complete days from the May 24/26 changes, run a narrow title/meta test; do not publish a duplicate post. |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       | `what is the difference between ai upscaling and sharpening` has 265 impressions / 0 clicks / pos 4.6 in the current 14-day window                                                      | 2026-06-07 | If zero-click persists, prepare a `blog-edit` brief focused on visual examples and answer framing for the exact question query.                                           |
| `/blog/topaz-video-upscaler`                             | CTR stayed at 0.05% and position softened `8.9 -> 10.6`; 2026-05-31 report already found proof/comparison-depth need                                                                    | 2026-06-10 | Prepare content-depth `blog-edit` if current window does not improve after the 2026-05-26 work is measurable.                                                             |
| `/blog/fix-blurry-photos-ai-methods-guide`               | 904 current impressions, 0 clicks, avg position 10.9; URL is in the 2026-05-26 indexing backlog                                                                                         | 2026-06-10 | First complete manual indexing backlog; then edit only if position remains around 8-12 with zero clicks.                                                                  |

## Edit Briefs

None applied in this run. Deferral is justified because the strongest actionable pages were changed on 2026-05-24 and/or 2026-05-26, while GSC currently ends on 2026-05-29. The current data provides a watchlist and deadlines, not enough complete post-change days for safe content churn.

## Fixes Applied

- No blog content, metadata, redirect, sitemap, or indexing-backlog changes were applied.
- Reports were saved for the recurring maintenance run.

## Open Actions

- Indexing backlog check: 10 unchecked `Request indexing` URLs in `docs/SEO/maintenance/gsc-request-indexing-backlog.md`; this is below the skill's `>10` alert threshold but should still be completed manually after deploy/content cache settles.
- Do not rewrite the May 24/26 metadata batch again before the 2026-06-07 to 2026-06-10 checks.

## Next Run

Run after 2026-06-07. Act instead of monitoring if the best-free-upscaler or upscaling-vs-sharpening exact rows still show 0 clicks at positions 3-7, or after 2026-06-10 if Topaz/fix-blurry rows remain weak after the 2026-05-26 changes are measurable.
