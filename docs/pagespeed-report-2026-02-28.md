# PageSpeed Insights Report - Two pSEO Pages

**Date:** 2026-02-28
**Tool:** Lighthouse (local run via Chrome)
**Note on URLs:** The originally requested URLs (`/scale/2x-image-upscaler` and `/formats/jpeg-upscaler`) return 404. The closest valid equivalents were tested instead:
- Requested: `/scale/2x-image-upscaler` → Tested: `/scale/ai-upscaler-2x`
- Requested: `/formats/jpeg-upscaler` → Tested: `/formats/upscale-jpeg-images`

---

## Page 1: /scale/ai-upscaler-2x

**URL:** https://myimageupscaler.com/scale/ai-upscaler-2x

### Overall Scores

| Category       | Mobile | Desktop |
| -------------- | ------ | ------- |
| Performance    | **63** | **62**  |
| Accessibility  | 98     | 98      |
| Best Practices | 96     | 92      |
| SEO            | 100    | 100     |

### Lab Data

| Metric                         | Mobile      | Desktop     |
| ------------------------------ | ----------- | ----------- |
| First Contentful Paint (FCP)   | 1.8 s       | **1.8 s**   |
| **Largest Contentful Paint (LCP)** | **8.4 s** | **7.7 s** |
| **Total Blocking Time (TBT)**  | **380 ms**  | 20 ms       |
| Cumulative Layout Shift (CLS)  | 0.003       | 0.002       |
| **Speed Index**                | **4.6 s**   | **3.1 s**   |
| **Time to Interactive (TTI)**  | **8.5 s**   | **7.8 s**   |
| Server Response Time (TTFB)    | 310 ms      | 200 ms      |

### Performance Opportunities

#### 1. Reduce Unused JavaScript — Est. savings: 1,370 ms (mobile) / 1,190 ms (desktop), 212 KiB

**Issue:** 212 KiB of unused JS is being downloaded and parsed eagerly on every page load.

**Top offending scripts:**

| Script | Wasted (KiB) | Total (KiB) |
| ------ | ------------ | ----------- |
| `googletagmanager.com/gtag/js` | 69.6 | 150.4 |
| `_next/static/chunks/7716-59e71b0f.js` | 38.0 | 46.5 |
| `_next/static/chunks/3794-1dbfe9ba.js` | 36.7 | 74.6 |
| `_next/static/chunks/7929.0ab49de1.js` | 25.3 | 45.9 |
| `_next/static/chunks/2488-6689e2fe.js` | 21.7 | 41.0 |
| `_next/static/chunks/4bd1b696.js` | 20.9 | 62.6 |

**Recommendations:**
- Use Next.js dynamic imports (`next/dynamic`) to code-split chunks not needed on initial render
- Lazy-load GTM until after the page is interactive using a `setTimeout` or `requestIdleCallback` wrapper
- Audit chunk `3794-1dbfe9ba.js` (36.7 KiB wasted, top JS execution driver: 513 ms) — likely a large utility bundle that can be split

#### 2. Reduce Unused CSS — Est. savings: 180 ms (mobile) / 310 ms (desktop), 17 KiB

**Issue:** 17 KiB of unused Tailwind CSS rules are shipped to every visitor.

**Recommendations:**
- Verify Tailwind `content` config includes all files to enable accurate purging
- Enable `@tailwindcss/jit` if not already active
- Consider extracting critical above-the-fold CSS inline and deferring the rest

### Main Thread Work (Mobile) — Total: 2.3 s

| Category                  | Duration (ms) |
| ------------------------- | ------------- |
| Script Evaluation         | 1,175         |
| Style & Layout            | 475           |
| Other                     | 388           |
| Script Parsing & Compilation | 198        |
| Parse HTML & CSS          | 43            |
| Rendering                 | 37            |

**Key JS execution hotspots (mobile):**
- `3794-1dbfe9ba.js`: 513 ms
- `8703.a035cc39.js`: 428 ms
- Page document itself: 345 ms
- GTM: 173 ms

### Best Practices Issues

| Issue | Notes |
| ----- | ----- |
| Browser errors logged to console | JavaScript errors thrown at runtime — investigate with DevTools |
| Images with incorrect aspect ratio (desktop only) | An image is rendered at a different aspect ratio than its intrinsic dimensions |

**Fix:** Open DevTools Console on the page and resolve any JS errors. For the aspect ratio issue, add explicit `width` and `height` attributes matching the intrinsic image dimensions on image elements.

### SEO Issues

None. SEO score is 100/100 on both mobile and desktop.

### Accessibility Issues

| Issue | Notes |
| ----- | ----- |
| Heading elements not in sequentially-descending order | H-tags skip levels (e.g. H1 → H3, skipping H2) |

**Fix:** Audit heading hierarchy in the page template. Ensure headings go H1 → H2 → H3 without skipping levels.

