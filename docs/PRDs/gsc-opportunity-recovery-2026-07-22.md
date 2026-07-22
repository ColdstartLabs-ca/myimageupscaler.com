# PRD: GSC SEO Recovery — July 2026

**Status:** Implemented — awaiting complete 28-day GSC evaluation  
**Date:** 2026-07-22

Implementation completed on 2026-07-22. Production was backed up and verified at `backups/backup_2026-07-22_14-35-17.schema.sql.gz` and `backups/backup_2026-07-22_14-35-17.data.sql.gz` before the blog API updates. Run the first complete 14-day comparison on or after 2026-08-05 and the 28-day success-criteria evaluation on or after 2026-08-19. Manual request-indexing items remain open until confirmed in GSC.

## Context

GSC is growing overall, but a few pages are losing rankings or wasting page-one impressions.

Current 28 days: 2026-06-22 through 2026-07-19.  
Previous 28 days: 2026-05-25 through 2026-06-21.

| Metric | Previous | Current |
| --- | ---: | ---: |
| Clicks | 4,060 | 9,119 |
| Impressions | 255,783 | 304,681 |
| CTR | 1.59% | 2.99% |

The homepage, the best-free-upscaler comparison, and the GIF format page produced most of the growth. Protect them and focus recovery work on the pages below.

## Goal

Increase organic clicks by fixing clear ranking and CTR problems without creating overlapping content or repeatedly editing pages that were just refreshed.

## Work to Do Now

### 1. Recover the text-image article

URL: `/blog/text-image-enhancer`

Why:

- Impressions fell from 661 to 182.
- Average position fell from 11.21 to 24.98.
- Clicks fell from 7 to 1.

Update:

- Target `how to improve image clarity and text readability in photos`.
- SEO title: `Improve Image Clarity & Make Text Readable [2026]`
- H1: `How to Improve Image Clarity and Text Readability`
- Rewrite the opening to answer the query immediately.
- Add a short table covering blur, low contrast, compression, skew, and insufficient resolution.
- Separate advice for human readability from OCR preparation.
- Link naturally to `/tools/ai-photo-enhancer`.
- Keep the URL and canonical unchanged.

### 2. Improve the poster-page snippet

URL: `/blog/poster-size-dimensions-pixels`

Why:

- 17,690 impressions at position 6.62.
- Only 44 clicks and 0.25% CTR.

Update:

- SEO title: `24×36 Poster Size in Pixels: 150–300 DPI Chart`
- Meta description: `See exact 24×36 poster dimensions at 150, 200, and 300 DPI, plus minimum resolution, file setup, and when to upscale before printing.`
- Keep the body unchanged unless the DPI answer table is buried below the introduction. If it is, move it near the top.

### 3. Clarify page ownership

Do not create new pages for these topics.

| Query intent | Primary page | Supporting page behavior |
| --- | --- | --- |
| GIF upscaler | `/formats/upscale-gif-images` | `/blog/gif-upscaler` links to the format page |
| Best free AI upscaler | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Other upscaler comparisons link to it when relevant |
| Spanish image improvement | `/es` for commercial intent | Spanish blog remains an informational guide |
| AI photo enhancer tool | `/tools/ai-photo-enhancer` | Blog pages compare or explain; they link to the tool |
| No-signup photo enhancer research | `/blog/free-photo-enhancer-no-signup` | Keep distinct from the broad comparison |
| Broad enhancer comparison | `/blog/best-free-ai-photo-enhancer-online` | Improve content depth; do not try to solve position 40 with another title tweak |

### 4. Expand the existing restoration comparison

URL: `/blog/photo-restoration-program`

Why:

- 4,301 impressions and zero clicks.
- Position improved from 30.87 to 18.89.
- Existing queries include `best AI photo restoration tools 2026` and close variants.

Update:

- Add a concise comparison table covering restoration tasks, limits, pricing model, privacy, and best use case.
- Distinguish face restoration, scratch repair, colorization, and general enhancement.
- Include real testing evidence before claiming tools were tested.
- Do not publish another restoration listicle.

## Leave These Alone for Now

These pages were edited recently. Recheck them after enough complete GSC data exists.

| Recheck date | URL | What to review |
| --- | --- | --- |
| 2026-07-27 | `/blog/topaz-denoise-ai` | Ranking and clicks after the July 10 update |
| 2026-07-27 | `/blog/best-ai-image-enhancer` | Ranking after the July 10 update |
| 2026-07-31 | `/blog/best-image-upscaler` | CTR after the July 14 update |
| 2026-07-31 | `/blog/how-to-upscale-youtube-thumbnails` | CTR after the July 14 update |
| 2026-08-04 | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Exact-query CTR after the July 20 title update |
| 2026-08-04 | `/blog/fixing-pixelated-photos` | CTR and ranking after the July 3 update |

Do not edit AVIF or 2K pages based on the current small decline. Both still have healthy rankings and CTR.

## Indexing Cleanup

- Deduplicate the GSC request-indexing backlog without marking unfinished work complete.
- Manually request indexing for the homepage, changed localized homepages, the best-free-upscaler comparison, best-image-upscaler, YouTube-thumbnail article, and poster page.
- Only mark an item complete after someone confirms the request was made in GSC.

## Implementation Rules

Before changing any production blog record:

1. Run `yarn db:backup`.
2. Confirm the new schema and data archives with `yarn db:backups`.
3. Run `gzip -t` on both archives.
4. Stop if backup verification fails.

For every SEO change:

1. Update only the required fields through the blog API.
2. Add or update a test in `tests/unit/seo/`.
3. Run the affected tests and `yarn verify`.
4. Verify production returns `200`, `index, follow`, the correct canonical, and the new metadata.
5. Update the SEO changes backlog and the existing request-indexing row.
6. Recheck GSC after 14 and 28 complete days.

All copy must reflect the real product policy: signup is required and new accounts receive five one-time welcome credits.

## Success Criteria

- `/blog/text-image-enhancer` returns to the top 15 or recovers at least 400 impressions and 7 clicks in a complete 28-day window.
- `/blog/poster-size-dimensions-pixels` reaches at least 1% CTR without losing its page-one ranking.
- `/blog/photo-restoration-program` reaches position 12 or better and earns non-branded clicks.
- Each important query cluster has one clear primary page.
- No new indexing, canonical, redirect, or sitemap regression is introduced.
- No duplicate article is published for the covered topics.

## Out of Scope

- New blog posts.
- URL migrations or redirects.
- Sitemap or canonical changes without new technical evidence.
- Reworking pages whose recent SEO updates have not reached their recheck date.

Move this PRD to `docs/PRDs/done/` after the implemented changes have a complete 28-day GSC evaluation.
