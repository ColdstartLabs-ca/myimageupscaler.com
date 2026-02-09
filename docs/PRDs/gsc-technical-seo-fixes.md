# GSC Technical SEO Fixes - Implementation Plan

**Based on:** GSC Report dated 2026-02-09 (`docs/SEO/GCS/gsc-report-myimageupscaler-2026-02-09.md`)
**Status:** 13 clicks / 296 impressions over 28 days, avg position 57.0
**Critical Finding:** 1,471 URLs submitted in sitemap, 0 indexed by Google

---

## Complexity Assessment

```
+3  Touches 10+ files (middleware, sitemaps, metadata, translations, tests)
+2  Multi-package changes (seo lib, middleware, app routes, locale config)
```

**Complexity: 5 → MEDIUM mode**

---

## Context

**Problem:** Site submits 1,471 URLs to Google but has 0 indexed via sitemap, trailing slash duplicates cause cannibalization, and meta titles/descriptions are not optimized for the keywords actually generating impressions.

**Files Analyzed:**
- `middleware.ts` - Trailing slash handling, locale routing
- `next.config.js` - `trailingSlash: false` (disabled for API routes)
- `lib/seo/hreflang-generator.ts` - Hreflang generation
- `lib/seo/localization-config.ts` - Category localization config
- `lib/seo/locale-sitemap-handler.ts` - Locale sitemap generation
- `app/sitemap.xml/route.ts` - Sitemap index
- `app/[locale]/page.tsx` - Homepage metadata
- `app/sitemap-*.xml/route.ts` - Individual sitemaps

**Current Behavior:**
- `trailingSlash: false` in `next.config.js` - Next.js does NOT enforce trailing slash removal
- No middleware rule strips trailing slashes from page URLs (only in `handleLegacyRedirects` internally)
- Sitemaps submit ~1,471 URLs across 82 sitemaps (including 339 core pages × 7 locales + images + blog)
- Many submitted pages are thin/programmatic (format-scale, platform-format multipliers)
- Homepage metadata is hardcoded in English across all locales
- German/French locale pages inherit English meta titles instead of locale-optimized versions

---

## Solution

**Approach:**
1. Add trailing slash stripping to middleware (301 redirect `/path/` → `/path/`) to eliminate duplicate URLs
2. Prune sitemaps by temporarily removing low-value English-only categories that have no impressions
3. Optimize meta titles/descriptions for French homepage and German transparent-background-maker (the two pages with real GSC signals)
4. Verify hreflang correctness for homepage (GSC shows `/ja/` and `/ja/scale` competing with `/`)

**Key Decisions:**
- Canonical pattern: **no trailing slash** (matches `trailingSlash: false` in next.config.js)
- Sitemap pruning: Remove categories with zero impressions, keep core categories
- Meta optimization: Update locale translation files, not hardcoded strings

**Data Changes:** None (translation JSON files only)

---

## Integration Points Checklist

```
**How will this feature be reached?**
- [x] Entry point: Middleware (trailing slash redirect), Sitemap routes (pruning), Page metadata (translations)
- [x] Caller files: middleware.ts, app/sitemap.xml/route.ts, locale translation JSONs
- [x] Registration: Middleware already runs on all routes, sitemaps already generated

**Is this user-facing?**
- [x] NO → Internal SEO infrastructure. Users see no visible change. Google sees cleaner URLs.

**Full user flow:**
1. Google crawls URL with trailing slash → middleware 301s to no-slash version
2. Google crawls sitemap → gets fewer, higher-quality URLs
3. Google crawls locale pages → gets optimized meta titles/descriptions
```

---

## Execution Phases

### Phase 1: Trailing Slash Normalization - Google stops seeing duplicate URLs

**Files (3):**
- `middleware.ts` - Add `handleTrailingSlash()` function early in middleware chain
- `tests/unit/middleware.unit.spec.ts` - Add trailing slash redirect tests
- `tests/unit/seo/trailing-slash.spec.ts` - Dedicated trailing slash test file (if needed)

**Implementation:**

- [ ] Add `handleTrailingSlash(req)` function in middleware.ts that:
  - Checks if pathname ends with `/` and is longer than 1 char (skip root `/`)
  - Skips API routes (`/api/`)
  - Skips static files and Next.js internals (`/_next/`, files with extensions)
  - Returns a 301 redirect to the same URL without the trailing slash
  - Preserves query parameters and hash
