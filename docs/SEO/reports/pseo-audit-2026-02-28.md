# Programmatic SEO Health Audit — MyImageUpscaler

**Date:** 2026-02-28
**Auditor:** pSEO Audit Skill
**Pages in Program:** 328 English base pages / ~1,292 total including localized variants
**Pages Sampled:** 4 pages (stratified: 1 top-performing, 1 lowest-performing, 1 from largest category, 1 random)
**Mode:** Standard
**Prior Audit:** None — first audit

---

## Executive Summary

### Overall Program Health: 🔴 CRITICAL (45/100)

| Metric                 | Value      | Status | Benchmark              |
| ---------------------- | ---------- | ------ | ---------------------- |
| Quality Score          | 45/100     | ⚠️ WARNING | 80+ = 🟢          |
| Penalty Risk Score     | 73/100     | 🔴 CRITICAL | Below 20 = 🟢 Safe |
| Indexation Rate        | **11.5%** (159/1,380) | 🔴 RED | 60%+ = 🟢     |
| Content Uniqueness     | ~50% avg   | 🟡 MARGINAL | 60%+ = 🟢        |
| Value Threshold Score  | 44/100     | ⚠️ WARNING | 67%+ = 🟢         |
| Scaling Stage          | Pilot (failing prereqs) | — | — |
| Scaling Recommendation | **PAUSE — fix fundamentals first** | — | Based on quality score |

### Signal Status: 🔴 RED

The pSEO program has critical structural problems. Only **159 of 1,380 submitted pages are indexed (11.5%)** — well below the 60% target. All pSEO impressions are brand-query artifacts rather than organic keyword traffic. The domain has grown to **DR 19 with 79 referring domains** — enough authority for Google to index pages at a reasonable rate. That only 11.5% are indexed suggests Google is selectively accepting the higher-quality pages and rejecting the template-heavy majority. Additionally, 9 data files (94 pages) have no route handlers, 1 category (ai-features) has a route but is missing from the sitemap index, and there is no conditional generation system — all pages are immediately indexed regardless of quality or demand signals.

**The root issue is content depth, not domain authority.** DR 19 / 79 referring domains is sufficient for more indexation. The 88.5% rejection rate points at thin content / template-dilution — 65-70% boilerplate on the three largest categories. The program needs quality improvement before any new page creation.

---

## 1. Value Threshold Framework Results

### Test 1: Unique Answer Test — 🟡 MARGINAL (1/3 pts)

**Methodology:** 4 sampled pages compared against 2-3 sibling pages for content swap-ability.

| Page | Category | Unique % | Template % | Assessment |
|------|----------|----------|------------|------------|
| /scale/upscale-to-4k | scale | **65%** | 35% | ✅ PASS — 18 concrete 4K-specific data points |
| /alternatives/vs-topaz | alternatives | **30-35%** | 65-70% | ❌ FAIL — generic marketing vs real benchmarks |
| /format-scale/jpeg-upscale-2x | format-scale | **35-40%** | 60-65% | ❌ FAIL — 65-70% transferable to PNG 2x verbatim |
| /platform-format/midjourney-upscaler-png | platform-format | **30-35%** | 65-70% | ❌ FAIL — 6-7 Midjourney-PNG-specific points in 3K words |

**Average content uniqueness: ~50%** — falls in the MARGINAL zone (40-59%).

**Specific issues by category:**
- `format-scale` (36 pages, largest English-only category): The 60-65% template section applies identically across all 36 format×scale combinations. "Why Choose Us," "Best Practices," "Pro Tips" are verbatim copy. Only the technical specs section changes.
- `platform-format` (43 pages, largest category overall): Only ~30% of content changes between combinations. Platform descriptions and format descriptions are reused from parent pages.
- `alternatives` (19 pages): Comparison tables lack benchmarks, speed tests, or actual user research. "10x faster" and "superior text preservation" are asserted without evidence.

**Score: 1/3**

---

### Test 2: Data Substantiation Test — ✅ PASS (3/3 pts)

| Page | Unique Data Points | Key Data Present | Score |
|------|--------------------|------------------|-------|
| /scale/upscale-to-4k | **18** | Resolution specs, DPI/print sizes, processing times, pixel counts, CNN architecture | ✅ 3/3 |
| /alternatives/vs-topaz | **8-10** | Pricing ($99.99 vs free+$19/mo), platform type, feature matrix | ✅ 3/3 |
| /format-scale/jpeg-upscale-2x | **12** | File size math, processing time, max dimensions, encoding types, JPEG quality thresholds | ✅ 3/3 |
| /platform-format/midjourney-upscaler-png | **6-7** | U1-U4 workflow, 8192×8192 output, transparency preservation, Niji model notes | ✅ 3/3 |

