# PageSpeed Insights Report — myimageupscaler.com

**Date:** 2026-02-25
**Tool:** Lighthouse 13.0.3 (local run via Chrome)
**URL tested:** https://myimageupscaler.com

---

## Overall Scores

| Category       | Mobile | Desktop |
| -------------- | ------ | ------- |
| Performance    | **48** | 99      |
| Accessibility  | 100    | 100     |
| Best Practices | 96     | 92      |
| SEO            | 100    | 100     |

---

## Lab Data

| Metric                         | Mobile     | Desktop |
| ------------------------------ | ---------- | ------- |
| First Contentful Paint (FCP)   | **3.2 s**  | 0.4 s   |
| Largest Contentful Paint (LCP) | **7.6 s**  | 1.0 s   |
| Total Blocking Time (TBT)      | **670 ms** | 30 ms   |
| Cumulative Layout Shift (CLS)  | 0          | 0.003   |
| Speed Index                    | **6.0 s**  | 0.7 s   |
| Time to Interactive (TTI)      | **7.6 s**  | 1.0 s   |
| Server Response Time (TTFB)    | 320 ms     | 110 ms  |

---

## Root Cause: LCP Breakdown

| LCP Subpart              | Duration     |
| ------------------------ | ------------ |
| Time to First Byte       | 346 ms       |
| **Element render delay** | **2,310 ms** |

The LCP image (`fetchPriority="high"`) is in the HTML immediately, but the browser waits
**2.3 full seconds** before it can paint it. This is because JavaScript blocks the main
thread for that entire duration.

### Main Thread Work (Mobile)

| Category                     | Duration     |
| ---------------------------- | ------------ |
| **Script Evaluation**        | **1,167 ms** |
| Style & Layout               | 542 ms       |
| Other                        | 421 ms       |
| Script Parsing & Compilation | 209 ms       |
| Parse HTML & CSS             | 42 ms        |
| Rendering                    | 35 ms        |

**Total: ~2,416 ms** — matches the element render delay almost exactly.

---

## Performance Opportunities

### 1. Reduce Unused JavaScript — Est. 1,280 ms savings (224 KiB)

| Script | Wasted | Total |
| ------ | ------ | ----- |
| `googletagmanager.com/gtag/js` | 69 KB | 150 KB |
| `3794-1dbfe9bacde4d3ca.js` | 43 KB | 74 KB |
| `7716-59e71b0f32322ac9.js` | 37 KB | 46 KB |
| `2488-6689e2fe6514ac29.js` | 27 KB | 41 KB |
| `7929.0ab49de1af4c7dd7.js` | 25 KB | 45 KB |
| `4bd1b696-6b5c0c72b0eadc5f.js` | 20 KB | 62 KB |

### 2. Reduce Unused CSS — Est. 190 ms savings (17 KiB)

### 3. JS Execution Time by Chunk

| Script | Execution Time |
| ------ | -------------- |
| `4bd1b696-6b5c0c72b0eadc5f.js` | **494 ms** |
| `myimageupscaler.com/` (page)  | 420 ms |
| `3794-1dbfe9bacde4d3ca.js`     | **397 ms** |
| Unattributable                 | 350 ms |
| `2488-6689e2fe6514ac29.js`     | 251 ms |
| `googletagmanager.com/gtag/js` | 198 ms |

The `4bd1b696` chunk (494 ms execution, 62 KB) is framer-motion.

---

## Root Cause Analysis

### framer-motion is in the critical JS path

Three components eagerly import framer-motion on every page load:

1. **`client/components/landing/HeroActions.tsx`** — `import { motion } from 'framer-motion'`
   rendered inside the hero section (above the fold, hard critical path)
2. **`client/components/pages/HomePageClient.tsx`** — direct `motion.a` / `motion.button` usage
3. **`HomePageClient.tsx`** — imports `FadeIn` from `MotionWrappers.tsx` which also imports framer-motion

Because all three are in the initial bundle, **framer-motion executes on the main thread
before any pixel is painted**, causing 494 ms of JS execution plus cascading Style/Layout
work → LCP 7.6 s on mobile (vs 1.0 s on desktop where there's no CPU throttle).

---

## Best Practices Issues

| Issue | Details |
| ----- | ------- |
| Browser errors in console | Manifest icon error: `favicon.ico` "Resource size is not correct" |
| Incorrect aspect ratio (desktop) | One image displayed at wrong aspect ratio |

---

## Priority Action Items

### High Priority

1. **Remove framer-motion from the critical path** — Replace `motion.button`/`motion.a` in
   `HeroActions.tsx` and `HomePageClient.tsx` with plain elements + CSS transitions
   (`hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200`).
   Replace `<FadeIn>` wrappers with plain divs or a CSS-only fade class. Expected LCP
   improvement: 7.6 s → ~3–4 s.

2. **Fix favicon manifest error** — The PWA manifest `icons` array references `favicon.ico`
   with an incorrect declared size. Replace with properly sized PNG icons.

3. **Lazy-load GTM** — Google Tag Manager loads 150 KB with 69 KB wasted on initial load.
   Defer via `requestIdleCallback` or load after first user interaction.

### Medium Priority

4. **Audit the `3794` chunk** (43 KB wasted, 397 ms execution) — identify this dependency
   via `npx next build && npx next-bundle-analyzer` and split/lazy-load it.

5. **Reduce unused CSS (17 KiB)** — purge unused Tailwind classes or split per-route.

### Low Priority

6. **Fix image aspect ratio warning** (desktop Best Practices: 92).

7. **Enable bfcache** — investigate the 1 failure reason blocking back/forward cache.

---

## Summary

Desktop is excellent at 99/100 (LCP 1.0 s). Mobile fails at 48/100 with LCP 7.6 s, driven
by a 2,310 ms element render delay. The browser finds the LCP image immediately in HTML
(due to the `fetchPriority="high"` static img tag) but cannot paint it until all JavaScript
finishes executing. The root cause is **framer-motion loaded eagerly in three components**
in the hero section's critical path, consuming ~500 ms of CPU on throttled mobile and
triggering ~1.9 s of cascading main-thread work. Removing framer-motion from the initial
bundle is the single highest-leverage fix available.
