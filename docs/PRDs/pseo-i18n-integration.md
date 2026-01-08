# pSEO + i18n Integration PRD

`Complexity: 8 → HIGH mode`

---

| Field            | Value                                |
| ---------------- | ------------------------------------ |
| **Document ID**  | PRD-PSEO-I18N-001                    |
| **Version**      | 1.0                                  |
| **Status**       | Draft                                |
| **Created**      | 2026-01-07                           |
| **Author**       | Development Team                     |
| **Stakeholders** | Product, Engineering, Marketing, SEO |
| **Priority**     | P0 - International Growth            |

---

## 1. Context

**Problem:** The pSEO system generates 188+ English pages but lacks multi-language support, missing 65%+ of the global image upscaling market where competitors like upscale.media dominate with 22 languages.

**Files Analyzed:**

- `/i18n/config.ts` - Current locale configuration (en, es only)
- `/lib/seo/data-loader.ts` - pSEO data loading functions
- `/lib/seo/metadata-factory.ts` - Metadata generation with hreflang
- `/lib/i18n/pseo-translations.ts` - Existing pSEO translation loader
- `/app/seo/data/*.json` - 14 pSEO data files
- `/app/sitemap-*.xml/route.ts` - Category sitemaps
- `/middleware.ts` - Locale detection and routing (352 lines)
- `/locales/{en,es}/*.json` - Translation files

**Current Behavior:**

- i18n supports EN + ES only (via next-intl)
- pSEO pages exist at `/[locale]/(pseo)/[category]/[slug]`
- 188+ pSEO pages generated across 15 categories
- Middleware detects locale via URL > Cookie > Accept-Language
- Sitemaps include both EN and ES variants
- hreflang tags implemented for current locales

**Competitor Analysis Summary:**

| Competitor      | Languages | pSEO Pages | hreflang | Strategy                      |
| --------------- | --------- | ---------- | -------- | ----------------------------- |
| upscale.media   | 22        | 403        | Yes      | Full localization + pSEO      |
| picwish.com     | 11        | 275        | Partial  | Full pSEO localization        |
| icons8.com      | 10        | 150+       | Yes      | ccTLD + path-based            |
| bigjpg.com      | 13        | ~50        | No       | Basic i18n, no pSEO expansion |
| vanceai.com     | 4         | ~30        | No       | Client-side i18n (poor SEO)   |
| imgupscaler.com | 1         | ~20        | N/A      | English only                  |

**Key Insight:** upscale.media dominates international SEO with 22 languages. Their strategy: **localize core pages (176), keep long-tail pSEO in English (191)**. This hybrid approach balances quality with scale.

---

## 2. Solution

**Approach:**

- Expand from 2 → 10 languages (Phase 1: 5, Phase 2: +5)
- Implement hybrid localization: translate high-traffic pSEO categories, keep long-tail in English
- Use Cloudflare's built-in IP geolocation (free, no external API) for auto-detection
- Client-side locale suggestion (not redirect) to preserve SEO
- Generate language-specific sitemaps with proper hreflang
- Audit existing SEO to ensure no harm from changes

**Architecture Diagram:**