### Additional Diagnostics

| Diagnostic | Value |
| ---------- | ----- |
| Render Blocking Requests | Est. 550 ms savings (mobile) / 650 ms (desktop) |
| Legacy JavaScript | Est. 20 KiB savings (polyfills for modern browsers) |
| LCP Breakdown | Sub-optimal — TTFB + render delay dominant |
| bfcache Prevention | 1 failure reason preventing back/forward cache |
| Forced Reflow | JavaScript reading layout properties mid-frame |
| Cache Efficiency | 6 KiB uncached static assets |

---

## Page 2: /formats/upscale-jpeg-images

**URL:** https://myimageupscaler.com/formats/upscale-jpeg-images

### Overall Scores

| Category       | Mobile | Desktop |
| -------------- | ------ | ------- |
| Performance    | **63** | **65**  |
| Accessibility  | 98     | 98      |
| Best Practices | 96     | 92      |
| SEO            | 100    | 100     |

### Lab Data

| Metric                             | Mobile      | Desktop     |
| ---------------------------------- | ----------- | ----------- |
| First Contentful Paint (FCP)       | 1.4 s       | 1.4 s       |
| **Largest Contentful Paint (LCP)** | **7.3 s**   | **6.6 s**   |
| **Total Blocking Time (TBT)**      | **460 ms**  | 20 ms       |
| Cumulative Layout Shift (CLS)      | 0.003       | 0.002       |
| **Speed Index**                    | **3.6 s**   | **2.7 s**   |
| **Time to Interactive (TTI)**      | **7.4 s**   | **6.7 s**   |
| Server Response Time (TTFB)        | 460 ms      | 150 ms      |

**Note:** Mobile TTFB is 460 ms, which is notably higher than desktop (150 ms). This suggests the server-side rendering may be performing expensive work under mobile throttled network simulation, or there is a CDN edge-cache miss specifically triggered by mobile user-agents.

### Performance Opportunities

#### 1. Reduce Unused JavaScript — Est. savings: 1,260 ms (mobile) / 910 ms (desktop), 213 KiB

**Issue:** Identical set of unused JS chunks as the scale page — this is a site-wide bundle issue.

**Top offending scripts:**

| Script | Wasted (KiB) | Total (KiB) |
| ------ | ------------ | ----------- |
| `googletagmanager.com/gtag/js` | 69.6 | 150.4 |
| `_next/static/chunks/7716-59e71b0f.js` | 38.0 | 46.5 |
| `_next/static/chunks/3794-1dbfe9ba.js` | 36.7 | 74.6 |
| `_next/static/chunks/7929.0ab49de1.js` | 25.3 | 46.0 |
| `_next/static/chunks/2488-6689e2fe.js` | 22.0 | 41.1 |
| `_next/static/chunks/4bd1b696.js` | 20.9 | 62.6 |

**Recommendations:** Same as scale page — this is the exact same Next.js bundle shipped to all pSEO pages.

#### 2. Reduce Unused CSS — Est. savings: 150 ms (mobile), 17 KiB

**Issue:** 17 KiB of unused CSS, same as scale page.

### Main Thread Work (Mobile) — Total: 2.5 s

| Category                  | Duration (ms) |
| ------------------------- | ------------- |
| Script Evaluation         | 1,258         |
| Style & Layout            | 480           |
| Other                     | 422           |
| Script Parsing & Compilation | 239        |
| Rendering                 | 73            |
| Parse HTML & CSS          | 30            |

