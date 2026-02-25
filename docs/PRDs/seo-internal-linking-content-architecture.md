# PRD: Internal Linking & Content Architecture

**Based on:** SEO Health Report dated 2026-02-25 (`docs/SEO/reports/seo-report-2026-02-25.md`)
**Status:** Active
**Scope:** Fix internal link isolation between blog, pSEO pages, and homepage; address background-removal cannibalization; complete footer link coverage
**Internal Linking Score:** 23/100 (first measurement)
**Total Effort:** ~6-8 hours

---

## Complexity Assessment

```
+3  Touches 10+ files (blog posts, footer, homepage, pSEO data files)
+1  Content architecture decisions (cannibalization resolution)
+1  SEO-sensitive changes affecting link equity distribution
```

**Complexity: 5 → MEDIUM mode**

---

## Context

**Problem:** The site's three authority sources (homepage, blog posts, primary navigation) pass virtually zero equity into the 337-page pSEO ecosystem. The pSEO pages are connected to each other via the automated related-pages system, but they're isolated from everything else. Meanwhile, 6+ pages all target the same background-removal intent, splitting ranking signals.

**Diagnosis from the report:**

- Blog posts link to tool pages (good) but NEVER to pSEO category pages like `/scale/*`, `/free/*`, `/formats/*`, `/alternatives/*`
- Footer links cover 6 pSEO categories but miss `/free`, `/alternatives`, `/bulk-tools`, `/photo-restoration`
- 6 background-removal pages across 3 categories compete for the same queries
- No visible locale links on homepage (hreflang exists but no user-facing links to `/fr/`, `/de/`, etc.)

**Current State:**

- `client/components/layout/Footer.tsx`: Links to `/tools`, `/guides`, `/formats`, `/scale`, `/compare`, `/use-cases` — but NOT `/free` or `/alternatives`
- Blog posts (18 `.mdx` files in `content/blog/`): Link to tool pages via pSEO data `relatedBlogPosts` — but no blog post content contains contextual links to `/scale/upscale-to-4k`, `/free/free-background-remover`, etc.
- Background removal pages: `ai-background-remover`, `remove-bg`, `transparent-background-maker`, `image-cutout-tool` (tools), `free-background-remover` (free), `product-photo-background-removal`, `portrait-background-removal` (use-cases) — 7 pages total
- Homepage: Has `POPULAR_TOOLS` section (6 links) but no locale links and no locale switcher visibility beyond the flag dropdown in footer

---

## Solution

**Approach:**

1. Add contextual internal links from blog posts to relevant pSEO pages
2. Complete footer category coverage
3. Designate canonical pages for background-removal intent and add internal signals
4. Add visible locale homepage links for equity distribution to `/fr/`, `/de/`, etc.

**Key Decisions:**

- Blog → pSEO links will be added as contextual markdown links within existing blog post content (not automated/templated)
- Background-removal canonical: `/tools/ai-background-remover` (broadest intent) and `/tools/transparent-background-maker` (PNG-specific intent) are the two canonical pages. Other pages remain but link to these two.
- Footer gets `/free` and `/alternatives` added — not every minor category
- Locale links added as a visible section on homepage, not just hreflang

---

## Execution Phases

### Phase 1: Add Missing Footer Category Links (30 min)

**User-visible outcome:** Footer provides navigational access to `/free` and `/alternatives` — two high-value pSEO categories currently unreachable via global navigation.

**Files (1):**

- `client/components/layout/Footer.tsx`

**Implementation:**

- [ ] In the "Tools & Guides" section of the footer, add links to `/free` and `/alternatives`:
  ```typescript
  { href: '/free', label: 'Free Tools' },
  { href: '/alternatives', label: 'Tool Alternatives' },
  ```
- [ ] Fix the duplicate "Legal" section (lines 163-186 and 188-211 are identical) — remove the duplicate

**Tests Required:**

| Test File                                  | Test Name                             | Assertion                                            |
| ------------------------------------------ | ------------------------------------- | ---------------------------------------------------- |
| `tests/unit/seo/footer-links.unit.spec.ts` | `Footer should link to /free`         | Rendered footer HTML contains `href="/free"`         |
| `tests/unit/seo/footer-links.unit.spec.ts` | `Footer should link to /alternatives` | Rendered footer HTML contains `href="/alternatives"` |

**Verification:**

1. Run `yarn verify`
2. Manual: Check footer on any page for new links

---

### Phase 2: Blog → pSEO Contextual Linking Program (3 hours)

**User-visible outcome:** Blog posts distribute link equity to pSEO category pages, connecting the blog cluster to the broader pSEO ecosystem.

