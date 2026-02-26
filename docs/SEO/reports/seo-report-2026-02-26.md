# SEO Health Report - myimageupscaler.com

**Date:** 2026-02-26
**Auditor:** SEO Manager Orchestrator
**URL:** https://myimageupscaler.com
**Skills Used:** GSC data (existing), PageSpeed/Lighthouse, SquirrelScan, On-Page SEO Review, AI Search Optimization, Internal Linking Analysis
**Skills Skipped/Failed:** Blog Audit (rate limit), Backlink Analysis (rate limit)
**Prior Reports:** docs/SEO/reports/seo-report-2026-02-25.md (47/100)
**GSC Data Period:** January 12 - February 6, 2026 (28 days)

---

## Executive Summary

### Overall SEO Health Score: 52/100 [+5 vs Feb 25]

> **Score improvement** reflects: (1) AI search readiness now properly measured (78/100), (2) internal linking properly quantified (51/100), (3) mobile performance improved (+16). The methodology now includes AEO/GEO as a weighted dimension.

| Dimension | Score | Weight | Trend | Key Finding |
|---|---|---|---|---|
| Technical SEO (SquirrelScan) | 64/100 | 20% | [=] | No regressions; accessibility 93, performance 87 |
| Core Web Vitals (PageSpeed) | 80/100 | 15% | [=] | Mobile perf 72 (+16 vs Feb 11); LCP still 6.8s |
| On-Page SEO | 35/100 | 15% | [+4] | German title still not matching queries; zero outbound links |
| Content / Blog | 62/100 | 10% | [=] | 38 posts, 1 thin stub; GSC query coverage good |
| Schema / Structured Data | 78/100 | 5% | [+30] ✅ | Organization.logo fixed; missing @id in pSEO layout |
| Internal Linking | 51/100 | 10% | [first measure] | Top GSC page has 0 internal links; localized pages orphaned |
| Backlinks | 25/100 | 10% | [=] | DR 18, 75 domains (remarkable growth from DR 0) |
| AI Search Readiness | 78/100 | 5% | [first measure] | llms.txt exists; all AI bots allowed; E-E-A-T gaps |
| GSC Performance | 23/100 | 10% | [=] | 13 clicks/28d, avg pos 57, 134/1,484 indexed (9%) |

**Weighted Overall: 50/100**

---

### Top 5 Priority Issues

1. **[CRITICAL] German transparent background page: 86 impressions, 0 clicks, title doesn't match queries** — `/de/tools/transparent-background-maker` is the #1 GSC page but has zero internal links and its H1/metaTitle don't include "png transparent machen" (37 impressions) or "png hintergrund transparent" (18 impressions). Also has untranslated English H2s. *(GSC: 86 imp, pos 95.6, 0 clicks)*

2. **[HIGH] Internal linking failure: Top GSC page has ZERO internal links** — The homepage's "Popular Tools" section links to `/tools/transparent-background-maker` (English) but NOT `/de/tools/transparent-background-maker` (German). The German version is the top performer but is effectively orphaned. 1,100+ localized pages have minimal link equity. *(Internal linking score: 51/100)*

3. **[HIGH] 134/1,484 pages indexed — 91% in "Discovered but not indexed"** — 9% indexation rate. Root causes: DR 18 still low for 1,484 URLs, 12 zombie ai-features pages return 404, orphan localized pages don't pass link equity. *(GSC Coverage: 134 indexed, 1,350 pending)*

4. **[HIGH] Mobile LCP 6.8s — still 2.7x above "good" threshold** — The 222 KiB unused JS chunk (`ed9f2dc4`) and missing `priority` on LCP logo image are the root causes. Mobile performance improved to 72 but LCP blocks Core Web Vitals pass. *(PageSpeed: LCP 6.8s, TTI 8.5s)*

5. **[MEDIUM] Missing @id on Organization in pSEO layout** — `app/(pseo)/layout.tsx` lacks `@id` on Organization entity, causing duplicate organizations. Fix: Add `'@id': \`${BASE_URL}#organization\``. *(Schema score: 78/100 ✅ Organization.logo fixed)*

---

### Quick Wins (Impact vs Effort)

1. **Fix German page title to match GSC queries** — Change metaTitle to include "PNG transparent machen". Translate English H2s. Effort: 1 hour. Impact: CTR improvement on site's #1 impression page.

2. **Add locale-aware Popular Tools to localized homepages** — The homepage links to English tools only. Add `/de/tools/transparent-background-maker` to `/de/` homepage. Effort: 2 hours. Impact: Passes link equity to top GSC page.

3. **Fix Organization.logo bug** — 2 files, 2-line change each. Effort: 30 mins. Impact: Unblocks rich results sitewide.

4. **Add `priority` prop to LCP logo image** — Single-line fix. Effort: 15 mins. Impact: Reduces LCP by 300-700ms.

