# Blog Quality Monitor - 2026-06-08

Data:

- GSC: previous 2026-05-09 to 2026-05-22 -> current 2026-05-23 to 2026-06-05, Search Console web data from `/tmp/gsc-blog-monitor-14d-2026-06-08.json`.
- GSC freshness: latest complete date 2026-06-05; normal 2-3 day lag applies.
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, recent `docs/SEO/reports/*.md`.

## Blog URLs Losing Visibility

| URL                                          |                               GSC change, previous -> current | Recent change correlation                                                                                                          | Likely cause                                                                              | Action                                                       |
| -------------------------------------------- | ------------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `/blog/ai-image-upscaler-for-etsy-sellers`   |    295 -> 22 impressions; 1 -> 1 clicks; avg pos 6.45 -> 7.00 | No recent edit found. Query+page rows were mostly anonymized; direct query+page pull showed only 8 previous visible impressions.   | Demand/query mix shift, not a confirmed content regression.                               | Defer-with-deadline; no edit without query cluster evidence. |
| `/blog/ai-image-enhancement-ecommerce-guide` |  235 -> 39 impressions; 0 -> 0 clicks; avg pos 11.97 -> 12.46 | No recent edit found.                                                                                                              | Low-click, low-confidence impression loss.                                                | Defer.                                                       |
| `/blog/how-ai-image-upscaling-works-guide`   | 330 -> 225 impressions; 0 -> 0 clicks; avg pos 11.57 -> 11.52 | Consolidation/redirect work on 2026-06-07 happened after this GSC window.                                                          | Intent consolidation still inside GSC lag.                                                | Migration-monitor; request indexing already in backlog.      |
| `/blog/upscale-product-photos-for-ecommerce` |  113 -> 21 impressions; 0 -> 0 clicks; avg pos 12.97 -> 23.57 | No recent edit found; direct query+page evidence was too sparse: 8 visible previous impressions and 0 current visible impressions. | Page-level drop exists, but the query cluster is not visible enough to justify a rewrite. | Defer-with-deadline; recheck with query+page rows next run.  |
| `/blog/what-resolution-for-print`            |   155 -> 99 impressions; 0 -> 0 clicks; avg pos 9.90 -> 11.71 | Refreshed 2026-06-05, after most of the current GSC window.                                                                        | Post-refresh GSC lag.                                                                     | Defer until 2026-06-19+.                                     |
| `/blog/best-photo-restoration-software`      | 231 -> 150 impressions; 0 -> 0 clicks; avg pos 49.09 -> 60.97 | No recent edit found. Direct query rows remain far outside action positions.                                                       | Weak rankings, not an urgent CTR/position-5-15 leak.                                      | Defer; not edit-now.                                         |
| `/blog/noise-reduction-in-photos`            | 233 -> 167 impressions; 0 -> 0 clicks; avg pos 34.70 -> 44.72 | No recent edit found. Direct query rows are mostly position 30-85.                                                                 | Weak rankings, not an edit-now CTR issue.                                                 | Defer; not edit-now.                                         |

## Changes Correlated

- 2026-06-07: `/blog/fixing-pixelated-photos`, `/blog/topaz-video-upscaler`, `/blog/topaz-labs-free-trial`, `/blog/how-ai-image-upscaling-works-guide`, and Adobe Express alternatives were updated after the latest complete GSC date, so this monitor cannot judge those changes yet.
- 2026-06-07: `/blog/best-free-ai-image-upscaler-2026-tested-compared` received a SERP title/meta test after the GSC window. Current 14d data still shows severe exact-query zero-click rows, but they predate the test.
- 2026-06-05: seven thin-content refreshes are only partially represented in GSC; broad rewrites should wait until at least 2026-06-19.

## Escalations

| URL                                                      | Trigger                                                                                                                                                                        | Deadline                                     | Required next action                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Current 14d exact query `best free ai image upscaler 2026`: 1,653 impressions, 0 clicks, avg pos 3.28; previous 14d also had 610 impressions, 0 clicks, avg pos 9.33.          | 2026-06-17 first read; 2026-06-24 full read. | Do not edit again until GSC includes the 2026-06-07 metadata test. If still 300+ impressions, pos 3-10, and 0 clicks after 2026-06-17, prepare a narrow title/meta or SERP-intent edit brief. |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       | Current 14d query `what is the difference between ai upscaling and sharpening`: 302 impressions, 0 clicks, avg pos 4.05; previous was 152 impressions, 0 clicks, avg pos 5.59. | 2026-06-17.                                  | If the same query remains 300+ impressions, pos 3-10, and 0 clicks for another run, apply a narrow SERP title/meta/internal-link brief.                                                       |
| `/blog/topaz-video-upscaler`                             | Current 14d query `topaz video ai vs alternatives 2026`: 250 impressions, 0 clicks, avg pos 7.80; page was updated 2026-06-07.                                                 | 2026-06-17+.                                 | Defer due recent refresh; edit only if the query crosses 300+ impressions at pos 3-10 with zero clicks after the update is measurable.                                                        |

## Edit Briefs

None applied. Deferrals are justified by one or more monitor rules: recent edit not yet in GSC, latest GSC data excludes the June 7 changes, query+page evidence is below the 300-impression persistent zero-click threshold, or affected rankings are outside the actionable position 3-15 range.

## Fixes Applied

None. This was a monitor/report-only run.

## Open Actions

User attention required: indexing backlog has 29 unchecked URLs. The backlog includes important recently edited blog URLs from 2026-05-26, 2026-05-31, 2026-06-05, and 2026-06-07. Manual GSC request-indexing should be completed before stacking more edits onto the same pages.

## Next Run

Run again after 2026-06-17. Act instead of monitoring if:

- `/blog/best-free-ai-image-upscaler-2026-tested-compared` exact-match best-free-upscaler rows remain 300+ impressions, avg pos 3-10, and 0 clicks after the 2026-06-07 metadata test is included.
- `/blog/ai-image-upscaling-vs-sharpening-explained` repeats 300+ impressions, avg pos 3-10, and 0 clicks for `what is the difference between ai upscaling and sharpening`.
- `/blog/topaz-video-upscaler` crosses 300+ impressions at avg pos 3-10 with zero clicks after the 2026-06-07 refresh is measurable.