**Strategy:** Add 2-3 contextual internal links per blog post to relevant pSEO pages. Not every post needs links — focus on the highest-traffic posts and the most natural keyword matches.

**Files (~10-12 blog posts):**

- `content/blog/*.mdx` — posts that naturally relate to pSEO categories

**Implementation:**

Map each blog post to its most relevant pSEO pages and add contextual links within the existing content:

| Blog Post                                          | Target pSEO Link(s)                                                   | Context                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `how-to-upscale-images-without-losing-quality.mdx` | `/scale/upscale-to-4k`, `/free/ai-image-upscaler`                     | "For specific resolution guides, see our [4K upscaling guide](/scale/upscale-to-4k)" |
| `ai-image-enhancement-ecommerce-guide.mdx`         | `/use-cases/ecommerce-product-photos`, `/formats/upscale-jpeg-images` | Natural e-commerce cross-link                                                        |
| `best-ai-image-quality-enhancer.mdx` (if exists)   | `/tools/ai-photo-enhancer`, `/alternatives/*`                         | Tool comparison context                                                              |
| `restore-old-photos-ai-enhancement-guide.mdx`      | `/use-cases/photo-restoration`, `/guides/*`                           | Natural restoration link                                                             |
| Posts mentioning background removal                | `/tools/ai-background-remover`                                        | Canonical BG removal link                                                            |
| Posts mentioning free tools                        | `/free`                                                               | Hub page link                                                                        |

- [ ] For each blog post, read the content and identify 2-3 natural insertion points
- [ ] Add markdown links that flow naturally within the existing paragraph text
- [ ] Do NOT add a generic "Related Links" section — links should be contextual within sentences
- [ ] Ensure link text is descriptive (not "click here") and includes relevant keywords

**Tests Required:**

| Test File                                         | Test Name                                              | Assertion                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `tests/unit/seo/blog-internal-links.unit.spec.ts` | `At least 8 blog posts should contain pSEO page links` | Count posts with `/scale/`, `/free/`, `/formats/`, `/alternatives/`, `/use-cases/`, `/compare/` links >= 8 |
| `tests/unit/seo/blog-internal-links.unit.spec.ts` | `Blog posts should not link to zombie categories`      | No blog post contains `/ai-features/` links                                                                |

**Verification:**

1. Run `yarn verify`
2. Manual: Open 3 blog posts in browser → confirm contextual links render and navigate correctly

---

### Phase 3: Background-Removal Cannibalization Signals (1 hour)

**User-visible outcome:** Google receives clear signals about which pages are the canonical authorities for background-removal intent. Reduces internal competition.

**Root cause:** 7 pages across 3 categories all target "remove background" / "transparent background" intent:

- `/tools/ai-background-remover` — broadest intent ("remove background")
- `/tools/remove-bg` — duplicate of ai-background-remover
- `/tools/transparent-background-maker` — PNG-specific intent ("transparent PNG")
- `/tools/image-cutout-tool` — subject extraction variant
- `/free/free-background-remover` — free tier variant
- `/use-cases/product-photo-background-removal` — e-commerce variant
- `/use-cases/portrait-background-removal` — portrait variant

**Strategy:** Don't redirect or delete pages. Instead, add cross-links from secondary pages to the two canonical pages, and differentiate secondary page metadata to avoid keyword overlap.

**Files (3-5 pSEO data files):**

- `app/seo/data/tools.json` — update `remove-bg`, `image-cutout-tool` entries
- `app/seo/data/free.json` — update `free-background-remover` entry
- `app/seo/data/use-cases.json` — update both background removal entries

**Implementation:**

- [ ] In `tools.json`, update `remove-bg` to differentiate from `ai-background-remover`:
  - Change `metaTitle` to focus on "one-click" angle: `"One-Click Background Remover — Remove BG Instantly"`
  - Add to `relatedPages`: `["ai-background-remover", "transparent-background-maker"]`

- [ ] In `tools.json`, update `image-cutout-tool` to differentiate:
  - Change `metaTitle` to focus on "cutout/extract" angle: `"Image Cutout Tool — Extract Subjects From Photos"`
  - Add to `relatedPages`: `["ai-background-remover"]`

- [ ] In `free.json`, update `free-background-remover`:
  - Ensure `metaTitle` leads with "Free": `"Free Background Remover — No Sign Up Required"`
  - Add to `relatedPages`: `["ai-background-remover"]`

- [ ] In `use-cases.json`, ensure product-photo and portrait pages link back to the tools:
  - Add `relatedTools`: `["ai-background-remover", "transparent-background-maker"]`

- [ ] Verify that `primaryKeyword` does NOT overlap between pages in the same category — each page should target a distinct keyword variant