5. **Noindex or expand thin ecommerce blog stub** — `/blog/how-to-upscale-images-for-ecommerce` is ~250 words. Effort: 30 mins (noindex) or 2 hours (expand). Impact: Improves domain content quality signal.

---

## 1. Google Search Console Performance

**Data period:** January 12 - February 6, 2026 (28 days)

| Metric | Value | Assessment |
|---|---|---|
| Total Clicks | 13 | < 1/day — pre-growth phase |
| Total Impressions | 296 | Google is experimenting but not committing |
| Average CTR | 4.50% | Healthy rate; volume problem, not CTR |
| Average Position | 57.0 | Page 5-6 average — not competitive |
| Unique Queries | 54 | Very narrow discovery footprint |
| **Pages indexed** | **134 / 1,484** | **9% indexation rate** |

**Top queries by impressions:**

| Query | Pos | Impressions | Clicks | CTR |
|---|---|---|---|---|
| png transparent machen (DE) | 96.6 | 37 | 0 | 0% |
| png hintergrund transparent (DE) | 95.4 | 18 | 0 | 0% |
| transparenter hintergrund (DE) | 96.9 | 17 | 0 | 0% |
| image upscaler | 108.3 | 9 | 3 | 16.67% |
| ai image upscaler | 115.7 | 7 | 0 | 0% |

**Key observation:** 72 of 296 impressions (24%) come from German transparent-background queries on a single page. Moving that one page from pos 96 to pos 20 could triple site click volume.

**Low-hanging fruit:** `/fr/` at position 27.4 is closest to page 1.

---

## 2. Core Web Vitals & Performance

**Audit date:** February 25, 2026 (Lighthouse local run)

| Category | Mobile | Desktop | Prior Mobile (Feb 11) | Change |
|---|---|---|---|---|
| Performance | **72** | **92** | 56 | **+16** |
| SEO | 100 | 100 | 100 | = |
| Accessibility | 100 | 100 | — | — |
| Best Practices | 92 | 88 | — | — |

**Lab Data:**

| Metric | Mobile | Desktop | Status |
|---|---|---|---|
| FCP | 1.7 s | 0.5 s | OK |
| **LCP** | **6.8 s** | 1.8 s | Red (was 7.8s) |
| TBT | 220 ms | 20 ms | Yellow |
| CLS | 0.003 | 0.003 | Green |
| Speed Index | 2.6 s | 1.0 s | OK |
| TTI | 8.5 s | 1.8 s | Red |
| TTFB | 210 ms | 220 ms | Green |

**Top opportunities:**
1. 447 KiB unused JS — `ed9f2dc4` chunk is 222 KiB, 100% unused
2. Render-blocking CSS — 2 CSS files, ~520 ms savings
3. LCP image missing `fetchpriority="high"` — header logo
4. Ahrefs analytics CSP error — blocked on every pageload

**Core Web Vitals Score: 80/100** *(72 × 0.6 + 92 × 0.4)*

---

## 3. Technical SEO (SquirrelScan)

**Audit date:** February 25, 2026 (100 pages, surface mode)
**Overall: 64/100** [= vs Feb 25]

| Category | Feb 26 | Prior | Delta |
|---|---|---|---|
| Accessibility | 93 | 93 | = |
| Performance | 87 | 87 | = |
| Security | 77 | 77 | = |
| E-E-A-T | 63 | 63 | = |
| Links | 90 | 90 | = |
| Social Media | 100 | 100 | = |
| Images | 72 | 72 | = |
| Core SEO | 86 | 86 | = |
| Content | 74 | 74 | = |
| Structured Data | 52 | 52 | = |
| Crawlability | 86 | 86 | = |

**No regressions in any category.**

**Critical issues:**
1. JSON-LD schema validation errors on 100% of pages (Organization.logo)
2. Leaked secrets detection (false positives for public keys)
3. 66/100 pages have meta titles > 60 chars
4. 100/100 pages have zero external outbound links (E-E-A-T gap)

---

## 4. On-Page SEO & Content Quality

**Pages reviewed:** 5 (top GSC impression pages)
**Score: 35/100** [+4 vs Feb 25]

**Key findings:**

| Page | Issue | Severity | GSC Context |
|---|---|---|---|
| /de/tools/transparent-background-maker | Title/H1 doesn't contain "png transparent machen" | Critical | 86 imp, pos 95.6, 0 clicks |
| /de/tools/transparent-background-maker | English H2s on German page | High | Same page |
| /fr/ | 0 clicks at position 27.4 | High | 8 imp, closest to page 1 |
| All pages | Zero external outbound links | High | Sitewide E-E-A-T gap |
| Schema | AggregateRating hardcoded 4.8/5 | High | Schema spam risk |

**E-E-A-T Assessment:**
No named authors — all content attributes to "MyImageUpscaler Team." No author bio pages, no individual credentials, no external citations despite technical claims. The AggregateRating schema appears fabricated.

