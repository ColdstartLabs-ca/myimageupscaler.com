# Translation Check Report - January 9, 2026

## Executive Summary

**Overall Status:** 🔴 INCOMPLETE

- **Total Translation Keys:** ~24,768 keys per locale
- **Untranslated Keys:** 23,787 across all locales
- **Missing Files:** 6 (pseo-tools.json in all locales)
- **Hardcoded Strings:** 804 ESLint violations
- **Average Completion:** ~68% across all locales

---

## Critical Issues

### 1. Missing File: `pseo-tools.json`

**Impact:** HIGH - Blocks interactive tool functionality in all non-English locales

The newly created `locales/en/pseo-tools.json` (240 keys) is completely missing in all translation locales:

- ❌ `locales/de/pseo-tools.json` - 0/240 keys (0%)
- ❌ `locales/es/pseo-tools.json` - 0/240 keys (0%)
- ❌ `locales/fr/pseo-tools.json` - 0/240 keys (0%)
- ❌ `locales/it/pseo-tools.json` - 0/240 keys (0%)
- ❌ `locales/ja/pseo-tools.json` - 0/240 keys (0%)
- ❌ `locales/pt/pseo-tools.json` - 0/240 keys (0%)

**Content Includes:**
- Interactive tool UI strings (file size errors, processing buttons, etc.)
- Format converter labels and descriptions
- Image compressor settings
- Image resizer presets
- Background remover UI
- Print calculator
- Social media size lookup
- Bulk tool interfaces

### 2. Hardcoded Strings in Components

**Impact:** HIGH - SEO and UX degradation for international users

**Total:** 804 ESLint `i18next/no-literal-string` warnings

**Top Offending Files:**

```
app/(pseo)/_components/pseo/sections/CTASection.tsx
  Line 98:   "10 free credits"
  Line 108:  "Quick signup"
  Line 118:  "Instant results"

app/(pseo)/_components/pseo/sections/HeroSection.tsx
  Line 113:  "Free to start"
  Line 123:  "No watermarks"
  Line 133:  "Instant results"

app/[locale]/(pseo)/_components/tools/FormatConverter.tsx
  Multiple format names and labels

app/[locale]/(pseo)/_components/tools/ImageCompressor.tsx
  Multiple UI strings and labels

app/[locale]/(pseo)/_components/tools/ImageResizer.tsx
  Format options, presets, labels

app/[locale]/(pseo)/_components/tools/BackgroundRemover.tsx
  Status messages, labels
```

---

## Translation Coverage by Locale

### German (DE) - 73.5%
**Status:** 🟡 In Progress

| Metric | Value |
|--------|-------|
| Total Keys | 24,768 |
| Missing Keys | 240 (pseo-tools.json) |
| Untranslated Keys | 6,333 |
| Completed Keys | 18,195 |
| Overall Progress | **73.5%** |

**Lowest Coverage Files:**
- `pseo-tools.json` - 0% (240 missing)
- `use-cases-expanded.json` - 21% (736 untranslated)
- `camera-raw.json` - 24% (44 untranslated)
- `technical-guides.json` - 29% (863 untranslated)
- `industry-insights.json` - 34% (684 untranslated)
- `competitor-comparisons.json` - 44% (962 untranslated)

**Best Coverage Files:**
- `personas-expanded.json` - 99% ✅
- `help.json` - 98% ✅
- `photo-restoration.json` - 97% ✅
- `dashboard.json` - 95% ✅

### Spanish (ES) - ~70%
**Status:** 🟡 In Progress

**Known Issues:**
- Missing `pseo-tools.json` (240 keys)
- `camera-raw.json` - 12 missing keys (benefits, howItWorks)
- `comparison.json` - 80 missing keys (comparisonTable data)
- Large untranslated sections in technical content

### French (FR) - ~70%
**Status:** 🟡 In Progress

Similar issues to Spanish locale.

### Italian (IT) - ~70%
**Status:** 🟡 In Progress

Similar issues to Spanish locale.

### Japanese (JA) - ~60%
**Status:** 🔴 Behind Schedule

**Major Gaps:**
- Missing `pseo-tools.json` (240 keys)
- `use-cases-expanded.json` - 93% untranslated (330/354)
- `technical-guides.json` - 85% untranslated (733/866)
- `industry-insights.json` - 85% untranslated (604/710)
- `personas-expanded.json` - 71% untranslated (426/598)

### Portuguese (PT) - ~50%
**Status:** 🔴 Severely Behind

