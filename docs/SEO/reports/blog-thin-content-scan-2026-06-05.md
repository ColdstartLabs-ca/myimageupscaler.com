# Blog Thin Content Scan - 2026-06-05

## Data Window

- GSC export: `2026-03-05 -> 2026-06-02` current 90-day window, compared with `2025-12-05 -> 2026-03-04`.
- GA4 organic export: `2026-03-07 -> 2026-06-04` current 90-day window, compared with `2025-12-07 -> 2026-03-06`.
- Blog SEO audit: 160 published posts, 107 with GSC data, 84 CTR-below-benchmark flags, 9 intent mismatch flags, 62 low keyword-overlap flags.
- Data caveat: GSC still shows impressions for some URLs that production now redirects. Those rows are treated as migration/indexing lag, not edit targets.

## Summary

No clean `P1 refresh now` thin-content target emerged. The highest-volume posts are mostly recent May refreshes or known CTR experiments still inside the measurement window. The useful targets are `P2` content/CTA refreshes and consolidation follow-ups where GSC demand exists, GA engagement is weak, or the page is broad enough to dilute intent.

| Priority | URL                                                | Score | Evidence                                                                                                                                                            | Diagnosis                                                                                                                                                                                            | Action                                                                                                          |
| -------- | -------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| P2       | `/blog/poster-size-dimensions-pixels`              |   6.0 | 778 GSC impressions, 2 clicks, 0.26% CTR, avg pos 9.2; 112 GA organic sessions, 32.1% engagement, 0 conversions                                                     | Search demand exists for `24x36 in pixels`, `dpi for 24x36 poster`, and `24x36 in pixels 300 dpi`, but the page behaves like a generic chart and does not pull users into the print/upscale workflow | Refresh around 24x36/300 DPI calculator intent and add a stronger print-readiness CTA                           |
| P2       | `/blog/best-image-upscaler`                        |   6.0 | 5,683 impressions, 15 clicks, 0.26% CTR, avg pos 16.0; 40 GA sessions, 57.5% engagement, 0 conversions                                                              | Broad "best image upscaler" page overlaps the canonical best-free-upscaler cluster and has weak conversion behavior                                                                                  | Retarget as a support/comparison page or consolidate internal links toward the canonical 2026 comparison        |
| P2       | `/blog/what-resolution-for-print`                  |   5.0 | 499 impressions, 0 clicks, avg pos 9.7; 25 GA sessions, 16% engagement, 84% bounce                                                                                  | Strong user-intent clue around `recommended dpi for 8x10 photo print`, but title is long and the page likely under-serves quick chart/calculator intent                                              | Refresh as a concise 8x10 + common print-size DPI answer with a calculator-style first screen                   |
| P2       | `/blog/best-free-ai-photo-enhancer-online`         |   4.5 | 5,125 impressions, 56 clicks, avg pos 33.7; 114 GA sessions, 42.1% engagement, 0 conversions                                                                        | Not a CTR problem, but engagement and conversion are weak for a page getting real organic traffic                                                                                                    | Add sharper enhancer-specific proof, comparison modules, and CTA alignment to `/tools/ai-photo-enhancer`        |
| P2       | `/blog/how-to-upscale-midjourney-images-for-print` |   4.5 | 1,849 impressions, 5 clicks, 0.27% CTR, avg pos 7.5; audit flags long title and low query overlap                                                                   | Query cluster shifted toward `midjourney maximum image resolution upscale 2026`, but the title/snippet emphasize print workflow generally                                                            | Add a "maximum Midjourney resolution in 2026" answer block and tighten title/meta around max-resolution + print |
| P2       | `/blog/photoshop-upscaler-vs-ai-tools`             |   4.0 | 1,417 impressions, 0 clicks, avg pos 10.2; top queries include `adobe photoshop super resolution vs ai upscale comparison` and `does photoshop have an ai upscaler` | Good comparison intent, but zero clicks at striking distance suggests the SERP promise is not exact enough                                                                                           | Refresh title/meta and add a clear Photoshop Super Resolution vs AI upscaler comparison section                 |
| P3       | `/blog/how-to-upscale-youtube-thumbnails`          |   3.5 | 3,380 impressions, 37 clicks, 1.09% CTR, avg pos 7.3; 28 GA sessions, 60.7% engagement, 0 conversions                                                               | Ranking and CTR are not terrible, but the query cluster is about blurry/low-quality YouTube thumbnails rather than generic upscaling                                                                 | Minor title/meta adjustment and add low-quality-thumbnail troubleshooting                                       |

## Edit Briefs

### `/blog/poster-size-dimensions-pixels`

- Target cluster: `24x36 in pixels`, `dpi for 24x36 poster`, `poster size pixels`, `how many pixels is 24x36 inches`, `24x36 in pixels 300 dpi`.
- Diagnosis: high GA traffic for a low-engagement informational page. It likely answers the chart query but does not give enough task-specific help for users preparing real print files.
- Suggested SEO title: `24x36 Poster Pixels: 300 DPI Size Chart`
- Suggested meta: `Find 24x36 poster pixels at 150, 200, and 300 DPI, plus common poster sizes and when to upscale before printing.`
- Add/strengthen:
  - First-screen answer table for 24x36 at 150/200/300 DPI.
  - "Do I need to upscale?" decision rule by source image dimensions.
  - Internal link to `/blog/upscale-image-for-print-300-dpi-guide`.
  - CTA to the upscaler when the user's file is below the target pixel dimensions.

### `/blog/best-image-upscaler`

