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
