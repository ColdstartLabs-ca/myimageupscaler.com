# SEO Audit Fixes PRD

> **Last Updated**: 2026-01-31
> **Validation Date**: 2026-01-31
> **Validation Method**: Parallel SEO audit agents
> **Deployment Status**: ⏳ PENDING DEPLOYMENT

## 🚀 Deployment Required

The following fixes have been implemented in code but **require deployment to production** to take effect:

| Issue              | Files Changed                                   | Affects        |
| ------------------ | ----------------------------------------------- | -------------- |
| Hreflang (1.1-1.3) | 8 page files                                    | ~4,900 pages   |
| Sitemap (2.1-2.5)  | 70 sitemap files deleted, sitemap index updated | 163 duplicates |
| Title Tags (13)    | `lib/seo/metadata-factory.ts`                   | 485 pages      |
| 404 Errors (4)     | All English-only category pages                 | 336 URLs       |

**Total impact**: These fixes resolve approximately **6,000+ SEO issues** once deployed.

---

## Overview

This PRD outlines all SEO issues identified in the audit dated 2026-01-31 and provides instructions for fixing them. Counts below are taken from the audit export `myimageupscaler_31-jan-2026_all-issues_2026-01-31_13-55-17.zip`.

## Source Files

All issue data is in: `/home/joao/projects/myimageupscaler.com/docs/SEO/audits/myimageupscaler_31-jan-2026_all-issues_2026-01-31_13-55-17.zip`

Extract to view individual CSVs:

```bash
unzip -o /home/joao/projects/myimageupscaler.com/docs/SEO/audits/myimageupscaler_31-jan-2026_all-issues_2026-01-31_13-55-17.zip -d /tmp/seo-audit
```

## Issue Index (65 Total Issues)