- Target cluster: `image upscaler`, `best image upscaler`, `best image upscaling software`, `most popular image upscaling tools`.
- Diagnosis: broad comparison intent overlaps the stronger `/blog/best-free-ai-image-upscaler-2026-tested-compared` page. This page should either have a distinct "software/professional tools" angle or become a support page that links users to the canonical comparison.
- Suggested SEO title: `Best Image Upscaler Tools: Free vs Pro`
- Suggested meta: `Compare free and pro image upscaler tools for photos, art, and print. See when to use browser tools, Photoshop, or dedicated AI software.`
- Add/strengthen:
  - Clear distinction from the canonical "best free AI image upscaler 2026" article.
  - A short "free online vs desktop/pro software" matrix.
  - One-way support links to the canonical comparison using exact anchors where natural.
  - Remove or soften sections that duplicate the canonical best-free ranking.

### `/blog/what-resolution-for-print`

- Target cluster: `recommended dpi for 8x10 photo print`, 8x10 print resolution, print-size chart.
- Diagnosis: the page is ranking at position 9.7 but has 0 clicks and very weak GA engagement. Users likely need a fast numeric answer, not a long explanation first.
- Suggested SEO title: `8x10 Print Resolution: DPI and Pixels`
- Suggested meta: `Recommended DPI and pixel sizes for 8x10 photos, plus a quick chart for common print sizes and when to upscale.`
- Add/strengthen:
  - Above-fold answer: `8x10 at 300 DPI = 2400 x 3000 pixels`.
  - Quick chart for 4x6, 5x7, 8x10, 11x14, 16x20, 24x36.
  - "If your image is smaller than this" upscaling CTA.
  - Link to the 300 DPI guide and poster-size chart.

### `/blog/best-free-ai-photo-enhancer-online`

- Target cluster: `photo enhancer free`, `ai image enhancer free`, `ai photo enhancer free`, `photo enhancer online free`, `best free ai photo enhancer 2026`.
- Diagnosis: this page has real organic sessions but low engagement and no conversions. GSC position is too low for a title-only fix; the page needs stronger proof and tool alignment.
- Suggested SEO title: keep close to current unless content changes support a sharper promise.
- Suggested meta: `Compare free AI photo enhancers for sharpening, restoring, and improving image quality online. See limits, results, and no-watermark options.`
- Add/strengthen:
  - Before/after examples for sharpen, restore, face/detail, and low-light use cases.
  - "Enhancer vs upscaler vs sharpener" clarification to prevent intent drift.
  - CTA to `/tools/ai-photo-enhancer`, not generic homepage/tool CTAs.
  - Internal links from sharpener/no-watermark pages only where the enhancer angle is explicit.

### `/blog/how-to-upscale-midjourney-images-for-print`

- Target cluster: `midjourney maximum image resolution upscale 2026`, `midjourney upscale`, `midjourney maximum resolution 2026`.
- Diagnosis: the current page is relevant, but the snippet does not front-load the "maximum resolution" question now appearing in GSC.
- Suggested SEO title: `Midjourney Max Resolution and Print Upscaling`
- Suggested meta: `Check Midjourney image size limits, when to upscale for print, and how to prepare 4K or 8K AI art without artifacts.`
- Add/strengthen:
  - Above-fold answer for current Midjourney output dimensions and print limits.
  - Small table mapping Midjourney output sizes to print sizes at 150/300 DPI.
  - Artifact warnings for 4x/8x print enlargement.
  - CTA to print/upscale workflow after the dimension table.

### `/blog/photoshop-upscaler-vs-ai-tools`

- Target cluster: `adobe photoshop super resolution vs ai upscale comparison`, `does photoshop have an ai upscaler`, `photoshop ai upscale`.
- Diagnosis: zero clicks at avg pos 10.2 means the page is close enough to fix, and the query wording is very specific.
- Suggested SEO title: `Photoshop Super Resolution vs AI Upscaler`
- Suggested meta: `Compare Photoshop Super Resolution with AI upscalers for JPEG, RAW, and web images. See quality, speed, and when each wins.`
- Add/strengthen:
  - Direct answer: yes, Photoshop has Super Resolution; explain what it does and does not do.
  - Test matrix for RAW, JPEG, product photo, and AI art.
  - Clear "use Photoshop when..." vs "use AI upscaler when..." section.
  - Internal links to the tool and best-upscaler comparison.

## Redirected Or Recent Pages To Avoid Editing Now

These rows appear in GSC but should not be treated as thin-content targets:

- `/blog/photo-enhancement-upscaling-vs-quality` returns `308` to `/blog/ai-image-upscaling-vs-sharpening-explained`.
- `/blog/upscale-image-online-free` returns `308` to `/blog/free-ai-upscaler-no-watermark`.
- `/blog/ai-vs-traditional-image-upscaling` returns `308` to `/blog/ai-image-upscaling-vs-sharpening-explained`.
- `/blog/best-free-ai-image-upscaler-2026-tested-compared`, `/blog/free-ai-upscaler-no-watermark`, `/blog/best-ai-image-quality-enhancer-free`, `/blog/upscale-image-for-print-300-dpi-guide`, `/blog/best-ai-upscaler`, `/blog/photoshop-upscale-image`, `/blog/topaz-denoise-ai`, `/blog/topaz-video-upscaler`, and `/blog/sharpen-a-video` were recently changed or are in the 2026-05-26 indexing backlog. Recheck after enough complete GSC days and after manual indexing follow-up.

## Open Actions

- Complete the 10 unchecked URLs in `docs/SEO/maintenance/gsc-request-indexing-backlog.md`; some current GSC weakness may be indexing lag.
- Start with two refreshes: `/blog/poster-size-dimensions-pixels` and `/blog/what-resolution-for-print`. They show the clearest thin-content/user-engagement pattern and are not currently blocked by recent edit guardrails.
- Then decide whether `/blog/best-image-upscaler` should be a distinct pro/software comparison or a support page for the canonical best-free-upscaler article.
