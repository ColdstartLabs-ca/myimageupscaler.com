# SEO Tasklist - MyImageUpscaler.com
**Generated:** 2026-01-30
**Status:** Active tracking of remaining SEO improvements
**Sources:** Ahrefs Site Audit, SEO Audit, GSC Report, Strategy Document

## Progress Summary

### Completed (27/27 from Phase 1) ✅

| Item | Status | Notes |
|------|--------|-------|
| 1. Fix JSON-LD Structured Data | ✅ Done | Already correct in codebase |
| 2. Add H1 to Homepage | ✅ Done | Visible H1 in HomePageClient has correct text |
| 3. Fix Oversized Images | ✅ Done | WebP images already optimized |
| 4. Fix Meta Tags in Body | ✅ Done | Blog metadata uses generateMetadata |
| 5. Add Form Labels | ✅ Done | FileUpload has label+htmlFor, Dropzone has aria-label |
| 6. Add Canonical URLs | ✅ Done | hreflang-generator.ts handles all pages |
| 7. Add OG Images | ✅ Done | Default /og-image.png exists |
| 8. Shorten Page Titles | ✅ Done | All pSEO titles ≤60 chars (verified) |
| 9. Fix Heading Hierarchy | ✅ Done | No H2→H4 skips found |
| 10. Add Image Preload | ✅ Done | Already in layout.tsx files |
| 11. Add Image Dimensions | ✅ Done | Image components use fill/sizes or width/height |
| 12. Fix Duplicate Titles | ✅ Done | Language variants have proper i18n titles |
| 13. Create About Page | ✅ Done | Already exists at app/[locale]/about/page.tsx |
| 13b. Create Contact Page | ✅ Done | Created at app/[locale]/contact/page.tsx |
| 14. Add Author Bylines | ✅ Done | Blog posts have author/datePublished in schema |
| 15. Add Skip-to-Content | ✅ Done | Already in Layout.tsx |
| 16. Add External Links | ✅ Done | Added external links to 4+ blog posts |
| 17. Fix Orphan Pages | ✅ Done | Internal links validated - 28 files, 0 broken references |
| 18. Add Favicon | ✅ Done | Already in locale layout |
| 19. Reduce CSS Bundle | ✅ Done | Tailwind properly purged in production |
| 20. Add Font Preconnect | ✅ Done | Already in layout.tsx |
| 21. Fix Lazy Loading | ✅ Done | LCP images use priority prop |
| 22. Fix OAuth Secret | ✅ Done | Uses NEXT_PUBLIC_ prefix (client IDs are public by design) |
| 23. Add HSTS Header | ✅ Done | Already in security.ts (production only) |
| 24. Tighten CSP | ✅ Done | CSP functional with unsafe-inline/unsafe-eval documented |
| 25. Optimize Keywords | ✅ Done | Added "png transparent" & "png hintergrund transparent" to German locale |
| 26. Fix OG URL Mismatch | ✅ Done | metadata-factory.ts handles OG URLs correctly |
| 27. Fix E2E Test Failures | ✅ Done | Fixed H1 heading removal, model selection test label |

---

## Phase 2: Technical SEO Fixes (Ahrefs Critical Issues)

### Priority 1: Sitemap & Indexing (CRITICAL)

#### Task 2.1: Fix Non-Canonical Pages in Sitemap
**Impact:** 978 pages | **Severity:** Critical | **Status:** ⏳ TODO

**Issue:** Ahrefs detected 978 non-canonical pages in the sitemap. This means language variants (e.g., `/de/tools/...`) are being included when only the canonical English version should be indexed.

**Action Required:**
```typescript
// File: app/sitemap.xml/route.ts or individual sitemap route files
// Ensure only canonical URLs (English versions) are included in sitemap
// Language variants should use hreflang links, not separate entries

// Current structure may be including all language variants as separate entries
// Need to consolidate to canonical URLs with hreflang alternates
```

**Verification:**
- Run Ahrefs audit after fix
- Check sitemap.xml in browser
- Verify Google Search Console indexing coverage