```mermaid
flowchart TB
    subgraph Request["Request Flow"]
        R[Request] --> CF[Cloudflare Edge]
        CF -->|Add CF-IPCountry header| MW[Middleware]
        MW -->|Detect Locale| LC{URL Locale?}
        LC -->|Yes| USE[Use URL Locale]
        LC -->|No| CK{Cookie?}
        CK -->|Yes| USE
        CK -->|No| AL{Accept-Language?}
        AL -->|Match| USE2[Use Detected]
        AL -->|No Match| DEF[Default: en]
    end

    subgraph GeoDetect["Geolocation (Client-Side)"]
        PAGE[Page Load] --> HOOK[useGeolocation Hook]
        HOOK --> GEO{User Country}
        GEO -->|Match Supported| SUGGEST[Suggest Locale Change]
        GEO -->|No Match| SILENT[No Action]
        SUGGEST --> USER{User Decision}
        USER -->|Accept| SWITCH[Switch Locale + Set Cookie]
        USER -->|Dismiss| DISMISS[Set Dismissed Cookie]
    end

    subgraph PSEO["pSEO Generation"]
        DATA[JSON Data Files] --> LOADER[Data Loader]
        LOADER --> TRANSLATE{Is Localized Category?}
        TRANSLATE -->|Yes| LOCALIZED[Load /locales/{locale}/]
        TRANSLATE -->|No| ENGLISH[Load English + Banner]
    end

    subgraph Sitemap["Sitemap Generation"]
        SM[Sitemap Index] --> SM_EN[sitemap-{category}.xml]
        SM --> SM_ES[sitemap-{category}-es.xml]
        SM --> SM_PT[sitemap-{category}-pt.xml]
        SM --> SM_MORE[... more locales]
    end
```

**Key Decisions:**

- [x] Library: Continue with `next-intl` (already integrated)
- [x] Geolocation: Use Cloudflare `CF-IPCountry` header (free, no external API)
- [x] Auto-detection: Client-side suggestion only (not redirect) - SEO safe
- [x] Hybrid strategy: Localize tools, formats, free, guides; keep comparisons/alternatives in English
- [x] Priority languages: PT, DE, FR, IT, JA (based on search volume + competitor gaps)
- [x] Sitemap strategy: Separate sitemaps per locale with index file

**Data Changes:**

- Add translation files: `/locales/{pt,de,fr,it,ja}/*.json`
- No database changes (filesystem-based translations)
- Add geolocation suggestion cookie: `locale_suggestion_dismissed`

---

## 3. Sequence Flow

### Geolocation-Based Locale Suggestion

```mermaid
sequenceDiagram
    participant U as User
    participant CF as Cloudflare
    participant MW as Middleware
    participant P as Page
    participant H as useGeolocation Hook
    participant LS as LocaleSuggester

    U->>CF: GET /tools/ai-image-upscaler
    CF->>CF: Add CF-IPCountry: BR
    CF->>MW: Forward with geo header
    MW->>MW: No locale in URL, use default (en)
    MW->>P: Render English page

    P->>H: Initialize hook
    H->>H: Read CF-IPCountry from cookie/header
    H->>H: Map BR → pt (Portuguese)

    alt Locale different from current
        H->>LS: Show suggestion banner
        LS->>U: "Would you like to view in Portuguese?"

        alt User accepts
            U->>LS: Click "Yes"
            LS->>LS: Set locale cookie
            LS->>U: Redirect to /pt/tools/ai-image-upscaler
        else User dismisses
            U->>LS: Click "No thanks"
            LS->>LS: Set dismissed cookie (30 days)
        end
    else Same locale or dismissed
        H->>H: No action
    end
```

### pSEO Page Localization Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant P as Page Component
    participant DL as Data Loader
    participant T as Translations
    participant F as Fallback

    B->>P: GET /pt/tools/ai-image-upscaler
    P->>DL: loadToolPage('ai-image-upscaler', 'pt')

    DL->>DL: Check if category 'tools' is localized for 'pt'

    alt Category is localized
        DL->>T: Load /locales/pt/tools.json
        T-->>DL: Portuguese tool data
        DL-->>P: Fully localized content
    else Category not localized
        DL->>F: Load /locales/en/tools.json
        F-->>DL: English content
        DL->>DL: Add 'availableInEnglishOnly' flag
        DL-->>P: English content + localization banner
    end

    P->>P: Generate metadata with hreflang
    P-->>B: Rendered page
