# SEO Next Steps Report - myimageupscaler.com

Generated: 2026-05-05 Pacific  
Inputs:

- GSC export: `/tmp/gsc-miu.json`
- GA4 export: `/tmp/ga-miu.json`
- Blog SEO audit: `/tmp/blog-audit-miu.json`
- Skills used: `seo-content-3-kings-technique`, `gsc-analysis`, `ga-analysis`

## Executive Summary

SEO demand is growing. The problem is not visibility. It is click capture and conversion measurement.

GSC web clicks rose from 1,730 to 2,218, up 28.2%, while impressions rose from 54,654 to 85,329, up 56.1%. Average position improved from 17.0 to 10.0. CTR fell from 3.17% to 2.60%, which means new rankings are showing up faster than snippets are earning clicks.

GA4 organic sessions rose from 1,848 to 2,649, up 43.3%. Organic is now 34.7% of sessions. GA4 shows 0 organic conversions, while all 18 conversions are attributed to `Unassigned`, so conversion attribution is currently not reliable enough for SEO ROI decisions.

## Measurement Window

GSC current period: 2026-04-05 to 2026-05-02  
GSC comparison period: 2026-03-08 to 2026-04-04  
GA4 current period: 2026-04-07 to 2026-05-04  
GA4 comparison period: 2026-03-10 to 2026-04-06

## What To Do Next

### 1. Fix GA4 Conversion Attribution First

Priority: P0  
Why: GA4 reports 18 total conversions, but 0 conversions from Organic Search. The 18 conversions are in `Unassigned`, which means SEO landing page decisions are missing the most important outcome signal.

Actions:

- Audit the event marked as conversion/key event and confirm it fires after signup/payment/credit purchase.
- Check whether auth redirects, Stripe redirects, or dashboard callbacks are losing source/medium.
- Preserve UTM/referrer attribution through `/auth/callback` and localized callback pages.
- Add a separate key event for high-intent tool usage if paid conversion volume is low, such as successful image upload or upscale completed.

Evidence:

- Total sessions: 7,644, total conversions: 18.
- Organic Search sessions: 2,649, conversions: 0.
- `Unassigned` sessions: 379, conversions: 18.
- Organic is the largest growth channel, up 43.3% period over period.

Expected result: SEO reports become actionable. Without this, page refreshes may increase traffic but you cannot tell which traffic produces users or revenue.

### 2. Run A Three Kings Refresh On The Top 5 CTR Pages

Priority: P0  
Why: These pages have strong rankings and impressions but extremely low CTR. Apply the Three Kings rule: title, H1, and first paragraph must front-load the same target query naturally.

| Page | Target Query | Impr. | Clicks | Pos. | CTR | Missed Clicks |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `best-free-ai-image-upscaler-2026-tested-compared` | best free ai image upscaler 2026 | 23,785 | 10 | 7.7 | 0.04% | 466 |
| `ai-image-upscaling-vs-sharpening-explained` | ai image upscaling vs sharpening explained | 2,652 | 0 | 4.1 | 0.00% | 159 |
| `best-ai-image-quality-enhancer-free` | best free ai image sharpener online 2026 | 6,625 | 7 | 9.2 | 0.11% | 126 |
| `free-ai-upscaler-no-watermark` | best free ai image upscaler 2026 no watermark | 3,464 | 5 | 6.1 | 0.14% | 99 |
| `upscale-image-for-print-300-dpi-guide` | upscale image to 300 dpi | 3,144 | 8 | 7.5 | 0.25% | 86 |

Recommended refreshes:

1. `best-free-ai-image-upscaler-2026-tested-compared`
   - Title: `Best Free AI Image Upscaler 2026: 12 Tools Tested`
   - H1: `Best Free AI Image Upscaler 2026: 12 Tools Tested`
   - First sentence: `We tested the best free AI image upscaler tools for 2026 to see which ones upscale images online without signup, watermarks, or soft-looking results.`
   - Note: This page was already updated on 2026-04-26 and 2026-04-27. Fresh GSC still shows the largest CTR gap, so monitor another 7-14 days, then apply a stronger title if CTR stays below 1%.

2. `ai-image-upscaling-vs-sharpening-explained`
   - Title: `AI Upscaling vs Sharpening Explained: Key Difference`
   - H1: `AI Upscaling vs Sharpening Explained`
   - First sentence: `AI upscaling vs sharpening is the difference between adding new image detail and making existing edges look clearer.`
   - Reason: Google is ranking this high, but query intent is explicitly explanatory. Current title asks a benefit question; the query wants definition/comparison clarity.

3. `best-ai-image-quality-enhancer-free`
   - Title: `Best Free AI Image Sharpener Online 2026: Tested`
   - H1: `Best Free AI Image Sharpener Online 2026`
   - First sentence: `We tested the best free AI image sharpener tools online in 2026 for blurry photos, soft details, noise, and image quality enhancement.`
   - Reason: Query data is sharper-specific, not just generic "quality enhancer".