**Key JS execution hotspots (mobile):**
- `3794-1dbfe9ba.js`: 659 ms (worse than scale page's 513 ms)
- `8703.a035cc39.js`: 439 ms
- Page document itself: 374 ms
- GTM: 198 ms
- `4bd1b696.js`: 122 ms

### Best Practices Issues

| Issue | Notes |
| ----- | ----- |
| Browser errors logged to console | JavaScript errors thrown at runtime |
| Images with incorrect aspect ratio (desktop only) | Same as scale page |

### SEO Issues

None. SEO score is 100/100 on both mobile and desktop.

### Accessibility Issues

| Issue | Notes |
| ----- | ----- |
| Heading elements not in sequentially-descending order | Same heading hierarchy issue as scale page |

### Additional Diagnostics

| Diagnostic | Value |
| ---------- | ----- |
| Render Blocking Requests | Est. 210 ms savings (mobile) / 290 ms (desktop) |
| Legacy JavaScript | Est. 20 KiB savings |
| bfcache Prevention | 1 failure reason |
| Forced Reflow | Yes |
| Cache Efficiency | 6 KiB uncached assets |
| JS Execution Time | 1.3 s (flagged separately — worse than scale page) |

---

## Cross-Page Comparison

| Metric                    | /scale/ai-upscaler-2x (M) | /scale/ai-upscaler-2x (D) | /formats/upscale-jpeg-images (M) | /formats/upscale-jpeg-images (D) |
| ------------------------- | ------------------------- | ------------------------- | -------------------------------- | -------------------------------- |
| Performance Score         | **63**                    | **62**                    | **63**                           | **65**                           |
| LCP                       | **8.4 s**                 | **7.7 s**                 | **7.3 s**                        | **6.6 s**                        |
| CLS                       | 0.003                     | 0.002                     | 0.003                            | 0.002                            |
| TBT                       | **380 ms**                | 20 ms                     | **460 ms**                       | 20 ms                            |
| TTI                       | **8.5 s**                 | **7.8 s**                 | **7.4 s**                        | **6.7 s**                        |
| TTFB                      | 310 ms                    | 200 ms                    | **460 ms**                       | 150 ms                           |
| Accessibility             | 98                        | 98                        | 98                               | 98                               |
| SEO                       | 100                       | 100                       | 100                              | 100                              |

---

## Priority Action Items

### High Priority

1. **Fix LCP (Largest Contentful Paint) — both pages are in the "Poor" zone (>4s threshold)**
   - LCP of 7.3–8.4 s on mobile is the single biggest Core Web Vitals failure
   - Identify the LCP element (likely a hero image or large above-the-fold component)
   - Preload the LCP resource: add `<link rel="preload" as="image">` for hero images
   - Ensure the LCP image is not lazy-loaded (remove `loading="lazy"` from above-fold images)
   - If LCP is text, ensure fonts are preloaded and `font-display: swap` is set

2. **Reduce Unused JavaScript (212–213 KiB wasted, 910–1,370 ms savings)**
   - This is the same bundle for both pages — a fix here benefits all pSEO pages site-wide
   - Audit `3794-1dbfe9ba.js` (36 KiB wasted, top execution time) using `next build --analyze` or `@next/bundle-analyzer`
   - Lazy-load GTM (~70 KiB wasted): wrap GTM init in `setTimeout(fn, 3000)` or fire after `load` event
   - Use `next/dynamic` with `ssr: false` for any interactive components not needed for initial render

3. **Fix Mobile TTFB for /formats page (460 ms)**
   - Desktop TTFB is 150 ms; mobile is 460 ms — an unusual 3x gap
   - Investigate whether any server-side data fetch (Supabase query, API call) runs during SSR for this route
   - Add Cloudflare caching headers for pSEO pages to serve from edge cache on repeat visits

### Medium Priority

4. **Eliminate Render-Blocking Requests (550–650 ms savings on scale page)**
   - Identify which CSS or synchronous scripts block rendering
   - Move non-critical scripts to use `defer` or `async`
   - Inline critical CSS for above-the-fold content

5. **Remove Legacy JavaScript Polyfills (20 KiB)**
   - Modern browsers don't need these polyfills
   - In `next.config.js`, set `browserslist` targets to modern browsers only or configure `swcMinify: true` with appropriate targets

6. **Fix bfcache (Back/Forward Cache) Prevention**
   - 1 failure reason is blocking bfcache on both pages, which hurts perceived navigation speed
   - Common causes: `unload` event listeners, `Cache-Control: no-store`, or open IndexedDB connections
   - Use Chrome DevTools > Application > Back/Forward Cache to identify the specific failure

7. **Fix Heading Hierarchy (Accessibility, both pages)**
   - Headings skip levels — fix in the pSEO page template so all pages benefit simultaneously

### Low Priority

8. **Fix Images with Incorrect Aspect Ratio (Desktop, Best Practices)**
   - Add explicit `width` and `height` attributes to `<img>` or `<Image>` components
   - Ensures the browser reserves the correct layout space before the image loads

9. **Reduce Unused CSS (17 KiB)**
   - Relatively low savings vs effort; but worth verifying Tailwind purge config is optimal

10. **Investigate and Fix Console Errors (Best Practices)**
    - Browser errors at runtime indicate JS exceptions — even if non-fatal, they can mask real issues and affect Best Practices score

---

## Summary

Both pSEO pages score identically at 63–65 on Performance (mobile and desktop), placing them in the "Needs Improvement" range. The dominant issue on both pages is a critically poor LCP of 7–8.4 seconds on mobile, driven by a large above-the-fold element (likely a hero image or component) that is not preloaded. This single metric is responsible for most of the performance deficit. CLS is excellent on both pages (0.002–0.003), and SEO scores a perfect 100/100. The unused JavaScript problem is identical across both pages and affects all pSEO pages site-wide, meaning fixing the bundle configuration once will benefit the entire pSEO section. Desktop TBT is fine (20 ms), but mobile TBT is high (380–460 ms), indicating significant main-thread blocking during JavaScript parse and execution under throttled CPU conditions.