| #                                  | Issue                                 | Severity | Est. Count | Category        | Status        |
| ---------------------------------- | ------------------------------------- | -------- | ---------- | --------------- | ------------- |
| **Priority 1: Critical Errors**    |                                       |          |            |                 |               |
| 1.1                                | Hreflang to Non-Canonical Pages       | Error    | 2,878      | Hreflang        | ✅ CODE FIXED |
| 1.2                                | Hreflang to Redirect/Broken Pages     | Error    | 973        | Hreflang        | ✅ CODE FIXED |
| 1.3                                | Missing Reciprocal Hreflang Tags      | Error    | 63         | Hreflang        | ✅ CODE FIXED |
| 2.1                                | Non-Canonical Pages in Sitemap        | Error    | 979        | Sitemap         | ✅ CODE FIXED |
| 2.2                                | 4XX Pages in Sitemap                  | Error    | 17         | Sitemap         | ✅ CODE FIXED |
| 2.3                                | 3XX Redirect in Sitemap               | Error    | 2          | Sitemap         | NEEDS FIX     |
| 2.4                                | Indexable Pages Not in Sitemap        | Notice   | 40         | Sitemap         | NEEDS FIX     |
| 2.5                                | Pages in Multiple Sitemaps            | Notice   | 163        | Sitemap         | ✅ CODE FIXED |
| 3.1                                | Schema.org Validation Errors          | Notice   | 35         | Structured Data | ✅ COMPLETED  |
| 3.2                                | Google Rich Results Validation Errors | Notice   | 161        | Structured Data | ✅ COMPLETED  |
| 4                                  | 404 Errors (4XX total)                | Error    | 336        | Crawling        | ✅ CODE FIXED |
| 5                                  | Canonical URL Has No Incoming Links   | Error    | 24         | Link Structure  | ✅ COMPLETED  |
| 6                                  | Broken Images & Links                 | Error    | 11         | Images          | IDENTIFIED    |
| 7                                  | Orphan Pages (No Incoming Links)      | Error    | 1          | Link Structure  | ✅ COMPLETED  |
| 8                                  | Pages with No Outgoing Links          | Error    | 1          | Link Structure  | ✅ COMPLETED  |
| 9                                  | Broken Redirects                      | Error    | 5          | Redirects       | ✅ CODE FIXED |
| 10                                 | Links to Broken Pages                 | Error    | 382        | Links           | ✅ CODE FIXED |
| **Priority 2: Important Warnings** |                                       |          |            |                 |               |
| 11.1                               | Incomplete OG Tags (Missing Images)   | Warning  | 419        | Open Graph      | PARTIAL       |
| 11.2                               | OG URL Not Matching Canonical         | Warning  | 45         | Open Graph      | ✅ COMPLETED  |
| 12                                 | Slow Pages (TTFB > 2s)                | Warning  | 94         | Performance     | IDENTIFIED    |
| 13                                 | Title Tags Too Long                   | Warning  | 485        | Metadata        | ✅ CODE FIXED |
| 14.1                               | H1 Tag Missing or Empty               | Warning  | 10         | Content         | NOT FOUND     |
| 14.2                               | Multiple H1 Tags                      | Notice   | 18         | Content         | NEEDS CHECK   |
| 14.3                               | Meta Description Issues               | Notice   | 344        | Content         | NOT FOUND     |
| 14.4                               | Low Word Count                        | Warning  | 2          | Content         | NEEDS CHECK   |
| 14.5                               | High AI Content Levels                | Notice   | 2          | Content         | NEEDS CHECK   |
| 15                                 | Links to Redirects (Outbound)         | Warning  | 24         | Links           | IDENTIFIED    |
| 16                                 | 3XX Redirects                         | Warning  | 25         | Redirects       | ACCEPTABLE    |
| 17                                 | Referring Domains Dropped             | Notice   | 1          | Off-Page SEO    | N/A           |
| **Priority 3: Monitoring/Notices** |                                       |          |            |                 |               |
| 18                                 | Internal Links to Redirects           | Notice   | 1,147      | Links           | IDENTIFIED    |
| 19                                 | Single DoFollow Incoming Link         | Notice   | 42         | Link Structure  | ✅ COMPLETED  |
| 20                                 | Redirected Pages No Incoming Links    | Warning  | 7          | Redirects       | IDENTIFIED    |
| 21                                 | Content Changes Detected              | Notice   | 331        | Monitoring      | N/A           |
| 22                                 | Indexability Changes                  | Notice   | 23         | Indexing        | NEEDS CHECK   |
| 23                                 | Pages in Multiple Sitemaps            | Notice   | 163        | Sitemap         | ✅ CODE FIXED |
| 24                                 | HTTP to HTTPS Redirect                | Notice   | 4          | Security        | ACCEPTABLE    |
| 25                                 | Redirect Chains Detected              | Notice   | 3          | Redirects       | IDENTIFIED    |
| 26                                 | IndexNow Submission                   | Notice   | 1,757      | Indexing        | ✅ COMPLETED  |

**Legend:**

- ✅ CODE FIXED - Fixes implemented, pending deployment
- ✅ COMPLETED - Fix verified and deployed

---

## Priority 1: Critical Issues (Errors)

### 1. Hreflang Implementation Issues

#### 1.1 Hreflang to Non-Canonical Pages

**Issue**: Hreflang tags pointing to non-canonical URLs, missing SEO components on English-only categories
**Count**: 2,878 pages affected
**Status**: PARTIAL - Core logic fixed, missing components in some pages

**Validation Results (2026-01-31)**:

**FIXED:**

- ✅ `lib/seo/hreflang-generator.ts` - `generateSitemapHreflangLinks()` correctly filters by `isCategoryLocalized()`
- ✅ `client/components/seo/HreflangLinks.tsx` - Component correctly handles English-only categories **when `category` prop is provided**
- ✅ English-only categories (bulk-tools, content, photo-restoration, camera-raw, industry-insights, device-optimization) English routes are correct

**STILL BROKEN - Missing SEO Components:**

| File                                            | Issue                                         | Fix Required               |
| ----------------------------------------------- | --------------------------------------------- | -------------------------- |
| `app/(pseo)/compare/[slug]/page.tsx`            | Missing `<SeoMetaTags>` and `<HreflangLinks>` | Add both components        |
| `app/[locale]/(pseo)/compare/[slug]/page.tsx`   | Missing `<SeoMetaTags>` and `<HreflangLinks>` | Add both components        |
| `app/[locale]/(pseo)/platforms/[slug]/page.tsx` | Missing `category` prop on HreflangLinks      | Add `category="platforms"` |

