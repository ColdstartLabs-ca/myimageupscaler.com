# Tool Pages SEO Analysis

**Date:** 2026-05-13  
**Site:** myimageupscaler.com  
**GSC period:** 2026-04-13 to 2026-05-10  
**Comparison period:** 2026-03-16 to 2026-04-12  
**Data source:** Google Search Console API export plus local pSEO validators  
**Skills used:** `seo-audit`, `programmatic-seo`, `internal-linking-optimizer`, repo-local `gsc-analysis`

## Executive Summary

The tool-page system is technically healthy but underperforming in search capture.

Google is showing the site more often, and average rankings improved, but CTR and clicks dropped. This means the current opportunity is not simply publishing more pages. The highest-return work is improving snippets, titles, internal links, and intent alignment on pages already getting impressions.

Tool pages are especially concentrated: `/tools/ai-image-upscaler` accounts for most tool clicks, while many utility tools are indexed or discovered but have minimal traffic. Expansion should be staged and demand-led, not broad generic tool expansion.

## Sitewide GSC Snapshot

| Metric           | Current | Previous |                  Change |
| ---------------- | ------: | -------: | ----------------------: |
| Clicks           |   1,979 |    2,379 |                 -16.81% |
| Impressions      |  77,805 |   71,211 |                  +9.26% |
| CTR              |   2.54% |    3.34% |                 -23.86% |
| Average position |   10.62 |    12.12 | improved 1.51 positions |
| Queries          |   2,888 |      n/a |                     n/a |
| Pages            |     602 |      n/a |                     n/a |

Interpretation: visibility is growing, but snippets and destination fit are not converting impressions into clicks.

## Search Type Mix

| Search type | Clicks | Impressions |   CTR | Avg position | Notes                              |
| ----------- | -----: | ----------: | ----: | -----------: | ---------------------------------- |
| Web         |  1,979 |      77,805 | 2.54% |        10.62 | Main traffic source                |
| Image       |      2 |      14,494 | 0.01% |        44.98 | Large visibility, almost no clicks |
| Video       |      0 |           0 |    0% |            0 | No current signal                  |
| News        |      0 |           0 |    0% |            0 | No current signal                  |
| Discover    |      0 |           0 |    0% |            0 | No current signal                  |
| Google News |      0 |           0 |    0% |            0 | No current signal                  |

Image Search impressions are growing but not useful yet. Tool and blog pages should use stronger original examples, before/after imagery, descriptive image filenames, and image alt text where relevant.

## Tool Page Performance

| Metric                     | Value |
| -------------------------- | ----: |
| Tool URLs with impressions |    81 |
| Tool clicks                |    30 |
| Tool impressions           | 3,390 |
| Tool CTR                   | 0.88% |
| Tool average position      |  9.94 |

Top tool pages:

| Page                                     | Clicks | Impressions |    CTR | Avg position |
| ---------------------------------------- | -----: | ----------: | -----: | -----------: |
| `/tools/ai-image-upscaler`               |     23 |       1,390 |  1.65% |         2.98 |
| `/es/tools/remove-bg`                    |      3 |          15 | 20.00% |         5.53 |
| `/pt/tools/ai-background-remover`        |      2 |           8 | 25.00% |         4.13 |
| `/tools/ai-photo-enhancer`               |      1 |         322 |  0.31% |         3.03 |
| `/tools/remove-bg`                       |      1 |           3 | 33.33% |         4.33 |
| `/tools`                                 |      0 |         963 |  0.00% |         1.26 |
| `/de/tools/transparent-background-maker` |      0 |         331 |  0.00% |        50.46 |
| `/it/tools/jpg-to-png`                   |      0 |          51 |  0.00% |        66.00 |
| `/pt/tools/png-to-jpg`                   |      0 |          44 |  0.00% |        73.20 |
| `/tools/photo-quality-enhancer`          |      0 |          35 |  0.00% |        14.94 |
| `/tools/ai-background-remover`           |      0 |          31 |  0.00% |         8.87 |
| `/tools/transparent-background-maker`    |      0 |          27 |  0.00% |        22.59 |

