# Blog Quality Monitor - 2026-05-18

Data:

- GSC source: Search Console API, `sc-domain:myimageupscaler.com`
- Freshness: latest complete date is 2026-05-15; GSC data after that is still incomplete
- Default monitor comparison from fetcher: 2026-04-18 to 2026-05-15 vs 2026-03-21 to 2026-04-17
- Blog filter: URL paths matching `/blog/`
- Backlog/change files checked: `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, `docs/SEO/reports/blog-performance-recovery-2026-05-15.md`, `docs/SEO/reports/blog-opportunities-publisher-2026-05-15.md`, `docs/SEO/reports/3-kings-skill-run-2026-05-14.md`

## Blog URLs Losing Visibility

| URL                                                      |                                                GSC change | Recent change correlation                                                                                 | Likely cause                                                                                        | Action                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------: | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Impr. 27,860 -> 17,729; clicks 8 -> 22; pos. 7.43 -> 8.01 | Refreshed 2026-05-06 and 2026-05-12; GSC only partially reflects May 12                                   | Impression loss with click/CTR improvement; still near-zero CTR on major best-free-upscaler queries | Do not rewrite again before post-refresh data settles; request indexing and monitor        |
| `/blog/free-ai-upscaler-no-watermark`                    |    Impr. 4,469 -> 1,935; clicks 4 -> 5; pos. 5.53 -> 8.89 | Refreshed 2026-05-06; overlaps canonical best-free/no-signup cluster                                      | Position loss plus supporting/canonical intent overlap                                              | Keep as supporting page; strengthen links to canonical comparison if next run remains weak |
| `/blog/best-image-upscaling-tools-2026`                  |                           Impr. 2,004 -> 0; clicks 0 -> 0 | April consolidation redirects this duplicate to canonical comparison                                      | Expected consolidation drop                                                                         | No recovery action; redirect verified as `308` to canonical                                |
| `/blog/best-ai-image-quality-enhancer-free`              |   Impr. 4,658 -> 3,097; clicks 6 -> 4; pos. 9.56 -> 10.42 | Refreshed 2026-05-06; current leading queries are sharpener/unblur modifiers                              | Mild rank and impression decline after refresh; query intent may be drifting toward sharpener       | Monitor one more run; consider narrow sharpener/unblur edit only if trend persists         |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       |    Impr. 2,898 -> 1,861; clicks 0 -> 1; pos. 3.67 -> 4.64 | Refreshed 2026-05-06; residual old URL overlap remains                                                    | Strong rank but very low CTR; residual cannibalization and SERP/snippet issue                       | Request indexing/recheck before further edits                                              |
| `/blog/best-free-ai-image-upscaler-tools-2026`           |      Impr. 1,333 -> 360; clicks 7 -> 0; pos. 8.63 -> 8.95 | April consolidation intended canonicalization to `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Expected duplicate decay plus residual indexing                                                     | No edit; redirect verified as `308` to canonical                                           |
| `/blog/photo-enhancement-upscaling-vs-quality`           |    Impr. 3,081 -> 2,175; clicks 1 -> 0; pos. 6.99 -> 6.82 | April consolidation redirects this URL to `/blog/ai-image-upscaling-vs-sharpening-explained`              | Residual indexed impressions for old URL                                                            | No edit; redirect verified as `308` to canonical explainer                                 |
| `/blog/upscale-image-online-free`                        |        Impr. 946 -> 236; clicks 3 -> 0; pos. 6.36 -> 6.61 | Production redirects this old intent to `/blog/free-ai-upscaler-no-watermark`                             | Expected old-URL residual impressions                                                               | No edit; redirect verified as `308` to no-watermark post                                   |
| `/blog/upscale-image-for-print-300-dpi-guide`            |   Impr. 3,076 -> 2,737; clicks 4 -> 10; pos. 9.25 -> 7.48 | Refreshed 2026-05-06                                                                                      | Healthy click and rank improvement despite fewer impressions                                        | No edit needed                                                                             |

## Changes Correlated