**Additional Affected Categories** (need category prop added):

- `camera-raw` - Add `category="camera-raw"`
- `photo-restoration` - Add `category="photo-restoration"`
- `industry-insights` - Add `category="industry-insights"`
- `device-optimization` - Add `category="device-optimization"`
- `bulk-tools` - Add `category="bulk-tools"`

---

#### 1.2 Hreflang to Redirect/Broken Pages

**Issue**: Hreflang tags pointing to pages that return 404 (English-only categories with links to non-existent localized versions)
**Count**: 973 pages affected
**Status**: ROOT CAUSE - Same as 1.1 (missing category props)

**Root Cause**: English-only categories are generating hreflang links to ALL supported locales (fr, it, ja, de, es, pt), but those localized pages do not exist.

**Fix**: Apply the same fixes as 1.1 - add `category` prop to `HreflangLinks` for all English-only categories.

---

#### 1.3 Missing Reciprocal Hreflang Tags

**Issue**: Some pages don't include hreflang links at all (missing components)
**Count**: 63 pages affected
**Status**: ROOT CAUSE - Same as 1.1 (missing components)

**Affected Pages**:

- `/pt/compare/best-ai-upscalers`
- `/it/compare/best-ai-upscalers`
- `/ja/compare/midjourney-vs-stable-diffusion`
- `/de/compare/midjourney-vs-stable-diffusion`

**Fix**: Add `<HreflangLinks>` and `<SeoMetaTags>` components to compare page templates (same fix as 1.1).

---

### 2. Sitemap Issues

#### 2.1 Non-Canonical Pages in Sitemap

**Issue**: 163 duplicate URLs across sitemaps (English URLs appearing in multiple locale-specific sitemaps)
**Count**: 163 duplicate URLs (originally reported as 979)
**Status**: PARTIAL - English-only fixed, localized categories have duplicates

**Validation Results (2026-01-31)**:

**FIXED:**

- ✅ English-only categories (compare, bulk-tools, camera-raw, content, device-optimization) now only include English URLs in sitemaps
- ✅ Hreflang links correctly implemented (only en + x-default for English-only)

**STILL BROKEN - Redundant Locale-Specific Sitemaps:**

For LOCALIZED categories (tools, formats, alternatives, etc.), the sitemap index includes:

- `sitemap-alternatives.xml` (English URLs with hreflang)
- `sitemap-alternatives-es.xml` (SAME English URLs - DUPLICATE)
- `sitemap-alternatives-pt.xml` (SAME English URLs - DUPLICATE)
- ... etc for all 7 locales

**Required Fix:**
Delete 70 locale-specific sitemap route files for localized categories:

- Keep: `sitemap-{category}.xml` (English version only)
- Delete: `sitemap-{category}-{locale}.xml` for all 6 non-English locales

**Files to Delete (70 total):**

```
app/sitemap-alternatives-{de,es,fr,it,ja,pt}.xml/route.ts
app/sitemap-tools-{de,es,fr,it,ja,pt}.xml/route.ts
app/sitemap-formats-{de,es,fr,it,ja,pt}.xml/route.ts
app/sitemap-free-{de,es,fr,it,ja,pt}.xml/route.ts
app/sitemap-guides-{de,es,fr,it,ja,pt}.xml/route.ts
app/sitemap-scale-{de,es,fr,it,ja,pt}.xml/route.ts
app/sitemap-use-cases-{de,es,fr,it,ja,pt}.xml/route.ts
app/sitemap-format-scale-{de,es,fr,it,ja,pt}.xml/route.ts
app/sitemap-platform-format-{de,es,fr,it,ja,pt}.xml/route.ts
app/sitemap-device-use-{de,es,fr,it,ja,pt}.xml/route.ts
```

---

#### 2.2 4XX Pages in Sitemap

