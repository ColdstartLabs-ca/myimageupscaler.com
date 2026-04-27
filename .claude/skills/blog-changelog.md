# Blog Changelog

Track all blog changes made via skills. **Read the last 30 lines before starting. Append an entry when done.**

```bash
# Read recent changes
tail -60 .claude/skills/blog-changelog.md

# Append entry (adjust date/content as needed)
cat >> .claude/skills/blog-changelog.md << 'EOF'

## YYYY-MM-DD

### [Type]: [Short title]
**Affected:** [slug(s) or "N posts"]
**Why:** [1-2 sentences on the reasoning]
**Changes:**
- `slug` — what was done
EOF
```

---

## 2026-04-06

### SEO: CTR Fixes — Meta Descriptions Rewritten

**Affected:** 6 posts
**Why:** GSC showed 19k impressions/90d but near-zero CTR on top blog posts. Root causes: featured snippet trap (description answered the question directly) and descriptions lacking any hook or reason to click.
**Changes:**

- `best-free-ai-image-upscaler-2026-tested-compared` — Added "One Clear Winner" hook + "try it free" CTA
- `ai-image-upscaling-vs-sharpening-explained` — Broke featured snippet trap: old desc directly answered the question causing 0 clicks at pos 3.2; new desc creates curiosity instead
- `best-ai-upscaler` — Added "which ones to avoid" curiosity framing
- `upscale-image-for-print-300-dpi-guide` — Reframed around "blurry prints?" pain point
- `photo-enhancement-upscaling-vs-quality` — "Wrong choice makes it worse" framing
- `free-ai-upscaler-no-watermark` — Added "outperforms paid tools" differentiation claim

### SEO: Internal Links Added — Topical Cluster

**Affected:** 5 posts (13 links added)
**Why:** Top impression posts had zero cross-links despite covering tightly related topics. Created an upscaling topical cluster to distribute link equity and reduce bounce.
**Changes:**

- `best-free-ai-image-upscaler-2026-tested-compared` — 4 links added: → photo-enhancement-upscaling-vs-quality, → upscale-image-for-print-300-dpi-guide, → how-to-upscale-anime-images-with-ai, → free-ai-upscaler-no-watermark
- `ai-image-upscaling-vs-sharpening-explained` — 2 links added: → upscale-image-for-print-300-dpi-guide, → photo-enhancement-upscaling-vs-quality
- `upscale-image-for-print-300-dpi-guide` — 3 links added: → ai-image-upscaling-vs-sharpening-explained, → why-photos-blurry-when-printed, → what-resolution-for-print
- `photo-enhancement-upscaling-vs-quality` — 3 links added: → best-free-ai-image-upscaler-2026-tested-compared, → ai-image-upscaling-vs-sharpening-explained, → how-to-fix-a-grainy-photo
- `free-ai-upscaler-no-watermark` — 2 links added: → best-free-ai-image-upscaler-2026-tested-compared, → best-free-ai-image-upscaler-tools-2026

## 2026-04-06

### SEO: Cannibalization Fix — Unpublish + 301 Redirect Duplicate Posts

**Affected:** 3 posts unpublished, 6 redirect rules added (3 slugs + locale variants)
**Why:** GSC confirmed 3 pairs of posts competing for the same queries, splitting authority and preventing any from ranking well. Kept the stronger canonical in each pair; redirected duplicates.
**Changes:**

- `best-free-ai-image-upscaler-tools-2026` — unpublished → 301 to `best-free-ai-image-upscaler-2026-tested-compared`
- `best-image-upscaling-tools-2026` — unpublished → 301 to `best-free-ai-image-upscaler-2026-tested-compared`
- `photo-enhancement-upscaling-vs-quality` — unpublished → 301 to `ai-image-upscaling-vs-sharpening-explained` (pos 3.2, clearly preferred by Google)
- `next.config.js` — added 6 permanent redirect rules (slug + locale-prefixed variants)

## 2026-04-15

### SEO: SERP title truncation fixes (13 posts)

