# Three Kings Skill Run — myimageupscaler.com — 2026-05-14

**Skill:** `.claude/skills/seo-content-3-kings-technique/`  
**GSC export:** `/tmp/gsc-miu-3kings-2026-05-14.json`  
**Blog audit export:** `/tmp/blog-audit-miu-3kings-2026-05-14.json`  
**GSC period:** 2026-04-14 to 2026-05-11, 28 days, Pacific time. GSC lags 3 days.  
**Sitewide web baseline:** 1,932 clicks, 77,491 impressions, 2.49% CTR, average position 10.70.

## Executive Decision

There is **not** a clean case to immediately rewrite the biggest Three Kings pages again. The top opportunities still show ugly GSC numbers, but the strongest pages were refreshed too recently for GSC to reflect the changes.

**Best move now:**

1. **Do not rewrite the May 6 / May 12 refreshed pages yet.** Request indexing and wait for 14 complete GSC days.
2. **Do update older, non-recent pages where the Three Kings clearly miss the ranking query**, especially:
   - `/blog/best-ai-upscaler`
   - `/blog/topaz-video-upscaler`
   - `/blog/how-to-upscale-anime-images-with-ai`
3. **Ignore GSC rows for redirected/canonicalized URLs as lag**, especially `/blog/photo-enhancement-upscaling-vs-quality`, which production now redirects to `/blog/ai-image-upscaling-vs-sharpening-explained`.

## Recent-Change Safeguard

The current GSC period ends on 2026-05-11, so it largely **does not measure** the 2026-05-12 Supabase-backed blog refreshes and only partially measures May 6 work.

Recent backlog evidence:

- 2026-05-12 refreshed `best-free-ai-image-upscaler-2026-tested-compared` with Three Kings/modifier work, short-answer block, comparison table, FAQs, canonical sharpening link, and metadata.
- 2026-05-06 refreshed 5 blog posts with Three Kings updates and added featured-snippet support to `ai-image-upscaling-vs-sharpening-explained`.
- 2026-05-13 reports explicitly say to request indexing and re-run after 2026-05-16 to 2026-05-19, when GSC can begin reflecting May 12 changes.

## Top Query-Page Opportunities

These are non-branded query/page rows with average position 5–15 and at least 100 impressions, sorted by impressions.

- `best free ai image upscaler 2026`
  - Page: `/blog/best-free-ai-image-upscaler-2026-tested-compared`
  - 3,205 impressions, 0 clicks, position 8.4, CTR 0.00%
  - Decision: **defer**, page was refreshed May 12.

- `best free image upscaler 2026`
  - Page: `/blog/best-free-ai-image-upscaler-2026-tested-compared`
  - 625 impressions, 0 clicks, position 8.8, CTR 0.00%
  - Decision: **defer**, same page and same recent refresh.

- `what is the difference between ai upscaling and sharpening`
  - Page: `/blog/ai-image-upscaling-vs-sharpening-explained`
  - 454 impressions, 0 clicks, position 5.3, CTR 0.00%
  - Decision: **defer**, page had May 6 featured-snippet/Three Kings support and the old competing URL now redirects.

- `best free ai image upscaler online 2026`
  - Page: `/blog/best-free-ai-image-upscaler-2026-tested-compared`
  - 445 impressions, 0 clicks, position 10.1, CTR 0.00%
  - Decision: **defer**, May 12 refresh.

- `best ai image upscaler online free 2026`
  - Page: `/blog/best-free-ai-image-upscaler-2026-tested-compared`
  - 421 impressions, 0 clicks, position 8.9, CTR 0.00%
  - Decision: **defer**, May 12 refresh.

- `best free ai image sharpener online 2026`
  - Page: `/blog/best-ai-image-quality-enhancer-free`
  - 186 impressions, 0 clicks, position 9.2, CTR 0.00%
  - Decision: **watch**, Three Kings are currently aligned, but content/media gap may be real if no post-refresh lift.

- `ai image upscaling vs sharpening explained`
  - Page: `/blog/photo-enhancement-upscaling-vs-quality`
  - 175 impressions, 0 clicks, position 8.6, CTR 0.00%
  - Decision: **ignore as GSC lag**, production redirects this URL to `/blog/ai-image-upscaling-vs-sharpening-explained`.

