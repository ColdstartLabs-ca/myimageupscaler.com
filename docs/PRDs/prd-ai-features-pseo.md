# PRD: Populate AI Features pSEO Category

**Complexity: 6 → MEDIUM mode**

---

## 1. Context

**Problem:** The `ai-features` pSEO category has 0 pages (zombie category). Competitor upscale.media has 15+ ai-feature pages they just removed from their sitemap, creating a window to capture those rankings.

**Files Analyzed:**
- `app/seo/data/ai-features.json` — Empty: `{ category: "ai-features", pages: [], meta: { totalPages: 0 } }`
- `lib/seo/pseo-types.ts` — `IAIFeaturePage` interface already exists (lines 267-286)
- `lib/seo/data-loader.ts` — `getAllAIFeaturePages()`, `getAIFeatureData()`, `getAllAIFeatureSlugs()` already exist (dynamic import pattern)
- `lib/seo/url-utils.ts` — `'ai-features'` already in `PSEO_CATEGORIES` (line 63)
- `lib/seo/localization-config.ts` — `ai-features` excluded from both `LOCALIZED_CATEGORIES` and `ENGLISH_ONLY_CATEGORIES` (zombie comment on line 42)
- `app/sitemap-ai-features.xml/route.ts` — Exists but has a bug: URLs use `/${feature.slug}` instead of `/ai-features/${feature.slug}`
- `app/sitemap.xml/route.ts` — `ai-features` excluded from `ENGLISH_ONLY_SITEMAP_CATEGORIES` (comment on line 18)
- `app/(pseo)/` — No `ai-features/` route directory exists
- `tests/unit/seo/pseo-keyword-alignment.unit.spec.ts` — Has zombie test asserting 0 pages

**Current Behavior:**
- `ai-features.json` has 0 pages
- Data-loader functions exist but return empty arrays (dynamic import with try/catch)
- `IAIFeaturePage` type is defined and included in `PSEOPage` union
- Category is recognized in `PSEO_CATEGORIES` and `getCategoryDisplayName()`
- No route handler, no sitemap inclusion, no localization config entry
- Existing sitemap route has wrong URL pattern (missing `/ai-features/` prefix)

## 2. Solution

**Approach:**
1. Populate `ai-features.json` with 12 pages targeting "ai [feature] upscale" keywords
2. Create route handlers (`page.tsx` hub + `[slug]/page.tsx` detail) following the `content` category pattern (uses `GenericPSEOPageTemplate`)
3. Fix the existing sitemap route to use correct `/ai-features/{slug}` URLs and add hreflang support
4. Register `ai-features` in `ENGLISH_ONLY_CATEGORIES` and `ENGLISH_ONLY_SITEMAP_CATEGORIES`
5. Update tests to validate the new pages

**Key Decisions:**
- English-only (no localization) — new category, low priority for i18n
- Use `GenericPSEOPageTemplate` (not a custom template) — YAGNI, reuse existing
- 12 pages (not 15) — quality over quantity, all must have "upscale" in primaryKeyword
- Data loader already works (dynamic import) — no changes needed there

**Integration Points Checklist:**
```
How will this feature be reached?
- [x] Entry point: /ai-features (hub) and /ai-features/[slug] (detail pages)
- [x] Caller file: Next.js App Router dynamic routing
- [x] Registration: route files + sitemap index + localization config

Is this user-facing?
- [x] YES → Hub page + 12 detail pages accessible via URL

Full user flow:
1. User searches "ai noise reduction upscaler" on Google
2. Google indexes /ai-features/ai-noise-reduction-upscaler
3. User clicks SERP result → lands on detail page
4. Detail page shows benefits, how-it-works, FAQ, CTA to main upscaler
5. User clicks CTA → redirected to /?signup=1
```

---

## 3. Execution Phases

### Phase 1: Data & Config — "12 AI feature pages appear in data and sitemap config"

**Files (5):**
- `app/seo/data/ai-features.json` — Populate with 12 pages
- `lib/seo/localization-config.ts` — Add `'ai-features'` to `ENGLISH_ONLY_CATEGORIES` + `LOCALIZATION_STATUS`
- `app/sitemap.xml/route.ts` — Add `'ai-features'` to `ENGLISH_ONLY_SITEMAP_CATEGORIES`
- `app/sitemap-ai-features.xml/route.ts` — Fix URL pattern to `/ai-features/${slug}`, add hreflang
- `tests/unit/seo/pseo-keyword-alignment.unit.spec.ts` — Update ai-features tests from zombie → 12 pages

**Implementation:**

- [ ] Populate `ai-features.json` with 12 pages using `IAIFeaturePage` structure. Each page MUST have:
  - `slug`: kebab-case, e.g. `ai-noise-reduction-upscaler`
  - `primaryKeyword`: MUST contain "upscale" (e.g. "ai noise reduction upscaler")
  - `metaTitle`: ≤70 chars, contains "upscale"
  - `metaDescription`: ≤160 chars
  - `featureType`: one of `'enhancement' | 'restoration' | 'correction' | 'generation'`
  - `technology`: brief AI tech description
  - All required `IAIFeaturePage` fields: `featureName`, `description`, `capabilities`, `features`, `useCases`, `benefits`, `howItWorks`, `limitations`, `faq`, `relatedFeatures`, `relatedTools`, `ctaText`, `ctaUrl`
  - `category: 'ai-features'` (added by data-loader, not in JSON)
  - `lastUpdated`: `"2026-02-11"`