**Affected:** best-free-ai-image-upscaler-2026-tested-compared, ai-image-upscaling-vs-sharpening-explained, free-ai-upscaler-no-watermark, best-ai-image-quality-enhancer-free, upscale-image-for-print-300-dpi-guide, best-ai-upscaler, how-to-upscale-images-without-losing-quality, how-to-make-low-resolution-photo-high-resolution, noise-reduction-for-photos, ai-vs-traditional-image-upscaling, how-to-upscale-images, how-to-fix-blurry-photos-with-ai, how-to-upscale-images-for-ecommerce
**Why:** GSC audit (blog-ctr-audit-2026-04-15.md) revealed 36,000+ monthly impressions with near-zero CTR driven by SERP title truncation. Top posts had titles 60-70 chars (Google truncates at ~60). Also fixed 5 intent mismatches (titles not matching dominant query intent) and 2 over-length descriptions.
**Changes:**

- `best-free-ai-image-upscaler-2026-tested-compared` — seo_title 68→49 chars, seo_description 161→151 chars
- `ai-image-upscaling-vs-sharpening-explained` — seo_title 67→56 chars (intent: opinion→explainer), seo_description 169→138 chars
- `free-ai-upscaler-no-watermark` — seo_title: added "No Signup" qualifier (55 chars)
- `best-ai-image-quality-enhancer-free` — seo_title 66→53 chars, fixed "enhancer"→"sharpener" keyword mismatch
- `upscale-image-for-print-300-dpi-guide` — seo_title 70→49 chars, seo_description 165→138 chars
- `best-ai-upscaler` — seo_title 67→52 chars
- `how-to-upscale-images-without-losing-quality` — seo_title 66→51 chars
- `how-to-make-low-resolution-photo-high-resolution` — seo_title: added "How to" signal for 61% how-to intent
- `noise-reduction-for-photos` — seo_title: added "How to" signal for 55% how-to intent
- `ai-vs-traditional-image-upscaling` — seo_title 70→51 chars
- `how-to-upscale-images` — seo_title: added "Free" for 100% free-tool intent
- `how-to-fix-blurry-photos-with-ai` — seo_description 165→152 chars
- `how-to-upscale-images-for-ecommerce` — seo_description 163→157 chars

## 2026-04-23

### SEO: CTR Quick Wins — Title/Meta Rewrites for 9 Posts (GSC+GA4 Data-Driven)

**Affected:** best-free-ai-image-upscaler-2026-tested-compared, ai-image-upscaling-vs-sharpening-explained, free-ai-upscaler-no-watermark, upscale-image-for-print-300-dpi-guide, best-ai-image-quality-enhancer-free, ai-vs-traditional-image-upscaling, noise-reduction-in-image, gif-upscaler, how-to-enhance-image-quality-with-ai
**Why:** GSC+GA4 analysis revealed top 5 blog posts at positions 3-10 with 0.00-0.29% CTR (expected 2-12%). Combined 47K impressions generating only 26 clicks. AI Overviews confirmed on 3 of 4 key queries. Applied contrarian/proof/curiosity title strategies to differentiate from AI Overview answers. Also fixed 4 intent mismatches flagged by blog audit.
**Changes:**

CTR deficit fixes (seo_title + seo_description):

- `best-free-ai-image-upscaler-2026-tested-compared` — "12 Free AI Upscalers Tested — Only 3 Are Worth Using" + contrarian description (30,908 impr → target 2% CTR)
- `ai-image-upscaling-vs-sharpening-explained` — "AI Upscaling vs Sharpening: Which Fixes Blurry Photos?" + practical decision guide description (3,195 impr, 0 clicks at pos 3.7)
- `free-ai-upscaler-no-watermark` — "Free AI Image Upscaler — No Watermark, No Signup, Instant" + action-oriented description (4,635 impr)
- `upscale-image-for-print-300-dpi-guide` — "Upscale Any Photo to 300 DPI for Print — Free AI Tool" + use-case description (3,052 impr)
- `best-ai-image-quality-enhancer-free` — "Best Free AI Image Quality Enhancer (Tested May 2026)" + social proof description (5,607 impr)

Intent mismatch fixes (seo_title only):

