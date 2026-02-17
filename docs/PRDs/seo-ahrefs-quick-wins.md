# SEO Quick Wins — Ahrefs + GSC Action Plan

**Based on:** Ahrefs + GSC analysis — 2026-02-17
**Status:** Active
**Scope:** Metadata optimization, cannibalization fixes, hreflang audit, internal linking

---

## Complexity Assessment

```
+3  Touches 10+ files (JSON data, metadata factory, page components, homepage)
+1  Data schema changes (JSON pSEO data files)
+1  External SEO/ranking signals affected
```

**Complexity: 5 → MEDIUM mode**

---

## Context

**Problem:** Despite having 337+ indexed pSEO pages, Google is splitting ranking signals across cannibalizing URLs, key cluster pages sit just outside page 1 (pos. 16–19), and the homepage has no internal links to pSEO pages — causing link equity to stagnate at the root.

**Files Analyzed:**

- `app/seo/data/tools.json` — pSEO tool pages (includes ai-image-upscaler, ai-photo-enhancer, transparent-background-maker)
- `app/seo/data/formats.json` — pSEO format pages (includes upscale-avif-images)
- `app/seo/data/free.json` — pSEO free category pages
- `app/(pseo)/free/page.tsx` — Free hub page (H1, body)
- `app/[locale]/(pseo)/tools/[slug]/page.tsx` — Locale tool page routes
- `app/[locale]/(pseo)/formats/[slug]/page.tsx` — Locale format page routes
- `lib/seo/metadata-factory.ts` — `generateCategoryMetadata()` for hub pages
- `lib/seo/hreflang-generator.ts` — Hreflang implementation
- `lib/seo/localization-config.ts` — LOCALIZED_CATEGORIES config
- `locales/de/tools.json` — German tool translations
- `client/components/pages/HomePageClient.tsx` — Homepage (no pSEO internal links)
- `app/[locale]/page.tsx` — Locale homepage metadata

**Current Behavior:**

- "ai image upscaler" at `/tools/ai-image-upscaler` + homepage both target this keyword — splitting signals
- "transparent png erstellen" and "transparenter hintergrund" split between `/tools/ai-background-remover` and `/de/tools/transparent-background-maker`
- `/tools/ai-photo-enhancer` has `primaryKeyword: "ai photo enhancer"` — missing "enhance quality" and "ai image quality enhancer free" in metaTitle
- `/free` hub page title is "Free AI Image Tools" — doesn't mention "no sign up" which is the converting keyword
- `/formats/upscale-avif-images` has metaTitle "Upscale AVIF Images - Next-Gen AVIF Enlarger" — generic, not optimized for "avif upscale" (pos. 8)
- German `/de/tools/transparent-background-maker` has existing translation but minimal uniqueIntro / expandedDescription in German
- Homepage (`HomePageClient.tsx`) has zero links to pSEO category pages
- Hreflang system is implemented and functional but needs verification that German/Spanish interactive tools render alternates

---

## Solution

**Approach:**

1. Add explicit canonical tags on the `/tools/ai-image-upscaler` pSEO page pointing to itself — ensuring Google consolidates signals there vs. homepage
2. Update metadata (metaTitle, metaDescription, secondaryKeywords) for the "enhance quality" cluster, AVIF page, and the cannibalization pair
3. Update the `/free` hub page title and H1 to incorporate "no sign up" converting keyword
4. Enhance the German `transparent-background-maker` translation with expanded German-language content (uniqueIntro, expandedDescription)
5. Add a "Popular Tools" or "Our Tools" section to the homepage with direct links to the 6 highest-value pSEO pages
6. Write and run audit test to verify hreflang presence for interactive tool pages across all locales

**Key Decisions:**

