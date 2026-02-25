# PageSpeed Insights Report — myimageupscaler.com

**Date:** 2026-02-25
**Tool:** Lighthouse 13.0.3 (local run via Chrome 138.0.7204.183)
**URL tested:** https://myimageupscaler.com

---

## Overall Scores

| Category        | Mobile | Desktop |
| --------------- | :----: | :-----: |
| Performance     | **63** | 92      |
| Accessibility   | 96     | 96      |
| Best Practices  | 92     | **88**  |
| SEO             | 100    | 100     |

> Mobile performance at **63** is the critical concern. Desktop is healthy at **92**.

---

## Lab Data

| Metric                         | Mobile       | Desktop  |
| ------------------------------ | :----------: | :------: |
| First Contentful Paint (FCP)   | 1.4 s        | 0.5 s    |
| **Largest Contentful Paint (LCP)** | **7.7 s** ❌ | 1.8 s ⚠️ |
| **Total Blocking Time (TBT)**  | **410 ms** ⚠️| 20 ms    |
| Cumulative Layout Shift (CLS)  | 0.003 ✅     | 0.003 ✅  |
| Speed Index                    | 4.4 s ⚠️    | 1.0 s    |
| **Time to Interactive (TTI)**  | **7.8 s** ❌ | 1.8 s    |
| Server Response Time (TTFB)    | **1,180 ms** ❌ | 140 ms |

> CLS is excellent. Everything else on mobile needs work — particularly LCP (7.7s) and TTFB (1.18s).

---

## Performance Opportunities

### 1. Reduce Unused JavaScript — **Est. savings: 2,250 ms / 441 KiB** (Mobile) ❌

The biggest single fix. ~441 KiB of JS is loaded but never executed on the homepage.

**Top offenders:**

| Script | Wasted | Total |
| ------ | ------: | -----: |
| `ed9f2dc4-914a70998901afd4.js` | 228 KiB | 228 KiB (100% wasted!) |
| `gtag/js` (Google Analytics) | 71 KiB | 154 KiB |
| `5459-c03c1f5573ceab96.js` | 44 KiB | 76 KiB |
| `7716-59e71b0f32322ac9.js` | 39 KiB | 48 KiB |
| `7929.0ab49de1af4c7dd7.js` | 26 KiB | 47 KiB |
| `2488-6689e2fe6514ac29.js` | 22 KiB | 42 KiB |
| `4bd1b696-6b5c0c72b0eadc5f.js` | 21 KiB | 64 KiB |

**Actions:**
- The `ed9f2dc4` chunk (228 KiB, 100% wasted) is entirely unused — investigate if it can be split or lazy-loaded
- Use `next/dynamic` with `{ ssr: false }` for heavy UI components not needed on first paint
- Defer Google Analytics with `strategy="lazyOnload"` via `next/script`
- Audit each large chunk in Next.js bundle analyzer (`ANALYZE=true yarn build`)

### 2. Reduce Initial Server Response Time — **Est. savings: 1,080 ms** (Mobile) ❌

TTFB is **1,180 ms on mobile** vs **140 ms on desktop**. This gap suggests a cold-start or geolocation issue, not a code problem per se.

**Actions:**
- Check Cloudflare Pages cache hit rate for the homepage
- Ensure SSG/ISR is used for the homepage — avoid SSR if not needed
- Confirm the Cloudflare edge function (if any) isn't adding latency on cold starts

### 3. Reduce Unused CSS — **Est. savings: 150 ms / 17 KiB** (Mobile)

17 KiB of CSS is unused on the homepage.

**Actions:**
- Run PurgeCSS / Tailwind's content scanning to ensure unused utility classes are tree-shaken
- Confirm `tailwind.config.js` content paths are correct and not too broad

### 4. Render Blocking Requests — **Est. savings: 260 ms** (Mobile)

Some resources are blocking the initial render.

**Actions:**
- Audit `<link rel="stylesheet">` and `<script>` tags in `<head>` for blocking resources
- Use `rel="preload"` for critical fonts/CSS
- Move non-critical scripts to use `defer` or `async`

---

## Main Thread Work (Mobile — 2.1 s total)

| Category               | Duration |
| ---------------------- | -------: |
| Script Evaluation      | 858 ms   |
| Other                  | 464 ms   |
| Style & Layout         | 356 ms   |
| Script Parsing & Compilation | 223 ms |
| Rendering              | 150 ms   |
| Parse HTML & CSS       | 25 ms    |

> Script Evaluation (858 ms) dominates. Reducing unused JS will directly cut this.

**JS Execution Hotspots (Mobile):**

| Script | Execution Time |
| ------ | -------------: |
| Main document (inline) | 465 ms |
| `5459-c03c1f5573ceab96.js` | 337 ms |
| `2488-6689e2fe6514ac29.js` | 313 ms |
| `ed9f2dc4-914a70998901afd4.js` | 279 ms |
| Unattributable | 232 ms |
| Google Tag Manager | 147 ms |

