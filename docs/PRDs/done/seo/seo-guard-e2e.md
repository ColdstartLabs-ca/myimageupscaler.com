# PRD: SEO Guard E2E Test Suite

**Complexity: 5 → MEDIUM mode**

- Touches 4-5 files (+2)
- New test file from scratch (+2)
- Script modification (+1)

---

## 1. Context

**Problem:** There is no single, unified "SEO guard" test that blocks deployments when SEO regressions are introduced. Existing SEO tests are scattered across multiple files and not all run pre-deploy. A single broken canonical URL, missing hreflang, or dropped sitemap can tank rankings for weeks before being noticed.

**Files Analyzed:**

- `tests/e2e/seo/metadata.e2e.spec.ts` - Existing hreflang/canonical tests (6 tests)
- `tests/e2e/seo/sitemap-duplicates.e2e.spec.ts` - Sitemap duplicate checks (4 tests)
- `tests/e2e/landing-page-seo.e2e.spec.ts` - Landing page SEO tests (16 tests)
- `tests/e2e/seo-redirects.e2e.spec.ts` - Redirect + tracking param cleanup (14 tests)
- `tests/e2e/pseo-new-categories.e2e.spec.ts` - pSEO category verification (~30 tests)
- `tests/e2e/pseo-locale-rendering.e2e.spec.ts` - Locale rendering checks (8 tests)
- `scripts/deploy/deploy.sh` - Deploy pipeline
- `package.json` - Scripts configuration
- `app/robots.ts` - Robots.txt config
- `app/sitemap.xml/route.ts` - Sitemap index (82 entries)
- `lib/seo/localization-config.ts` - 10 localized + 9 English-only categories
- `i18n/config.ts` - 7 supported locales
- `app/[locale]/layout.tsx` - Root metadata + JSON-LD

**Current Behavior:**

- `yarn deploy` runs `yarn test` (all unit + API + E2E chromium tests)
- No dedicated pre-deploy SEO gate exists
- SEO tests run as part of the full E2E suite but aren't isolated or prioritized
- No robots.txt or sitemap index structure validation in E2E tests
- No check that critical pages return 200 with correct meta tags

---

## 2. Solution

**Approach:**

- Create a single comprehensive `tests/e2e/seo-guard.e2e.spec.ts` file that consolidates all critical SEO checks into one test suite
- Add a `test:seo-guard` script in `package.json` that runs ONLY this test file
- Hook into `deploy.sh` as a dedicated pre-deploy gate (independent of `--skip-tests`)
- The test hits the local dev server (same as existing e2e tests) and validates everything a search engine cares about
- Fail fast - any SEO regression blocks deploy

**Key Decisions:**

- [x] Playwright E2E (same framework as existing tests)
- [x] Runs against local dev server (no production dependency)
- [x] Single file, ~15 test groups covering all SEO dimensions
- [x] Uses `request` context (no browser needed) for most checks → fast
- [x] Dedicated `yarn test:seo-guard` command + deploy gate

**Integration Points:**

```
How will this feature be reached?
- [x] Entry point: `yarn test:seo-guard` script → `playwright test tests/e2e/seo-guard.e2e.spec.ts`
- [x] Caller: `scripts/deploy/deploy.sh` (new SEO guard step after existing test step)
- [x] Registration: New script in package.json, new block in deploy.sh

Is this user-facing?
- [x] NO → Internal CI/deploy gate

Full flow:
1. Developer runs `yarn deploy`
2. After tests pass, deploy.sh runs `yarn test:seo-guard`
3. Playwright launches against local server, validates all SEO invariants
4. If ANY check fails → deploy is BLOCKED with clear error message
5. Developer fixes the regression, re-deploys
```

---

## 3. Test Coverage Matrix

The SEO guard validates these dimensions against the **live local server**:

| #   | Check Category                   | What It Validates                                                                       | Method                                     |
| --- | -------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | **Robots.txt**                   | Returns 200, allows `/`, disallows `/api/`, `/dashboard/`, has sitemap reference        | `request.get`                              |
| 2   | **Sitemap Index**                | Returns valid XML, has 82 sitemaps, all expected categories present                     | `request.get`                              |
| 3   | **Sitemap Validity**             | Sample sitemaps return 200, valid XML with `<urlset>`, have `<loc>` entries             | `request.get`                              |
| 4   | **Sitemap No Duplicates**        | No URL appears in more than one sitemap                                                 | `request.get` all sitemaps                 |
| 5   | **Homepage Meta**                | Title, description, canonical, OG tags, twitter card, JSON-LD schema present            | `page.goto('/')`                           |
| 6   | **Homepage Hreflang**            | All 7 locales + x-default present with correct URLs                                     | `page.goto('/')`                           |
| 7   | **Homepage Heading Structure**   | Single H1, multiple H2s, proper hierarchy                                               | `page.goto('/')`                           |
| 8   | **pSEO Tool Page Meta (EN)**     | Title, description, canonical, OG:locale=en_US, JSON-LD SoftwareApplication             | `page.goto('/tools/ai-image-upscaler')`    |
| 9   | **pSEO Tool Page Meta (Locale)** | Canonical points to locale URL, OG:locale correct, hreflang all present                 | `page.goto('/es/tools/ai-image-upscaler')` |
| 10  | **Critical Pages 200**           | Sample pages from each pSEO category return 200                                         | `request.get`                              |
| 11  | **Canonical Consistency**        | Canonical never contains localhost, tracking params, or trailing slashes inconsistently | `page.goto` sample pages                   |
| 12  | **SEO Redirects**                | Legacy URLs redirect (301), UTM params stripped, functional params preserved            | `page.goto`                                |
| 13  | **Locale Sitemaps**              | Locale-specific sitemaps exist and return valid XML for localized categories            | `request.get`                              |
| 14  | **JSON-LD Schema**               | Homepage has WebSite + Organization schema, tool pages have SoftwareApplication         | `page.goto`                                |
| 15  | **404 Handling**                 | Invalid slugs return 404 (not 500), 404 page has proper structure                       | `page.goto`                                |
| 16  | **No Index Leaks**               | Dashboard, API routes not indexable (not in sitemap, robots disallowed)                 | cross-check                                |

---

## 4. Execution Phases

### Phase 1: Create SEO Guard Test File

**Files (2):**

- `tests/e2e/seo-guard.e2e.spec.ts` - New comprehensive test file
- `package.json` - Add `test:seo-guard` script

**Implementation:**

- [ ] Create `tests/e2e/seo-guard.e2e.spec.ts` with all 16 check categories
- [ ] Add `"test:seo-guard": "playwright test tests/e2e/seo-guard.e2e.spec.ts --project=chromium"` to package.json scripts
- [ ] Test file uses `test.describe.serial` where order matters and parallel where it doesn't
- [ ] Use `request` API context for HTTP-only checks (faster than browser)
- [ ] Use `page` for checks requiring DOM inspection (meta tags, hreflang, heading structure)

**Test Structure:**

```typescript
// tests/e2e/seo-guard.e2e.spec.ts

test.describe('SEO Guard - Deploy Blocker', () => {
  // Group 1: Robots.txt
  test.describe('Robots.txt', () => { ... });

  // Group 2: Sitemap Index Structure
  test.describe('Sitemap Index', () => { ... });

  // Group 3: Sitemap Validity (sample)
  test.describe('Sitemap Content Validity', () => { ... });

  // Group 4: Sitemap No Duplicates (critical subset)
  test.describe('Sitemap Duplicate Prevention', () => { ... });

  // Group 5-8: Homepage + pSEO page meta/hreflang/schema
  test.describe('Homepage SEO', () => { ... });
  test.describe('pSEO Page SEO - English', () => { ... });
  test.describe('pSEO Page SEO - Locale', () => { ... });

  // Group 9-10: Critical pages accessibility + canonical
  test.describe('Critical Pages Return 200', () => { ... });
  test.describe('Canonical URL Consistency', () => { ... });

  // Group 11: Redirects
  test.describe('SEO Redirects', () => { ... });

  // Group 12: Locale sitemaps
  test.describe('Locale Sitemaps', () => { ... });

  // Group 13: JSON-LD
  test.describe('Structured Data (JSON-LD)', () => { ... });

  // Group 14: 404 handling
  test.describe('404 Error Handling', () => { ... });

  // Group 15: No-index leaks
  test.describe('No-Index Leak Prevention', () => { ... });
});
```

**Tests Required:**

