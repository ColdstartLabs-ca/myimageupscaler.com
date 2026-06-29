# Blog Quality Monitor - 2026-06-29

Data:

- GSC: previous 2026-05-30 to 2026-06-12 → current 2026-06-13 to 2026-06-26, 14-day windows, latest complete date 2026-06-26 (`/tmp/gsc-blog-monitor-14d-2026-06-29.json`)
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, recent `docs/SEO/reports/*.md`
- Verification: blog API PATCH/GET succeeded for the one applied fix; production page HTML rendered the new meta description.

## Blog URLs Losing Visibility

| URL                                                      |                                                                      GSC change | Recent change correlation                                                                     | Likely cause                                                                                                                 | Action                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------: | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | clicks 217 → 468; impressions 23,128 → 18,928; pos 5.8 → 6.3; CTR 0.94% → 2.47% | Major refresh on 2026-06-07. Page-level CTR improved, but exact-query rows remain zero-click. | SERP snippet mismatch on exact `best free ai image upscaler 2026` variants despite stronger page-level performance.          | `edit-now`: applied narrow SEO description refresh.                                  |
| `/blog/best-image-upscaler`                              |    clicks 25 → 2; impressions 4,244 → 2,316; pos 11.2 → 11.6; CTR 0.59% → 0.09% | Refreshed 2026-06-05.                                                                         | CTR/intent weakness, but not a critical position regression.                                                                 | `defer-with-deadline`; edit next run if clicks remain ≤2 and CTR <0.2%.              |
| `/blog/fix-blurry-photos-ai-methods-guide`               |            clicks 3 → 0; impressions 1,150 → 338; pos 8.0 → 9.3; CTR 0.26% → 0% | Edited 2026-05-26; still in request-indexing backlog.                                         | Impression loss and zero clicks, but current impressions are below the 300+ persistent query/page threshold after filtering. | `indexing-follow-up`; request indexing remains required.                             |
| `/blog/best-free-ai-photo-enhancer-online`               |    clicks 13 → 9; impressions 1,653 → 1,014; pos 27.9 → 41.7; CTR 0.79% → 0.89% | Updated 2026-06-21; current GSC only partly includes post-change data.                        | Pre/post-change window is mixed; rankings remain weak.                                                                       | `defer-with-deadline` to 2026-07-08.                                                 |
| `/blog/best-ai-upscaler`                                 |     clicks 3 → 3; impressions 2,436 → 1,759; pos 11.2 → 13.5; CTR 0.12% → 0.17% | CTA pass 2026-06-21; request indexing still open.                                             | Low CTR and mild rank loss, but no severe collapse.                                                                          | `indexing-follow-up`; no content edit.                                               |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       |           clicks 4 → 1; impressions 860 → 439; pos 5.8 → 6.1; CTR 0.47% → 0.23% | Last major metadata pass 2026-05-24/05-06.                                                    | Exact query remains zero-click, but current 14-day exact row is 123 impressions, below edit-now threshold.                   | `defer-with-deadline`; recheck next run.                                             |
| `/blog/topaz-video-upscaler`                             |      clicks 1 → 3; impressions 6,232 → 5,943; pos 9.0 → 10.1; CTR 0.02% → 0.05% | Refreshed 2026-06-20.                                                                         | Low CTR, but post-refresh data is not fully mature.                                                                          | `defer-with-deadline` to 2026-07-07.                                                 |
| `/blog/poster-size-dimensions-pixels`                    |                       current 14-day page CTR 0.15%, 9,488 impressions, pos 7.5 | Refreshed 2026-06-05.                                                                         | Persistent SERP CTR weakness on poster-size rows.                                                                            | Monitor one more run; edit if CTR remains <0.2% after indexing request is completed. |

## Changes Correlated

- 2026-06-20 and 2026-06-21 blog changes are still inside the 14 complete GSC-day guardrail; do not judge those pages until 2026-07-07/08.
- 2026-06-07 best-free-upscaler refresh is now measurable. Page-level CTR improved materially, but exact high-intent query rows remained zero-click, so a narrow description-only edit was justified.

## Escalations

| URL                                                      | Trigger                                                                                                                                                                       | Deadline   | Required next action                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Current 14-day rows: `best free ai image upscaler 2026` 1,316 impressions / 0 clicks / pos 5.0 and `best ai image upscaling tools 2026` 458 impressions / 0 clicks / pos 5.9. | 2026-07-15 | If exact rows remain 300+ impressions, positions 3-10, and 0 clicks after indexing, test a new SEO title angle. |
| `/blog/best-image-upscaler`                              | Clicks 25 → 2 and CTR 0.59% → 0.09% after 2026-06-05 refresh.                                                                                                                 | 2026-07-08 | If clicks remain ≤2 and CTR <0.2%, prepare a title/meta + first-screen intent brief.                            |
| `/blog/fixing-pixelated-photos`                          | 90-day `how to fix pixelated photos` row remains huge and zero-click; page changed 2026-06-21.                                                                                | 2026-07-08 | If position remains 8-15 and clicks stay near zero, run focused CTR/body-intro edit.                            |
| `/blog/topaz-video-upscaler`                             | 5,943 impressions / 3 clicks / 0.05% CTR in current 14-day window; page changed 2026-06-20.                                                                                   | 2026-07-07 | If near-zero clicks persist after post-refresh window, edit around Topaz update/pricing/alternatives intent.    |

## Edit Briefs

## Edit Brief: /blog/best-free-ai-image-upscaler-2026-tested-compared

Evidence:

- GSC: current 14-day exact rows stayed at 0 clicks despite page-one positions: `best free ai image upscaler 2026` 1,316 impressions at pos 5.0; `best free ai image upscaler online 2026` 574 impressions at pos 3.8; `best ai image upscaling tools 2026` 458 impressions at pos 5.9.
- Recent change correlation: 2026-06-07 refresh improved page-level CTR from 0.94% to 2.47%, so the safe move was description-only, not a title rewrite.

Target query:

- `best free ai image upscaler 2026`

Update:

- SEO title: unchanged, already front-loads the target query.
- Meta description: `Best free AI image upscaler 2026: we tested 12 tools for quality, speed, no signup, no watermark, and 4K/8K output. See winners and try free.`
- H1/title: unchanged.
- First paragraph: unchanged.
- Internal links: unchanged.
- Content additions: none.

## Fixes Applied

- Updated `/blog/best-free-ai-image-upscaler-2026-tested-compared` `description` and `seo_description` through the blog API.
- Added the URL to the GSC request-indexing backlog under the 2026-06-29 monitor section.

## Open Actions

User attention required: indexing backlog has 30 unchecked URLs after this run. Request indexing for the newly changed `https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared` plus the older unchecked 2026-05-26, 2026-06-05, 2026-06-21, and localized-homepage items.

## Next Run

Next monitor should run after 2026-07-08 for pages changed on 2026-06-20/21. For `/blog/best-free-ai-image-upscaler-2026-tested-compared`, use 2026-07-15 as the action date: if exact-query CTR is still 0% at positions 3-10 with 300+ impressions after indexing, escalate to a title test.
