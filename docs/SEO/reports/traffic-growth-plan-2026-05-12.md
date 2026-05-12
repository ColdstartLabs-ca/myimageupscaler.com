# Traffic Growth Plan: myimageupscaler.com

Generated: 2026-05-12 Pacific  
Primary data windows:

- GSC: 2026-02-11 to 2026-05-09, 90 days, `sc-domain:myimageupscaler.com`
- GA4: 2026-02-11 to 2026-05-11, 90 days, property `519826120`
- Content gap: 2026-02-09 to 2026-05-09, top 5 GSC pages

Skills and scripts used: `gsc-analysis`, `ga-analysis`, `seo-growth-plan`, `seo-content-3-kings-technique`, `content-gap`, `seo-audit`, `programmatic-seo`, `internal-linking-optimizer`, `ai-search-optimization`.

## Executive Summary

The growth bottleneck is not discovery. Google is already testing the site against large non-branded terms, especially comparison/listicle queries. The bottleneck is click capture, cannibalization, and conversion attribution.

GSC shows 5,042 clicks from 163,583 impressions across 3,873 queries and 357 pages. GA4 shows 5,735 organic sessions, so the GSC-to-GA ratio is healthy at 0.88. Organic has a strong engagement rate at 70.6%, but GA4 attributes 0 conversions to Organic Search while 27 conversions sit in `Unassigned`. That makes SEO ROI unreadable until attribution is fixed.

Highest-leverage action: fix the `best free AI image upscaler 2026` cluster. One page has 25,448 impressions and 6 clicks, and the exact query cluster has more than 10,000 impressions with 0 clicks. This is the fastest traffic win.

## Implementation Status

2026-05-12: Priority 1 attribution work started in code. GA4 now uses the shared event map for both browser and server analytics, and the SEO funnel milestones are included as GA4 conversion/key-event candidates: `image_uploaded`, `image_upscale_started`, `upscale_completed`, `signup_started`, `signup_completed`, `checkout_opened`, `checkout_started`, `checkout_completed`, and `purchase_confirmed`.

Remaining Priority 1 work is external to this code patch: confirm the matching GA4 key events in Admin, then verify Organic Search conversions move out of `Unassigned` after the next deploy and data collection window.

2026-05-12: Priority 6 sitemap policy decision implemented for the validator. English-only pSEO sitemaps now require only `en` and `x-default` hreflang entries during validation, using `ENGLISH_ONLY_CATEGORIES` as the source of truth instead of expecting all seven locales for every sitemap that contains hreflang.

2026-05-12: Priority 2 content refresh applied to the Supabase-backed `/blog/best-free-ai-image-upscaler-2026-tested-compared` post. Updates included the recommended first sentence, a short-answer block, expanded comparison table fields, FAQs for no signup/no watermark/online/4K/8K/denoiser/sharpener/deblurrer/enlarger modifiers, and refreshed metadata.

2026-05-12: Priority 8 metadata backlog applied through the Supabase blog API. `sample-article-title-for-testing` is now draft, and `ai-upscaler-muryou-osusume`, `old-damaged-photos`, `photo-noise-reduce`, `fixing-pixelated-photos`, `how-to-enlarge-photo-without-losing-quality`, and `free-photo-restoration-app` now have expanded SEO descriptions.

## Data Snapshot

| Source |                    Metric |   Value |
| ------ | ------------------------: | ------: |
| GSC    |                    Clicks |   5,042 |
| GSC    |               Impressions | 163,583 |
| GSC    |                  Site CTR |   3.08% |
| GSC    |              Avg position |    16.3 |
| GSC    |                   Queries |   3,873 |
| GSC    |                     Pages |     357 |
| GA4    |          Organic sessions |   5,735 |
| GA4    |   Organic engagement rate |   70.6% |
| GA4    |       Organic bounce rate |   29.4% |
| GA4    |       Organic conversions |       0 |
| GA4    |    Unassigned conversions |      27 |
| GA4    | Organic share of sessions |   26.6% |

## Priority 1: Fix Conversion Attribution

GA4 reports 27 total conversions, all under `Unassigned`, and 0 under Organic Search. Meanwhile organic users are clearly moving through high-intent pages:

| Landing page     | Organic sessions | Engagement rate | Conversions |
| ---------------- | ---------------: | --------------: | ----------: |
| `/`              |            3,120 |           79.7% |           0 |
| `/dashboard`     |            2,969 |           89.9% |           0 |
| `/auth/callback` |            1,836 |           99.9% |           0 |
| `/pricing`       |              122 |           82.8% |           0 |

Actions:

1. Preserve source/medium across auth and Stripe paths, especially `/auth/callback`, localized callback pages, dashboard entry, and checkout return paths.
2. Mark intermediate SEO key events, not just purchase: upload started, upload success, upscale completed, signup started, signup completed, checkout opened.
3. Add a report that joins first landing page, session source/medium, signup, checkout, and purchase.
4. Treat conversion recommendations from GA4 as directional until Organic Search conversions no longer read as zero.