- **No new pages** — all fixes are metadata + content updates to existing pages
- **Canonical strategy**: Each pSEO page self-canonicalizes (already implemented via `generateMetadata` → `getCanonicalUrl`). The issue is the homepage also targets "image upscaler" in its title — fix via homepage title update, not canonical manipulation
- **Internal links**: Add to `HomePageClient.tsx`, not a new component — keeps changes focused
- **German content**: Update `locales/de/tools.json` — `uniqueIntro` and `expandedDescription` for transparent-background-maker

**Data Changes:** JSON edits to `app/seo/data/tools.json`, `app/seo/data/formats.json`. Translation edits to `locales/de/tools.json`.

---

## Integration Points Checklist

```markdown
**How will this feature be reached?**

- [x] Entry points: existing pSEO routes, homepage
- [x] Caller files: metadata-factory.ts reads from JSON data files
- [x] Registration: no new routes needed

**Is this user-facing?**

- [x] YES (partial) — internal linking on homepage is user-visible
- [x] SEO changes are crawler-facing (metadata, hreflang)

**Full user flow:**

1. Google crawls /tools/ai-image-upscaler → reads metaTitle (updated), canonical (self)
2. User searches "enhance quality image" → lands on /tools/ai-photo-enhancer (updated title/H1)
3. User searches "free upscaler no sign up" → lands on /free hub (updated title/H1)
4. User visits homepage → sees "Popular Tools" section → links to key pSEO pages
```

---

## Execution Phases

---

### Phase 1: Fix Cannibalization — Homepage Title + Canonical Consolidation

**User-visible outcome:** Google stops splitting "image upscaler" signals between homepage and `/tools/ai-image-upscaler` pSEO page.

**Root cause:** Homepage title is "AI Image Upscaler & Photo Enhancer | Enhance Quality Free Online" — it directly competes with `/tools/ai-image-upscaler` for the keyword "ai image upscaler." The fix is to move the homepage title toward the brand + enhancer angle, not upscaler.

**Files (3):**

- `locales/en/common.json` — update `meta.homepage.title` and `meta.homepage.description`
- `locales/de/common.json` — update German homepage title (same fix)
- `locales/fr/common.json` — update French homepage title

**Implementation:**

- [ ] Open `locales/en/common.json`, locate `meta.homepage.title`
- [ ] Change title from `"AI Image Upscaler & Photo Enhancer | Enhance Quality Free Online"` to `"AI Photo Enhancer & Image Upscaler — Free Online | MyImageUpscaler"`
  - **Why this works:** "AI Photo Enhancer" as the lead term + brand name — homepage becomes the brand/enhancer page, `/tools/ai-image-upscaler` becomes the "image upscaler" page
- [ ] Update `meta.homepage.description` to lead with enhance/brand value, not upscaling specifically:
  - From: `"Professional AI image enhancer that upscales photos to 4K..."`
  - To: `"Enhance, upscale, and restore photos with AI — free online. No sign up required. Works with JPEG, PNG, WebP, AVIF. 4K results in seconds."`
- [ ] Repeat equivalent changes in `locales/de/common.json` and `locales/fr/common.json`
- [ ] For the German "transparenter hintergrund" cannibalization (between `/de/tools/ai-background-remover` and `/de/tools/transparent-background-maker`): ensure `ai-background-remover` focuses on "hintergrund entfernen" and `transparent-background-maker` focuses on "transparenter hintergrund / transparentes PNG erstellen" — check secondaryKeywords in `locales/de/tools.json` and remove overlap

**Tests Required:**

| Test File                                     | Test Name                                                                                          | Assertion                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `tests/unit/seo/cannibalization.unit.spec.ts` | `homepage title should not lead with "image upscaler"`                                             | `expect(homepageTitle).not.toMatch(/^ai image upscaler/i)` |
| `tests/unit/seo/cannibalization.unit.spec.ts` | `ai-image-upscaler page has self-canonical`                                                        | canonical URL === `BASE_URL + /tools/ai-image-upscaler`    |
| `tests/unit/seo/cannibalization.unit.spec.ts` | `German transparent-background-maker has no overlapping primaryKeyword with ai-background-remover` | primaryKeywords differ between the two German pages        |