```

---

## 4. Execution Phases

### Phase 1: SEO Audit & Infrastructure - Validate current setup and prepare expansion

**Files (5):**

- `lib/seo/i18n-audit.ts` - Create SEO audit utility
- `lib/seo/hreflang-generator.ts` - Enhance for new locales
- `i18n/config.ts` - Add new locale definitions
- `app/sitemap.xml/route.ts` - Update sitemap index
- `middleware.ts` - Add CF-IPCountry header reading

**Implementation:**

- [ ] Create SEO audit script to validate current hreflang implementation
- [ ] Verify all pSEO pages have correct canonical URLs
- [ ] Check for duplicate content issues between EN/ES
- [ ] Add PT, DE, FR, IT, JA to SUPPORTED_LOCALES
- [ ] Update middleware to read CF-IPCountry header
- [ ] Generate audit report with recommendations

**Tests Required:**

| Test File                            | Test Name                                | Assertion                                            |
| ------------------------------------ | ---------------------------------------- | ---------------------------------------------------- |
| `tests/unit/seo/hreflang.spec.ts`    | `should generate hreflang for 7 locales` | `expect(hreflang).toHaveLength(8)` (incl. x-default) |
| `tests/unit/seo/audit.spec.ts`       | `should detect missing canonicals`       | `expect(issues).toEqual([])` for valid pages         |
| `tests/unit/i18n/middleware.spec.ts` | `should read CF-IPCountry header`        | `expect(geoCountry).toBe('BR')`                      |

**User Verification:**

- Action: Run `yarn seo:audit` and review report
- Expected: Zero critical issues, all hreflang tags validate

**⛔ CHECKPOINT 1**

---

### Phase 2: Geolocation Hook & Suggestion UI - Implement non-intrusive locale detection

**Files (5):**

- `client/hooks/useGeolocation.ts` - Create geolocation detection hook
- `client/components/i18n/LocaleSuggester.tsx` - Create suggestion banner
- `lib/i18n/country-locale-map.ts` - Country to locale mapping
- `client/components/layout/Layout.tsx` - Integrate LocaleSuggester
- `middleware.ts` - Pass geo data to client via cookie

**Implementation:**

- [ ] Create `useGeolocation` hook that reads CF-IPCountry from cookie
- [ ] Build country → locale mapping (BR→pt, DE→de, FR→fr, JP→ja, IT→it)
- [ ] Create dismissible `LocaleSuggester` banner component
- [ ] Store user preference in `locale_preference` cookie
- [ ] Store dismissal in `locale_suggestion_dismissed` cookie (30 days)
- [ ] Ensure suggestion never appears if user explicitly chose locale

**SEO Safety Measures:**

- [ ] Suggestion is client-side only (no server redirect)
- [ ] Googlebot receives default locale without redirection
- [ ] Banner uses `role="alert"` for accessibility
- [ ] No JavaScript required for base page functionality

**Tests Required:**

| Test File                                  | Test Name                                | Assertion                              |
| ------------------------------------------ | ---------------------------------------- | -------------------------------------- |
| `tests/unit/hooks/useGeolocation.spec.ts`  | `should detect country from cookie`      | `expect(country).toBe('BR')`           |
| `tests/unit/hooks/useGeolocation.spec.ts`  | `should map country to locale`           | `expect(suggestedLocale).toBe('pt')`   |
| `tests/e2e/i18n/locale-suggestion.spec.ts` | `should show suggestion for new visitor` | Banner visible for non-matching locale |
| `tests/e2e/i18n/locale-suggestion.spec.ts` | `should not show after dismissal`        | Banner hidden after dismiss click      |

**User Verification:**

- Action: Visit site with VPN set to Germany, no locale cookie
- Expected: See "View in German?" suggestion banner

**⛔ CHECKPOINT 2**

---

### Phase 3: Priority Language Translations (PT, DE, FR) - Translate core pSEO categories

**Files (5 per language, 3 languages = phased):**

**Phase 3a: Portuguese (PT)**

- `locales/pt/common.json` - UI strings
- `locales/pt/tools.json` - Tool pages (10 pages)
- `locales/pt/formats.json` - Format pages (10 pages)
- `locales/pt/free.json` - Free tool pages (5 pages)
- `locales/pt/guides.json` - Guide pages (8 pages)

**Phase 3b: German (DE)**

- `locales/de/common.json`, `tools.json`, `formats.json`, `free.json`, `guides.json`

**Phase 3c: French (FR)**

- `locales/fr/common.json`, `tools.json`, `formats.json`, `free.json`, `guides.json`

**Implementation:**

- [ ] Create base translation structure from English files
- [ ] Translate tools category (high-traffic, 10 pages × 3 languages)
- [ ] Translate formats category (technical terms, 10 pages × 3 languages)
- [ ] Translate free category (conversion-focused, 5 pages × 3 languages)
- [ ] Translate guides category (educational, 8 pages × 3 languages)
- [ ] Quality review by native speakers (contractor/community)

**Content Strategy:**

| Category     | Translate? | Rationale                           |
| ------------ | ---------- | ----------------------------------- |
| tools        | Yes        | High traffic, direct conversions    |
| formats      | Yes        | Technical, good search volume       |
| free         | Yes        | High conversion intent              |
| guides       | Yes        | Educational, long-tail keywords     |
| scale        | Partial    | Numeric-heavy, simpler to translate |
| use-cases    | Phase 3    | Industry-specific, requires nuance  |
| compare      | No         | Brand names, English-dominated      |
| alternatives | No         | Brand names, English-dominated      |
| platforms    | No         | Tech platforms are English-centric  |

**Tests Required:**

| Test File                                | Test Name                         | Assertion                                   |
| ---------------------------------------- | --------------------------------- | ------------------------------------------- |
| `tests/e2e/pseo/localized-tools.spec.ts` | `should render PT tool page`      | Page shows Portuguese content               |
| `tests/e2e/pseo/localized-tools.spec.ts` | `should render DE tool page`      | Page shows German content                   |
| `tests/unit/seo/data-loader.spec.ts`     | `should load localized tool data` | `expect(data.title).toContain('IA')` for PT |

**User Verification:**

- Action: Visit `/pt/tools/ai-image-upscaler`
- Expected: Full Portuguese content, proper hreflang tags

**⛔ CHECKPOINT 3**

---

### Phase 4: Additional Languages (IT, JA) - Extend to Italian and Japanese

**Files (5 per language):**

- `locales/it/common.json`, `tools.json`, `formats.json`, `free.json`, `guides.json`
- `locales/ja/common.json`, `tools.json`, `formats.json`, `free.json`, `guides.json`

**Implementation:**

- [ ] Create Italian translations for priority categories
- [ ] Create Japanese translations for priority categories
- [ ] Add RTL consideration for future Arabic support
- [ ] Update locale config with new languages
- [ ] Generate sitemaps for new locales

**Japanese-Specific Considerations:**

- [ ] Use professional translation (not AI) for nuanced content
- [ ] Verify character encoding in JSON files (UTF-8)
- [ ] Test CJK text rendering in all templates
- [ ] Consider longer text in UI components

**Tests Required:**

| Test File                                | Test Name                    | Assertion                   |
| ---------------------------------------- | ---------------------------- | --------------------------- |
| `tests/e2e/pseo/localized-tools.spec.ts` | `should render JA tool page` | Page shows Japanese content |
| `tests/e2e/pseo/localized-tools.spec.ts` | `should render IT tool page` | Page shows Italian content  |

**User Verification:**

- Action: Visit `/ja/tools/ai-image-upscaler`
- Expected: Full Japanese content with proper character rendering

**⛔ CHECKPOINT 4**

---

### Phase 5: Sitemap & SEO Infrastructure - Generate multi-language sitemaps

**Files (4):**

- `app/sitemap.xml/route.ts` - Update sitemap index
- `lib/seo/sitemap-generator.ts` - Multi-locale sitemap generator
- `app/sitemap-tools-[locale].xml/route.ts` - Locale-specific category sitemaps
- `lib/seo/hreflang-validator.ts` - Validation utility

**Implementation:**

- [ ] Generate sitemap index pointing to all locale sitemaps
- [ ] Create locale-specific sitemaps: `sitemap-tools-pt.xml`, `sitemap-tools-de.xml`, etc.
- [ ] Include hreflang in sitemap entries (Google's preferred method)
- [ ] Add `<xhtml:link>` elements for language alternates
- [ ] Create hreflang validation script for CI/CD

**Sitemap Structure:**

```
/sitemap.xml (index)
├── /sitemap-static.xml (core pages, all locales)
├── /sitemap-tools.xml (English tools)
├── /sitemap-tools-es.xml
├── /sitemap-tools-pt.xml
├── /sitemap-tools-de.xml
├── /sitemap-tools-fr.xml
├── /sitemap-tools-it.xml
├── /sitemap-tools-ja.xml
├── /sitemap-formats.xml
├── /sitemap-formats-es.xml
├── ... (all localized categories)
├── /sitemap-compare.xml (English only)
├── /sitemap-alternatives.xml (English only)
└── /sitemap-blog.xml
```

**Tests Required:**

| Test File                                  | Test Name                    | Assertion                      |
| ------------------------------------------ | ---------------------------- | ------------------------------ |
| `tests/unit/seo/sitemap.spec.ts`           | `should include all locales` | 7 locale variants per category |
| `tests/unit/seo/sitemap.spec.ts`           | `should have valid hreflang` | All URLs have x-default + alts |
| `tests/e2e/seo/sitemap-validation.spec.ts` | `should return valid XML`    | XML parses without errors      |

**User Verification:**

- Action: Submit sitemap to Google Search Console
- Expected: All URLs indexed, no hreflang errors

**⛔ CHECKPOINT 5**

---

### Phase 6: Non-Localized Page Handling - Handle English-only pSEO gracefully

**Files (4):**

- `client/components/pseo/EnglishOnlyBanner.tsx` - Info banner component
- `lib/seo/localization-config.ts` - Define which categories are localized
- `lib/seo/data-loader.ts` - Add fallback logic
- `app/[locale]/(pseo)/compare/[slug]/page.tsx` - Update comparison pages

**Implementation:**

- [ ] Create `LOCALIZED_CATEGORIES` config: `['tools', 'formats', 'free', 'guides', 'scale']`
- [ ] Create `EnglishOnlyBanner` component with dismissible UI
- [ ] Update data loader to return `isLocalizedContent` flag
- [ ] Show subtle banner on non-localized pages: "This content is available in English"
- [ ] Ensure proper hreflang (x-default → EN version)

**Non-Localized Page Behavior:**

```typescript
// When user visits /pt/compare/myimageupscaler-vs-topaz
// 1. Page renders with English content
// 2. Show subtle banner: "Este conteúdo está disponível apenas em inglês"
// 3. hreflang points to EN as canonical
// 4. No SEO penalty (content matches hreflang)
```

**Tests Required:**

| Test File                             | Test Name                               | Assertion                                                 |
| ------------------------------------- | --------------------------------------- | --------------------------------------------------------- |
| `tests/e2e/pseo/english-only.spec.ts` | `should show banner on compare page`    | Banner visible on /pt/compare/\*                          |
| `tests/e2e/pseo/english-only.spec.ts` | `should not show banner on tools page`  | No banner on /pt/tools/\*                                 |
| `tests/unit/seo/data-loader.spec.ts`  | `should return isLocalizedContent flag` | `expect(data.isLocalizedContent).toBe(false)` for compare |

**User Verification:**

- Action: Visit `/pt/compare/myimageupscaler-vs-topaz`
- Expected: English content with Portuguese banner explaining

**⛔ CHECKPOINT 6**

---

### Phase 7: Final SEO Audit & Validation - Comprehensive SEO health check

**Files (3):**

- `scripts/seo-audit.ts` - Comprehensive audit script
- `tests/e2e/seo/full-audit.spec.ts` - E2E SEO validation
- `docs/SEO/i18n-audit-report.md` - Generated audit report

**Implementation:**

- [ ] Run full hreflang validation across all pages
- [ ] Verify canonical URLs for all locales
- [ ] Check for duplicate content issues
- [ ] Validate schema markup includes `inLanguage`
- [ ] Test Core Web Vitals for localized pages
- [ ] Submit all sitemaps to Google Search Console
- [ ] Monitor indexing for 2 weeks post-launch

**Audit Checklist:**

- [ ] All pages have unique `<title>` tags per locale
- [ ] All pages have unique `<meta description>` per locale
- [ ] hreflang tags include all supported locales + x-default
- [ ] Canonical URLs point to correct locale version
- [ ] No duplicate content warnings in GSC
- [ ] Schema markup includes `inLanguage` property
- [ ] Sitemaps are valid XML
- [ ] All URLs return 200 status
- [ ] No redirect chains
- [ ] Mobile usability passes for all locales

**Tests Required:**

| Test File                          | Test Name                            | Assertion                        |
| ---------------------------------- | ------------------------------------ | -------------------------------- |
| `tests/e2e/seo/full-audit.spec.ts` | `should have valid hreflang`         | All pages pass hreflang check    |
| `tests/e2e/seo/full-audit.spec.ts` | `should have unique meta per locale` | No duplicate titles/descriptions |
| `tests/e2e/seo/full-audit.spec.ts` | `should pass Core Web Vitals`        | LCP < 2.5s for all locales       |

**User Verification:**

- Action: Review Google Search Console after 2 weeks
- Expected: No hreflang errors, pages indexed for all locales

---

## 5. Testing Requirements

| Category    | Required Tests                                                                     |
| ----------- | ---------------------------------------------------------------------------------- |
| Unit        | Geolocation hook, country mapping, hreflang generation, data loader with locale    |
| Integration | Middleware geo detection, sitemap generation, translation loading                  |
| E2E         | Locale suggestion flow, pSEO page rendering, SEO validation, sitemap accessibility |
| SEO         | hreflang validation, canonical checks, duplicate content detection                 |

**Test naming:** `should [expected behavior] when [condition]`

---

## 6. Acceptance Criteria

- [ ] All 7 phases complete
- [ ] 7 languages supported (EN, ES, PT, DE, FR, IT, JA)
- [ ] Geolocation suggestion works without harming SEO
- [ ] 33+ localized pSEO pages per new language (tools, formats, free, guides)
- [ ] All sitemaps valid and submitted to GSC
- [ ] Zero hreflang errors in GSC
- [ ] `yarn verify` passes
- [ ] Core Web Vitals pass for all localized pages
- [ ] No ranking drop for existing EN/ES pages (monitor 30 days)

---

## 7. SEO Safety Checklist

### What This Implementation Does NOT Do (Intentionally)

| Anti-Pattern                | Why Avoided                                             |
| --------------------------- | ------------------------------------------------------- |
| Server-side geo redirect    | Blocks Googlebot, causes cloaking concerns              |
| IP-based content variation  | Different content for same URL = duplicate content risk |
| Auto-switch without consent | Poor UX, can trap users in wrong language               |
| Translate all pSEO pages    | Quality suffers, thin content risk                      |
| Remove English versions     | Lose backlinks, lose established rankings               |

### What This Implementation Does (Best Practices)

| Best Practice               | Implementation                                    |
| --------------------------- | ------------------------------------------------- |
| Client-side suggestion only | useGeolocation hook, dismissible banner           |
| Consistent URL structure    | `/[locale]/[category]/[slug]` for all languages   |
| hreflang on every page      | Including x-default pointing to English           |
| Locale in sitemap           | Separate sitemaps per locale with `<xhtml:link>`  |
| Canonical self-reference    | Each locale page is its own canonical             |
| Graceful fallback           | Non-localized pages show English with info banner |
| Cookie-based persistence    | User choice remembered, not forced                |

---

## 8. Risk Assessment

| Risk                       | Probability | Impact | Mitigation                                            |
| -------------------------- | ----------- | ------ | ----------------------------------------------------- |
| Translation quality issues | Medium      | High   | AI + native speaker review, phased rollout            |
| hreflang misconfiguration  | Low         | High   | Automated validation in CI, GSC monitoring            |
| Indexing delays            | Medium      | Medium | Submit sitemaps immediately, use IndexNow             |
| Core Web Vitals regression | Low         | Medium | Pre-launch performance testing per locale             |
| Geo-detection inaccuracy   | Low         | Low    | Cloudflare's accuracy is 95%+, suggestion is optional |
| Duplicate content flags    | Low         | High   | Proper hreflang, unique meta per locale               |
| Build time increase        | High        | Low    | ISR for non-EN pages, parallel sitemap generation     |

---

## 9. Technical Specifications

### Cloudflare Geolocation Integration

```typescript
// middleware.ts - Reading CF-IPCountry
export function middleware(request: NextRequest) {
  // Cloudflare automatically adds this header
  const country = request.headers.get('CF-IPCountry') || 'US';

  // Pass to client via cookie (for useGeolocation hook)
  const response = NextResponse.next();
  response.cookies.set('cf_country', country, {
    httpOnly: false, // Client-readable
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60, // 1 hour
  });

  return response;
}
```

### useGeolocation Hook

```typescript
// client/hooks/useGeolocation.ts
const COUNTRY_TO_LOCALE: Record<string, Locale> = {
  BR: 'pt',
  PT: 'pt',
  DE: 'de',
  AT: 'de',
  CH: 'de',
  FR: 'fr',
  BE: 'fr',
  IT: 'it',
  JP: 'ja',
  ES: 'es',
  MX: 'es',
  AR: 'es',
  CO: 'es',
  // ... more mappings
};