All sampled pages have 5+ unique data points rooted in real product behavior. The data is accurate and specific. The problem is not data absence but data *dilution* — real data points are buried in template prose.

**Score: 3/3**

---

### Test 3: Engagement Sustainability Test — ❌ FAIL (0/3 pts)

| Metric | pSEO Pages | Site Average | Gap | Status |
|--------|-----------|--------------|-----|--------|
| CTR | **0.68%** | ~12.83% (non-pSEO) | **-94.7%** | ❌ FAIL |
| Average Position | 19.58 | 24.73 (site-wide) | pSEO slightly better | 🟡 OK |
| Clicks | 12 total (49 pages in GSC) | 332 total | pSEO = 3.6% of clicks | ❌ FAIL |
| Impressions source | ~99% brand-query artifacts | Mixed organic+brand | Not organic | ❌ FAIL |

**Critical context:** The 0.68% pSEO CTR is not an organic ranking signal — it reflects Google surfacing pSEO pages as sitelinks when users search "myimageupscaler.com" (the brand). Of 49 pSEO pages with GSC data, 43 have zero clicks. Only 3 non-branded keyword impressions exist on pSEO pages (max 2 impressions each). The pSEO program has zero organic keyword traction at this time.

**Score: 0/3**

**Value Threshold Score: (1+3+0)/9 × 100 = 44/100**

---

## 2. Quality Score Breakdown (45/100)

| Dimension             | Score | Max | Evidence |
| --------------------- | ----- | --- | -------- |
| Unique Content %      | 10    | 20  | Avg ~50% uniqueness across siblings (MARGINAL zone, -10pts below 60% threshold) |
| Unique Data Points    | 15    | 15  | Avg 11.4 data points per page — all sampled pages pass 5+ threshold |
| Engagement vs Average | 0     | 25  | CTR 94.7% below non-pSEO average — automatic FAIL (>50% below) |
| Organic Traffic Trend | 2     | 20  | 159 pages indexed (11.5%), 5 organic keywords ranking; nascent but not zero |
| Conversion Actions    | 20    | 20  | 4-8 CTAs per page, all above-fold, strong "Try Free" placement |

**Tier: ⚠️ WARNING (40-59) — pause scaling, enhance existing pages first**

The strong conversion action score masks the severe engagement and traffic problems. CTAs are well-placed but have no organic traffic to convert.

---

## 3. Traffic Light Assessment

### Green Flags Passing: 2/8

| Flag | Status | Evidence |
|------|--------|----------|
| Indexation rate 60%+ of submitted | ❌ FAIL | **11.5% indexed (159/1,380)** |
| pSEO engagement within 30% of site CTR | ❌ FAIL | 94.7% below |
| Consistent/growing organic traffic per pSEO page | ❌ FAIL | 0 organic impressions on keyword targets |
| 5-15 internal links per page | ✅ PASS | 12-18 internal links per sampled page |
| Crawl efficiency above 50% | ❌ FAIL | 11.5% indexed — 88.5% crawled but rejected |
| Content uniqueness above 60% | ❌ FAIL | ~50% average |
| No manual actions | ✅ PASS | None detected in GSC |
| No zombie categories serving 404s | ❌ FAIL | ai-features: route exists but not in sitemap.xml index; 8 data files with no routes |

---

### Yellow Flags Triggered: 3/6

| Flag | Status | Evidence |
|------|--------|----------|
| Indexation rate 40-60% | — | Below this range (0%) → escalates to Red |
| Engagement 30-50% below average | — | Below this range (94.7%) → escalates to Red |
| Flat/declining traffic per pSEO page (90d) | 🟡 TRIGGERED | No organic traffic at all — never lifted off |
| Crawl budget waste 30%+ | 🟡 TRIGGERED | 1,380 submitted, only 159 indexed — 88.5% rejected |
| 20%+ pages with <3 unique data points | ❌ NOT triggered | Sampled pages all have 5+ data points |
| Zombie/orphan categories in sitemap | 🟡 TRIGGERED | See Section 4 for full breakdown |

---

### Red Flags Triggered: 2/7