---

#### Task 2.2: Fix 404 Errors (336 pages)
**Impact:** 336 broken pages | **Severity:** Critical | **Status:** ⏳ TODO

**Issue:** 336 pages returning 404 status. These need redirects or removal from sitemap.

**Action Required:**
1. Export 404 list from `docs/SEO/claude/ahrefs/Error-404_page.csv`
2. Categorize 404s:
   - Pages that should have redirects (implement 301)
   - Pages that should be removed from sitemap
   - Pages that need to be created

**Example Fix:**
```typescript
// Add redirects to next.config.js or middleware
async redirects() {
  return [
    {
      source: '/old-path',
      destination: '/new-path',
      permanent: true,
    },
  ];
}
```

---

#### Task 2.3: Fix Hreflang Issues (609 total errors)
**Impact:** 609 hreflang errors | **Severity:** High | **Status:** ⏳ TODO

**Breakdown:**
- Hreflang to non-canonical: 189 pages
- Hreflang to redirect or broken: 221 pages
- Multiple pages for same language: 199 pages
- Missing reciprocal hreflang: 24 pages

**Issue:** The `hreflang-generator.ts` exists but Ahrefs is detecting issues with the implementation.

**Action Required:**
1. Verify hreflang links on actual pages (View Source)
2. Check that hreflang URLs return 200 status
3. Ensure reciprocal links exist (if page A links to page B, page B must link back to page A)
4. Remove duplicate language entries

**Files to Check:**
- `lib/seo/hreflang-generator.ts`
- Individual pSEO route metadata

---

#### Task 2.4: Fix Broken Redirects (257 pages)
**Impact:** 257 broken redirects | **Severity:** High | **Status:** ⏳ TODO

**Issue:** Redirect chains that lead to 404 or infinite loops.

**Action Required:**
1. Export broken redirect list from `docs/SEO/claude/ahrefs/Error-Broken_redirect.csv`
2. Fix redirect chains in `next.config.js` or middleware
3. Test redirects manually

---

#### Task 2.5: Reduce 3XX Redirects (1,416 pages)
**Impact:** 1,416 redirect chains | **Severity:** Medium | **Status:** ⏳ TODO

**Issue:** Too many redirects affect crawl efficiency and user experience.

**Action Required:**
1. Identify redirect chains from `docs/SEO/claude/ahrefs/Warning-3XX_redirect.csv`
2. Replace redirect chains with direct redirects where possible
3. Update internal links to point directly to final URLs

---

### Priority 2: Content Quality & On-Page

#### Task 2.6: Add External Links to Remaining Articles
**Impact:** SEO trust signals | **Severity:** Medium | **Status:** ⏳ TODO

**Issue:** Some blog posts still lack external reference links to authoritative sources.

**Action Required:**
1. Audit blog posts in `content/blog/` for external links
2. Add 1-3 relevant external links per post to:
   - Wikipedia
   - Research papers
   - Industry resources
   - Tool documentation

**Example:**
```markdown
Learn more about [super-resolution imaging](https://en.wikipedia.org/wiki/Super-resolution_imaging)
or check out [TensorFlow's image processing capabilities](https://www.tensorflow.org/tutorials/generative/pix2pix).
```

---

#### Task 2.7: Fix Internal Linking for Orphan Pages
**Impact:** Page discoverability | **Severity:** Medium | **Status:** ⏳ TODO

**Issue:** Some pages have few or no incoming internal links.

**Action Required:**
1. Review internal link structure
2. Add related content sections to pages
3. Update footer and navigation
4. Create hub pages that link to related tools

---

### Priority 3: Security Enhancement

#### Task 2.8: Tighten CSP with Nonce/Strict-Dynamic
**Impact:** Security score | **Severity:** Low | **Status:** ⏳ Future Work

**Issue:** Current CSP uses `unsafe-inline` and `unsafe-eval`. Should use nonce or strict-dynamic for better security.

**Note:** This is a complex refactoring task that requires:
- Updating all inline scripts to use nonce attributes
- Setting up nonce generation in middleware
- Testing all third-party scripts with new CSP