- `ai-vs-traditional-image-upscaling` — "AI vs Traditional Upscaling Explained — Which Works Better?" (explainer intent 38%)
- `noise-reduction-in-image` — "What Is Noise Reduction in Images? How to Fix Grainy Photos" (explainer intent 100%)
- `gif-upscaler` — "Free GIF Upscaler: Enhance Animated GIFs with AI" (free-tool intent 100%)
- `how-to-enhance-image-quality-with-ai` — "AI Image Enhancers Compared: Which Improves Quality?" (comparison intent 100%)

### Tools Enhancement

- `ga-fetch.cjs` — Fixed (not set) landing pages: switched from `landingPagePlusQueryString` to `pagePath` with auto-fallback. Result: 0% (not set), 216 pages with 4,436 sessions (was 89% not set)
- `audit-blog-seo.cjs` — Added `--suggest` flag generating title/meta candidates per flagged post
- `ctr-tracker.cjs` — New script for before/after CTR measurement with snapshot tracking
- Baseline snapshot captured: 26 clicks / 47,397 impressions / 1,740 missed clicks (top 5 posts)

## 2026-04-23

### SEO: Phase 3B — pSEO Meta Description Audit (160 descriptions fixed)

**Affected:** 23 pSEO data files, ~160 meta descriptions
**Why:** PRD Phase 3B flagged that AI tool pages claimed "free" unconditionally without mentioning the credit/signup model. Users hitting a credit wall after clicking "free tool" links drives high bounce and trust loss.
**Changes:**

- Replaced "Free online tool." → "Free for your first images." across all AI-powered tool pages
- Replaced "Try free!" / "Try it free!" → "Free for your first images." where used as an unconditional free claim
- Intentionally skipped genuinely free browser-based tools: social-media-resize.json (resizers), bulk-tools.json (bulk resizer with "no upload"), free.json (background remover with "no signup"), interactive-tools.json format converters (PNG→JPG etc.)
- Files updated: ai-features, alternatives, bulk-tools, camera-raw, comparison, comparisons-expanded, competitor-comparisons, content, device-specific, device-use, format-conversion, format-scale, formats, free, guides, industry-insights, personas-expanded, photo-restoration, platform-format, platforms, scale, technical-guides, tools, use-cases, use-cases-expanded

## 2026-04-26

### SEO: CTR Fix — GSC Keyword Gap Resolution for 32K Impression Post

**Affected:** best-free-ai-image-upscaler-2026-tested-compared
**Why:** 32,377 impressions with only 9 clicks (0.03% CTR) at position 7.5. Only 20% keyword overlap with top GSC queries. Missing keywords: best, image, upscaler, 2026, online, tools, signup, myimageupscaler. CTR at positions 8-10 was 0.0% vs expected 2-3%.
**Changes:**

- `best-free-ai-image-upscaler-2026-tested-compared` — seo_title 47→59 chars, seo_description 141→136 chars
- New seo_title: "Best Free AI Image Upscaler 2026: Tested, No Signup, Online" (includes all top GSC query keywords)

## 2026-04-27

### SEO: Content Gap Fixes — Feature Synonyms + 4K/8K + Modifier Coverage

**Affected:** best-free-ai-image-upscaler-2026-tested-compared
**Why:** /content-gap analysis (90-day GSC pull) identified 3 content-level gaps in the high-impression post: "denoiser/sharpener/deblurrer/enlarger" feature synonyms absent from page (124 impressions), no "4K/8K" resolution mentions despite 262 impressions for those queries, and no explicit "no registration" language (39 impressions). Snippet/seo_title already updated on 04-26.
**Changes:**

- `best-free-ai-image-upscaler-2026-tested-compared` — intro: "upscaler websites in 2026 let you upscale images to 4K or 8K resolution" (adds websites + 4K/8K)
- `best-free-ai-image-upscaler-2026-tested-compared` — "When You Need More" section: "AI denoising, deblurring, sharpening, image enlargement" replacing "noise reduction, sharpening" (adds denoiser/deblurrer/enlarger synonyms)
- `best-free-ai-image-upscaler-2026-tested-compared` — How to Use: "No account. No registration. No credit card." (adds registration)
- New seo_description: "We tested the best free AI image upscalers online in 2026. No signup, no watermarks. See which tools actually work for upscaling images." (strong CTA with missing keywords)
- H1 unchanged — already matches query intent
