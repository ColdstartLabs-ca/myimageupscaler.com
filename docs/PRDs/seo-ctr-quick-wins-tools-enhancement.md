# PRD: SEO CTR Quick Wins + Tools Enhancement

**Status**: Partially Done (Phases 1–2B and 3B complete; Phases 3A and 4 pending)
**Author**: Claude
**Date**: April 23, 2026
**Branch**: `feat/seo-ctr-quick-wins`

### Completion Status

| Phase    | Description                               | Status                        |
| -------- | ----------------------------------------- | ----------------------------- |
| Phase 1  | GA4 landing page fix                      | ✅ Done (commit `f58228ec`)   |
| Phase 2A | Top 5 blog CTR title/meta rewrites        | ✅ Done (DB updated via API)  |
| Phase 2B | Intent mismatch fixes (4 posts)           | ✅ Done (DB updated via API)  |
| §8.5     | Cannibalization redirect                  | ✅ Done (in `next.config.js`) |
| Phase 3B | pSEO meta description audit (160 fixed)   | ✅ Done                       |
| Phase 3A | pSEO cluster expansion (4 new clusters)   | ⏳ Pending                    |
| Phase 4  | New tools (PDF, Cropper, Watermark, EXIF) | ⏳ Pending (separate tickets) |

---

## 1. Context

### 1.1 Problem

Blog pages generate 62% of all Google impressions (53,600/month) but only 1.2% of clicks. The top 10 blog posts sit at positions 3-10 with 0.00-0.29% CTR — 85-99% below the expected benchmark. This structural CTR deficit is likely feeding back into ranking demotions (Google sees users ignoring our results).

The immediate trigger: a 53% click decline Apr 16-20 (from ~130/day peak to ~61/day), driven by AI Overviews cannibalizing 3 of 4 top queries and continued near-zero blog CTR.

Additionally, 89% of organic GA4 sessions show `(not set)` as the landing page, making behavioral analysis impossible.

### 1.2 Data Sources

- GSC 28-day data (Mar 24 – Apr 20, 2026): `/tmp/gsc-miu.json`
- GA4 28-day data (Mar 26 – Apr 22, 2026): `/tmp/ga-miu.json`
- Blog SEO audit: `/tmp/blog-audit-miu.json`
- Full report: `/tmp/gsc-ga-report-2026-04-23.md`

### 1.3 Current Tooling Gaps

The existing skill suite (gsc-analysis, ga-analysis, seo-growth-plan, blog-edit, blog-search, blog-publish) handles **diagnosis** well but has gaps in **implementation automation**:

1. No way to generate SERP-optimized title/meta suggestions from GSC data
2. No bulk CTR fix workflow (identify → generate → apply → verify)
3. Blog audit tool doesn't output actionable title/meta rewrites
4. No SERP feature detection (AI Overviews, featured snippets, PAA)
5. No before/after tracking for title changes
6. GA4 `(not set)` landing pages — 89% data loss on organic traffic

---

## 2. Goals

### Primary

- Fix CTR on the top 5 blog posts (combined ~47K impressions, 26 clicks → target 2% = ~940 clicks/month)
- Fix GA4 landing page tracking (eliminate `(not set)`)
- Build tools that make future CTR fixes repeatable and data-driven

### Secondary

- Fix 4 intent mismatches flagged by blog audit
- Consolidate cannibalizing pages in the "best free ai image upscaler" family
- Improve blog audit to output actionable rewrites, not just diagnostics

### Non-Goals

- New content creation (separate PRD)
- Link building campaigns
- Paid acquisition

---

## 3. Implementation Phases

### Phase 1: GA4 Landing Page Tracking Fix (P0)

**Problem**: 89% of organic sessions (1,943 of 2,180) show as `(not set)` in GA4. Without page-level data, we can't measure if CTR fixes actually changed behavior.

**Root Cause Hypothesis**: The GA4 `page_location` dimension may not be set correctly for organic sessions, or the landing page dimension isn't being captured in the current report configuration.

**Tasks**:

1. **Investigate GA4 configuration** — Check if `page_location` / `page_referrer` dimensions are properly configured in the GA4 property. Check if the measurement tag fires on all pages.

