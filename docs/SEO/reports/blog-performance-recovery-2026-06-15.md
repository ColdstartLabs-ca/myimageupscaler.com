# Blog Quality Monitor - 2026-06-15

Data:

- GSC: previous 2026-05-16 to 2026-05-29 -> current 2026-05-30 to 2026-06-12, Search Console web data from `/tmp/gsc-blog-monitor-14d-2026-06-15.json` and direct page+query comparison saved at `/tmp/gsc-blog-page-query-14d-2026-06-15.json`.
- GSC freshness: latest complete date 2026-06-12; normal 2-3 day lag applies.
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, recent `docs/SEO/reports/*.md`.

## Blog URLs Losing Visibility

| URL                                                |                                               GSC change, previous -> current | Recent change correlation                                                                                                          | Likely cause                                                                                                                                                                                             | Action                                                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/blog/best-free-ai-photo-enhancer-online`         |            1,938 -> 1,056 impressions; 16 -> 3 clicks; avg pos 46.39 -> 38.03 | Refreshed 2026-06-05, so the current window includes only partial post-refresh data.                                               | Broad weak-rank impression shift; one actionable row (`best free ai photo enhancer online 2026`) has only 56 current impressions at pos 7.98.                                                            | Defer; no broad rewrite before 2026-06-19+ data.                                                                        |
| `/blog/best-ai-upscaler`                           |                1,047 -> 739 impressions; 2 -> 1 clicks; avg pos 9.58 -> 17.43 | Listed in 2026-06-05 secondary indexing backlog; no recent content update found in the latest change log.                          | Position regression is visible, but top current rows are mixed/branded or low-volume; not enough query evidence for edit-now.                                                                            | Recheck next run; consider narrow brief only if non-branded query cluster remains worse with 100+ previous impressions. |
| `/blog/how-to-fix-a-grainy-photo`                  | 207 -> 0 impressions; 0 -> 0 clicks; avg pos 12.55 -> no visible current rows | No recent edit found in checked logs.                                                                                              | Visibility disappeared, but no click loss and current query rows are absent.                                                                                                                             | Investigate status/indexability if it repeats; no content edit from one zero-click loss.                                |
| `/blog/ai-image-upscaling-vs-sharpening-explained` |                   470 -> 284 impressions; 0 -> 0 clicks; avg pos 5.85 -> 5.20 | Prior runs flagged persistent zero-click risk; no new edit in current window.                                                      | CTR leak remains, but current top query volume fell below the 300-impression action threshold: `what is the difference between ai upscaling and sharpening` has 153 impressions, 0 clicks, avg pos 3.79. | Defer with threshold; act if next run returns to 300+ impressions, pos 3-10, zero clicks.                               |
| `/blog/mejorar-calidad-imagen-ia-gratis`           |                327 -> 200 impressions; 20 -> 6 clicks; avg pos 37.83 -> 25.86 | No recent edit found.                                                                                                              | Non-English long-tail volatility at weak rankings; not an urgent blog-edit target.                                                                                                                       | Defer.                                                                                                                  |
| `/blog/how-ai-image-upscaling-works-explained`     |                  140 -> 21 impressions; 0 -> 0 clicks; avg pos 15.33 -> 16.14 | 2026-06-07 consolidation redirects this URL into `/blog/how-ai-image-upscaling-works-guide`, after most of the current GSC window. | Intentional migration/consolidation.                                                                                                                                                                     | Migration-monitor; do not edit old URL.                                                                                 |
| `/blog/best-photo-restoration-software`            |                  165 -> 81 impressions; 0 -> 0 clicks; avg pos 75.66 -> 78.04 | No recent edit found.                                                                                                              | Weak rankings, not a CTR page-one leak.                                                                                                                                                                  | Defer.                                                                                                                  |

## Changes Correlated

- 2026-06-07 blog edits and consolidation work are only partially represented in GSC through 2026-06-12. Avoid judging those edits as failures yet.
- 2026-06-05 thin-content refreshes are partly represented; broad rewrites should wait until at least 2026-06-19, and preferably the 2026-06-24 run for fuller post-refresh data.
- `how-ai-image-upscaling-works-explained` losing impressions is expected migration behavior after consolidation into `/blog/how-ai-image-upscaling-works-guide`.

## Escalations

| URL                                                      | Trigger                                                                                                                                                              | Deadline              | Required next action                                                                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Current 14d exact query `best free ai image upscaler 2026`: 1,433 impressions, 0 clicks, avg pos 4.15. The 2026-06-07 metadata test still has only partial coverage. | 2026-06-24 full read. | If exact/near-exact rows remain 300+ impressions, avg pos 3-10, and 0 clicks, prepare/apply a narrow SERP-intent title/meta brief.                  |
| `/blog/fixing-pixelated-photos`                          | 90d query `how to fix pixelated photos`: 16,112 impressions, 0 clicks, avg pos 10.95; page refreshed 2026-06-07 and pending manual indexing.                         | 2026-06-24+.          | Do not rewrite again until indexing/recrawl happens and enough post-recrawl GSC data exists.                                                        |
| `/blog/best-ai-upscaler`                                 | Page-level position worsened 9.58 -> 17.43 with 1,047 -> 739 impressions.                                                                                            | Next run.             | If non-branded top queries confirm position loss with 100+ previous impressions, prepare a focused edit brief instead of another monitor-only note. |
| `/blog/how-to-make-png-background-transparent-free`      | 90d query `easiest way to make image background transparent 2026`: 310 impressions, 0 clicks, avg pos 9.00.                                                          | Next run.             | If repeated at 300+ impressions, pos 3-10, zero clicks, prepare a CTR/CTA edit brief.                                                               |

## Edit Briefs

None applied. Deferrals are justified by monitor rules: recent edits are still inside GSC lag, the strongest zero-click rows need a full post-test read, several losses have no clicks to lose, and most affected query clusters are either below the persistent 300-impression threshold or ranking outside action positions.

## Fixes Applied

None. This was a monitor/report-only run.

## Open Actions

User attention required: indexing backlog has 29 unchecked URLs. Oldest pending section is 2026-05-26. The backlog includes important blog URLs from the 2026-06-05 and 2026-06-07 refreshes, so manual GSC request-indexing should be completed before more edits are stacked onto those pages.

## Next Run

Run again after 2026-06-24. Act instead of monitoring if:

- `/blog/best-free-ai-image-upscaler-2026-tested-compared` exact/near-exact best-free-upscaler rows remain 300+ impressions, avg pos 3-10, and 0 clicks after the 2026-06-07 metadata test is fully represented.
- `/blog/best-ai-upscaler` repeats a non-branded position regression with 100+ previous-window impressions.
- `/blog/how-to-make-png-background-transparent-free` repeats 300+ impressions, avg pos 3-10, and zero clicks for the transparent-background 2026 query.
