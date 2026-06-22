# Blog Quality Monitor - 2026-06-22

Data:

- GSC: previous 2026-05-23 to 2026-06-05 → current 2026-06-06 to 2026-06-19, 14-day windows, latest complete date 2026-06-19 (`/tmp/gsc-blog-monitor-14d-2026-06-22.json`)
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, recent `docs/SEO/reports/*.md`
- Production spot checks: key loser URLs returned `200`, self-canonical, `index, follow`.

## Blog URLs Losing Visibility

| URL                                                      |                                                                      GSC change | Recent change correlation                                                                  | Likely cause                                                                                                          | Action                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | clicks 192 → 317; impressions 26,044 → 17,594; pos 5.6 → 6.0; CTR 0.74% → 1.80% | Metadata/content refresh on 2026-06-07; page-level CTR improved despite lower impressions. | Demand/query mix shifted; exact-match variants still leak zero-click traffic.                                         | `defer-with-deadline` to 2026-06-25 for exact-query CTR test.                            |
| `/blog/best-image-upscaler`                              |    clicks 28 → 2; impressions 4,193 → 2,132; pos 14.2 → 11.8; CTR 0.67% → 0.09% | Refreshed 2026-06-05 as free-vs-pro support comparison.                                    | SERP CTR/intent mismatch, but not a critical position regression; page is inside 14+ day measurement window only now. | `defer-with-deadline` to next run; edit if clicks remain ≤2 and CTR <0.2%.               |
| `/blog/best-free-ai-photo-enhancer-online`               |      clicks 23 → 6; impressions 2,340 → 894; pos 36.8 → 37.5; CTR 0.98% → 0.67% | Updated on 2026-06-21; current GSC does not include the change.                            | Pre-refresh ranking weakness; current data is stale relative to latest edit.                                          | `defer-with-deadline` to 2026-07-08.                                                     |
| `/blog/best-ai-upscaler`                                 |      clicks 5 → 4; impressions 3,849 → 2,455; pos 9.8 → 11.3; CTR 0.13% → 0.16% | CTA pass on 2026-06-21; previous content refreshes in May/June.                            | Low CTR but no severe new ranking collapse.                                                                           | Monitor; request indexing remains open in backlog.                                       |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       |         clicks 4 → 1; impressions 1,150 → 382; pos 6.3 → 5.7; CTR 0.35% → 0.26% | Last major metadata pass 2026-05-24/05-06.                                                 | SERP demand fell; rankings improved slightly.                                                                         | `defer-with-deadline` to 2026-06-25 for persistent zero-click exact-query rule.          |
| `/blog/photoshop-upscale-image`                          |                    clicks 1 → 0; impressions 677 → 0; pos 9.2 → no current rows | Production check: `200`, self-canonical, indexable. Edited 2026-05-26.                     | Possible query volatility or GSC sampling/dropout; no technical blocker found in spot check.                          | `defer-with-deadline`; if still zero impressions next run, run technical/indexing audit. |
| `/blog/noise-reduction-in-images`                        |                             clicks 0 → 0; impressions 555 → 29; pos 16.7 → 10.7 | No recent high-priority change found in checked changelogs.                                | Demand/query mix shift; improved ranking but low volume.                                                              | Monitor; below edit-now threshold.                                                       |
| `/blog/how-to-upscale-anime-images-with-ai`              |      clicks 10 → 4; impressions 1,604 → 1,135; pos 6.9 → 7.8; CTR 0.62% → 0.35% | Metadata pass on 2026-05-24; prior refreshes.                                              | Mild rank/CTR slippage, not severe.                                                                                   | Monitor; no same-day edit.                                                               |
| `/blog/upscale-image-for-print-300-dpi-guide`            |     clicks 12 → 11; impressions 1,747 → 1,375; pos 7.5 → 7.7; CTR 0.69% → 0.80% | Refreshed 2026-05-26.                                                                      | Impression loss with stable clicks/CTR.                                                                               | No edit.                                                                                 |

## Changes Correlated

- 2026-06-21 Trending Down CTR Recovery and body CTA changes are newer than the latest complete GSC date (2026-06-19), so those pages cannot be judged yet.
- 2026-06-20 `/blog/video-upscaling-software` refresh is also not measurable yet.
- 2026-06-07 best-free-upscaler refresh is close to measurable; page-level CTR improved, but exact high-intent query rows remain weak.

## Escalations

| URL                                                      | Trigger                                                                                                                                          | Deadline   | Required next action                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Exact-query rows such as `best free ai image upscaler 2026` remain 0-click at positions ~3-5, but page-level CTR improved.                       | 2026-06-25 | If exact-query CTR is still 0% with 300+ impressions at positions 3-10, prepare a narrow SEO title/meta test.                                 |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       | `what is the difference between ai upscaling and sharpening` has 1,137 impressions / 0 clicks / avg position 4.9 in the 90-day opportunity data. | 2026-06-25 | If the next 14-day monitor still has 300+ impressions, pos 3-10, and zero clicks, run `blog-edit` for SERP title/meta and first answer block. |
| `/blog/photoshop-upscale-image`                          | 677 previous impressions dropped to 0 current impressions while production is indexable.                                                         | 2026-06-25 | If still zero impressions, run technical/indexing audit before content edits.                                                                 |
| `/blog/fixing-pixelated-photos`                          | Massive visibility growth (3,620 → 45,632 impressions) but only 2 current clicks; changed 2026-06-21 after the GSC window.                       | 2026-07-08 | If position remains 8-15 and clicks stay near zero, run a focused CTR/body-intro edit.                                                        |
| `/blog/topaz-video-upscaler`                             | 5,656 impressions / 2 clicks / avg position 9.7 current; refreshed 2026-06-20 after GSC window.                                                  | 2026-07-07 | If zero/near-zero clicks persist after the post-refresh window, edit around Topaz alternatives/update intent.                                 |

## Edit Briefs

None applied in this run. Deferrals are justified because the strongest candidates are inside GSC lag from 2026-06-20/2026-06-21 edits, show improved page-level CTR despite exact-query leaks, or do not meet the critical position regression threshold.

## Fixes Applied

No content, metadata, redirect, sitemap, or indexing-backlog changes were applied. Reports were saved only.

## Open Actions

User attention required: indexing backlog has 25 unchecked URLs. Oldest pending unchecked item is `https://myimageupscaler.com/blog/how-to-upscale-images-for-instagram` from the 2026-06-21 Trending Down CTR Recovery section.

## Next Run

Next monitor should run after 2026-06-25. It must escalate—not just monitor—if `/blog/best-free-ai-image-upscaler-2026-tested-compared` or `/blog/ai-image-upscaling-vs-sharpening-explained` still have 300+ impressions, positions 3-10, and zero exact-query clicks. Pages changed on 2026-06-20/2026-06-21 should not be judged until 2026-07-07 to 2026-07-08.