2. **Update `ga-fetch.cjs`** — Modify the landing page query to use `pagePath` dimension instead of relying on `landingPage` which may not be populated. Test with:

   ```
   dimensions: [{ name: 'pagePath' }]
   ```

   instead of `landingPage` or `page`.

3. **Add fallback in ga-fetch.cjs** — If `(not set)` appears for >50% of sessions, log a warning and try alternative dimension names (`pagePath`, `hostName + pagePath`, `fullPageUrl`).

4. **Verify fix** — Re-run ga-fetch after changes and confirm `(not set)` drops below 10%.

**Files to modify**:

- `.claude/skills/ga-analysis/scripts/ga-fetch.cjs`

**Acceptance**: Running `ga-fetch.cjs` produces landing page data where >90% of sessions have a non-empty, non-`(not set)` page path.

---

### Phase 2: Blog CTR Fixes (P1)

**Problem**: Top 5 blog posts have 47K impressions with 0.00-0.16% CTR at positions 3-10.

#### 2A. Title/Meta Rewrites for Top 5 Posts

Posts ranked by CTR deficit (impressions × expected CTR - actual clicks):

| #   | Slug                                               | Impr   | Clicks | CTR   | Pos | Expected CTR |
| --- | -------------------------------------------------- | ------ | ------ | ----- | --- | ------------ |
| 1   | `best-free-ai-image-upscaler-2026-tested-compared` | 30,908 | 8      | 0.03% | 7.5 | 3-5%         |
| 2   | `ai-image-upscaling-vs-sharpening-explained`       | 3,195  | 0      | 0.00% | 3.7 | 8-12%        |
| 3   | `free-ai-upscaler-no-watermark`                    | 4,635  | 5      | 0.11% | 5.6 | 4-6%         |
| 4   | `upscale-image-for-print-300-dpi-guide`            | 3,052  | 5      | 0.16% | 8.3 | 3-5%         |
| 5   | `best-ai-image-quality-enhancer-free`              | 5,607  | 8      | 0.14% | 9.5 | 2-4%         |

**Note on AI Overviews**: Queries 1, 2, and 4 have confirmed AI Overviews. Title fixes alone won't recover full CTR, but improving snippet appeal is still the right move — AI Overview clicks still happen, just at lower rates.

**Tasks**:

1. **For each post**, update `seo_title` and `seo_description` via the blog API (`PATCH /api/blog/posts/{slug}`):

   **Post 1**: `best-free-ai-image-upscaler-2026-tested-compared`
   - Current title: "12 Best Free AI Image Upscalers 2026 — Tested"
   - Issue: Looks like a thin listicle. AI Overview likely satisfies the query.
   - New `seo_title`: "We Tested 12 Free AI Upscalers — Only 3 Are Worth Using (2026)"
   - New `seo_description`: "We upscaled the same photo in 12 free AI image upscalers. See the real side-by-side results — 3 tools produced sharp, artifact-free images at 4x. The rest were garbage."
   - Strategy: Specificity + contrarian claim ("Only 3 Are Worth Using") + proof ("We Tested")

   **Post 2**: `ai-image-upscaling-vs-sharpening-explained`
   - Current title: "AI Image Upscaling vs Sharpening Explained"
   - Issue: 0% CTR at position 3.7. AI Overview likely answers the question directly.
   - New `seo_title`: "AI Upscaling vs Sharpening: Which Actually Fixes Blurry Photos?"
   - New `seo_description`: "Upscaling makes photos bigger — sharpening makes them crisper. But which one fixes YOUR blurry photo? See real examples with before/after comparisons and learn when to use each."
   - Strategy: Reframe as a practical decision guide, not a textbook explainer. "Which Actually Fixes" implies a real answer, not just theory.

   **Post 3**: `free-ai-upscaler-no-watermark`
   - Current title: "Free AI Upscaler No Watermark"
   - Issue: Generic, reads like a keyword dump.
   - New `seo_title`: "Free AI Image Upscaler — No Watermark, No Signup, Instant"
   - New `seo_description`: "Upscale your photos to 4x resolution with AI — no watermark, no account needed, no waiting. Upload, enhance, download. Works on phone and desktop."
   - Strategy: Emphasize speed and friction ("Instant", "No Signup"). Action-oriented description.

   **Post 4**: `upscale-image-for-print-300-dpi-guide`
   - Current title: (needs verification — check DB)
   - New `seo_title`: "Upscale Any Photo to 300 DPI for Print — Free AI Tool"
   - New `seo_description`: "Need 300 DPI for printing but your photo is too low-res? Our free AI upscaler increases resolution to print quality. Supports A4, A3, poster sizes. Try it free."
   - Strategy: Lead with the free tool, then the specific use case. "Any Photo" is inclusive.

   **Post 5**: `best-ai-image-quality-enhancer-free`
   - Current title: (needs verification — check DB)
   - New `seo_title`: "Best Free AI Image Quality Enhancer (Tested May 2026)"
   - New `seo_description`: "We tested 8 free AI image enhancers on blurry, noisy, and low-res photos. See which ones actually improved quality — with side-by-side proof you can judge yourself."
   - Strategy: Freshness signal ("May 2026"), social proof ("Tested"), transparency ("judge yourself").

