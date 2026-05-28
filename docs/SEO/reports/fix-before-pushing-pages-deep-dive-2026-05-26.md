# Fix-Before-Pushing Deep Dive: Six Ranking Pages

**Generated:** 2026-05-26  
**GSC 28-day period:** 2026-04-26 to 2026-05-23  
**GSC 90-day period:** 2026-02-23 to 2026-05-23  
**GA4 28-day period:** 2026-04-28 to 2026-05-25  
**GA4 90-day period:** 2026-02-25 to 2026-05-25  
**Source context:** GSC exports, GA4 organic landing-page export, live production metadata checks, Supabase blog metadata/content, SEO changes backlog.

## Important Guardrail

Do **not** touch `/blog/best-free-ai-image-upscaler-2026-tested-compared` from this workstream.

The GSC export available here ends on 2026-05-23. You reported newer data showing that page has moved to roughly **1.4% CTR** with sharply increasing clicks. Treat that as fresher than this report's GSC window. The canonical best-free-upscaler page is a winner in motion, not a page to rewrite again.

## Data Limits

The page totals are much larger than the visible query rows. That means a lot of impressions are hidden in anonymized/long-tail GSC queries.

| Page | 28d page impressions | Visible top-query impressions | Visible query coverage |
| --- | ---: | ---: | ---: |
| `/comparisons-expanded/ai-models-comparison` | 1,573 | 113 | 7.2% |
| `/blog/topaz-denoise-ai` | 956 | 100 | 10.5% |
| `/blog/photoshop-upscale-image` | 624 | 16 | 2.6% |
| `/blog/best-ai-image-enhancer` | 331 | 12 | 3.6% |
| `/blog/best-ai-image-quality-enhancer` | 247 | 15 | 6.1% |
| `/blog/sharpen-a-video` | 180 | 26 | 14.4% |

Also, GA4 engagement samples are tiny on most pages. Use bounce rate as a warning, not as the sole decision input.

## Decision Matrix

| Page | Decision | Why |
| --- | --- | --- |
| `/comparisons-expanded/ai-models-comparison` | **Repair page quality before any push** | 1,573 impressions appeared recently, but only 1 click and 1 GA session. Metadata is stale/truncated and one locale data copy has malformed text. |
| `/blog/topaz-denoise-ai` | **Refresh for Topaz-specific intent, then monitor** | New page with 956 impressions, but searchers want Topaz/price/review/local alternatives. Current users bounce almost immediately. |
| `/blog/photoshop-upscale-image` | **Rework above-fold intent match** | 2,095 impressions over 90d, but 0.10% CTR and 80% 90d bounce. Page answers the topic, but the above-fold promise leads too quickly with "AI alternative better" for Photoshop-intent users. |
| `/blog/best-ai-image-enhancer` | **Do not push yet; decide consolidation role** | Very small traffic sample, but it overlaps with `best-ai-image-quality-enhancer` and the free sharpener page. Needs a clear unique angle. |
| `/blog/best-ai-image-quality-enhancer` | **Likely consolidate or retarget** | Older broad enhancer page overlaps with newer enhancer and free sharpener assets. Tiny traffic, 100% bounce, no clear unique role. |
| `/blog/sharpen-a-video` | **Retarget the top section to FFmpeg syntax intent** | GSC visible queries are mostly exact FFmpeg `unsharp` syntax, not generic video-enhancement education. Add the answer first before pushing. |

## Page Details

### `/comparisons-expanded/ai-models-comparison`

**Current live metadata**

- Title: `AI Upscaling Models 2025: ESRGAN vs Real-ESRGAN Compared | MyImageUpscaler`
- Description: `Technical comparison of AI upscaling models. Performance benchmarks for ESRGAN, Real-ESRGAN, SRCNN. Understand which AI model delivers best quality for your .`
- H1: `AI Upscaling Models: Technical Comparison & Performance Analysis`

**Performance**

| Window | Clicks | Impressions | CTR | Avg position | GA sessions | Bounce |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 28d | 1 | 1,573 | 0.06% | 10.93 | 1 | 100% |
| 90d | 1 | 1,598 | 0.06% | 10.93 | 1 | 100% |

**Visible query pattern**

| Query | 28d impressions | Position | CTR |
| --- | ---: | ---: | ---: |
| `esrgan` | 37 | 41.5 | 0% |
| `real esrgan` | 25 | 63.2 | 0% |
| `real-esrgan` | 21 | 59.5 | 0% |
| `real-esrgan vs swinir vs diffusion upscaling` | 9 | 6.4 | 0% |
| `best ai upscaling models 2025 2026 esrgan real-esrgan swinir` | 5 | 4.8 | 0% |

