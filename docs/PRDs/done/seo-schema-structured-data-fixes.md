# PRD: Schema & Structured Data Fixes

**Based on:** SEO Health Report dated 2026-02-25 (`docs/SEO/reports/seo-report-2026-02-25.md`)
**Status:** Active
**Scope:** 5 schema bugs affecting rich result eligibility sitewide
**Schema Score:** 48/100 (unchanged since Jan 30 — these bugs are the reason)

---

## Complexity Assessment

```
+2  Touches 5 files (layout, blog page, pricing page, schema generator, pseo layout)
+1  Schema validation changes affect rich results sitewide
+1  AggregateRating decision requires manual judgment (spam risk)
```

**Complexity: 4 → MEDIUM mode**

---

## Context

**Problem:** 5 schema bugs suppress rich results across the majority of the site's pages. The Organization.logo bug alone affects ALL locale pages and all blog posts — blocking FAQPage, BreadcrumbList, and SoftwareApplication rich snippets. These are small, surgical fixes (2-line changes in most cases) with outsized SEO impact.

**Current State:**

- `app/[locale]/layout.tsx` emits Organization.logo as ImageObject (should be string URL)
- `app/[locale]/blog/[slug]/page.tsx` emits Organization.logo as ImageObject with wrong image (og-image.png instead of logo)
- `app/[locale]/layout.tsx` emits Organization without `@id` — conflicts with `schema-generator.ts` which uses `@id: "${BASE_URL}#organization"`
- `app/[locale]/pricing/page.tsx` emits JSON-LD twice (metadata.other + JSX script tag)
- `app/(pseo)/layout.tsx` uses `/blog?q=` for SearchAction; `app/[locale]/layout.tsx` uses `/search?q=` — and `/search` doesn't exist as a route
- `lib/seo/schema-generator.ts` hardcodes AggregateRating 4.8/5, 1,250 reviews on tool pages, homepage, and pricing — potential manual action risk if unverified

**Files Analyzed:**

- `app/[locale]/layout.tsx` — Organization schema with ImageObject logo (lines 111-121), SearchAction with `/search?q=` (line 105)
- `app/[locale]/blog/[slug]/page.tsx` — Publisher Organization with ImageObject logo (lines 198-205)
- `app/[locale]/pricing/page.tsx` — Double emission via metadata.other + JSX (lines 45-47, 54-59)
- `app/(pseo)/layout.tsx` — SearchAction with `/blog?q=` (line 87)
- `lib/seo/schema-generator.ts` — AggregateRating hardcoded at lines 148-150, 668-669, 813-815; Organization with @id at line 162

---

## Solution

**Approach:** Fix each bug individually in order of impact. All are surgical edits.

**Key Decisions:**

- Organization.logo → use plain string URL (matches schema-generator.ts pattern)
- Organization @id → add `@id: "${BASE_URL}#organization"` to layout-level entities
- Pricing page → remove metadata.other, keep JSX script tag
- SearchAction → standardize to `/blog?q=` since `/search` route doesn't exist
- AggregateRating → remove entirely unless real third-party review data can be sourced

---

## Integration Points Checklist

```
**How will this feature be reached?**
- [x] Entry points: All pages (layout), blog posts, pricing page, pSEO pages
- [x] Caller files: layouts are auto-applied by Next.js routing
- [x] Registration: no new routes or components needed

**Is this user-facing?**
- [x] NO → Schema changes are invisible to users. Crawlers see cleaner structured data.

**Full user flow:**
1. Google crawls any locale page → sees valid Organization with @id + string logo
2. Google validates FAQPage / BreadcrumbList → passes validation → enables rich snippets
3. Google crawls pricing page → sees single (not duplicate) pricing schema
4. Google interprets SearchAction → /blog?q= resolves correctly
```

---

## Execution Phases

### Phase 1: Fix Organization.logo Bug (2 files, HIGH impact)

**User-visible outcome:** Schema validation passes on ALL locale pages and blog posts. Unblocks FAQPage, BreadcrumbList, SoftwareApplication rich results.

**Files (2):**

- `app/[locale]/layout.tsx` — lines 116-119
- `app/[locale]/blog/[slug]/page.tsx` — lines 201-204

**Implementation:**

