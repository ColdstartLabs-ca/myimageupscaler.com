# Blog Opportunities Publisher - 2026-05-12

Data:

- GSC: 2026-02-12 to 2026-05-09, Search Console API, `sc-domain:myimageupscaler.com`
- Rows: 7,903 query/page rows
- Files checked: `.claude/skills/blog-publish/SKILL.md`, `.claude/skills/blog-changelog.md`, `docs/SEO/long-tail-keyword-roadmap.md`, `docs/SEO/blog-content-tracking/topics-covered.md`, `docs/seo/blog-content-gaps-2026-04.md`, `docs/SEO/maintenance/seo-changes-backlog.md`, `docs/SEO/reports/*.md`

## Selected Topics

| Keyword         | Evidence                                                                                                                                     | Slug                         | Why publish                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `16x upscaling` | 312 impressions and 36 clicks across 90 days for 16x queries; main landing page is `/scale/upscale-16x`; no dedicated blog guide in tracking | `16x-upscaling-does-it-work` | Distinct scale-specific informational intent that supports an existing tool page without duplicating an existing blog post |

## Published

| Slug                         | Target keyword                                       | Verification                                                                           |
| ---------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `16x-upscaling-does-it-work` | `16x upscaling`, `image upscaler 16x`, `upscale 16x` | API status `published`; local page returned `200`; featured image uploaded to Supabase |

## Candidate: 16x upscaling

Evidence:

- GSC: 312 impressions, 36 clicks, average position 16.4 across 16x-related queries.
- Main query examples: `image upscaler 16x`, `16x upscaler`, `upscale 16x`, `photo upscaler 16x`, `16x image upscaler`.
- Current landing page: mostly `/scale/upscale-16x`.
- Backlog/roadmap: Priority 4 scale-specific roadmap listed `upscale 16x` with the blog angle `Extreme upscaling: when 16x makes sense`.
- Existing coverage check: no dedicated `16x` blog entry in `topics-covered.md`.

Decision:

- Publish.

Anti-cannibalization:

- Existing matching URLs: `/scale/upscale-16x`.
- Verdict: passes.
- Reason: the scale page is a tool/landing page; the new post answers informational questions about when 16x works and links users to the tool.

Publish brief:

- Slug: `16x-upscaling-does-it-work`
- Title angle: `16x Upscaling: Does It Actually Work?`
- Search intent: practical guide for users deciding whether 16x is useful or too extreme.
- Internal links: `/scale/upscale-16x`, `/scale/upscale-8x`, `/scale/ai-upscaler-4x`, `/tools/ai-image-upscaler`
- Category/tags: Guides; `16x upscaling`, `AI upscaler`, `image enlargement`, `image quality`, `guides`
- CTA route: `/scale/upscale-16x`

## Rejected or Deferred

| Keyword                                      | Reason                                                                                                                                                     | Better action                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `best free ai image upscaler 2026`           | Existing canonical post already owns this intent; 10,583 impressions and zero clicks indicate CTR/snippet and reindexing work, not a new post              | Continue refresh/reindex path for `/blog/best-free-ai-image-upscaler-2026-tested-compared`          |
| `ai image upscaling vs sharpening explained` | Existing explainer and older enhancement post still overlap; publishing another post would worsen cannibalization                                          | Keep `/blog/ai-image-upscaling-vs-sharpening-explained` as primary and fix redirects/internal links |
| `best free ai image sharpener online 2026`   | Existing `/blog/best-ai-image-quality-enhancer-free` is the intended target and was recently refreshed                                                     | Recheck after indexing; add sharpener/unblur comparison module only if needed                       |
| `free photo restoration services`            | Already published on 2026-04-25 as `best-free-photo-restoration-services-online`                                                                           | Monitor and improve existing post/tool path                                                         |
| `jpg to pdf`                                 | Large query cluster but avg position ~76 and outside the image-upscaling blog focus; tool-page SEO/pSEO support may be better than another blog post today | Defer to converter content plan                                                                     |
| `gif to jpg`                                 | Similar converter cluster, avg position ~72; low rankability as a blog post in this run                                                                    | Defer to converter content plan                                                                     |
| `adobe super resolution vs competitors 2026` | Existing `best-image-upscaling-tools-2026`, `best-ai-upscaler`, and `photoshop-upscaler-vs-ai-tools` already cover adjacent intent                         | Refresh existing comparison posts; avoid a fourth overlapping comparison                            |

## Image Handling

- Reusable featured images were checked first.
- A new featured image was generated via Replicate because the blog API enforces unique featured images per post.
- Existing inline images were reused for workflow and comparison visuals.

## Next Run

Recommended next check: 2026-05-19.

Recheck:

- Whether `16x-upscaling-does-it-work` is indexed and starts receiving impressions.
- Whether 16x queries shift from `/scale/upscale-16x` only to a tool-plus-blog pair.
- Whether deferred converter topics should move into a separate non-upscaling content batch.