| Flag | Status | Evidence |
|------|--------|----------|
| Indexation rate below 40% | 🔴 TRIGGERED | **11.5% indexed (159/1,380)** |
| Engagement 50%+ below site average | 🔴 TRIGGERED | 94.7% below, all impressions brand-query artifacts |
| Site-wide traffic decline after pSEO launch | — | Cannot confirm — not enough historical data |
| Manual action notice | ✅ Clear | None in GSC |
| Crawl errors above 10% on pSEO pages | — | No crawl error data available from GSC API |
| Duplicate content warnings 20%+ | 🟡 Partial | Trailing slash duplicates confirmed on 2+ URL pairs |
| Average content uniqueness below 40% | — | Avg 50% (above threshold, but some pages at 30-35%) |

**Signal: 🔴 RED — Halt scaling. The indexation bottleneck must be resolved before adding pages.**

---

## 4. Indexation Health

| Metric | Value | Benchmark | Status |
|--------|-------|-----------|--------|
| Pages Submitted (sitemap) | **1,380** | — | — |
| Pages Indexed (via sitemap) | **159** | 60%+ of submitted | 🔴 RED |
| Indexation Rate | **11.5%** | 60%+ | 🔴 RED |
| Sitemap first submitted | 2026-01-21 (37 days ago) | — | 🟡 Early — Google typically 2-12 weeks |
| Sitemap last crawled by Google | 2026-02-27 | — | ✅ Active |
| Sitemap errors | 0 | 0 | ✅ Clean |
| Non-branded keyword impressions | ~5 total across all pSEO pages | — | 🔴 CRITICAL |
| Trailing slash duplicate pairs | ≥2 confirmed | 0 | 🟡 Fix needed |

**Root causes for 88.5% rejection rate (revised with DR 19 and 11.5% indexation context):**

> **Key insight:** 159 pages ARE indexed — Google is selectively accepting pages and rejecting others. This is better than 0% but reveals a quality-sorting pattern: Google is likely indexing the stronger pages (scale, tools, formats) and deprioritizing the template-heavy categories (platform-format, format-scale, alternatives). The 88.5% rejection rate confirms thin content detection at scale.

> **GSC API vs dashboard discrepancy:** The GSC API reported 0 indexed pages; the GSC dashboard shows 159/1,380. Use dashboard figures as ground truth. The API may have returned sitemap-specific indexation data with a lag.

1. **Thin content / template-dilution (primary)** — 65-70% of `platform-format` and `alternatives` pages is reusable boilerplate. 36 `format-scale` pages share the same "Why Choose Us," "Best Practices," "Pro Tips" sections verbatim. Google's systems detect variable-substitution patterns at scale and are selectively rejecting these categories.
2. **E-E-A-T signals absent** — No author attribution, no original research, no unique benchmark data. At 1,292 pages from a DR 19 site, Google requires stronger expertise signals to index the long tail.
3. **81 nested sitemaps** — may spread crawl budget thin; Google may be processing sitemaps in priority order and not yet fully crawling the lower-priority ones.
4. **Off-topic content** — `/compare/midjourney-vs-stable-diffusion` at position 61 for AI art queries sends mixed topical signals for a photo upscaling domain.
5. **Authority/page ratio still high** — 1,380 pages at DR 19 = ~7.3× the "safe" ratio (DA × 10 = 190). Google is rationing indexation budget accordingly.

### Zombie/Orphan Category Status

| Category | JSON Pages | Route Handler | Sitemap File | In Sitemap Index | Status |
|----------|-----------|---------------|--------------|-----------------|--------|
| ai-features | 12 | ✅ exists | ✅ exists | ❌ NOT registered | ⚠️ Not submitted to Google |
| comparisons-expanded | 7 | ❌ no route | ❌ no sitemap | ❌ | 🔴 Dead data |
| personas-expanded | 10 | ❌ no route | ❌ no sitemap | ❌ | 🔴 Dead data |
| technical-guides | 10 | ❌ no route | ❌ no sitemap | ❌ | 🔴 Dead data |
| use-cases-expanded | 10 | ❌ no route | ❌ no sitemap | ❌ | 🔴 Dead data |
| competitor-comparisons | 22 | ❌ no route | ❌ no sitemap | ❌ | 🔴 Dead data |
| social-media-resize | 10 | ❌ no route | ❌ no sitemap | ❌ | 🔴 Dead data |
| format-conversion | 10 | ❌ no route | ❌ no sitemap | ❌ | 🔴 Dead data |
| device-specific | 3 | ❌ no route | ❌ no sitemap | ❌ | 🔴 Dead data |
| comparison (4p) | 4 | ⚠️ data file uses compare route | — | ✅ as 'compare' | ⚠️ Naming mismatch |
| interactive-tools (8p) | 8 | ⚠️ routes to /tools/[slug] | — | ✅ as 'tools' | ✅ Actually OK |

