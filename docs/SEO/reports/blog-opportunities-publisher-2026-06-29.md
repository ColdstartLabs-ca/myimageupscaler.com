# Blog Opportunities Publisher - 2026-06-29

Data:

- GSC: 2026-03-29 to 2026-06-26, 90-day query+page fetch via `.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs` (`/tmp/gsc-opportunities-2026-06-29.json`)
- Files checked: `docs/SEO/long-tail-keyword-roadmap.md`, `docs/SEO/blog-content-tracking/topics-covered.md`, `docs/seo/blog-content-gaps-2026-04.md`, `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, recent `docs/SEO/reports/*.md`

## Selected Topics

| Keyword | Evidence                                           | Slug | Why publish                                                                                                                       |
| ------- | -------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| None    | No candidate passed the anti-cannibalization gate. | —    | The highest-evidence opportunities are already owned by existing blog/tool/pSEO URLs. Publishing another post would split intent. |

## No-Publish Decision

No new blog post was published. The strongest GSC rows are refresh/CTR opportunities for existing URLs, not net-new topics. The only candidate that crossed the persistent zero-click threshold was the canonical best-free-upscaler post, so the maintenance action was a narrow metadata refresh through `blog-edit`, not a new post.

## Rejected or Deferred

| Keyword                                                                   | Reason                                                                                                                                                               | Better action                                                                                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `best free ai image upscaler 2026` / `best ai image upscaling tools 2026` | Existing canonical `/blog/best-free-ai-image-upscaler-2026-tested-compared` owns the intent; 14-day exact-query rows still show 0 clicks at positions 3.8-5.9.       | Refresh existing SERP description, request indexing, then recheck after 14 complete GSC days.                                  |
| `how to fix pixelated photos`                                             | 58,843 impressions / 0 clicks / avg position 11.0 over 90 days, but canonical `/blog/fixing-pixelated-photos` was changed on 2026-06-21 and is still inside GSC lag. | Defer with deadline: on 2026-07-08, if position remains 8-15 and clicks remain near zero, run a focused CTR/first-screen edit. |
| `what is the difference between ai upscaling and sharpening`              | Existing canonical `/blog/ai-image-upscaling-vs-sharpening-explained`; current 14-day row has 123 impressions, below the 300-impression edit-now threshold.          | Recheck next run; edit only if it returns to 300+ impressions at positions 3-10 with zero clicks.                              |
| `poster size in pixels`                                                   | Existing canonical `/blog/poster-size-dimensions-pixels`; current issue is CTR/page refinement, not distinct content intent.                                         | Monitor after 2026-06-05 refresh; consider metadata/body edit only if CTR stays below 0.2% after indexing.                     |
| `topaz video ai vs alternatives 2026`                                     | Existing `/blog/topaz-video-upscaler`; refreshed on 2026-06-20, and current query impressions fell to 38 in the 14-day window.                                       | Defer to 2026-07-07 post-refresh window.                                                                                       |
| `image upscaler 16x free`                                                 | Existing `/scale/upscale-16x` plus `/blog/16x-upscaling-does-it-work`; already gets clicks.                                                                          | Support existing pages; no new blog.                                                                                           |

## Maintenance Handoffs

| Existing URL                                             | Trigger                                                                                                                                                                                                | Action                                                     | Deadline   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Persistent 0-click exact-query rows: `best free ai image upscaler 2026` 1,316 impressions at pos 5.0 and `best ai image upscaling tools 2026` 458 impressions at pos 5.9 in the current 14-day window. | Applied narrow SERP description refresh; request indexing. | 2026-07-15 |
| `/blog/fixing-pixelated-photos`                          | 90-day `how to fix pixelated photos` row: 58,843 impressions, 0 clicks, avg position 11.0; changed 2026-06-21.                                                                                         | Defer until GSC includes 14 complete post-change days.     | 2026-07-08 |
| `/blog/topaz-video-upscaler`                             | 5,943 impressions, 3 clicks, 0.05% CTR in current 14-day page data; changed 2026-06-20.                                                                                                                | Defer until GSC includes 14 complete post-change days.     | 2026-07-07 |

## Published

| Slug | Target keyword | Verification          |
| ---- | -------------- | --------------------- |
| None | —              | No publish performed. |

## Open Actions

User attention required: indexing backlog has 30 unchecked URLs after this run. First unchecked section is `2026-06-29 Localized Homepage Metadata Fallback Fix`; older still-open blog sections include 2026-05-26 and 2026-06-05 items.

## Next Run

Recheck after 2026-07-08 for pages changed on 2026-06-20/21. For `/blog/best-free-ai-image-upscaler-2026-tested-compared`, next action date is 2026-07-15: if exact-query rows remain 300+ impressions, positions 3-10, and zero clicks after indexing, test a title angle rather than another description-only edit.
