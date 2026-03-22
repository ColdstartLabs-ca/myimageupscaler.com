# PRD: MIU-redirect — Fix 104 GSC Redirect Errors

**Complexity: 5 → MEDIUM mode**

**Planning Mode: Principal Architect**

---

## 1. Context

**Problem:** Google Search Console reports 104 pages with redirects (listed in sitemaps or discovered via internal links), growing from 2 → 104 in 2.5 months. Redirect chains waste crawl budget and dilute link equity.

**Files Analyzed:**

- `lib/seo/related-pages.ts` (buildUrl — blindly adds locale prefix to English-only categories)
- `app/(pseo)/_components/pseo/templates/PlatformPageTemplate.tsx` (breadcrumb locale bug)
- `lib/seo/hreflang-generator.ts` (generateHreflangAlternates, generateSitemapHreflangLinks)
- `lib/seo/locale-sitemap-handler.ts` (generateLocaleCategorySitemapResponse)
- `lib/seo/localization-config.ts` (ENGLISH_ONLY_CATEGORIES)
- `client/components/seo/HreflangLinks.tsx`
- `middleware.ts` (handleTrailingSlash, handleWWWRedirect, handleLegacyRedirects)
- All `app/sitemap-*.xml/route.ts` files
- GSC export: `docs/PRDs/MIU-redirect.zip` (Chart.csv, Table.csv)

**Current Behavior:**

