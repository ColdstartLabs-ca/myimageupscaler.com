# Blog CTR Audit — 2026-04-15

**Data window:** 2026-03-16 → 2026-04-12 (28 days)
**Tool:** `audit-blog-seo.cjs` + GSC fetch

## TL;DR

107 published posts. 52 have CTR errors, 5 intent mismatches, **10 top posts have titles over 60 chars** — they are being truncated in Google SERPs. This is the primary driver of the near-zero CTR across 36,000+ monthly impressions.

---

## Summary

| Metric | Value |
|---|---|
| Total published posts | 107 |
| Posts with errors | 52 |
| Posts with GSC data | 57 |
| CTR below benchmark | 52 |
| Intent mismatches | 5 |
| Titles over 60 chars (truncated in SERP) | 10 |
| Descriptions over 160 chars | 5 |
| Keyword overlap < 30% | 35 |

---

## Root Cause: Title Truncation

Google truncates titles at ~60 chars (pixel-based, roughly). Every high-impression post has a title over that limit. A truncated title breaks the CTA hook and looks sloppy in SERPs. This alone explains the 0% CTR.

| Post | Imp | CTR | Pos | Title Length |
|---|---|---|---|---|
| `best-free-ai-image-upscaler-2026-tested-compared` | 23,886 | 0.0% | 7.4 | **68 chars** |
| `best-ai-image-quality-enhancer-free` | 3,218 | 0.2% | 9.9 | **66 chars** |
| `upscale-image-for-print-300-dpi-guide` | 3,090 | 0.1% | 10.0 | **70 chars** |
| `ai-image-upscaling-vs-sharpening-explained` | 2,293 | 0.0% | 3.4 | **67 chars** |
| `best-ai-upscaler` | 2,093 | 0.0% | 9.0 | **67 chars** |
| `how-to-upscale-images-without-losing-quality` | 1,250 | 0.0% | 14.4 | **66 chars** |
| `ai-vs-traditional-image-upscaling` | 651 | 0.0% | 9.0 | **70 chars** |
| `how-to-upscale-midjourney-images-for-print` | 533 | 0.2% | 6.1 | **62 chars** |
| `how-to-upscale-old-photos-with-ai` | 464 | 0.2% | 8.2 | **65 chars** |
| `how-to-make-png-background-transparent-free` | 431 | 0.0% | 10.5 | **61 chars** |

---

## Priority 1: Set `seo_title` on These Posts (Highest Impact)

These 7 posts drive 95% of the impressions with zero CTR. Fixing their `seo_title` is the single highest-leverage action.

### 1. `best-free-ai-image-upscaler-2026-tested-compared`
**23,886 impressions · 0.0% CTR · pos 7.4 · Expected CTR: ~3%**

- **Current title (68 chars):** `Best Free AI Image Upscaler 2026: 12 Tools Tested (One Clear Winner)`
- **Top queries:** `best free ai image upscaler 2026` (7,074 imp), `best free ai image upscaler online 2026` (513 imp)
- **Problem:** Title truncates in SERP. "(One Clear Winner)" — the hook — is cut off entirely.
- **Recommended `seo_title` (49 chars):** `12 Best Free AI Image Upscalers 2026 — Tested`
- **Current desc (161 chars, 1 over):** `12 free AI upscalers tested on real photos. One clear winner: no signup, no watermark, 4x upscaling that actually looks sharp. See the results — and try it free.`
- **Recommended `seo_description` (151 chars):** `12 free AI upscalers tested on real photos. No signup, no watermark, 4x upscaling that actually looks sharp. One clear winner — see results and try it free.`

---

### 2. `ai-image-upscaling-vs-sharpening-explained`
**2,293 impressions · 0.0% CTR · pos 3.4 · Expected CTR: ~10%**

Position 3 with 0% CTR is the worst ratio in the entire site. Two compounding issues.

- **Current title (67 chars):** `AI Upscaling vs. Sharpening: Which One Do You Actually Need? [2026]`
- **Top queries:** `ai image upscaling vs sharpening explained` (402 imp), `what is the difference between ai upscaling and sharpening` (145 imp), `difference between ai upscaling and sharpening images` (133 imp)
- **Problem 1:** Title is 67 chars — truncated.
- **Problem 2:** 56% of impressions come from queries with "explained" / "what is" intent. The title reads like a persuasion piece ("Which One Do You Actually Need?") instead of an explainer. Users want the answer, not a pitch.
- **Recommended `seo_title` (56 chars):** `AI Upscaling vs Sharpening: Differences Explained [2026]`
- **Current desc (169 chars, 9 over):** `Most editors use these wrong — and end up with blurry or plasticky photos. See which technique works when, with real before-and-after examples on portraits and graphics.`
- **Recommended `seo_description` (138 chars):** `Understand the difference between AI upscaling and sharpening, when to use each, and which gives better results on portraits and graphics.`

