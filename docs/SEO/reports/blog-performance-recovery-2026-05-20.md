# Blog Quality Monitor - 2026-05-20

Data:

- GSC: direct date+page+query export, 2026-04-19 through 2026-05-17, 10,340 rows (`/tmp/gsc-blog-date-page-query-2026-05-20.json`).
- Comparison windows: previous 2026-04-20 to 2026-05-03; current 2026-05-04 to 2026-05-17.
- GSC freshness: latest complete date in this run is 2026-05-17.
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, recent `docs/SEO/reports/blog-*.md`, and recent git history since 2026-05-01.

## Blog URLs Losing Visibility

| URL                                                      |                                                                             GSC change | Recent change correlation                                                                                          | Likely cause                                                                                                               | Action                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Impressions 5,862 → 1,722 (-4,140); clicks 1 → 2; CTR 0.02% → 0.12%; avg pos 8.0 → 9.1 | Refreshed 2026-05-12 and 2026-05-19 for Three Kings/CTR/CTA; old duplicate URLs redirected.                        | Demand/visibility shift plus recent snippet/title changes still inside GSC lag; clicks improved despite lower impressions. | No edit today; monitor the May 19 refresh after more data.                                   |
| `/blog/best-ai-image-quality-enhancer-free`              |                         Impressions 971 → 118 (-853); clicks 0 → 0; avg pos 9.7 → 46.3 | Refreshed 2026-05-06 and 2026-05-19; now targets sharpener/enhancer intent and tool CTA.                           | Performance alert: sharpener/enhancer query set dropped sharply, but recent May 19 metadata update is too fresh to judge.  | Monitor; consider a narrow `blog-edit` brief only if the next run still shows position loss. |
| `/blog/photo-enhancement-upscaling-vs-quality`           |                                                             Impressions 533 → 0 (-533) | Production returns 308 to `/blog/ai-image-upscaling-vs-sharpening-explained`; logged as intentional consolidation. | Intentional migration/cannibalization cleanup.                                                                             | No content edit; monitor destination.                                                        |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       |                          Impressions 644 → 366 (-278); clicks 0 → 0; avg pos 3.7 → 5.0 | Refreshed 2026-05-06; receives the retired `photo-enhancement-upscaling-vs-quality` redirect.                      | Alert: canonical destination retained ranking but lost impressions on explanatory query variants.                          | Monitor one more run; avoid same-day rewrite while migration/refresh data settles.           |
| `/blog/how-to-upscale-anime-images-with-ai`              |                            Impressions 166 → 92 (-74); clicks 0 → 0; avg pos 7.0 → 6.2 | Refreshed 2026-05-14; position improved while impressions fell.                                                    | SERP demand/query volatility rather than ranking regression.                                                               | No edit.                                                                                     |
| `/blog/best-free-ai-image-upscaler-tools-2026`           |                                                               Impressions 61 → 0 (-61) | Production returns 308 to `/blog/best-free-ai-image-upscaler-2026-tested-compared`.                                | Intentional migration/cannibalization cleanup.                                                                             | No content edit.                                                                             |
| `/blog/upscale-image-online-free`                        |                                                               Impressions 35 → 3 (-32) | Production returns 308 to `/blog/free-ai-upscaler-no-watermark`.                                                   | Intentional migration/canonicalization.                                                                                    | No content edit.                                                                             |

## Changes Correlated

- 2026-05-19: Metadata/CTA updates to the top free-upscaler, image-quality-enhancer, and no-watermark clusters plus static blog sitemap recovery.
- 2026-05-14: Three Kings refresh for `best-ai-upscaler`, `topaz-video-upscaler`, and `how-to-upscale-anime-images-with-ai`.
- 2026-05-12: Canonical best-free-upscaler content refresh, 16x guide publish, and metadata backlog cleanup.
- Production redirect checks confirmed retired duplicate/cannibalizing blog URLs return `308` to their canonical destinations.

## Fixes Applied

None. The monitor found alerts, but no immediate `blog-edit` handoff was applied because the highest-impact affected canonical pages were updated within the current GSC lag window or the losses were expected redirect migrations.

## Next Run

Run again after 2026-05-23. If `/blog/best-ai-image-quality-enhancer-free` still shows severe position loss after the May 19 refresh has mature GSC data, prepare a narrow edit brief around `best free ai image sharpener online 2026`, `best free ai image enhancer unblur sharpen online 2026`, and `best free online tools to sharpen blurry images 2026`.
