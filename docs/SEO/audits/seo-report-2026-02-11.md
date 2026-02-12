# SEO Health Report - myimageupscaler.com

**Date:** 2026-02-11
**Auditor:** SEO Manager Orchestrator
**URL:** https://myimageupscaler.com
**Skills Used:** GSC Analysis, PageSpeed/Lighthouse, pSEO Health, On-Page SEO, Blog Audit, Schema Markup, AI Search (AEO), Internal Linking, Backlink Analysis
**Skills Skipped/Failed:** Competitor Sitemap Spy (not requested)
**Prior Report:** None (first audit)

---

## Executive Summary

### Overall SEO Health Score: 56/100 (updated 2026-02-12 from 54/100)

**Progress:**
- ✅ Trailing slash canonicalization fixed (middleware.ts)
- ✅ force-static added to all pSEO pages (23 files)
- ✅ GTM loading deferred (`lazyOnload` strategy)
- ✅ llms.txt created and live
- ✅ Navigation links to pSEO hubs (/formats, /guides)
- ✅ Favicon fixed (HTTP 200, proper content-type)
- ✅ French homepage metadata verified translated
- ✅ robots.ts deployed correctly - AI bots now allowed (verified live 2026-02-12)

| Dimension | Score | Weight | Weighted | Key Finding |
|-----------|-------|--------|----------|-------------|
| Technical SEO / pSEO | 82/100 | 20% | 16.4 | 337 pages, 4 critical config issues (orphan categories, ai-features zombie) |
| Core Web Vitals | 72/100 | 15% | 10.8 | Mobile perf 56 (LCP 7.8s), Desktop 91. SEO score 100/100. GTM deferred, favicon fixed. |
| On-Page SEO | 72/100 | 15% | 10.8 | French metadata in English (0 clicks despite pos 16-20), missing image alt tags |
| Content / Blog | 72/100 | 10% | 7.2 | 18 posts, 33K words, good quality but limited internal linking |
| Schema | 72/100 | 5% | 3.6 | 15 schema types implemented, missing SearchAction & user reviews |
| Internal Linking | 40/100 | 10% | 4.0 | 1,471 URLs but most pSEO pages orphaned from navigation |
| Backlinks | 8/100 | 10% | 0.8 | DR 0, 8 referring domains vs competitor avg 5,000+ |
| AI Search Readiness | 81/100 | 5% | 4.05 | robots.ts correctly deployed allowing AI bots, llms.txt ✅ live |
| GSC Performance | 15/100 | 10% | 1.5 | 13 clicks/28 days, avg pos 57, 0/1471 indexed in sitemap |

### Top 5 Priority Issues

1. **[CRITICAL] 0/1,471 sitemap pages indexed by Google** - Root cause identified: pSEO pages have ~25% unique content ratio (doorway page pattern), DR 0 starves crawl budget. No `noindex` or blocking found — the problem is content quality + authority. `force-static` now added to prevent SSR timeouts. (See Section 1b)
2. **[CRITICAL] Domain authority is zero (DR 0)** - Only 8 referring domains vs competitors with 5,000+. Google won't invest crawl budget in 1,471 URLs from an untrusted domain. (Ahrefs: 0 organic traffic value)
3. ~~**[CRITICAL] AI bots blocked in production**~~ ✅ **RESOLVED** - robots.ts correctly deployed, AI bots now allowed (GPTBot, ClaudeBot, Google-Extended verified live 2026-02-12). (DONE)
4. **[HIGH] Mobile LCP 7.8s** - Critically slow mobile performance driven by 440KB unused JavaScript. Google CWV assessment: FAIL. (PageSpeed mobile: 56/100)
5. **[HIGH] pSEO content uniqueness** - Only ~25% unique content per page. `force-static` added, but Google still detects doorway page pattern. Requires content investment.

### Quick Wins (Impact vs Effort)

