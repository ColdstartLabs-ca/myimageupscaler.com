# Blog Edit Briefs — Phase 2 Three Kings Refreshes & Flagship Benchmark Template

**Status:** BRIEF ONLY. No API write. No page edited.
**Date:** 2026-11-21
**Source:** [PRD-TR-2026-11-03](03-money-pages-cwv-and-authority.md), [README.md](README.md), live pages fetched 2026-11-21.
**Applies via:** `.claude/skills/blog-edit/SKILL.md` (`PATCH /api/blog/posts/[slug]`).
**Format:** Three Kings = title, H1, first paragraph. Meta description added as required by this brief.

---

## 1. `/blog/free-ai-upscaler-no-watermark`

### Current live state (fetched 2026-11-21)

| Item             | Current value                                                                                                                                                                                                                                                     | Length |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| Title            | `Free AI Image Upscaler No Watermark: No Signup Test \| MyImageUpscaler`                                                                                                                                                                                          |     69 |
| Meta description | `Need a free AI image upscaler with no watermark? Compare clean exports, no-signup options, hidden limits, 4K/8K output, and quality tradeoffs.`                                                                                                                  |    142 |
| H1               | `Best Free AI Image Upscaler 2026: No Watermark`                                                                                                                                                                                                                  |      — |
| First paragraph  | `This guide compares the best free AI image upscaler options in 2026 that avoid watermarks, signup friction, hidden limits, and low-quality exports. We tested which tools give you clean enlarged images and which ones hide the useful download behind limits.` |      — |

**Why edit:** Page fell from `98 → 3` clicks since July (`35 → 3` in the 28-day window, `Oct 22–Nov 18`). The title splits intent across "no watermark" and "no signup test" and wastes pixels on a brand suffix.

**Target queries (PRD):** free / no-watermark upscaler intent. Exact query strings and volumes: TO VERIFY from the GSC query export.

### Ready-to-apply brief

| Field                                | New value                                                                                                                                                                                                                                                                                                          | Chars |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----: |
| Title (`seo_title`)                  | `Free AI Image Upscaler No Watermark: 2026 Test`                                                                                                                                                                                                                                                                   |    46 |
| Meta description (`seo_description`) | `Compare free AI image upscalers with no watermark. See clean exports, signup limits, 4K/8K output, and which tools hide the download behind a paywall. Try free now.`                                                                                                                                             |   155 |
| H1                                   | `Free AI Image Upscaler Without Watermark: 2026 Test`                                                                                                                                                                                                                                                              |     — |
| First paragraph                      | `Most free upscalers add a watermark, cap the download, or ask for an account. This guide tests the free AI image upscalers that return a clean file with no watermark, and shows which ones hide the real limit until you upload. You get the test result for each tool and a free path to try the workflow now.` |     — |

**Rules:** Keep "free" in title, H1, meta, and first paragraph. Do not hardcode "5 free credits"; credits are region-tiered (`5 / 3 / 0`). Do not claim a new benchmark number. Do not remove the existing tool comparison structure.

---

## 2. `/blog/how-to-upscale-dalle-images`

### Current live state (fetched 2026-11-21)

| Item             | Current value                                                                                                                                                                                                                                                                                                                             | Length |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| Title            | `How to Upscale DALL-E Images to 4K+ Free [2026] \| MyImageUpscaler`                                                                                                                                                                                                                                                                      |     65 |
| Meta description | `DALL-E outputs 1024x1024 max. Upscale DALL-E 2 and DALL-E 3 images to 4K or 8K with AI — no quality loss, no signup. Try free now.`                                                                                                                                                                                                      |    130 |
| H1               | `How to Upscale DALL-E Images: Fix Pixelation in AI Art [2026]`                                                                                                                                                                                                                                                                           |      — |
| First paragraph  | `DALL-E 3 is one of the best AI image generators out there — but every image it creates tops out at 1024x1024 pixels. That is fine for a social post. Try to print it, crop it, or use it in a client presentation, and suddenly you are staring at soft edges and visible artifacts. A dedicated DALL-E upscaler fixes that in seconds.` |      — |

**Why edit:** Page sits at position `4.1` with `0.74%` CTR and only `10%` title keyword overlap. It misses the "ChatGPT" query, even though users now ask how to upscale images from the ChatGPT image generator.

**Target queries (PRD):** DALL-E and ChatGPT image upscale intent. Exact query strings and volumes: TO VERIFY from the GSC query export.

### Ready-to-apply brief

| Field                                | New value                                                                                                                                                                                                                                                                                    | Chars |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: |
| Title (`seo_title`)                  | `Upscale ChatGPT and DALL-E Images to 4K Free [2026]`                                                                                                                                                                                                                                        |    51 |
| Meta description (`seo_description`) | `DALL-E and ChatGPT images top out at 1024x1024. Upscale them to 4K or 8K with AI, keep the detail, and avoid soft edges in print or crops. Try it free.`                                                                                                                                    |   152 |
| H1                                   | `How to Upscale ChatGPT and DALL-E Images to 4K [2026]`                                                                                                                                                                                                                                      |     — |
| First paragraph                      | `Images from ChatGPT and DALL-E 3 start at 1024x1024 pixels. That is enough for a social post, but not for print, a crop, or a client deck. This guide shows how to upscale DALL-E 2, DALL-E 3, and ChatGPT images to 4K with AI, keep the clean lines, and fix pixelation before it shows.` |     — |