Tool pages are visible, but most clicks still come from branded or near-branded discovery. The generic tool queries are not consistently landing on the dedicated tool pages yet.

## Local Validation Results

Commands run:

```bash
yarn validate:seo:pseo
yarn validate:seo:internal-links
yarn validate:seo:schema
```

Results:

| Check                                         | Result |
| --------------------------------------------- | ------ |
| pSEO data validation                          | Passed |
| Internal link validation                      | Passed |
| Schema validation                             | Passed |
| Total active pSEO pages reported by validator | 276    |
| Tool URLs in tools sitemap                    | 45     |
| Warnings                                      | 41     |

The warnings are not deployment blockers, but they point to real optimization work.

## Main Technical Findings

### 1. pSEO titles are double-branded

Live example:

```text
Free AI Image Upscaler — Enlarge to 8x, No Signup | MyImageUpscaler | MyImageUpscaler
```

Cause:

- Several JSON `metaTitle` values already include `MyImageUpscaler`.
- The pSEO layout title template appends the app name again in `app/(pseo)/layout.tsx`.

Relevant code:

```text
app/(pseo)/layout.tsx:48
title: {
  default: `${clientEnv.APP_NAME} - Image Upscaling & Enhancement`,
  template: `%s | ${clientEnv.APP_NAME}`,
}
```

Impact:

- Longer SERP titles.
- Duplicate brand text.
- Lower CTR risk, especially on non-branded searches.
- Matches the validator warnings for long titles.

Recommendation:

- Preferred: remove brand suffixes from pSEO JSON `metaTitle` values and keep the layout template.
- Alternative: make the template conditional or remove the layout title template for pSEO pages.

### 2. Static tool pages can miss their explicit related tools

Current related-page logic for `tools` uses `getInteractiveToolData(slug)` to find the current page:

```text
lib/seo/related-pages.ts:668
case 'tools': {
  const currentPage = await getInteractiveToolData(slug);
  const relatedToolSlugs = currentPage?.relatedTools ?? [];
```

This works for interactive tools but can miss static tools from `tools.json`, including the highest-value AI tool pages.

Impact:

- Static tool pages may fall back to generic related interactive tools.
- Internal links are less semantically relevant.
- Authority does not flow as cleanly from core AI tools to adjacent commercial pages.

Recommendation:

- Use `getToolData(slug)` or search both static and interactive pools before reading `relatedTools`.
- Keep fallback logic, but only after explicit relationships are exhausted.

### 3. Interactive tool route strategy is inconsistent

The validator warns that many interactive tools use fallback `/tools/:slug` URLs while the first set of utility tools has dedicated route mappings.

Examples with dedicated route mappings:

- `/tools/resize/image-resizer`
- `/tools/compress/image-compressor`
- `/tools/convert/png-to-jpg`

Examples using fallback:

- `/tools/bmp-to-jpg`
- `/tools/pdf-to-jpg`
- `/tools/image-to-text`
- `/tools/exif-remover`
- `/tools/image-cropper`

Impact:

- Not a correctness bug.
- Weakens taxonomy consistency.
- Makes internal linking and sitemap grouping harder to reason about.

Recommendation:

- Decide whether converter, PDF, cropper, OCR, EXIF, and background tools should all use dedicated subfolders.
- If yes, add route mappings and redirects from old fallback URLs.
- If no, downgrade validator route warnings for intentional fallback pages and document the route policy.

### 4. Tools hub ranks, but does not earn clicks

`/tools` has 963 impressions, average position 1.26, and 0 clicks.

Top visible queries are mostly branded, so this may not be a pure problem. Still, the tools hub should support discovery and internal linking more aggressively.

Recommendation:

- Add short category descriptions to tool groups.
- Add a "Popular tools" block above categories.
- Link core money pages first: AI Image Upscaler, AI Photo Enhancer, Background Remover, Image Resizer, Image Compressor.
- Add descriptive anchors instead of generic "Use free tool".

## Highest GSC Opportunities

These are the strongest low-hanging-fruit query clusters from the latest GSC export.

| Query                                                | Clicks | Impressions | Position | Current top page                                         | Priority |
| ---------------------------------------------------- | -----: | ----------: | -------: | -------------------------------------------------------- | -------- |
| best free ai image upscaler 2026                     |      0 |       3,288 |     8.31 | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | P0       |
| best free image upscaler 2026                        |      0 |         641 |     8.78 | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | P0       |
| best ai image upscaler online free 2026              |      0 |         436 |     8.84 | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | P0       |
| best free ai image upscaler online 2026              |      0 |         438 |    10.03 | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | P0       |
| best free ai image upscaler tools 2026               |      0 |         313 |    10.37 | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | P1       |
| best free ai image sharpener online 2026             |      0 |         206 |     9.27 | `/blog/best-ai-image-quality-enhancer-free`              | P1       |
| best free ai image upscaler to 8k 2026               |      0 |         153 |     9.84 | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | P1       |
| top ai image upscaler websites                       |      0 |         127 |     9.31 | `/blog/best-ai-upscaler`                                 | P1       |
| best free online tools to sharpen blurry images 2026 |      0 |         120 |     9.58 | `/blog/best-ai-image-quality-enhancer-free`              | P1       |

These are mostly blog opportunities, but they should be used to feed tool-page authority.

Recommended actions:

- Refresh titles and meta descriptions for the ranking blog pages.
- Add stronger above-the-fold comparison tables and "try the tool" CTAs.
- Add contextual internal links from these posts to `/tools/ai-image-upscaler`, `/tools/ai-photo-enhancer`, `/scale/upscale-16x`, and relevant free/no-watermark pages.
- Add a short "Best for no signup/no watermark" section to match the exact query modifiers.

## CTR Opportunities

| Query                                                           | Impressions | Position | Current top page                                         | Issue                           |
| --------------------------------------------------------------- | ----------: | -------: | -------------------------------------------------------- | ------------------------------- |
| ai image upscaling vs sharpening explained                      |         245 |     2.21 | `/blog/ai-image-upscaling-vs-sharpening-explained`       | Excellent position, zero clicks |
| difference between ai upscaling and sharpening in photo editing |          74 |     2.72 | `/blog/photo-enhancement-upscaling-vs-quality`           | Strong position, zero clicks    |
| what is the difference between ai upscaling and sharpening      |         464 |     5.33 | `/blog/ai-image-upscaling-vs-sharpening-explained`       | High impressions, zero clicks   |
| best free online ai image upscaler no signup 2026               |         252 |     5.33 | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Commercial modifier mismatch    |
| best free ai image upscaler no signup no watermark 2026         |         104 |     4.08 | `/blog/best-free-ai-image-upscaler-2026-tested-compared` | Needs exact snippet match       |

Recommendation:

- Rewrite snippets around exact user questions.
- Use title patterns that front-load the query and value proposition.
- Add answer-first intros that directly resolve the query in the first 100 words.
- Add FAQ entries only when the answer is visible in page content.

## Expansion Recommendations

### Expand now

These have GSC signal or strong commercial fit:

1. `8x image upscaler free`
2. `16x image upscaler`
3. `free ai image upscaler no signup`
4. `free ai image upscaler no watermark`
5. `best free ai image upscaler 2026`
6. `ai image sharpener`
7. `fix blurry photo ai`
8. `transparent PNG maker` localized pages, especially German
9. `background remover` localized pages
10. `image quality enhancer free`

Page type guidance:

- Use focused tool or free-tool pages for transactional queries.
- Use comparison/list pages for "best" queries.
- Use answer-first guides for "difference between" and "how" queries.

### Expand later

These should wait until current utility tool pages show better traction:

1. More generic format converters.
2. More PDF converter variants.
3. More social resize variants.
4. Thin modifier pages where only the platform or format changes.

The current pSEO system already has substantial page count. Adding more pages before improving CTR and internal link targeting risks crawl waste.

## Internal Linking Plan

Priority links to add or strengthen:

| Source page type                | Link targets                                                                              | Anchor examples                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Best upscaler blog posts        | `/tools/ai-image-upscaler`, `/scale/upscale-16x`                                          | "free AI image upscaler", "16x image upscaler"      |
| Quality enhancer posts          | `/tools/ai-photo-enhancer`, `/tools/photo-quality-enhancer`                               | "AI photo enhancer", "image quality enhancer"       |
| Sharpening/upscaling explainers | `/tools/ai-photo-enhancer`, `/tools/ai-image-upscaler`                                    | "sharpen blurry photos", "upscale after sharpening" |
| Background/transparent pages    | `/tools/remove-bg`, `/tools/ai-background-remover`, `/tools/transparent-background-maker` | "remove image background", "make PNG transparent"   |
| Tools hub                       | Top 5 commercial tools                                                                    | exact descriptive tool names                        |

Implementation notes:

- Fix `related-pages.ts` first so explicit related tool data is respected.
- Prefer contextual links in intros and "next step" sections over only card grids.
- Track internal links by page type after changes.

## Programmatic SEO Quality Gates

Before adding new tool pages, each candidate should pass:

1. Unique answer gate: the page solves a distinct query, not just a word-swapped variant.
2. Data substantiation gate: include real dimensions, platform requirements, benchmarks, examples, or workflows.
3. Engagement gate: users can complete a useful action or decision on the page.
4. Internal link gate: page has links from hub, related tools, and at least one supporting article or cluster page.
5. Snippet gate: title and meta are under target length and match the query's commercial or informational intent.

Do not index new pages that fail these gates.

## Recommended Work Plan

### P0: Fix CTR blockers

1. Remove double-branding from pSEO titles.
2. Shorten overlong titles flagged by the validator.
3. Refresh titles/metas for the top GSC opportunity pages.
4. Add internal links from ranking blog posts to core tool pages.

### P1: Fix tool-page internal linking

1. Update `lib/seo/related-pages.ts` to load both static and interactive tool data for current pages.
2. Improve `/tools` hub ordering and anchors.
3. Add related-tool clusters for AI tools, background tools, converters, PDF tools, EXIF/privacy tools, and croppers.

### P2: Controlled expansion

1. Build or enrich pages for no-signup/no-watermark upscaler queries.
2. Expand 8x/16x upscaler pages with stronger examples and internal links.
3. Localize and enrich transparent PNG/background pages where GSC shows impressions.
4. Pause generic converter expansion until existing converter pages gain traction.

## Validation Baseline

Current validation commands are clean:

```bash
yarn validate:seo:pseo
yarn validate:seo:internal-links
yarn validate:seo:schema
```

Recommended additional checks after implementation:

```bash
yarn validate:seo:pseo:verbose
yarn validate:seo:sitemap:structure
yarn validate:seo:internal-links
```

After deployment, use the GSC CTR tracker on:

- `/tools/ai-image-upscaler`
- `/tools/ai-photo-enhancer`
- `/tools`
- `/blog/best-free-ai-image-upscaler-2026-tested-compared`
- `/blog/ai-image-upscaling-vs-sharpening-explained`
- `/blog/best-ai-image-quality-enhancer-free`

## Bottom Line

The pSEO infrastructure is solid. The bottleneck is not page generation; it is click capture and authority routing.

Fix title duplication first, then use existing ranking blog pages to push authority and intent signals into the core tool pages. Expand only into query clusters where GSC already shows demand.