**Total hidden/dead pages: 94** (12 ai-features not submitted + 82 with no routes)

---

## 5. Penalty Risk Assessment (78/100)

| Risk Factor | Score | Max | Evidence |
|-------------|-------|-----|----------|
| Content Uniqueness Gap | 25 | 25 | (60%-50%) × 2.5 = 25 — average uniqueness below threshold |
| Indexation Gap | 20 | 20 | (60%-0%) × 2.0 = 120 → capped at 20 |
| Missing Data Points | 0 | 20 | 0% of sampled pages have <3 data points — data quality is solid |
| Engagement Gap | 15 | 15 | 94.7% below site average — maximum engagement risk |
| Authority/Page Ratio | 5 | 10 | DR 19 with 79 ref. domains, 1,380 pages → ratio 7.3:1. Moderate risk, Google rationing indexation. |
| Generation Gate Compliance | 7.5 | 10 | 3/4 rules missing (data gate, demand validation, engagement indexing) |

**Total Penalty Risk: 72.5/100 → 🔴 CRITICAL RISK (61-80)**

> **Note (2026-02-28 revision):** Authority/Page ratio risk was revised from 10/10 to 5/10 following confirmation of DR 19 and 79 referring domains (up from DR 0 / 8 referring domains at prior audit). The overall penalty risk drops from 78 to 73, but remains firmly in Critical territory. Critically, the improved DR means the 0% indexation rate is now a **content quality signal**, not an authority signal — the diagnosis and recommended actions shift accordingly (see Section 9).

**Specific penalty risks by type:**

**1. Thin Content at Scale (algorithmic risk — HIGH)**
- 43/49 pSEO pages in GSC have zero clicks
- 30-35% of content on several categories (platform-format, alternatives) is Midjourney/competitor-specific but templated
- Google's systems can detect variable-substitution patterns across 1,292 pages

**2. Index Bloat (algorithmic risk — HIGH)**
- 1,380 URLs submitted, 159 indexed (11.5%)
- Authority/page ratio is far beyond safe zone (typically <10× DA)
- Google is choosing not to index despite crawling (the key signal)

**3. Off-Topic Content (topical confusion risk — MEDIUM)**
- `/compare/midjourney-vs-stable-diffusion`: ranks position 61 for "midjourney vs stable diffusion" — this is an AI art tool comparison query, completely off-topic for a photo upscaler
- This page creates topical signal confusion for the domain

**4. Duplicate URLs (algorithmic risk — LOW)**
- Trailing slash duplicates confirmed: `/it/tools/transparent-background-maker` and `/it/tools/transparent-background-maker/` both appear in GSC
- At least 2 confirmed pairs; may be more

---

## 6. Scaling Readiness

**Current Stage: Pilot (failing stage prerequisites)**
**Current Page Count:** 328 English / ~1,292 total including locales

| Pilot Stage Requirement | Met? | Current Value | Target |
|------------------------|------|--------------|--------|
| Indexation rate ≥70% of submitted pages | ❌ | 0% | 70% |
| Engagement within 30% of site average CTR | ❌ | 94.7% below | Within 30% |
| Zero crawl errors on pSEO pages | Unknown | — | 0% |
| Baseline metrics established | 🟡 Partial | This audit = baseline | ✅ |
| Monitoring in place | ❌ | No automated quality monitoring | Required |
| Sufficient domain authority | ✅ | **DR 19, 79 ref. domains** | DR 10+ |

> **Revised assessment:** Domain authority is NO LONGER the bottleneck to Pilot stage completion. At DR 19, Google should be indexing pages. The indexation failure is now attributable to content quality. The two remaining blockers are: (1) increase content uniqueness above 60% in at least the top 3 categories, and (2) reduce template boilerplate so Google stops classifying pages as thin content.

**To advance to First Scale (500-2,000 pages):**

| Requirement | Met? | Gap |
|-------------|------|-----|
| Automated quality checks | ❌ | No generation gates or quality scoring system |
| Engagement tracking by page group | ❌ | No per-category engagement monitoring |
| 70%+ indexation rate | ❌ | 0% → requires domain authority building |
| Content uniqueness >60% | ❌ | ~50% → requires template reduction |
| Zero zombie/orphan categories | ❌ | 9 orphan data files, 1 sitemap gap |

