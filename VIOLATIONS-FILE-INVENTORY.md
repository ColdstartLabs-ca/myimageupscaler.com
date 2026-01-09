# ESLint i18next/no-literal-string Violations - Complete File Inventory
**Analysis Date**: 2026-01-09
**Total Files**: 73 | **Total Violations**: ~804

---

## PHASE 1B SCOPE (178 violations, 29 files)

### Batch 1: Conversion-Critical (14 violations, 4 files)

#### 1. app/(pseo)/_components/pseo/sections/CTASection.tsx
- **Violations**: 3
- **Lines**: 98, 108, 118
- **Type**: Hardcoded benefit labels in span elements
- **Status**: Not yet converted

#### 2. app/(pseo)/_components/pseo/sections/HeroSection.tsx
- **Violations**: 4
- **Lines**: 64, 113, 123, 133
- **Type**: Badge text, feature benefits
- **Status**: Not yet converted
- **Complexity**: Line 64 has complex JSX with animated elements

#### 3. app/[locale]/(pseo)/_components/pseo/sections/CTASection.tsx
- **Violations**: 3
- **Lines**: 98, 108, 118
- **Type**: Duplicate of non-locale version
- **Status**: Not yet converted
- **Note**: Identical content to #1

#### 4. app/[locale]/(pseo)/_components/pseo/sections/HeroSection.tsx
- **Violations**: 4
- **Lines**: 64, 113, 123, 133
- **Type**: Duplicate of non-locale version
- **Status**: Not yet converted
- **Note**: Identical content to #2

---

### Batch 2: Core Tools - Phase 2A (59 violations, 6 files)

#### 5. app/(pseo)/_components/tools/BackgroundRemover.tsx
- **Violations**: 9
- **Lines**: 125, 143, 180, 183, 187, 191, 196, 197, 198
- **Type**: Form labels, file info labels, section heading
- **Status**: Not yet converted
- **Special**: Lines 197-198 are duplicates (code duplication?)

#### 6. app/(pseo)/_components/tools/FormatConverter.tsx
- **Violations**: 11
- **Lines**: 182, 202, 242, 265, 287, 304, 310, 315, 327, 330, 334
- **Type**: Form labels, buttons, informational text
- **Status**: Not yet converted
- **Special**: Long informational text at line 315

#### 7. app/(pseo)/_components/tools/ImageCompressor.tsx
- **Violations**: 22
- **Lines**: 124, 144, 150, 154, 157, 173, 188, 189, 198, 219, 240, 254, 255, 256, 274, 288, 292, 298, 306, 308, 309, 310
- **Type**: Labels, hints, options, tips
- **Status**: Not yet converted
- **Special**: Line 306 has emoji (💡) - keep in translation
- **Special**: Lines 308-310 are tips (could be array)
- **Special**: Lines 154, 157 have partial hardcoding (%, →)

#### 8. app/(pseo)/_components/tools/ImageResizer.tsx
- **Violations**: 13
- **Lines**: 205, 225, 233, 247, 269, 285, 294, 313, 316, 338, 366, 376, 377
- **Type**: Labels, options, help text
- **Status**: Not yet converted
- **Special**: Line 316 is conditional "(auto-calculated)"
- **Special**: Line 338 includes dynamic quality value
- **Special**: Line 377 has filename interpolation

#### 9. app/[locale]/(pseo)/_components/tools/BackgroundRemover.tsx
- **Violations**: 2
- **Lines**: 199, 200
- **Type**: PNG format output (partial conversion)
- **Status**: Partially converted
- **Note**: Only PNG format strings remain

#### 10. app/[locale]/(pseo)/_components/tools/ImageCompressor.tsx
- **Violations**: 1
- **Lines**: 159
- **Type**: Arrow separator in size display
- **Status**: Partially converted
- **Note**: Only arrow "→" remains

#### 11. app/[locale]/(pseo)/_components/tools/ImageResizer.tsx
- **Violations**: 1
- **Lines**: 292
- **Type**: WebP format option
- **Status**: Partially converted
- **Note**: Only WebP option remains
- **Also**: Unused variable warning on line 65 ('tPresets')

---

### Batch 3: Bulk & Advanced Tools (105 violations, 3 files)

#### 12. app/(pseo)/_components/tools/BulkImageCompressor.tsx
- **Violations**: 35
- **Type**: Batch operation labels, format options, dimension controls, tips
- **Status**: Not yet converted
- **Pattern**: Similar to ImageCompressor (duplicate patterns expected)

#### 13. app/(pseo)/_components/tools/BulkImageResizer.tsx
- **Violations**: 30
- **Type**: Batch operation labels, presets, status messages
- **Status**: Not yet converted
- **Pattern**: Similar to ImageResizer (duplicate patterns expected)

#### 14. app/(pseo)/_components/tools/PrintCalculator.tsx
- **Violations**: 40
- **Type**: DPI explanations, size presets, unit conversions, tips
- **Status**: Not yet converted
- **Special**: Complex calculations tool (more specialized strings)