---

## Best Practices Issues

### Browser Console Errors (Mobile + Desktop) ❌

Errors are being logged to the browser console. These need investigation.

**Actions:**
- Open DevTools Console on the live site and identify the specific errors
- Common causes: failed API calls, missing resources, third-party script errors
- Fix or suppress expected errors (e.g., 404s for optional resources)

### Chrome DevTools Issues Panel (Mobile + Desktop) ❌

Issues logged to the Issues panel — likely related to cookies, security headers, or deprecated APIs.

**Actions:**
- Open DevTools → Issues tab on the live site
- Common: SameSite cookie warnings, mixed content, deprecated features

### Image Aspect Ratio Mismatch (Desktop only) ❌

One or more images are displayed at a different aspect ratio than their natural dimensions.

**Actions:**
- Inspect images with `object-fit: contain/cover` or explicit `width`/`height` attributes
- Use Next.js `<Image>` component with correct `width` and `height` props

### Missing Source Maps for Large JS (Mobile + Desktop)

First-party JS bundles lack source maps, making debugging harder. Not a user-facing issue but a DX concern.

### Back/Forward Cache (bfcache) Failure (Mobile + Desktop)

The page cannot be restored from bfcache (1 failure reason).

**Actions:**
- Check for `unload` event listeners — replace with `pagehide`
- Avoid `cache-control: no-store` on main document if possible

### Legacy JavaScript (Mobile + Desktop) — Est. savings: 20 KiB

Transpiling modern JS syntax unnecessarily for old browsers wastes ~20 KiB.

**Actions:**
- Update `browserslist` in `package.json` to target modern browsers only
- Check `next.config.js` for any overly broad transpilation targets

---

## SEO Issues

None. Score: **100/100** on both mobile and desktop. ✅

---

## Accessibility Issues

### Color Contrast (Mobile + Desktop) ⚠️

Some text/background color combinations don't meet WCAG AA contrast ratio (4.5:1 for normal text).

**Actions:**
- Run axe DevTools or use Chrome Accessibility Inspector to identify the specific elements
- Likely candidates: placeholder text, secondary/muted text, disabled states
- Increase contrast of affected text to at least 4.5:1

---

## Priority Action Items

### High Priority

1. **Fix mobile LCP (7.7s → target <2.5s)** — The LCP element (likely the hero image) loads too late. Investigate: preload the LCP image, ensure it's not lazy-loaded, use `priority` on the Next.js `<Image>`. This is the single most impactful metric for Core Web Vitals.

2. **Reduce unused JS (441 KiB → <100 KiB)** — The `ed9f2dc4` chunk is 228 KiB and 100% wasted. Run `ANALYZE=true yarn build` to identify it and lazy-load it. Defer GTM (`strategy="lazyOnload"`). Estimated 2.25s savings on mobile TBT/TTI.

3. **Investigate TTFB spike on mobile (1,180ms vs 140ms desktop)** — This 8x gap between mobile and desktop TTFB is abnormal. Could be Cloudflare cold start, SSR overhead, or geolocation-based routing. Check Cloudflare cache analytics for `/` hit rate.

### Medium Priority

4. **Fix browser console errors** — Unknown errors affect best practices score and could indicate broken functionality for users. Open DevTools console on prod and fix/suppress them.

5. **Fix image aspect ratio mismatch (desktop)** — Ensure all `<Image>` components have correct `width`/`height` matching the natural image dimensions.

6. **Fix color contrast** — At least one element fails WCAG AA. Use axe to identify it and darken the text or lighten the background accordingly.

### Low Priority

7. **Eliminate render-blocking resources** — Saves ~260ms on mobile. Defer non-critical CSS/JS.

8. **Fix bfcache** — Remove `unload` listeners, enable back/forward cache for better perceived navigation speed.

9. **Reduce unused CSS (17 KiB)** — Verify Tailwind content scanning covers all active files. Minor savings.

---

## Summary

Desktop performance is solid (92/100), but **mobile performance is a concern at 63/100**, driven almost entirely by a catastrophic LCP of 7.7s and high TTI of 7.8s. The root causes are clear: a 228 KiB JavaScript chunk that is 100% unused on the homepage, and an abnormally high TTFB of 1,180ms on mobile (vs 140ms desktop). SEO is perfect (100/100) and accessibility is near-perfect (96/100). The single most impactful improvement would be investigating and fixing the LCP element loading latency, combined with aggressive JS splitting of the `ed9f2dc4` bundle.

---

*Generated by Lighthouse 13.0.3 — local run, simulated mobile throttling (slow 4G, 4× CPU slowdown)*
