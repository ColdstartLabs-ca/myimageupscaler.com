# PRD 3 — Page Recovery: win back the homepage and the pages that already rank

**Weeks 2–4 · depends on PRD 1 (capability facts) and PRD 2 (funnel measurement)**
Shared audit context: [README.md](README.md)

`Planning Mode: Principal Architect`
**Complexity: 8 → HIGH mode** (+3 touches 10+ files, +2 new interactive tool, +2 DB-backed editorial content across surfaces, +1 GSC/GA4 measurement)

---

## 1. Context

**Problem:** The homepage and one comparison article lost 2,040 clicks between them, while five other already-ranking pages convert search demand badly — and the reflex to publish more pSEO pages would spend the month without touching either.

**Files analyzed:** `client/components/landing/{HeroSection,HeroBeforeAfter,HeroTrustBar,heroAssets}.tsx`, `app/seo/data/{tools,scale}.json`, `locales/en/{tools,scale}.json`, `server/services/blog.service.ts`, `client/components/blog/BlogCTA.tsx`, `content/blog-data.json`, `tests/unit/seo/{homepage-performance,pseo-hero-lcp,pagespeed-budget,topaz-free-trial-snippet,use-cases-credits,three-kings-*}.unit.spec.ts`, commit `dd1791c5` (mobile homepage LCP remediation).

**Current behavior:**

| Page | Prev clicks | Latest | Change |
|---|---:|---:|---:|
| Homepage | 3,705 | **2,327** | **−37.2%**, position 9.95 → 12.89, impressions 77,028 → 56,226 |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | 1,468 | **806** | **−45.1%**, CTR 12.58% → 7.56%, position 5.20 → 5.61, impressions only −8.6% |

History says the traction is real: homepage **1,328 → 2,524 → 4,948 → 3,085** (May→Aug); comparison **162 → 803 → 1,802 → 1,135**.

Already-ranking pages worth strengthening:

| Page | Clicks | Impressions | CTR | Avg pos | Move |
|---|---:|---:|---:|---:|---|
| `/tools/ai-image-upscaler` | 310 | 4,871 | 6.36% | 8.00 | Strengthen the demonstrated 8× use case |
| `/scale/upscale-16x` | 174 | 2,518 | 6.91% | 10.35 | Improve the honest two-pass workflow |
| `/scale/2k-upscaler` | 144 | 1,807 | 7.97% | 7.29 | Product-specific examples and relevant links |
| `/blog/topaz-labs-free-trial` | 181 | 13,698 | 1.32% | 7.67 | Keep facts current; test the alternative-product CTA |
| `/blog/poster-size-dimensions-pixels` | 81 | 30,762 | 0.26% | 6.44 | Offer useful print-readiness functionality |
| `/blog/photoshop-upscale-image` | 44 | 9,748 | 0.45% | 6.22 | Improve the bridge from tutorial to product |

- `/scale/upscale-16x` already explains **two separate 4× passes with inspection between them** — better than implying native one-click 16× — but other copy on the same page still promises seamless, artifact-free output.
- For **"image upscaler 8x"** the **main tool page** takes **100 clicks at position 7.79**; the dedicated `/scale/upscale-8x` takes **6**.
- Weak pSEO sections by GSC reporting rows: `/platform-format` 23 rows / 2 clicks, `/device-use` 6/1, `/industry-insights` 10/0, `/photo-restoration` 4/0, `/technical-guides` 7/0. These are **reporting rows, not a count of published or indexed pages.**
- Devices: desktop clicks −20.6%, mobile −26.1%. US impressions **+23.4%** with clicks **−18.9%**; Canada similar. Google Image Search: 8 clicks, from 26.

---

## 2. Solution

**Approach**

- Recover the two largest real losses first — they are 2,040 of the 1,891 net decline (gains elsewhere offset).
- **Diagnose before rewriting.** The comparison lost CTR, not ranking; that points at query mix, country/device mix, SERP presentation and title/snippet changes — none of which is proven yet.
- Strengthen the pages that already rank; make the 16× page honest end to end; **strengthen the winning 8× page rather than merging on query overlap**.
- One adjacent expansion only: a print-readiness checker embedded in the poster article, judged on activation, not clicks.
- **Pause pSEO expansion. Do not mass-delete.** Consolidate only on evidence.

**Key decisions**

