# Blog Quality Monitor - 2026-05-22

Data:

- GSC: direct date+page+query export, 2026-04-20 through 2026-05-19, 11,074 rows (`/tmp/gsc-blog-date-page-query-2026-05-22.json`).
- Comparison windows: previous 2026-04-22 to 2026-05-05; current 2026-05-06 to 2026-05-19.
- GSC freshness: latest complete date in this run is 2026-05-19.
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, recent `docs/SEO/reports/blog-*.md`, and recent git history since 2026-05-01.

## Blog URLs Losing Visibility

| URL                                                      |                                                          GSC change | Recent change correlation                                                                                            | Likely cause                                                                                                         | Action                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------: | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Impressions 5,200 → 2,362 (-2,838); clicks 1 → 4; avg pos 7.9 → 9.3 | Refreshed 2026-05-12 and 2026-05-19; retired duplicate free-upscaler URLs redirect here.                             | Visibility/demand shift plus still-fresh title/meta/CTA changes; clicks improved despite lower impressions.          | No edit today; monitor May 19 refresh after more mature GSC data.                                       |
| `/blog/best-ai-image-quality-enhancer-free`              |     Impressions 828 → 159 (-669); clicks 0 → 0; avg pos 10.5 → 51.7 | Refreshed 2026-05-06 and 2026-05-19 around sharpener/enhancer intent and tool CTA.                                   | Performance alert: sharpener/enhancer query set dropped sharply; May 19 metadata update is still too fresh to judge. | Monitor one more run; if still weak, prepare a narrow `blog-edit` brief for sharpener/enhancer queries. |
| `/blog/photo-enhancement-upscaling-vs-quality`           |                            Impressions 437 → 0 (-437); clicks 0 → 0 | Production returns `308` to `/blog/ai-image-upscaling-vs-sharpening-explained`; logged as intentional consolidation. | Intentional migration/cannibalization cleanup.                                                                       | No content edit; monitor destination.                                                                   |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       |       Impressions 637 → 287 (-350); clicks 0 → 0; avg pos 4.0 → 4.9 | Refreshed 2026-05-06; receives the retired `photo-enhancement-upscaling-vs-quality` redirect.                        | Canonical destination retained top-5 ranking but lost impressions on explanatory variants.                           | Monitor one more run; avoid rewriting during migration/refresh lag.                                     |
| `/blog/best-free-ai-image-upscaler-tools-2026`           |                              Impressions 51 → 0 (-51); clicks 0 → 0 | Production returns `308` to `/blog/best-free-ai-image-upscaler-2026-tested-compared`.                                | Intentional migration/cannibalization cleanup.                                                                       | No content edit.                                                                                        |
| `/blog/how-to-upscale-anime-images-with-ai`              |        Impressions 155 → 119 (-36); clicks 0 → 0; avg pos 7.3 → 6.2 | Refreshed 2026-05-14.                                                                                                | SERP demand/query volatility; position improved while impressions fell.                                              | No edit.                                                                                                |
| `/blog/upscale-image-online-free`                        |                              Impressions 26 → 0 (-26); clicks 0 → 0 | Production returns `308` to `/blog/free-ai-upscaler-no-watermark`.                                                   | Intentional migration/canonicalization.                                                                              | No content edit.                                                                                        |

## Changes Correlated

- 2026-05-19: Metadata/CTA updates for the top free-upscaler, image-quality-enhancer, and no-watermark clusters plus static blog sitemap recovery.
- 2026-05-14: Three Kings refresh for `best-ai-upscaler`, `topaz-video-upscaler`, and `how-to-upscale-anime-images-with-ai`.
- 2026-05-12: Canonical best-free-upscaler content refresh, 16x guide publish, and metadata backlog cleanup.
- Production redirect checks confirmed retired duplicate/cannibalizing blog URLs return `308` to their canonical destinations.

## Fixes Applied

None. The monitor found alerts, especially `/blog/best-ai-image-quality-enhancer-free`, but no immediate `blog-edit` handoff was applied because the highest-impact affected canonical pages were updated inside the current GSC lag window or the losses were expected redirect migrations.

## Next Run

Run again after 2026-05-26. If `/blog/best-ai-image-quality-enhancer-free` still shows severe position loss after the May 19 refresh has mature GSC data, prepare a narrow edit brief around `best free ai image sharpener online 2026`, `best free ai image enhancer unblur sharpen online 2026`, and `best free online tools to sharpen blurry images 2026`.
