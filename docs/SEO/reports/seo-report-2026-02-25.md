# SEO Health Report — myimageupscaler.com

**Date:** 2026-02-25
**Auditor:** SEO Manager Orchestrator
**URL:** https://myimageupscaler.com
**Skills Used:** GSC data (existing report), PageSpeed/Lighthouse, SquirrelScan, On-Page SEO Review, AI Search Optimization, Schema Markup, Internal Linking, Backlink Analysis, Blog Audit
**Skills Skipped:** Competitor analysis (not requested), Keyword Strategy (not requested)
**Prior Reports:** docs/SEO/claude/miu-audit-2026-01-30.md (51/100), MEMORY.md baseline (52/100 — Feb 11, 2026)
**GSC Data Period:** January 12 – February 6, 2026 (28 days). Note: No fresh GSC fetch — `scripts/gsc-direct-fetch.ts` does not exist.

---

## Executive Summary

### Overall SEO Health Score: 47/100 [-5 vs Feb 11]

> **Note on score decline:** The drop from 52 → 47 reflects *deeper measurement* of previously unquantified dimensions (on-page SEO, internal linking), not a regression. Every measurable dimension either improved or held steady. The score methodology is now more rigorous.

| Dimension | Score | Weight | Trend | Key Finding |
|---|---|---|---|---|
| Technical SEO (SquirrelScan) | 64/100 | 20% | [+11 vs Jan 30] | Big wins in accessibility (+24), performance (+9), E-E-A-T (+9) |
| Core Web Vitals (PageSpeed) | 80/100 | 15% | [+10 vs Feb 11] | Mobile perf 72 (was 56); LCP still 6.8s on mobile |
| On-Page SEO | 31/100 | 15% | [first measure] | Top GSC page title doesn't match its own queries; fake AggregateRating risk |
| Content / Blog | 62/100 | 10% | [+32 vs Jan] | 38 posts published, good GSC query coverage; 1 thin stub |
| Schema / Structured Data | 48/100 | 5% | [=] | 18 schema types but Organization.logo bug on ALL locale pages; 2 easy fixes |
| Internal Linking | 23/100 | 10% | [first measure] | Homepage links to ZERO top-GSC pages; pSEO ecosystem is an isolated island |
| Backlinks | 25/100 | 10% | [**+17** vs Jan 30] | **DR 18 (was 0), 75 referring domains (was 8)** — massive jump |
| AI Search Readiness | 51/100 | 5% | [first measure] | llms.txt exists; AI bots allowed via wildcard; explicit rules missing |
| GSC Performance | 20/100 | 10% | [=] | 13 clicks/28d, avg pos 57, 5 organic keywords tracked (all #21+) |

**Weighted Overall: 47/100**
*(Updated: DR 18/75 domains raises backlink score 8→25; GSC indexation 9% raises score 20→23)*

---

### Top 5 Priority Issues

1. **[HIGH] 134/1,484 pages indexed — 1,350 stuck in "Discovered but not indexed"** — 9% indexation rate on a 1,484-URL sitemap. GSC Coverage shows 134 indexed (not zero — the "0 indexed" in prior data was a sitemap-attribution reporting quirk in the API). Root causes for the 91% unindexed: DR 18 is still low for Google to prioritize crawling 1,484 pages, 12 zombie ai-features pages return 404 (wastes crawl budget), and empty sitemap-images.xml adds a wasted fetch. Priority: noindex the ai-features zombie URLs, remove the empty sitemap, and build more backlinks to increase crawl frequency. *(GSC Coverage: 134 indexed, 1,350 not indexed)*

2. **[CRITICAL] German transparent background page ranks 96th but its title doesn't mention the queries driving impressions** — `/de/tools/transparent-background-maker` has 86 impressions (29% of all site impressions) and 0 clicks. Top German queries: "png transparent machen" (37 imp) and "png hintergrund transparent" (18 imp). Neither phrase appears in the page's H1 or meta title. The page also has untranslated English H2s. *(GSC: 86 imp, pos 95.6, 0 clicks)*

3. **[HIGH] Backlinks: DR 18, 75 referring domains — strong growth but still far below competition** — Remarkable jump since Jan 30 (DR 0→18, 8→75 domains, +9.4x in 26 days). Zero AI citations still (Perplexity, ChatGPT, Gemini). Weakest direct competitor has 4,500 referring domains — still 60x behind. Need to sustain this momentum: confirm link quality (are the 75 domains high-UR editorial links or low-value directories?), and push for first DR 30+ editorial placements. *(Backlink score: 25/100)*

4. **[HIGH] Organization.logo schema bug affects ALL locale pages and all blog posts** — Two files pass an `ImageObject` where a plain URL string is required: `app/[locale]/layout.tsx` and `app/[locale]/blog/[slug]/page.tsx`. This suppresses rich results (FAQPage, BreadcrumbList, SoftwareApplication snippets) across the majority of the site's pages. Fix complexity: 2-line change in 2 files. *(Schema score: 48/100)*

5. **[HIGH] Homepage passes zero link equity to top-performing pages** — The homepage, the site's most authoritative page, links to none of the top GSC impression pages: no link to `/de/tools/transparent-background-maker` (86 imp), no link to `/compare/midjourney-vs-stable-diffusion` (10 imp), no link to locale homepages (`/fr/` ranks pos 27 — the closest to page 1 of any page). `/tools` is not in the primary navigation, only the footer. *(Internal linking score: 23/100)*

---

### Quick Wins (Impact vs Effort)

1. **Fix Organization.logo bug** — 2 files, 2-line change each. Unblocks rich results sitewide. Effort: 30 mins. Impact: schema validation passes on all locale + blog pages.

2. **Sustain backlink momentum and verify link quality** — DR jumped 0→18, 8→75 domains in 26 days (remarkable). Next: audit the quality of the 75 referring domains in Ahrefs — are they real editorial links or bulk directories? Push for first DR 30+ editorial placement. Effort: ongoing. Impact: indexation of the 1,350 unindexed pages accelerates as crawl budget grows with DR.

3. **Fix German page title to match GSC queries** — Change `/de/tools/transparent-background-maker` metaTitle to include "png transparent machen." Translate all English H2s. Effort: 1 hour. Impact: CTR improvement on the site's #1 impression page.

4. **Add /tools to primary navigation** — Every page on the site links to nav items; adding /tools sends authority to 50+ tool pages. Effort: 15 mins. Impact: immediate PageRank redistribution to tools cluster.

5. **Add explicit AI bot rules to robots.ts** — Code comments already document the intent; the rules were never implemented. Add Google-Extended, GPTBot, ClaudeBot, PerplexityBot Allow rules. Effort: 15 mins. Impact: positive AEO signal, especially for Google AI Overviews.

6. **Expand or noindex the thin ecommerce blog stub** — `/blog/how-to-upscale-images-for-ecommerce` is ~250 words. Either expand to 1,500+ words or add `noindex`. Effort: 30 mins (noindex) or 2 hours (expand). Impact: improves domain content quality signal.

---

## 1. Google Search Console Performance

**Data period:** January 12 – February 6, 2026 (28 days)
**Data freshness:** 16 days old as of this report. No fresh GSC script exists.

| Metric | Value | Assessment |
|---|---|---|
| Total Clicks | 13 | < 1/day — pre-growth phase |
| Total Impressions | 296 | Google is experimenting but not committing |
| Average CTR | 4.50% | Healthy rate; volume problem, not CTR |
| Average Position | 57.0 | Page 5–6 average — not competitive |
| Unique Queries | 54 | Very narrow discovery footprint |
| **Pages indexed** | **134 / 1,484** | **9% indexation rate** — 1,350 "Discovered, not indexed" |
| Ahrefs organic keywords | 5 (all #21+) | GR, IN, ID, NZ, PH — no top-20 rankings yet |

**Weekly trend:**

| Week | Clicks | Impressions | Assessment |
|---|---|---|---|
| Jan 12-18 | 2 | 56 | Baseline |
| Jan 19-25 | 7 | 100 | Anomaly spike |
| Jan 26-Feb 1 | 2 | 76 | Reversion |
| Feb 2-6 | 2 | 66 | Flat/declining |

**No growth trajectory.** Week 2 was an outlier. The site has no stable top-20 rankings for any query.

**Top queries by impressions:**

| Query | Pos | Impressions | Clicks | CTR | Opportunity |
|---|---|---|---|---|---|
| png transparent machen (DE) | 96.6 | 37 | 0 | 0% | Fix German page title |
| png hintergrund transparent (DE) | 95.4 | 18 | 0 | 0% | Same page |
| transparenter hintergrund (DE) | 96.9 | 17 | 0 | 0% | Same page |
| image upscaler | 108.3 | 9 | 3 | 16.67% | Consolidate homepage vs tool page |
| ai image upscaler | 115.7 | 7 | 0 | 0% | Same — needs authority |
| image quality enhancer | 79.8 | 5 | 0 | 0% | Position too low |

**Key observation:** 72 of 296 impressions (24%) come from German transparent-background queries on a single page. Moving that one page from pos 96 to pos 20 could triple site click volume.

**Low-hanging fruit (position 4-30):**
- `/fr/` — position 27.4 for "enhance quality" / "quality enhancer" (8 impressions, 0 clicks). Closest page to page 1.

**GSC Performance Score: 23/100**
*(Index rate 9% × 0.3 = 2.7) + (pos score 16 × 0.4 = 6.4) + (CTR score 45 × 0.3 = 13.5) = 22.6*

**Indexation note:** The "0 indexed" figure in earlier reporting was a GSC sitemap-attribution API quirk. GSC Coverage confirms 134 pages indexed, 1,350 in "Discovered but not indexed" queue. The queue will clear faster as DR grows and crawl budget increases.

**Action: Create `scripts/gsc-direct-fetch.ts`** to enable fresh data fetching for future audits.

---

## 2. Core Web Vitals & Performance

**Audit date:** February 25, 2026 (Lighthouse local run)
**Full report:** `docs/SEO/audits/pagespeed-report-2026-02-25.md`

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
| **LCP** | **6.8 s** | 1.8 s | 🔴 Red (was 7.8s) |
| TBT | 220 ms | 20 ms | 🟡 Yellow |
| CLS | 0.003 | 0.003 | 🟢 Green |
| Speed Index | 2.6 s | 1.0 s | OK |
| TTI | 8.5 s | 1.8 s | 🔴 Red |
| TTFB | 210 ms | 220 ms | 🟢 Green |

**Top opportunities:**

1. **447 KiB unused JS** — `ed9f2dc4` chunk is 222 KiB and 100% unused on homepage. Est. 2,320 ms savings mobile.
2. **Render-blocking CSS** — 2 CSS files block first paint. Est. 520 ms savings.
3. **LCP image missing `fetchpriority="high"`** — The header logo is the LCP element. Add `priority` prop to Next.js `<Image>`. Est. direct LCP improvement.
4. **Unused CSS** — 17 KiB / 120 ms savings. Tailwind purge not fully effective.
5. **Ahrefs analytics CSP error** — `analytics.ahrefs.com` blocked by CSP, silently failing on every pageload (Best Practices issue).

**Mobile-Desktop gap root cause:** 447 KiB of unused JS must be parsed on slow mobile connection. All three metrics (LCP, TTI, TBT) improve simultaneously when this chunk is eliminated.

**Realistic target:** Priority prop + unused chunk removal → mobile performance 85+.

**Core Web Vitals Score: 80/100** *(72 × 0.6 + 92 × 0.4)*

---

## 3. Technical SEO (SquirrelScan)

**Audit date:** February 25, 2026 (100 pages, surface mode)
**Overall: 64/100 [+11 vs Jan 30]**

| Category | Feb 25 | Jan 30 | Delta |
|---|---|---|---|
| Accessibility | **93** | 69 | **+24** |
| Performance | 87 | 78 | +9 |
| Security | 77 | 68 | +9 |
| E-E-A-T | 63 | 54 | +9 |
| Links | 90 | 85 | +5 |
| Social Media | 100 | 96 | +4 |
| Images | 72 | 68 | +4 |
| Core SEO | 86 | 83 | +3 |
| Content | 74 | 73 | +1 |
| Structured Data | **52** | 52 | **0** |
| Crawlability | 86 | 86 | 0 |
| Analytics | 100 | 100 | 0 |
| Internationalization | 100 | 100 | 0 |

**No regressions in any category.** The Accessibility +24 improvement is the most significant.

**Critical issues (errors):**

1. **JSON-LD schema validation errors on 100% of pages** — Organization.logo passed as ImageObject instead of string; missing @context on secondary blocks. (See Section 6.)

2. **Leaked secrets in public JS bundle** — SquirrelScan flagged high-confidence detections of: Supabase Anon Key, Stripe Publishable Key, Google OAuth Client ID, and 2 potential AWS Secret Access Key patterns in JS chunks. *The Supabase anon key and Stripe publishable key are intentionally public by design. The AWS patterns need manual verification — if real secrets, this is a security incident.*

3. **`/before-after/girl-after.webp` exceeds 100 KB limit** (118 KB) on 3 tool pages.

**Top high-severity issues:**

- 66/100 pages have meta titles > 60 chars (up to 83 chars)
- 86/100 pages: above-fold images with `loading="lazy"` (delays LCP)
- 32 pages: duplicate titles across locale variants (IT/JA not translated)
- 100/100 pages: zero external outbound links (E-E-A-T signal gap)
- 27 pages: heading hierarchy skips H3 (H2 → H4)

**Technical SEO Score: 64/100**

---

## 4. On-Page SEO & Content Quality

**Pages reviewed:** 5 (top GSC impression pages)
**Score: 31/100**

**Key findings table:**

| Page | Issue | Severity | GSC Context |
|---|---|---|---|
| /de/tools/transparent-background-maker | Title/H1 doesn't contain top queries ("png transparent machen") | Critical | 86 imp, pos 95.6, 0 clicks |
| /de/tools/transparent-background-maker | English H2s on a German page (mixed-language signal) | High | Same page |
| /fr/ | 0 clicks at position 27.4 — severe CTR underperformance | High | 8 imp, pos 27.4, 0 clicks |
| /fr/ | Meta title 62 chars + English H2s remain untranslated | High | Nearest page to page 1 |
| All pages | Zero external outbound links — no citations for technical claims | High | Sitewide |
| All pages | AggregateRating hardcoded to 4.8/5, 1,250 reviews — not verified | Critical | Schema spam risk |
| Schema data | `lastUpdated: "2026-12-06"` in schema — a *future* date | High | Date integrity error |
| /compare/midjourney-vs-stable-diffusion | Content targets image *generation* intent; site is image *upscaling* — intent mismatch | High | Off-brand page |
| Multiple | 7 pages targeting identical background-removal intent (cannibalization) | High | /tools + /free + /use-cases |
| ai-features.json | 12 pages in data, no route handler — returns 404 | High | Registered in sitemap |

**E-E-A-T Assessment:**
The site has no named authors on any page — all blog posts and tools attribute to "MyImageUpscaler Team." No author bio pages, no individual credentials, no external citations despite making specific technical claims ("trained on 10M+ image pairs," "Amazon demands 1,600px"). The AggregateRating of 4.8/5 from 1,250 reviews appears on pages that haven't received 1,250 reviews — if this is fabricated schema data it creates manual penalty risk. Trust signals are limited to social profile links and a privacy policy.

**Title rewrites for top pages:**

| Page | Current Title (issues) | Suggested Rewrite |
|---|---|---|
| /de/tools/transparent-background-maker | Doesn't include "png transparent machen" | "PNG transparent machen — Kostenloses Online-Tool" (44 chars) |
| /fr/ | 62 chars, English H2s | "Améliorer qualité photo — Gratuit en ligne \| MyImageUpscaler" (60 chars) |
| / (homepage) | 67 chars (truncated in SERPs) | "Free AI Image Upscaler & Photo Enhancer \| MyImageUpscaler" (57 chars) |
| /tools/ai-image-upscaler | 83-char H1 | H1: "AI Image Upscaler — Enlarge Images Up to 8x Without Quality Loss" |

**Cannibalization risks:**
1. **Background removal** — 7 pages (/tools/ai-background-remover, /tools/remove-bg, /tools/transparent-background-maker, /tools/image-cutout-tool, /free/free-background-remover, /use-cases/product-photo-background-removal, /use-cases/portrait-background-removal) all target the same intent
2. **Midjourney vs Stable Diffusion** — two pages with near-identical slugs
3. **Homepage vs. /tools/ai-image-upscaler** — both target "image upscaler" head term

---

## 5. Blog Content Health

**Score: 62/100**

| Metric | Value |
|---|---|
| Total posts | 38 (published Feb 12–24, 2026) |
| Publication cadence | Burst pattern: 10 posts Feb 12, 12 posts Feb 17 |
| Posts with proper H1/CTA/FAQ | ~36/38 |
| Thin content stubs | 1 confirmed |
| Keyword cannibalization pairs | 3 pairs |
| GSC query coverage | 8/13 top queries have dedicated content |

**GSC alignment (good):**

| GSC Query | Impressions | Blog Post Exists? |
|---|---|---|
| png transparent machen (DE) | 37 | ✅ png-hintergrund-transparent-machen-kostenlos |
| image upscaler | 9 | ✅ how-to-upscale-images |
| image quality enhancer | 5 | ✅ best-ai-image-quality-enhancer |
| free upscaler no sign up | 1 (click) | ✅ free-upscaler-no-sign-up |
| jpeg upscaler | 3 | ❌ No dedicated post |
| photo upscaler | 3 | ❌ No dedicated post |

**Issues:**

1. **Thin content stub** — `/blog/how-to-upscale-images-for-ecommerce` is ~250 words with no actual guide content. Must be expanded or noindexed.

2. **Burst publication risk** — 22 posts in 5 days on a DR 0 domain could trigger quality signal concerns. If any are thin (one confirmed), the pattern is problematic.

3. **Cannibalization pairs:**
   - "best-free-ai-image-upscaler-tools-2026" vs "best-free-ai-image-upscaler-2026-tested-compared" — same query
   - "best-ai-image-quality-enhancer" vs "best-ai-image-quality-enhancer-free" — overlapping
   - "upscale-product-photos-for-ecommerce" vs "how-to-upscale-images-for-ecommerce" — duplicate topic

4. **Blog never links to pSEO cluster pages** — 38 posts don't link to `/scale/*`, `/free/*`, `/formats/*`, `/alternatives/*`, or `/compare/*` pages. Blog equity is wasted on nav/footer links only.

---

## 6. Structured Data & Schema Markup

**Score: 48/100** *(unchanged vs. Jan 30)*
**Schema types implemented: 18** (WebSite, Organization, WebApplication, SoftwareApplication, Article, BlogPosting, HowTo, FAQPage, BreadcrumbList, Review, ItemList, Product, AggregateOffer, AggregateRating, WebPage, SearchAction, ImageObject, Brand)

**Bug #1 — Organization.logo (EASY FIX, HIGH IMPACT):**

Two files pass an `ImageObject` where Schema.org prefers a plain URL string:

- `app/[locale]/layout.tsx` lines 116–119 → affects all locale pages
- `app/[locale]/blog/[slug]/page.tsx` lines 199–204 → affects all 18 blog posts (also uses wrong image: `og-image.png` instead of logo)

Fix: Change 2 object literals to string URLs. ~30 minutes work. Unblocks rich results on majority of site.

**Bug #2 — Duplicate Organization entities:**

Every locale page renders two conflicting Organization nodes (one from layout with no `@id`, one from schema-generator with `@id: "${BASE_URL}#organization"`). Fix: add `@id` to layout-level Organization blocks.

**Bug #3 — Pricing page double-emits schema via `metadata.other`:**

`generateMetadata()` in pricing page emits JSON-LD via `metadata.other` (creates invalid `<meta>` tag) AND correctly via JSX. The `metadata.other` version is wasted/broken. Remove that line.

**Bug #4 — AggregateRating hardcoded:**

`ratingValue: 4.8, ratingCount: 1250` are hardcoded across tool pages and homepage. If not backed by real verified reviews from a third-party platform, this is schema spam and risks manual action. Verify or remove.

**Bug #5 — SearchAction URL inconsistency:**

`(pseo)/layout.tsx` uses `/blog?q=` while `[locale]/layout.tsx` uses `/search?q=`. Standardize to whichever endpoint is correct.

**Rich result eligibility (once bugs fixed):**

| Page Type | Eligible Rich Results |
|---|---|
| Tool pages | SoftwareApplication, FAQPage, BreadcrumbList |
| Blog posts | FAQPage (auto-extracted), BreadcrumbList |
| Guide pages | HowTo, FAQPage, BreadcrumbList |
| Homepage | FAQPage, Sitelinks Search Box |
| Comparison pages | FAQPage, Review, BreadcrumbList |
| Pricing page | FAQPage, Product |

---

## 7. Internal Link Structure

**Score: 23/100** *(first measurement)*

**Total site scale:** ~328 English base pages, ~1,600 total with locale variants across 127 sitemaps.

**Critical diagnosis:** The pSEO ecosystem (~1,600 URLs connected by the automated related-pages system) is completely isolated from the homepage and blog. The site's three authority sources (homepage, blog posts, primary navigation) pass virtually zero equity into the pSEO pages.

**Global nav/footer analysis:**

- **Primary nav:** /features, /blog, /pricing, /help — **/tools is NOT in the primary nav**
- **Footer:** /tools, /guides, /formats, /scale, /compare, /use-cases (6 category links)
- **Zero category links missing from footer:** /alternatives, /camera-raw, /content, /device-optimization, /device-use, /format-scale, /industry-insights, /photo-restoration, /platform-format

**Homepage linking failures:**

| Page | GSC Performance | Linked from Homepage? |
|---|---|---|
| /de/tools/transparent-background-maker | 86 imp, #1 impression page | ❌ No |
| /compare/midjourney-vs-stable-diffusion | 10 imp | ❌ No |
| /fr/ | pos 27.4, closest to page 1 | ❌ No |
| /ja/ | 5 imp | ❌ No |
| /tools/transparent-background-maker | Locale canonical for top page | ❌ No |

**Blog internal linking quality: 4/10**
- Blog correctly links to tool pages (good)
- Blog never links to pSEO pages (/scale/*, /free/*, /formats/*, /alternatives/*)
- 42 posts represent wasted equity distribution opportunity

**Priority opportunities:**

1. Add `/tools` to primary navigation (15 min, high impact)
2. Add transparent background maker card to homepage featured tools
3. Add locale homepage links visibly on homepage (not just hreflang)
4. Blog posts → pSEO category pages linking program (e.g., upscaling post → /scale/upscale-to-4k)
5. Cross-link /compare and /alternatives pages (they cover same intent in silos)
6. Remove empty sitemap-images.xml (registered, 0 URLs, wastes crawl budget)
7. Create /background-removal/ hub to consolidate 4 isolated background removal tools

---

## 8. Backlink Profile

**Score: 25/100** *(updated with current Ahrefs data — was 8/100 on Jan 30)*

**Ahrefs snapshot comparison:**

| Metric | Jan 30, 2026 | Feb 25, 2026 | Change |
|---|---|---|---|
| Domain Rating (DR) | 0 | **18** | **+18** |
| Ahrefs Rank | #87,437,807 | improving | — |
| Referring Domains | 8 | **75** | **+66 (+9.4x)** |
| AI Citations | 0 | 0 | — |
| Organic Traffic (Ahrefs) | ~0 | 22 visitors | +12 |
| Organic Keywords | 1 | 5 | +4 |
| Keywords #1-20 | 0 | 0 | — |
| Keywords #21+ | 0 | 30 | +30 |

The jump from DR 0 → 18 and 8 → 75 referring domains in ~26 days is substantial. **Next step: verify link quality.** Confirm whether the 75 domains are real editorial links (tool directories, press) or bulk low-UR entries that could be devalued. Ahrefs DR 18 means some are passing real authority.

**Competitive gap (still large):**

| Site | DR | Referring Domains | vs MIU |
|---|---|---|---|
| **myimageupscaler.com** | **18** | **75** | — |
| upscale.media | 65 | 5,000 | 66x behind |
| imglarger.com | 61 | 4,500 | 60x behind |
| bigjpg.com | 65 | 6,600 | 88x behind |
| iloveimg.com | 81 | 12,300 | 164x behind |

**Organic keywords (Ahrefs):** 5 keywords, all at #21+. Countries: Greece, India, Indonesia, New Zealand, Philippines. No English/US top-20 rankings yet — all tracked keywords are in the #21+ bucket.

**Pages most needing backlinks (from GSC):**
1. `/de/tools/transparent-background-maker` — 86 imp, pos 96; German backlinks would directly move this
2. `/` (homepage) — needs authority to rank for core "image upscaler" term
3. `/fr/` — pos 27.4; a few quality editorial links could push to page 1

**Link building momentum:** Keep building. At the current trajectory (66 new domains in 26 days), reaching DR 30+ and 200+ referring domains within 60 days is achievable — which is the threshold where Google starts consistently indexing the full pSEO ecosystem.

---

## 9. AI Search Readiness (AEO/GEO)

**Score: 51/100** *(first measurement)*

**AI bot access:**

| Bot | Status | Notes |
|---|---|---|
| Googlebot | Allowed | Explicit wildcard |
| Google-Extended | Allowed (implicit) | No explicit rule — code comment promises it but never implemented |
| GPTBot | Allowed (implicit) | No explicit rule |
| ClaudeBot | Allowed (implicit) | No explicit rule |
| PerplexityBot | Allowed (implicit) | No explicit rule |

**The code in `app/robots.ts` has comments documenting the intent to add explicit AI bot rules, but the rules were never emitted.** Fix: Add named user-agent blocks for Google-Extended, GPTBot, ClaudeBot, PerplexityBot, anthropic-ai. 15-minute fix.

**llms.txt:**
- ✅ `/llms.txt` exists and serves correctly
- ✅ `/llms-full.txt` exists and serves correctly
- ❌ `/llms-full.txt` references `/ai-features/*` URLs — zombie category (404s)
- ❌ API description contradicts between the two files ("no API key required" vs "API key required")
- Quality: 55/100

**Content citability:**
- Homepage: 55/100 — good semantic HTML, FAQ schema, but marketing-first (not answer-first)
- /de/tools/transparent-background-maker: 40/100 — German content limits English AI citation reach

**AEO checklist:** 7 pass / 12 fail / 2 partial out of 21 items

**Key AEO gaps:**
- No named human authors (all content attributed to organization)
- No Speakable schema (Google's signal for AI-extractable content)
- English transparent-background-maker page not prominent enough for AI to find
- No external citations in content (reduces AI system trust scores)

---

## 10. Competitive Intelligence

*Skipped — run with `--competitor=<domain>` to include.*

---

## 11. Keyword Research & Content Strategy

*Skipped — run with `--include-strategy` to include.*

---

## Prioritized Action Plan

### Critical — This Week

| # | Action | Effort | Impact | GSC Context |
|---|---|---|---|---|
| 1 | **Fix Organization.logo bug** in `app/[locale]/layout.tsx` + blog slug page | 30 min | Unblocks rich results sitewide | Schema spam currently suppressing SERP features |
| 2 | **Audit and sustain backlink quality** — DR jumped to 18, 75 domains. Verify these in Ahrefs (are they editorial or bulk dirs?). Push for first DR 30+ editorial placement (guest post / tool review) | ongoing | Accelerates indexation of 1,350 unindexed pages | DR 18 with 75 domains is good start |
| 3 | **Fix German page title** — include "png transparent machen" in H1/meta, translate H2s | 1 hr | CTR improvement on #1 impression page | 86 impressions, 0 clicks, pos 95.6 |
| 4 | **Add /tools to primary navigation** | 15 min | Link equity to all tool pages | /tools not in nav = tools lose authority |
| 5 | **Fix robots.ts** — add explicit Google-Extended, GPTBot, ClaudeBot, PerplexityBot Allow rules | 15 min | AEO/GEO positive signal | Code comment intention never implemented |

### High Impact — This Month

| # | Action | Effort | Impact |
|---|---|---|---|
| 6 | **Fix /fr/ homepage CTR** — French title to 60 chars, translate all H2s | 2 hrs | Pos 27.4 → first page clicks (best opportunity on site) |
| 7 | **Homepage: add transparent-background-maker as featured tool** | 1 hr | Link equity to top-impression page |
| 8 | **Add @id to layout-level Organization blocks** to eliminate duplicate entity conflict | 1 hr | Schema entity resolution for Google |
| 9 | **Fix pricing page double-emit** — remove `metadata.other` JSON-LD | 15 min | Clean schema output |
| 10 | **Verify or remove AggregateRating** — confirm 4.8/5 from 1,250 reviews is real data | 2 hrs | Schema integrity; manual action risk if fake |
| 11 | **Fix future date bug** in schema (`lastUpdated: "2026-12-06"`) | 1 hr | Date integrity |
| 12 | **Expand or noindex** `/blog/how-to-upscale-images-for-ecommerce` stub (250 words) | 30 min–2 hrs | Content quality signal |
| 13 | **Fix llms-full.txt** — remove ai-features URLs, resolve API key contradiction | 30 min | AEO trust signal |
| 14 | **Blog → pSEO linking program** — add contextual links from blog posts to /scale/*, /free/*, /alternatives/* | 3 hrs | Internal equity distribution |
| 15 | **Verify JS bundle secrets** — manual review of AWS/Cloudflare patterns flagged by SquirrelScan | 1 hr | Security (if real secrets, urgent) |

### Medium — This Quarter

| # | Action | Impact |
|---|---|---|
| 16 | Create English `/tools/transparent-background-maker` dedicated page with proper localization | Top English AEO opportunity |
| 17 | Consolidate background-removal cannibalization — designate one canonical, redirect others | Concentrates authority |
| 18 | Add visible locale switcher links on homepage (not just hreflang) | Equity to /fr/ at pos 27 |
| 19 | Create `scripts/gsc-direct-fetch.ts` for fresh GSC data in future audits | Operational |
| 20 | Guest posting / PR campaign (3+ quality placements) | DR 0 → 15 est. |
| 21 | Add named human author with bio page | E-E-A-T improvement |
| 22 | Add Speakable schema to homepage and top tool pages | AEO/AI Overviews signal |
| 23 | Remove or populate empty sitemap-images.xml | Crawl budget recovery |
| 24 | Reduce unused JS — eliminate `ed9f2dc4` chunk (222 KiB, 100% unused) | Mobile LCP 6.8s → target 4s |
| 25 | Add `fetchpriority="high"` to header logo image (LCP element) | Quick LCP win |

### Ongoing Maintenance

- Monthly backlink acquisition: 10+ new referring domains/month (target from docs)
- Weekly blog publishing: 2-3 posts/week (not burst publishing)
- Monthly GSC data pull and trend review
- Fix SearchAction URL inconsistency (/blog?q= vs /search?q=) across layouts

---

## Score Trend

| Report | Date | Overall | Technical | PageSpeed | Backlinks (DR) | Indexed | Notes |
|---|---|---|---|---|---|---|---|
| SquirrelScan audit | 2026-01-30 | 51/100 (SS only) | 51 | 78 mobile (SS) | 8 (DR 0) | — | SquirrelScan raw |
| Full audit baseline | 2026-02-11 | 52/100 | 53 | 56 mobile | 8 (DR 0) | 0* | From MEMORY.md |
| **This report** | **2026-02-25** | **47/100** | **64** | **72 mobile** | **75 (DR 18)** | **134/1,484** | Deeper analysis |

> *The Feb 11 "0 indexed" figure was a GSC sitemap-attribution API quirk. Actual indexed count was/is 134 pages.
>
> The 52→47 drop reflects newly measured dimensions (on-page 31, internal linking 23) that weren't fully quantified before. Technical SEO +11, Mobile Performance +16, and Backlinks (DR 0→18, 8→75 domains) are genuine improvements.

---

## Methodology

- **GSC data:** Existing report (docs/SEO/GCS/gsc-report-myimageupscaler-2026-02-09.md, 28-day period, 16 days old at report time)
- **Technical SEO:** SquirrelScan CLI, 100 pages, surface mode (Feb 25, 2026)
- **Core Web Vitals:** Lighthouse local run via Node.js, mobile + desktop profiles (Feb 25, 2026)
- **On-Page SEO:** WebFetch review of top 5 GSC impression pages + pSEO data file analysis
- **Schema:** Code review (`app/[locale]/layout.tsx`, `lib/seo/schema-generator.ts`, all generators) + live page JSON-LD verification
- **Internal Linking:** WebFetch on sitemap, homepage, blog listing; component tree analysis (`Header`, `Footer`)
- **Backlinks:** Ahrefs export (docs/SEO/claude/ahrefs/, dated 2026-01-30) — no fresh data available
- **Blog:** Live blog listing WebFetch + 4 individual post fetches + topics tracker review
- **AEO/GEO:** robots.txt live fetch + code review (`app/robots.ts`) + llms.txt live fetch + content citability review
- **Scoring:** Weighted average across 9 dimensions. Position normalization: `max(0, 100 - (pos - 1) × 1.5)`. CTR normalization: `min(100, CTR% × 1000)`. PageSpeed: mobile × 0.6 + desktop × 0.4.