**Critical Gaps:**
- Missing `pseo-tools.json` (240 keys)
- `personas-expanded.json` - 100% untranslated (597/598)
- `device-optimization.json` - 100% untranslated (486/488)
- `competitor-comparisons.json` - 98% untranslated (1161/1182)
- `industry-insights.json` - 98% untranslated (693/710)
- `social-media-resize.json` - 91% untranslated (1291/1413)
- `interactive-tools.json` - 76% untranslated (749/988)

---

## Strategic Recommendations

### Phase 1: Critical Path (Week 1) - HIGH PRIORITY

**Goal:** Fix blocking issues affecting user experience

#### 1.1 Create `pseo-tools.json` for All Locales (Day 1-2)
**Effort:** ~3-4 hours
**Impact:** Unblocks interactive tool functionality

```bash
# Create files and sync structure
for locale in de es fr it ja pt; do
  yarn i18n:sync $locale pseo-tools
done

# Translate in batches
yarn i18n:batch de pseo-tools 50 0
# Apply translations
yarn i18n:apply de pseo-tools '<json>'
```

**Priority Order:**
1. German (DE) - Largest European market
2. Spanish (ES) - Second largest market
3. French (FR) - High engagement
4. Italian (IT) - Growing market
5. Japanese (JA) - Asian market
6. Portuguese (PT) - Brazilian market

#### 1.2 Fix High-Traffic Hardcoded Strings (Day 3-4)
**Effort:** ~4-6 hours
**Impact:** Improves SEO and UX for pSEO pages

**Files to Fix (in order):**
1. `CTASection.tsx` - 3 strings (high conversion impact)
2. `HeroSection.tsx` - 3 strings (first impression)
3. Tool components - ~50 strings (interactive tools)

**Approach:**
```bash
# Find all violations
npx eslint 'app/(pseo)/_components/**/*.tsx' 2>&1 | grep "i18next/no-literal-string" > hardcoded-strings.txt

# Fix by priority:
# 1. CTA/Hero sections (conversion-critical)
# 2. Tool components (functional)
# 3. Informational sections (lower priority)
```

#### 1.3 Run Verification (Day 5)
```bash
yarn i18n:check
yarn eslint 'app/**/*.{tsx,ts}'
yarn verify
```

---

### Phase 2: High-Value Content (Week 2-3) - MEDIUM PRIORITY

**Goal:** Complete high-traffic, SEO-valuable pages

#### 2.1 Complete Low-Coverage Files (German First)
**Files with <50% coverage:**

1. **`competitor-comparisons.json`** (44%)
   - 962 untranslated keys
   - High SEO value (comparison keywords)
   - Estimated effort: 6-8 hours

2. **`industry-insights.json`** (34%)
   - 684 untranslated keys
   - Long-form content
   - Estimated effort: 8-10 hours

3. **`technical-guides.json`** (29%)
   - 863 untranslated keys
   - Technical terminology
   - Estimated effort: 10-12 hours

4. **`camera-raw.json`** (24%)
   - 44 untranslated keys
   - Quick win
   - Estimated effort: 30 minutes

5. **`use-cases-expanded.json`** (21%)
   - 736 untranslated keys
   - Marketing content
   - Estimated effort: 8-10 hours

**Strategy:**
- Start with quick wins (camera-raw)
- Batch translate 50 keys at a time
- Use consistent terminology across files
- Validate after each file completion

#### 2.2 Address Missing Keys in Existing Files
**German has 27 missing keys in `competitor-comparisons.json`:**
- Specialized tool features
- Web-based features
- Pro features
- Modern AI features
- Batch processing features

**Action:**
```bash
yarn i18n:diff de competitor-comparisons
yarn i18n:sync de competitor-comparisons
# Translate new keys
```

---

### Phase 3: Long-Tail Completion (Week 4+) - LOW PRIORITY

**Goal:** Achieve 95%+ completion across all locales

#### 3.1 Portuguese Catch-Up (Most Behind)
**Priority Files:**
1. `personas-expanded.json` - 100% untranslated
2. `device-optimization.json` - 100% untranslated
3. `competitor-comparisons.json` - 98% untranslated
4. `industry-insights.json` - 98% untranslated

**Estimated Total Effort:** 40-60 hours

#### 3.2 Japanese Completion
**Priority Files:**
1. `use-cases-expanded.json` - 93% untranslated
2. `technical-guides.json` - 85% untranslated
3. `industry-insights.json` - 85% untranslated
4. `personas-expanded.json` - 71% untranslated

**Estimated Total Effort:** 30-40 hours

