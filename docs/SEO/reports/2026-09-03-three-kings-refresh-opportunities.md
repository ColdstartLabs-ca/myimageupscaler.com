# Three Kings Refresh — Low-Hanging Fruit Audit (2026-09-03)

Skill: `seo-content-3-kings-technique` (refresh mode)
Data window: 2026-08-04 → 2026-08-31 (28 complete GSC days), `web` search type, query+page rows.
Sources: `/tmp/gsc-miu-3kings.json` (full export), `/tmp/qp-3kings.json` (raw query+page at pos 5–15), `/tmp/ctr-miu.json` (CTR deficit tracker).

## Discovery

Raw query+page rows: 18,596 → filtered to **109 rows** at average position 5.0–15.0, ≥100 impressions, non-brand. Aggregated by page, then validated for intent fit and against the refresh changelog (`.claude/skills/blog-changelog.md`) to avoid re-touching pages still inside their 14-day loop.

### Candidates selected (5)

| Page                                                     | Head weak query(es)                                  | Impr. (5–15 cluster) | Clicks |   Pos |   CTR | Verdict                                                       |
| -------------------------------------------------------- | ---------------------------------------------------- | -------------------: | -----: | ----: | ----: | ------------------------------------------------------------- |
| `/blog/poster-size-dimensions-pixels`                    | poster size in pixels (+11 variants)                 |               ~2,600 |     ~2 | 5.5–7 |   ~0% | **Three Kings gap** — rewrite                                 |
| `/alternatives/vs-adobe-express`                         | adobe express image upscaler, adobe express upscaler |                  278 |      0 |    ~7 |    0% | **King 1 broken** — title fix                                 |
| `/blog/photoshop-upscale-image`                          | how to upscale an image in photoshop (+2 variants)   |                  771 |      2 |  6–14 | ~0.3% | **King 3 weak** — first-P fix                                 |
| `/blog/topaz-labs-free-trial`                            | topaz free / trial / is topaz free cluster           |               ~3,800 |    ~45 |  5–10 |   ~1% | **Flag only** — kings are fine; see routing                   |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | best free image upscaler cluster                     |               ~1,123 |     29 |   6–9 | ~2.6% | **Healthy** — 4.17% CTR at pos 8.6 ≈ expected; no on-page gap |

### Excluded at validation (with reasons)

- `/` homepage queries ("image upscaler" 10.1k imp at pos 12.9, plus domain-like variants) — ranking/authority problem, not a Three Kings gap. Homepage title already targets the head term.
- `/blog/fixing-pixelated-photos` ("how to fix pixelated photos", 23.7k imp) — snippet edits applied 2026-07-03 and 2026-07-27 both failed to move CTR; known SERP anomaly (AI Overviews absorb the intent). Do not re-edit.
- `/es/alternatives/vs-imgupscaler` ("imgupscaler") — competitor-brand navigational query; wrong tool for Three Kings.
- `/blog/gif-upscaler` — CTR healthy (4.93% at pos 5.5); GIF 301 consolidation already a proven non-lever.
- `/tools/ai-image-upscaler` ("image upscaler 8x") — 8.02% CTR at pos 7.5; healthy.
- `/blog/animation-maker-for-minecraft` — 3.61% at pos 9.8 ≈ expected.

## Three Kings audit + proposed copy

### 1. `/blog/poster-size-dimensions-pixels` (priority — biggest CTR gap)

Current kings (live HTML, 2026-09-03):

- Title (64ch): `24×36 Poster Size in Pixels: 150–300 DPI Chart | MyImageUpscaler`
- H1: `24x36 Poster Pixels: 300 DPI Size Chart`
- First P: `Find 24x36 poster pixels at 150, 200, and 300 DPI, plus common poster sizes and when to upscale before printing. Try free now.`

Gap: the head query **"poster size in pixels"** (~1,900 imp across generic variants) never appears verbatim in H1 or first paragraph, and the title buries it after "24×36". Generic variants outnumber 24×36-specific queries ~7:1 and convert at ~0%. Jul 22 refresh fixed the DPI snippet but not the kings.

