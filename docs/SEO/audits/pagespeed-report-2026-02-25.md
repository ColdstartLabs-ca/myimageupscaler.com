# PageSpeed Insights Report - myimageupscaler.com

**Date:** 2026-02-25
**Tool:** Lighthouse 13.0.3 (local run via Google Chrome)
**URL tested:** https://myimageupscaler.com
**Prior audit:** 2026-02-11 (Mobile Perf: 56, Desktop Perf: 91)

---

## Overall Scores

| Category       | Mobile | Desktop | vs Prior (Mobile) |
| -------------- | ------ | ------- | ----------------- |
| Performance    | **72** | **92**  | +16 (was 56)      |
| Accessibility  | 100    | 100     | (was 100)         |
| Best Practices | 92     | 88      | —                 |
| SEO            | 100    | 100     | (was 100)         |

Mobile performance improved significantly (+16 points) since the Feb-11 audit.
Desktop remains stable at 92.

---

## Lab Data

| Metric                         | Mobile       | Desktop     | Mobile Score |
| ------------------------------ | ------------ | ----------- | ------------ |
| First Contentful Paint (FCP)   | **1.7 s**    | 0.5 s       | 0.91 (pass)  |
| Largest Contentful Paint (LCP) | **6.8 s**    | **1.8 s**   | 0.07 (FAIL)  |
| Total Blocking Time (TBT)      | **220 ms**   | 20 ms       | 0.87 (warn)  |
| Cumulative Layout Shift (CLS)  | 0.003        | 0.003       | 1.00 (pass)  |
| Speed Index                    | 2.6 s        | 1.0 s       | 0.97 (pass)  |
| Time to Interactive (TTI)      | **8.5 s**    | 1.8 s       | 0.37 (FAIL)  |
| Server Response Time (TTFB)    | 210 ms       | 220 ms      | 1.00 (pass)  |

**Bold** = needs improvement. LCP and TTI are the dominant mobile performance problems.

---

## Performance Opportunities

### Mobile Opportunities

| # | Opportunity                  | Est. Savings | Score |
| - | ---------------------------- | ------------ | ----- |
| 1 | Reduce unused JavaScript     | ~2,320 ms / 447 KiB | 0.00 |
| 2 | Reduce unused CSS            | ~120 ms / 17 KiB    | 0.00 |
| 3 | Render-blocking requests     | ~520 ms              | 0.00 |
| 4 | Improve image delivery       | ~50 KiB              | 0.50 |
| 5 | Legacy JavaScript polyfills  | ~20 KiB              | 0.00 |

### Desktop Opportunities

| # | Opportunity              | Est. Savings |
| - | ------------------------ | ------------ |
| 1 | Reduce unused JavaScript | ~280 ms / 447 KiB |
| 2 | Reduce unused CSS        | ~20 ms / 16 KiB   |

---

## Detailed Opportunity Analysis

### 1. Reduce Unused JavaScript (447 KiB wasted — 2,320 ms savings on mobile)

The biggest single opportunity. Top offending scripts:

| Script                                              | Wasted  | Total  |
| --------------------------------------------------- | ------- | ------ |
| `_next/static/chunks/ed9f2dc4-9294e2f1d73b0bd3.js` | 222 KiB | 222 KiB |
| `googletagmanager.com/gtag/js` (GA4)                | 69 KiB  | 150 KiB |
| `_next/static/chunks/5459-7b38e4174e260800.js`      | 42 KiB  | 74 KiB  |
| `_next/static/chunks/7716-59e71b0f32322ac9.js`      | 37 KiB  | 46 KiB  |
| `_next/static/chunks/2488-6689e2fe6514ac29.js`      | 27 KiB  | 41 KiB  |
| `_next/static/chunks/7929.0ab49de1af4c7dd7.js`      | 25 KiB  | 45 KiB  |

**Recommendations:**
- The `ed9f2dc4` chunk (222 KiB, 100% wasted) is loaded but entirely unused on homepage — investigate whether it can be code-split or lazy-loaded.
- Defer/lazy-load Google Analytics (`gtag.js`) — use `strategy="lazyOnload"` in Next.js `<Script>`.
- Review Next.js bundle with `@next/bundle-analyzer` to identify what's in the large chunks.

### 2. Render-Blocking Requests (~520 ms savings)

Two CSS files are blocking the render path:

| Resource                                             | Size    | Wasted  |
| ---------------------------------------------------- | ------- | ------- |
| `_next/static/css/2390918ed1087231.css` (main CSS)   | 20.8 KB | 651 ms  |
| `_next/static/css/85c59171457d9c7c.css` (secondary)  | 1.4 KB  | 173 ms  |

**Recommendations:**
- Consider inlining critical CSS and deferring non-critical stylesheets.
- Next.js App Router loads CSS synchronously — ensure unused CSS purging is working via Tailwind's `content` config.

### 3. LCP: Missing `fetchpriority=high` on Logo Image