**Diagnosis**

This is not ready for internal-link/ranking push. The page is getting discovered for technical model-comparison queries, but it has page-quality problems:

- The title says 2025.
- The meta description is visibly truncated: "for your ."
- The local JSON copy contains malformed transformed text such as `pAId`, `Free`, and awkward casing in adjacent page data.
- The page likely attracts technical users looking for ESRGAN, Real-ESRGAN, SwinIR, diffusion upscalers, architecture differences, and model-selection guidance. A generic conversion CTA will not satisfy that first click.

**Action**

Repair as a technical comparison page:

- Update title/meta to 2026 and fix the broken description.
- Add a top answer block: "ESRGAN vs Real-ESRGAN vs SwinIR vs diffusion upscalers: which model should you use?"
- Add a compact comparison table with model, best use case, speed, artifact risk, and local/cloud availability.
- Add code/tool references only if accurate; technical users will bounce if the page reads like generic SEO copy.
- Add a modest CTA after the comparison: "If you do not want to choose a model manually, use the automatic image upscaler."

**Do not push with internal links until:** CTR rises above 0.5% or GA shows at least several engaged sessions.

### `/blog/topaz-denoise-ai`

**Current live metadata**

- Title: `Topaz Denoise AI 2026 Review & Comparison | MyImageUpscaler`
- Description: `Detailed 2026 review of Topaz Denoise AI. Compare features, quality, and price vs. MyImageUpscaler & Lightroom to find your ideal denoiser.`
- H1: `Topaz Denoise AI 2026 Review & Comparison`
- Published/updated: 2026-05-04

**Performance**

| Window | Clicks | Impressions | CTR | Avg position | GA sessions | Bounce | Avg session |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 28d | 2 | 956 | 0.21% | 10.85 | 4 | 75% | 1.2s |
| 90d | 2 | 956 | 0.21% | 10.85 | 4 | 75% | 1.2s |

**Visible query pattern**

| Query | 28d impressions | Position | CTR |
| --- | ---: | ---: | ---: |
| `topaz denoise` | 68 | 35.4 | 0% |
| `topaz denoise ai` | 16 | 39.9 | 0% |
| `topaz denoise ai price 2026` | 4 | 9.8 | 0% |
| `topaz denoise price` | 3 | 26.7 | 0% |
| `topaz denoise ai review` | 2 | 44.5 | 0% |

**Diagnosis**

This is a new page with early visibility. The weak engagement is real enough to avoid pushing, but the sample is still small.

The likely intent is Topaz-specific: price, whether Topaz Denoise still exists as a standalone product, review quality, alternatives, local/non-cloud workflows, and Lightroom comparisons. The current page appears to have useful long-form content, but the user needs a direct answer immediately.

**Action**

Refresh, not consolidate:

- Add a top verdict box: "Use Topaz if you need local desktop denoise; use Lightroom if already in Adobe; use MyImageUpscaler when you also need upscale/sharpen/restore in a browser."
- Add a current pricing/version section and update it whenever product naming changes.
- Add a direct comparison table: Topaz Photo AI/Denoise, Lightroom Denoise, MyImageUpscaler, free/open-source local tools if relevant.
- Add a "not a fit" section for non-cloud/local-only users so Reddit and photographer intent is handled honestly.
- Keep product CTA secondary. This page should earn trust first.

**Do not push until:** bounce improves below ~60% or the page shows at least 20-30 organic sessions with acceptable engagement.

### `/blog/photoshop-upscale-image`

**Current live metadata**

- Title: `How to Upscale Images in Photoshop [2026 Complete Guide] | MyImageUpscaler`
- Description: `Step-by-step guide: Preserve Details 2.0, Super Resolution, and Neural Filters. Plus a free AI alternative that outperforms Photoshop for most upscaling jobs.`
- H1: `How to Upscale Images in Photoshop (+ Free AI Alternative That's Better)`
- Updated: 2026-03-27

**Performance**

| Window | Clicks | Impressions | CTR | Avg position | GA sessions | Bounce | Avg session |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 28d | 1 | 624 | 0.16% | 10.30 | 7 | 71.4% | 8.3s |
| 90d | 2 | 2,095 | 0.10% | 17.9 | 10 | 80.0% | 5.8s |

**Visible query pattern**