4. `free-ai-upscaler-no-watermark`
   - Title: `Best Free AI Image Upscaler 2026: No Watermark`
   - H1: `Best Free AI Image Upscaler With No Watermark`
   - First sentence: `This guide compares the best free AI image upscaler options in 2026 that avoid watermarks, signup friction, and low-quality exports.`
   - Reason: Audit says the dominant intent is listicle/ranking, not just a single free tool page.

5. `upscale-image-for-print-300-dpi-guide`
   - Title: `Upscale Image to 300 DPI for Print: Free AI Guide`
   - H1: `Upscale Image to 300 DPI for Print`
   - First sentence: `To upscale an image to 300 DPI for print, you need enough pixels for the print size, then use AI upscaling only when the source image is too small.`
   - Reason: Searchers use "upscale 300 dpi" and "upscale image to 300 dpi"; the title should match that phrase directly.

### 3. Resolve Cannibalization Around "Best Free AI Image Upscaler 2026"

Priority: P1  
Why: Multiple pages are ranking for the same high-impression intent. Most impressions belong to the primary page, but several near-duplicate listicle/free-tool pages are also appearing and may dilute relevance.

Primary page to keep:

- `/blog/best-free-ai-image-upscaler-2026-tested-compared`

Supporting pages to evaluate:

- `/blog/best-free-ai-image-upscaler-tools-2026`
- `/blog/best-image-upscaling-tools-2026`
- `/blog/best-image-upscaler`
- `/blog/free-ai-upscaler-no-watermark`
- `/blog/free-upscaler-no-sign-up`
- `/compare`

Actions:

- Pick one canonical page for "best free AI image upscaler 2026".
- Convert overlapping pages into narrower intents:
  - no watermark/no signup
  - online-only tools
  - Photoshop/Topaz comparison
  - anime/art upscaling
  - print/300 DPI upscaling
- Add explicit internal links from supporting pages to the canonical page using exact or close anchor text.
- If any page has no unique intent or backlinks, merge it and 301 to the canonical.

Evidence:

- Query `best free ai image upscaler 2026`: 5,014 impressions, 0 clicks, 4 pages ranking.
- Query `best free ai image upscaler tools 2026`: 393 impressions, 0 clicks, 3 pages ranking.
- Query `best free ai image upscaler online 2026`: 391 impressions, 0 clicks, 3 pages ranking.
- Query `best free ai image upscaler no signup 2026`: 283 impressions, 0 clicks, 2 pages ranking.

### 4. Treat "AI Upscaling vs Sharpening" As A Featured Snippet Candidate

Priority: P1  
Why: The page is already averaging position 4.1, and the exact query has position 1.9 with 0 clicks. That is a SERP formatting/snippet problem, not a ranking problem.

Actions:

- Add a 40-60 word answer block immediately after the intro.
- Add a two-column comparison table with "AI upscaling" and "Sharpening".
- Add an FAQ block:
  - `Is AI upscaling the same as sharpening?`
  - `Should I upscale or sharpen first?`
  - `Does sharpening increase resolution?`
  - `When should I use AI upscaling?`
- Add internal links to:
  - `/tools/ai-image-upscaler`
  - `/tools/ai-photo-enhancer`
  - `/blog/photo-enhancement-upscaling-vs-quality`

Target queries:

- `ai image upscaling vs sharpening explained`: 345 impressions, position 1.9, 0 clicks.
- `what is the difference between ai upscaling and sharpening`: 330 impressions, position 5.0, 0 clicks.
- `difference between ai upscaling and sharpening images`: 256 impressions, position 7.4, 0 clicks.

### 5. Improve Main Tool Page CTR And Organic Pathing

Priority: P1  
Why: `/tools/ai-image-upscaler` has strong average position but weak CTR.

Evidence:

- `/tools/ai-image-upscaler`: 1,422 impressions, 19 clicks, position 2.7, CTR 1.34%.
- `/`: 6,506 impressions, 1,881 clicks, CTR 28.9%, but much of this is branded.
- GA4 shows `/tools/ai-image-upscaler` organic sessions rose from 3 to 22, but still no conversions.

Actions:

- Check the title/meta for `/tools/ai-image-upscaler`; it should emphasize the exact free/no signup/no watermark promise only if the product flow supports it.
- Add direct CTAs from top blog pages to `/tools/ai-image-upscaler` above the fold and after the first major section.
- Add event tracking for upload start, upload success, upscale completed, and signup prompt seen.
- Add a "popular uses" internal link block from the tool page to print, anime, product photo, old photo, and 4K/8K guides.

### 6. Fix The Blog Metadata Backlog In Batches

Priority: P2  
Why: The audit found widespread metadata issues, but only a few pages are high enough impact to update immediately.

Audit summary:

- 129 published posts.
- 57 posts with GSC data.
- 53 posts with errors.
- 62 posts with warnings.
- 53 posts below CTR benchmark.
- 47 posts with title/meta length issues.
- 29 posts with low keyword overlap.
- 5 posts with intent mismatch.

Batch 1: update now

- `best-free-ai-image-upscaler-2026-tested-compared`
- `ai-image-upscaling-vs-sharpening-explained`
- `best-ai-image-quality-enhancer-free`
- `free-ai-upscaler-no-watermark`
- `upscale-image-for-print-300-dpi-guide`
- `best-ai-upscaler`
- `how-to-upscale-anime-images-with-ai`
- `best-image-upscaler`
- `topaz-video-upscaler`
- `how-to-upscale-images-without-losing-quality`
- `upscale-image-online-free`