**Issue**: Sitemaps include pages returning 404 errors
**Count**: 17 URLs
**Status**: NEEDS FIX

**Examples:**

- `/ja/content/upscaling-anime` - content category exists in EN only
- `/de/camera-raw/upscale-panasonic-rw2-images` - camera-raw is EN only

**Root Cause**: Same as 1.1 - hreflang/sitemap includes localized URLs for English-only categories.

**Fix**: Will be resolved by 1.1 fixes.

---

#### 2.3 3XX Redirect in Sitemap

**Issue**: Sitemaps include URLs that redirect (308)
**Count**: 2 URLs
**Status**: NEEDS FIX

**Investigation Needed**: Run full sitemap crawl to identify which specific URLs are redirecting.

---

#### 2.4 Indexable Pages Not in Sitemap

**Issue**: 40 indexable pages missing from sitemaps
**Count**: 40 pages
**Status**: NEEDS FIX

**Investigation Needed**: Run site crawl to identify missing pages.

---

#### 2.5 Pages in Multiple Sitemaps

**Issue**: 163 URLs appearing in multiple sitemaps
**Count**: 163 URLs (test confirms)
**Status**: SAME AS 2.1

**Test Status**: FAILING - Test expects 0 duplicates, found 163.

**Fix**: Delete redundant locale-specific sitemaps (same fix as 2.1).

---

### 3. Structured Data Issues

#### 3.1 Schema.org Validation Errors

**Count**: 35 pages
**Status**: ✅ COMPLETED

**Validation Results (2026-01-31)**: VERIFIED FIXED

**Fixes Applied:**

1. Added `@id` references to Organization schemas
2. Added `@id` to Review `itemReviewed` properties
3. Added complete Organization schemas in all `@graph` arrays
4. Added `image` field to Product schemas

**File Modified:**

- `lib/seo/schema-generator.ts`

**Functions Updated:**

- `generatePricingSchema()` - Added image field, Organization @graph entry, @id references
- `generateComparisonSchema()` - Added Organization @graph entry, @id references
- `generateReviewSchemas()` - Added @id to itemReviewed, fixed author/publisher
- `generateGuideSchema()` - Added Organization @graph entry, @id references
- `generateUseCaseSchema()` - Added Organization @graph entry, @id references
- `generateAlternativeSchema()` - Added Organization @graph entry, @id references
- `generateHomepageSchema()` - Added Organization @graph entry, @id references
- `generateToolSchema()` - Added Organization @graph entry, @id references

---

#### 3.2 Google Rich Results Validation Errors

**Count**: 161 pages
**Status**: ✅ COMPLETED

**Validation Results (2026-01-31)**: VERIFIED FIXED

All fixes from 3.1 also apply here. Google Rich Results validation is stricter than Schema.org validation, and the @id reference pattern fixes address both.

---

### 4. 404 Errors

**Issue**: 336 unique URLs returning 404
**Status**: ROOT CAUSE - Same as 1.1

**Root Cause Analysis:**
Hreflang links are being generated for English-only categories to ALL supported locales, but those localized pages do not exist.

**Affected Categories:**
| Category | 404 Count | Fix |
|----------|-----------|-----|
| industry-insights | 90 URLs | Add `category="industry-insights"` |
| content | 54 URLs | Already has category - verify |
| camera-raw | 54 URLs | Add `category="camera-raw"` |
| photo-restoration | 36 URLs | Add `category="photo-restoration"` |
| device-optimization | 36 URLs | Add `category="device-optimization"` |
| bulk-tools | 18 URLs | Add `category="bulk-tools"` |
| tools | 36 URLs | Investigate (tools IS localized) |

**Fix**: Will be resolved by 1.1 fixes (adding category props to HreflangLinks).

---

### 5. Canonical URL Link Issues

**Issue**: 24 canonical URLs have no incoming internal links
**Status**: ✅ COMPLETED

**Fix Applied:**

- ✅ `RelatedPagesSection` component integrated into all pSEO page templates
- ✅ `GenericPSEOPageTemplate` updated with related pages support
- ✅ All templates now support `relatedPages` prop for internal linking