**Verification Plan:**

1. **Unit Tests:** Run new `cannibalization.unit.spec.ts`
2. **Manual:** `yarn build && grep "AI Photo Enhancer" .next/server/app/en/index.html` should return the updated title

---

### Phase 2: Optimize "Enhance Quality" Cluster Page

**User-visible outcome:** `/tools/ai-photo-enhancer` title tag and H1 include "AI image quality enhancer free" — aligning with the 4 keywords at pos. 16–19.

**Files (1):**

- `app/seo/data/tools.json` — update `ai-photo-enhancer` entry

**Implementation:**

- [ ] Open `app/seo/data/tools.json`, find `"slug": "ai-photo-enhancer"`
- [ ] Update `metaTitle`:
  - From: `"AI Photo Enhancer - Fix Blurry Photos & Restore Old Images"`
  - To: `"AI Image Quality Enhancer Free — Fix Blur & Enhance Photos Online"` (67 chars ✓)
- [ ] Update `metaDescription`:
  - From: `"Enhance photo quality. Fix blur, improve colors, reduce noise..."`
  - To: `"Free AI image quality enhancer. Fix blur, reduce noise, restore old photos, and enhance image quality online. No sign up. Instant HD results."` (143 chars ✓)
- [ ] Update `h1`:
  - From: `"AI Photo Enhancer - Fix Blurry Photos & Restore Image Quality"`
  - To: `"AI Image Quality Enhancer — Fix Blur & Enhance Photos Free"` (58 chars ✓)
- [ ] Add to `secondaryKeywords` array: `"enhance quality"`, `"enhance quality image"`, `"quality enhancer"`, `"ai image quality enhancer free"`, `"image quality enhancer"`
- [ ] Update `primaryKeyword` to `"ai image quality enhancer free"` (this is the keyword with "free" that most searchers add)

**Note on internal links:** Phase 5 (homepage) will add links to this page. The `/free` hub will also need a link — handled in Phase 3.

**Tests Required:**

| Test File                                            | Test Name                                               | Assertion                                                 |
| ---------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `tests/unit/seo/page-metadata.unit.spec.ts`          | `ai-photo-enhancer metaTitle includes quality enhancer` | `expect(metaTitle).toMatch(/quality enhancer/i)`          |
| `tests/unit/seo/page-metadata.unit.spec.ts`          | `ai-photo-enhancer metaTitle ≤ 70 chars`                | `expect(metaTitle.length).toBeLessThanOrEqual(70)`        |
| `tests/unit/seo/page-metadata.unit.spec.ts`          | `ai-photo-enhancer metaDescription ≤ 160 chars`         | `expect(metaDescription.length).toBeLessThanOrEqual(160)` |
| `tests/unit/seo/pseo-keyword-alignment.unit.spec.ts` | existing keyword alignment test                         | should pass with updated primaryKeyword                   |

**Verification Plan:**

1. **Unit Tests:** Existing `pseo-keyword-alignment.unit.spec.ts` + new metadata length assertions
2. **Manual:** Navigate to `/tools/ai-photo-enhancer` in dev — check `<title>` and `<h1>` in browser DevTools

---

### Phase 3: Optimize /free Hub Page

**User-visible outcome:** `/free` hub page has a compelling title tag and H1 that captures "free upscaler no sign up" searches.

**Files (2):**

- `lib/seo/metadata-factory.ts` — update `categoryTitles['free']` and `categoryDescriptions['free']`
- `app/(pseo)/free/page.tsx` — update H1 and description paragraph

**Implementation:**

- [ ] Open `lib/seo/metadata-factory.ts`, locate the `categoryTitles` record
- [ ] Update `free` entry:
  - From: `` `Free AI Image Tools | ${APP_NAME}` ``
  - To: `` `Free AI Image Upscaler — No Sign Up Required | ${APP_NAME}` `` (52 chars before brand ✓)
