# PRD: SEO Quick Wins — February 2026

**Based on:** SEO Health Report dated 2026-02-25 (`docs/SEO/reports/seo-report-2026-02-25.md`)
**Status:** Active
**Scope:** 3 quick fixes (15-30 min each) that unblock AI search readiness and improve navigation
**Total Effort:** ~2 hours

---

## Complexity Assessment

```
+1  Touches 3 files (robots.ts, llms-full.txt, NavBar.tsx)
+0  No data schema changes
+1  External SEO/AI crawl signals affected
```

**Complexity: 2 → LOW mode**

---

## Context

**Problem:** Three quick-win items from the Feb 25 SEO audit remain unaddressed:

1. AI bot rules are documented in comments but never implemented in robots.ts
2. llms-full.txt references zombie ai-features URLs (404s) and contradicts llms.txt on API key requirements
3. `/tools` as a browseable hub page is not in the primary navigation — only individual tools appear in a dropdown

**Current State:**

- `app/robots.ts`: Comments on lines 1-13 document intent to allow GPTBot, Google-Extended, etc. — but the only rule is a single wildcard `userAgent: '*'`. No explicit AI bot directives exist.
- `app/llms-full.txt/route.ts`: Lines 66-69 reference `/ai-features`, `/ai-features/ai-noise-reduction-upscaler`, `/ai-features/ai-sharpness-enhancement-upscaler`, `/ai-features/ai-face-enhancement-upscaler` — all return 404. Line 44 in llms.txt says "no API key required" while line 104 in llms-full.txt says "API key required."
- `client/components/navigation/NavBar.tsx`: Primary nav has Features, Blog, Resources (dropdown), Tools (dropdown with specific tools), Pricing, Support. The `/tools` hub page itself is not linked — only individual tool paths like `/tools/compress/image-compressor`.

---

## Execution Phases

### Phase 1: Add Explicit AI Bot Rules to robots.ts (15 min)

**User-visible outcome:** AI search engines (ChatGPT, Perplexity, Google SGE, Claude) receive explicit Allow signals, improving AEO/GEO inclusion probability.

**Files (1):**

- `app/robots.ts`

**Implementation:**

- [ ] Add named user-agent rules for AI bots after the existing wildcard rule:
  ```typescript
  rules: [
    {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/dashboard/',
        '/admin/',
        '/_next/',
        '/private/',
        '/*.json$',
        '/success',
        '/canceled',
      ],
    },
    // AI Search Engine Bots — explicitly allowed for AEO/GEO visibility
    {
      userAgent: 'GPTBot',
      allow: '/',
      disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
    },
    {
      userAgent: 'ChatGPT-User',
      allow: '/',
      disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
    },
    {
      userAgent: 'Google-Extended',
      allow: '/',
      disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
    },
    {
      userAgent: 'ClaudeBot',
      allow: '/',
      disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
    },
    {
      userAgent: 'PerplexityBot',
      allow: '/',
      disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
    },
    {
      userAgent: 'anthropic-ai',
      allow: '/',
      disallow: ['/api/', '/dashboard/', '/admin/', '/private/'],
    },
  ],
  ```
- [ ] Remove or update the header comments (lines 1-13) to reflect that the rules are now implemented, not just planned

**Tests Required:**

| Test File                            | Test Name                                              | Assertion                                                        |
| ------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------- |
| `tests/unit/seo/robots.unit.spec.ts` | `should have explicit GPTBot allow rule`               | Rules array includes entry with `userAgent: 'GPTBot'`            |
| `tests/unit/seo/robots.unit.spec.ts` | `should have explicit Google-Extended allow rule`      | Rules array includes entry with `userAgent: 'Google-Extended'`   |
| `tests/unit/seo/robots.unit.spec.ts` | `should have explicit ClaudeBot allow rule`            | Rules array includes entry with `userAgent: 'ClaudeBot'`         |
| `tests/unit/seo/robots.unit.spec.ts` | `AI bot rules should disallow /dashboard/ and /admin/` | All AI bot rules include `/dashboard/` and `/admin/` in disallow |

**Verification:**

1. Run `yarn verify`
2. Manual: `curl https://myimageupscaler.com/robots.txt` should show named AI bot rules

---

### Phase 2: Fix llms-full.txt (30 min)

**User-visible outcome:** AI search engines get accurate, non-broken URLs and consistent API information.

**Files (1):**

- `app/llms-full.txt/route.ts`

**Implementation:**

- [ ] Remove the ai-features section (lines 66-69) — these URLs return 404:

  ```typescript
  // REMOVE these lines:
  - ${BASE_URL}/ai-features - AI enhancement features
  - ${BASE_URL}/ai-features/ai-noise-reduction-upscaler - Noise reduction
  - ${BASE_URL}/ai-features/ai-sharpness-enhancement-upscaler - Sharpness enhancement
  - ${BASE_URL}/ai-features/ai-face-enhancement-upscaler - Face enhancement
  ```

- [ ] Replace the removed section with working special feature URLs:

  ```
  ## Special Features
  - ${BASE_URL}/tools/ai-background-remover - AI background removal
  - ${BASE_URL}/tools/transparent-background-maker - Create transparent PNGs
  ```

- [ ] Fix the API key contradiction (line 104). Match llms.txt (line 44) which says "no API key required for basic use":
  ```typescript
  // FROM:
  Authentication: API key required for production use
  // TO:
  Authentication: Free tier available, no API key required for basic use
  ```

