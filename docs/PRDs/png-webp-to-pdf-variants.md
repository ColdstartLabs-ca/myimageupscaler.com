# PRD: PNG-to-PDF & WebP-to-PDF Converter Pages

**Complexity: 2 → LOW mode**
_(+2 touches 6-10 files: interactive-tools.json + 6 locale files + 1 test file)_

---

## Integration Points Checklist

- [x] Entry point: `/tools/png-to-pdf`, `/tools/webp-to-pdf` — served by existing `app/(pseo)/tools/[slug]/page.tsx`
- [x] Caller file: `app/(pseo)/tools/[slug]/page.tsx` → `getAllToolSlugs()` → `interactive-tools.json`
- [x] Registration: Add slugs to `app/seo/data/interactive-tools.json`; `generateStaticParams()` picks them up automatically
- [x] User-facing: YES — tool pages with embedded `ImageToPdfConverter` (already handles PNG and WebP natively)
- [x] Internal linking: Update `relatedTools` arrays on `image-to-pdf`, `jpg-to-pdf`, `pdf-to-jpg`, `pdf-to-png`

**Full user flow:**

1. User searches "png to pdf" or "webp to pdf converter"
2. Lands on `/tools/png-to-pdf` or `/tools/webp-to-pdf`
3. Existing `InteractiveToolPageTemplate` renders `ImageToPdfConverter` with `acceptedInputFormats` scoped to the format
4. User uploads images, creates PDF, downloads — same as `jpg-to-pdf`

---

## 1. Context

**Problem:** `png-to-pdf` and `webp-to-pdf` are high-value search variants with no dedicated landing pages; only `jpg-to-pdf` and `image-to-pdf` are indexed.

**Files Analyzed:**

- `app/seo/data/interactive-tools.json` — tool registry
- `app/(pseo)/_components/tools/ImageToPdfConverter.tsx` — component (already supports PNG + WebP)
- `app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate.tsx` — renders toolComponent
- `locales/{locale}/interactive-tools.json` — 6 locale files (es, pt, de, fr, it, ja)
- `lib/seo/data-loader.ts` — `getAllToolSlugs()`, no changes needed (auto-discovers new slugs)
- `middleware.ts` — no changes needed (`/tools/` prefix already handled)

**Current Behavior:**

- `image-to-pdf`: accepts JPG + PNG + WebP (generic)
- `jpg-to-pdf`: accepts JPG only (scoped variant)
- No `png-to-pdf` or `webp-to-pdf` pages exist → missed SEO traffic
- `ImageToPdfConverter` already handles all three formats natively via `pdf-lib`

---

## 2. Solution

**Approach:**

- Add two new slug entries to `interactive-tools.json` using the existing `ImageToPdfConverter` component
- Scope each entry to its format via `toolConfig.acceptedInputFormats` and `acceptedFormats`
- Update `relatedTools` on four existing tools for internal linking
- Add localized entries in all 6 locale files (translated content)
- Add SEO unit tests for the two new slugs

**Key Decisions:**

- Reuse `ImageToPdfConverter` — no new component needed
- Pattern mirrors `jpg-to-pdf` entry exactly
- No middleware changes — `/tools/` prefix already pSEO-detected
- No new route files — `[slug]/page.tsx` already handles generic tool slugs

**Data Changes:** None (no DB, no schema)

---

## 3. Execution Phases

### Phase 1: Add `png-to-pdf` and `webp-to-pdf` to main data + update internal links

**Files (max 5):**

- `app/seo/data/interactive-tools.json` — add 2 new slug entries + update relatedTools on 4 existing tools

**Implementation:**

- [ ] Add `png-to-pdf` entry after `jpg-to-pdf` with:
  - `toolComponent: "ImageToPdfConverter"`
  - `acceptedFormats: ["image/png"]`
  - `toolConfig.acceptedInputFormats: ["image/png"]`
  - `maxFileSizeMB: 100`
  - `isInteractive: true`
  - Full SEO content (title, metaTitle, metaDescription, h1, intro, primaryKeyword, secondaryKeywords, features, useCases, benefits, howItWorks, faq)
  - `relatedTools: ["webp-to-pdf", "image-to-pdf", "jpg-to-pdf", "image-compressor"]`

- [ ] Add `webp-to-pdf` entry with:
  - Same structure, scoped to `image/webp`
  - `relatedTools: ["png-to-pdf", "image-to-pdf", "jpg-to-pdf", "image-compressor"]`