**Tests Required:**

| Test File                                     | Test Name                                                       | Assertion                                                                     |
| --------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `tests/unit/seo/cannibalization.unit.spec.ts` | `Background removal tools should have distinct primaryKeywords` | No two tools share the same primaryKeyword                                    |
| `tests/unit/seo/cannibalization.unit.spec.ts` | `Secondary BG removal pages should link to canonical pages`     | `remove-bg`, `image-cutout-tool` relatedPages include `ai-background-remover` |

**Verification:**

1. Run `yarn verify`
2. Manual: Navigate to `/tools/remove-bg` → confirm it shows related links to `/tools/ai-background-remover`

---

### Phase 4: Visible Locale Homepage Links (1 hour)

**User-visible outcome:** Homepage visually links to locale homepages (not just hreflang), distributing equity to `/fr/` (pos 27.4 — closest page to page 1), `/de/`, etc.

**Root cause:** Hreflang tags exist but pass no visible link equity. Google treats hreflang differently from internal links. The locale switcher exists in the footer but uses JavaScript navigation (not crawlable `<a>` tags).

**Files (1):**

- `client/components/pages/HomePageClient.tsx`

**Implementation:**

- [ ] Add a "Available in Your Language" or locale section near the bottom of the homepage (above footer):
  ```typescript
  const LOCALE_LINKS = [
    { href: '/de', label: 'Deutsch', flag: 'DE' },
    { href: '/es', label: 'Espanol', flag: 'ES' },
    { href: '/fr', label: 'Francais', flag: 'FR' },
    { href: '/it', label: 'Italiano', flag: 'IT' },
    { href: '/ja', label: '日本語', flag: 'JP' },
    { href: '/pt', label: 'Portugues', flag: 'BR' },
  ] as const;
  ```
- [ ] Render as a simple inline list with `<Link>` components (crawlable)
- [ ] Keep it subtle — a small section, not a prominent feature block
- [ ] These must be standard `<a>` / Next.js `<Link>` tags (not JavaScript-based navigation) so Googlebot can follow them

**Tests Required:**

| Test File                                           | Test Name                                           | Assertion                                                    |
| --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| `tests/unit/seo/homepage-locale-links.unit.spec.ts` | `Homepage should contain crawlable link to /fr`     | Rendered HTML contains `<a href="/fr"` or `<Link href="/fr"` |
| `tests/unit/seo/homepage-locale-links.unit.spec.ts` | `Homepage should contain crawlable link to /de`     | Rendered HTML contains `<a href="/de"`                       |
| `tests/unit/seo/homepage-locale-links.unit.spec.ts` | `Homepage should link to all 6 non-English locales` | 6 locale links present                                       |

**Verification:**

1. Run `yarn verify`
2. Manual: View page source on homepage → search for `/fr` → confirm it's a real `<a>` tag

---

## Acceptance Criteria

- [ ] Phase 1: Footer contains links to `/free` and `/alternatives`; duplicate Legal section removed
- [ ] Phase 2: At least 8 blog posts contain contextual links to pSEO category pages
- [ ] Phase 3: Background-removal pages have distinct primaryKeywords; secondary pages link to canonicals
- [ ] Phase 4: Homepage contains crawlable `<a>` links to all 6 non-English locale homepages
- [ ] All tests pass (`yarn test`)
- [ ] `yarn verify` passes

---

## Test File Summary

| File                                                | Phase | Focus                              |
| --------------------------------------------------- | ----- | ---------------------------------- |
| `tests/unit/seo/footer-links.unit.spec.ts`          | 1     | Footer category coverage           |
| `tests/unit/seo/blog-internal-links.unit.spec.ts`   | 2     | Blog → pSEO link presence          |
| `tests/unit/seo/cannibalization.unit.spec.ts`       | 3     | BG removal keyword differentiation |
| `tests/unit/seo/homepage-locale-links.unit.spec.ts` | 4     | Crawlable locale links             |

---

## Expected Impact

| Fix                   | Metric               | Expected Change                                                     |
| --------------------- | -------------------- | ------------------------------------------------------------------- |
| Footer + blog links   | Internal link score  | 23/100 → estimated 45/100                                           |
| Blog → pSEO links     | pSEO page indexation | Equity flows from 38 blog posts to pSEO ecosystem                   |
| BG removal signals    | Cannibalization      | 7 competing pages → 2 clear authorities + 5 differentiated variants |
| Locale homepage links | /fr/ position        | Pos 27.4 → potential page 1 with equity boost                       |

---

## Checkpoint Protocol

After each phase, run:

```bash
yarn verify
```

Then spawn the `prd-work-reviewer` agent to review checkpoint progress.