| Test File               | Test Name                                        | Assertion                                                       |
| ----------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `seo-guard.e2e.spec.ts` | `robots.txt is accessible and correct`           | status 200, contains Allow: /, Disallow: /api/, has sitemap URL |
| `seo-guard.e2e.spec.ts` | `sitemap index has all 82 sitemaps`              | count matches, all categories present                           |
| `seo-guard.e2e.spec.ts` | `sample sitemaps return valid XML`               | status 200, has urlset, has loc entries                         |
| `seo-guard.e2e.spec.ts` | `no duplicate URLs across sitemaps`              | URL→sitemap map has no duplicates                               |
| `seo-guard.e2e.spec.ts` | `homepage has required meta tags`                | title, description, canonical, OG, twitter                      |
| `seo-guard.e2e.spec.ts` | `homepage has all hreflang links`                | 7 locales + x-default                                           |
| `seo-guard.e2e.spec.ts` | `homepage has proper heading hierarchy`          | 1 H1, 2+ H2s                                                    |
| `seo-guard.e2e.spec.ts` | `EN tool page has correct meta/schema`           | canonical, OG:locale, JSON-LD                                   |
| `seo-guard.e2e.spec.ts` | `locale tool page has correct meta`              | locale-specific canonical, hreflang                             |
| `seo-guard.e2e.spec.ts` | `critical category pages return 200`             | status 200 for each category hub                                |
| `seo-guard.e2e.spec.ts` | `canonical URLs are clean`                       | no localhost, no tracking params                                |
| `seo-guard.e2e.spec.ts` | `legacy URLs redirect correctly`                 | 301 to new location                                             |
| `seo-guard.e2e.spec.ts` | `locale sitemaps exist for localized categories` | status 200, valid XML                                           |
| `seo-guard.e2e.spec.ts` | `JSON-LD schema present on key pages`            | WebSite, Organization, SoftwareApplication                      |
| `seo-guard.e2e.spec.ts` | `invalid slugs return 404`                       | status 404, not 500                                             |
| `seo-guard.e2e.spec.ts` | `private routes not in sitemap`                  | /dashboard/, /api/ absent from all sitemaps                     |

**Verification Plan:**

1. `yarn test:seo-guard` runs and all tests pass
2. `yarn verify` still passes

---

### Phase 2: Hook into Deploy Pipeline

**Files (2):**

- `scripts/deploy/deploy.sh` - Add SEO guard gate
- `package.json` - Ensure script is correct

**Implementation:**

- [ ] Add SEO guard block in `deploy.sh` AFTER the existing test block (line ~59) and BEFORE the build step
- [ ] The SEO guard runs independently - it does NOT respect `--skip-tests` (SEO is always enforced)
- [ ] Clear error messaging when SEO guard fails

**Deploy script addition (after existing test block, ~line 63):**

```bash
# SEO Guard - ALWAYS runs (cannot be skipped)
echo -e "${CYAN}▸ Running SEO guard...${NC}"
cd "$PROJECT_ROOT"

# Start dev server for SEO guard tests, run tests, stop server
if ! yarn test:seo-guard; then
    echo -e "${RED}✗ SEO guard failed. Deployment blocked.${NC}"
    echo -e "${YELLOW}  SEO regressions detected. Fix issues before deploying.${NC}"
    echo -e "${YELLOW}  Run 'yarn test:seo-guard' locally to debug.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ SEO guard passed${NC}"
echo ""
```

**Verification Plan:**

1. `yarn deploy --skip-tests` still runs SEO guard
2. A simulated SEO failure blocks deploy (test by temporarily breaking a check)
3. `yarn test:seo-guard` works standalone

---

## 5. Acceptance Criteria

- [ ] `yarn test:seo-guard` runs the SEO guard test suite (~30-40 individual tests)
- [ ] All tests pass against local dev server
- [ ] `yarn deploy` runs SEO guard as a mandatory gate (independent of `--skip-tests`)
- [ ] SEO guard failure blocks deployment with clear error message
- [ ] Test covers all 16 check categories from the matrix
- [ ] Test runtime < 60 seconds (uses `request` API for most checks)
- [ ] `yarn verify` passes
- [ ] No existing tests broken

---

## 6. Constants Reference (for implementation)

```typescript
// Locales: ['en', 'es', 'pt', 'de', 'fr', 'it', 'ja']
// Localized categories: tools, formats, free, guides, scale, alternatives, use-cases, format-scale, platform-format, device-use
// English-only categories: compare, platforms, bulk-tools, content, photo-restoration, camera-raw, industry-insights, device-optimization, ai-features
// English-only sitemap categories: static, blog + all English-only categories above
// Total sitemaps: 12 English-only + (10 localized × 1 EN + 10 × 6 non-EN) = 12 + 10 + 60 = 82
// Robots disallowed: /api/, /dashboard/, /admin/, /_next/, /private/, /*.json$, /success, /canceled
// Critical sample pages: /, /tools, /tools/ai-image-upscaler, /formats, /guides, /compare, /blog, /pricing
```