- `top ai image upscaler websites`
  - Page: `/blog/best-ai-upscaler`
  - 124 impressions, 0 clicks, position 9.3, CTR 0.00%
  - Decision: **actionable**, older page and query intent is not fully reflected in Three Kings.

## Current Three Kings Audit

### 1. `/blog/best-free-ai-image-upscaler-2026-tested-compared`

**Primary query:** `best free ai image upscaler 2026`  
**GSC signal:** 20,405 page impressions, 16 clicks, position 7.9, CTR 0.08%.

Current production scrape:

- Title: `Best Free AI Image Upscaler Online 2026: 12 Tested | MyImageUpscaler`
- Meta description: `Compare 12 free AI image upscalers online for 2026: no signup, no watermark, 4K/8K output, speed, free limits, and realistic detail.`
- H1: `Best Free AI Image Upscaler Online 2026: 12 Tested`
- First paragraph: `Compare 12 free AI image upscalers online for 2026: no signup, no watermark, 4K/8K output, speed, free limits, and realistic detail.`

Diagnosis:

- The Three Kings are now strongly aligned with the query family.
- The exact phrase is not perfectly contiguous in the first paragraph because it says plural `upscalers online for 2026`, but this is not worth another immediate rewrite after the May 12 refresh.
- Current GSC data ends before the May 12 change can be measured.

Decision: **no copy change now**.

Next action:

- Request indexing manually in GSC if not already done.
- Recheck after 14 complete GSC days from deploy/indexing.
- If still at ~position 8 with CTR under 0.5%, test a title that reduces ambiguity and pushes the no-signup/no-watermark differentiator harder.

Possible later test, not now:

```text
Title: Best Free AI Image Upscaler 2026: No Signup Tests
H1: Best Free AI Image Upscaler 2026: No Signup, No Watermark, 8K Tests
First sentence: We tested the best free AI image upscaler options for 2026 by signup requirements, watermark policy, 4K/8K output, speed, and realistic detail.
```

### 2. `/blog/ai-image-upscaling-vs-sharpening-explained`

**Primary query:** `what is the difference between ai upscaling and sharpening`  
**GSC signal:** 2,222 page impressions, 1 click, position 4.6, CTR 0.05%. Exact query row has 454 impressions, 0 clicks, position 5.3.

Current production scrape:

- Title: `AI Upscaling vs Sharpening Explained: Key Difference | MyImageUpscaler`
- Meta description: `AI upscaling vs sharpening explained: which adds resolution, which improves edge clarity, when to use each, and the right order for better images.`
- H1: `AI Upscaling vs Sharpening Explained: Key Difference`
- First paragraph: `AI upscaling vs sharpening explained: which adds resolution, which improves edge clarity, when to use each, and the right order for better images.`

Diagnosis:

- The Three Kings are aligned for `ai upscaling vs sharpening explained`.
- The broader exact query `what is the difference between ai upscaling and sharpening` is not front-loaded in title/H1, but the current title is stronger and more concise.
- The old competing URL `/blog/photo-enhancement-upscaling-vs-quality` is still visible in GSC rows, but production redirects it to the explainer. Treat this as lag.

Decision: **no title/H1 change now**.

Next action:

- Request indexing for the canonical explainer and redirected old URL if not done.
- Recheck after GSC catches up with the redirect.
- If CTR still stays near zero at position 2–5, add more visual examples rather than another Three Kings rewrite.

### 3. `/blog/best-ai-image-quality-enhancer-free`

**Primary query:** `best free ai image sharpener online 2026`  
**GSC signal:** 4,186 page impressions, 4 clicks, position 9.9, CTR 0.10%.

Current production scrape:

- Title: `Best Free AI Image Sharpener Online 2026: Tested | MyImageUpscaler`
- Meta description: `We tested free AI image sharpeners online in 2026 for blurry photos, unblur tools, noise, soft detail, and quality enhancement. See what worked.`
- H1: `Best Free AI Image Sharpener Online 2026: Tested`
- First paragraph: `We tested free AI image sharpeners online in 2026 for blurry photos, unblur tools, noise, soft detail, and quality enhancement. See what worked.`

