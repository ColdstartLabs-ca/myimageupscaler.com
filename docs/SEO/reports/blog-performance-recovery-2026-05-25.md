# Blog Quality Monitor - 2026-05-25

Data:

- GSC: direct date+page+query export for `myimageupscaler.com`, fetched 2026-05-25, latest complete date 2026-05-22.
- Comparison windows: previous `2026-04-25 -> 2026-05-08`, current `2026-05-09 -> 2026-05-22`; both windows are 14 days, so raw totals are comparable.
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, `docs/SEO/reports/blog-performance-recovery-2026-05-22.md`, `docs/SEO/reports/gsc-click-recovery-2026-05-24.md`, and `docs/SEO/blog-content-tracking/topics-covered.md`.

## Blog URLs Losing Visibility

| URL                                                      |                                                                            GSC change | Recent change correlation                                                                  | Likely cause                                                                                          | Action                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | impressions `4,416 -> 3,322`; clicks `1 -> 6`; CTR `0.02% -> 0.18%`; pos `7.8 -> 9.0` | Refreshed 2026-05-12, 2026-05-19, and metadata updated 2026-05-24                          | Mixed: impressions down but clicks/CTR improved before latest metadata is visible in GSC              | `defer-with-deadline` |
| `/blog/best-ai-image-quality-enhancer-free`              |         impressions `727 -> 183`; clicks `0 -> 0`; CTR `0% -> 0%`; pos `10.8 -> 55.0` | Three Kings refresh 2026-05-06; metadata updated 2026-05-24                                | Critical regression in sharpener/enhancer visibility, but latest fix is not in GSC yet                | `defer-with-deadline` |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       |           impressions `681 -> 258`; clicks `0 -> 0`; CTR `0% -> 0%`; pos `4.2 -> 5.3` | Major body refresh 2026-05-06; metadata updated 2026-05-24                                 | Lower demand/query mix plus persistent zero-click explainer SERP; latest snippet test not visible yet | `defer-with-deadline` |
| `/blog/photo-enhancement-upscaling-vs-quality`           |                                               impressions `394 -> 0`; clicks `0 -> 0` | Production check returns `308` to `/blog/ai-image-upscaling-vs-sharpening-explained`       | Intentional migration/consolidation                                                                   | `migration-monitor`   |
| `/blog/how-to-upscale-images-without-losing-quality`     |                           impressions `72 -> 19`; clicks `0 -> 0`; pos `13.5 -> 29.8` | No high-priority recent edit found; below 100 previous-window impressions                  | Low-volume visibility loss                                                                            | `defer-with-deadline` |
| `/blog/best-free-ai-image-upscaler-tools-2026`           |                                                impressions `44 -> 0`; clicks `0 -> 0` | Production check returns `308` to `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Intentional migration/consolidation                                                                   | `migration-monitor`   |
| `/blog/fix-blurry-photos-ai-methods-guide`               |                           impressions `82 -> 54`; clicks `0 -> 0`; pos `19.5 -> 30.3` | No high-priority recent edit found; below 100 previous-window impressions                  | Low-volume ranking drift                                                                              | `defer-with-deadline` |

Overall blog-only totals improved on traffic despite some page-level losses: clicks `9 -> 52`, impressions `8,775 -> 10,129`, CTR `0.10% -> 0.51%`. Average position worsened `14.8 -> 27.9`, which is partly query-mix expansion because the current window contains more low-ranking rows.

## Changes Correlated

- 2026-05-24 metadata CTR pass updated `/blog/best-free-ai-image-upscaler-2026-tested-compared`, `/blog/ai-image-upscaling-vs-sharpening-explained`, `/blog/best-ai-upscaler`, `/blog/free-ai-upscaler-no-watermark`, and `/blog/how-to-upscale-anime-images-with-ai`; GSC latest complete date is 2026-05-22, so this run cannot judge those changes yet.
- 2026-05-19 CTR/internal-link pass touched top best-free-upscaler, enhancer, and no-watermark posts; only partial data is available.
- Production checks confirmed retired duplicates return redirects: `/blog/photo-enhancement-upscaling-vs-quality -> 308 /blog/ai-image-upscaling-vs-sharpening-explained`; `/blog/best-free-ai-image-upscaler-tools-2026 -> 308 /blog/best-free-ai-image-upscaler-2026-tested-compared`.

## Escalations

| URL                                                      | Trigger                                                                                                                                                  | Deadline   | Required next action                                                                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/blog/best-ai-image-quality-enhancer-free`              | Critical position regression threshold met in stale data: impressions down 75%+ and position worsened 44 positions from a 727-impression previous window | 2026-06-03 | If the sharpener/unblur cluster remains down 50%+ or zero-click after 7 complete GSC days from the 2026-05-24 metadata pass, run a narrow `blog-edit` for the top sharpener/unblur queries. |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Persistent zero-click CTR leak remains for `best free ai image upscaler 2026`: current 610 impressions, 0 clicks, avg pos 9.3                            | 2026-06-07 | If 14-day CTR remains below 0.2% at positions 3-10 after the 2026-05-24 metadata test, prepare a title/meta/internal-link edit brief; do not create a new post.                             |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       | Query `what is the difference between ai upscaling and sharpening` is `263 -> 152` impressions with `0 -> 0` clicks and stable pos around 5.5            | 2026-06-07 | If zero-click persists after the latest metadata test matures, prepare a SERP-title/meta brief focused on the exact question query.                                                         |

## Edit Briefs

None applied in this run. Deferral is justified because the top actionable URLs received a 2026-05-24 metadata pass and GSC latest complete data is 2026-05-22, so none of that work is measurable yet. The critical enhancer/sharpener regression is escalated with a concrete action date instead of another open-ended monitor recommendation.

## Fixes Applied

- No content, metadata, redirect, sitemap, or indexing-backlog changes were applied.
- Reports were saved for the recurring maintenance run.

## Open Actions

- Indexing backlog check: 0 unchecked `Request indexing` URLs in `docs/SEO/maintenance/gsc-request-indexing-backlog.md`.
- No immediate user/manual indexing action is required.
- Keep the 2026-05-24 metadata pass untouched until enough GSC data is available.

## Next Run

Run after 2026-06-03 for the first post-change sharpener/enhancer read. On that run, if `/blog/best-ai-image-quality-enhancer-free` still has position worse than 20 or impressions remain down 50%+ versus the prior window, apply `blog-edit` with a narrow brief for `best free ai image sharpener online 2026`, `best free ai image enhancer unblur sharpen online 2026`, and `best free online tools to sharpen blurry images 2026`. Run a broader CTR read after 2026-06-07 for the 2026-05-24 metadata batch.