- [ ] **No URL changes on recovering pages.** Record the previous title and change date for anything changed.
- [ ] **Do not change every title, template and link at once** — attribution becomes impossible.
- [ ] Preserve the homepage's broad image-upscaler role: do not move that target to another URL, do not merge the homepage into the tool page.
- [ ] All credit figures derive from `PRODUCT_CAPABILITIES` (PRD 1). No new literals.
- [ ] Editorial changes follow the established contract-spec pattern (`topaz-free-trial-snippet.unit.spec.ts`): pinned copy + a `gsc-request-indexing-backlog.md` row.
- [ ] Print-readiness math runs **in the browser** — Cloudflare Workers' 10ms CPU limit means no server-side image math and no image bytes to the server.
- [ ] Success is judged on PRD 2's funnel, not clicks.

**Data changes:** None.

---

## 3. Integration Ledger

| # | New thing | Live caller (`file:line`, non-test) | Replaces | Old path removed? | Negative control |
|---|---|---|---|---|---|
| 1 | homepage first-screen offer block | TBD (`client/components/landing/HeroSection.tsx`) | ambiguous hero subtext | replaced in Phase 1 | remove the block → homepage contract spec red |
| 2 | hard-subject hero before/after | TBD (`HeroBeforeAfter.tsx` + `heroAssets.ts`) | generic soft-focus demo | replaced in Phase 1 | oversize the asset → pre-existing LCP budget red |
| 3 | tracked non-brand query set + dated baseline | TBD (`seo-reports/homepage-change-log-2026-09.md`) | site-wide average position as the metric | replaced in Phase 1 | empty the set → red |
| 4 | flagship comparison evidence contract | TBD (published post via `server/services/blog.service.ts`) | unsupported "only three worked" framing + stale Gigapixel trial claim | replaced in Phase 2 | revert the Topaz correction → red |
| 5 | 16× two-pass honesty + worked example | TBD (`app/seo/data/scale.json` → live pSEO route) | "seamless / artifact-free" language | deleted in Phase 3 | restore one phrase → red |
| 6 | `PrintReadinessChecker` | TBD (`client/components/blog/BlogCTA.tsx` marker in the poster article) | generic resize CTA (charts retained) | replaced in Phase 3 | remove the marker → E2E red |

**Reachability:** entry points are organic page render (RSC), the published blog route via `blog.service.ts`, and the `BlogCTA` marker. Pre-existing files edited: `HeroSection.tsx`, `HeroBeforeAfter.tsx`, `heroAssets.ts`, `HeroTrustBar.tsx`, `app/seo/data/{tools,scale}.json`, `locales/en/{tools,scale}.json`, `BlogCTA.tsx`, both maintenance backlogs. User-facing: yes, including one new interactive tool. Replaces: ambiguous hero copy, the unsupported comparison framing, the 16× absolutes and the poster article's generic CTA — each removed in its own phase.

---

## 4. Execution Phases

### Phase 1: Homepage recovery — separate branded demand from non-brand ranking

**Files (max 5)**

- `client/components/landing/HeroSection.tsx` — EDIT: first-screen offer block reading `PRODUCT_CAPABILITIES`
- `client/components/landing/HeroBeforeAfter.tsx` + `heroAssets.ts` — EDIT: real before/after on a **hard** subject (text, a product label)
- `client/components/landing/HeroTrustBar.tsx` — EDIT: claims aligned with PRD 1
- `tests/unit/seo/homepage-offer-contract.unit.spec.ts` — NEW
- `seo-reports/homepage-change-log-2026-09.md` — NEW: previous title, new title, date, deploy

**Implementation**

- [ ] First screen answers four questions without scrolling: what you can upload, how far you can enlarge it, whether signup is required, what the free allowance buys.
- [ ] Replace the hero demonstration with the strongest *verifiable* result on a difficult image. Judge it on successful first upscales and purchases (PRD 2), not on looks.
- [ ] **Diagnose before assuming:** review titles, first-screen copy, internal links, signup changes and deployments around the July→August transition. No change has been established as the cause — record findings even when inconclusive.
- [ ] Fix a tracked non-brand query set by device and country with a dated baseline. Site-wide average position is too noisy to be the success metric.
- [ ] Do not regress the `dd1791c5` mobile LCP work.

**Wiring**

- [ ] Caller edited: `HeroSection.tsx` renders the offer block
- [ ] Registration: contract spec in the existing vitest suite
- [ ] Old path: ambiguous hero subtext replaced, not duplicated
- [ ] Ledger rows: #1, #2, #3

**Tests Required**