Batch 2: update after Batch 1 is submitted/reindexed

- `ai-image-upscaler-for-etsy-sellers`
- `how-to-upscale-midjourney-images-for-print`
- `how-to-upscale-old-photos-with-ai`
- `photoshop-upscaler-vs-ai-tools`
- `how-to-sharpen-blurry-images`
- `noise-reduction-in-image`
- `gif-upscaler`
- `poster-size-dimensions-pixels`

Important: The auto-generated title suggestions in `/tmp/blog-audit-miu.json` are useful for query extraction, but several generated titles are awkward or over length. Use the GSC query data, not the generated copy verbatim.

### 7. Add Image Search Optimization To Comparison Pages

Priority: P2  
Why: Image search impressions nearly doubled, but clicks are almost zero.

Evidence:

- Image search: 12,980 impressions, 1 click, CTR 0.008%, average position 45.4.
- Image impressions are up 95.8% period over period.
- The strongest image-query cluster is before/after comparison imagery.

Actions:

- Add original before/after image pairs to:
  - `best-free-ai-image-upscaler-2026-tested-compared`
  - `photoshop-upscaler-vs-ai-tools`
  - `how-to-upscale-4k-to-8k-images-with-ai`
- Use descriptive image filenames, alt text, captions, and nearby headings:
  - `ai-image-upscaling-before-after-comparison`
  - `low-resolution-to-high-resolution-ai-comparison`
  - `ai-image-upscaler-comparison-2026`
- Add `ImageObject` schema where the template supports it.
- Make sure before/after images are crawlable, not lazy-loaded in a way that hides them from Googlebot.

### 8. Fix Indexing And Sitemap Oddities

Priority: P2  
Why: No critical indexing blocker was found, but the inspected set has redirect and sitemap anomalies.

Evidence:

- 10 URLs inspected.
- 8 PASS, 2 NEUTRAL.
- 2 inspected pages are `Page with redirect`:
  - `/blog/best-free-ai-image-upscaler-tools-2026`
  - `/blog/photo-enhancement-upscaling-vs-quality`
- Pages missing from known sitemaps:
  - `/blog/best-free-ai-image-upscaler-tools-2026`
  - `/blog/photo-enhancement-upscaling-vs-quality`
  - `/it`
- Sitemap has 0 warnings and 0 errors, last downloaded 2026-05-05.

Actions:

- Confirm redirected blog URLs are intentionally redirected and not internally linked as final URLs.
- Replace internal links to redirected URLs with their canonical destinations.
- Confirm `/it` appears in the generated sitemap if it is an indexable locale.
- Resubmit sitemap after fixes.

### 9. Investigate Portugal Locale Drop

Priority: P3  
Why: Organic traffic is growing overall, but Portuguese pages dropped sharply.

Evidence:

- `/pt`: 46 sessions, down 43.9%.
- `/pt/dashboard`: 55 sessions, down 42.7%.
- `/pt/auth/callback`: 33 sessions, down 45.9%.

Actions:

- Check whether Portuguese hreflang/canonical tags changed.
- Verify `/pt` still has localized title, meta, H1, and visible tool copy.
- Compare `/pt` rankings and impressions against `/es`, `/fr`, `/de`, and `/it`.
- Check whether the drop is traffic quality, attribution, or a real search visibility decline.

## 14-Day Execution Plan

Day 1:

- Fix GA4 conversion attribution and add tool funnel key events.
- Take CTR baseline snapshots for the Batch 1 pages.

Days 2-4:

- Apply Three Kings refresh to the top 5 CTR pages.
- Submit updated URLs for indexing.
- Add internal links from top traffic pages to `/tools/ai-image-upscaler`.

Days 5-7:

- Resolve cannibalization for the best/free/2026 cluster.
- Replace internal links to redirected URLs.
- Confirm `/it` sitemap inclusion.

Days 8-10:

- Add answer block, comparison table, and FAQ to `ai-image-upscaling-vs-sharpening-explained`.
- Add before/after comparison imagery to the top comparison pages.

Days 11-14:

- Refresh Batch 2 metadata.
- Pull CTR tracker snapshot and compare against baseline.
- Re-run GSC and GA4 exports to evaluate CTR, organic sessions, and conversion attribution.

## Success Metrics

Primary:

- Organic conversions no longer reported as 0 if Organic Search produces signups or purchases.
- Batch 1 average CTR improves from sub-0.3% to at least 1.0%.
- `best-free-ai-image-upscaler-2026-tested-compared` reaches at least 1% CTR while staying in positions 5-10.
- `ai-image-upscaling-vs-sharpening-explained` earns clicks for the exact query currently ranking around position 2.

Secondary:

- Organic sessions continue growing without further CTR erosion.
- Fewer cannibalized pages for the "best free AI image upscaler 2026" cluster.
- Image search CTR improves from near zero after crawlable before/after images are added.
- No indexed page resolves through an avoidable internal redirect.