**Scaling Recommendation: 🚨 No scaling — resolve content quality bottleneck first**

With DR 19 and 79 referring domains, the domain has the authority for indexation to begin. The blocker is now **content quality**: Google is crawling pSEO pages and actively rejecting them, which at this authority level signals thin content detection. Adding more pages will deepen the thin-content signal before fixing the existing 1,292 pages. The path forward is to improve uniqueness on the highest-volume categories (platform-format 43p, format-scale 36p, alternatives 19p) first, then watch indexation rate as the leading indicator.

---

## 7. Conditional Generation Compliance

| Rule | Implemented? | Evidence |
|------|-------------|----------|
| Data Requirement Gate | ❌ Missing | No minimum data validation before JSON entry creation; data files can contain empty or minimal entries |
| Search Demand Validation | ❌ Missing | No keyword volume check before generating pages; `comparisons-expanded`, `technical-guides` etc. created without demand validation |
| Engagement-Based Indexing | ❌ Missing | `metadata-factory.ts:93` → `robots: { index: true }` hardcoded on ALL pages; no conditional noindex |
| Continuous Quality Scoring | 🟡 Partial | `tests/unit/seo/pseo-keyword-alignment.unit.spec.ts` validates keyword presence; `pseo-duplicate-slugs.unit.spec.ts` checks uniqueness; but no quality threshold tests or automated engagement-based flagging |

**Compliance: 0.5/4 rules implemented**

The most critical missing piece is **Engagement-Based Indexing**. Publishing 1,380 pages all with `index: true` is contributing to the indexation bottleneck. A pilot-index → monitor → conditionally-remove-noindex workflow would:
1. Allow Google to crawl without indexation pressure
2. Focus indexation budget on highest-quality pages first
3. Prevent thin content signals from accumulating

---

## 8. Page Sample Details

| Page URL | Category | Uniqueness | Data Points | CTAs | FAQ | Internal Links | Quality |
|----------|----------|-----------|------------|------|-----|----------------|---------|
| /scale/upscale-to-4k | scale | 65% | 18 | 5 | ✅ 4 Qs | 12-15 | 7/10 |
| /alternatives/vs-topaz | alternatives | 30-35% | 8-10 | 7-8 | ✅ 6 Qs | 15-20 | 4/10 |
| /format-scale/jpeg-upscale-2x | format-scale | 35-40% | 12 | 6 | ✅ 4 Qs | 14 | 6.5/10 |
| /platform-format/midjourney-upscaler-png | platform-format | 30-35% | 6-7 | 4 | ✅ 5 Qs | 15-18 | 6.5/10 |

**Observations:**
- All pages have FAQs with schema markup ✅
- All pages have above-fold CTAs ✅
- Internal linking is adequate (12-20 links) ✅
- Content quality is highest in `scale` category, weakest in `alternatives` and `platform-format`
- Before/after images: only `/scale/upscale-to-4k` confirmed; not detected on others

**Core Web Vitals (measured on 2 pSEO pages — `/scale/ai-upscaler-2x` and `/formats/upscale-jpeg-images`):**

| Metric | Scale (Mobile) | Scale (Desktop) | Formats (Mobile) | Formats (Desktop) | Status |
|--------|---------------|-----------------|-----------------|------------------|--------|
| Performance | 63 | 62 | 63 | 65 | ⚠️ Below threshold |
| **LCP** | **8.4s** | **7.7s** | **7.3s** | **6.6s** | 🔴 POOR (target <2.5s) |
| TBT | 380ms | 20ms | 460ms | 20ms | 🔴 Mobile POOR |
| CLS | 0.003 | 0.002 | 0.003 | 0.002 | ✅ Excellent |
| SEO | 100 | 100 | 100 | 100 | ✅ Perfect |
| Accessibility | 98 | 98 | 98 | 98 | ✅ Excellent |

Note: Desktop performance (62-65) is significantly worse than the site homepage baseline (91). pSEO pages have heavier page weight than non-pSEO pages. Unused JavaScript: 212-213 KiB (saves ~910-1,370ms if removed). Full PageSpeed report: `docs/pagespeed-report-2026-02-28.md`.

---

## 9. Prioritized Action Plan

### Immediate (This Week)

**1. Fix the sitemap.xml index — add ai-features (12 pages)**
- File: `app/sitemap.xml/route.ts:18`
- Add `'ai-features'` to `ENGLISH_ONLY_SITEMAP_CATEGORIES` array
- These pages have routes but are invisible to Google's sitemap crawler