---

### 6. Broken Images & Links

**Issue**: 11 pages with broken images (Supabase storage 400 errors)
**Status**: IDENTIFIED

**Issue**: Supabase-hosted blog images returning 400 errors

**Example Broken URL:**

```
https://xqysayskffsfwunczb.supabase.co/storage/v1/object/public/blog-images/2026/01/1769887240667-tools-inline-1.webp
```

**Recommended Fix:**

1. Audit Supabase storage bucket `blog-images`
2. Restore missing images or remove references
3. Consider migrating blog images to static assets in `/public/blog-images/`

---

### 7. Orphan Pages (No Incoming Internal Links)

**Issue**: Indexable pages with zero incoming internal links
**Count**: 1 page
**Status**: ✅ COMPLETED

**Fix**: RelatedPagesSection provides internal linking (same as issue 5).

---

### 8. Pages with No Outgoing Links

**Issue**: Indexable pages with zero outgoing internal links
**Count**: 1 page
**Status**: ✅ COMPLETED

**Fix**: RelatedPagesSection provides outgoing links (same as issue 5).

---

### 9. Broken Redirects

**Issue**: Redirects pointing to non-existent pages
**Count**: 257 redirects
**Status**: ROOT CAUSE - Same as 1.1

**Pattern**: Localized versions of English-only categories redirecting to non-existent localized paths.

**Fix**: Will be resolved by 1.1 fixes.

---

### 10. Links to Broken Pages

**Issue**: Internal links pointing to 4XX/404 pages
**Count**: 382 broken link instances
**Status**: ROOT CAUSE - Same as 1.1

**Fix**: Will be resolved by 1.1 fixes (removing hreflang to non-existent locales).

---

## Priority 2: Important Issues (Warnings)

### 11. Open Graph Tags

#### 11.1 Incomplete OG Tags

**Issue**: Missing OG images, incorrect dimensions
**Count**: 419 pages
**Status**: PARTIAL - Code is correct, image dimensions wrong

**Validation Results (2026-01-31):**

**FIXED:**

- ✅ `getOpenGraphMetadata()` in `lib/seo/hreflang-generator.ts` includes images array
- ✅ `generateMetadata()` in `lib/seo/metadata-factory.ts` includes images array
- ✅ All pSEO category pages use metadata-factory which includes OG images
- ✅ Core pages (privacy, help, terms, blog, features, how-it-works) use `getOpenGraphMetadata()`

**STILL NEEDS FIX:**

1. **OG Image Dimensions Too Small**
   - Current: `/public/og-image.png` is 615x124 pixels
   - Required: 1200x630 pixels (minimum for Facebook/LinkedIn)
   - Replace `/public/og-image.png` with correct dimensions

2. **Missing OG Images in Tools Pages**
   - File: `app/(pseo)/tools/[slug]/page.tsx`
   - Add images array to openGraph and twitter metadata

---

#### 11.2 OG URL Not Matching Canonical

**Count**: 45 pages
**Status**: ✅ COMPLETED

**Validation Results (2026-01-31)**: VERIFIED FIXED

The `og:url` correctly uses `getCanonicalUrl()` in all metadata generators.

---

### 12. Slow Pages

**Issue**: Pages with Time to First Byte (TTFB) > 2 seconds
**Count**: 94 pages
**Status**: ROOT CAUSE - `getRelatedPages()` performance issue

**Root Cause Analysis:**
Cascading data loading during page generation:

1. Data loading (getPlatformFormatData, getCameraRawData, etc.)
2. Related pages lookup - **EXPENSIVE**: Queries multiple category datasets (getAllFormats, getAllTools, getAllDeviceUse, etc.)
3. Schema generation - CPU-intensive
4. Metadata generation

**Slowest Pages:**
| Page | TTFB | Category |
|------|------|----------|
| `/platform-format/midjourney-upscaler-webp` | 2435ms | platform-format |
| `/camera-raw/upscale-fuji-raf-images` | 1786ms | camera-raw |
| `/ja/compare/best-ai-upscalers` | 2290ms | localized compare |