export function useGeolocation() {
  const [suggestedLocale, setSuggestedLocale] = useState<Locale | null>(null);
  const currentLocale = useLocale();
  const dismissed = getCookie('locale_suggestion_dismissed');

  useEffect(() => {
    if (dismissed) return;

    const country = getCookie('cf_country');
    const mapped = COUNTRY_TO_LOCALE[country];

    if (mapped && mapped !== currentLocale) {
      setSuggestedLocale(mapped);
    }
  }, [currentLocale]);

  return {
    suggestedLocale,
    dismiss: () => {
      setCookie('locale_suggestion_dismissed', 'true', { days: 30 });
      setSuggestedLocale(null);
    },
    accept: () => {
      setCookie('locale', suggestedLocale, { days: 365 });
      window.location.href = `/${suggestedLocale}${window.location.pathname}`;
    },
  };
}
```

### Sitemap with hreflang

```xml
<!-- sitemap-tools-pt.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://myimageupscaler.com/pt/tools/ai-image-upscaler</loc>
    <lastmod>2026-01-07</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
    <xhtml:link rel="alternate" hreflang="en" href="https://myimageupscaler.com/tools/ai-image-upscaler"/>
    <xhtml:link rel="alternate" hreflang="es" href="https://myimageupscaler.com/es/tools/ai-image-upscaler"/>
    <xhtml:link rel="alternate" hreflang="pt" href="https://myimageupscaler.com/pt/tools/ai-image-upscaler"/>
    <xhtml:link rel="alternate" hreflang="de" href="https://myimageupscaler.com/de/tools/ai-image-upscaler"/>
    <xhtml:link rel="alternate" hreflang="fr" href="https://myimageupscaler.com/fr/tools/ai-image-upscaler"/>
    <xhtml:link rel="alternate" hreflang="it" href="https://myimageupscaler.com/it/tools/ai-image-upscaler"/>
    <xhtml:link rel="alternate" hreflang="ja" href="https://myimageupscaler.com/ja/tools/ai-image-upscaler"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://myimageupscaler.com/tools/ai-image-upscaler"/>
  </url>