## Priority 2: Capture The 2026 Best-Free-Upscaler Demand

This is the biggest traffic opportunity in the dataset.

| Page / query                                             | Impressions | Clicks |    CTR | Avg position |
| -------------------------------------------------------- | ----------: | -----: | -----: | -----------: |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` |      25,448 |      6 | 0.024% |          9.5 |
| `best free ai image upscaler 2026` cluster               |      10,583 |      0 |     0% |        mixed |
| `best free ai image upscaler online 2026`                |         952 |      0 |     0% |          6.6 |
| `best free image upscaler 2026`                          |         829 |      0 |     0% |          6.8 |
| `best free ai image upscaler tools 2026`                 |         598 |      0 |     0% |          9.4 |

Recommended Three Kings refresh:

- Title: `Best Free AI Image Upscaler 2026: 12 Tools Tested`
- H1: `Best Free AI Image Upscaler 2026: 12 Tools Tested`
- First sentence: `We tested the best free AI image upscaler tools in 2026 for no-signup use, watermark-free exports, 4K/8K output, and realistic image detail.`

Content modules to add:

- Comparison table columns: free limit, signup required, watermark, max output, best use case, result quality.
- Short answer block near the top: best free tool overall, best no-signup tool, best no-watermark tool, best for 8K.
- FAQ targeting the exact modifiers: no signup, no watermark, online, 4K, 8K, denoiser, sharpener, deblurrer, enlarger.
- Internal links from `/free`, `/tools/ai-image-upscaler`, `/blog/best-free-ai-image-upscaler-tools-2026`, `/blog/best-image-upscaling-tools-2026`, and `/blog/free-ai-upscaler-no-watermark`.

Do not publish another generic “best free AI upscaler” page. Consolidate the cluster instead.

## Priority 3: Resolve Cannibalization

GSC found 20 cannibalized query clusters. The major ones:

| Query                                        | Impressions | Clicks | Competing URLs | Action                                           |
| -------------------------------------------- | ----------: | -----: | -------------: | ------------------------------------------------ |
| `best free ai image upscaler 2026`           |      10,583 |      0 |              5 | Make one canonical winner; merge/retarget others |
| `ai image upscaling vs sharpening explained` |       1,569 |      0 |              2 | Make the explanation page primary                |
| `best free ai image upscaler online 2026`    |         952 |      0 |              3 | Support the canonical best-free page             |
| `best free image upscaler 2026`              |         829 |      0 |              5 | Same canonical cluster                           |
| `best free ai image upscaler no signup 2026` |         438 |      0 |              2 | Retarget no-signup page as supporting intent     |

Canonical decisions:

- Primary “best free AI image upscaler 2026”: `/blog/best-free-ai-image-upscaler-2026-tested-compared`
- Supporting “no signup / no watermark”: `/blog/free-ai-upscaler-no-watermark` or `/blog/free-upscaler-no-sign-up`, but not both for the same intent
- Primary “AI upscaling vs sharpening”: `/blog/ai-image-upscaling-vs-sharpening-explained`
- Retarget `/blog/photo-enhancement-upscaling-vs-quality` to broader enhancement quality, not the exact sharpening comparison

## Priority 4: Build Snippet-Ready AEO Blocks

Several pages are ranking in positions 1-10 with 0 clicks. That usually means the result appears but is not earning the click, or the SERP answer is being satisfied elsewhere.

Start with `/blog/ai-image-upscaling-vs-sharpening-explained`:

- Query `ai image upscaling vs sharpening explained`: 1,569 impressions, 0 clicks, avg position 4.2.
- Add a 45-word direct answer immediately after the intro.
- Add a two-column comparison table.
- Add FAQ schema for “Is AI upscaling the same as sharpening?”, “Does sharpening increase resolution?”, “Should I upscale or sharpen first?”
- Link prominently to `/tools/ai-image-upscaler` and `/tools/ai-photo-enhancer`.

## Priority 5: Use Internal Links To Push Existing Winners

Pages worth pushing because rankings exist and engagement is acceptable:

| Page                                                     | GSC impressions | Clicks | Current issue                                |
| -------------------------------------------------------- | --------------: | -----: | -------------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` |          25,448 |      6 | CTR and cannibalization                      |
| `/blog/best-ai-image-quality-enhancer-free`              |           2,749 |      4 | Position 19.9, weak query alignment          |
| `/tools/ai-image-upscaler`                               |           2,392 |     19 | Tool page under-clicked for brand/tool terms |
| `/pricing`                                               |           1,302 |      6 | Low CTR and attribution gap                  |
| `/blog/best-free-ai-image-upscaler-tools-2026`           |             466 |      3 | Supporting page competing with main page     |

Internal linking plan:

