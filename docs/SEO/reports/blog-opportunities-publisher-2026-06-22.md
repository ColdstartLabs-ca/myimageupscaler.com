# Blog Opportunities Publisher - 2026-06-22

Data:

- GSC: 2026-03-22 to 2026-06-19, 90-day query+page fetch via `.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs` (`/tmp/gsc-opportunities-2026-06-22.json`)
- Files checked: `docs/SEO/long-tail-keyword-roadmap.md`, `docs/SEO/blog-content-tracking/topics-covered.md`, `docs/seo/blog-content-gaps-2026-04.md`, `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, recent `docs/SEO/reports/*.md`

## Selected Topics

| Keyword | Evidence                                                          | Slug | Why publish                                                                                                         |
| ------- | ----------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| None    | No candidate passed the anti-cannibalization and freshness gates. | —    | Publishing another post would duplicate existing canonical coverage or steal support from recently refreshed pages. |

## No-Publish Decision

No new blog post was published. The strongest GSC opportunities are already owned by existing blog/tool pages, and several of those pages were refreshed on 2026-06-20 or 2026-06-21, which is newer than the latest complete GSC date (2026-06-19). The right action is to let indexing/GSC catch up and request indexing for the open backlog URLs, not create near-duplicate posts.

## Rejected or Deferred

| Keyword                                                        | Reason                                                                                                                                                                                  | Better action                                                                                                                                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `how to fix pixelated photos`                                  | 48,055 impressions / 0 clicks / avg position 11.1; existing canonical `/blog/fixing-pixelated-photos` owns the intent and was changed again on 2026-06-21, outside the GSC data window. | Defer with deadline: on 2026-07-08, if position remains 8-15 and clicks remain near zero, run a narrow `blog-edit` CTR/first-screen refresh for the pixelated-photo cluster.                       |
| `best free ai image upscaler 2026` variants                    | Multiple high-impression zero-click variants, but canonical coverage already exists at `/blog/best-free-ai-image-upscaler-2026-tested-compared` and related no-watermark support page.  | Do not publish duplicate comparison content. Recheck after 14 complete GSC days from the 2026-06-07 metadata/content refresh; if exact-match query CTR remains 0%, prepare a SERP title/meta test. |
| `what is the difference between ai upscaling and sharpening`   | 1,137 impressions / 0 clicks / avg position 4.9; already covered by `/blog/ai-image-upscaling-vs-sharpening-explained`.                                                                 | Refresh existing page only if zero-click status persists after the next monitor window.                                                                                                            |
| `image upscaler 8x`, `16x upscaler`, `image upscaler 16x free` | Existing tool/support ownership: `/tools/ai-image-upscaler`, `/scale/upscale-16x`, and published blog `/blog/16x-upscaling-does-it-work`.                                               | Internal-link/support-page tuning, not a new post.                                                                                                                                                 |
| `topaz video ai vs alternatives 2026`                          | Existing post `/blog/topaz-video-upscaler`; page was refreshed on 2026-06-20, before GSC can measure it.                                                                                | Defer to 2026-07-07; if still 0-click at positions 5-10, run `blog-edit` for the Topaz alternatives/update cluster.                                                                                |
| `adobe express image upscaler`                                 | Existing pSEO page `/alternatives/vs-adobe-express` is the better canonical destination.                                                                                                | Keep as pSEO/support opportunity; do not create a blog duplicate.                                                                                                                                  |

## Maintenance Handoffs

| Existing URL                                             | Trigger                                                                                                              | Action                                                                                                   | Deadline   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| `/blog/fixing-pixelated-photos`                          | 48,055 impressions, 0 clicks, avg position 11.1 for `how to fix pixelated photos`; refreshed 2026-06-21.             | Defer with deadline; possible title/meta/above-fold CTR refresh after GSC lag.                           | 2026-07-08 |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Exact-match variants still show 0 clicks in high-volume rows, but page-level clicks improved in current 14-day data. | Recheck exact-query CTR after full post-refresh window before another metadata test.                     | 2026-06-25 |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       | 1,137 impressions, 0 clicks, avg position 4.9 on exact explanatory query.                                            | Prepare `blog-edit` only if next 14-day monitor still shows 300+ impressions, pos 3-10, and zero clicks. | 2026-06-25 |
| `/blog/topaz-video-upscaler`                             | 364 impressions, 0 clicks, avg position 8.2 for Topaz alternatives query; refreshed 2026-06-20.                      | Defer until GSC includes post-refresh data.                                                              | 2026-07-07 |

## Published

| Slug | Target keyword | Verification          |
| ---- | -------------- | --------------------- |
| None | —              | No publish performed. |

## Open Actions

User attention required: indexing backlog has 25 unchecked URLs. Oldest pending unchecked item is `https://myimageupscaler.com/blog/how-to-upscale-images-for-instagram` from the 2026-06-21 Trending Down CTR Recovery section.

## Next Run

Run again after 2026-06-25 for best-free-upscaler and AI-upscaling-vs-sharpening exact-query CTR; do not judge 2026-06-20/2026-06-21 refreshed pages until at least 2026-07-07 to 2026-07-08.
