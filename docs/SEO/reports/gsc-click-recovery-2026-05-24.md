# GSC Click Recovery: SERP CTR Metadata Pass

Date: 2026-05-24

## Data Pulled

- GSC 56-day export: `/tmp/gsc-miu-click-drop-56.json`
- GSC 28-day export: `/tmp/gsc-miu-click-drop-28.json`
- GSC 14-day export: `/tmp/gsc-miu-click-drop-14.json`
- GA4 56-day organic export: `/tmp/ga-miu-click-drop-56.json`
- SEO synthesis: `/tmp/seo-plan-miu-click-drop-56.json`
- Blog SEO audit: `/tmp/blog-audit-miu-click-drop-28.json`
- CTR baseline snapshot: `/tmp/ctr-baseline-2026-05-24.json`

## Diagnosis

This is primarily a SERP CTR problem concentrated in blog pages, not an indexation or product-page engagement problem.

Latest 14 complete GSC days, 2026-05-07 to 2026-05-20 vs 2026-04-23 to 2026-05-06:

| Metric | Current | Previous | Change |
|---|---:|---:|---:|
| Web clicks | 613 | 1,037 | -40.89% |
| Web impressions | 37,494 | 38,007 | -1.35% |
| Web CTR | 1.63% | 2.73% | -40.08% |
| Avg position | 14.59 | 10.17 | weaker by 4.42 |

The day-level break starts around 2026-05-11. Impressions stayed roughly 2.5k-3.3k/day, but CTR fell to about 1.0%-1.7% on most days.

Page-type split from the latest 14-day GSC export:

| Segment | Clicks | Impressions | CTR | Avg position |
|---|---:|---:|---:|---:|
| Blog | 157 | 32,392 | 0.48% | 14.6 |
| Tool/pSEO | 74 | 1,783 | 4.15% | 15.0 |
| Homepage | 361 | 2,207 | 16.36% | 11.7 |
| Locale homepages | 9 | 454 | 1.98% | 26.4 |
| Other | 14 | 2,602 | 0.54% | 10.0 |

GA4 cross-check for the 56-day window looked sane: GSC clicks to GA organic sessions ratio was 0.85. Organic sessions were up 172.97% vs the prior 56-day period, so the immediate acquisition problem is not a broken analytics tag.

## Highest CTR Deficits

| Page | 28-day clicks | 28-day impressions | CTR | Position | Main zero-click query pattern |
|---|---:|---:|---:|---:|---|
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | 43 | 16,082 | 0.27% | 8.1 | best free AI image upscaler 2026 |
| `/blog/best-ai-upscaler` | 1 | 3,834 | 0.03% | 9.1 | top AI image upscaler websites |
| `/blog/topaz-video-upscaler` | 3 | 3,608 | 0.08% | 8.5 | Topaz Video AI 2026 update |
| `/blog/free-ai-upscaler-no-watermark` | 5 | 2,432 | 0.21% | 8.5 | free AI image upscaler no watermark |
| `/blog/how-to-upscale-anime-images-with-ai` | 0 | 1,820 | 0.00% | 7.2 | best free AI image upscaler for anime |
| `/blog/ai-image-upscaling-vs-sharpening-explained` | 2 | 1,608 | 0.12% | 5.1 | difference between AI upscaling and sharpening |

## Changes Applied

Metadata-only production updates were applied through the blog API for five URLs. Existing body content was left intact because recent backlog entries show multiple May content refreshes already landed.

| URL | New SEO title |
|---|---|
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | `Best Free Image Upscaler 2026: 12 Real Tests` |
| `/blog/ai-image-upscaling-vs-sharpening-explained` | `AI Upscaling vs Sharpening: What Is the Difference?` |
| `/blog/best-ai-upscaler` | `Top AI Image Upscaler Websites 2026: 12 Compared` |
| `/blog/free-ai-upscaler-no-watermark` | `Free AI Image Upscaler No Watermark: No Signup Test` |
| `/blog/how-to-upscale-anime-images-with-ai` | `Best Free Anime Image Upscaler 2026: AI Tools Tested` |

## Validation

- Blog API PATCH succeeded for all five posts.
- Blog API verification confirmed updated `seo_title`, `seo_description`, and `updated_at` values.
- Public frontend URLs returned HTTP 200 for all five posts.
- CTR tracker baseline captured the five changed URLs at 55 clicks, 26,067 impressions, and 637 estimated missed clicks for 2026-04-24 to 2026-05-21.

## Follow-Up

1. Request indexing for the five changed URLs.
2. Re-run GSC CTR tracking after 2026-06-07, when 14 complete GSC days can reflect the metadata changes.
3. If CTR remains below 0.75% for the canonical best-free-upscaler page, stop doing small title tweaks and test a stronger SERP angle: direct product/tool landing page for the query cluster, not another informational listicle.