**Target 12 pages** (based on competitor analysis + search volume):

| # | Slug | primaryKeyword | featureType | Target Keyword Cluster |
|---|------|---------------|-------------|----------------------|
| 1 | `ai-noise-reduction-upscaler` | `ai noise reduction upscaler` | correction | Denoise + upscale |
| 2 | `ai-face-enhancement-upscaler` | `ai face enhancement upscaler` | enhancement | Face restore + upscale |
| 3 | `ai-color-correction-upscaler` | `ai color correction upscaler` | correction | Color fix + upscale |
| 4 | `ai-sharpness-enhancement-upscaler` | `ai sharpness enhancement upscaler` | enhancement | Sharpen + upscale |
| 5 | `ai-artifact-removal-upscaler` | `ai artifact removal upscaler` | correction | JPEG artifact + upscale |
| 6 | `ai-portrait-enhancement-upscaler` | `ai portrait enhancement upscaler` | enhancement | Portrait + upscale |
| 7 | `ai-detail-enhancement-upscaler` | `ai detail enhancement upscaler` | enhancement | Detail + upscale |
| 8 | `ai-clarity-enhancement-upscaler` | `ai clarity enhancement upscaler` | enhancement | Clarity + upscale |
| 9 | `ai-texture-enhancement-upscaler` | `ai texture enhancement upscaler` | enhancement | Texture + upscale |
| 10 | `ai-low-light-enhancement-upscaler` | `ai low light enhancement upscaler` | correction | Low-light + upscale |
| 11 | `ai-compression-repair-upscaler` | `ai compression repair upscaler` | restoration | Compression fix + upscale |
| 12 | `ai-old-photo-restoration-upscaler` | `ai old photo restoration upscaler` | restoration | Old photo + upscale |

- [ ] In `localization-config.ts`: Add `'ai-features'` to `ENGLISH_ONLY_CATEGORIES` array and remove the zombie comment. Add entry to `LOCALIZATION_STATUS`.
- [ ] In `app/sitemap.xml/route.ts`: Add `'ai-features'` to `ENGLISH_ONLY_SITEMAP_CATEGORIES` array and remove the zombie comment.
- [ ] Fix `app/sitemap-ai-features.xml/route.ts`: Change URL pattern from `/${feature.slug}` to `/ai-features/${feature.slug}`. Also add hub page entry for `/ai-features`, add hreflang links using `generateSitemapHreflangLinks`, and use `getSitemapResponseHeaders()` (match `sitemap-platforms.xml/route.ts` pattern exactly).
- [ ] Update test file: Change ai-features test from `should have 0 pages` → `should have 12 pages`. Add keyword alignment tests (upscale in primaryKeyword, metaTitle, secondaryKeywords). Add to `pSEO Data Quality` categories array. Remove the `should not be included in ENGLISH_ONLY_CATEGORIES` assertion (replace with `should be included in ENGLISH_ONLY_CATEGORIES`).

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/seo/pseo-keyword-alignment.unit.spec.ts` | `ai-features: should have 12 pages` | `expect(data.pages).toHaveLength(12)` |
| same | `all pages should have "upscale" in primaryKeyword` | each page's primaryKeyword contains "upscale" |
| same | `all pages should have "upscale" in metaTitle` | each page's metaTitle contains "upscale" |
| same | `all pages should have "upscale" in at least one secondaryKeyword` | at least one secondaryKeyword contains "upscale" |
| same | `should be included in ENGLISH_ONLY_CATEGORIES` | `ENGLISH_ONLY_CATEGORIES` contains `'ai-features'` |
| same | `ai-features data quality: metaTitle under 70 chars` | all metaTitles ≤ 70 chars |
| same | `ai-features data quality: metaDescription under 160 chars` | all metaDescriptions ≤ 160 chars |
| same | `ai-features data quality: unique slugs` | no duplicate slugs |

**Verification Plan:**

1. **Unit Tests:**
   - `yarn test tests/unit/seo/pseo-keyword-alignment.unit.spec.ts`
   - All ai-features assertions pass

2. **Evidence Required:**
   - [ ] All keyword alignment tests pass
   - [ ] `yarn verify` passes

---

### Phase 2: Route Handlers — "Pages are accessible at /ai-features and /ai-features/[slug]"

**Files (4):**
- `app/(pseo)/ai-features/page.tsx` — Hub page (list all AI feature pages)
- `app/(pseo)/ai-features/[slug]/page.tsx` — Detail page with metadata, schema, hreflang
- `tests/unit/seo/sitemap-index.unit.spec.ts` — Update sitemap count (81 → 82)
- `tests/unit/seo/pseo-keyword-alignment.unit.spec.ts` — Add to data quality categories array if not done in Phase 1

**Implementation:**

- [ ] Create `app/(pseo)/ai-features/page.tsx` following `app/(pseo)/content/page.tsx` pattern exactly:
  - Import `getAllAIFeaturePages` from data-loader
  - Import `generateCategoryMetadata` from metadata-factory
  - Export `metadata = generateCategoryMetadata('ai-features')`
  - Render grid of page links to `/ai-features/${page.slug}`
  - Use heading "AI Enhancement Features" and description text about AI-powered upscaling features

- [ ] Create `app/(pseo)/ai-features/[slug]/page.tsx` following `app/(pseo)/content/[slug]/page.tsx` pattern exactly:
  - Import `getAIFeatureData`, `getAllAIFeatureSlugs` from data-loader
  - Import `generateMetadata` from metadata-factory
  - Import `generatePSEOSchema` from schema-generator
  - Import `GenericPSEOPageTemplate`, `SchemaMarkup`, `HreflangLinks`, `SeoMetaTags`
  - `generateStaticParams()` uses `getAllAIFeatureSlugs()`
  - `generateMetadata()` uses `getAIFeatureData(slug)` + `generatePageMetadata(page, 'ai-features', 'en')`
  - Page component: `getAIFeatureData(slug)`, `notFound()` if null, render schema + SEO + template
  - Schema type: `generatePSEOSchema(page, 'ai-features', 'en')`
  - Path: `/ai-features/${slug}`
  - Category: `'ai-features'`
  - Locale: `'en'`

- [ ] Update `tests/unit/seo/sitemap-index.unit.spec.ts`: The total sitemap count increases from 81 to 82 because `ai-features` is added to `ENGLISH_ONLY_SITEMAP_CATEGORIES`. Update the test that checks the count.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/seo/sitemap-index.unit.spec.ts` | `should generate correct total sitemaps` | count = 82 (was 81) |