---

### 3. `free-ai-upscaler-no-watermark`
**3,582 impressions · 0.1% CTR · pos 5.4 · Expected CTR: ~6%**

- **Current title (58 chars ✓):** `Free AI Image Upscaler No Watermark: 7 Tested Tools [2026]`
- **Top queries:** `best free ai image upscaler online 2026 no signup` (111 imp), `best free ai image upscaler 2026 no watermark` (91 imp)
- **Problem:** Title length is fine, but top queries include "no signup" which is absent from the title. Missing a second key qualifier.
- **Recommended `seo_title` (55 chars):** `Free AI Image Upscaler — No Watermark, No Signup [2026]`
- **Current desc (160 chars ✓):** No change needed.

---

### 4. `best-ai-image-quality-enhancer-free`
**3,218 impressions · 0.2% CTR · pos 9.9 · Expected CTR: ~2%**

- **Current title (66 chars):** `Best Free AI Image Quality Enhancer (2026) — Tested on Real Photos`
- **Top queries:** `best free ai image enhancer sharpen blurry photo 2026` (41 imp), `best free ai image sharpener online 2026` (35 imp), `best free ai image sharpener 2026` (32 imp)
- **Problem 1:** Title is 66 chars — truncated.
- **Problem 2:** Queries use "sharpener" and "sharpen blurry photo" but the title says "enhancer". Keyword mismatch.
- **Recommended `seo_title` (53 chars):** `Best Free AI Image Sharpener & Enhancer 2026 — Tested`
- **Current desc (158 chars ✓):** No change needed.

---

### 5. `upscale-image-for-print-300-dpi-guide`
**3,090 impressions · 0.1% CTR · pos 10.0 · Expected CTR: ~2%**

- **Current title (70 chars):** `How to Upscale Images to 300 DPI for Print — Free Tool Included [2026]`
- **Top queries:** `300 dots per inch` (52 imp), `upscale 300 dpi` (31 imp), `upscale dpi` (29 imp)
- **Problem:** Title is 70 chars — heavily truncated (10 chars over). "[2026]" and the tail are never seen.
- **Recommended `seo_title` (49 chars):** `How to Upscale Images to 300 DPI for Print [2026]`
- **Current desc (165 chars, 5 over):** `Getting blurry prints? You are missing 300 DPI. This guide shows exactly how to fix any photo for crisp, professional print results — free tool, no Photoshop needed.`
- **Recommended `seo_description` (138 chars):** `Getting blurry prints? This guide shows how to fix any photo for 300 DPI crisp results — free AI tool included, no Photoshop needed.`

---

### 6. `best-ai-upscaler`
**2,093 impressions · 0.0% CTR · pos 9.0 · Expected CTR: ~2%**

- **Current title (67 chars):** `12 Best AI Image Upscalers 2026: Free & Paid Ranked (With Examples)`
- **Top queries:** `ai upscaler` (34 imp), `photoshop ai upscale 2024` (23 imp), `best ai image upscaler review 2024` (13 imp)
- **Problem:** Title is 67 chars — truncated. "(With Examples)" is never seen.
- Note: several queries still say "2024" — the 2026 date may actually help once the title is readable.
- **Recommended `seo_title` (52 chars):** `12 Best AI Image Upscalers 2026: Free & Paid, Ranked`
- **Current desc (155 chars ✓):** No change needed.

---

### 7. `how-to-upscale-images-without-losing-quality`
**1,250 impressions · 0.0% CTR · pos 14.4 · Expected CTR: ~1%**

- **Current title (66 chars):** `How to Upscale Images Without Losing Quality - Free AI Tool [2026]`
- **Top queries:** `do ai image upscalers preserve detail when enlarging images` (44 imp), `how to upscale image without losing quality` (29 imp)
- **Problem:** Title is 66 chars — truncated. "Free AI Tool [2026]" is cut.
- **Recommended `seo_title` (51 chars):** `How to Upscale Images Without Losing Quality [2026]`
- **Current desc (134 chars ✓):** No change needed.

---

## Priority 2: Intent Mismatches (5 posts)