#### 3.3 Polish European Locales (DE, ES, FR, IT)
- Complete remaining files with <80% coverage
- Validate consistency across files
- Review quality of existing translations

---

## Automation Opportunities

### 1. Batch Translation Script
**Create:** `scripts/batch-translate-file.ts`

```typescript
// Automate the process:
// 1. Get batch of keys
// 2. Send to translation API (Claude/GPT)
// 3. Apply translations
// 4. Validate
// 5. Repeat until file complete
```

**Benefits:**
- Reduce manual work by 70%
- Faster turnaround
- Consistent quality

### 2. Pre-Commit Hook for Hardcoded Strings
**Create:** `.husky/pre-commit` check

```bash
# Prevent commits with hardcoded strings in pSEO components
if npx eslint 'app/**/*.{tsx,ts}' --quiet --rule 'i18next/no-literal-string: error'; then
  echo "✅ No hardcoded strings detected"
else
  echo "❌ Hardcoded strings found. Fix before committing."
  exit 1
fi
```

### 3. Translation Coverage Badge
**Add to README:**
```markdown
![Translation Coverage](https://img.shields.io/badge/i18n-73.5%25-yellow)
```

---

## Resource Estimation

### Time Investment by Phase

| Phase | Scope | Estimated Hours | Priority |
|-------|-------|-----------------|----------|
| **Phase 1** | Critical fixes | 12-16 hours | 🔴 Critical |
| **Phase 2** | High-value content | 40-60 hours | 🟡 High |
| **Phase 3** | Long-tail completion | 100-140 hours | 🟢 Medium |
| **Total** | Full completion | **152-216 hours** | - |

### Cost-Benefit Analysis

**If Using AI Translation API (Recommended):**
- Cost: ~$50-100 in API credits
- Time saved: ~120-160 hours
- Net benefit: ~$6,000-8,000 in labor cost savings

**If Manual Translation:**
- Cost: Translation agency ~$0.10-0.20/word
- Estimated words: 50,000-75,000
- Total cost: $5,000-15,000

**If Internal Team:**
- Full-time: 3-4 weeks
- Part-time: 8-10 weeks

---

## Quality Standards

### Translation Requirements

1. **Natural Phrasing**
   - Avoid literal word-for-word translations
   - Match context (UI vs marketing vs technical)
   - Use appropriate formality level

2. **Preserve Placeholders**
   - Keep `{variable}`, `{count}`, `%s` intact
   - Maintain URL structures
   - Preserve HTML entities

3. **Brand Consistency**
   - Don't translate: "MyImageUpscaler"
   - Don't translate: Platform names (Instagram, Facebook)
   - Don't translate: Technical formats (JPEG, PNG, WebP)

4. **Language-Specific Rules**
   - **German:** Use formal "Sie" (not "du")
   - **Spanish:** Use "usted" (formal)
   - **French:** Use "vous" (formal)
   - **Italian:** Use "Lei" (formal)
   - **Japanese:** Use polite forms (です/ます)
   - **Portuguese:** Use "você" (Brazilian Portuguese)

### Validation Checklist

Before marking a locale as complete:

- [ ] `yarn i18n:check --locale <locale>` passes
- [ ] `yarn i18n:validate <locale>` passes
- [ ] No ESLint `i18next/no-literal-string` warnings
- [ ] Spot-check 5-10 random pages in browser
- [ ] Test interactive tools work correctly
- [ ] Verify CTA buttons translate properly
- [ ] Check for placeholder rendering issues

---

## Success Metrics

### Key Performance Indicators

1. **Translation Coverage**
   - Target: 95% minimum per locale
   - Stretch goal: 98%

2. **Code Quality**
   - Zero `i18next/no-literal-string` ESLint warnings
   - All translation files valid JSON

3. **User Experience**
   - All interactive tools functional in all locales
   - No fallback to English on translated pages
   - Proper pluralization and formatting

4. **SEO Impact**
   - All pSEO pages render in correct language
   - Proper `lang` attributes
   - Correct `hreflang` tags

---

## Next Steps

### Immediate Actions (This Week)

1. **Create missing `pseo-tools.json` files** (Day 1-2)
   ```bash
   # Start with German
   yarn i18n:sync de pseo-tools
   yarn i18n:batch de pseo-tools 50 0
   ```

2. **Fix critical hardcoded strings** (Day 3-4)
   ```bash
   # Start with CTA and Hero sections
   npx eslint 'app/(pseo)/_components/pseo/sections/*.tsx'
   ```