**2. Resolve trailing slash duplicate URLs**
- Confirmed pairs: `/it/tools/transparent-background-maker` + trailing slash variant
- Audit all localized tool pages for canonical consistency
- Ensure middleware or `generateMetadata` sets canonical without trailing slash consistently

**3. Fix pSEO page LCP (8.4s → target <2.5s) — mobile performance critical**
- Root cause: hero/above-fold image not preloaded; 212-213 KiB unused JavaScript
- Add `<link rel="preload" as="image">` for above-fold hero asset in pSEO templates
- Remove `loading="lazy"` from any above-fold images in `app/(pseo)/_components/`
- Lazy-load GTM after `load` event (saves 70 KiB); audit `3794-1dbfe9ba.js` chunk (37 KiB)
- Note: desktop performance on pSEO pages (62-65) is worse than homepage (91) — pSEO templates carry heavier bundle

**4. Remove or noindex the off-topic comparison page**
- File: `app/seo/data/comparison.json` → slug: `midjourney-vs-stable-diffusion`
- This page ranks ~61 for "midjourney vs stable diffusion" — off-topic, burns crawl budget
- Options: delete from JSON (page 404s), or set `noindex` in its metadata

**4. Implement engagement-based indexing for new categories**
- File: `lib/seo/metadata-factory.ts:93`
- Pattern: new pages in unproven categories should start `noindex: true`, graduate to `index: true` after 30-day engagement check
- Minimum viable: add a `NOINDEX_CATEGORIES` config to start `technical-guides`, `personas-expanded`, etc. as noindex before resolving their routing

---

### Short-Term (This Month)

**5. Build routes for high-value orphan data files**
- Priority order by page count: competitor-comparisons (22 pages), social-media-resize (10), format-conversion (10), personas-expanded (10), technical-guides (10), use-cases-expanded (10)
- Before building routes, validate each category has search demand
- Consider: are these better as blog posts (more crawlable, more linkable) than pSEO pages?

**6. Reduce template boilerplate in platform-format (43 pages) and format-scale (36 pages)**
- Target: increase uniqueness from 30-35% → 60%+ for at least 20 pages each
- Specific: expand `detailedDescription` and `technicalDetails` fields (already exist in schema) with genuinely unique per-combination data
- Platform-format pages need platform-specific workflow depth (Midjourney v6 specifics, DALL-E 3 specifics, etc.)

**7. Add benchmarks to alternatives pages**
- Currently: marketing claims ("10x faster", "superior text preservation") without evidence
- Add: side-by-side upload screenshots, processing time measurements, actual quality comparisons
- Target 5 core alternatives pages first (vs-topaz, vs-gigapixel, vs-waifu2x, etc.)

**8. Fix mobile LCP (7.8s → target <2.5s)**
- Investigate hero image optimization on pSEO pages
- Check if before/after images are loading lazily
- Consider: preload hero image, convert to WebP/AVIF with proper sizing

---

### Medium-Term (This Quarter)

**9. Content depth overhaul — the #1 bottleneck (revised)**
- At DR 19 / 79 referring domains, authority is no longer the excuse. Google is evaluating content quality and rejecting pages as thin content.
- **Target:** Increase uniqueness to 60%+ in the 3 largest categories: `platform-format` (43p), `format-scale` (36p), `alternatives` (19p)
- **Tactics:**
  - `platform-format`: Add platform-version-specific notes (Midjourney v6 vs v5, DALL-E 3 vs 2, SD XL vs 1.5); add real before/after examples per platform
  - `format-scale`: Remove verbatim "Why Choose Us" / "Pro Tips" sections shared across all 36 pages; replace with format-specific quality degradation data (actual SSIM/PSNR at each scale factor)
  - `alternatives`: Replace unsubstantiated claims ("10x faster") with actual processing time measurements; add side-by-side output screenshots
- **Leading indicator:** Watch Google Search Console for pSEO pages transitioning from "Crawled - currently not indexed" to "Indexed" as uniqueness improves
- **Backlinks note:** DR 19 with 79 referring domains is adequate for indexation. Continue growing organically (directories, PR) but this is no longer the primary lever.

**10. Implement conditional generation gates**
- Data Requirement Gate: Add validation to pseo data creation workflow requiring minimum 5 data point fields to be non-empty
- Search Demand Validation: Add keyword volume check before creating new JSON entries (use GSC or keyword research data)
- Add `tests/unit/seo/pseo-quality-thresholds.unit.spec.ts` to enforce minimum data requirements per JSON file