- `related-pages.ts` `buildUrl()` adds locale prefix to ALL categories including English-only ones → generates links like `/es/platforms/midjourney-upscaler` which middleware 301-redirects to `/platforms/midjourney-upscaler`
- Breadcrumb components in English-only category templates (PlatformPageTemplate, etc.) generate locale-prefixed URLs that redirect
- Trailing-slash URLs discovered by Google from internal/external links → middleware 301-redirects
- `www.` and `http://` URLs from external backlinks → middleware 301-redirects
- `/en/` prefix on root → middleware redirects to `/` (English uses rewrite, not prefix)
- Some locale-specific sitemaps may exist for English-only categories (shouldn't exist)

---

## 2. Solution

**Approach:**

1. Fix `related-pages.ts` `buildUrl()` to check `ENGLISH_ONLY_CATEGORIES` before adding locale prefix
2. Fix breadcrumb generation in English-only category templates to never include locale prefix
3. Audit and fix any internal link generation that produces trailing-slash URLs
4. Verify hreflang generation correctly excludes non-English locales for English-only categories
5. Add validation tests to catch locale-prefix generation for English-only categories

**Key Decisions:**

- Fix at the source (link generation) not at the middleware level — prevents new redirects from being created
- www/http/external redirects are out of scope — can't control external links, middleware handling is correct
- Trailing-slash redirects from external links are out of scope — middleware handling is correct
- Focus on eliminating internally-generated redirect URLs that Google crawls from our own pages/sitemaps

**Data Changes:** None.

---

## 3. Sequence Flow

```mermaid
flowchart TD
    A[User visits /es/tools/ai-image-upscaler] --> B{Page renders}
    B --> C[Related Pages section]
    C --> D{buildUrl called for each related page}
    D --> E{Is category English-only?}
    E -->|Yes| F[Generate URL WITHOUT locale prefix]
    E -->|No| G[Generate URL WITH locale prefix]
    F --> H[/platforms/midjourney-upscaler ✓]
    G --> I[/es/formats/upscale-jpeg ✓]

    B --> J[Breadcrumb component]
    J --> K{Is current category English-only?}
    K -->|Yes| L[Breadcrumb URLs without locale prefix]
    K -->|No| M[Breadcrumb URLs with locale prefix]
```

---

## 4. Execution Phases

### Phase 1: Fix `buildUrl()` in related-pages.ts

**User-visible outcome:** Related page links on localized pages no longer point to redirecting URLs for English-only categories.

**Files (2):**

- `lib/seo/related-pages.ts` — fix `buildUrl()` to respect English-only categories
- `tests/unit/seo/related-pages-locale.unit.spec.ts` — test locale prefix logic

**Implementation:**

- [ ] Import `isCategoryEnglishOnly` from `localization-config.ts`
- [ ] Update `buildUrl()` (line 55-58) to skip locale prefix for English-only categories:

  ```typescript
  import { isCategoryEnglishOnly } from './localization-config';
  import type { PSEOCategory } from './url-utils';

  const buildUrl = (cat: string, pageSlug: string): string => {
    // Never add locale prefix for English-only categories
    const isEnglishOnly = isCategoryEnglishOnly(cat as PSEOCategory);
    const localePrefix = locale !== 'en' && !isEnglishOnly ? `/${locale}` : '';
    return `${localePrefix}/${cat}/${pageSlug}`;
  };
  ```

**Tests Required:**

| Test File                                          | Test Name                                                                   | Assertion                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `tests/unit/seo/related-pages-locale.unit.spec.ts` | `should not add locale prefix for platforms links when locale is es`        | URL starts with `/platforms/` not `/es/platforms/` |
| `tests/unit/seo/related-pages-locale.unit.spec.ts` | `should not add locale prefix for compare links when locale is fr`          | URL starts with `/compare/`                        |
| `tests/unit/seo/related-pages-locale.unit.spec.ts` | `should add locale prefix for localized categories when locale is es`       | URL starts with `/es/tools/`                       |
| `tests/unit/seo/related-pages-locale.unit.spec.ts` | `should not add locale prefix for any locale when category is English-only` | All English-only categories tested                 |
| `tests/unit/seo/related-pages-locale.unit.spec.ts` | `should not add locale prefix for English locale regardless of category`    | URLs have no `/en/` prefix                         |

**Verification Plan:**

1. Unit tests pass
2. `yarn verify` passes

---

### Phase 2: Fix breadcrumb locale handling in English-only templates

**User-visible outcome:** Breadcrumbs on English-only category pages (platforms, compare, industry-insights, etc.) no longer generate locale-prefixed URLs.

**Files (3):**

- `app/(pseo)/_components/pseo/templates/PlatformPageTemplate.tsx` — fix breadcrumb hrefs
- `app/(pseo)/_components/pseo/templates/GenericPSEOPageTemplate.tsx` — audit/fix breadcrumb hrefs
- `tests/unit/seo/breadcrumb-locale.unit.spec.ts` — test breadcrumb URL generation

**Implementation:**

- [ ] In `PlatformPageTemplate.tsx`, update breadcrumb to never include locale prefix:

  ```typescript
  // Platforms is English-only — breadcrumbs should never have locale prefix
  <BreadcrumbNav
    items={[
      { label: 'Home', href: '/' },
      { label: 'Platforms', href: '/platforms' },
      { label: data.platformName || data.title, href: `/platforms/${data.slug}` },
    ]}
  />
  ```

- [ ] Audit `GenericPSEOPageTemplate.tsx` for the same pattern — if it uses `locale` prop to build breadcrumb hrefs for categories, add English-only guard
- [ ] Audit all other pSEO templates for similar patterns:
  - `ComparePageTemplate.tsx`
  - `IndustryInsightsPageTemplate.tsx`
  - `CameraRawPageTemplate.tsx`
  - `PhotoRestorationPageTemplate.tsx`
  - `ContentPageTemplate.tsx`
  - `AiFeaturesPageTemplate.tsx`
  - `BulkToolPageTemplate.tsx`
  - `DeviceOptimizationPageTemplate.tsx`

**Tests Required:**

| Test File                                       | Test Name                                                                  | Assertion                         |
| ----------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| `tests/unit/seo/breadcrumb-locale.unit.spec.ts` | `PlatformPageTemplate breadcrumbs should not include locale prefix`        | No href contains `/${locale}/`    |
| `tests/unit/seo/breadcrumb-locale.unit.spec.ts` | `English-only templates should never generate locale-prefixed breadcrumbs` | All English-only templates tested |

**Verification Plan:**

1. Unit tests pass
2. `yarn verify` passes
3. Grep for `locale ? \`/\${locale}\`` patterns in template files → should find none for English-only categories

---

### Phase 3: Audit hreflang and sitemap generation

**User-visible outcome:** Sitemaps and hreflang tags don't generate URLs for non-existent locale+category combinations.

**Files (3):**

- `lib/seo/hreflang-generator.ts` — verify English-only category filtering (should already work)
- `client/components/seo/HreflangLinks.tsx` — verify category prop is always passed for pSEO pages
- `tests/unit/seo/hreflang-english-only.unit.spec.ts` — test hreflang generation for English-only categories

**Implementation:**

- [ ] Verify `generateHreflangAlternates('/platforms/midjourney-upscaler', 'platforms')` returns only English + x-default (should already work via `getAvailableLocales`)
- [ ] Verify `generateSitemapHreflangLinks('/platforms/midjourney-upscaler', 'platforms')` returns only English + x-default
- [ ] Audit `HreflangLinks.tsx` usage in all English-only category page templates to ensure `category` prop is always passed (if missing, it defaults to "all locales" which generates wrong hreflang links)
- [ ] Check that no locale-specific sitemaps exist for English-only categories (e.g., there should be no `sitemap-platforms-es.xml`)

**Tests Required:**

| Test File                                           | Test Name                                                              | Assertion                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| `tests/unit/seo/hreflang-english-only.unit.spec.ts` | `should only generate en and x-default hreflang for platforms`         | Only 2 entries                               |
| `tests/unit/seo/hreflang-english-only.unit.spec.ts` | `should only generate en and x-default hreflang for compare`           | Only 2 entries                               |
| `tests/unit/seo/hreflang-english-only.unit.spec.ts` | `should generate all locale hreflang for tools`                        | 7 locales + x-default                        |
| `tests/unit/seo/hreflang-english-only.unit.spec.ts` | `no locale-specific sitemaps should exist for English-only categories` | No sitemap-{englishOnly}-{locale}.xml routes |

**Verification Plan:**

1. Unit tests pass
2. `yarn verify` passes
3. Verify: `ls app/sitemap-platforms-*.xml/` returns no locale-specific sitemaps

---

### Phase 4: Comprehensive redirect-source validation test

**User-visible outcome:** CI prevents future introduction of internal links/sitemaps that would produce redirect URLs.

**Files (1):**

- `tests/unit/seo/no-redirect-urls.unit.spec.ts` — validation test

**Implementation:**

- [ ] Test: No pSEO template generates breadcrumb/internal links with locale prefix for English-only categories
- [ ] Test: `buildUrl()` in related-pages never produces locale prefix for English-only categories
- [ ] Test: All English-only category pages pass `category` prop to `HreflangLinks` component
- [ ] Test: No sitemap route file exists for English-only category + non-English locale combination

**Tests Required:**

| Test File                                      | Test Name                                                                               | Assertion                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `tests/unit/seo/no-redirect-urls.unit.spec.ts` | `related-pages buildUrl should never produce locale prefix for English-only categories` | Tested across all English-only categories × all locales |
| `tests/unit/seo/no-redirect-urls.unit.spec.ts` | `no locale-specific sitemap routes exist for English-only categories`                   | Glob check                                              |
| `tests/unit/seo/no-redirect-urls.unit.spec.ts` | `all English-only page templates pass category prop to HreflangLinks`                   | Source code check                                       |

**Verification Plan:**

1. All validation tests pass
2. `yarn verify` passes

---

## 5. Acceptance Criteria

- [ ] All 4 phases complete
- [ ] All specified tests pass
- [ ] `yarn verify` passes
- [ ] `buildUrl()` in related-pages.ts respects English-only categories
- [ ] All breadcrumbs in English-only templates use non-locale-prefixed URLs
- [ ] Hreflang generation excludes non-English locales for English-only categories
- [ ] No locale-specific sitemaps exist for English-only categories
- [ ] Validation tests prevent future redirect-generating link patterns

---

## 6. GSC Redirect URL Classification (Reference)

| Category                                                                                     | Count | Root Cause                                   | Fix Phase   | In Scope                |
| -------------------------------------------------------------------------------------------- | ----- | -------------------------------------------- | ----------- | ----------------------- |
| Localized English-only category pages (`/{locale}/compare/*`, `/{locale}/platforms/*`, etc.) | ~40   | `buildUrl()` + breadcrumbs add locale prefix | Phase 1 + 2 | Yes                     |
| Trailing slashes (`/use-cases/`, `/formats/`, `/free/`, etc.)                                | ~30   | External links with trailing slashes         | N/A         | No (middleware correct) |
| `www.` → non-www                                                                             | ~6    | External backlinks                           | N/A         | No (middleware correct) |
| `http://` → `https://`                                                                       | ~3    | External backlinks                           | N/A         | No (middleware correct) |
| Locale homepages with trailing slash (`/ja/`, `/es/`, etc.)                                  | ~6    | Trailing slash on locale roots               | N/A         | No (middleware correct) |
| `/en/` → `/`                                                                                 | 1     | English uses rewrite, not prefix             | N/A         | No (by design)          |
| Query params (`/?ref=...`)                                                                   | 1     | External referral link                       | N/A         | No                      |
| Misc trailing slashes on pSEO pages                                                          | ~17   | External links or old sitemaps               | N/A         | No (middleware correct) |

**In-scope fixes:** ~40 of 104 redirect URLs (internally generated locale-prefixed URLs for English-only categories)

**Out-of-scope (correct behavior):** ~64 URLs — middleware correctly handles trailing slashes, www, http, and /en/ redirects. These are caused by external links we can't control.

**Expected impact:** ~40 redirect URLs eliminated at source. Remaining ~64 will persist but are correct middleware behavior (301 to canonical URL).

---

## 7. Relationship to MIU-404

These two PRDs share root causes:

- Both involve locale prefix handling for English-only vs. localized categories
- Phase 3 of MIU-404 (fix `/undefined/` locale bug) overlaps with Phase 2 of this PRD (breadcrumb locale handling)
- **Recommendation:** Implement MIU-404 Phase 1 first (highest-impact fix), then this PRD's phases, then MIU-404 remaining phases. The `/undefined/` fix can be done once across both PRDs.