The LCP element is the header logo (`/logo/horizontal-logo-compact.png`). Lighthouse flagged:

- `fetchpriority=high` is NOT applied to the LCP image.
- The image is discoverable from initial HTML (good).
- The image is not lazy-loaded (good).

**Fix:** Add `priority` prop to the Next.js `<Image>` component for the header logo, which sets `fetchpriority="high"` and preloads the image.

```tsx
// Before
<Image src="/logo/horizontal-logo-compact.png" ... />

// After
<Image src="/logo/horizontal-logo-compact.png" priority ... />
```

### 4. Reduce Unused CSS (17 KiB wasted — 120 ms savings)

Tailwind CSS purging may not be catching all unused classes.

**Recommendations:**
- Verify `content` array in `tailwind.config.ts` covers all component paths.
- Use PurgeCSS or Tailwind's built-in purge in production mode.

### 5. Legacy JavaScript Polyfills (~20 KiB wasted)

Babel polyfills are being included unnecessarily:

| Script                                             | Wasted  | Polyfills detected              |
| -------------------------------------------------- | ------- | ------------------------------- |
| `_next/static/chunks/5459-7b38e4174e260800.js`     | 12.2 KB | `@babel/plugin-transform-classes` |
| `_next/static/chunks/7929.0ab49de1af4c7dd7.js`     | 7.9 KB  | `Object.entries` polyfill       |

**Recommendations:**
- Set `browserslist` targets to modern browsers only in `package.json` or `.browserslistrc`.
- Ensure Next.js `swcMinify` is enabled (it is by default in Next.js 13+).

---

## Main Thread Work (Mobile)

Total main thread work: **2.1 s** (flagged as too high)

| Category                    | Duration |
| --------------------------- | -------- |
| Script Evaluation           | 848 ms   |
| Other                       | 386 ms   |
| Style & Layout              | 380 ms   |
| Script Parsing & Compilation| 259 ms   |
| Rendering                   | 129 ms   |
| Garbage Collection          | 33 ms    |
| Parse HTML & CSS            | 26 ms    |

Script evaluation (848 ms) is the dominant cost — consistent with the large unused JS bundles.

### JS Execution Time (Mobile, top scripts)

| Script                                             | Execution Time |
| -------------------------------------------------- | -------------- |
| `https://myimageupscaler.com/` (main thread)       | 595 ms         |
| `ed9f2dc4-9294e2f1d73b0bd3.js`                     | 333 ms         |
| `5459-7b38e4174e260800.js`                         | 303 ms         |
| Unattributable                                     | 268 ms         |
| `googletagmanager.com/gtag/js`                     | 174 ms         |

---

## SEO Issues

**SEO Score: 100/100 (Mobile & Desktop) — No issues found.**

All Lighthouse SEO audits passed on both mobile and desktop. This confirms meta tags, structured data, canonicals, hreflang, and crawlability are all properly configured.

---

## Accessibility Issues

**Accessibility Score: 100/100 (Mobile & Desktop) — No issues found.**

---

## Best Practices Issues

### Mobile (Score: 92/100)

1. **Browser errors logged to console**
   - CSP violation: `analytics.ahrefs.com/api/event` is blocked by Content Security Policy (the `connect-src` directive does not include Ahrefs analytics).
   - PWA manifest error: `favicon.ico` is listed as an icon in the Web App Manifest but the resource size does not match what the manifest declares.

2. **Issues in Chrome DevTools Issues panel**
   - Same CSP violation for `analytics.ahrefs.com` — the analytics call is being blocked and logged.

### Desktop (Score: 88/100) — Additional issue vs Mobile

3. **Images displayed with incorrect aspect ratio**
   - Image: `/logo/horizontal-logo-compact.png`
   - Element: `header.sticky > div.mx-auto > a.flex > img.xs:hidden`
   - The `width="100" height="40"` HTML attributes don't match the natural dimensions of the PNG, causing a visual distortion on desktop.

### Other Diagnostics (Non-blocking)

- **Back/Forward Cache (bfcache)**: Page uses `WebLocks` API which prevents bfcache restoration. This is a "Pending browser support" limitation — no action required currently.
- **Missing source maps**: `ed9f2dc4-9294e2f1d73b0bd3.js` has no source map. Not a user-facing issue but makes debugging harder.
- **Forced reflow**: 55 ms of unattributed forced reflow detected (style recalculation triggered by JS reads before writes).
- **Cache efficiency**: Third-party scripts (Cloudflare beacon, Ahrefs analytics) have short cache TTLs (~1 day / 4 hours). ~6 KiB wasted bandwidth on repeat visits.

---

## Mobile vs Desktop Gap Analysis