- [ ] In `app/[locale]/layout.tsx`, change the `logo` property from ImageObject to string URL:

  ```typescript
  // FROM:
  logo: {
    '@type': 'ImageObject',
    url: `${serverEnv.BASE_URL}/logo/horizontal-logo-full.png`,
  },
  // TO:
  logo: `${serverEnv.BASE_URL}/logo/horizontal-logo-full.png`,
  ```

- [ ] In `app/[locale]/blog/[slug]/page.tsx`, change the publisher `logo` from ImageObject to string URL, and fix the image path (use logo, not og-image):
  ```typescript
  // FROM:
  logo: {
    '@type': 'ImageObject',
    url: `${clientEnv.BASE_URL}/og-image.png`,
  },
  // TO:
  logo: `${clientEnv.BASE_URL}/logo/horizontal-logo-full.png`,
  ```

**Tests Required:**

| Test File                                       | Test Name                                                    | Assertion                                      |
| ----------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| `tests/unit/seo/schema-validation.unit.spec.ts` | `Organization.logo should be a string URL in locale layout`  | `expect(typeof org.logo).toBe('string')`       |
| `tests/unit/seo/schema-validation.unit.spec.ts` | `Organization.logo should be a string URL in blog posts`     | `expect(typeof publisher.logo).toBe('string')` |
| `tests/unit/seo/schema-validation.unit.spec.ts` | `Blog publisher logo should use the site logo, not og-image` | `expect(publisher.logo).toContain('logo/')`    |

**Verification:**

1. Run `yarn verify`
2. Manual: View page source on any locale page → find Organization JSON-LD → confirm `logo` is a plain string URL

---

### Phase 2: Fix Duplicate Organization Entities (1 file)

**User-visible outcome:** Google resolves a single Organization entity instead of two conflicting ones.

**Root cause:** `app/[locale]/layout.tsx` emits an Organization without `@id`. `schema-generator.ts` emits Organization with `@id: "${BASE_URL}#organization"`. Google sees two separate Organization entities.

**Files (1):**

- `app/[locale]/layout.tsx` — lines 111-121

**Implementation:**