2. **Apply updates via blog API** — Each update uses `PATCH /api/blog/posts/{slug}` with `seo_title` and `seo_description` fields. These override the default `title`/`description` in `generateMetadata()`.

3. **Request indexing** — After updating, submit each URL via GSC URL Inspection API for re-indexing.

**Files to modify**:

- Database records (via API, no code changes needed)
- Optionally update MDX frontmatter if any of these are static posts

**Acceptance**: Each post has updated `seo_title` (30-60 chars) and `seo_description` (120-160 chars). Verify via `GET /api/blog/posts/{slug}`.

#### 2B. Intent Mismatch Fixes (4 posts)

| Slug                                   | Current Intent    | Fix                                        |
| -------------------------------------- | ----------------- | ------------------------------------------ |
| `ai-vs-traditional-image-upscaling`    | Explainer (38%)   | Add "Explained" or "How It Works" to title |
| `noise-reduction-in-image`             | Explainer (100%)  | Restructure as "What Is X" guide           |
| `gif-upscaler`                         | Free-tool (100%)  | Add "Free" / "No Watermark" to title       |
| `how-to-enhance-image-quality-with-ai` | Comparison (100%) | Add "vs" or "Comparison" to title          |

**Tasks**: Update `seo_title` for each to match the dominant search intent.

---

### Phase 3: pSEO Tool Pages Expansion (P2)

pSEO tool pages are the highest-CTR non-branded content in the site at **1.65% weighted CTR** (vs 0.12% for blogs) at an average position of 25. They work because they match transactional intent exactly: someone searching "upscale image for Etsy" wants a tool, not an article. The 288 currently indexed pages are proving the model — this phase scales it.

#### Design Constraint: Static Pages Only

AI processing costs money — server-side execution on every visit is not viable for free landing pages. All new pSEO tool pages must be **fully static**: no server-side image processing on load. The pattern is:

1. Static landing page with pre-rendered before/after examples (real images, processed once at build time)
2. Tool UI is embedded but processing only triggers on explicit user action
3. Free tier: limited credits on signup; paid tier unlocks full usage
4. Client-side processing (WASM/browser-based) is acceptable where feasible and quality is good enough

This is already the model for the existing 288 pSEO pages that are performing at 1.65% CTR — extend that same architecture.

#### 3A. Expand Existing Tool Clusters With Proven Demand

GSC data shows several tool-adjacent query families with substantial impression volume and no matching pSEO pages. Priority clusters to build:

**Background removal cluster** (sparse pSEO coverage, high transactional intent)

- `/remove-background-from-product-photo`
- `/remove-background-from-portrait`
- `/make-logo-background-transparent`
- `/transparent-background-for-etsy-listing`
- `/remove-white-background-from-image`

**Photo restoration cluster** (186 impressions at pos 9 for "free photo restoration services" — no pSEO pages exist)

- `/restore-old-photo-free`
- `/fix-damaged-photo-online`
- `/repair-faded-photo-ai`

**Print / DPI cluster** (3,052 impressions at pos 8.3 currently going to a blog post — intent is tool, not article)