| Metric                | Mobile  | Desktop | Gap      |
| --------------------- | ------- | ------- | -------- |
| Performance Score     | 72      | 92      | **-20**  |
| LCP                   | 6.8 s   | 1.8 s   | **-5.0 s** |
| TTI                   | 8.5 s   | 1.8 s   | **-6.7 s** |
| TBT                   | 220 ms  | 20 ms   | -200 ms  |
| FCP                   | 1.7 s   | 0.5 s   | -1.2 s   |
| Speed Index           | 2.6 s   | 1.0 s   | -1.6 s   |

The **20-point gap** between mobile (72) and desktop (92) is driven almost entirely by:
1. **LCP (6.8 s mobile vs 1.8 s desktop)**: The logo image is the LCP element on mobile. No `fetchpriority=high`, and CSS render-blocking adds ~650 ms before the browser even starts fetching it. The image itself may also be oversized for mobile.
2. **TTI (8.5 s mobile vs 1.8 s desktop)**: 448 KiB of unused JavaScript must be downloaded, parsed, and evaluated on the simulated slow-4G mobile connection, blocking the main thread for 8.5 s.
3. **TBT (220 ms mobile vs 20 ms desktop)**: Direct result of heavy JS evaluation (848 ms) on the slower simulated mobile CPU.

All gaps are network + CPU budget problems, not content differences. Fixing unused JS and adding `priority` to the LCP image would close most of the gap.

---

## Score vs Prior Audit Comparison

| Metric               | Feb 11, 2026 | Feb 25, 2026 | Change  |
| -------------------- | ------------ | ------------ | ------- |
| Mobile Performance   | 56           | **72**       | **+16** |
| Desktop Performance  | 91           | **92**       | +1      |
| Mobile LCP           | 7.8 s        | **6.8 s**    | -1.0 s  |
| SEO Score            | 100          | 100          | —       |
| Accessibility        | 100          | 100          | —       |

Notable improvement in mobile performance score (+16 points). LCP improved by ~1 second. The score jump is likely due to a combination of smaller JS bundles or improved caching since the Feb-11 audit.

---

## Priority Action Items

### High Priority

1. **Add `priority` to the LCP logo image** — Single-line fix in the header component. Adds `fetchpriority="high"` and a `<link rel="preload">` for the logo, which should directly reduce LCP by 300–700 ms.

2. **Eliminate the 222 KiB fully-unused JS chunk** (`ed9f2dc4`) — This chunk is 100% wasted bytes on the homepage. Run `@next/bundle-analyzer` to identify what's in it and either lazy-load it or eliminate the import. Expected savings: ~1,500–2,000 ms TTI on mobile.

3. **Defer Google Analytics** — Change GTM/GA4 `<Script>` to `strategy="lazyOnload"`. Saves ~69 KiB wasted on initial load and ~174 ms of main-thread JS execution. No SEO impact.

### Medium Priority

4. **Fix CSP to allow `analytics.ahrefs.com`** — Add `https://analytics.ahrefs.com` to the `connect-src` directive in the Content Security Policy. This is causing a console error on every page load and the Ahrefs analytics call is silently failing.

5. **Fix logo image aspect ratio** (`horizontal-logo-compact.png`) — The `width="100" height="40"` attributes don't match the natural image dimensions. Fix either the attributes or the image itself to prevent aspect ratio distortion (visible on desktop).

6. **Fix favicon.ico manifest entry** — The PWA manifest references `favicon.ico` as an icon but the declared size doesn't match the actual file. Either remove it from the manifest or ensure the `sizes` field matches the file dimensions.

### Low Priority

7. **Reduce render-blocking CSS** (~520 ms savings) — Inline critical CSS and defer non-critical stylesheets. This requires custom Next.js configuration or a plugin. Consider `next-critical` or manual critical CSS extraction.

8. **Remove legacy JavaScript polyfills** (~20 KiB) — Update `browserslist` to target modern browsers only and remove `@babel/plugin-transform-classes` from the build.

9. **Investigate forced reflow** — 55 ms of unattributed forced reflow from JS reading layout properties before writing. Use the Performance panel to identify the source and batch DOM reads/writes.

10. **Increase cache TTL for third-party scripts** — Cloudflare beacon (1 day) and Ahrefs analytics (4 hours) have shorter-than-ideal cache times. Not controllable on your end, but worth noting for repeat-visitor performance.

---

## Audit Summary

Mobile performance improved meaningfully from 56 to 72 since the February 11 audit, but LCP remains critically slow at 6.8 s (target: < 2.5 s). The root cause is a combination of 447 KiB of unused JavaScript blocking the main thread for 8.5 s, render-blocking CSS delaying the start of paint by ~650 ms, and the LCP element (header logo) missing `fetchpriority=high`. Desktop is in good shape at 92 with no SEO or accessibility issues. The three highest-ROI fixes — adding `priority` to the logo, eliminating the fully-unused 222 KiB JS chunk, and deferring GA4 — are all small, targeted changes that could realistically push mobile performance into the 85+ range.

---

*Generated by Lighthouse 13.0.3 on 2026-02-25. Mobile uses simulated slow 4G + 4x CPU throttling. Desktop uses no throttling.*