| Query | 90d impressions | Position | CTR |
| --- | ---: | ---: | ---: |
| `photoshop image upscaling quality` | 53 | 9.3 | 0% |
| `adobe photoshop image upscaling performance` | 21 | 9.5 | 0% |
| `upscale image photoshop` | 17 | 33.9 | 0% |
| `photoshop upscale image` | 16 | 36.1 | 0% |
| `how to upscale an image in photoshop` | 11 | 30.5 | 0% |

**Diagnosis**

This page should be fixable. The topic is relevant, the page is long enough, and the title matches the broad query. The issue is likely intent sequencing: Photoshop users want the Photoshop answer first. If the first screen frames MyImageUpscaler as "better" too early, users may bounce before getting the answer they searched for.

**Action**

Refresh the above-fold structure:

- Start with exact Photoshop steps before pitching an alternative.
- Add jump links for Preserve Details 2.0, Super Resolution, Neural Filters, batch processing, and print sizing.
- Add screenshots or UI-step callouts if available.
- Add a table: Photoshop method, file type, max scale, quality, speed, when to use.
- Move the MyImageUpscaler comparison after the Photoshop steps, framed as "when Photoshop is overkill or too slow."

**Potential title test**

Only after the structural fix, consider:

`How to Upscale an Image in Photoshop: Preserve Details vs Super Resolution`

### `/blog/best-ai-image-enhancer`

**Current live metadata**

- Title: `Best AI Image Enhancer [2026] — Tested & Ranked | MyImageUpscaler`
- Description: `Find the best AI image enhancer in our 2026 guide. We compare top tools for upscaling, face restoration, and batch processing. Get pro results!`
- H1: `Best AI Image Enhancer: Top Tools of 2026`
- Updated: 2026-04-26

**Performance**

| Window | Clicks | Impressions | CTR | Avg position | GA sessions | Bounce |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 28d | 1 | 331 | 0.30% | 9.36 | 1 | 100% |
| 90d | 1 | 351 | 0.28% | 9.2 | 1 | 100% |

**Visible query pattern**

| Query | 28d impressions | Position | CTR |
| --- | ---: | ---: | ---: |
| `ai image enhancement tools comparison 2025 2026` | 3 | 18.3 | 0% |
| `best ai image enhancer 2026 comparison` | 2 | 9.5 | 0% |
| `top ai image enhancer` | 2 | 40.0 | 0% |
| `best ai image upscaler and deblurrer 2026` | 1 | 6.0 | 0% |

**Diagnosis**

The page is not failing loudly; it is barely sampled. The bigger problem is role clarity. There are multiple enhancer/sharpener assets:

- `/blog/best-ai-image-enhancer`
- `/blog/best-ai-image-quality-enhancer`
- `/blog/best-ai-image-quality-enhancer-free`

The current page is the best candidate for a broad comparison/listicle page, but it needs a clean division of labor from the other two.

**Action**

Do not push yet. First define the cluster:

- Keep this page only if it owns broad "best AI image enhancer / tools comparison" intent.
- Make it clearly comparison-led above the fold with a ranked table and use-case filters.
- Internally link to the free sharpener page only for "free sharpener/unblur" intent.
- If the older `/blog/best-ai-image-quality-enhancer` cannot be differentiated, consolidate that older page into this one.

### `/blog/best-ai-image-quality-enhancer`

**Current live metadata**

- Title: `Best AI Image Quality Enhancer - Fix Blurry Photos Free [2026] | MyImageUpscaler`
- Description: `Enhance picture quality instantly with a free AI image quality enhancer. Sharpen blurry photos, remove noise, and boost resolution online. No signup needed.`
- H1: `Best AI Image Quality Enhancer: Fix Blurry Photos Fast [2026]`
- Updated: 2026-02-13

**Performance**

| Window | Clicks | Impressions | CTR | Avg position | GA sessions | Bounce |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 28d | 3 | 247 | 1.21% | 14.03 | 2 | 100% |
| 90d | 3 | 463 | 0.65% | 13.3 | 2 | 100% |

**Visible query pattern**

| Query | 90d impressions | Position | CTR |
| --- | ---: | ---: | ---: |
| `best ai tools to sharpen blurry photos 2026` | 4 | 15.3 | 0% |
| `best ai tools to enhance blurry photos` | 3 | 10.7 | 0% |
| `best ai tools to fix blurry photos 2026` | 3 | 17.3 | 0% |
| `ai image enhancement tools for blurry photos` | 2 | 10.0 | 0% |
| `best ai image enhancer sharpen blurry photo 2026` | 1 | 4.0 | 0% |