---

### Batch 4: Tool Helpers & Templates (~45 violations, 6 files)

#### 15. app/(pseo)/_components/tools/InteractiveTool.tsx
- **Violations**: 3
- **Type**: Tool wrapper/helper labels
- **Status**: Not yet converted

#### 16. app/(pseo)/_components/pseo/templates/ScalePageTemplate.tsx
- **Violations**: 8
- **Type**: Page template content
- **Status**: Not yet converted

#### 17. app/(pseo)/_components/pseo/templates/GuidePageTemplate.tsx
- **Violations**: 6
- **Type**: Page template content
- **Status**: Not yet converted

#### 18. app/(pseo)/_components/pseo/templates/FreePageTemplate.tsx
- **Violations**: 7
- **Type**: Page template content
- **Status**: Not yet converted

#### 19. app/(pseo)/_components/pseo/templates/ComparePageTemplate.tsx
- **Violations**: 9
- **Type**: Comparison page content
- **Status**: Not yet converted

#### 20. app/(pseo)/_components/pseo/ui/FileUpload.tsx
- **Violations**: 3
- **Type**: Upload UI labels
- **Status**: Not yet converted

---

### Also in Phase 1b Scope (High-Impact)

#### 21. app/(pseo)/_components/pseo/ui/UseCaseCard.tsx
- **Violations**: 1
- **Type**: Card UI content
- **Status**: Not yet converted

#### 22. app/(pseo)/_components/pseo/ui/StepCard.tsx
- **Violations**: 1
- **Type**: Card UI content
- **Status**: Not yet converted

#### 23. app/(pseo)/_components/pseo/sections/FAQSection.tsx
- **Violations**: 1
- **Type**: FAQ section content
- **Status**: Not yet converted

#### 24. app/(pseo)/_components/pseo/sections/RelatedBlogPostsSection.tsx
- **Violations**: 2
- **Type**: Section labels
- **Status**: Not yet converted

#### 25. app/(pseo)/_components/tools/SocialMediaSizeLookup.tsx
- **Violations**: 6
- **Type**: Tool labels and size options
- **Status**: Not yet converted

#### 26. app/[locale]/(pseo)/_components/tools/SocialMediaSizeLookup.tsx
- **Violations**: 7
- **Type**: Tool labels and size options
- **Status**: Not yet converted (full count, not partial)

#### 27. app/[locale]/(pseo)/_components/tools/BulkImageCompressor.tsx
- **Violations**: 19
- **Type**: Batch compression labels
- **Status**: Not yet converted

#### 28. app/[locale]/(pseo)/_components/tools/BulkImageResizer.tsx
- **Violations**: 30
- **Type**: Batch resizing labels
- **Status**: Not yet converted

#### 29. app/[locale]/(pseo)/_components/pseo/templates/LocalizedPageTemplate.tsx
- **Violations**: 2
- **Type**: Template content
- **Status**: Not yet converted

---

## PHASE 1C SCOPE (626+ violations, 44+ files)

### Admin & Dashboard Pages (117 violations, 7+ files)

1. **app/[locale]/dashboard/billing/page.tsx** - 25 violations
2. **app/[locale]/dashboard/admin/users/[userId]/page.tsx** - 28 violations
3. **app/[locale]/dashboard/admin/users/page.tsx** - 14 violations
4. **app/[locale]/dashboard/admin/page.tsx** - 10 violations
5. **app/[locale]/dashboard/admin/layout.tsx** - 2 violations
6. **app/[locale]/dashboard/admin/error.tsx** - 6 violations
7. **app/[locale]/dashboard/error.tsx** - 6 violations

---

### Legal Pages (187 violations, 2 files)

1. **app/[locale]/terms/page.tsx** - 98 violations
2. **app/[locale]/privacy/page.tsx** - 89 violations

---

### Blog & Related (11+ violations, 3+ files)

1. **app/[locale]/blog/_components/RelatedToolsSection.tsx** - 3 violations
2. **app/[locale]/blog/[slug]/page.tsx** - 8 violations

---

### Auth & Checkout (29+ violations, 4+ files)

1. **app/[locale]/checkout/page.tsx** - 19 violations
2. **app/[locale]/verify-email/page.tsx** - 7 violations
3. **app/[locale]/success/page.tsx** - 9 violations
4. **app/[locale]/canceled/page.tsx** - 7 violations
5. **app/[locale]/auth/confirm/page.tsx** - 2 violations
6. **app/[locale]/auth/callback/page.tsx** - 3 violations

---

### Other Pages (235+ violations, 30+ files)