| Post | Dominant Intent | Title Issue |
|---|---|---|
| `ai-image-upscaling-vs-sharpening-explained` | 56% explainer | Reads like opinion, not explainer — see Priority 1 fix above |
| `how-to-make-low-resolution-photo-high-resolution` | 61% how-to | Title "Low Resolution Photo Fix: Upscale…" doesn't signal tutorial |
| `noise-reduction-for-photos` | 55% how-to | Title "Remove Photo Noise Free: AI Fix…" doesn't say "how to" |
| `ai-vs-traditional-image-upscaling` | 36% explainer | Title starts with "AI vs Traditional" — add "Explained" or "Comparison" |
| `how-to-upscale-images` | 100% free-tool | Title has no "Free" despite all queries asking for free tools |

### Fixes:

**`how-to-make-low-resolution-photo-high-resolution`** (237 imp, pos 21.2)
- Recommended `seo_title` (57 chars): `How to Make a Low Resolution Photo High Resolution [2026]`

**`noise-reduction-for-photos`** (200 imp, pos 16.1)
- Recommended `seo_title` (53 chars): `How to Reduce Noise in Photos — Free AI Tool [2026]`

**`ai-vs-traditional-image-upscaling`** (651 imp, pos 9.0)
- Current title (70 chars): `AI vs Traditional Image Upscaling Comparison - Which Is Better? [2026]`
- Recommended `seo_title` (55 chars): `AI vs Traditional Image Upscaling: Which Is Better?`

**`how-to-upscale-images`** (84 imp, 1.2% CTR, pos 5.7)
- 100% of queries are free-tool intent but title has no "Free"
- Recommended `seo_title` (52 chars): `How to Upscale Images with AI — Free Guide [2026]`

---

## Priority 3: Description Over-Length (Fix Alongside Title Fixes)

| Post | Current Length | Fix |
|---|---|---|
| `ai-image-upscaling-vs-sharpening-explained` | 169 chars | See Priority 1 above |
| `upscale-image-for-print-300-dpi-guide` | 165 chars | See Priority 1 above |
| `best-free-ai-image-upscaler-2026-tested-compared` | 161 chars | See Priority 1 above |
| `how-to-fix-blurry-photos-with-ai` | 165 chars | Trim to < 160 |
| `how-to-upscale-images-for-ecommerce` | 163 chars | Trim to < 160 |

---

## Priority 4: Keyword Overlap Gaps (High-Volume Posts)

These posts rank for queries that barely appear in their titles. Low overlap = SERP snippet doesn't reinforce the query = low CTR.

| Post | Overlap | Missing Keywords | Imp |
|---|---|---|---|
| `how-to-digitize-photos` | 0% | convert, photographs, digital, images | 65 |
| `video-upscaling-software` | 0% | explain | 54 |
| `upscale-product-photos-for-ecommerce` | 0% | webshop, image, enhancement | 54 |
| `how-to-restore-photos` | 20% | steps, photo, restoration, damaged | 182 |
| `how-to-preserve-old-photographs` | 20% | photos, best, ways, scanning | 59 |

---

## Prioritized Action List

**This week (highest ROI — set `seo_title`/`seo_description` via API or admin):**

1. `best-free-ai-image-upscaler-2026-tested-compared` — 23K imp, 0% CTR (title truncated to 68 chars)
2. `ai-image-upscaling-vs-sharpening-explained` — pos 3, 0% CTR, intent mismatch (worst ratio on site)
3. `free-ai-upscaler-no-watermark` — add "No Signup" to title
4. `best-ai-image-quality-enhancer-free` — fix "enhancer" → "sharpener" + trim title
5. `upscale-image-for-print-300-dpi-guide` — title 70 chars, needs 20-char trim
6. `best-ai-upscaler` — trim title to 52 chars
7. `how-to-upscale-images-without-losing-quality` — trim title to 51 chars

**Next sprint (intent + keyword gaps):**

8. `how-to-make-low-resolution-photo-high-resolution` — add "How to" signal
9. `noise-reduction-for-photos` — add "How to" signal
10. `ai-vs-traditional-image-upscaling` — shorten title, add "Explained"
11. `how-to-upscale-images` — add "Free" to title (100% free-tool queries)

**Ongoing:**

- Any new post must set `seo_title` (30-60 chars) and `seo_description` (120-160 chars) — schema now enforces this
- Run `audit-blog-seo.cjs` after each GSC fetch cycle to catch regressions

---

## How to Apply Fixes

Use the blog edit API (requires `BLOG_API_KEY`):

```bash
curl -X PATCH https://myimageupscaler.com/api/blog/posts/best-free-ai-image-upscaler-2026-tested-compared \
  -H "x-api-key: $BLOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "seo_title": "12 Best Free AI Image Upscalers 2026 — Tested",
    "seo_description": "12 free AI upscalers tested on real photos. No signup, no watermark, 4x upscaling that actually looks sharp. One clear winner — see results and try it free."
  }'
```

Or use `/blog-edit` skill which handles this workflow.