**Diagnosis**

This page is the weakest strategic fit. It overlaps with both:

- `/blog/best-ai-image-enhancer` for broad enhancer/comparison intent.
- `/blog/best-ai-image-quality-enhancer-free` for free sharpener/unblur intent.

It has a few clicks, but poor engagement and no clear unique search job. The title says "free", while the slug does not. That makes it easy to cannibalize the free sharpener page.

**Action**

Prefer consolidation over another refresh:

- If `/blog/best-ai-image-enhancer` is kept as the broad comparison page, merge any unique sections from this page into it and 301 this URL there.
- If the free sharpener page is the stronger target for blurry-photo/free-tool queries, add one contextual link from this page before redirecting or de-emphasizing.
- Do not create another enhancer/sharpener article.

**Exception**

If you want to keep it, retarget it away from "best/free" toward a pure how-to:

`How to Improve Image Quality: Sharpen, Denoise, Upscale, and Deblur`

That would separate it from the two "best tools" pages.

### `/blog/sharpen-a-video`

**Current live metadata**

- Title: `How to Sharpen a Video [2026] — AI Enhancement & Manual Workflows | MyImageUpscaler`
- Description: `Fix blurry videos with AI sharpening and manual techniques. Complete workflow for crisp, professional-looking footage. Try free →`
- H1: `Sharpen a Video: Pro Techniques 2026`
- Updated: 2026-04-26

**Performance**

| Window | Clicks | Impressions | CTR | Avg position | GA sessions | Bounce | Avg session |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 28d | 1 | 180 | 0.56% | 8.82 | 1 | 100% | 0.3s |
| 90d | 1 | 261 | 0.38% | 8.6 | 1 | 100% | 0.3s |

**Visible query pattern**

| Query | 28d impressions | Position | CTR |
| --- | ---: | ---: | ---: |
| `ffmpeg unsharp filter syntax unsharp=5:5:1.0:5:5:0.0` | 8 | 9.9 | 0% |
| `ffmpeg unsharp filter syntax 5:5:1.0:5:5:0.0` | 6 | 7.0 | 0% |
| `ffmpeg unsharp filter parameters 5:5:1.0:5:5:0.0` | 3 | 12.0 | 0% |
| `ffmpeg unsharp=5:5:1.0:5:5:0.0 example` | 3 | 10.0 | 0% |
| `best ways to sharpen blurry video 2026` | 2 | 5.0 | 0% |

**Diagnosis**

This is an intent mismatch at the top of the page. The ranking queries are very specific FFmpeg syntax questions. The page is broad, but searchers need the command immediately.

**Action**

Retarget the first screen and keep the broader guide:

- Add a top answer block with the exact FFmpeg command:
  `ffmpeg -i input.mp4 -vf "unsharp=5:5:1.0:5:5:0.0" output.mp4`
- Explain each parameter in a compact table.
- Add presets for mild, medium, and strong sharpening.
- Add a warning about halos/noise/flicker.
- Keep AI/manual workflow sections below the FFmpeg answer.

**Do not push until:** the page earns clicks from the FFmpeg syntax queries or broader "how to sharpen video" impressions grow.

## Recommended Work Order

1. **Repair `/comparisons-expanded/ai-models-comparison` metadata and page quality.** This has the largest current impression opportunity and clear production defects.
2. **Fix `/blog/photoshop-upscale-image` above-fold intent sequencing.** It has the strongest 90-day page-level demand among the blog targets.
3. **Retarget `/blog/sharpen-a-video` to answer FFmpeg syntax first.** Small page, but the fix is very specific.
4. **Refresh `/blog/topaz-denoise-ai` with a direct Topaz verdict and comparison table.** Useful page, but be honest about local/non-cloud intent.
5. **Resolve the enhancer cluster.** Keep `/blog/best-ai-image-enhancer` as the broad comparison page; consolidate or retarget `/blog/best-ai-image-quality-enhancer`; do not disturb the free sharpener page until its 2026-05-24/2026-05-19 changes are fully measured.

## What Not To Do

- Do not push internal links to these pages before fixing their first-screen intent.
- Do not publish another "best AI image enhancer" or "best free sharpener" article.
- Do not rewrite `/blog/best-free-ai-image-upscaler-2026-tested-compared`.
- Do not judge 2026-05-24 metadata changes from GSC data ending 2026-05-23.