**11. Topical authority consolidation**
- Audit and consolidate: `comparisons-expanded` + `comparison.json` + `compare` route — these overlap conceptually
- Remove or merge: `ai-features` into the main tools category (12 pages on AI features that belong in /tools/ context)
- Archive `device-specific` (3 pages) — too small for its own category

**12. Index monitoring system**
- Set up weekly GSC export tracking indexation rate per category
- Alert threshold: if any category drops from indexed → not-indexed for 10%+ of pages
- Track non-branded keyword impressions per pSEO category separately from brand query

---

### Ongoing Monitoring (Metrics to Track)

| Metric | Current | Alert Threshold | Check Frequency |
|--------|---------|-----------------|-----------------|
| Indexed pages via sitemap | 159 (11.5%) | Alert if drops below 130 or exceeds 400 | Weekly |
| Non-branded impressions on pSEO pages | ~5 total | Alert if below baseline after improvement | Weekly |
| Trailing slash duplicates | 2+ pairs | Alert if new pairs appear | Monthly |
| Content uniqueness % | ~50% avg | Alert if drops below 40% | Per data file addition |
| New pages with <5 data points | 0 (so far) | Alert at first occurrence | Per PR adding JSON data |

---

## 10. Comparison with Best-in-Class

### How Top pSEO Programs Succeed

**Canva Model (design tool pages):**
- Unique per-template screenshots showing the actual template
- Real dimension specifications tied to real use cases (Instagram post: 1080×1080px)
- Interactive preview — users can try before they fully commit

**Our Gap:** pSEO pages describe the product (upload → enhance → download) but don't demonstrate it. Before/after images are present on scale pages but absent on format-scale and platform-format pages. The `/alternatives/vs-topaz` page has a comparison table with no benchmark images.

**Cloudinary / Imgix Model (image processing docs):**
- Real compression ratio benchmarks with actual numbers
- Code examples for developer use cases
- Format comparison tables with SSIM/PSNR scores (objective quality metrics)

**Our Gap:** The `formats`, `format-scale`, and `camera-raw` categories could include objective quality metrics (file size at different quality settings, processing time measurements, SSIM comparisons). Currently these are prose descriptions — "JPEG balances quality and file size" — rather than data-driven comparisons.

**ChatGPT's SEO model (AI tool pages):**
- Massive domain authority inherited from brand traffic converts to pSEO indexation
- User-generated link acquisition (people link to ChatGPT tools naturally)

**Our Gap:** At DR 0, we cannot rely on authority inheritance. Every pSEO page needs to be linkworthy on its own merit. Currently, no pSEO page is linkworthy (no original research, no tools, no unique data).

**The most actionable gap:** Add one "linkable asset" per major pSEO category — a comparison table with real benchmark data, a before/after gallery, or a format decision wizard. Even one true linkworthy asset per category can generate the 2-3 backlinks needed to unlock Google indexation.

---

## Methodology

- **Framework:** Value Threshold Framework (Unique Answer, Data Substantiation, Engagement Sustainability)
- **Quality Scoring:** 5-dimension weighted scoring (0-100)
- **Penalty Risk:** 6-factor weighted risk assessment (0-100)
- **Data Sources:** GSC API (2026-01-31 to 2026-02-25, 28 days), sitemap crawl via sitemap.xml, page content analysis via WebFetch on 4 sampled pages, `app/seo/data/` JSON file inventory, codebase inspection of `lib/seo/metadata-factory.ts`, `app/sitemap.xml/route.ts`, `lib/seo/localization-config.ts`
- **Prior Audit:** None — this is the first audit (baseline)
- **PageSpeed Data:** Lighthouse measured on `/scale/ai-upscaler-2x` and `/formats/upscale-jpeg-images` — mobile perf 63, desktop 62-65, LCP 7.3-8.4s (mobile), SEO 100/100. Full report in `docs/pagespeed-report-2026-02-28.md`

---

## Appendix A: Full Category Inventory