- [ ] Update `categoryDescriptions['free']`:
  - From: `'Free AI image tools with no credit card or sign-up required...'`
  - To: `'Free AI image upscaler and enhancer — no sign up, no credit card. Upscale, enhance, and remove backgrounds instantly. Start with 10 free credits.'`
- [ ] Open `app/(pseo)/free/page.tsx`
- [ ] Update the `<h1>` from `"Free AI Image Tools"` to `"Free AI Image Upscaler — No Sign Up Required"`
- [ ] Update the `<p>` subtitle from `"Professional AI tools - Free to try with 10 credits, no credit card required"` to `"Upscale, enhance, and transform images free. No account needed to start — just upload and go."`

**Tests Required:**

| Test File                                   | Test Name                                 | Assertion                                                  |
| ------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `tests/unit/seo/page-metadata.unit.spec.ts` | `free category title includes no sign up` | `expect(freeCategoryTitle).toMatch(/no sign up/i)`         |
| `tests/unit/seo/page-metadata.unit.spec.ts` | `free category title ≤ 70 chars`          | `expect(freeCategoryTitle.length).toBeLessThanOrEqual(70)` |

**Verification Plan:**

1. **Unit Tests:** New assertions in `page-metadata.unit.spec.ts`
2. **Manual:** Navigate to `/free` in dev — verify title tag and H1

---

### Phase 4: Optimize AVIF Page

**User-visible outcome:** `/formats/upscale-avif-images` has a stronger title that targets the "avif upscale" keyword at pos. 8.

**Files (1):**

- `app/seo/data/formats.json` — update `upscale-avif-images` entry

**Implementation:**

- [ ] Open `app/seo/data/formats.json`, find `"slug": "upscale-avif-images"`
- [ ] Update `metaTitle`:
  - From: `"Upscale AVIF Images - Next-Gen AVIF Enlarger"`
  - To: `"AVIF Upscaler — Upscale AVIF Images Free Online"` (48 chars ✓)
  - **Why:** Leads with the format name that searchers type ("AVIF Upscaler" matches "avif upscale") and includes "Free Online" to reduce bounce
- [ ] Update `metaDescription`:
  - From: `"Enhance AVIF images with AI upscaling. Upscale next-generation AVIF files..."`
  - To: `"Upscale AVIF images online for free. AI-powered enlarger preserves AVIF format quality while increasing resolution up to 8x. No watermarks, instant results."` (157 chars ✓)
- [ ] Update `h1`:
  - From: `"Upscale AVIF Images - Next-Generation Format Enhancement"`
  - To: `"AVIF Upscaler — Enhance AVIF Image Resolution Free"` (51 chars ✓)
- [ ] Add to `secondaryKeywords`: `"avif upscale"`, `"avif image enlarger online"`, `"upscale avif free"`
- [ ] Update `primaryKeyword` to `"avif upscaler"` (exact match to what people search)

**Tests Required:**

| Test File                                   | Test Name                             | Assertion                                          |
| ------------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| `tests/unit/seo/page-metadata.unit.spec.ts` | `avif page metaTitle leads with AVIF` | `expect(metaTitle).toMatch(/^avif upscaler/i)`     |
| `tests/unit/seo/page-metadata.unit.spec.ts` | `avif metaTitle ≤ 70 chars`           | `expect(metaTitle.length).toBeLessThanOrEqual(70)` |

**Verification Plan:**

1. **Unit Tests:** New assertions in `page-metadata.unit.spec.ts`
2. **Manual:** Navigate to `/formats/upscale-avif-images` in dev — verify `<title>` tag

---

### Phase 5: Enhance German Transparent Background Page

