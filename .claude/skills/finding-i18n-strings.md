---
name: finding-i18n-strings
description: Finding hardcoded strings that need i18n translation. Use when you need to identify strings in components that should be converted to use translation keys.
---

# Finding i18n Strings (Hardcoded String Detection)

## Overview

This skill provides techniques for finding hardcoded strings in React components that should be converted to use i18n translation keys.

## ESLint Rule

The project uses `eslint-plugin-i18next` with the `no-literal-string` rule to automatically detect hardcoded strings in JSX.

### Run ESLint to Find Strings

```bash
# Check all files
npx eslint '**/*.{tsx,ts,jsx,js}'

# Check specific directory
npx eslint 'app/[locale]/**/*.{tsx,ts}'

# Check specific file
npx eslint 'app/[locale]/(pseo)/_components/tools/BackgroundRemover.tsx'
```

### Rule Configuration

Located in `eslint.config.js`:

```js
'i18next/no-literal-string': [
  'warn',
  {
    markupOnly: true, // Only checks JSX, not regular JS strings
    ignoreAttribute: [
      'data-testid',
      'data-cy',
      'className',
      'style',
      'type',
      'id',
      'aria-label',
      'placeholder',
      'alt',
      'key',
      'name',
      'role',
      'src',
      'href',
      'target',
    ],
    ignoreCallee: ['console.log', 'console.warn', 'console.error'],
    ignoreProperty: ['key'],
    ignoreTag: ['Styled', 'styled', 'Script', 'Link', 'Image'],
  },
],
```

### Understanding the Warnings

Example ESLint output:

```
/home/joao/projects/pixelperfect/app/[locale]/(pseo)/_components/tools/ImageResizer.tsx
  292:38  warning  disallow literal string: <option value="webp">WebP</option>  i18next/no-literal-string
```

This means:
- **File**: `ImageResizer.tsx`
- **Line**: 292
- **Issue**: The string "WebP" should use a translation key

## What Gets Flagged

### ✅ Flagged (Needs Translation)

```tsx
// Text content
<div>Hello World</div>
<span>Loading...</span>

// JSX attributes NOT in ignore list
<button aria-label="Close menu">×</button>
<img alt="Product photo" />

// Template literals in JSX
<div>{`Hello ${name}`}</div>
```

### ❌ Ignored (Safe)

```tsx
// Test attributes
<div data-testid="submit-button" />
<div data-cy="header" />

// HTML attributes
<img className="avatar" />
<input type="email" />
<a href="/about" target="_blank" />

// Special tags
<Script src="https://..." />
<Link href="/page" />
<Image alt="" />

// Console calls
console.log("Debug info");

// Object properties
{key: "value"}
```

## Translation Workflow

### 1. Find Hardcoded Strings

```bash
# Run ESLint on component files
npx eslint 'app/[locale]/(pseo)/_components/tools/*.tsx' 2>&1 | grep "i18next/no-literal-string"
```

### 2. Extract Translation Keys

For each flagged string, create a translation key:

**Before:**
```tsx
<option value="webp">WebP</option>
```

**After:**
```tsx
<option value="webp">{t('formats.webp')}</option>
```

### 3. Add Translation Keys to JSON

Edit `locales/en/common.json` (or appropriate namespace):

```json
{
  "formats": {
    "webp": "WebP",
    "png": "PNG",
    "jpeg": "JPEG"
  }
}
```

### 4. Add to Other Locales

Edit `locales/es/common.json`, `locales/de/common.json`, etc.:

```json
{
  "formats": {
    "webp": "WebP",
    "png": "PNG",
    "jpeg": "JPEG"
  }
}
```

### 5. Use in Component

```tsx
'use client';
import { useTranslations } from 'next-intl';

export function MyComponent() {
  const t = useTranslations('formats');
  return <option value="webp">{t('webp')}</option>;
}
```

## Advanced Scenarios

### Dynamic Values

**Before:**
```tsx
<div>Processing {fileCount} files...</div>
```

**After:**
```tsx
// locales/en/common.json
{
  "processing": "Processing {count} files..."
}

// Component
<div>{t('processing', { count: fileCount })}</div>
```

### Pluralization

**Before:**
```tsx
<div>{count === 1 ? '1 file' : `${count} files`}</div>
```

**After:**
```tsx
// locales/en/common.json
{
  "fileCount": "{count, plural, =0 {No files} =1 {1 file} other {# files}}"
}

// Component
<div>{t('fileCount', { count })}</div>
```

### Multiple Strings in One Element

**Before:**
```tsx
<p>
  <span className="font-bold">Original:</span> {file.name} ({size}MB)
</p>
```

**After:**
```tsx
// Break into separate keys
{
  "originalLabel": "Original:",
  "fileInfo": "{name} ({size}MB)"
}

// Component
<p>
  <span className="font-bold">{t('originalLabel')}</span> {t('fileInfo', { name: file.name, size })}
</p>
```

## Best Practices

### Namespace Organization

Group related translations:

```json
{
  "tools": {
    "backgroundRemover": {
      "title": "Background Remover",
      "processing": "Processing...",
      "download": "Download"
    },
    "imageResizer": {
      "title": "Image Resizer",
      "width": "Width",
      "height": "Height"
    }
  }
}
```

### Key Naming Conventions

- Use **camelCase**: `backgroundRemover`, not `background_remover`
- Be **descriptive**: `downloadButton` not `btn1`
- Group by **feature**: `tools.formatConverter.outputFormat`

### Avoid Over-Translation

Don't translate:
- Technical terms: "PNG", "JPEG", "API", "URL"
- Brand names: "MyImageUpscaler", "Instagram"
- Proper names: User names, company names
- Codes/IDs: "en-US", "UTF-8"

## Verification

### Check Translation Completeness

```bash
yarn i18n:check
```

### Run ESLint Again

```bash
npx eslint 'app/[locale]/(pseo)/_components/tools/*.tsx'
```

All `i18next/no-literal-string` warnings should be gone.

## Common Patterns

### Pattern 1: Button Text

```tsx
// Before
<button>Upload Image</button>

// After
<button>{t('uploadButton')}</button>
```

### Pattern 2: Form Labels

```tsx
// Before
<label>Email Address</label>

// After
<label>{t('emailLabel')}</label>
```

### Pattern 3: Error Messages

```tsx
// Before
{error && <div className="error">Failed to upload</div>}

// After
{error && <div className="error">{t('uploadError')}</div>}
```

### Pattern 4: Loading States

```tsx
// Before
<div className="loading">Processing your image...</div>

// After
<div className="loading">{t('processingImage')}</div>
```

## Quick Reference

| Task | Command |
|------|---------|
| Find all hardcoded strings | `npx eslint 'app/**/*.{tsx,ts}'` |
| Find in specific directory | `npx eslint 'app/[locale]/(pseo)/**/*'` |
| Check translation completeness | `yarn i18n:check` |
| Check specific locale | `yarn i18n:check --locale de` |
| Fix all warnings in file | Manually replace with `t()` calls |

## When NOT to Use This Skill

- **Technical constants**: File extensions, MIME types
- **Test attributes**: `data-testid`, `aria-label` for testing
- **External library props**: Component library props
- **Debug strings**: `console.log`, error messages for developers only