- [ ] Insert `handleTrailingSlash` call in the main `middleware()` function AFTER `handleWWWRedirect` but BEFORE `handleLegacyRedirects` (so legacy redirects don't need to handle both slash variants)
- [ ] Update middleware matcher config if needed (current matcher should already catch trailing slash paths)

**Tests Required:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/seo/trailing-slash.spec.ts` | `should 301 redirect /ja/ to /ja` | Response status 301, Location header `/ja` |
| `tests/unit/seo/trailing-slash.spec.ts` | `should 301 redirect /pt/ to /pt` | Response status 301, Location header `/pt` |
| `tests/unit/seo/trailing-slash.spec.ts` | `should 301 redirect /de/tools/transparent-background-maker/ to without slash` | Response status 301 |
| `tests/unit/seo/trailing-slash.spec.ts` | `should NOT redirect root /` | No redirect |
| `tests/unit/seo/trailing-slash.spec.ts` | `should NOT redirect /api/ routes` | No redirect |
| `tests/unit/seo/trailing-slash.spec.ts` | `should preserve query params during redirect` | Query params intact |

**Verification:**
- `yarn verify` passes
- Manual: `curl -I localhost:3000/ja/` returns 301 with `Location: /ja`

---

### Phase 2: Sitemap Pruning - Reduce from ~1,471 to ~400 high-quality URLs

**Files (3):**
- `app/sitemap.xml/route.ts` - Remove low-value categories from sitemap index
- `lib/seo/localization-config.ts` - Add `SITEMAP_EXCLUDED_CATEGORIES` config
- `tests/unit/seo/sitemap-pruning.spec.ts` - Tests for sitemap pruning

**Implementation:**

The GSC report shows only 20 pages with any impressions out of 1,471 submitted. Categories with **zero impressions** that should be temporarily excluded from sitemap:

- [ ] Add `SITEMAP_EXCLUDED_CATEGORIES` to `localization-config.ts`:
  ```
  ai-features (0 pages in data - empty JSON)
  images (submits ~150-200 URLs of just og:image references - not real pages)
  ```
- [ ] In `app/sitemap.xml/route.ts`, filter out excluded categories from both `ENGLISH_ONLY_SITEMAP_CATEGORIES` and the locale sitemap generation loop
- [ ] Consider also excluding from English-only sitemaps categories that had zero GSC impressions:
  - `content` - 0 impressions
  - `photo-restoration` - 0 impressions
  - `camera-raw` - 0 impressions
  - `industry-insights` - 0 impressions
  - `device-optimization` - 0 impressions (but has 1 impression for device-use!)
  - `bulk-tools` - 0 impressions
  - `ai-features` - 0 pages, 0 impressions
  - `images` - duplicate of other pages (just image entries)

**Net effect:** Remove ~8 English-only sitemaps + their URLs. Keep `static`, `blog`, `compare`, `platforms` (these had impressions or are core).

Also from localized categories, `platform-format` (43 pages × 7 locales = 301 URLs) generates multiplier pages that are likely thin. Consider reducing to only English for now:
- [ ] Move `platform-format` from `LOCALIZED_CATEGORIES` to a new list or simply exclude locale sitemaps temporarily

**Tests Required:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/seo/sitemap-pruning.spec.ts` | `should exclude ai-features from sitemap index` | XML does not contain `sitemap-ai-features.xml` |
| `tests/unit/seo/sitemap-pruning.spec.ts` | `should exclude images sitemap from index` | XML does not contain `sitemap-images.xml` |
| `tests/unit/seo/sitemap-pruning.spec.ts` | `should still include core categories` | XML contains `sitemap-tools.xml`, `sitemap-static.xml` |
| `tests/unit/seo/sitemap-pruning.spec.ts` | `should have fewer than 80 sitemaps in index` | Count < 80 |

**Verification:**
- `yarn verify` passes
- Count URLs: `tsx scripts/count-sitemap-urls.ts http://localhost:3000` shows reduction

---

### Phase 3: French Homepage Meta Optimization - Break into top 10 for "enhance quality" queries

**Files (2):**
- `locales/fr/common.json` or `app/[locale]/page.tsx` - Update French homepage meta title/description
- `tests/unit/seo/locale-meta.spec.ts` - Test French meta tags

**Implementation:**

GSC data shows `/fr/` ranking position 16-20 for:
- "enhance quality" (pos 16)
- "enhance quality image" (pos 17)
- "quality enhancer" (pos 18.5)
- "ai image quality enhancer free" (pos 19)
- "increase photo quality" (pos 20)

Current problem: `app/[locale]/page.tsx` uses **hardcoded English** title/description for ALL locales:
```typescript
const title = 'AI Image Upscaler & Photo Enhancer | Enhance Quality Free Online';
```

- [ ] Update `app/[locale]/page.tsx` `generateMetadata()` to load locale-specific titles from translations
- [ ] Add French-specific homepage meta to the appropriate translation file:
  - Title: `"Enhance Image Quality Free Online | AI Photo Quality Enhancer"` (targets "enhance quality" + "quality enhancer" + "free")
  - Description: Include "enhance quality", "increase photo quality", "image quality enhancer free" naturally
- [ ] Keep the English title as-is (it's working — 3 clicks for "image upscaler")
- [ ] Add German-specific homepage meta targeting "Bild vergrößern" / "Bildqualität verbessern" terms

**Tests Required:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/seo/locale-meta.spec.ts` | `should use locale-specific title for French homepage` | French title contains "quality enhancer" |
| `tests/unit/seo/locale-meta.spec.ts` | `should keep English title for en homepage` | English title unchanged |
| `tests/unit/seo/locale-meta.spec.ts` | `should generate correct canonical URL for French` | Canonical is `https://myimageupscaler.com/fr` |

**Verification:**
- `yarn verify` passes
- Inspect rendered HTML at `/fr` shows optimized French meta title

---

### Phase 4: German Transparent Background Maker Meta Optimization - Biggest single impression source

**Files (2):**
- `locales/de/interactive-tools.json` or equivalent - Update German tool meta
- `tests/unit/seo/locale-meta.spec.ts` - Add German tool meta tests

**Implementation:**

GSC shows `/de/tools/transparent-background-maker` with 86 impressions (29% of ALL traffic) but 0 clicks at position ~96. Top German queries:
- "png transparent machen" (37 impressions)
- "png hintergrund transparent" (18 impressions)
- "transparenter hintergrund" (17 impressions)
- "png bild transparent machen" (3 impressions)

- [ ] Update German meta title for transparent-background-maker to include the exact German search terms:
  - Title: `"PNG Transparent Machen - Hintergrund Entfernen Online | MyImageUpscaler"` (targets "png transparent machen" + "hintergrund")
  - Meta description: Include "png hintergrund transparent", "transparenter hintergrund", "Bild transparent machen"
- [ ] Update German H1 heading to match search intent
- [ ] Ensure the page has sufficient content depth (not just a tool wrapper)

**Tests Required:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/seo/locale-meta.spec.ts` | `should have German-optimized meta for transparent-background-maker` | Title contains "transparent" and "PNG" |
| `tests/unit/seo/locale-meta.spec.ts` | `should have German meta description with target keywords` | Description contains "hintergrund" |

**Verification:**
- `yarn verify` passes
- Inspect translated content in `locales/de/interactive-tools.json`

---

### Phase 5: Hreflang Verification & Homepage Cannibalization Fix

**Files (3):**
- `lib/seo/hreflang-generator.ts` - Verify homepage hreflang correctness
- `app/[locale]/page.tsx` - Ensure hreflang includes category param
- `tests/unit/seo/hreflang-homepage.spec.ts` - Homepage hreflang tests

**Implementation:**

GSC shows "image upscaler" ranking for 3 pages: `/` (EN), `/ja/` (JA), `/ja/scale` (JA scale page). This suggests:
1. Hreflang is working for `/` ↔ `/ja/` (expected)
2. `/ja/scale` should NOT be competing for "image upscaler" — it's a different page type

- [ ] Verify that the homepage (`/`) calls `generateHreflangAlternates('/')` correctly and outputs all 7 locale alternates
- [ ] Verify that `/ja/scale` has its own distinct hreflang pointing to the scale category, NOT the homepage
- [ ] Check if `/ja/scale` has a proper canonical URL pointing to itself (not the homepage)
- [ ] Ensure the `HreflangLinks` component on the homepage passes no `category` parameter (so all locales are included)
- [ ] Write tests that verify homepage hreflang includes all 7 locales + x-default

**Tests Required:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/seo/hreflang-homepage.spec.ts` | `should generate hreflang for all 7 locales on homepage` | All 7 locales + x-default present |
| `tests/unit/seo/hreflang-homepage.spec.ts` | `should have x-default pointing to English homepage` | x-default = `https://myimageupscaler.com` |
| `tests/unit/seo/hreflang-homepage.spec.ts` | `should NOT include scale pages in homepage hreflang` | No `/scale` URLs in homepage alternates |
| `tests/unit/seo/hreflang-homepage.spec.ts` | `should have self-referencing canonical for /ja/` | Canonical for ja = `https://myimageupscaler.com/ja` |

**Verification:**
- `yarn verify` passes
- View source at `/ja/` shows correct hreflang and canonical

---

## Acceptance Criteria

- [ ] All 5 phases complete
- [ ] All specified tests pass
- [ ] `yarn verify` passes
- [ ] Trailing slash URLs return 301 (not 200 or 308)
- [ ] Sitemap index contains fewer sitemaps (target: ~60-70 instead of 82)
- [ ] French homepage has locale-specific meta title targeting "quality enhancer" keywords
- [ ] German transparent-background-maker has German-optimized meta title targeting "png transparent machen"
- [ ] Homepage hreflang correctly maps all 7 locales without including unrelated pages
- [ ] No regression in existing SEO tests

---

## Expected Impact

| Fix | Metric | Expected Change |
|-----|--------|-----------------|
| Trailing slash 301s | Duplicate URLs in GSC | Eliminate `/ja/` vs `/ja` duplicates |
| Sitemap pruning | Indexed pages ratio | Improve from 0/1471 — Google can focus on ~400 quality URLs |
| French meta optimization | Position for "quality enhancer" | Move from pos 16-20 → top 10 |
| German meta optimization | CTR for DE transparent bg queries | Move from 0% CTR at pos 96 → first clicks |
| Hreflang fixes | Cannibalization for "image upscaler" | Consolidate signals to homepage |

---

## Post-Implementation: Resubmit Sitemap

After deploying all fixes:
1. Resubmit `sitemap.xml` in Google Search Console
2. Use IndexNow (`scripts/submit-indexnow.ts`) to notify search engines of changes
3. Monitor GSC weekly for indexing improvements
4. After 30 days, evaluate whether to re-add pruned categories based on indexing velocity