**User-visible outcome:** `/de/tools/transparent-background-maker` has expanded German content (uniqueIntro + expandedDescription) to compete for "transparenter hintergrund" cluster at pos. 91–97.

**Files (1):**

- `locales/de/tools.json` — expand `transparent-background-maker` translation

**Implementation:**

- [ ] Open `locales/de/tools.json`, find `"slug": "transparent-background-maker"`
- [ ] Add or update `uniqueIntro` (German language, min 200 words) targeting:
  - "transparenter hintergrund" — the state users want
  - "PNG hintergrund transparent" — the exact action
  - "transparentes PNG erstellen" — the output format

  Example content direction (must be native German, not translated English):

  ```
  Transparente Hintergründe sind in der modernen digitalen Gestaltung unverzichtbar. Ob Logo-Designer, E-Commerce-Verkäufer oder Web-Entwickler — ein transparentes PNG ermöglicht nahtlose Integration in jede Umgebung. Unser KI-Tool erkennt Bildinhalte automatisch und erstellt saubere transparente PNGs in Sekunden: ohne Anmeldung, ohne Wasserzeichen. Laden Sie einfach Ihr Bild hoch und erhalten Sie ein professionelles PNG mit transparentem Hintergrund zum sofortigen Download.
  ```

- [ ] Add or update `expandedDescription` (German language, min 300 words) with:
  - Technical detail about the AI process in German
  - Use cases specific to German-language users (DACH market)
  - Mention "PNG erstellen" and "Hintergrund entfernen" naturally throughout
- [ ] Verify `primaryKeyword` in the German entry is `"transparenter hintergrund maker"` ✓ (already correct)
- [ ] Verify `secondaryKeywords` includes `"png hintergrund transparent"` and `"transparentes png erstellen"` — add if missing

**Tests Required:**

| Test File                                         | Test Name                                                       | Assertion                                                                |
| ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `tests/unit/seo/german-page-content.unit.spec.ts` | `German transparent-bg page has uniqueIntro`                    | `expect(dePage.uniqueIntro).toBeTruthy()`                                |
| `tests/unit/seo/german-page-content.unit.spec.ts` | `German uniqueIntro contains transparenter hintergrund keyword` | `expect(dePage.uniqueIntro).toMatch(/transparente[rn]?\s+hintergrund/i)` |
| `tests/unit/seo/german-page-content.unit.spec.ts` | `German uniqueIntro is min 100 chars`                           | `expect(dePage.uniqueIntro.length).toBeGreaterThan(100)`                 |

**Verification Plan:**

1. **Unit Tests:** New `german-page-content.unit.spec.ts`
2. **Manual:** Navigate to `/de/tools/transparent-background-maker` in dev — verify the expanded German content renders in the page body (check the `ToolPageTemplate` renders `uniqueIntro`)

---

### Phase 6: Audit and Verify Hreflang

**User-visible outcome:** Confirm hreflang tags render correctly for all language pages, especially interactive tools (`transparent-background-maker`, `ai-background-remover`) across de/es/fr/it/ja locales.

**Root cause:** The hreflang system is implemented, but it's unclear if interactive tool pages (`isInteractive: true`) render alternates correctly — they use `InteractiveToolPageTemplate` which may behave differently.

**Files (2):**

- `app/[locale]/(pseo)/tools/[slug]/page.tsx` — verify `HreflangLinks` renders for interactive tools
- `tests/unit/seo/hreflang-interactive-tools.unit.spec.ts` — new audit test

**Implementation:**

- [ ] Read `app/[locale]/(pseo)/tools/[slug]/page.tsx` — confirm `HreflangLinks` renders regardless of `isInteractive` flag (it should — both templates render the same wrapper, hreflang is outside the template). If missing, add.
- [ ] Read `client/components/seo/HreflangLinks.tsx` — confirm it calls `generateHreflangAlternates` with `category` param (required for locale filtering)
- [ ] Write `hreflang-interactive-tools.unit.spec.ts` that:
  - Imports `generateHreflangAlternates` from `lib/seo/hreflang-generator`
  - For `transparent-background-maker` in `tools` category, asserts that alternates include `de`, `es`, `fr`, `it`, `ja`, `pt`
  - Asserts `x-default` points to `https://myimageupscaler.com/tools/transparent-background-maker`
  - Asserts `de` alternate points to `https://myimageupscaler.com/de/tools/transparent-background-maker`