| Test File | Test Name | Assertion | Negative control (observed red) |
|---|---|---|---|
| `homepage-offer-contract.unit.spec.ts` | `should state upload formats, max scale, signup requirement and free allowance above the fold` | all four present and sourced from `PRODUCT_CAPABILITIES` | remove one fact → red |
| `homepage-offer-contract.unit.spec.ts` | `should track a fixed non-brand query set with a dated baseline` | pinned set + baseline date exist | empty the set → red |
| `homepage-performance.unit.spec.ts` (pre-existing) | LCP budget | still green after the asset swap | oversize the hero asset → red |
| `tests/e2e/homepage-offer.spec.ts` | `should let a first-time visitor reach a successful upscale from the first screen` | land → upload → upscale → download | break the CTA wiring → red |

**Revert check:** remove the offer block → `homepage-offer-contract.unit.spec.ts` fails **and** the pre-existing homepage E2E flow loses its entry CTA.

**Verification Plan**

1. Unit + E2E: four tests, controls observed red.
2. **Manual (required — visual):** mobile and desktop, restricted and default region; the first screen answers all four questions.
3. Performance: LCP measured before/after against the `dd1791c5` baseline; no regression.
4. Measurement: dated baseline for the tracked non-brand query set by device and country, committed to `seo-reports/`.
5. Evidence: `yarn test`, `yarn verify`, before/after screenshots, LCP numbers.

**User Verification** — Action: open the homepage on a phone as a first-time visitor. Expected: within one screen you know what you can upload, how big it gets, whether you need an account and what the free credits buy — and the demo shows a hard image handled well.

---

### Phase 2: Flagship comparison refresh — investigate CTR before chasing more rankings

**Files (max 5)**

- Published post via `PATCH /api/blog/posts/best-free-ai-image-upscaler-2026-tested-compared` (`x-api-key: BLOG_API_KEY`) — EDIT
- `tests/unit/seo/flagship-comparison-contract.unit.spec.ts` — NEW
- `docs/SEO/maintenance/gsc-request-indexing-backlog.md` — EDIT: one pending row
- `docs/SEO/maintenance/seo-changes-backlog.md` — EDIT: dated entry with the previous title
- `seo-reports/comparison-ctr-diagnosis-2026-09.md` — NEW

**Implementation**

- [ ] **Diagnose first.** Pull the page's query mix, country and device splits for both periods and check for SERP-feature changes. Write the diagnosis before touching the title. −45.1% clicks on −8.6% impressions and a near-flat position does **not** prove the title is responsible.
- [ ] Rebuild it as the strongest evidence-based comparison we own: consistent test inputs, output crops at matching magnification, product/version/test dates, export restrictions, honest winners **by use case**.
- [ ] **Disclose that MyImageUpscaler publishes the comparison.**
- [ ] The "only three worked" positioning needs reproducible evidence or it goes. Google's review guidance asks for firsthand evidence, quantitative measurement, and meaningful advantages *and* drawbacks.
- [ ] **Factual correction:** the article advertises a 30-day Gigapixel trial. Topaz's current documentation separates the discontinued Gigapixel AI product from the current subscription app, which has **no trial mode**. Correct by product and version; stay consistent with `topaz-free-trial-snippet.unit.spec.ts`.
- [ ] Apply PRD 1's truths (credits, signup, formats).
- [ ] **Then** test a less sensational title against the existing one — e.g. **"Best Free AI Image Upscalers: Tested Quality, Limits & Exports"**. An experiment, not a guaranteed improvement. **URL preserved.**

**Wiring**

- [ ] Caller edited: the published post is served on the live route via `server/services/blog.service.ts`
- [ ] Registration: contract spec in the vitest suite; indexing row in the backlog
- [ ] Old path: unsupported framing and the stale trial claim removed
- [ ] Ledger rows: #4

**Tests Required**

| Test File | Test Name | Assertion | Negative control (observed red) |
|---|---|---|---|
| `flagship-comparison-contract.unit.spec.ts` | `should state Topaz terms by product and version without a 30-day Gigapixel trial claim` | corrected terms present, trial claim absent | restore "30-day trial" → red |
| `flagship-comparison-contract.unit.spec.ts` | `should disclose that MyImageUpscaler publishes the comparison` | disclosure present | remove it → red |
| `flagship-comparison-contract.unit.spec.ts` | `should keep the published URL unchanged and record the previous title` | slug pinned; change-log row exists | change the slug or delete the row → red |
| `capability-claims.unit.spec.ts` (PRD 1) | credits / guest / formats | this post passes the same gate as every other surface | reintroduce "test without an account" → red |

**Stale-artifact control:** the gate reads the **live published post**, not a committed copy. Delete any cached fixture and re-run — it must refetch or fail loudly.

**Revert check:** revert the Topaz correction or drop the disclosure → the contract spec fails; reintroduce a guest-access claim → PRD 1's gate fails.