- `/upscale-image-to-300-dpi`
- `/upscale-image-for-print`
- `/resize-image-for-a4-print`
- `/upscale-image-for-poster`

**Platform-specific upscale cluster** (already partially covered — extend it)

- `/upscale-image-for-tiktok`
- `/upscale-image-for-linkedin`
- `/upscale-image-for-amazon-listing`
- `/upscale-image-for-shopify`

**Tasks**:

1. Add pSEO data entries for the 4 clusters above using the existing pSEO system
2. Each entry needs: slug, title, meta description, H1, static before/after images, tool embed reference, canonical
3. Before/after images must be pre-processed offline — not generated at request time

**Files to modify**:

- Existing pSEO data files (whichever format the current system uses)

#### 3B. Title/Meta Pattern for pSEO Tool Pages

The pages converting at 1.65% CTR share a pattern. Enforce it across all new and existing pSEO tool pages:

- **Title formula**: `[Verb] [Object] [Qualifier] — Free AI Tool`
  - Good: "Remove Background From Product Photo — Free AI Tool"
  - Bad: "Background Remover for Product Photos"
- **Meta description formula**: Lead with the output benefit, then friction reducers, then CTA.
  - Good: "Get a clean transparent background in seconds. No watermark. Upload your photo and download — free for your first images."
  - Avoid: claiming "free" unconditionally if usage requires signup and credits
- **H1**: Match the query literally. Users scan H1 to confirm they're in the right place.

**Tasks**:

1. Audit existing 288 pSEO pages against this pattern
2. Flag pages where the meta description overclaims "free" without mentioning the credit/signup model
3. Update the worst offenders

---

### Phase 4: New Tools to Build (P3 — separate tickets per tool)

Keyword Planner data (Apr 2025–Mar 2026, all locations, English) reveals which high-volume queries the site can't currently serve. Each tool below gets its own implementation ticket; this section is the planning reference.

#### Cloudflare Workers Compatibility

All processing libraries in Phase 4 run **in the browser (client components)**, not in CF Workers. CF Workers only handle API routes, which for these tools are either non-existent (pure client-side) or a simple `fetch()` call to Replicate — both fine.

Two real gotchas:

1. **`pdfjs-dist` spawns a browser Web Worker internally.** If imported in a server component or without SSR guard, Next.js will try to instantiate it during CF Worker rendering and crash. Every tool component using `pdfjs-dist` or `@imgly/background-removal` must use `dynamic(() => import(...), { ssr: false })`.

2. **`sharp` is not CF Worker compatible** (native binary, requires libvips). It's already used in the upscaler backend — confirm it runs via a Node.js adapter/runtime, not the default CF Worker runtime. Don't introduce `sharp` in any new API route that targets the edge runtime.

Everything else (`pdf-lib`, `react-easy-crop`, `fabric`, `konva`, `exifr`) is pure JS and browser-only — no CF Worker concern.

---

#### Current Tool Inventory

| Tool                                                              | pSEO pages exist?                            |
| ----------------------------------------------------------------- | -------------------------------------------- |
| AI Image Upscaler                                                 | ✅                                           |
| AI Photo Enhancer                                                 | ✅                                           |
| AI Background Remover / Remove BG / Transparent BG / Image Cutout | ✅ (4 variants)                              |
| Image Resizer (+ Instagram, YouTube, Facebook, Twitter, LinkedIn) | ✅                                           |
| Bulk Image Resizer / Bulk Compressor                              | ✅                                           |
| Image Compressor                                                  | ✅                                           |
| Format converters (PNG↔JPG↔WebP)                                  | ✅                                           |
| Format × scale matrix (jpeg-upscale-2x … gif-upscale-16x)         | ✅ (36 pages)                                |
| Photo Restoration                                                 | ✅ (partial — locale data exists, pSEO thin) |
| JPG/Image ↔ PDF                                                   | ❌                                           |
| Image Cropper                                                     | ❌                                           |
| Watermark Remover                                                 | ❌                                           |
| EXIF / Metadata Remover                                           | ❌                                           |
| AI Photo Editor (hub page)                                        | ❌                                           |
| Image Colorizer                                                   | ❌                                           |