**Tests Required:**

| Test File                                                | Test Name                                      | Assertion                                                                                |
| -------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `tests/unit/seo/hreflang-interactive-tools.unit.spec.ts` | `transparent-background-maker has de hreflang` | `expect(alternates.de).toBe(BASE_URL + '/de/tools/transparent-background-maker')`        |
| `tests/unit/seo/hreflang-interactive-tools.unit.spec.ts` | `transparent-background-maker has x-default`   | `expect(alternates['x-default']).toBe(BASE_URL + '/tools/transparent-background-maker')` |
| `tests/unit/seo/hreflang-interactive-tools.unit.spec.ts` | `all 7 locales present for tools category`     | `expect(Object.keys(alternates)).toHaveLength(8)` (7 locales + x-default)                |

**Verification Plan:**

1. **Unit Tests:** New `hreflang-interactive-tools.unit.spec.ts`
2. **Manual:** In browser DevTools on `/de/tools/transparent-background-maker` — search `<head>` for `hreflang` — verify all 7 locale alternates are present

---

### Phase 7: Fix Internal Linking — Homepage → pSEO Pages

**User-visible outcome:** Homepage shows a "Popular Tools" grid section with direct links to the 6 highest-value pSEO pages, allowing link equity to flow from the root.

**Files (1):**

- `client/components/pages/HomePageClient.tsx` — add "Popular Tools" section

**Implementation:**

- [ ] Open `client/components/pages/HomePageClient.tsx`
- [ ] Identify the best insertion point — below the main CTA section, above or after the testimonials/pricing area
- [ ] Add a static "Popular Tools" section with anchor links to these 6 pages:

  ```typescript
  const POPULAR_TOOLS = [
    {
      href: '/tools/ai-image-upscaler',
      label: 'AI Image Upscaler',
      desc: 'Enlarge to 4K without quality loss',
    },
    {
      href: '/tools/ai-photo-enhancer',
      label: 'Image Quality Enhancer',
      desc: 'Fix blur, noise & restore photos free',
    },
    {
      href: '/tools/transparent-background-maker',
      label: 'Transparent Background Maker',
      desc: 'Remove backgrounds, create PNG',
    },
    {
      href: '/formats/upscale-avif-images',
      label: 'AVIF Upscaler',
      desc: 'Upscale next-gen AVIF format images',
    },
    { href: '/free', label: 'Free Tools', desc: 'No sign up — start with 10 free credits' },
    {
      href: '/tools/ai-background-remover',
      label: 'AI Background Remover',
      desc: 'Remove image backgrounds instantly',
    },
  ] as const;
  ```

- [ ] Render this as a 2×3 or 3×2 grid using existing Tailwind classes from the codebase (match existing card styles)
- [ ] Use Next.js `<Link>` (not `<a>`) for all hrefs — this ensures proper client-side routing
- [ ] Add a heading: "Popular Tools" or "Start Enhancing — Pick a Tool" with an `<h2>` tag
- [ ] Section should be above the fold on desktop or 1 scroll — max 1 section below the main upscaler

**Tests Required:**

| Test File                                             | Test Name                                                | Assertion                                                           |
| ----------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| `tests/unit/seo/homepage-internal-links.unit.spec.ts` | `homepage contains link to ai-image-upscaler`            | HTML snapshot contains `href="/tools/ai-image-upscaler"`            |
| `tests/unit/seo/homepage-internal-links.unit.spec.ts` | `homepage contains link to free hub`                     | HTML snapshot contains `href="/free"`                               |
| `tests/unit/seo/homepage-internal-links.unit.spec.ts` | `homepage contains link to transparent-background-maker` | HTML snapshot contains `href="/tools/transparent-background-maker"` |