1. Add a “Try the AI image upscaler” CTA link above the fold in top blog posts.
2. Add contextual links to the canonical best-free comparison from all overlapping listicles.
3. Add a “Related free tools” block on `/tools/ai-image-upscaler`, `/free`, and comparison pages.
4. Use descriptive anchors: `best free AI image upscaler 2026`, `AI image upscaler tool`, `free AI upscaler no watermark`, `AI upscaling vs sharpening`.

## Priority 6: pSEO Quality And Sitemap Health

Live sitemap validation found 86 processed sitemaps and 1,835 URLs. Most localized pSEO sitemap groups passed, but the newer English-only groups failed hreflang expectations:

- Total sitemap structure issues: 649
- Hreflang issues: 648
- Structure issues: 1
- Affected sitemap groups include `sitemap-compare.xml`, `sitemap-platforms.xml`, `sitemap-content.xml`, `sitemap-photo-restoration.xml`, `sitemap-camera-raw.xml`, `sitemap-industry-insights.xml`, `sitemap-device-optimization.xml`, `sitemap-bulk-tools.xml`, `sitemap-ai-features.xml`, `sitemap-comparisons-expanded.xml`, `sitemap-personas-expanded.xml`, `sitemap-technical-guides.xml`, and `sitemap-use-cases-expanded.xml`.

Decision needed: either localize these page families and include all alternates, or mark them as English-only and adjust the validator/sitemap generation so Google does not receive incomplete hreflang sets.

GSC sitemap metadata reports `https://myimageupscaler.com/sitemap.xml` submitted 1,809 web URLs and 137 image URLs. The GSC API response showed 0 indexed in the sitemap summary, which may be an API limitation for sitemap index reporting, but it should be verified directly in Search Console because the site is receiving clicks from many URLs.

## Priority 7: Content Gap Findings

Top 5 page content-gap scan:

| Page                                                     | Impressions | Queries | Gap score | Potential clicks |
| -------------------------------------------------------- | ----------: | ------: | --------: | ---------------: |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` |      25,893 |     945 |       42% |              462 |
| `/`                                                      |      11,523 |     391 |       58% |            1,176 |
| `/blog/best-ai-image-quality-enhancer-free`              |       2,793 |     298 |       55% |               66 |
| `/tools/ai-image-upscaler`                               |       2,483 |      24 |       16% |               51 |
| `/dashboard`                                             |       1,694 |      13 |       19% |               37 |

Notes:

- The homepage gap score is inflated by brand typos and navigational terms. Do not stuff those into copy.
- The best-free-upscaler page has no major missing-token gap; it has phrase/modifier and snippet problems.
- The image-quality-enhancer page should explicitly target “unblur”, “sharpen”, “blurry photos”, and “online free”.

## Priority 8: Metadata Backlog

The blog audit found:

- 136 published posts
- 7 posts with errors
- 44 posts with warnings
- 47 title or description length issues

Immediate fixes:

- `sample-article-title-for-testing`: either unpublish/noindex or remove if it is test content.
- `ai-upscaler-muryou-osusume`: expand description.
- `old-damaged-photos`: expand description.
- `photo-noise-reduce`: expand description.
- `fixing-pixelated-photos`: expand description.
- `how-to-enlarge-photo-without-losing-quality`: expand description.
- `free-photo-restoration-app`: expand description.

## 30-Day Execution Plan

Week 1:

1. Fix GA4 attribution for organic conversions and auth/checkout paths.
2. Refresh the Three Kings for `/blog/best-free-ai-image-upscaler-2026-tested-compared`.
3. Add snippet-ready answer blocks to the upscaling-vs-sharpening page.
4. Decide canonical ownership for the best-free-upscaler cluster.

Week 2:

1. Merge, redirect, or retarget overlapping best-free-upscaler posts.
2. Add internal links from top pages to the canonical comparison and core tool page.
3. Add FAQ/schema/table modules to the top 2 opportunity pages.
4. Fix the 7 blog metadata errors.

Week 3:

1. Fix sitemap hreflang policy for English-only pSEO groups.
2. Add “Related free tools” and “Popular use cases” blocks to `/tools/ai-image-upscaler`.
3. Refresh `/blog/best-ai-image-quality-enhancer-free` around sharpener/unblur intent.
4. Submit changed URLs for recrawl in GSC.

Week 4:

1. Re-run GSC 28-day export and CTR tracker for changed pages.
2. Compare Organic Search conversions after attribution fix.
3. Expand only the pSEO families that pass quality gates and have internal links.
4. Build the next 10-page refresh queue from new GSC low-hanging fruit.

## Verification Notes

Successful:

- GSC export completed.
- GA4 export completed.
- GSC/GA synthesis completed.
- Blog metadata audit completed.
- Top-page content gap analysis completed.
- Live robots.txt and sitemap index fetched.
- Live sitemap structure validation completed.

Blocked:

- Playwright technical crawl and page audit did not run because local Chromium is missing at `/home/joao/.cache/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-linux64/chrome-headless-shell`. Run `npx playwright install` before using `scripts/seo-technical-audit.ts` or `scripts/seo-crawl-site.ts`.