- [ ] Update `relatedTools` on existing tools:
  - `image-to-pdf`: add `"png-to-pdf"`, `"webp-to-pdf"` (keep max 4, drop `"image-compressor"` if needed or reorganize)
  - `jpg-to-pdf`: add `"png-to-pdf"` (cross-format variant link)
  - `pdf-to-jpg`: add `"png-to-pdf"` (PDF↔PNG relevance)
  - `pdf-to-png`: add `"png-to-pdf"` (strong semantic match)

**Content spec for `png-to-pdf`:**

```json
{
  "slug": "png-to-pdf",
  "title": "PNG to PDF Converter",
  "metaTitle": "Free PNG to PDF Converter - Convert PNG Images to PDF Online",
  "metaDescription": "Convert PNG to PDF free online. Turn PNG screenshots and graphics into PDF documents instantly. Combine multiple PNGs into one PDF. Browser-based, no upload required.",
  "h1": "Free PNG to PDF Converter - Turn Screenshots into PDF",
  "intro": "Convert PNG images to PDF documents in seconds. Add one or multiple PNG files and create a clean PDF — all in your browser with zero upload and no signup.",
  "primaryKeyword": "png to pdf",
  "secondaryKeywords": [
    "convert png to pdf",
    "png to pdf online",
    "screenshot to pdf",
    "multiple png to pdf",
    "png to pdf free"
  ],
  "category": "tools",
  "toolName": "PNG to PDF Converter",
  "description": "Convert single or multiple PNG images to PDF format. Perfect for screenshots, diagrams, and graphics. Works locally in your browser with pdf-lib.",
  "isInteractive": true,
  "toolComponent": "ImageToPdfConverter",
  "maxFileSizeMB": 100,
  "acceptedFormats": ["image/png"],
  "toolConfig": { "acceptedInputFormats": ["image/png"] },
  "lastUpdated": "2026-04-23T00:00:00Z",
  "features": [
    {
      "title": "Single or Multiple PNG to PDF",
      "description": "Convert one PNG or combine up to 30 PNG images into a single PDF document."
    },
    {
      "title": "Lossless Quality Preserved",
      "description": "PNG transparency and full-color detail are preserved in the final PDF."
    },
    {
      "title": "Flexible Page Sizing",
      "description": "Choose A4, Letter, or fit each image to its own page size."
    },
    {
      "title": "No Upload Needed",
      "description": "PDF creation happens entirely in your browser — your files stay private."
    }
  ],
  "useCases": [
    {
      "title": "Screenshots to PDF",
      "description": "Bundle multiple screenshots into a single organized PDF report.",
      "example": "Compile UI screenshots into a PDF walkthrough"
    },
    {
      "title": "Diagrams & Graphics",
      "description": "Convert PNG diagrams or infographics to PDF for sharing and printing.",
      "example": "Send architecture diagrams as a PDF document"
    },
    {
      "title": "Document Submission",
      "description": "Many forms accept PDF but not PNG. Convert graphics to PDF for official use.",
      "example": "Submit PNG certificates as PDF"
    }
  ],
  "benefits": [
    {
      "title": "Pixel-Perfect Output",
      "description": "PNG files are embedded at full resolution — no compression artifacts.",
      "metric": "Lossless output"
    },
    {
      "title": "Handles Transparency",
      "description": "PNG transparency is handled gracefully in the PDF output.",
      "metric": "Alpha channel support"
    },
    {
      "title": "Instant & Free",
      "description": "No account, no cost — PNG to PDF conversion in seconds.",
      "metric": "Zero cost"
    }
  ],
  "howItWorks": [
    {
      "step": 1,
      "title": "Upload PNG Images",
      "description": "Drag and drop PNG files or click to select. Upload up to 30 images at once."
    },
    {
      "step": 2,
      "title": "Arrange Order & Size",
      "description": "Reorder images by dragging. Choose page size: A4, Letter, or fit to image dimensions."
    },
    {
      "step": 3,
      "title": "Create PDF & Download",
      "description": "Click Create PDF and download your PNG-based PDF document immediately."
    }
  ],
  "faq": [
    {
      "question": "Does PNG to PDF lose quality?",
      "answer": "No — PNG images are embedded directly in the PDF at original resolution. No re-encoding occurs."
    },
    {
      "question": "What's the maximum number of PNGs?",
      "answer": "Up to 30 PNG files per PDF. Total size limit is 100MB."
    },
    {
      "question": "Can I add other image types too?",
      "answer": "The PNG to PDF tool is optimized for PNG. For mixed formats, use our Image to PDF converter which accepts JPG, PNG, and WebP."
    },
    {
      "question": "Is my data private?",
      "answer": "Yes. PDF creation uses pdf-lib running locally — your PNG files never leave your browser."
    }
  ],
  "relatedTools": ["webp-to-pdf", "image-to-pdf", "jpg-to-pdf", "image-compressor"],
  "relatedGuides": [],
  "ctaText": "Upscale Images Before Making PDF",
  "ctaUrl": "/?signup=1"
}
```

