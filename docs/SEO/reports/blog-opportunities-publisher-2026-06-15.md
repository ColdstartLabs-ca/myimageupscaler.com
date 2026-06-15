# Blog Opportunities Publisher - 2026-06-15

Data:

- GSC: 2026-03-15 to 2026-06-12, Search Console web query+page data from `/tmp/gsc-opportunities-2026-06-15.json`.
- Files checked: `docs/SEO/long-tail-keyword-roadmap.md`, `docs/SEO/blog-content-tracking/topics-covered.md`, `docs/seo/blog-content-gaps-2026-04.md`, `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, recent `docs/SEO/reports/*.md`.

## Selected Topics

| Keyword | Evidence                                           | Slug | Why publish                                                                                                                                  |
| ------- | -------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| None    | No candidate passed the anti-cannibalization gate. | —    | Strongest opportunities already map to canonical blog/tool/pSEO URLs, and several canonical pages were edited too recently for GSC to judge. |

## No-Publish Decision

Publishing nothing is the right action. The high-impression rows are not fresh content gaps; they are existing canonical pages with CTR, indexing, or recent-refresh follow-up needs. A new post would likely cannibalize the same clusters.

## Rejected or Deferred

| Keyword                                                      | Reason                                                                                                                                                                                                                                                   | Better action                                                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `how to fix pixelated photos`                                | Existing canonical post owns the intent: `/blog/fixing-pixelated-photos`. 90d: 16,112 impressions, 0 clicks, avg pos 10.95. It was refreshed on 2026-06-07 and GSC only runs through 2026-06-12.                                                         | Defer until at least 2026-06-17 first read / 2026-06-24 fuller read; request indexing remains the priority.      |
| `best free ai image upscaler 2026` and variants              | Existing canonical post owns the intent: `/blog/best-free-ai-image-upscaler-2026-tested-compared`. 90d exact row: 13,537 impressions, 0 clicks, avg pos 7.21; current 14d exact row: 1,433 impressions, 0 clicks, avg pos 4.15.                          | Do not publish a duplicate. Recheck after the 2026-06-07 title/meta test has 10-14 complete GSC days.            |
| `what is the difference between ai upscaling and sharpening` | Existing canonical post owns the intent: `/blog/ai-image-upscaling-vs-sharpening-explained`. 90d: 1,116 impressions, 0 clicks, avg pos 4.99. Current 14d dropped below the persistent 300-impression threshold: 153 impressions, 0 clicks, avg pos 3.79. | Keep as CTR-watch, not publish. Act only if the next run returns to 300+ impressions, pos 3-10, and 0 clicks.    |
| `topaz video ai vs alternatives 2026`                        | Existing `/blog/topaz-video-upscaler` owns the cluster. 90d: 335 impressions, 0 clicks, avg pos 8.07; page was refreshed on 2026-06-07.                                                                                                                  | Defer due GSC lag; no alternatives post unless the refreshed page remains zero-click after 14 complete GSC days. |
| `easiest way to make image background transparent 2026`      | Existing `/blog/how-to-make-png-background-transparent-free` ranks for the row. 90d: 310 impressions, 0 clicks, avg pos 9.00.                                                                                                                            | Potential future blog-edit/CTA refresh candidate, not a new post.                                                |
| `image upscaler 16x free` / `image upscaler 8x`              | Tool/scale pages already own these transactional scale intents and earn clicks.                                                                                                                                                                          | Support with internal links if needed; do not create a duplicate blog post.                                      |

## Maintenance Handoffs

| Existing URL                                             | Trigger                                                                                                                                    | Action                                                                                                                               | Deadline              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Current 14d exact row remains 1,433 impressions, 0 clicks, avg pos 4.15, but the 2026-06-07 title/meta test only has partial GSC coverage. | Defer-with-deadline; prepare a narrow SERP-intent/title/meta brief if the zero-click condition persists after enough post-test data. | 2026-06-24 full read. |
| `/blog/fixing-pixelated-photos`                          | 90d zero-click at high impressions; refreshed 2026-06-07 and pending manual indexing.                                                      | Manual GSC request indexing first; no duplicate content.                                                                             | 2026-06-24+.          |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       | Strong 90d position but current 14d visible query volume fell below the edit threshold.                                                    | Recheck query volume and CTR next run.                                                                                               | Next monitor.         |
| `/blog/how-to-make-png-background-transparent-free`      | 310 impressions, 0 clicks, avg pos 9 for transparent-background 2026 query.                                                                | Candidate for future blog-edit if it repeats at 300+ impressions, pos 3-10, zero clicks.                                             | Next monitor.         |

## Published

| Slug | Target keyword | Verification               |
| ---- | -------------- | -------------------------- |
| None | —              | No publish batch selected. |

## Open Actions

User attention required: indexing backlog has 29 unchecked URLs. Oldest pending section is 2026-05-26. Manual GSC request-indexing should be cleared before stacking more blog edits onto the same URLs.

## Next Run

Run again after 2026-06-24 for a fuller read of the 2026-06-07 edits. Act, rather than monitor, if `/blog/best-free-ai-image-upscaler-2026-tested-compared` still has 300+ exact/near-exact impressions, avg position 3-10, and zero clicks after the title/meta test is fully represented.
