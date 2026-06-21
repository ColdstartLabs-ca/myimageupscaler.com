# Blog Thin Content Scan - 2026-06-20

## Data Windows

- GSC export: `2026-03-20 -> 2026-06-17` current 90-day window, compared with `2025-12-20 -> 2026-03-19`.
- GA4 organic export: `2026-03-22 -> 2026-06-19` current 90-day window, compared with `2025-12-22 -> 2026-03-21`.
- Blog SEO audit: 175 published posts, 107 with GSC data, 83 CTR-below-benchmark flags, 7 intent-mismatch flags, 64 low keyword-overlap flags.
- Fresh artifacts: `/tmp/gsc-miu-blog-thin-2026-06-20.json`, `/tmp/blog-audit-miu-2026-06-20.json`, `/tmp/ga-miu-blog-thin-2026-06-20.json`.

## Summary

Most high-impression blog weaknesses are still blocked by recent-edit or indexing-lag guardrails. The June 5 thin-content refresh URLs are still unchecked in `docs/SEO/maintenance/gsc-request-indexing-backlog.md`, and the June 7 Three Kings URLs are also still waiting for manual GSC request-indexing / recrawl. Those should not be rewritten again from the same lagging data.

One clean actionable target emerged: `/blog/video-upscaling-software`. It had meaningful GSC demand, no recent-change or indexing-backlog blocker, a clear SERP intent mismatch, and zero organic GA sessions/clicks from the current query cluster.

## Prioritized Findings

| Priority | URL | Evidence | Guardrail | Decision |
| --- | --- | --- | --- | --- |
| P1 | `/blog/video-upscaling-software` | 1,989 GSC impressions, 0 clicks, 0.00% CTR, avg position 13.6. Top visible queries: `best video upscaling software 2026`, `video upscaling software`, `4k video upscaling software options`. GA organic sessions: 0. | Not in recent changelog/backlog; not in GSC request-indexing backlog. | Edited now: title/meta + above-fold comparison intent. |
| Guarded | `/blog/fixing-pixelated-photos` | 36,613 impressions, 3 clicks, avg position 11.4. | Refreshed 2026-06-07; indexing request still pending. | No edit. Wait for recrawl + 14 complete GSC days. |
| Guarded | `/blog/poster-size-dimensions-pixels` | 8,730 impressions, 10 clicks, 132 GA sessions, 33.3% engagement. | Refreshed 2026-06-05; still in request-indexing backlog. | No edit. |
| Guarded | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | 6,555 impressions, 0 clicks, avg position 4.2, but GA converts well. | Recent 2026-06-07 CTR test and indexing backlog. | No edit. |
| Watch | `/blog/how-to-upscale-dalle-images` | 906 impressions, 3 clicks, avg position 5.5, 2 GA sessions with 0 engaged sessions. | No recent blocker, but visible query data is too sparse/anonymized to define a clean content gap. | Watchlist, no edit today. |
| Watch | `/blog/ai-frame-interpolation` | 1,656 impressions, 7 clicks, avg position 9.7, 6 GA sessions, 33.3% engagement. | No recent blocker, but video/AI topic is broader and lower confidence than the selected fix. | Watchlist. |

## Actions Taken

Edited `/blog/video-upscaling-software` via the local blog API.

Changes:

- Changed public title to `Best Video Upscaling Software 2026: AI, Free & Pro Options`.
- Changed SEO title to `Best Video Upscaling Software 2026: AI, Free & Pro`.
- Changed meta description to focus on video upscaling software, 4K/8K output, old footage, YouTube clips, and pro restoration.
- Reworked the first screen from a generic explanation into a direct best-software answer.
- Added an above-fold use-case matrix for old footage, clean YouTube footage, short test clips, and pro/ad clips.
- Added a contextual internal link to `/blog/topaz-video-upscaler` to support the Topaz-specific comparison path without duplicating that page's intent.

## Verification

- Blog API `PATCH /api/blog/posts/video-upscaling-software` returned `200`.
- Blog API `GET /api/blog/posts/video-upscaling-software` returned `200` and verified updated title, SEO title, meta description, quick-answer copy, comparison table, internal link, and updated timestamp `2026-06-21T04:01:14.342623+00:00`.
- Local frontend route `GET /blog/video-upscaling-software` returned `200` and rendered the new title/meta/quick-answer content.
- Re-ran blog SEO audit against the fresh GSC export. The historical CTR flag remains, as expected, but `video-upscaling-software` no longer has title-length or keyword-overlap issues in the audit.

## Follow-ups

- Manually request indexing in GSC for `https://myimageupscaler.com/blog/video-upscaling-software`.
- Complete the still-open GSC request-indexing backlog for June 5 and June 7 pages before rewriting those URLs again.
- Recheck `/blog/video-upscaling-software` after 14-28 complete GSC days.
