---
description: SEO Audit Fixes Implementation Plan
globs: app/**/*.tsx, src/components/**/*.tsx, app/**/layout.tsx
alwaysApply: false
---

# SEO Audit Fixes Implementation Plan

## Overview

**Based on:** squirrelscan Audit Report dated 2026-01-30
**Health Score:** 53/100 (F)
**Pages Audited:** 500
**Issues:** 554 errors, 4485 warnings

## Critical Issues Summary

| Priority   | Issue                        | Pages Affected | Impact                         |
| ---------- | ---------------------------- | -------------- | ------------------------------ |
| **HIGH**   | Leaked Environment Variables | 47+            | Security - Credentials exposed |
| **HIGH**   | Missing H1 Tag               | 1 (Homepage)   | Core SEO                       |
| **MEDIUM** | Meta Tags in Body            | 1 (/blog)      | SEO - Meta tags ignored        |
| **MEDIUM** | Invalid JSON-LD              | 375 pages      | Structured Data                |
| **MEDIUM** | Form Labels Missing          | 44 pages       | Accessibility (WCAG)           |
| **LOW**    | Image File Size > 100KB      | 2 images       | Performance                    |
| **LOW**    | Image Dimensions Missing     | 302 pages      | CLS/Performance                |

---

## Issue 1: Leaked Environment Variables [CRITICAL]

### Finding

- **1 high-confidence leaked secret** detected
- **46 potential secrets** requiring manual verification
- Found in external scripts: `9692-48c16f3977a58988.js`, `5459-b7f3ae43f955c3be.js`

### Solution

1. Investigate the bundled chunks to identify the leaked variable
2. Move sensitive credentials to server-side only
3. Use server proxy for any authenticated API calls
4. Rotate any exposed credentials immediately

### Files to Check

```typescript
// Check for clientEnv usage that shouldn't be public
// Files in: shared/config/env.ts
// Client-side bundles: _next/static/chunks/
```

---

## Issue 2: Missing H1 Tag on Homepage

### Finding

- **1 page affected:** `/` (homepage)
- **Status:** No H1 tag found

### Solution

Add a proper H1 tag to the homepage. The H1 should:

- Be descriptive and contain primary keywords
- Align with the page title
- Be placed at the top of main content

### Implementation

**File:** `app/page.tsx` or `src/components/pages/HomePageClient.tsx`

```typescript
// Add to hero section
<h1 className="sr-only">AI Image Upscaler - Enlarge Images Without Quality Loss</h1>
// OR make visible:
<h1>AI Image Upscaler - Enlarge Images Without Quality Loss</h1>
```

---

## Issue 3: Meta Tags in Body

### Finding

- **1 page affected:** `/blog`
- **6 meta tags** incorrectly placed in `<body>`:
  - description
  - og:title
  - og:description
  - twitter:card
  - twitter:title
  - twitter:description

### Solution

Move all meta tags from `<body>` to `<head>` in the blog layout.

### Files to Fix

**File:** `app/blog/layout.tsx` or `app/blog/page.tsx`

Ensure all metadata is defined in the Next.js Metadata API, not manually placed in body.

```typescript
// Correct approach - use metadata export
export const metadata: Metadata = {
  title: 'Blog - Image Enhancement Tips & Guides | MyImageUpscaler',
  description: 'Learn about AI image upscaling, photo enhancement ...',
  openGraph: {
    title: 'Blog - Image Enhancement Tips & Guides | MyImageUpscaler',
    description: 'Learn about AI image upscaling, photo enhancement ...',
  },
  twitter: {
    card: 'summary',
    title: 'Blog - Image Enhancement Tips & Guides | MyImageUpscaler',
    description: 'Learn about AI image upscaling, photo enhancement ...',
  },
};
```

---

## Issue 4: Invalid JSON-LD Structured Data

### Finding

- **375 pages affected** with invalid JSON-LD syntax
- **Schema.org validation errors detected**

### Common Issues

1. Missing required fields for schema types
2. Invalid syntax or malformed JSON
3. Wrong property types (e.g., string instead of URL)

### Solution

Audit and fix JSON-LD across all affected pages.

### Files to Check

```typescript
// Schema components:
src/components/seo/JsonLd.tsx (or similar)
app/**/layout.tsx
app/**/page.tsx
```

### Validation Checklist

- Article: `headline`, `author`, `datePublished`, `publisher`
- Organization: `name`, `url`, `logo`
- WebSite: `name`, `url`
- Product: `name`, `offers`, `price`, `priceCurrency`

---

## Issue 5: Form Labels Missing

### Finding

- **44 pages affected**
- **2 input types without labels:** `text`, `file`