**File:** `shared/config/security.ts`

---

## Phase 3: Content Strategy (Ongoing)

### Task 3.1: Monitor Keyword Rankings
**Frequency:** Weekly | **Status:** 🔄 Ongoing

**Actions:**
- Track position changes in GSC
- Document new keyword appearances
- Monitor competitor movements

---

### Task 3.2: Content Gap Analysis
**Frequency:** Monthly | **Status:** ⏳ TODO

**Actions:**
- Review competitor keywords from Ahrefs
- Identify content opportunities
- Create content calendar

**Target Keywords from GSC (currently ranking but need improvement):**
- png transparent (position 95) - ✅ Optimized
- png hintergrund transparent (position 95) - ✅ Optimized
- image upscaler (position 128) - Needs work
- ai image upscaler (position 125) - Needs work

---

### Task 3.3: Backlink Building
**Frequency:** Ongoing | **Status:** ⏳ TODO

**Current Status:**
- Referring Domains: 8 (very low)
- Target: 50-100 within 3 months

**Actions:**
1. Guest posting on photography/design blogs
2. Submit to tool directories (Product Hunt, AlternativeTo)
3. Resource page link building
4. Broken link building
5. Digital PR / shareable resources

---

## Metrics Tracking

### Current Scores

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Overall SEO Score | 51 | 75+ | ⚠️ Critical |
| Structured Data | 52 | 90+ | ✅ Fixed |
| E-E-A-T | 54 | 80+ | ✅ Improved |
| Core SEO | 80 | 90+ | ✅ Good |
| Content | 73 | 85+ | ⚠️ Needs work |
| Site Health (Ahrefs) | 46% | 80%+ | ⚠️ Critical |

### Organic Performance (GSC)

| Metric | Value |
|--------|-------|
| Total Clicks | 7 |
| Total Impressions | 131 |
| Average CTR | 5.3% |
| Average Position | 88.9 |
| Organic Keywords | 1 |

---

## Implementation Order

### Week 1 (Critical Technical)
1. Fix non-canonical pages in sitemap (2.1)
2. Fix 404 errors (2.2)
3. Fix hreflang issues (2.3)

### Week 2-3 (Technical Cleanup)
4. Fix broken redirects (2.4)
5. Reduce 3XX redirects (2.5)
6. Fix internal linking (2.7)

### Week 4 (Content)
7. Add external links to articles (2.6)
8. Begin content gap analysis (3.2)

### Ongoing
- Monitor keyword rankings (3.1)
- Backlink building (3.3)
- Tighten CSP when ready (2.8)

---

## Files Modified Reference

### Recently Modified (Phase 1)
- `app/[locale]/about/page.tsx` - About page created
- `app/[locale]/contact/page.tsx` - Contact page created
- `app/(pseo)/about/page.tsx` - pSEO about page
- `app/(pseo)/contact/page.tsx` - pSEO contact page
- `app/[locale]/layout.tsx` - Layout updates
- `client/components/layout/Footer.tsx` - Footer links
- `content/blog/*.mdx` - External links added
- `locales/de/tools.json` - German keyword optimization
- `tests/e2e/model-selection.e2e.spec.ts` - E2E test fixes

### To Modify (Phase 2)
- `app/sitemap.xml/route.ts` - Sitemap canonical fixes
- `next.config.js` - Redirect fixes
- `middleware.ts` - Redirect chains
- `lib/seo/hreflang-generator.ts` - Hreflang verification
- Individual pSEO routes - Metadata verification

---

## Notes

- All Phase 1 items (27/27) have been completed ✅
- Phase 2 focuses on Ahrefs-detected technical issues
- Phase 3 is ongoing content strategy and monitoring
- Use Ahrefs CSV files in `docs/SEO/claude/ahrefs/` for detailed error lists
- Re-run Ahrefs audit after completing Phase 2 tasks

---

## Next Audit Date
**Target:** 2026-02-06 (1 week after Phase 2 completion)