**Verification Plan**

1. Unit: four tests, controls observed red.
2. Diagnosis artifact committed, dated, with both periods' query/country/device splits.
3. API proof:
   ```bash
   curl -s https://myimageupscaler.com/api/blog/posts/best-free-ai-image-upscaler-2026-tested-compared \
     -H "x-api-key: $BLOG_API_KEY" | jq '{slug, seo_title, updated_at}'
   # Expected: unchanged slug, new title, fresh updated_at
   ```
4. **Manual (required — visual):** read it as a skeptical buyer.
5. Post-deploy: request indexing in GSC, clear the backlog row, re-measure the same page/query/device cohort only after recrawl.

**User Verification** — Action: read the article as a skeptical buyer. Expected: you can reproduce the test from what is written, you know who published it, and nothing about Topaz is out of date.

---

### Phase 3: Strengthen the pages that already rank — tool page, 16×, 2K, print-readiness

**Files (max 5)**

- `app/seo/data/tools.json` — EDIT: `ai-image-upscaler` — real 8× example, output-dimension preview, limitations, path into processing
- `app/seo/data/scale.json` + `locales/en/scale.json` — EDIT: `upscale-16x` two-pass consistency + worked example; `2k-upscaler` product-specific examples and links
- `app/(pseo)/_components/tools/PrintReadinessChecker.tsx` — NEW
- `client/components/blog/BlogCTA.tsx` — EDIT: register the checker behind a CTA marker
- `tests/unit/seo/workflow-honesty.unit.spec.ts` + `tests/e2e/print-readiness.spec.ts` — NEW

Blog CTA work (`topaz-labs-free-trial`, `photoshop-upscale-image`, `poster-size-dimensions-pixels`) goes through `PATCH /api/blog/posts/[slug]`, leaving `topaz-free-trial-snippet.unit.spec.ts` intact.

**Implementation**

- [ ] **8×: strengthen the winning page.** The tool page's title already mentions up to 8× — another keyword insertion is not the task. Real 8× examples, output-dimension previews, limitations, and the route into processing are. **Keep `/scale/upscale-8x` only where it adds a meaningfully different explanation. Do not merge merely because both pages appear for the same query.**
- [ ] **16×: purge remaining "seamless / artifact-free" language.** Add a worked example: actual input/output dimensions, credit usage, processing limits, and a clear stopping point when the first pass introduces artifacts.
- [ ] 2K: product-specific examples and genuinely relevant links, not another generic CTA block.
- [ ] Topaz article: maintain the corrected facts; test the alternative-product CTA. 13,698 impressions at 1.32% is the opportunity.
- [ ] Photoshop tutorial: 9,748 impressions at 0.45% is a bridge problem, not a ranking problem.
- [ ] **Print-readiness checker** in the poster article: pick print dimensions → inspect uploaded image dimensions → effective PPI + crop requirement → **recommend upscaling only when it actually helps**. Keep the dimension charts; replace the generic CTA. All math in the browser.
- [ ] **The 30,762 poster impressions are not all convertible.** Many searches want a number and leave. Test usefulness and downstream activation; assume no click windfall.
- [ ] **Selective consolidation:** do **not** follow the automated cannibalization score — it flags branded sitelinks, `site:` searches and in-page `#section` links. Investigate the genuine "best image upscaler" / "best AI photo enhancer" overlap, and merge only after checking distinct intent, conversions, relevant links and longer-term performance. Check backlinks and conversions before retiring anything.
- [ ] **Pause pSEO expansion; do not mass-delete.** Improve a small number of proven localized pages before translating the catalogue. Image Search (8 clicks) is not a project this window.
- [ ] Every credit figure derives from `PRODUCT_CAPABILITIES`.

**Wiring**

- [ ] Callers edited: `app/seo/data/{tools,scale}.json` read by the live pSEO routes; `BlogCTA.tsx` renders the checker for its marker
- [ ] Registration: marker present in the published poster article; new gates in the vitest suite
- [ ] Old path: absolute 16× claims deleted; the poster article's generic CTA replaced (charts retained)
- [ ] Ledger rows: #5, #6

**Tests Required**