Diagnosis:

- Three Kings are aligned with the top query family.
- The bigger issue is likely content proof/media depth, not keyword placement.

Decision: **do not rewrite immediately**.

Next action if no lift after the May changes settle:

- Add a direct comparison/results module with before/after examples for blurry photos.
- Add a short table comparing sharpen, unblur, noise reduction, face detail, and artifact risk.

## Competitive Gap Snapshot

I used a lightweight DDG SERP proxy for the top three results because the GSC skill itself does not provide live Google SERP HTML. Treat this as directional, not a final Google rank proof.

### `best free ai image upscaler 2026`

- Own page: ~1,975 words, 9 images.
- Proxy top-3 average: ~2,181 words, 3 images.
- Gap: **not a clear content-depth gap**. Own media count is already stronger than the proxy average.
- Recommendation: wait for indexing data, do not expand now.

### `what is the difference between ai upscaling and sharpening`

- Own page: ~1,587 words, 7 images.
- Proxy top-3 average: ~2,421 words, 23 images.
- Gap: **possible visual/media gap**, not necessarily a word-count gap.
- Missing themes seen in competitors: workflow example, traditional resize vs AI, sharpening workflow, tool examples, limitations/challenges.
- Recommendation: if CTR/rank do not lift, add visual workflow/examples rather than changing the title again.

### `best free ai image sharpener online 2026`

- Own page: ~1,483 words, 7 images.
- Proxy top-3 average: ~2,689 words, 31 images.
- Gap: **real media/content proof gap**.
- Missing themes seen in competitors: tested tool ranking, before/after examples, pros/cons by tool, use-case-specific recommendations, step-by-step enhancer/sharpener workflow.
- Recommendation: if no lift after 14 complete GSC days, add comparison proof and before/after examples.

## Actionable Three Kings Updates

These are the pages I would actually change next because they are not in the most recent refresh window and the ranking query is not fully reflected in the Three Kings.

### P1 — `/blog/best-ai-upscaler`

**Why:** 3,409 impressions, 0 clicks, position 9.0. Top query-page row in the 5–15 band is `top ai image upscaler websites`, and audit flags comparison intent.

Current:

```text
Title: Best AI Image Upscaler 2026: 12 Tools Tested
H1: Best AI Image Upscaler 2026: 12 Tools Tested
First paragraph: We tested 12 AI image upscalers on portraits, artwork, and scanned photos. Compare free and paid tools ranked by real output quality.
```

Recommended:

```text
Title: Top AI Image Upscaler Websites 2026: 12 Tested
H1: Top AI Image Upscaler Websites 2026: 12 Tested
First paragraph: We tested the top AI image upscaler websites for 2026 on portraits, artwork, and scanned photos, then compared free and paid tools by real output quality.
Meta description: Compare the top AI image upscaler websites for 2026 by quality, free limits, speed, artifacts, and best use case before you upload.
```

Expected impact:

- Better match for `top ai image upscaler websites` without cannibalizing the May 12 `best free` page.
- Gives this page a clearer role: broader top-sites comparison, not the free/no-signup canonical.

### P1 — `/blog/topaz-video-upscaler`

**Why:** 2,893 impressions, 1 click, position 8.5. Query family is clearly `Topaz Video AI 2026 update/latest version/features`; current title says review/pricing/alternatives but does not front-load update intent.

Recommended:

```text
Title: Topaz Video AI 2026 Update: Features & Alternatives
H1: Topaz Video AI 2026 Update: Features, Pricing, and Alternatives
First paragraph: The Topaz Video AI 2026 update changes what creators should expect from video upscaling, including feature updates, pricing, quality tradeoffs, and free alternatives.
Meta description: See what changed in the Topaz Video AI 2026 update, including features, pricing, upscaling quality, and free alternatives.
```

Expected impact:

- Stronger query match for `topaz video ai 2026 update` and `latest version features` rows.
- Keeps the page useful as a review/alternatives page.