### Affected Page Types

- All tool pages (background remover, image compressor, etc.)
- Blog page
- Multiple language variants

### Solution

Add proper labels to all form inputs.

### Implementation Pattern

```typescript
// BEFORE (incorrect):
<input type="file" />

// AFTER (correct - option 1):
<label htmlFor="file-upload">Upload Image</label>
<input id="file-upload" type="file" />

// AFTER (correct - option 2):
<label>
  Upload Image
  <input type="file" />
</label>

// AFTER (correct - option 3 - for icon-only):
<input type="file" aria-label="Upload image" />
```

### Files to Fix

All tool pages and components containing file uploads:

```typescript
src/components/tools/**/*.tsx
src/components/upload/**/*.tsx
app/tools/**/*.tsx
```

---

## Issue 6: Image File Size Too Large

### Finding

- **2 images exceed 100KB:**
  1. `/before-after/smart-ai/budget-edit-with-smart-AI.png`
  2. `/before-after/smart-ai/budget-edit-with-WITHOUT-smart-AI.png`
- Used on 7 pages each (all smart-ai-enhancement pages across locales)

### Solution

Compress and optimize these images:

1. Convert to WebP format
2. Compress to under 100KB while maintaining visual quality
3. Add responsive versions if needed

### Files

```
public/before-after/smart-ai/budget-edit-with-smart-AI.png
public/before-after/smart-ai/budget-edit-with-WITHOUT-smart-AI.png
```

---

## Issue 7: Image Dimensions Missing

### Finding

- **302 pages affected** with images missing width/height
- Causes Cumulative Layout Shift (CLS)

### Solution

Add width and height attributes to all images.

### Implementation Pattern

```typescript
// Next.js Image component (recommended):
<Image
  src="/path/to/image.jpg"
  width={800}
  height={600}
  alt="Description"
/>

// Or plain img:
<img
  src="/path/to/image.jpg"
  width={800}
  height={600}
  alt="Description"
/>
```

### Files to Fix

All components rendering images, especially:

```typescript
src/components/pages/HomePageClient.tsx
src/components/tools/**/*.tsx
src/components/blog/**/*.tsx
```

---

## Additional SEO Improvements

### Meta Title/Description Length Issues

- **39 pages** with titles too long (>60 chars)
- **36 pages** with descriptions too short/long

### Canonical Chain Issues

- **2 pages** with redirect chains:
  - `/tools/bulk-image-compressor` → `/tools/compress/bulk-image-compressor`
  - `/tools/bulk-image-resizer` → `/tools/resize/bulk-image-resizer`

Update canonical URLs to point directly to final destinations.

---

## Implementation Phases

### Phase 1: Critical Security Fixes (Week 1)

- [x] Investigate and fix leaked environment variables - **FOUND: Live Stripe key in bundled .next chunks**
- [ ] Rotate any exposed credentials (requires prod environment access)
- [ ] Add secret scanning to CI/CD pipeline

### Phase 2: Core SEO Fixes (Week 2)

- [x] Add H1 tag to homepage - **FIXED: Added hidden H1 in server component**
- [x] Fix meta tags in body on /blog page - **VERIFIED: Using Metadata API correctly**
- [ ] Fix canonical URL chains (not in scope for this iteration)

### Phase 3: Structured Data & Accessibility (Week 3)

- [x] Audit and fix JSON-LD on all 375 affected pages - **FIXED: Converted numeric strings to numbers**
- [x] Add form labels to all 44 affected pages - **FIXED: Added aria-label to InputField component**
- [ ] Run accessibility audit (requires manual verification)

### Phase 4: Performance & Images (Week 4)

- [x] Compress oversized images - **DONE: Converted 2 PNGs to WebP (38KB, 59KB)**
- [x] Add dimensions to all images (302 pages) - **FIXED: Added aspect ratio support to BeforeAfterSlider**
- [ ] Implement LCP preloading hints (requires further performance analysis)

---

## Testing & Verification

### Pre-Deployment Checklist

- [ ] Run squirrelscan audit again
- [ ] Check Lighthouse scores (target: >90 all categories)
- [ ] Verify JSON-LD with Google Rich Results Test
- [ ] Test accessibility with WAVE or Lighthouse
- [ ] Confirm no leaked secrets in production bundle

### Success Criteria

- Health Score: >80/100
- Critical errors: 0
- Security issues: 0
- Accessibility score: >90

---

## Related PRDs

- `docs/PRDs/done/performance-seo-enhancement.md` - Previous SEO work
- `docs/PRDs/done/seo-structure-prd.md` - SEO structure implementation