1. **app/subscription/confirmed/page.tsx** - 26 violations
2. **app/[locale]/help/HelpClient.tsx** - 1 violation
3. **app/not-found.tsx** - 4 violations
4. **app/error.tsx** - 6 violations
5. **app/[locale]/(pseo)/use-cases/page.tsx** - 3 violations
6. **app/(pseo)/use-cases/page.tsx** - 3 violations
7. **app/[locale]/(pseo)/tools/resize/bulk-image-resizer/page.tsx** - 2 violations
8. **app/(pseo)/tools/resize/bulk-image-resizer/page.tsx** - 2 violations
9. **app/[locale]/(pseo)/tools/page.tsx** - 3 violations
10. **app/(pseo)/tools/page.tsx** - 3 violations
11. **app/[locale]/(pseo)/scale/page.tsx** - 3 violations
12. **app/(pseo)/scale/page.tsx** - 3 violations
13. **app/[locale]/(pseo)/platform-format/page.tsx** - 3 violations
14. **app/(pseo)/platform-format/page.tsx** - 3 violations
15. **app/[locale]/(pseo)/guides/page.tsx** - 3 violations
16. **app/(pseo)/guides/page.tsx** - 3 violations
17. **app/[locale]/(pseo)/free/page.tsx** - 3 violations
18. **app/(pseo)/free/page.tsx** - 3 violations
19. **app/[locale]/(pseo)/formats/page.tsx** - 3 violations
20. **app/(pseo)/formats/page.tsx** - 3 violations
21. **app/[locale]/(pseo)/format-scale/page.tsx** - 3 violations
22. **app/(pseo)/format-scale/page.tsx** - 3 violations
23. **app/[locale]/(pseo)/device-use/page.tsx** - 3 violations
24. **app/(pseo)/device-use/page.tsx** - 3 violations
25. **app/[locale]/(pseo)/compare/page.tsx** - 4 violations
26. **app/(pseo)/compare/page.tsx** - 4 violations
27. **app/[locale]/(pseo)/alternatives/page.tsx** - 3 violations
28. **app/(pseo)/alternatives/page.tsx** - 3 violations
29. **app/[locale]/(pseo)/_components/ui/FileUpload.tsx** - 3 violations
30. **app/(pseo)/_components/ui/FileUpload.tsx** - 3 violations

---

## Summary Table

| Phase | Scope | Files | Violations | Priority | Status |
|-------|-------|-------|-----------|----------|--------|
| **1b** | Conversion/Tools | 29 | 178 | HIGH | Ready |
| **1c** | Admin/Legal | 44+ | 626+ | LOW | Pending |
| **TOTAL** | All | 73+ | ~804 | - | - |

---

## Implementation Tracking

### Batch 1 (Conversion-Critical)
- [ ] CTASection.tsx (3 violations)
- [ ] HeroSection.tsx (4 violations)
- [ ] CTASection.tsx [locale] (3 violations)
- [ ] HeroSection.tsx [locale] (4 violations)
- **Status**: Ready to start

### Batch 2 (Core Tools)
- [ ] BackgroundRemover.tsx (9 violations)
- [ ] FormatConverter.tsx (11 violations)
- [ ] ImageCompressor.tsx (22 violations)
- [ ] ImageResizer.tsx (13 violations)
- [ ] BackgroundRemover.tsx [locale] (2 violations)
- [ ] ImageCompressor.tsx [locale] (1 violation)
- [ ] ImageResizer.tsx [locale] (1 violation)
- **Status**: Ready to start after Batch 1

### Batch 3 (Bulk & Advanced)
- [ ] BulkImageCompressor.tsx (35 violations)
- [ ] BulkImageResizer.tsx (30 violations)
- [ ] PrintCalculator.tsx (40 violations)
- **Status**: Ready to start after Batch 2

### Batch 4 (Helpers & Templates)
- [ ] InteractiveTool.tsx (3 violations)
- [ ] ScalePageTemplate.tsx (8 violations)
- [ ] GuidePageTemplate.tsx (6 violations)
- [ ] FreePageTemplate.tsx (7 violations)
- [ ] ComparePageTemplate.tsx (9 violations)
- [ ] FileUpload.tsx (3 violations)
- Plus 10 additional high-impact files
- **Status**: Ready to start after Batch 3

---

## File Organization Notes

### Duplicate Components (Need Coordination)
- CTASection.tsx exists in both `app/(pseo)/...` and `app/[locale]/(pseo)/...`
- HeroSection.tsx exists in both locations
- Many other components exist in both (likely via symlink or duplication)

**Strategy**:
- Fix non-locale versions first
- Ensure locale versions stay in sync
- Consider consolidation after i18n conversion

### Partial Conversions (Use as Reference)
- BackgroundRemover.tsx [locale] - 7/9 violations already fixed
- ImageCompressor.tsx [locale] - 21/22 violations already fixed
- ImageResizer.tsx [locale] - 12/13 violations already fixed

**Strategy**:
- Check what was translated in locale versions
- Use same translation keys in non-locale versions
- Maintain consistency

---

## Document Control

- **Created**: 2026-01-09
- **Type**: File Inventory & Tracking
- **Scope**: All 73 files with violations
- **Last Updated**: 2026-01-09