---

#### Tool 1: JPG/Image ↔ PDF Converter

**Traffic**: 22.7M combined monthly searches (jpg to pdf: 13.6M, pdf to jpg: 9.1M). Biggest untapped keyword cluster on the site.

**Cost model**: 100% client-side — zero server cost per conversion.

**Libraries**:

- `pdf-lib` (300K weekly downloads) — image → PDF. Embeds JPG/PNG natively. Pure JS, no dependencies.
- `pdfjs-dist` (13.7M weekly downloads) — PDF → image. Mozilla's PDF.js renders PDF pages to canvas in-browser.

**Implementation**:

1. Single tool UI that detects direction (image→PDF or PDF→image) from the dropped file type
2. Image → PDF: load file as ArrayBuffer → `pdf-lib` embeds it → download as `.pdf`
3. PDF → image: `pdfjs-dist` renders each page to a canvas → `canvas.toBlob()` → download as ZIP of JPGs
4. No upload to server. No credits consumed. Free for all users.
5. Multi-page PDF support: render all pages, let user select which to download

**pSEO keyword clusters to create** (one page per slug, same static architecture):

| Slug                  | Primary keyword | Monthly searches |
| --------------------- | --------------- | ---------------- |
| `/jpg-to-pdf`         | "jpg to pdf"    | 13.6M            |
| `/pdf-to-jpg`         | "pdf to jpg"    | 9.1M             |
| `/image-to-pdf`       | "image to pdf"  | 3.35M            |
| `/png-to-pdf`         | "png to pdf"    | 1M               |
| `/photo-to-pdf`       | "photo to pdf"  | 823K             |
| `/convert-pdf-to-png` | "pdf to png"    | ~400K            |
| `/jpeg-to-pdf`        | "jpeg to pdf"   | ~200K            |

**Effort**: Medium. The libraries handle all conversion logic. Most work is the UI and creating 7+ pSEO data entries.

---

#### Tool 2: Image Cropper

**Traffic**: 90.5K/month, +22% YoY. Obvious gap alongside the existing Resizer.

**Cost model**: 100% client-side — zero server cost.

**Libraries**:

- `react-easy-crop` (1.74M weekly downloads) — most-used React cropper. Smooth UX, supports aspect ratio lock, zoom, circular crop. Drop-in for a React codebase.

**Implementation**:

1. Drop-in cropper component with aspect ratio presets (free, 1:1, 16:9, 4:3, 3:2)
2. Platform presets that match the existing Resizer (Instagram square, YouTube thumbnail, etc.)
3. Output via `canvas.toBlob()` — no server needed
4. No credits consumed. Free for all users.

**pSEO keyword clusters to create**:

| Slug                                | Primary keyword            | Monthly searches |
| ----------------------------------- | -------------------------- | ---------------- |
| `/image-cropper`                    | "image cropper"            | 90.5K            |
| `/crop-image-to-circle`             | "crop image to circle"     | ~27K             |
| `/crop-image-for-instagram`         | "crop image for instagram" | ~18K             |
| `/crop-image-for-youtube-thumbnail` | "crop youtube thumbnail"   | ~12K             |
| `/crop-image-online-free`           | "crop image online free"   | ~22K             |

**Effort**: Low. `react-easy-crop` is near drop-in. Most work is pSEO data entries and platform presets.

---

#### Tool 3: Watermark Remover

**Traffic**: 1.22M/month, +22% YoY. Highly aligned with AI positioning.

**Cost model**: Two-tier.