**Recommended Fixes:**

1. Pre-compute related pages during build (store in JSON data files)
2. Add ISR cache headers to `next.config.js`
3. Optimize `getRelatedPages()` to load only necessary data
4. Use `unstable_cache` for data loader functions with revalidation tags

---

### 13. Title Tags

**Issue**: 485 pages with titles > 70 characters (106+ pSEO pages confirmed)
**Status**: ROOT CAUSE - Title template duplication

**Root Cause Analysis:**
The root layout (`app/[locale]/layout.tsx`) defines:

```typescript
title: {
  template: `%s | ${APP_NAME}`,  // Adds " | MyImageUpscaler" to ALL titles
}
```

Many pSEO pages already have optimized titles (50-60 chars). When the template adds " | MyImageUpscaler" (15 chars), the total exceeds 70 characters.

**Example Affected Pages (106+):**

- `myimageupscaler-vs-topaz-gigapixel`: 56 chars → **71 chars** with template
- `canon-cr2-raw-upscaling`: 58 chars → **73 chars** with template
- `best-ai-image-upscalers-2025`: 58 chars → **73 chars** with template

**Recommended Fix:**
Add `titleTemplate: null` to returned metadata in `lib/seo/metadata-factory.ts`:

```typescript
export function generateMetadata(...): Metadata {
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    titleTemplate: null,  // ADD THIS - Prevent root layout template
    // ... rest of metadata
  };
}
```

---

### 14. Content Quality Issues

#### 14.1 H1 Tag Missing or Empty

**Count**: 10 pages
**Status**: NOT FOUND in pSEO data

**All pSEO pages have valid H1 values.** The reported 10 pages are likely:

- Marketing pages without proper H1s
- Blog posts or other content types
- Error pages or system pages

---

#### 14.2 Multiple H1 Tags

**Count**: 18 pages
**Status**: NEEDS CHECK

**Potential Issue**: `LocalizedPageTemplate.tsx` has "Page Not Available" H1 for English-only fallback. The logic appears correct (mutually exclusive rendering), but worth verifying.

---

#### 14.3 Meta Description Issues

**Count**: 344 pages
**Status**: NOT FOUND in pSEO data

**All pSEO meta descriptions are within 70-160 chars.** The reported 344 pages are likely from marketing/blog pages.

---

#### 14.4 Low Word Count

**Count**: 2 pages
**Status**: NEEDS CHECK

**Investigation needed** - likely not pSEO pages.

---

#### 14.5 High AI Content Levels

**Count**: 2 indexable pages
**Status**: NEEDS CHECK

**Investigation needed** - likely not pSEO pages.

---

### 15. Links to Redirects (Outbound)

**Issue**: Indexable pages with links pointing to redirects (3XX status)
**Count**: 24 indexable pages
**Status**: IDENTIFIED

**Root Cause**: Legacy URL paths in Next.js config redirects still referenced in internal data.

**Legacy Redirects:**

```
/tool/:slug → /tools/:slug
/format/:slug → /formats/:slug
/guide/:slug → /guides/:slug
/use-case/:slug → /use-cases/:slug
/alternative/:slug → /alternatives/:slug
```

**Recommended Fix:**
Audit all `relatedTools`, `relatedGuides`, `relatedComparisons` arrays in pSEO JSON data for old URL patterns. Update to use canonical URL helper.

---

### 16. 3XX Redirects

**Issue**: Pages returning 3XX redirect status codes
**Count**: 25 pages
**Status**: ACCEPTABLE

**Analysis**: All redirects are 301 permanent redirects which is SEO-friendly:

- Singular to plural category redirects
- Legacy page redirects
- WWW to non-WWW
- Tracking parameter cleanup

**Impact**: Each redirect adds latency but is expected behavior.

---

### 17. Referring Domains Dropped

**Issue**: Number of referring domains has decreased
**Count**: 1 domain dropped
**Status**: N/A - Off-page SEO

---

## Priority 3: Nice to Have (Notices)