**Verification Plan:**

1. **Unit Tests:**
   - `yarn test tests/unit/seo/`
   - All SEO tests pass

2. **Evidence Required:**
   - [ ] All tests pass
   - [ ] `yarn verify` passes
   - [ ] Route files match existing patterns exactly (no novel code)

---

## 4. Acceptance Criteria

- [ ] `ai-features.json` has 12 pages with valid `IAIFeaturePage` data
- [ ] All 12 pages have "upscale" in `primaryKeyword`
- [ ] All `metaTitle` ≤ 70 chars, all `metaDescription` ≤ 160 chars
- [ ] `/ai-features` hub page renders list of 12 feature pages
- [ ] `/ai-features/[slug]` renders detail page with schema, hreflang, SEO tags
- [ ] `ai-features` is registered in `ENGLISH_ONLY_CATEGORIES`
- [ ] `ai-features` is registered in `ENGLISH_ONLY_SITEMAP_CATEGORIES`
- [ ] `LOCALIZATION_STATUS` has `ai-features` entry
- [ ] Sitemap route generates correct URLs (`/ai-features/{slug}`)
- [ ] Sitemap index includes `sitemap-ai-features.xml`
- [ ] All keyword alignment tests pass
- [ ] All data quality tests pass
- [ ] Sitemap count test updated (82)
- [ ] `yarn verify` passes

---

## 5. Page Content Guidelines

Each page should follow the `IAIFeaturePage` interface:

```typescript
interface IAIFeaturePage extends IBasePSEOPage {
  category: 'ai-features';
  featureName: string;           // e.g. "AI Noise Reduction"
  featureType: 'enhancement' | 'restoration' | 'correction' | 'generation';
  technology: string;            // e.g. "Deep neural networks trained on noise patterns"
  description: string;           // 2-3 sentences
  capabilities: string[];        // 4-6 bullet points
  features: IFeature[];          // 4-6 features with title+description
  useCases: IUseCase[];          // 4-5 use cases with title+description
  benefits: IBenefit[];          // 3-4 benefits with title+description+metric
  howItWorks: IHowItWorksStep[]; // 3-4 steps
  limitations: string[];         // 2-3 honest limitations
  faq: IFAQ[];                   // 5-7 Q&A pairs
  relatedFeatures: string[];     // 2-3 slugs of related ai-features pages
  relatedTools: string[];        // 1-2 slugs from tools.json
  ctaText: string;               // e.g. "Try AI Noise Reduction"
  ctaUrl: string;                // "/?signup=1"
}
```

**Content Quality Standards:**
- All content must be unique per page (no copy-paste between pages)
- Each FAQ must have substantive answers (not one-line dismissals)
- `description` should be 2-3 sentences explaining the feature in relation to upscaling
- `capabilities` should be specific (not generic "high quality" claims)
- `limitations` should be honest (builds trust, reduces bounce)
- All `ctaUrl` values should be `"/?signup=1"`

---

## 6. Out of Scope

- Custom `AIFeaturePageTemplate` component (use `GenericPSEOPageTemplate`)
- Localization / translations (English-only for now)
- Interactive tool components (these are content/SEO pages, not functional tools)
- Blog posts about AI features
- OG images (optional field, can be added later)