3. **Quick wins in German** (Day 5)
   ```bash
   # Complete camera-raw (only 44 keys)
   yarn i18n:batch de camera-raw 44 0
   ```

### This Month

- Complete Phase 1 (Critical Path)
- Start Phase 2 (High-Value Content)
- Achieve 80%+ coverage in DE, ES, FR, IT

### This Quarter

- Complete Phase 2 and 3
- Achieve 95%+ coverage in all locales
- Implement automation scripts

---

## Appendix: Commands Reference

### Status Checks
```bash
# Full translation report
yarn i18n:check

# Specific locale
yarn i18n:check --locale de

# Detailed statistics
yarn i18n:stats de

# Show missing keys
yarn i18n:diff de

# Validate JSON syntax
yarn i18n:validate de
```

### Translation Workflow
```bash
# Sync structure (add missing keys from English)
yarn i18n:sync de [filename]

# Get batch for translation
yarn i18n:batch de filename 50 0

# Apply translations
yarn i18n:apply de filename '<json>'

# List all files
yarn i18n:helper list-files de
```

### Finding Hardcoded Strings
```bash
# All files
npx eslint 'app/**/*.{tsx,ts}'

# Specific directory
npx eslint 'app/(pseo)/_components/**/*.tsx'

# Count violations
npx eslint 'app/**/*.{tsx,ts}' 2>&1 | grep -c "i18next/no-literal-string"
```

---

## Appendix: German Translation Statistics (Detailed)

| File | Total Keys | Missing | Untranslated | Done | Progress |
|------|------------|---------|--------------|------|----------|
| alternatives.json | 1218 | 0 | 230 | 988 | 81% |
| auth.json | 86 | 0 | 0 | 86 | 100% ✅ |
| blog.json | 23 | 0 | 0 | 23 | 100% ✅ |
| bulk-tools.json | 165 | 0 | 41 | 124 | 75% |
| camera-raw.json | 58 | 0 | 44 | 14 | 24% |
| common.json | 101 | 0 | 6 | 95 | 94% |
| compare.json | 287 | 0 | 57 | 230 | 80% |
| comparison.json | 287 | 0 | 58 | 229 | 80% |
| comparisons-expanded.json | 1331 | 0 | 149 | 1182 | 89% |
| competitor-comparisons.json | 1712 | 0 | 962 | 750 | 44% |
| dashboard.json | 103 | 0 | 5 | 98 | 95% |
| device-optimization.json | 688 | 0 | 109 | 579 | 84% |
| device-specific.json | 199 | 0 | 96 | 103 | 52% |
| device-use.json | 700 | 0 | 204 | 496 | 71% |
| features.json | 19 | 0 | 0 | 19 | 100% ✅ |
| format-conversion.json | 494 | 0 | 118 | 376 | 76% |
| format-scale.json | 2027 | 0 | 309 | 1718 | 85% |
| formats.json | 587 | 0 | 81 | 506 | 86% |
| free.json | 227 | 0 | 30 | 197 | 87% |
| guides.json | 435 | 0 | 64 | 371 | 85% |
| help.json | 102 | 0 | 2 | 100 | 98% |
| howItWorks.json | 15 | 0 | 0 | 15 | 100% ✅ |
| industry-insights.json | 1042 | 0 | 684 | 358 | 34% |
| interactive-tools.json | 1170 | 0 | 181 | 989 | 85% |
| personas-expanded.json | 1538 | 0 | 21 | 1517 | 99% |
| photo-restoration.json | 904 | 0 | 29 | 875 | 97% |
| platform-format.json | 2722 | 0 | 251 | 2471 | 91% |
| platforms.json | 338 | 0 | 123 | 215 | 64% |
| pricing.json | 32 | 0 | 0 | 32 | 100% ✅ |
| **pseo-tools.json** | **240** | **240** | **0** | **0** | **0%** ❌ |
| scale.json | 806 | 0 | 157 | 649 | 81% |
| social-media-resize.json | 1566 | 0 | 431 | 1135 | 72% |
| stripe.json | 53 | 0 | 0 | 53 | 100% ✅ |
| technical-guides.json | 1213 | 0 | 863 | 350 | 29% |
| tools.json | 427 | 0 | 71 | 356 | 83% |
| use-cases-expanded.json | 928 | 0 | 736 | 192 | 21% |
| use-cases.json | 925 | 0 | 221 | 704 | 76% |
| **TOTAL** | **24768** | **240** | **6333** | **18195** | **73.5%** |

---

*Report generated: January 9, 2026*
*Next review: After Phase 1 completion*