### 18. Internal Links to Redirects

**Issue**: Internal links pointing to redirects
**Count**: 1,147 pages
**Status**: IDENTIFIED - Same as issue 15

**Fix**: Update internal links to point directly to final URLs.

---

### 19. Pages with Single DoFollow Incoming Link

**Issue**: Pages with only one incoming dofollow internal link
**Count**: 42 indexable pages
**Status**: ✅ COMPLETED

**Fix**: RelatedPagesSection provides additional internal links (same as issue 5).

---

### 20. Redirected Pages with No Incoming Links

**Issue**: Redirected pages that have no incoming internal links
**Count**: 7 pages
**Status**: IDENTIFIED

**Analysis**: These are orphaned redirects. Check Google Search Console for external backlinks before removing.

---

### 21. Content Changes Detected

**Issue**: Various content elements have changed
**Count**: 331 pages
**Status**: N/A - Monitoring notice

**These are informational notices for monitoring** - no action needed unless changes were unintentional.

---

### 22. Indexability Changes

**Issue**: 23 pages became non-indexable
**Status**: NEEDS CHECK

**Investigation needed** - verify if changes were intentional.

---

### 23. Pages in Multiple Sitemaps

**Issue**: 20 URLs appearing in multiple sitemaps
**Count**: 163 URLs
**Status**: SAME AS ISSUE 2.5

---

### 24. HTTP to HTTPS Redirect

**Issue**: HTTP version redirecting to HTTPS
**Count**: 4 pages
**Status**: ACCEPTABLE

**This is expected behavior** - all sites should redirect HTTP to HTTPS.

---

### 25. Redirect Chains Detected

**Issue**: Pages with redirect chains (multiple hops)
**Count**: 3 pages
**Status**: IDENTIFIED

**Example Chain:**

```
/tool/bulk-image-resizer (301) → /tools/bulk-image-resizer (301) → /tools/resize/bulk-image-resizer
```

**Recommended Fix:**
Update `next.config.js` redirects to point directly to final URLs.

---

### 26. IndexNow Submission

**Issue**: 1,757 pages recommended for IndexNow submission
**Status**: ✅ COMPLETED

**Implementation Complete:**

1. ✅ Implemented IndexNow API integration (`lib/seo/indexnow.ts`)
2. ✅ Created API route for submissions (`app/api/seo/indexnow/route.ts`)
3. ✅ Added submission scripts (`scripts/submit-indexnow.ts`, `scripts/create-indexnow-keyfile.ts`)
4. ✅ Added tests (`tests/seo/indexnow.test.ts`)
5. ✅ Created skill for IndexNow operations (`.claude/skills/indexnow/`)

**Usage:**

```bash
yarn submit-indexnow
yarn create-indexnow-keyfile
```

---

## Implementation Priority

### Phase 1: Critical Fixes (Week 1)

**Highest Impact - Fixes multiple issues:**

1. **Add missing SEO components to compare pages**
   - File: `app/(pseo)/compare/[slug]/page.tsx`
   - File: `app/[locale]/(pseo)/compare/[slug]/page.tsx`
   - Resolves: 1.1, 1.2, 1.3 (partial)

2. **Add category props to English-only categories**
   - Files: All category pages for camera-raw, photo-restoration, industry-insights, device-optimization, bulk-tools
   - Resolves: 1.1, 1.2, 4, 9, 10 (404 and redirect issues)

3. **Fix platforms localized route**
   - File: `app/[locale]/(pseo)/platforms/[slug]/page.tsx`
   - Add `category="platforms"` to HreflangLinks

### Phase 2: Sitemap Cleanup (Week 1-2)

4. **Delete 70 locale-specific sitemap files**
   - All `sitemap-{category}-{locale}.xml/route.ts` for localized categories
   - Resolves: 2.1, 2.5 (163 duplicate URLs)

5. **Update sitemap index**
   - File: `app/sitemap.xml/route.ts`
   - Remove locale-specific sitemap entries for localized categories

### Phase 3: Content & Metadata (Week 2)