| Category | JSON Pages | Route | Sitemap | PSEOCategory Type | Localized |
|----------|-----------|-------|---------|-------------------|-----------|
| scale | 17 | ✅ | ✅ | ✅ | ✅ (7 locales) |
| formats | 10 | ✅ | ✅ | ✅ | ✅ |
| use-cases | 12 | ✅ | ✅ | ✅ | ✅ |
| tools | 7 | ✅ | ✅ | ✅ | ✅ |
| alternatives | 19 | ✅ | ✅ | ✅ | ✅ |
| free | 6 | ✅ | ✅ | ✅ | ✅ |
| guides | 9 | ✅ | ✅ | ✅ | ✅ |
| format-scale | 36 | ✅ | ✅ | ✅ | ✅ |
| platform-format | 43 | ✅ | ✅ | ✅ | ✅ |
| device-use | 17 | ✅ | ✅ | ✅ | ✅ |
| compare | 4 (comparison.json) | ✅ | ✅ | ✅ | ❌ |
| platforms | 5 | ✅ | ✅ | ✅ | ❌ |
| bulk-tools | 2 | ✅ | ✅ | ✅ | ❌ |
| content | 8 | ✅ | ✅ | ✅ | ❌ |
| photo-restoration | 5 | ✅ | ✅ | ✅ | ❌ |
| camera-raw | 8 | ✅ | ✅ | ✅ | ❌ |
| industry-insights | 13 | ✅ | ✅ | ✅ | ❌ |
| device-optimization | 5 | ✅ | ✅ | ✅ | ❌ |
| **ai-features** | **12** | **✅** | **file exists** | **✅** | **❌ — NOT in sitemap.xml index** |
| **comparisons-expanded** | **7** | **❌** | **❌** | **✅** | **❌ — dead data** |
| **personas-expanded** | **10** | **❌** | **❌** | **✅** | **❌ — dead data** |
| **technical-guides** | **10** | **❌** | **❌** | **✅** | **❌ — dead data** |
| **use-cases-expanded** | **10** | **❌** | **❌** | **✅** | **❌ — dead data** |
| **competitor-comparisons** | **22** | **❌** | **❌** | **❌** | **❌ — dead data** |
| **social-media-resize** | **10** | **❌** | **❌** | **❌** | **❌ — dead data** |
| **format-conversion** | **10** | **❌** | **❌** | **❌** | **❌ — dead data** |
| **device-specific** | **3** | **❌** | **❌** | **❌** | **❌ — dead data** |
| interactive-tools | 8 | ⚠️ → /tools/ | ✅ (as tools) | ❌ | ❌ — mapped to tools route |
| **TOTAL** | **328** | | | | |

**Bold rows = require action**

---

## Appendix C: Domain Authority (Ahrefs, as of 2026-02-28)

| Metric | Value | Change |
|--------|-------|--------|
| Domain Rating | **19** | +19 ↑ |
| Referring Domains | **79** | +69 ↑ |
| Total Visitors | **418** | +408 ↑ |
| Organic Traffic (Ahrefs) | **0** | — |
| Organic Keywords (Ahrefs) | **5** | +4 ↑ |
| Organic keyword countries | GR, IN, ID, NZ, PH | — |
| Tracked keywords in top 3 | 0 | — |
| Tracked keywords in top 10 | 0 | — |
| Tracked keywords in 11-20 | 0 | — |
| Tracked keywords 21+ | 30 | +30 ↑ |

**Implication:** DR 19 / 79 referring domains is sufficient for Google to begin indexing pSEO pages. The 0% sitemap indexation rate is therefore a **content quality signal**, not an authority signal. The 5 organic keywords (all in lower-competition markets) confirm the content can rank when competition is low — the issue is topical depth and template dilution on high-competition queries.

---

## Appendix B: GSC Raw Data Summary (2026-01-31 to 2026-02-25)

| Metric | Value |
|--------|-------|
| Total site clicks | 332 |
| Total site impressions | 842 (query-level) |
| Avg site CTR | 29.04% (inflated by brand query) |
| Avg site position | 24.73 |
| pSEO page clicks | 12 |
| pSEO page impressions | 1,767 (99%+ brand-query artifacts) |
| pSEO CTR | 0.68% |
| pSEO pages with zero clicks | 43/49 (88%) |
| Non-branded pSEO keyword impressions | ~5 total |
| Sitemap submitted | 2026-01-21 |
| Sitemap errors | 0 |
| Pages submitted | 1,380 |
| Pages indexed via sitemap | **0** |
| Top pSEO page by clicks | /device-use/desktop-photo-editing-upscaler (3 clicks) |
| Best CTR pSEO page | /free/free-ai-upscaler (40% CTR, 5 impressions) |
| Off-topic outlier | /compare/midjourney-vs-stable-diffusion (pos 61, 160 impressions) |