- 2026-04-06: duplicate/cannibalizing blog posts were unpublished and redirected; drops for old listicle URLs remain expected.
- 2026-05-06: Batch 1 Three Kings refresh touched the top affected pages and created the GSC indexing backlog.
- 2026-05-12: `16x-upscaling-does-it-work` was published and the canonical best-free-upscaler post was refreshed.
- 2026-05-14: Three Kings refresh updated `/blog/best-ai-upscaler`, `/blog/topaz-video-upscaler`, and `/blog/how-to-upscale-anime-images-with-ai`; these now show meaningful impressions but CTR is still low while crawl data settles.

## Cannibalization Still Visible

Current-window query overlap:

- `what is the difference between ai upscaling and sharpening`: canonical explainer has 414 impressions at position 5.3; redirected `/blog/photo-enhancement-upscaling-vs-quality` still has 82 impressions at position 9.9.
- `ai image upscaling vs sharpening explained`: canonical explainer has 185 impressions at position 2.3; redirected old URL still has 130 impressions at position 8.5.
- `best free ai image upscaler 2026`: canonical comparison has 1,840 impressions at position 9.0; minor residual impressions appear on `/blog/best-ai-image-quality-enhancer-free` and `/blog/best-image-upscaler`.
- `best free ai image upscaler tools 2026`: canonical comparison has 218 impressions at position 10.7; retired listicle still has 21 impressions at position 8.9.

## Positive Signals

- `/blog/best-free-ai-image-upscaler-2026-tested-compared`: clicks improved 8 -> 22 despite lower impressions.
- `/blog/upscale-image-for-print-300-dpi-guide`: clicks improved 4 -> 10 and average position improved 9.25 -> 7.48.
- `/blog/topaz-video-upscaler`: 3,336 impressions and 2 clicks after the May 14 work; CTR remains low at 0.06%.
- `/blog/how-to-upscale-anime-images-with-ai`: 1,703 impressions after refresh, but CTR remains 0%.
- `/blog/how-to-upscale-youtube-thumbnails`: 715 impressions and 6 clicks, comparatively stronger 0.84% CTR.

## Edit Briefs

No immediate `blog-edit` handoff was applied because the top affected pages either were recently refreshed, intentionally consolidated, or improved clicks/rank despite lower impressions.

### Edit Brief: `/blog/best-ai-image-quality-enhancer-free`

Evidence:

- GSC: 4,658 -> 3,097 impressions, clicks 6 -> 4, position 9.56 -> 10.42.
- Recent change correlation: refreshed 2026-05-06; top current queries are sharpener/unblur variants such as `best free ai image sharpener online 2026`.

Target query:

- `best free ai image sharpener online 2026`

Update:

- SEO title/meta/H1/first paragraph: keep current refreshed framing until more post-refresh data lands.
- Internal links: if decline persists, add/verify links from related blurry-photo/enhancer posts using sharpener/unblur anchors.
- Content additions: consider a compact sharpener vs enhancer explanation only if the next run confirms persistent weakness.

### Edit Brief: `/blog/free-ai-upscaler-no-watermark`

Evidence:

- GSC: 4,469 -> 1,935 impressions, clicks 4 -> 5, position 5.53 -> 8.89.
- Recent change correlation: refreshed 2026-05-06; overlaps canonical best-free comparison.

Target query:

- `free ai upscaler no watermark`

Update:

- SEO title/meta/H1/first paragraph: keep current no-watermark/no-signup framing until fresh data after indexing.
- Internal links: if weakness persists, add/verify contextual link to `/blog/best-free-ai-image-upscaler-2026-tested-compared` as canonical comparison.
- Content additions: none this run.

## Fixes Applied

- No Supabase blog content edits were applied during this monitor run.
- No `blog-edit` handoff was invoked.
- Redirect checks verified retired URLs still return `308` to their canonical destinations.
- This report was saved for correlation with the next monitoring run.

## Open Actions

1. Manually request indexing for unchecked URLs in `docs/SEO/maintenance/gsc-request-indexing-backlog.md`; the file still lists four pending URLs and notes the May 14 quota stop.
2. Recheck the canonical best-free-upscaler, sharpener/enhancer, and upscaling-vs-sharpening clusters after GSC has a fuller post-May-12/post-May-14 window.
3. Keep watching whether retired/cannibalizing URLs continue to receive impressions after redirects and indexing requests.

## Next Run

Recommended next check: 2026-05-21.