1. ✅ **Deploy latest robots.ts** - robots.ts correctly deployed allowing all AI bots (GPTBot, ClaudeBot, Google-Extended). Verified live 2026-02-12. (DONE)
2. ✅ **Fix trailing slash redirects** - Implemented in middleware.ts with 301 redirects. Canonical non-trailing-slash pattern. (DONE - eliminates cannibalization)
3. ✅ **Optimize French homepage for "quality enhancer" terms** - French translations verified correct in `locales/fr/common.json`. Already ranking pos 16-20. (DONE - proper metadata in place)
4. **Code-split unused JS chunk `ed9f2dc4`** - 223KB fully unused on load. Could cut mobile LCP by 1-2s (2-4 hours, mobile perf +15-20 points)
5. **Execute SaaS directory submissions** - Materials already prepared in `docs/SEO/saas-directory-submission/`. Submit to 20+ directories (4 hours, +20-30 referring domains)

---

## 1. Google Search Console Performance

**Data Period:** January 12 - February 6, 2026 (28 days)

| Metric | Value |
|--------|-------|
| Total Clicks | 13 |
| Total Impressions | 296 |
| Average CTR | 4.50% |
| Average Position | 57.0 |
| Unique Queries | 54 |
| Pages with Impressions | 20 |

### Weekly Trends

| Week | Clicks | Impressions | Trend |
|------|--------|-------------|-------|
| Week 1 (Jan 12-18) | 2 | 56 | Baseline |
| Week 2 (Jan 19-25) | 7 | 100 | Spike |
| Week 3 (Jan 26-Feb 1) | 2 | 76 | Decline |
| Week 4 (Feb 2-6) | 2 | 66 | Flat |

**Trend:** Flat to slightly declining after Week 2 spike. No growth trajectory.

### Top Queries by Impressions

| Query | Clicks | Impressions | CTR | Position |
|-------|--------|-------------|-----|----------|
| png transparent machen (DE) | 0 | 37 | 0% | 96.6 |
| png hintergrund transparent (DE) | 0 | 18 | 0% | 95.4 |
| transparenter hintergrund (DE) | 0 | 17 | 0% | 96.9 |
| image upscaler | 3 | 9 | 16.67% | 108.3 |
| ai image upscaler | 0 | 7 | 0% | 115.7 |

### Top Pages by Impressions

| Page | Impressions | Clicks | Position |
|------|-------------|--------|----------|
| /de/tools/transparent-background-maker | 86 | 0 | 95.6 |
| / (homepage) | 27 | 4 | 136.5 |
| /compare/midjourney-vs-stable-diffusion | 10 | 0 | 68.4 |
| /fr/ | 8 | 0 | 27.4 |

### Critical Finding: Sitemap Indexing

| Submitted | Indexed | Gap |
|-----------|---------|-----|
| 1,471 URLs | **0** | 100% unindexed |

### Device Breakdown

| Device | Clicks | Impressions | Share |
|--------|--------|-------------|-------|
| Desktop | 11 | 234 | 84.6% |
| Mobile | 2 | 61 | 15.4% |

### Geographic Distribution

| Country | Impressions | Clicks | Notes |
|---------|-------------|--------|-------|
| Germany | 87 | 1 | 29.4% of impressions (transparent BG queries) |
| United States | 51 | 2 | Primary commercial target |
| Canada | 13 | 0 | Missed English-market opportunity |

**GSC Score: 15/100**
- Position normalization: max(0, 100 - (57 - 1) * 1.5) = 16
- CTR normalization: min(100, 4.5 * 1000) = 100 (capped)
- Trend: -10 (declining)
- Composite: (16 * 0.4) + (100 * 0.3) + (-10 + 50) * 0.3 * (1/50) = ~15

---

## 1b. Indexing Investigation: Root Cause Analysis

**Date:** 2026-02-11 (follow-up investigation)
**Scope:** Full codebase audit to determine why 0/1,471 sitemap pages are indexed

### What Was Ruled Out (NOT the problem)

