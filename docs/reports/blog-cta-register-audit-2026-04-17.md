# Blog Posts — Register CTA Audit

**Date:** 2026-04-17  
**Scope:** All published blog posts in `/content/blog/` (18 total)

## Summary

**Result: All 18 blog posts have at least one register CTA.**  
No posts are missing a register CTA.

---

## How Register CTAs Work

There are two sources of register CTAs on every blog post page:

| Source                    | Type               | Destination  | Notes            |
| ------------------------- | ------------------ | ------------ | ---------------- |
| MDX marker `[!CTA_TRY]`   | Inline CTA         | `/?signup=1` | Mid-article      |
| MDX marker `[!CTA_DEMO]`  | Demo CTA           | `/?signup=1` | Mid-article      |
| Page template (hardcoded) | Full-width section | `/?signup=1` | Always at bottom |

Note: `[!CTA_PRICING]` links to `/pricing`, **not** to signup — it is **not** a register CTA.

---

## Post-by-Post Breakdown

| Post                                                | CTA_TRY | CTA_DEMO | CTA_PRICING | Page Bottom | Has Register CTA? |
| --------------------------------------------------- | ------- | -------- | ----------- | ----------- | ----------------- |
| ai-image-enhancement-ecommerce-guide                | L39     | L109     | L277        | ✓           | **Yes**           |
| anime-upscaling-4k-art-guide                        | L37     | L126     | L471        | ✓           | **Yes**           |
| dalle-3-image-enhancement-guide                     | L52     | L169     | L398        | ✓           | **Yes**           |
| fix-blurry-photos-ai-methods-guide                  | L48     | L208     | —           | ✓           | **Yes**           |
| heic-iphone-photo-upscaling-guide                   | L38     | L111     | L438        | ✓           | **Yes**           |
| how-ai-image-upscaling-works-explained              | L40     | L99      | L170        | ✓           | **Yes**           |
| how-ai-image-upscaling-works-guide                  | L45     | L119     | L391        | ✓           | **Yes**           |
| how-to-upscale-images-without-losing-quality        | L33     | L137     | L178        | ✓           | **Yes**           |
| image-resolution-for-printing-complete-guide        | L43     | L119     | L322        | ✓           | **Yes**           |
| keep-text-sharp-when-upscaling-product-photos       | L51     | L146     | L300        | ✓           | **Yes**           |
| real-estate-photo-enhancement-guide                 | L45     | L197     | L643        | ✓           | **Yes**           |
| restore-old-photos-ai-enhancement-guide             | L53     | L114     | L241        | ✓           | **Yes**           |
| screenshot-upscaling-rescue-low-resolution-captures | L36     | L108     | L526        | ✓           | **Yes**           |
| social-media-image-sizes-guide-2025                 | L95     | L208     | L292        | ✓           | **Yes**           |
| stable-diffusion-upscaling-complete-guide           | L41     | L325     | L479        | ✓           | **Yes**           |
| upscale-midjourney-images-4k-8k-print-guide         | L47     | L150     | L400        | ✓           | **Yes**           |
| upscale-product-photos-amazon-etsy-guide            | L44     | L104     | L168        | ✓           | **Yes**           |
| why-upscaled-text-looks-blurry-how-to-fix           | L35     | L89      | L165        | ✓           | **Yes**           |

---

## Observations

- **`fix-blurry-photos-ai-methods-guide`** is the only post missing a `CTA_PRICING` marker, but it still has two in-content register CTAs (TRY + DEMO) plus the page-level bottom CTA. Not a gap.
- Every post page always renders the hardcoded bottom section (`/?signup=1`) regardless of MDX content, so even a post with zero inline markers would still have a register CTA.