</urlset>
```

---

## 10. Dependencies

```json
{
  "dependencies": {
    "next-intl": "^4.7.0" // Already installed
  }
}
```

No new dependencies required. Uses:

- Cloudflare's built-in IP geolocation (free)
- Existing next-intl infrastructure
- Native cookie APIs

---

## 11. Success Metrics

| Metric                        | Baseline | Month 1 | Month 3 | Month 6 |
| ----------------------------- | -------- | ------- | ------- | ------- |
| Supported Languages           | 2        | 5       | 7       | 7+      |
| Localized pSEO Pages          | 188      | 350     | 500     | 600     |
| International Organic Traffic | 15%      | 25%     | 40%     | 50%     |
| hreflang Errors (GSC)         | 0        | 0       | 0       | 0       |
| Geo-suggestion Acceptance     | N/A      | 15%     | 20%     | 25%     |
| Non-EN Conversions            | 10%      | 15%     | 25%     | 35%     |

---

## 12. Future Expansion (Out of Scope)

After 7 languages stable:

1. Add ZH (Chinese), KO (Korean), RU (Russian) - Asian market expansion
2. Add AR (Arabic) with RTL support
3. Add HI (Hindi), ID (Indonesian) - Emerging markets
4. Consider professional translation for high-value pages
5. Implement locale-specific pricing display
6. Add locale-specific testimonials/reviews

---

## Appendix A: Language Priority Matrix

| Language   | Code | Search Volume | Competitor Coverage | Priority |
| ---------- | ---- | ------------- | ------------------- | -------- |
| Portuguese | pt   | High          | Low (upscale.media) | P0       |
| German     | de   | High          | Medium              | P0       |
| French     | fr   | High          | Medium              | P0       |
| Italian    | it   | Medium        | Low                 | P1       |
| Japanese   | ja   | High          | Low                 | P1       |
| Korean     | ko   | Medium        | Low                 | P2       |
| Chinese    | zh   | Very High     | Medium              | P2       |
| Russian    | ru   | Medium        | Low                 | P2       |

---

## Appendix B: Country to Locale Mapping

```typescript
export const COUNTRY_LOCALE_MAP: Record<string, Locale> = {
  // Portuguese
  BR: 'pt',
  PT: 'pt',
  AO: 'pt',
  MZ: 'pt',

  // German
  DE: 'de',
  AT: 'de',
  CH: 'de',
  LI: 'de',

  // French
  FR: 'fr',
  BE: 'fr',
  CA: 'fr',
  CH: 'fr',
  LU: 'fr',

  // Italian
  IT: 'it',
  SM: 'it',
  VA: 'it',

  // Japanese
  JP: 'ja',

  // Spanish (already supported)
  ES: 'es',
  MX: 'es',
  AR: 'es',
  CO: 'es',
  CL: 'es',
  PE: 'es',
  VE: 'es',

  // Default to English for others
  // US, GB, AU, NZ, etc. → 'en' (default)
};
```

---

## Appendix C: Competitor Research Sources

Research conducted using:

- [Competitor i18n/pSEO Analysis](../research/competitor-i18n-pseo-analysis-2026-01-07.md)
- [Quick Reference Guide](../research/i18n-quick-reference.md)

Key competitors analyzed:

- upscale.media (22 languages, industry leader)
- picwish.com (11 languages, full localization)
- icons8.com (10 languages, ccTLD approach)
- bigjpg.com (13 languages, no hreflang)
- vanceai.com (4 languages, client-side only)

---

## Document Changelog

| Version | Date       | Author           | Changes              |
| ------- | ---------- | ---------------- | -------------------- |
| 1.0     | 2026-01-07 | Development Team | Initial PRD creation |
