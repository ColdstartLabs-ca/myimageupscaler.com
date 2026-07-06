# Blog Quality Monitor - 2026-07-06

Data:

- GSC: previous 2026-06-06 to 2026-06-19 → current 2026-06-20 to 2026-07-03, 14-day blog-only page/query windows, latest complete date 2026-07-03 (`/tmp/gsc-blog-monitor-14d-2026-07-06.json`)
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, recent `docs/SEO/reports/*.md`
- Measurement note: 2026-07-03 blog edits are not yet measurable. Current GSC includes at most the change date, not 7-14 complete post-change days.

## Blog URLs Losing Visibility

| URL                                                      |                                                                                                                                                                                                                      GSC change | Recent change correlation                                                          | Likely cause                                                                                                                    | Action                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/blog/fixing-pixelated-photos`                          |                                                                                                                                                   clicks 2 → 0; impressions 45,632 → 12,118; pos 11.2 → 11.2; CTR 0.00% → 0.00% | Refreshed 2026-07-03 in the CTR/ranking lift pass.                                 | Severe ongoing zero-click demand, but the fresh edit is inside GSC lag.                                                         | `defer-with-deadline` to 2026-07-20; do not rewrite before the post-change window exists.           |
| `/blog/best-ai-upscaler`                                 |                                                                                                                                                     clicks 4 → 2; impressions 2,455 → 1,084; pos 11.3 → 17.7; CTR 0.16% → 0.18% | Refreshed 2026-07-03 around AI upscaler websites/comparison intent.                | Ranking loss is meaningful but below the 10-position critical threshold; current data mostly predates the edit.                 | `defer-with-deadline` to 2026-07-20.                                                                |
| `/blog/mejorar-calidad-imagen-ia-gratis`                 |                                                                                                                                                        clicks 26 → 6; impressions 575 → 216; pos 16.5 → 22.7; CTR 4.52% → 2.78% | No recent direct edit found in the checked backlogs.                               | Spanish query volatility/ranking slip; current impressions below critical edit threshold.                                       | `defer-with-deadline`; recheck next run if clicks remain below 10 and position stays worse than 20. |
| `/blog/how-to-upscale-youtube-thumbnails`                |                                                                                                                                                     clicks 29 → 17; impressions 2,840 → 2,231; pos 6.3 → 6.8; CTR 1.02% → 0.76% | Refreshed 2026-06-05; indexing marked requested for the 2026-06-21 follow-up item. | Moderate click/CTR loss, but still generating clicks and no critical position regression.                                       | `defer-with-deadline`; edit only if clicks fall below 10 or CTR <0.5% next run.                     |
| `/blog/topaz-denoise-ai`                                 |                                                                                                                                                     clicks 3 → 0; impressions 1,234 → 1,417; pos 10.0 → 11.0; CTR 0.24% → 0.00% | In 2026-05-26 request-indexing backlog; no recent completed indexing mark.         | CTR leak around a page-1/near-page-1 URL, but not a 3-10 position persistent-zero-click row at the query threshold in this run. | `indexing-follow-up`; request indexing remains open.                                                |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | page-level traffic remains positive versus earlier baseline, but exact rows still zero-click: `best free ai image upscaler 2026` 1,261 impressions / 0 clicks / pos 5.5; `best ai image upscaling tools 2026` 863 / 0 / pos 5.9 | Narrow description refresh on 2026-06-29; indexing still open.                     | Persistent exact-query CTR problem, but the edit is still inside the 14-day guardrail and manual indexing is pending.           | `defer-with-deadline` to 2026-07-15; next action is a title test if still zero-click.               |
| `/blog/topaz-video-upscaler`                             |                                                                     not among the largest 14-day page click losers, but 90-day low-hanging query `topaz video ai vs alternatives 2026` has 374 impressions / 0 clicks / pos 8.2 | Refreshed 2026-07-03.                                                              | Current GSC does not measure the fresh Topaz title/intro update.                                                                | `defer-with-deadline` to 2026-07-20.                                                                |

## Changes Correlated

- 2026-07-03 CTR/ranking lift pass updated `/blog/fixing-pixelated-photos`, `/blog/best-ai-upscaler`, and `/blog/topaz-video-upscaler`; current GSC should not be used to judge those edits yet.
- 2026-06-29 description test on `/blog/best-free-ai-image-upscaler-2026-tested-compared` remains inside the measurement guardrail and still needs manual indexing.
- Older unchecked indexing backlog items remain a blocker for interpreting several refreshed posts, especially 2026-05-26 and 2026-06-05 blog URLs.

## Escalations

| URL                                                      | Trigger                                                                                                                       | Deadline   | Required next action                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Current exact-query rows remain 0-click at positions 4.5-7.9 after a 2026-06-29 description test, but indexing is still open. | 2026-07-15 | If exact rows remain 300+ impressions, positions 3-10, and 0 clicks after indexing, test a new SEO title angle.          |
| `/blog/fixing-pixelated-photos`                          | Current 14-day `how to fix pixelated photos` row: 11,775 impressions / 0 clicks / pos 10.7; 2026-07-03 edit not measurable.   | 2026-07-20 | If clicks remain near zero and position stays 8-15, run a focused title/intro/body proof edit.                           |
| `/blog/best-ai-upscaler`                                 | Clicks 4 → 2 and position 11.3 → 17.7; 2026-07-03 websites-comparison update not measurable.                                  | 2026-07-20 | If position remains worse than 15 or high-intent website queries stay 0-click, run a title/meta + comparison-proof edit. |
| `/blog/topaz-video-upscaler`                             | 90-day `topaz video ai vs alternatives 2026` remains zero-click at position 8.2; 2026-07-03 update not measurable.            | 2026-07-20 | If near-zero clicks persist after the post-change window, edit around pricing/version/alternatives proof.                |

## Edit Briefs

None applied this run. All edit-now-looking rows are blocked by either fresh 2026-07-03 edits, the 2026-06-29 guardrail, pending manual indexing, or metrics below the skill's hard edit thresholds.

## Fixes Applied

None. No blog API PATCH, publish, redirect, sitemap, metadata, or content changes were made.

## Open Actions

User attention required: indexing backlog has 30 unchecked URLs. Request indexing for the newly changed 2026-07-03 blog URLs plus the still-open 2026-06-29, 2026-06-21, 2026-06-05, and 2026-05-26 blog items before treating post-refresh GSC results as final.

## Next Run

Run again after 2026-07-15 for the best-free-upscaler title-test decision, and after 2026-07-20 for the 2026-07-03 pixelated/best-ai-upscaler/Topaz changes. Next run must escalate instead of monitoring again if those rows still meet the stated thresholds.