**Content spec for `webp-to-pdf`:**

```json
{
  "slug": "webp-to-pdf",
  "title": "WebP to PDF Converter",
  "metaTitle": "Free WebP to PDF Converter - Convert WebP Images to PDF Online",
  "metaDescription": "Convert WebP to PDF free online. Turn WebP images into PDF documents instantly. Combine multiple WebP files into one PDF. Browser-based, no upload required.",
  "h1": "Free WebP to PDF Converter - Convert WebP Images to PDF",
  "intro": "Convert WebP images to PDF documents in seconds. Upload one or multiple WebP files and create a clean PDF — entirely in your browser, no signup needed.",
  "primaryKeyword": "webp to pdf",
  "secondaryKeywords": [
    "convert webp to pdf",
    "webp to pdf online",
    "webp to pdf free",
    "webp image to pdf",
    "multiple webp to pdf"
  ],
  "category": "tools",
  "toolName": "WebP to PDF Converter",
  "description": "Convert single or multiple WebP images to PDF format. Works locally in your browser with zero upload required.",
  "isInteractive": true,
  "toolComponent": "ImageToPdfConverter",
  "maxFileSizeMB": 100,
  "acceptedFormats": ["image/webp"],
  "toolConfig": { "acceptedInputFormats": ["image/webp"] },
  "lastUpdated": "2026-04-23T00:00:00Z",
  "features": [
    {
      "title": "WebP to PDF in Seconds",
      "description": "Convert one or multiple WebP images into a PDF document instantly."
    },
    {
      "title": "High Quality Output",
      "description": "WebP images are rendered at full quality in the PDF via canvas conversion."
    },
    {
      "title": "Flexible Page Sizing",
      "description": "Choose A4, Letter, or fit each image to its own page size."
    },
    {
      "title": "No Upload Needed",
      "description": "All processing happens in your browser — WebP files are never uploaded."
    }
  ],
  "useCases": [
    {
      "title": "Web Images to PDF",
      "description": "Convert WebP images saved from websites into organized PDF documents.",
      "example": "Archive WebP product images as a PDF catalog"
    },
    {
      "title": "Batch WebP Conversion",
      "description": "Combine multiple WebP images into a single PDF for sharing.",
      "example": "Merge WebP screenshots into one PDF report"
    },
    {
      "title": "Cross-Format Compatibility",
      "description": "Not all apps support WebP. Convert to PDF for universal compatibility.",
      "example": "Send WebP graphics as PDF attachments"
    }
  ],
  "benefits": [
    {
      "title": "No Software Needed",
      "description": "Convert WebP to PDF directly in your browser — no download or install.",
      "metric": "Browser-based"
    },
    {
      "title": "Universal PDF Output",
      "description": "PDF files open everywhere, unlike WebP which has limited native support.",
      "metric": "100% compatible"
    },
    {
      "title": "Instant & Free",
      "description": "No account, no cost, no wait — WebP to PDF in seconds.",
      "metric": "Zero cost"
    }
  ],
  "howItWorks": [
    {
      "step": 1,
      "title": "Upload WebP Images",
      "description": "Drag and drop WebP files or click to select. Upload up to 30 images at once."
    },
    {
      "step": 2,
      "title": "Arrange Order & Size",
      "description": "Reorder images by dragging. Choose A4, Letter, or fit-to-image page size."
    },
    {
      "step": 3,
      "title": "Create PDF & Download",
      "description": "Click Create PDF and download your WebP-to-PDF document immediately."
    }
  ],
  "faq": [
    {
      "question": "Does WebP to PDF lose quality?",
      "answer": "Minimal. WebP is converted to JPEG via canvas before embedding in the PDF, preserving nearly all visual quality."
    },
    {
      "question": "What's the maximum number of WebP files?",
      "answer": "Up to 30 WebP files per PDF. Total size limit is 100MB."
    },
    {
      "question": "Can I mix WebP with other formats?",
      "answer": "The WebP to PDF tool is optimized for WebP. For mixed formats, use our Image to PDF converter which accepts JPG, PNG, and WebP."
    },
    {
      "question": "Is my data private?",
      "answer": "Yes. Processing uses pdf-lib running locally in your browser — WebP files are never uploaded."
    }
  ],
  "relatedTools": ["png-to-pdf", "image-to-pdf", "jpg-to-pdf", "image-compressor"],
  "relatedGuides": [],
  "ctaText": "Upscale Images Before Making PDF",
  "ctaUrl": "/?signup=1"
}
```