**Tests Required:**

| Test File                              | Test Name                                                         | Assertion                                        |
| -------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| `tests/unit/seo/llms-txt.unit.spec.ts` | `llms-full.txt should not reference ai-features URLs`             | Response body does not contain `/ai-features`    |
| `tests/unit/seo/llms-txt.unit.spec.ts` | `llms.txt and llms-full.txt should have consistent API auth info` | Both contain "no API key required" or equivalent |

**Verification:**

1. Run `yarn verify`
2. Manual: `curl localhost:3000/llms-full.txt` should not contain `ai-features`

---

### Phase 3: Add /tools Hub Link to Primary Navigation (15 min)

**User-visible outcome:** Every page on the site links directly to `/tools` via the primary navigation, distributing link equity to 50+ tool pages.

**Files (1):**

- `client/components/navigation/NavBar.tsx`

**Implementation:**

The Tools dropdown currently shows individual tools (compressor, resizer, converter, background remover). The `/tools` hub page itself is not directly linked.

- [ ] Add a "All Tools" or "Browse All" link at the top of the Tools dropdown menu that points to `/tools`:

  ```typescript
  // Add as the first item in the Tools dropdown:
  { href: '/tools', label: 'All Tools', desc: 'Browse all image tools' }
  ```

  This preserves the existing dropdown structure while adding a direct `/tools` link.

- [ ] Alternatively, if the dropdown approach is too cluttered, add `/tools` as a standalone nav item (replacing the dropdown header):
  ```typescript
  // Change the Tools dropdown trigger from a non-link to a link:
  <Link href="/tools">Tools</Link>
  ```
  Keep the dropdown as a hover/click expansion for individual tools.

**Tests Required:**

| Test File                                | Test Name                                     | Assertion                                     |
| ---------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| `tests/unit/seo/navigation.unit.spec.ts` | `Primary nav should contain a link to /tools` | NavBar rendered HTML contains `href="/tools"` |

**Verification:**

1. Run `yarn verify`
2. Manual: Open any page → primary nav should have a clickable link to `/tools`

---

## Acceptance Criteria

- [ ] Phase 1: robots.txt contains explicit Allow rules for GPTBot, Google-Extended, ClaudeBot, PerplexityBot, anthropic-ai
- [ ] Phase 2: llms-full.txt contains no `/ai-features` URLs and API auth info matches llms.txt
- [ ] Phase 3: Primary navigation includes a direct link to `/tools`
- [ ] All tests pass (`yarn test`)
- [ ] `yarn verify` passes

---

## Test File Summary

| File                                     | Phase | Focus                                       |
| ---------------------------------------- | ----- | ------------------------------------------- |
| `tests/unit/seo/robots.unit.spec.ts`     | 1     | AI bot rules presence and disallow patterns |
| `tests/unit/seo/llms-txt.unit.spec.ts`   | 2     | No zombie URLs, consistent API auth info    |
| `tests/unit/seo/navigation.unit.spec.ts` | 3     | /tools link in primary nav                  |

---

## Expected Impact

| Fix           | Metric               | Expected Change                                                        |
| ------------- | -------------------- | ---------------------------------------------------------------------- |
| AI bot rules  | AEO/GEO score        | 51/100 → ~65/100; explicit signal for AI Overviews, ChatGPT search     |
| llms-full.txt | AI citation accuracy | Removes broken URLs that reduce AI trust in site data                  |
| /tools in nav | Internal link equity | All pages pass authority to /tools hub → distributes to 50+ tool pages |

---

## Items NOT Included (Already Resolved)

The following items from the report were investigated and found to be already addressed:

1. **fetchpriority="high" on LCP image** — Already implemented in `client/components/landing/HeroSection.tsx` (line 65: `fetchPriority="high"`)
2. **Empty sitemap-images.xml** — Not empty. It's a functional image sitemap in `app/sitemap-images.xml/route.ts` that generates entries from pSEO pages with ogImage
3. **Thin blog post `how-to-upscale-images-for-ecommerce`** — This post doesn't exist in `content/blog/`. May have been removed. The e-commerce topic is covered by 3 other posts.
4. **Future date `2026-12-06` in schema** — Not found in any data file. May have been in live cache only.

---

## Items Covered by Existing Active PRDs

These items from the report are already addressed in other active PRDs:

1. **German page title fix** → `docs/PRDs/gsc-technical-seo-fixes.md` Phase 4 + `docs/PRDs/seo-ahrefs-quick-wins.md` Phase 5
2. **French homepage CTR fix** → `docs/PRDs/gsc-technical-seo-fixes.md` Phase 3
3. **Homepage → pSEO internal links** → Already implemented (`POPULAR_TOOLS` in `HomePageClient.tsx` with 6 tool links)
4. **Hreflang verification** → `docs/PRDs/seo-ahrefs-quick-wins.md` Phase 6

---

## Non-Code Action Items (External)

These items from the report require manual/external work, not code changes:

1. **Backlink quality audit** — Verify the 75 referring domains in Ahrefs (editorial vs bulk directories)
2. **DR 30+ editorial placement** — Guest post or tool review on DR 30+ site
3. **Named human author with bio page** — Content/branding decision (E-E-A-T improvement)
4. **GSC data fetch script** — `scripts/gsc-direct-fetch.ts` for future audits (operational tooling)