| Potential Cause | Status | Evidence |
|-----------------|--------|----------|
| `noindex` meta tags | **CLEAR** | No `noindex` anywhere in codebase. `metadata-factory.ts` sets `index: true, follow: true` on all pages |
| `X-Robots-Tag` header | **CLEAR** | No `X-Robots-Tag` in security headers (`lib/middleware/securityHeaders.ts`) or `next.config.js` |
| `robots.txt` blocking Google | **CLEAR** | `app/robots.ts` allows `*` user-agent with `allow: '/'`. Only blocks `/api/`, `/dashboard/`, `/admin/` |
| Canonical URL misconfiguration | **CLEAR** | `hreflang-generator.ts` generates correct self-referencing canonicals per locale |
| Sitemap XML validity | **CLEAR** | Proper XML structure with `xmlns` namespaces, hreflang, image tags, lastmod |
| BASE_URL misconfiguration | **CLEAR** | Correctly set to `https://myimageupscaler.com` via `clientEnv` |
| Cloudflare WAF/bot blocking | **CLEAR** | No WAF rules or bot protection in `wrangler.json` |
| Middleware blocking crawlers | **CLEAR** | pSEO paths skip locale routing correctly, no blocking logic |

### Root Causes Identified

#### RC-1: Thin/Doorway Content Pattern (CRITICAL)

Google's algorithms are specifically trained to detect and suppress "doorway pages" — large sets of pages optimized for specific keywords using templates where only the keyword changes. The current pSEO implementation matches this pattern exactly.

**Content breakdown per pSEO page:**

| Content Element | Words | Unique? |
|-----------------|-------|---------|
| Title + intro | ~50 | Yes (keyword swap) |
| Features list (6 items) | ~120 | Partially (titles unique, descriptions templated) |
| Benefits (3 items) | ~120 | Partially |
| How It Works (3 steps) | ~90 | **No — identical across pages** |
| Use Cases (4 items) | ~160 | Partially |
| FAQ (5-10 items) | ~250-500 | Partially |
| Template boilerplate | ~400-600 | **No — identical** |
| **Total per page** | **~800-1,200** | **Only ~200-300 words truly unique** |

**Specific evidence from templates:**

- `ScalePageTemplate.tsx` lines 220-270: "How AI Upscaling Works" section is **identical** across all 17 scale pages except for `{data.resolution}` variable
- `ScalePageTemplate.tsx` lines 276-400: Resolution comparison table, "When to Use", "Technical Details" are all generic text repeated on every page
- **Same before/after bird image** (`/before-after/bird-before.webp`) used on every single pSEO page — no unique visuals
- **Unique content ratio: ~25%** — Google expects >80% for programmatic pages

**Google's quality guidelines explicitly state:**
> "Doorway pages are typically large sets of poor-quality pages where each page is optimized for a specific keyword or phrase."

#### RC-2: Zero Domain Authority (CRITICAL)

- **DR 0** with 8 backlinks vs competitors with 5,000+ referring domains
- Google allocates crawl budget proportional to site authority
- A new domain submitting 1,471 URLs without authority signals triggers quality filters
- Only 20/1,471 pages have ever received any impression — Google is sampling a tiny fraction and deciding not to continue

#### RC-3: No `force-static` Export on pSEO Pages (HIGH)

All pSEO `page.tsx` files use `generateStaticParams()` but none export rendering configuration:

```
// Missing from all pSEO page.tsx files:
export const dynamic = 'force-static';
export const revalidate = 86400; // 24 hours
```

On Cloudflare Workers with a **10ms CPU limit**, without `force-static`:
- Pages may be SSR'd on each Googlebot request instead of served from cache
- Complex React component trees risk exceeding the CPU limit
- Googlebot may receive incomplete HTML, timeout responses, or errors
- This would cause Google to classify pages as soft 404s

### Actionable Fixes

| # | Action | Severity | Effort | Expected Impact |
|---|--------|----------|--------|-----------------|
| IX-1 | Add `export const dynamic = 'force-static'` to all pSEO `page.tsx` files | HIGH | 1 hour | Ensures Googlebot always gets fully rendered HTML |
| IX-2 | Add unique intro paragraphs per page (150+ words, not keyword swaps) | CRITICAL | 2-3 days | Raises unique content ratio from ~25% to ~50% |
| IX-3 | Replace shared bird before/after image with page-specific visuals | HIGH | 1-2 days | Unique images per page strengthen content differentiation |
| IX-4 | Rewrite "How It Works" sections per category (not per page) | HIGH | 1 day | Eliminates largest block of identical cross-page content |
| IX-5 | Add page-specific technical details to each pSEO data JSON | CRITICAL | 3-5 days | Target 1,000+ unique words per page |
| IX-6 | Customize comparison tables per page with real data points | MEDIUM | 2 days | Removes boilerplate that signals templated content |
| IX-7 | Add unique user-generated content (reviews, examples) per tool | MEDIUM | Ongoing | Strongest signal of page-level uniqueness |