- [ ] Add `@id` to the Organization in layout.tsx to match the schema-generator pattern:
  ```typescript
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${serverEnv.BASE_URL}#organization`, // ← ADD THIS
    name: APP_NAME,
    url: serverEnv.BASE_URL,
    logo: `${serverEnv.BASE_URL}/logo/horizontal-logo-full.png`,
    description: 'AI-powered image upscaling and enhancement platform',
  };
  ```

**Tests Required:**

| Test File                                       | Test Name                                                               | Assertion                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| `tests/unit/seo/schema-validation.unit.spec.ts` | `Layout Organization should have @id matching schema-generator pattern` | `expect(org['@id']).toBe(BASE_URL + '#organization')` |

**Verification:**

1. Run `yarn verify`
2. Manual: View page source on a tool page → count Organization blocks → both should have same `@id`

---

### Phase 3: Fix Pricing Page Double Schema Emission (1 file)

**User-visible outcome:** Pricing page emits schema once (not twice), reducing HTML payload and eliminating validator warnings.

**Files (1):**

- `app/[locale]/pricing/page.tsx` — lines 45-47

**Implementation:**

- [ ] Remove the `metadata.other` JSON-LD emission from `generateMetadata()`. Keep only the JSX `<script>` tag:
  ```typescript
  // REMOVE this from the return object in generateMetadata():
  other: {
    'application/ld+json': JSON.stringify(generatePricingSchema()),
  },
  ```

**Tests Required:**

| Test File                                       | Test Name                                                            | Assertion                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `tests/unit/seo/schema-validation.unit.spec.ts` | `Pricing generateMetadata should not emit schema via metadata.other` | `expect(metadata.other).not.toHaveProperty('application/ld+json')` |

**Verification:**

1. Run `yarn verify`
2. Manual: View page source on pricing page → search for `application/ld+json` → should appear exactly once

---

### Phase 4: Fix SearchAction URL Inconsistency (2 files)

**User-visible outcome:** SearchAction points to a real, functional URL consistently across all layouts.

**Root cause:** `app/[locale]/layout.tsx` uses `/search?q=` but `/search` doesn't exist as a route. `app/(pseo)/layout.tsx` uses `/blog?q=` which is more likely to work (blog listing exists).

**Files (2):**

- `app/[locale]/layout.tsx` — line 105
- `app/(pseo)/layout.tsx` — line 87 (already correct — `/blog?q=`)

**Implementation:**

- [ ] In `app/[locale]/layout.tsx`, change SearchAction target from `/search?q=` to `/blog?q=`:
  ```typescript
  // FROM:
  urlTemplate: `${serverEnv.BASE_URL}/search?q={search_term_string}`,
  // TO:
  urlTemplate: `${serverEnv.BASE_URL}/blog?q={search_term_string}`,
  ```

**Tests Required:**

| Test File                                       | Test Name                                                       | Assertion                        |
| ----------------------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| `tests/unit/seo/schema-validation.unit.spec.ts` | `SearchAction URL should be consistent across layouts`          | Both layouts point to `/blog?q=` |
| `tests/unit/seo/schema-validation.unit.spec.ts` | `SearchAction should not reference /search (nonexistent route)` | No layout contains `/search?q=`  |

**Verification:**

1. Run `yarn verify`
2. Manual: View page source on homepage and any pSEO page → SearchAction targets should match

---

### Phase 5: Audit AggregateRating (1 file, DECISION REQUIRED)

**User-visible outcome:** Either verified ratings backed by real data, or removal of fabricated schema (avoiding manual action risk).

**Root cause:** `lib/seo/schema-generator.ts` hardcodes `ratingValue: 4.8, ratingCount: 1250` on tool pages (line 148-150), homepage schema (line 668-669), and pricing schema (line 813-815). If these numbers aren't backed by real third-party verified reviews, this is schema spam.

**Files (1):**

- `lib/seo/schema-generator.ts` — lines 148-150, 668-669, 813-815

**Implementation (recommended: REMOVE):**

Unless real review data from a verified platform (Trustpilot, G2, Capterra) can be provided, remove all AggregateRating blocks:

- [ ] In `generateToolSchema()` (around line 148): remove the AggregateRating block
- [ ] In `generateHomepageSchema()` (around line 668): remove the AggregateRating block
- [ ] In `generatePricingSchema()` (around line 813): remove the AggregateRating block
- [ ] Search for any other `AggregateRating` references and remove

**Alternative (if real data exists):**

- [ ] Replace hardcoded values with actual review count and rating from Trustpilot/G2 API or verified export
- [ ] Add a comment documenting the data source

**Tests Required:**

| Test File                                       | Test Name                                             | Assertion                                       |
| ----------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `tests/unit/seo/schema-validation.unit.spec.ts` | `Schema should not contain hardcoded AggregateRating` | No function contains `ratingValue: 4.8` literal |

**Verification:**

1. Run `yarn verify`
2. Manual: View page source on tool page → confirm no AggregateRating (or confirm it shows real data)

---

## Acceptance Criteria

- [ ] Phase 1: Organization.logo is a plain string URL in both layout.tsx and blog page
- [ ] Phase 2: Layout Organization has `@id` matching `${BASE_URL}#organization`
- [ ] Phase 3: Pricing page emits JSON-LD exactly once (JSX only, not metadata.other)
- [ ] Phase 4: SearchAction URL is `/blog?q=` in both locale and pSEO layouts
- [ ] Phase 5: AggregateRating is either removed or backed by verified data source
- [ ] All tests pass (`yarn test`)
- [ ] `yarn verify` passes

---

## Test File Summary

| File                                            | Phases | Focus                                                                                                 |
| ----------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `tests/unit/seo/schema-validation.unit.spec.ts` | 1-5    | Organization.logo type, @id consistency, pricing double-emit, SearchAction URL, AggregateRating audit |

---

## Expected Impact

| Fix                      | Metric                   | Expected Change                                                      |
| ------------------------ | ------------------------ | -------------------------------------------------------------------- |
| Organization.logo string | Rich results eligibility | Unblocks FAQPage, BreadcrumbList snippets on all locale + blog pages |
| Organization @id         | Entity resolution        | Google merges duplicate Organization entities correctly              |
| Pricing single-emit      | Schema validation        | Clean output, no validator warnings                                  |
| SearchAction consistency | Sitelinks search box     | Functional search via `/blog?q=`                                     |
| AggregateRating audit    | Manual action risk       | Eliminates schema spam risk (or validates data)                      |

**Combined schema score improvement:** 48/100 → estimated 70/100 after all fixes.

---

## Checkpoint Protocol

After each phase, run:

```bash
yarn verify
```

Then spawn the `prd-work-reviewer` agent to review checkpoint progress.