| Test File | Test Name | Assertion | Negative control (observed red) |
|---|---|---|---|
| `workflow-honesty.unit.spec.ts` | `should describe 16x as two 4x passes everywhere on the page` | no "one-click 16x" / "seamless" / "artifact-free" remains | restore one phrase → red |
| `workflow-honesty.unit.spec.ts` | `should include a worked 16x example with dimensions, credits and a stopping point` | all four present | drop the stopping point → red |
| `workflow-honesty.unit.spec.ts` | `should derive every stated credit cost from PRODUCT_CAPABILITIES` | no literal credit numbers | hardcode a cost → red |
| `print-readiness-checker.unit.spec.ts` | `should compute effective PPI from pixel and print dimensions` | 3000px ÷ 10in → 300 PPI | break the divisor → red |
| `print-readiness-checker.unit.spec.ts` | `should recommend no upscaling when the image already exceeds the target PPI` | recommendation is "ready" | force an always-upscale branch → red |
| `tests/e2e/print-readiness.spec.ts` | `should let a reader check an image and reach upscaling only when it helps` | open article → set dimensions → upload → recommendation | remove the CTA marker → red |
| `use-cases-credits.unit.spec.ts` (pre-existing) | credit consistency | still green | change `BASE_UPSCALE_COST` → stated costs change |

**Revert check:** remove the marker registration from `BlogCTA.tsx` → the E2E flow fails and the published article renders a dead marker, caught by the pre-existing blog rendering spec. Reintroduce "artifact-free" → `workflow-honesty.unit.spec.ts` fails.

**Verification Plan**

1. Unit + E2E: seven tests, controls observed red.
2. **Manual (required — visual):** follow `/scale/upscale-16x` from the page alone; if you cannot tell when to stop, the page fails. Run the checker on one already-print-ready image and one clearly too-small image — the first must be told it needs nothing.
3. Integration proof:
   ```bash
   grep -rniE "artifact-free|seamless 16|one-click 16" app/seo/data locales/en
   # Expected: no hits
   ```
4. Funnel proof: PRD 2's report shows uploads and outcomes attributed to `/blog/poster-size-dimensions-pixels`.
5. Consolidation evidence: for any merge, paste the intent/conversion/backlink check that justified it. No merge without it.
6. Post-deploy: add each changed URL to the GSC request-indexing backlog; request indexing; clean up.

**User Verification** — Action: land on `/tools/ai-image-upscaler` searching "image upscaler 8x", then open the poster article and check a 1200×800 photo for a 24×36" poster. Expected: a real 8× example with stated dimensions and cost; an honest PPI number and a recommendation that points at upscaling only when it helps.

---

## 5. Checkpoint Protocol

`prd-work-reviewer` after each phase with the standard integration audit. **Manual checkpoint additionally required for all three phases** — every one is a visual or editorial change.

---

## 6. Acceptance Criteria

**Consumer-scoped**

- [ ] The homepage keeps its broad "image upscaler" role: URL unchanged, and its non-brand tracked query set has a dated baseline by device and country.
- [ ] A first-time mobile visitor learns upload formats, max scale, signup requirement and free allowance within one screen, and the demo shows a hard image handled well.
- [ ] The comparison article's Topaz/Gigapixel entry is correct by product and version, ownership is disclosed, and the test is reproducible from the stated inputs.
- [ ] A reader can follow `/scale/upscale-16x` end to end and knows when to stop.
- [ ] A reader with an already-print-ready image is told they need nothing.
- [ ] Every changed title has its previous value and change date recorded.
- [ ] No new batch of pSEO pages was published during this window; nothing was retired without a backlink and conversion check.

**Illustrative only — not a forecast.** At unchanged impressions: comparison 7.56%→10% ≈ **+261** clicks/28d; poster 0.26%→0.75% ≈ **+150**; Topaz 1.32%→2% ≈ **+93**; combined arithmetic **≈503**. These are scenario calculations, not predictions or benchmarks. The business result depends on whether those visitors successfully upscale and pay — which PRD 2 is what makes visible.

**Binary done checks**

- [ ] All three phases complete · all specified tests pass · `yarn verify` passes
- [ ] All automated checkpoints passed; all three manual checkpoints passed
- [ ] UI exists for every user-facing change

**Integration gates**

- [ ] Ledger has zero `TBD` cells; every live caller is a real non-test `file:line`
- [ ] Every new exported symbol has a non-test consumer (census pasted)
- [ ] Revert check passed
- [ ] 16× absolutes and the poster article's generic CTA are gone — no second live source
- [ ] Every gate's negative control was **observed failing**
- [ ] Proved on the real production subjects — the live homepage and the published comparison article, in a regional-credit, DB-backed-content environment. No phase is proved on a scratch page.

**Post-deploy:** append to the SEO changes backlog per phase; add one row per changed URL to the GSC request-indexing backlog, request indexing manually, then clean up. Re-measure the same page/query/device cohorts only after recrawl.

Claude-Session: https://claude.ai/code/session_01Q5BmRtQ45bbRxS9JbPgN4W