---

## 5. Blog Content Health

**Score: 62/100** [= vs Feb 25]

| Metric | Value |
|---|---|---|
| Total posts | 38 |
| Thin content stubs | 1 (`/blog/how-to-upscale-images-for-ecommerce`, ~250 words) |
| Cannibalization pairs | 3 |
| GSC query coverage | 8/13 top queries have dedicated content |

**Issue:** Blog posts never link to pSEO cluster pages. Blog equity is wasted on nav/footer links only.

---

## 6. Structured Data & Schema Markup

**Score: 48/100** [= vs Feb 25]
**Schema types implemented: 18**

**Bug #1 — Organization.logo (EASY FIX):**
- `app/[locale]/layout.tsx` lines 116-119
- `app/[locale]/blog/[slug]/page.tsx` lines 199-204
- Fix: Change ImageObject to string URL. ~30 minutes.

**Bug #2 — Duplicate Organization entities:**
- Every locale page renders two conflicting Organization nodes
- Fix: Add `@id` to layout-level Organization blocks

**Bug #3 — AggregateRating hardcoded:**
- 4.8/5 from 1,250 reviews appears on pages that haven't received 1,250 reviews
- Risk: Schema spam / manual penalty

---

## 7. Internal Link Structure

**Score: 51/100** [first measure]

**Key findings:**

| Page | Internal Links In | Issue |
|---|---|---|
| /de/tools/transparent-background-maker | 0-1 | **Top GSC page is orphaned** |
| /compare/midjourney-vs-stable-diffusion | 1-2 | Second-best GSC page |
| /fr/ | 3 | Linked from locale switcher |
| / | 20+ | Homepage |
| /tools/ai-image-upscaler | 8-10 | Linked from blog posts |

**Critical gap:** Homepage "Popular Tools" links to English `/tools/transparent-background-maker` but NOT the German version which is the top performer (86 impressions).

**Orphan page candidates:** 1,100+ localized variants have minimal link equity because `related-pages.ts` only generates same-locale links.

---

## 8. Backlink Profile

**Score: 25/100** [= vs Feb 25]

| Metric | Current | Prior (Jan 30) |
|---|---|---|
| Domain Rating | 18 | 0 |
| Referring Domains | 75 | 8 |
| Growth | +9.4x in 26 days | — |

**Remarkable growth** but still far below competitors (4,500+ referring domains, 60x gap).

**Zero AI citations** still (Perplexity, ChatGPT, Gemini).

---

## 9. AI Search Readiness (AEO/GEO)

**Score: 78/100** [first measure]

| Category | Score |
|---|---|
| AI Bot Access | 20/20 |
| llms.txt Implementation | 18/20 |
| Content Citability | 77% |
| E-E-A-T Signals | 66% |

**AI Bot Status:**
- GPTBot: ALLOWED
- ClaudeBot: ALLOWED
- PerplexityBot: ALLOWED
- Google-Extended: ALLOWED

**llms.txt:** Both `/llms.txt` and `/llms-full.txt` exist and are well-structured.

**E-E-A-T gaps for AI:**
- No named authors (generic "Team" attribution)
- Limited external citations
- No verified testimonials

---

## 10. Prioritized Action Plan

### Critical - This Week

1. **Fix German page title** — Add "PNG transparent machen" to metaTitle/H1. Translate English H2s. *(Impact: CTR on #1 impression page)*

2. **Add locale-aware Popular Tools** — Link to `/de/tools/transparent-background-maker` from `/de/` homepage. *(Impact: Link equity to top GSC page)*

3. **Fix Organization.logo bug** — 2 files, 2-line change. *(Impact: Rich results sitewide)*

### High Impact - This Month

4. **Add `priority` to LCP logo** — Reduces LCP by 300-700ms.

5. **Eliminate 222 KiB unused JS chunk** — Run bundle analyzer, code-split or lazy-load.

6. **Noindex or expand thin blog stub** — Remove content quality signal risk.

7. **Add external citations** — Link to authoritative sources for technical claims (E-E-A-T).

### Medium - This Quarter

8. **Configure `relatedBlogPosts` for all pSEO pages** — Bidirectional blog linking.

9. **Add verified testimonials** — Trust signals for E-E-A-T.

10. **Sustain backlink momentum** — Push for first DR 30+ editorial placements.

---

## Methodology

- **Data collection:** GSC API (existing report), Lighthouse (local), SquirrelScan CLI
- **Analysis:** Expert review, internal linking analysis, AI search checks, backlink assessment
- **Scoring:** Weighted average across 9 dimensions (weights reflect impact on organic growth)
- **GSC grounding:** All recommendations cite specific keywords, pages, and metrics from Google Search Console

---

*Report generated by SEO Manager Orchestrator on 2026-02-26*