**Tests Required:**

| Test File                                | Test Name                                                                 | Assertion                                                |
| ---------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `tests/unit/seo/png-webp-to-pdf.spec.ts` | `png-to-pdf slug exists in tool registry`                                 | `expect(tool).toBeDefined()`                             |
| `tests/unit/seo/png-webp-to-pdf.spec.ts` | `png-to-pdf has correct toolComponent`                                    | `expect(tool.toolComponent).toBe('ImageToPdfConverter')` |
| `tests/unit/seo/png-webp-to-pdf.spec.ts` | `png-to-pdf only accepts image/png`                                       | `expect(tool.acceptedFormats).toEqual(['image/png'])`    |
| `tests/unit/seo/png-webp-to-pdf.spec.ts` | `webp-to-pdf slug exists in tool registry`                                | `expect(tool).toBeDefined()`                             |
| `tests/unit/seo/png-webp-to-pdf.spec.ts` | `webp-to-pdf only accepts image/webp`                                     | `expect(tool.acceptedFormats).toEqual(['image/webp'])`   |
| `tests/unit/seo/png-webp-to-pdf.spec.ts` | `png-to-pdf has valid metaTitle and metaDescription`                      | both non-empty strings                                   |
| `tests/unit/seo/png-webp-to-pdf.spec.ts` | `png-to-pdf relatedTools cross-links webp-to-pdf`                         | `expect(relatedTools).toContain('webp-to-pdf')`          |
| `tests/unit/seo/png-webp-to-pdf.spec.ts` | `image-to-pdf relatedTools updated to include png-to-pdf and webp-to-pdf` | both present                                             |

**Verification Plan:**

1. Unit tests: `tests/unit/seo/png-webp-to-pdf.spec.ts` — all 8 tests above
2. Manual: `yarn dev` → visit `/tools/png-to-pdf` and `/tools/webp-to-pdf` → confirm tool renders and accepts correct formats
3. `yarn verify` passes

---

### Phase 2: Localize in all 6 locale files

**Files (max 5 per batch — do es+pt+de in one, fr+it+ja in next):**

- `locales/es/interactive-tools.json`
- `locales/pt/interactive-tools.json`
- `locales/de/interactive-tools.json`
- `locales/fr/interactive-tools.json`
- `locales/it/interactive-tools.json`
- `locales/ja/interactive-tools.json`

**Implementation:**

- [ ] Add `png-to-pdf` entry to each locale file — translated title, h1, intro, metaTitle, metaDescription, features, useCases, benefits, howItWorks, faq
- [ ] Add `webp-to-pdf` entry to each locale file — same structure
- [ ] Keep slugs, toolComponent, acceptedFormats, toolConfig identical to English (only translate content strings)

**Tests Required:**

| Test File                                | Test Name                         | Assertion            |
| ---------------------------------------- | --------------------------------- | -------------------- |
| `tests/unit/seo/png-webp-to-pdf.spec.ts` | `png-to-pdf exists in es locale`  | locale entry defined |
| `tests/unit/seo/png-webp-to-pdf.spec.ts` | `webp-to-pdf exists in es locale` | locale entry defined |

**Verification Plan:**

1. Unit tests: locale presence checks
2. Manual: `yarn dev` → visit `/es/tools/png-to-pdf` → confirm Spanish content renders
3. `yarn verify` passes

---

## 4. Checkpoint Protocol

After each phase, spawn `prd-work-reviewer`:

```
PRD path: docs/PRDs/png-webp-to-pdf-variants.md
Phase: [N]
```

---

## 5. Acceptance Criteria

- [ ] `/tools/png-to-pdf` renders with `ImageToPdfConverter` accepting only PNG files
- [ ] `/tools/webp-to-pdf` renders with `ImageToPdfConverter` accepting only WebP files
- [ ] Both pages appear in related tools sections on `image-to-pdf`, `jpg-to-pdf`, `pdf-to-jpg`, `pdf-to-png`
- [ ] All 6 locale files have entries for both slugs
- [ ] All SEO unit tests pass
- [ ] `yarn verify` passes
- [ ] No existing tools broken (relatedTools updates don't remove existing cross-links)