Competitive gap check: page depth ~3,920 words; covers US sizes, A-series, DPI vs PPI, viewing distance, print prep, FAQs. Depth is **not** the gap — keep the change surgical. (Optional semantic enrichment: add 27×40 movie-poster and 11×17 rows to the chart; both recur in competitor tables and are absent.)

Proposed replacements:

- Title: `Poster Size in Pixels: 150–300 DPI Chart (24×36 & More)`
- H1: `Poster Size in Pixels: 150–300 DPI Chart (24×36 & More)`
- Meta description: `Poster size in pixels = inches × DPI. See charts for 24×36, 18×24, A-series and more at 150, 200, and 300 DPI, plus minimum print resolution tips.`
- First paragraph: `A poster's size in pixels depends on two things: print size and DPI (pixels = inches × DPI). A 24×36 poster is 7,200 × 10,800 px at 300 DPI, or 3,600 × 5,400 px at 150. Below are charts for every common poster size at 150, 200, and 300 DPI, plus when to upscale before printing. Try free now.`

### 2. `/alternatives/vs-adobe-express`

Current kings:

- Title (78ch): `Adobe Express Image Upscaler Alternative: MyImageUpscaler... | MyImageUpscaler` — truncated mid-string and redundant (brand twice).
- H1: `Adobe Express Image Upscaler vs MyImageUpscaler` — fine.
- First P: exact phrase never appears whole; keyword arrives split at word 20+.

Proposed replacements:

- Title: `Adobe Express Image Upscaler: Limits & Free Alternative` (55ch; brand suffix truncates harmlessly)
- Meta description: `See the Adobe Express image upscaler's export and resolution limits, and compare them with a dedicated free AI upscaler for detail recovery and print-size work.`
- First paragraph: `The Adobe Express image upscaler is built for quick resizing inside Adobe's design suite — not for recovering fine detail in soft, compressed, or print-bound photos. Here is how its limits compare with a dedicated AI upscaler, and when the extra detail actually matters.`

### 3. `/blog/photoshop-upscale-image`

Current kings: title `How to Upscale an Image in Photoshop [2026] | MyImageUpscaler` (exact, front-loaded ✓); H1 mirrors ✓; first paragraph reads `Step-by-step Photoshop upscaling guide for Preserve Details 2.0, Super Resolution, Neural Filters, batch processing, and print sizing.` — no query phrase in sentence 1–2.

Proposed first paragraph: `To upscale an image in Photoshop, open it, go to Image → Image Size, turn on Resample, and pick Preserve Details 2.0 for the sharpest result. This guide covers every method — Preserve Details 2.0, Super Resolution, Neural Filters, batch processing, and print sizing — and when each one is worth using.`

Caveat: 0 clicks at pos 8.7 on 484 impressions may partly be an authority gap (Adobe's own docs + YouTube dominate this SERP). Apply the King 3 fix, but do not expect it alone to close the gap.

### Routed elsewhere (no copy change now)

- `/blog/topaz-labs-free-trial`: all three kings are already aligned and direct ("Does Topaz Labs have a free trial in 2026? Topaz Photo has no current trial…"). CTR ~1% at pos 5–10 is a SERP-mismatch/authority problem — the queries ("topaz free", "is topaz free") are Topaz-brand-adjacent and Topaz's own domain + big affiliates rank above. Route: `serp-ctr-snippet-rewrite-technique` later, or accept the ceiling. Do not inject keywords.

## Execution plan (when approved)

1. Apply the three page edits via the `blog-edit` workflow (title/H1/meta/first-paragraph fields only; no slug, canonical, or body changes).
2. Optional chart additions on the poster page (27×40, 11×17) — only if trivial.
3. Add unit tests if any SEO surface (title/H1 generation) is code-driven rather than content-field-driven.
4. Deploy → verify live HTML → add URLs to `docs/SEO/maintenance/gsc-request-indexing-backlog.md` → manual GSC request indexing (mind the ~10/day quota).
5. Append entry to `docs/SEO/maintenance/seo-changes-backlog.md`.
6. Recheck after 14 complete GSC days (~2026-09-21): position/CTR movement per page; if no movement, investigate indexing/canonical and authority before another copy pass.