- **Free / client-side tier**: Manual brush/mask erase using canvas inpainting (fill selected region with surrounding pixels via simple content-aware fill). Good for solid-color backgrounds. Zero server cost.
- **Paid / AI tier**: Route masked region to backend AI inpainting model (e.g. Replicate's `lama-cleaner`). Deduct credits. Unlocks complex backgrounds.

**Libraries**:

- `fabric` (780K weekly downloads) or `konva` (1.27M weekly downloads) — canvas editor for the brush/mask UI
- `@imgly/background-removal` (74K weekly downloads) — runs WASM/ONNX model in-browser; not a perfect fit for watermark removal but demonstrates the in-browser model pattern
- Backend: Replicate API (`lama-cleaner` model) for AI inpainting — wrap in existing API route with credit deduction

**Implementation**:

1. User uploads image → shown on canvas editor
2. User brushes over watermark area → generates a mask
3. Free path: simple JS inpainting fills the masked area (nearest-neighbour or blur fill)
4. Paid path: send `{ image, mask }` to `/api/tools/watermark-remove` → Replicate → return clean image → deduct 1 credit
5. Show side-by-side free vs paid quality comparison to drive upsell

**pSEO keyword clusters to create**:

| Slug                           | Primary keyword               | Monthly searches |
| ------------------------------ | ----------------------------- | ---------------- |
| `/watermark-remover`           | "watermark remover"           | 1.22M            |
| `/remove-watermark-from-photo` | "remove watermark from photo" | 90.5K            |
| `/remove-watermark-from-video` | out of scope                  | —                |
| `/remove-watermark-free`       | "remove watermark free"       | ~40K             |
| `/remove-text-from-image`      | "remove text from image"      | ~33K             |
| `/remove-logo-from-image`      | "remove logo from image"      | ~15K             |

**Effort**: High (for the AI path). The free brush/mask tier is medium effort. The backend AI inpainting integration adds another sprint.

---

#### Tool 4: EXIF / Metadata Remover

**Traffic**: 8.1K/month, +50% YoY. Small volume but zero build cost and a privacy differentiator.

**Cost model**: 100% client-side — zero server cost, no credits.

**Libraries**:

- `exifr` (1.09M weekly downloads) — reads and parses EXIF/metadata from JPEG, TIFF, HEIC, AVIF
- No stripping library needed: `canvas.toBlob('image/jpeg')` re-encodes the image without EXIF. That's the entire "removal" — read-encode-download.

**Implementation**:

1. User drops image → `exifr` reads metadata → display what was found (location, device, timestamps)
2. Button: "Remove all metadata" → draw image on canvas → `canvas.toBlob()` → download clean file
3. Show before/after metadata diff for transparency
4. Privacy angle: "Remove GPS location before sharing photos"

**pSEO keyword clusters to create**:

| Slug                          | Primary keyword              | Monthly searches |
| ----------------------------- | ---------------------------- | ---------------- |
| `/exif-remover`               | "exif remover"               | 8.1K             |
| `/remove-metadata-from-photo` | "remove metadata from image" | ~5K              |
| `/remove-gps-from-photo`      | "remove gps from photo"      | ~3K              |
| `/strip-exif-data-online`     | "strip exif data"            | ~2K              |

**Effort**: Very low. The entire logic is ~30 lines of JS. Most work is the UI and pSEO entries.

---

#### Tool 5: AI Photo Editor (Hub Page — not a new tool)

**Traffic**: 1.5M/month, +22% YoY.

**Approach**: Don't build a new tool. Build a hub page at `/ai-photo-editor` that presents all existing tools (upscaler, enhancer, background remover, compressor, resizer, cropper) under the "AI Photo Editor" umbrella. Static page, no new functionality. The page should:

- Have a prominent tool grid/cards linking to each sub-tool
- Include a brief interactive demo (a single enhancement action using the existing upscaler API)
- Target the broad "ai photo editor" keyword while the individual tools target specifics

**pSEO clusters**: The existing tool pages already cover this. The hub page itself is the SEO asset.

**Effort**: Very low. Static page + copywriting.

---

#### Build Order Summary

| Priority | Tool                          | Monthly searches | Server cost       | Effort   |
| -------- | ----------------------------- | ---------------- | ----------------- | -------- |
| 1        | JPG ↔ PDF Converter           | 22.7M            | None              | Medium   |
| 2        | Image Cropper                 | 90.5K            | None              | Low      |
| 3        | AI Photo Editor hub           | 1.5M             | None              | Very low |
| 4        | EXIF Remover                  | 8.1K             | None              | Very low |
| 5        | Watermark Remover (free tier) | 1.22M            | None              | Medium   |
| 6        | Watermark Remover (AI tier)   | —                | Replicate credits | High     |

---

## 4. Files Summary

### New Files

| File                                     | Purpose                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| pSEO data entries — Phase 3 clusters     | Background removal, photo restoration, print/DPI, platform-specific slugs                          |
| pSEO data entries — Phase 4 clusters     | jpg-to-pdf, pdf-to-jpg, image-to-pdf, png-to-pdf, crop variants, watermark variants, EXIF variants |
| Tool component: PDF converter            | Client-side `pdf-lib` + `pdfjs-dist` UI                                                            |
| Tool component: Image cropper            | Client-side `react-easy-crop` UI                                                                   |
| Tool component: EXIF remover             | Client-side `exifr` + canvas re-encode                                                             |
| Static page: `/ai-photo-editor`          | Hub page linking existing tools                                                                    |
| Tool component: Watermark remover (free) | Canvas brush/mask UI                                                                               |
| API route: `/api/tools/watermark-remove` | Replicate inpainting, credit-gated (Phase 4 last)                                                  |

### Modified Files

| File                                              | Change                                  |
| ------------------------------------------------- | --------------------------------------- |
| `.claude/skills/ga-analysis/scripts/ga-fetch.cjs` | Fix `(not set)` landing pages           |
| `next.config.js` or middleware                    | 301 redirect for cannibalizing blog URL |

### Database / Content Changes

| Record                                                        | Change                                |
| ------------------------------------------------------------- | ------------------------------------- |
| Blog post: `best-free-ai-image-upscaler-2026-tested-compared` | Update `seo_title`, `seo_description` |
| Blog post: `ai-image-upscaling-vs-sharpening-explained`       | Update `seo_title`, `seo_description` |
| Blog post: `free-ai-upscaler-no-watermark`                    | Update `seo_title`, `seo_description` |
| Blog post: `upscale-image-for-print-300-dpi-guide`            | Update `seo_title`, `seo_description` |
| Blog post: `best-ai-image-quality-enhancer-free`              | Update `seo_title`, `seo_description` |
| 4 intent-mismatch posts                                       | Update `seo_title`                    |
| Existing 288 pSEO pages (worst offenders)                     | Fix overclaiming meta descriptions    |

---

## 5. Success Metrics

| Metric                    | Current           | Target (30 days)                |
| ------------------------- | ----------------- | ------------------------------- |
| Blog CTR (top 5 posts)    | 0.05% average     | 1.5% average                    |
| Blog clicks (top 5 posts) | 26/month          | 750+/month                      |
| GA4 landing page coverage | 11% (non-not-set) | >90%                            |
| AI Overview-aware posts   | 0                 | 3 (with differentiated content) |

**Tracking**: Re-run `/gsc-analysis` at 7, 14, and 30 days after changes ship to compare CTR deltas.

---

## 6. Risks

| Risk                                                                      | Mitigation                                                                                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| AI Overviews make CTR fixes irrelevant for some queries                   | Focus on queries WITHOUT AI Overviews first; for AI Overview queries, differentiate with original data/benchmarks                               |
| Title changes cause temporary ranking drop                                | Use `seo_title`/`seo_description` (not `title`/`description`) — these only affect SERP display, not on-page content                             |
| GA4 fix requires property-level config changes                            | If `pagePath` dimension doesn't resolve `(not set)`, may need GA4 Admin changes                                                                 |
| pSEO pages overclaim "free" → high bounce when users hit credit wall      | Rewrite meta descriptions to set correct expectation: "free for your first images" not "free" unconditionally                                   |
| pSEO expansion adds pages without real before/after images → thin content | Each new page must ship with at least one real static before/after image pair, processed offline                                                |
| `pdfjs-dist` browser Web Worker crashes CF Worker runtime during SSR      | Must use `dynamic(() => import(...), { ssr: false })` on every component that imports it — never import at module level in server components    |
| PDF → JPG quality on complex PDFs                                         | `pdfjs-dist` canvas rendering quality depends on PDF complexity; set a reasonable DPI cap (150–300) to balance quality and memory               |
| Watermark remover free-tier quality gap                                   | Simple inpainting looks bad on complex backgrounds — make the quality gap visible in the UI to drive paid upsell rather than frustrate users    |
| Phase 4 bundle size                                                       | `pdf-lib` + `pdfjs-dist` are heavy. Use dynamic `import()` so they only load when the PDF tool is opened — don't bundle into the main app chunk |

---

## 7. Execution Order

1. **Phase 1** (GA4 fix) — verify first (may already be done, see §8.1). 1-2 hours if not.
2. **Phase 2A** (Top 5 blog CTR fixes) — 30 min. Apply via API, submit for re-indexing.
3. **Phase 2B** (Intent mismatches) — 15 min. Same approach.
4. **Phase 3B** (Title/meta audit on existing 288 pSEO pages) — 1-2 hours. Fix overclaiming descriptions before expanding.
5. **Phase 3A** (pSEO cluster expansion for existing tools) — 2-3 hours per cluster. Start with print/DPI since it already has proven blog traffic to redirect.
6. **Phase 4** (New tools) — separate planning + tickets. JPG↔PDF first (highest volume, client-side, zero server cost).

---

## 8. Claude's Additions From GSC Analysis

### 8.1 Phase 1 May Already Be Done

Commit `f58228ec` ("fix: fix GA4 landing page (not set) bug and forward purchase events") was merged recently. **Verify before starting Phase 1** — re-run `ga-fetch.cjs` and check if `(not set)` coverage has dropped. If it's already fixed, Phase 1 can be skipped entirely.

---

### 8.2 GA4 Shows Zero Conversions Across All Organic Traffic

The 90-day GA4 pull shows `conversions: 0` for every landing page, every channel, including organic. Either:

- The conversion events aren't firing (broken setup), or
- The service account doesn't have access to the `conversions` metric in this property (GA4 Admin → property access)

This is a P0 measurement gap independent of the `(not set)` issue. Without conversion data, it's impossible to know whether traffic from any content type actually pays. **Check this in GA4 Admin before building Phase 4 strategy around conversion assumptions.**

---

### 8.3 pSEO Tool Pages Are the Highest-CTR Content Type

90-day GSC numbers confirm the strategic priority:

| Content Type        | CTR       | Avg Position | Impressions |
| ------------------- | --------- | ------------ | ----------- |
| **pSEO tool pages** | **1.65%** | 25.0         | 6,682       |
| Blog pages          | 0.12%     | 10.1         | 91,735      |

Blogs rank higher on average but convert at 13× lower CTR. pSEO tool pages are transactional by construction — they match what the user wants to do, not what they want to read. Phase 3 is the correct priority after the quick blog CTR fixes.

---

### 8.5 Cannibalization: "Best Free AI Image Upscaler" Cluster

The PRD mentions consolidation briefly. The GSC data is more specific: at least 2 pages are competing head-to-head for the same queries in this cluster, splitting impressions and diluting both rankings:

- `/blog/best-free-ai-image-upscaler-2026-tested-compared` — 518 impressions at pos 8.1
- `/blog/best-free-ai-image-upscaler-tools-2026` — 9 impressions at pos 8.8

These are near-identical intent. The second URL should 301 → the first, and the first should be the one getting the CTR fix treatment in Phase 2A. Without the redirect, Google is splitting ranking signals across both.

**Task**: Add a 301 redirect for `/blog/best-free-ai-image-upscaler-tools-2026` → `/blog/best-free-ai-image-upscaler-2026-tested-compared` in `next.config.js` or middleware.

---

## 9. Updated Success Metrics

| Metric                    | Current           | Target (30 days)                |
| ------------------------- | ----------------- | ------------------------------- |
| Blog CTR (top 5 posts)    | 0.05% average     | 1.5% average                    |
| Blog clicks (top 5 posts) | 26/month          | 750+/month                      |
| GA4 landing page coverage | 11% (non-not-set) | >90%                            |
| GA4 conversions tracked   | 0 (broken)        | Verified working                |
| pSEO tool pages indexed   | 288               | 350+ (4 new clusters)           |
| pSEO tool pages CTR       | 1.65%             | Maintain ≥1.5% as volume scales |
| AI Overview-aware posts   | 0                 | 3 (with differentiated content) |

**Tracking**: Re-run `/gsc-analysis` at 14 and 30 days after each phase ships. Compare pSEO CTR and blog CTR deltas.