**Rules:** Add "ChatGPT" to title, H1, and first paragraph. Keep "free" in title and meta. Keep the DALL-E 2 vs DALL-E 3 section. Do not attribute to ChatGPT a pixel size that the live page does not state. Do not hardcode "5 free credits".

---

## 3. Pre-apply gate (both pages)

- [ ] `yarn db:backup` completes and prints the new schema and data archive paths.
- [ ] `yarn db:backups` lists the new archives.
- [ ] `gzip -t` passes on both new archives.
- [ ] João signs off on the exact title, meta, H1, and first paragraph.
- [ ] GSC baseline is recorded for the 14-day readback.
  - `free-ai-upscaler-no-watermark`: `3` clicks / 28d (`35 → 3`, `98 → 3` since July).
  - `how-to-upscale-dalle-images`: position `4.1`, CTR `0.74%`, title keyword overlap `10%`.
- [ ] `docs/SEO/maintenance/seo-changes-backlog.md` gets one entry with the old and new strings and the apply date.
- [ ] One page per deploy. Read back after 14 days before the second page.

Do not apply while `/blog/topaz-labs-free-trial` (until Dec 7) or `/blog/tiktok-profile-picture-ideas` (until Nov 27) occupy an open rung window. These two pages are separate URLs, so no guardrail blocks them, but keep one edit per deploy.

---

## 4. Flagship `/blog/best-free-ai-image-upscaler-2026-tested-compared` — template only

**DO NOT EDIT BEFORE 2026-11-26.** The page fell from `8–11` clicks/day (`Nov 5–10`) to `0–2` clicks/day (`Nov 15–18`), `58 → 15` clicks WoW, position `6.9`, under `13.6K` AI impressions. Wait for the Nov 26 readback that confirms the drop. Then ship real captures, not forecasts.

### 5-image benchmark table template

Each cell holds four capture fields: `100% crop`, `time (s)`, `free limit`, `watermark y/n`. Every field starts as `TO CAPTURE`.

| Input image        | MyImageUpscaler                                                                             | Upscale.media                                                                           | Upscayl                                                                                 | Krea                                                                                    | Pixelcut                                                                                | Bigjpg                                                                                  | Adobe Firefly                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Portrait           | crop: TO CAPTURE<br>time (s): TO CAPTURE<br>free limit: TO CAPTURE<br>watermark: TO CAPTURE | crop: TO CAPTURE<br>time: TO CAPTURE<br>free limit: TO CAPTURE<br>watermark: TO CAPTURE | crop: TO CAPTURE<br>time: TO CAPTURE<br>free limit: TO CAPTURE<br>watermark: TO CAPTURE | crop: TO CAPTURE<br>time: TO CAPTURE<br>free limit: TO CAPTURE<br>watermark: TO CAPTURE | crop: TO CAPTURE<br>time: TO CAPTURE<br>free limit: TO CAPTURE<br>watermark: TO CAPTURE | crop: TO CAPTURE<br>time: TO CAPTURE<br>free limit: TO CAPTURE<br>watermark: TO CAPTURE | crop: TO CAPTURE<br>time: TO CAPTURE<br>free limit: TO CAPTURE<br>watermark: TO CAPTURE |
| Blurry text / logo | TO CAPTURE                                                                                  | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              |
| Anime / line art   | TO CAPTURE                                                                                  | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              |
| Product shot       | TO CAPTURE                                                                                  | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              |
| 300-DPI print      | TO CAPTURE                                                                                  | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              | TO CAPTURE                                                                              |

Rows 2–5 use the same four-field cell format as row 1.

### Capture protocol

1. Use one source file per row. Keep the original file and its hash.
2. Use the same scale on every tool. Record the scale actually applied (for example `4x`). Do not compare a `2x` result with a `4x` result.
3. Record the UTC date, the tool name, the plan tier, and the browser.
4. Capture a `100%` crop from the same image region on every tool.
5. Record wall-clock time from upload start to download ready. Run once, then repeat once and keep both times.
6. Record the observed free limit: max size, daily cap, signup wall, or paywall.
7. Record watermark `y` or `n` on the exported file.
8. Name screenshots `bench-{YYYY-MM-DD}-{row}-{tool}-crop.png` and `bench-{YYYY-MM-DD}-{row}-{tool}-original.png`.
9. Store files in one folder per capture date. Do not publish a cell without its file.

### JSON-LD note

Add `ItemList` or `Review` structured data only after the captures exist. Each item must point to a real captured result and a real rating basis. No schema markup for missing data. No invented scores, prices, or free limits.

### Flagship gate

- [ ] Nov 26 GSC readback confirms the Nov 11–18 drop.
- [ ] All 20 row/tool cells captured with files.
- [ ] João signs off on the verdicts.
- [ ] One deploy, then a 14-day readback.