### P2 — `/blog/how-to-upscale-anime-images-with-ai`

**Why:** 1,619 impressions, 0 clicks, position 7.2. Current title is close, but top query repeatedly includes `image upscaler for anime`.

Current:

```text
Title: Best Free AI Anime Image Upscaler 2026: No Blur
```

Recommended:

```text
Title: Best Free AI Image Upscaler for Anime 2026
H1: Best Free AI Image Upscaler for Anime 2026: No Blur
First paragraph: We tested the best free AI image upscaler for anime in 2026 on screenshots, fan art, wallpapers, and line art to see which tools avoid blur and jagged edges.
Meta description: Compare free AI image upscalers for anime in 2026 by line sharpness, color cleanup, no blur, no signup, and wallpaper output quality.
```

Expected impact:

- Better exact-match coverage for `best free ai image upscaler for anime 2026`.
- Low cannibalization risk because anime intent is distinct from the main best-free image-upscaler page.

### P3 — `/blog/upscale-image-online-free`

**Why:** 397 impressions, 0 clicks, position 6.6. Small but clean quick win. Top rows emphasize `no signup` and `no watermark`.

Recommended only if batching small updates:

```text
Title: Free Online Image Upscaler 2026: No Signup, No Watermark
H1: Free Online Image Upscaler 2026: No Signup, No Watermark
First paragraph: Use a free online image upscaler in 2026 with no signup and no watermark to enlarge JPEG, PNG, and WebP images for sharper 4K output.
```

## Do Not Touch Yet

- `/blog/best-free-ai-image-upscaler-2026-tested-compared`
  - Too recently refreshed. Wait for post-indexing GSC.

- `/blog/ai-image-upscaling-vs-sharpening-explained`
  - Current Three Kings are already aligned. Redirect lag is still present.

- `/blog/best-ai-image-quality-enhancer-free`
  - Three Kings are aligned. If it fails, fix proof/media depth rather than keyword placement.

- `/blog/photo-enhancement-upscaling-vs-quality`
  - Production redirects to `/blog/ai-image-upscaling-vs-sharpening-explained`; do not optimize the old URL.

## Indexing / Measurement Queue

Immediate operational queue:

1. Manually request indexing for the May 12 refreshed pages, especially:
   - `https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared`
   - `https://myimageupscaler.com/blog/ai-image-upscaling-vs-sharpening-explained`
   - `https://myimageupscaler.com/blog/best-ai-image-quality-enhancer-free`
2. Recheck after 14 complete GSC days from request/deploy.
3. Only then decide whether to add media/content depth to sharpener and upscaling-vs-sharpening pages.

## Implementation Checklist For Next Code/Content Pass

Status on 2026-05-14: implemented the recommended Three Kings updates through the Supabase blog API and documented the indexing follow-up.

- [x] Update `/blog/best-ai-upscaler` Three Kings.
- [x] Update `/blog/topaz-video-upscaler` Three Kings.
- [x] Optionally update `/blog/how-to-upscale-anime-images-with-ai` Three Kings.
- [x] Check P3 `/blog/upscale-image-online-free`. Skipped keeping changes because production redirects it to `/blog/free-ai-upscaler-no-watermark`.
- [x] Add tests/fixtures required by the blog refresh path. No code fixture change required; production Blog API GET/PATCH verification used for this Supabase-backed content refresh.
- [x] Update `docs/SEO/maintenance/seo-changes-backlog.md` with exact changed URLs.
- [x] Add changed URLs to `docs/SEO/maintenance/gsc-request-indexing-backlog.md` if manual submission is needed.
- [ ] Request indexing manually after deploy/content publish.
- [ ] Re-run GSC after 14 complete days.

## Bottom Line

There is action to take, but **not on the obvious largest page yet**. The top page still looks bad in GSC because the data window ends before the latest refresh. The best immediate Three Kings work is on older pages where query intent is visibly mismatched:

1. `/blog/best-ai-upscaler`
2. `/blog/topaz-video-upscaler`
3. `/blog/how-to-upscale-anime-images-with-ai`

The bigger May-refreshed pages should go through indexing and the 14-day loop before any more copy churn.
