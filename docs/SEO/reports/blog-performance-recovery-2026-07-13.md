# Blog Quality Monitor - 2026-07-13

Data:

- GSC: previous 2026-06-13 to 2026-06-26 → current 2026-06-27 to 2026-07-10, 14-day blog-only page/query windows, latest complete date 2026-07-10 (`/tmp/gsc-blog-monitor-14d-2026-07-13.json`)
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, recent `docs/SEO/reports/*.md`
- Measurement note: 2026-07-03 blog edits now have only a partial early window, and 2026-07-10 edits are not measurable. GSC lag is still material.

## Blog URLs Losing Visibility

| URL                                                      |                                                                                                                                            GSC change | Recent change correlation                                                                                                 | Likely cause                                                                                                                    | Action                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/blog/mejorar-calidad-imagen-ia-gratis`                 |                                                                               clicks 11 → 1; impressions 212 → 51; pos 26.7 → 24.7; CTR 5.19% → 1.96% | No direct content edit found in recent checked backlogs; 2026-07-10 indexing backlog marks it requested.                  | Spanish query volatility with lower impressions; not an edit-now threshold.                                                     | `defer-with-deadline`; recheck next run if clicks remain ≤1 and position stays worse than 20.                    |
| `/blog/how-to-upscale-youtube-thumbnails`                |                                                                                 clicks 9 → 2; impressions 429 → 861; pos 6.9 → 7.3; CTR 2.10% → 0.23% | Refreshed 2026-06-05; indexing marked requested for 2026-06-21 follow-up.                                                 | CTR loss despite stable page-one position; query rows are spread across low-volume variants.                                    | `defer-with-deadline`; if next run remains <0.5% CTR with 800+ impressions, prepare a title/meta edit brief.     |
| `/blog/poster-size-dimensions-pixels`                    |                                                                            clicks 2 → 0; impressions 2,471 → 2,242; pos 10.4 → 8.8; CTR 0.08% → 0.00% | Refreshed 2026-06-05; indexing remains unchecked.                                                                         | Page is improving in position but failing to earn clicks. Top queries are near page one but individually below 300 impressions. | `indexing-follow-up`; request indexing, then escalate if zero-click repeats next run.                            |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | exact current rows: `best free ai image upscaler 2026` 1,035 impressions / 0 clicks / pos 5.8; `best ai image upscaling tools 2026` 524 / 0 / pos 6.0 | Narrow description refresh on 2026-06-29; indexing remains open; prior report set 2026-07-15 as title-test decision date. | Persistent exact-query CTR problem, but still two days before the stated guardrail date and manual indexing is pending.         | `defer-with-deadline` to 2026-07-15; next action is a title test if still zero-click.                            |
| `/blog/topaz-labs-free-trial`                            |    persistent zero-click fragment rows for `topaz photo ai free`: 605 impressions / 0 clicks / pos 9.2; canonical page row has 13 clicks over 90 days | Refreshed 2026-07-10 per growth plan.                                                                                     | Update is inside GSC lag; do not rewrite yet.                                                                                   | `defer-with-deadline`; recheck after 2026-07-24.                                                                 |
| `/blog/photo-restoration-software`                       |                clicks 0 → 0; impressions 218 → 92; pos 22.2 → 33.0; critical position regression by threshold, but current impressions fell below 100 | No recent direct edit found.                                                                                              | Ranking loss on a low-current-impression page; current-window impression volume is below the action threshold.                  | `defer-with-deadline`; if next run has 100+ current impressions and position remains 30+, prepare an edit brief. |
| `/blog/best-free-ai-photo-enhancer-online`               |                                                                             clicks 5 → 4; impressions 823 → 1,377; pos 48.0 → 40.1; CTR 0.61% → 0.29% | 2026-06-21 refresh and 2026-07-10 growth plan says wait until on/after 2026-07-19 for a proper after-window comparison.   | More impressions with weak ranking; not a page-one CTR emergency yet.                                                           | `defer-with-deadline`; run the planned 2026-07-19+ comparison before editing.                                    |

## Changes Correlated

- 2026-07-03 CTR/ranking lift pass updated `/blog/fixing-pixelated-photos`, `/blog/best-ai-upscaler`, and `/blog/topaz-video-upscaler`; early data exists, but the stronger check remains after 2026-07-20.
- 2026-07-10 growth plan refreshed `/blog/topaz-labs-free-trial`, `/blog/topaz-video-upscaler`, `/blog/topaz-denoise-ai`, `/blog/best-ai-image-enhancer`, and `/blog/pixelcut-ai-photo-editor`; current GSC cannot judge those edits yet.
- Manual GSC request-indexing backlog still has 25 unchecked URLs, including several blog URLs used in this monitor.

## Escalations

| URL                                                      | Trigger                                                                                                                      | Deadline   | Required next action                                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Persistent exact-query rows remain 0-click at positions 4-8 after a 2026-06-29 description test, but indexing is still open. | 2026-07-15 | If exact rows remain 300+ impressions, positions 3-10, and 0 clicks, run a narrow SEO title test.       |
| `/blog/fixing-pixelated-photos`                          | 90-day query `how to fix pixelated photos`: 67,698 impressions / 0 clicks / pos 3.0; 2026-07-03 edit only partly measurable. | 2026-07-20 | If clicks remain near zero and position stays 3-10, run a title/meta/proof edit.                        |
| `/blog/poster-size-dimensions-pixels`                    | Current window: 2,242 impressions / 0 clicks / pos 8.8.                                                                      | 2026-07-20 | If zero-click repeats after indexing, prepare a SERP title/meta edit brief for the poster-size cluster. |
| `/blog/how-to-upscale-youtube-thumbnails`                | CTR fell 2.10% → 0.23% while impressions doubled and position stayed page one.                                               | 2026-07-20 | If CTR remains <0.5% with 800+ impressions, prepare a query-led title/meta edit brief.                  |
| `/blog/topaz-labs-free-trial`                            | 2026-07-10 refresh targets `topaz photo ai free` / `topaz free trial`; current data predates measurable effect.              | 2026-07-24 | If high-impression rows remain zero-click at positions 8-10, refresh title/meta/internal proof only.    |

## Edit Briefs

None applied this run. Rows that look actionable are blocked by fresh edits, pending indexing, below-threshold current impressions, or previously stated guardrail dates.

## Fixes Applied

None. No blog API PATCH, publish, redirect, sitemap, metadata, or content changes were made.

## Open Actions

User attention required: indexing backlog has 25 unchecked URLs. Request indexing for outstanding blog URLs before treating post-refresh GSC results as final.

## Next Run

Run again after 2026-07-15 for the best-free-upscaler title-test decision, after 2026-07-20 for the 2026-07-03 refreshes plus poster/YouTube CTR leaks, and after 2026-07-24 for Topaz free-trial post-refresh performance. Next run must escalate instead of monitoring again if those rows still meet the stated thresholds.