**Verification Plan:**

1. **Unit Tests:** New `homepage-internal-links.unit.spec.ts` using `@testing-library/react` to render `HomePageClient` and assert link presence
2. **Manual:** Open homepage in dev — verify "Popular Tools" section is visible with correct links
3. **Manual (Lighthouse):** Run `yarn build && yarn start` then check that homepage outbound links are detected

---

## 5. Acceptance Criteria

- [ ] Phase 1 complete: Homepage title no longer leads with "image upscaler" — distinct from pSEO page
- [ ] Phase 2 complete: `/tools/ai-photo-enhancer` metaTitle contains "quality enhancer" or "enhance quality"
- [ ] Phase 3 complete: `/free` hub title contains "no sign up"
- [ ] Phase 4 complete: `/formats/upscale-avif-images` title leads with "AVIF Upscaler"
- [ ] Phase 5 complete: German `transparent-background-maker` has uniqueIntro and expandedDescription in German (>100 chars each)
- [ ] Phase 6 complete: `hreflang-interactive-tools.unit.spec.ts` passes — all 7 locales present for `transparent-background-maker`
- [ ] Phase 7 complete: Homepage has 6 internal links to pSEO pages
- [ ] All tests pass (`yarn test`)
- [ ] `yarn verify` passes
- [ ] All automated checkpoint reviews passed

---

## 6. Test File Summary

New test files to create:

| File                                                     | Phase   | Focus                                                                   |
| -------------------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `tests/unit/seo/cannibalization.unit.spec.ts`            | 1       | Homepage title ≠ "image upscaler", self-canonical for ai-image-upscaler |
| `tests/unit/seo/page-metadata.unit.spec.ts`              | 2, 3, 4 | metaTitle/metaDescription length and keyword assertions                 |
| `tests/unit/seo/german-page-content.unit.spec.ts`        | 5       | German page has uniqueIntro with target keywords                        |
| `tests/unit/seo/hreflang-interactive-tools.unit.spec.ts` | 6       | Hreflang alternates for interactive tools across all locales            |
| `tests/unit/seo/homepage-internal-links.unit.spec.ts`    | 7       | Homepage contains 6 pSEO internal links                                 |

---

## 7. Checkpoint Protocol

After each phase, run:

```bash
yarn verify
```

Then spawn the `prd-work-reviewer` agent:

```
Review checkpoint for phase [N] of PRD at docs/PRDs/seo-ahrefs-quick-wins.md
```

Continue to next phase only when reviewer reports **PASS**.

---

## 8. Notes for Implementation

### On metaTitle limits

The codebase enforces max 70 chars via `enforceMetaLengths()` in `lib/seo/meta-generator.ts`. All proposed titles in this PRD are pre-verified within the limit.

### On the /free hub hreflang

The `/free` category is in `LOCALIZED_CATEGORIES` — meaning hreflang alternates are generated for all 7 locales. The hub page title change in `metadata-factory.ts` affects English only (`locale = 'en'` default). Locale-specific translations should be updated separately in `locales/{locale}/common.json` if they have `meta.free` keys; otherwise the English fallback applies.

### On the homepage locale page

The `app/[locale]/page.tsx` loads homepage metadata from `locales/{locale}/common.json` → `meta.homepage.title`. The fix in Phase 1 targets these JSON files directly — no code changes needed in the page file.

### On German content quality

The German uniqueIntro and expandedDescription must be **native German** — not translated English. The existing German translation for this page (`locales/de/tools.json`) already has a partial translation. Phase 5 extends it. Consider using the `translator` agent to generate high-quality German content if writing natively is not feasible.