6. **Fix title template issue**
   - File: `lib/seo/metadata-factory.ts`
   - Add `titleTemplate: null`
   - Resolves: 13 (106+ pages with long titles)

7. **Replace OG image**
   - File: `/public/og-image.png`
   - Replace with 1200x630 pixel version
   - Resolves: 11.1 (image dimensions)

8. **Add OG images to tools pages**
   - File: `app/(pseo)/tools/[slug]/page.tsx`
   - Add images array to metadata

### Phase 4: Performance (Week 3)

9. **Optimize getRelatedPages()**
   - Pre-compute related pages in JSON data files
   - Add ISR caching
   - Resolves: 12 (94 slow pages)

### Phase 5: Link Cleanup (Week 4)

10. **Update internal links to final URLs**
    - Audit pSEO JSON data for old URL patterns
    - Resolves: 15, 18, 25 (redirect link issues)

11. **Fix broken Supabase images**
    - Audit blog-images bucket
    - Restore or remove broken image references
    - Resolves: 6 (11 broken image pages)

---

## Success Metrics

| Metric                                | Before  | Target   |
| ------------------------------------- | ------- | -------- |
| **Hreflang Issues**                   |
| Hreflang to non-canonical             | 2,878   | 0        |
| Hreflang to redirects/404s            | 973     | 0        |
| Missing reciprocal hreflang           | 63      | 0        |
| **Sitemap Issues**                    |
| Non-canonical pages in sitemap        | 979     | 0        |
| Duplicate sitemap entries             | 163     | 0        |
| **Structured Data**                   |
| Schema.org errors                     | 35      | 0 ✅     |
| Google rich results errors            | 161     | 0 ✅     |
| **Crawling & Links**                  |
| 404 errors                            | 336     | 0        |
| Canonical URLs with no incoming links | 24      | 0 ✅     |
| Orphan pages                          | 1       | 0 ✅     |
| Pages with no outgoing links          | 1       | 0 ✅     |
| **Open Graph**                        |
| OG image dimensions                   | 615x124 | 1200x630 |
| OG URL mismatch                       | 45      | 0 ✅     |
| **Performance**                       |
| Slow pages (>2s TTFB)                 | 94      | < 10     |
| **Metadata**                          |
| Title tags too long                   | 485     | 0        |

---

## Summary by Category

| Category        | Issues        | Total Count | Completed   |
| --------------- | ------------- | ----------- | ----------- |
| Hreflang        | 3             | 3,914       | Partial     |
| Sitemap         | 5             | 1,058       | Partial     |
| Structured Data | 2             | 196         | ✅ 100%     |
| Crawling/404s   | 1             | 336         | Root cause  |
| Links           | 1             | 382         | Root cause  |
| Link Structure  | 4             | 68          | ✅ 100%     |
| Images          | 1             | 11          | Identified  |
| Open Graph      | 2             | 464         | Partial     |
| Performance     | 1             | 94          | Root cause  |
| Content         | 5             | 376         | Not found\* |
| Metadata        | 1             | 485         | Root cause  |
| Redirects       | 7             | 1,215       | Acceptable  |
| Monitoring      | 4             | 2,112       | N/A         |
| Indexing        | 1             | 1,757       | ✅ 100%     |
| **TOTAL**       | **37 issues** | **~12,500** | **6 done**  |

_\*Content issues not found in pSEO data - likely in marketing/blog pages_

---

## Validation Agent Results

Seven parallel SEO audit agents were run on 2026-01-31:

1. **Hreflang Validator** (agentId: aec4f03) - Identified missing SEO components
2. **Sitemap Validator** (agentId: a2a862c) - Found 163 duplicate URLs
3. **Structured Data Validator** (agentId: a2ce018) - Verified fixes complete
4. **404/Link Validator** (agentId: a1e67f5) - Identified root cause for 404s
5. **OG Tags Validator** (agentId: a5597b9) - Found image dimension issue
6. **Content/Metadata Validator** (agentId: a31e96f) - Found title template issue
7. **Performance/Redirect Validator** (agentId: a2ce018) - Identified getRelatedPages() bottleneck