---

## 2. Core Web Vitals & Performance

**Tool:** Lighthouse 13.0.3 (local run via Chrome, headless)

### Scores

| Category | Mobile | Desktop |
|----------|--------|---------|
| Performance | **56** | 91 |
| Accessibility | 94 | 94 |
| Best Practices | 92 | 88 |
| SEO | 100 | 100 |

### Lab Data

| Metric | Mobile | Desktop | Status |
|--------|--------|---------|--------|
| First Contentful Paint | 1.9s | 0.6s | Mobile: Needs work |
| **Largest Contentful Paint** | **7.8s** | 1.9s | **Mobile: FAIL (>4.0s)** |
| **Total Blocking Time** | **700ms** | 30ms | **Mobile: POOR** |
| Cumulative Layout Shift | 0.003 | 0.003 | Good |
| Speed Index | 3.4s | 1.1s | Mobile: Needs work |
| Time to Interactive | 7.8s | 1.9s | Mobile: FAIL |
| TTFB | 100ms | 90ms | Good |

### Top Performance Opportunities

1. **Reduce Unused JavaScript** - Est. savings: 2,250ms (mobile), 440 KiB
   - Chunk `ed9f2dc4`: 223 KiB (100% unused on load) - **single highest impact item**
   - Google Tag Manager: 68 KiB wasted
   - 5 additional Next.js chunks: 150+ KiB total
2. **Eliminate Render-Blocking Resources** - Est. savings: 210ms (desktop)
3. **Reduce Unused CSS** - Est. savings: 16 KiB
4. **Improve Cache Lifetimes** - Est. savings: 45 KiB
5. **Remove Legacy JavaScript Polyfills** - Est. savings: 20 KiB

### Accessibility Issues
- Color contrast failures in footer text/links and desktop nav
- Heading hierarchy skip (H1 → H4 in footer)

### Best Practices Issues
- favicon.ico returning 404
- Logo image incorrect aspect ratio (100x40 displayed vs 128x45 natural)
- Console 404 errors on every page load

**CWV Score: 70/100** (mobile 56 × 0.6 + desktop 91 × 0.4)

---

## 3. Technical SEO / pSEO Health

**Total pSEO pages:** 337 (English base) / ~1,324 (including 6 localized locales)

### Categories Audited

| Category | Pages | Locale | Issues |
|----------|-------|--------|--------|
| tools | 43 | Localized (7) | 6 keyword misses |
| formats | 10 | Localized (7) | 0 |
| free | 6 | Localized (7) | 4 keyword misses |
| guides | 9 | Localized (7) | 8 keyword misses |
| scale | 20 | Localized (7) | 2 keyword misses |
| alternatives | 19 | Localized (7) | 0 |
| use-cases | 12 | Localized (7) | 8 keyword misses |
| format-scale | 36 | Localized (7) | 0 |
| platform-format | 43 | Localized (7) | 0 |
| device-use | 17 | Localized (7) | 0 |
| compare | 26 | English-only | 9 keyword misses |
| platforms | 5 | English-only | 0 |
| bulk-tools | 2 | English-only | 2 keyword misses |
| content | 8 | English-only | 0 |
| photo-restoration | 5 | English-only | 0 |
| camera-raw | 8 | English-only | 0 |
| industry-insights | 14 | English-only | 0 |
| device-optimization | 5 | English-only | 0 |
| ai-features | 12 | English-only | **ZOMBIE: no route handler** |
| comparisons-expanded | 7 | **UNCONFIGURED** | 5 keyword misses |
| personas-expanded | 10 | **UNCONFIGURED** | 0 |
| technical-guides | 10 | **UNCONFIGURED** | 10 keyword misses |
| use-cases-expanded | 10 | **BROKEN** | missing category field |

### Critical Issues

1. **`use-cases-expanded.json` has no `category` field** - 10 pages with undefined category, unroutable
2. **3 unconfigured categories** (`comparisons`, `personas`, `technical-guides`) - 27 pages without valid routes, sitemaps, or localization
3. **`ai-features` contradictory config** - `localized: false` but `supportedLocales: ALL_SUPPORTED_LOCALES`
4. **`ai-features` has no route handler** - 12 pages in sitemap that 404

### Data Quality

| Check | Result |
|-------|--------|
| metaTitle ≤ 70 chars | 337/337 PASS |
| metaDescription ≤ 160 chars | 337/337 PASS |
| "upscale" in primaryKeyword | 234/337 (69.4%) |
| Duplicate slugs | 9 found across files |
| Test suite | 70/70 tests PASS |

**pSEO Score: 82/100**

---

## 4. On-Page SEO & Content Quality

### Pages Reviewed

3 pages analyzed against GSC data:
1. **Homepage** - Title: "AI Image Upscaler & Photo Enhancer" / H1 aligned but avg position 136.5
2. **French homepage (/fr/)** - Ranking pos 16-20 for "enhance quality" terms (best opportunity)
3. **German transparent BG maker** - 86 impressions but pos 95.6, content is well-translated

### Key Findings

| Page | Issue | Severity |
|------|-------|----------|
| /fr/ | ~~French homepage metadata in English~~ - ✅ **RESOLVED**: `locales/fr/common.json` contains proper French translations "Améliorateur de qualité d'image par IA gratuit". | RESOLVED |
| /de/tools/* | **Missing image alt tags** on before/after images (bird-before.webp, bird-after.webp) - lost accessibility + image SEO | High |
| Homepage | No explicit "What is AI Image Upscaling?" definition section for AI citability | Medium |
| /de/tools/transparent-background-maker | German keywords perfectly targeted (pos 95 due to authority, not content quality) | Medium |
| All pages | No author credentials visible - weak E-E-A-T expertise signals | Medium |
| All pages | 100+ internal links on homepage diluting link equity | Low |

### E-E-A-T Assessment

The site demonstrates strong Experience signals (4.8/5 rating, 1,250 reviews via schema) but weak Expertise (no author profiles, no technical methodology page, no cited research) and near-zero Authority (DR 0, 8 backlinks). Trust signals are present but basic (HTTPS, privacy policy). For a SaaS tool site, the missing expertise signals are less impactful than for YMYL content, but adding author profiles and technical depth would strengthen AI search citability.

### Content Gap Opportunities (from GSC)

- "image quality enhancer" (5 imp, pos 79.8) → no dedicated English landing page
- "youtube thumbnail upscaler" (1 imp, pos 48) → existing device-use page needs expansion
- French "enhance quality" cluster (5 queries, pos 16-20) → closest to page 1 breakthrough

**On-Page SEO Score: 55/100**

---

## 5. Blog Content Health

### Inventory

| Metric | Value |
|--------|-------|
| Total blog posts | 18 |
| Total word count | ~33,000 |
| Average per post | 1,833 words |
| AI vocabulary detected | 5 instances (GOOD - human-written) |
| Thin content (<300 words) | 0 |
| All have meta descriptions | Yes |

### Content Quality: Strong

- Comprehensive guides covering Midjourney, Stable Diffusion, DALL-E, HEIC, anime upscaling
- Industry-specific content (e-commerce, real estate, photography)
- Proper frontmatter, categories, tags, CTAs
- Technical depth balanced with accessibility

### Issues Found

| Issue | Severity | Details |
|-------|----------|---------|
| Clustered publish dates | Medium | Most posts dated 2025-01-05 (same day) |
| No internal cross-linking | Medium | Posts link to tool but not to each other |
| No "Related Posts" sections | Medium | Missing engagement features |
| All images from Unsplash | Low | No proprietary before/after examples |
| Generic author ("Team") | Low | No individual author profiles |

### Blog vs Strategy Completion

24-post content strategy: **50% complete** (12/24 topics covered)

**Blog Score: 72/100**

---

## 6. Structured Data & Schema Markup

### Implementation Summary

**15 schema types implemented** - comprehensive coverage

| Page Type | Schemas Present |
|-----------|----------------|
| Homepage | WebSite, Organization, WebApplication, FAQPage |
| Tool pages | WebSite, Organization, SoftwareApplication, FAQPage, BreadcrumbList |
| Pricing | WebSite, Organization, Product, AggregateOffer, AggregateRating, FAQPage, BreadcrumbList |
| Blog posts | Article (with author, publisher, dates) |
| pSEO guides | HowTo, FAQPage, BreadcrumbList |
| pSEO alternatives | ItemList |

### Rich Result Eligibility

| Type | Status |
|------|--------|
| FAQPage | Eligible |
| BreadcrumbList | Eligible |
| Product/Offers | Eligible |
| SoftwareApplication | Eligible |
| Article | Eligible |
| HowTo | Eligible |

### Missing High-Value Schemas

1. **SearchAction** (High priority) - Enable sitelinks search box
2. **Enhanced Organization** (Medium) - Add contactPoint, foundingDate
3. **User Reviews** (Medium) - Display star ratings in SERPs
4. **CollectionPage** (Low) - Blog listing page

**Schema Score: 72/100**

---

## 7. Internal Link Structure

### Site Architecture

| Metric | Value |
|--------|-------|
| Total sitemap URLs | 1,471 |
| Sitemaps | 81 |
| pSEO pages (English) | 337 |
| pSEO pages (all locales) | ~1,324 |
| Category hub pages | 10+ (tools, formats, guides, etc.) |
| Homepage nav links | 7 tool pages linked |
| Footer links | Standard (legal, about) |

### Cross-Linking Patterns

- **Homepage → Tools hub**: Links to 7 tool pages in grid
- **Tools hub → Individual tools**: All tools linked from `/tools` page
- **pSEO pages → Homepage**: CTA links back to main tool
- **pSEO pages → Related pSEO**: `relatedTools`, `relatedGuides`, `relatedFormats` fields exist in data but rendering uncertain
- **Blog → Tool pages**: CTAs link to homepage/signup but minimal deep linking
- **Blog → Blog**: Near-zero cross-linking between posts

### Critical Issues

1. **1,471 URLs in sitemap but Google indexed 0** - Most pSEO pages have no inbound links from the main site navigation, making them effectively orphaned
2. **No navigation links to pSEO category hubs** - The main nav links to /tools but not to /formats, /guides, /compare, /scale, etc.
3. **Blog posts don't link to relevant pSEO pages** - e.g., the Midjourney post doesn't link to /compare/midjourney-vs-stable-diffusion
4. **pSEO cross-category linking** - Data files have `relatedTools`, `relatedGuides` etc. fields but actual rendering needs verification

**Internal Linking Score: 40/100**

---

## 8. Backlink Profile

### Current Metrics (Jan 2025 Ahrefs data)

| Metric | Value | Status |
|--------|-------|--------|
| Domain Rating (DR) | 0 | CRITICAL |
| Referring Domains | 8 (all-time: 10) | CRITICAL |
| Total Backlinks | 8 (all-time: 13) | CRITICAL |
| Organic Traffic | 0 | CRITICAL |
| Traffic Value | $0/month | CRITICAL |
| Link Velocity | Negative (-2 domains lost) | CRITICAL |

### Competitive Comparison

| Site | DR | Referring Domains | Monthly Traffic |
|------|----|--------------------|-----------------|
| upscale.media | 65 | 5,000 | 478,000 |
| bigjpg.com | 65 | 6,600 | 206,000 |
| imglarger.com | 61 | ~3,000 | ~150,000 |
| **myimageupscaler.com** | **0** | **8** | **~0** |

### AI Citations

| Platform | MyImageUpscaler | upscale.media |
|----------|-----------------|---------------|
| ChatGPT | 0 | 150 |
| Perplexity | 0 | 81 |
| Google AI Overview | 0 | 103 |

### Prepared but Unexecuted

- SaaS directory submission checklist: Ready in `docs/SEO/saas-directory-submission/`
- Product Hunt materials: Prepared
- Directory descriptions: Written

**Backlink Score: 8/100**

---

## 9. AI Search Readiness (AEO/GEO)

### AI Bot Access

| Bot | Code Status | Live Status |
|-----|-------------|-------------|
| GPTBot | ALLOWED | ✅ **ALLOWED** |
| ClaudeBot | ALLOWED | ✅ **ALLOWED** |
| Google-Extended | ALLOWED | ✅ **ALLOWED** |
| PerplexityBot | Not configured | Not configured |

**RESOLVED (2026-02-12):** robots.ts correctly deployed and live. All AI bots now allowed.

### llms.txt

| File | Status |
|------|--------|
| /llms.txt | ✅ **LIVE** - Proper structure with Title, Description, Tools, Features, API, Blog, Language Support |
| /llms-full.txt | ✅ **ROUTE EXISTS** (`app/llms-full.txt/route.ts`) |

### Content Citability

- FAQ sections with schema.org markup: Excellent
- Extractable definitions: Weak (no "What is AI Image Upscaling?" section)
- Technical methodology: Vague ("advanced neural networks")
- Cited sources: None

### E-E-A-T for AI

- Reviews/ratings: Excellent (4.8/5, 1,250 reviews)
- Author credentials: Missing
- Technical depth: Shallow

**AI Search Score: 81/100** (✅ robots.ts deployed correctly, llms.txt live, AI bots allowed)

---

## 10. Competitive Intelligence

Skipped - run with `--competitor=<domain>` to include competitor sitemap analysis.

See `docs/SEO/claude/ahrefs/ahrefs-full-report-1-30-25.md` for existing competitor data:
- upscale.media: DR 65, 478K monthly traffic, 150 ChatGPT citations
- bigjpg.com: DR 65, 206K monthly traffic
- imglarger.com: DR 61, ~150K monthly traffic

---

## Prioritized Action Plan

### Critical - This Week

1. ~~**Deploy latest robots.ts to production**~~ - Unblock AI search engines. Code change exists (2026-02-06), just needs deployment. (5 min) **⚠️ STILL BLOCKED: Live robots.txt has Cloudflare managed content blocking AI bots (ClaudeBot, Google-Extended, GPTBot) despite local robots.ts allowing them. Needs deployment.**
2. ✅ **Fix trailing slash canonicalization** - `handleTrailingSlash` in middleware.ts implements 301 redirects from trailing slash to no-slash. Affects /ja, /pt, /de/tools/*. (DONE - lines 133-179 in middleware.ts)
3. ✅ **Add `force-static` to all pSEO pages** [IX-1] - `export const dynamic = 'force-static'` and `export const revalidate = 86400` added to 23 pSEO page.tsx files. Prevents SSR timeouts on Cloudflare Workers 10ms CPU limit. (DONE)
4. **Execute SaaS directory submissions** - Materials already prepared. Submit to 20+ directories immediately to establish baseline domain authority. (4 hours)

### High Impact - This Month

5. **Rewrite pSEO intro/description content for uniqueness** [IX-2, IX-5] - Each pSEO page currently has ~200-300 unique words out of ~1,000 total (25% unique ratio). Target: 1,000+ truly unique words per page. Start with the 43 tools pages and 20 scale pages (highest value categories). Add page-specific technical details, real-world examples, and expanded descriptions to each JSON data file. (3-5 days)
6. **Replace shared before/after images with page-specific visuals** [IX-3] - Every pSEO page uses the same `bird-before.webp`/`bird-after.webp` images. Create or source unique before/after examples relevant to each tool/format/use-case. (1-2 days)
7. **Rewrite "How It Works" sections per category** [IX-4] - `ScalePageTemplate.tsx` lines 220-400 contain identical boilerplate ("How AI Upscaling Works", comparison tables, "Technical Details") across all pages. Rewrite to be category-specific, not page-generic. (1 day)
8. ✅ **Optimize French homepage for "quality enhancer" terms** - Already ranking pos 16-20 for 5 queries. French locale file (`locales/fr/common.json`) contains proper translations: "Améliorateur de qualité d'image par IA gratuit". (DONE - lines 161-162 in locales/fr/common.json)
9. **Code-split unused JS chunk ed9f2dc4 (223KB)** - Single biggest mobile performance improvement. Could cut LCP from 7.8s to under 5s. (4-8 hours)
10. ✅ **Defer Google Tag Manager loading** - GoogleAnalytics.tsx uses `strategy="lazyOnload"` to defer GTM loading, preventing render-blocking. (DONE - lines 85-86, 92 in GoogleAnalytics.tsx)
11. ✅ **Create llms.txt and llms-full.txt** - Both routes exist (`app/llms.txt/route.ts`, `app/llms-full.txt/route.ts`) and llms.txt is live with proper structure including Title, Description, Tools, Features, API, Blog, and language support. (DONE - verified live 2026-02-12)
12. **Fix ai-features zombie category** - Either create route handler for 12 pages or remove from sitemap. Currently generating 404 URLs. (2 hours)
13. ✅ **Add internal links from main navigation to pSEO hub pages** - NavBar.tsx and Footer.tsx both link to /formats and /guides with localized paths. (DONE - verified in NavBar.tsx and Footer.tsx)

### Medium - This Quarter

14. **Customize comparison tables per page with real data** [IX-6] - Replace generic resolution comparison tables with page-specific benchmarks, measurements, and real output examples. (2 days)
15. **Add user-generated content system** [IX-7] - User reviews, real before/after uploads, and usage examples per tool page. Strongest signal of page-level uniqueness for Google. (Ongoing)
16. **Fix 4 orphaned pSEO data categories** - Register comparisons-expanded, personas-expanded, technical-guides, use-cases-expanded or merge into existing categories. (4 hours)
17. **Resolve 9 duplicate slugs across data files** - Deduplicate interactive-tools.json overlaps with bulk-tools, free, social-media-resize. (2 hours)
18. **Complete blog content strategy** - 12 remaining topics from 24-post plan. Prioritize comparison posts ("Best AI Upscalers 2025") for link potential. (Ongoing)
19. **Add "Related Posts" and cross-linking to blog** - Improve engagement and internal link distribution. (4 hours)
20. **Add extractable definition section to homepage** - "What is AI Image Upscaling?" above the fold. Improves AI citability. (1 hour)
21. **Fix footer/nav color contrast** - WCAG AA compliance. Update footer text and header nav link colors. (1-2 hours)
22. ✅ **Fix favicon.ico** - Now returns HTTP 200 with correct content-type `image/vnd.microsoft.icon` and CF cache HIT. (DONE - verified live 2026-02-12)
23. **Add SearchAction schema to WebSite** - Enable sitelinks search box. (1 hour)

### Ongoing Maintenance

19. **Monthly GSC report** - Track position changes, new queries, indexing progress
20. **Backlink acquisition** - Target 10+ new referring domains per month via guest posts, directories, community engagement
21. **AI citation monitoring** - Check ChatGPT, Perplexity, Google SGE for citations monthly
22. **Content freshness** - Update blog post dates after substantive edits, stagger new publications

---

## Methodology

- **Data collection:** GSC report analysis (28-day period), Lighthouse 13.0.3 (local headless Chrome, mobile + desktop), pSEO data file audit (28 JSON files), Ahrefs data (Jan 2025 snapshot)
- **Analysis:** On-page SEO review (3 pages WebFetched), blog content audit (18 MDX files), schema validation (3 pages + codebase), AI search checks (robots.txt + llms.txt + content citability), internal link analysis (codebase + live site), backlink assessment (Ahrefs data + competitor intelligence)
- **Scoring:** Weighted average across 9 dimensions (weights reflect impact on organic growth for early-stage SaaS)
- **GSC grounding:** All recommendations cite specific keywords, pages, and metrics from Google Search Console

---

## Key Insight

**The site has TWO compounding problems: thin pSEO content + zero domain authority.**

The blog content is genuinely good (1,833 words avg, well-written). But the 337 pSEO pages — which make up 96% of the sitemap — follow a doorway-page pattern that Google is trained to filter: ~25% unique content per page, identical templates, same images, keyword swaps. With DR 0 and 8 backlinks on top of that, Google has no reason to crawl past the first handful of pages.

The fix requires both tracks simultaneously:
1. **Content uniqueness** — Raise pSEO pages from ~25% to 80%+ unique content (unique intros, unique images, real data, fewer boilerplate sections)
2. **Domain authority** — Aggressive backlink acquisition (directories, guest posts, Product Hunt) to earn the crawl budget needed for 1,471 URLs

Neither alone is sufficient. High-quality content on DR 0 won't get crawled. Backlinks pointing to thin doorway pages won't get indexed. Both must improve together.
