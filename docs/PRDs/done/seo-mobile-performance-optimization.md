# PRD: Mobile Performance Optimization

**Based on:** SEO Health Report dated 2026-02-25 (`docs/SEO/reports/seo-report-2026-02-25.md`)
**Status:** Active
**Scope:** Eliminate unused JS bundle (222 KiB), verify JS bundle secrets, improve mobile LCP
**Mobile Performance:** 72/100 (was 56 — improved but LCP still 6.8s)
**Total Effort:** ~5-6 hours

---

## Complexity Assessment

```
+2  Touches build config, chunk splitting, potentially multiple components
+2  Performance changes require measurement before/after
+1  Security investigation (JS bundle secrets)
```

**Complexity: 5 → MEDIUM mode**

---

## Context

**Problem:** Mobile performance is 72/100 with LCP at 6.8s. The single largest bottleneck is a 222 KiB JavaScript chunk (`ed9f2dc4`) that is 100% unused on the homepage — it adds an estimated 2,320ms to mobile load time. Two render-blocking CSS files add another 520ms. Additionally, SquirrelScan flagged potential secrets in JS bundles that need investigation.

**Current State:**

- Mobile Lighthouse: 72 (desktop 92)
- LCP: 6.8s mobile / 1.8s desktop
- TBT: 220ms mobile / 20ms desktop
- TTI: 8.5s mobile / 1.8s desktop
- `ed9f2dc4` chunk: 222 KiB, 100% unused on homepage (Lighthouse Coverage report)
- Hero image: Already has `fetchPriority="high"` and is server-rendered for fast LCP
- SquirrelScan: Flagged Supabase anon key, Stripe publishable key, Google OAuth client ID, and 2 potential AWS secret patterns in JS chunks

**Realistic target:** Eliminating the unused chunk + CSS optimization → mobile performance 85+, LCP < 4s.

---

## Execution Phases

### Phase 1: Investigate and Verify JS Bundle Secrets (1 hour, DO FIRST)

**User-visible outcome:** Confirm whether the SquirrelScan-flagged "secrets" in JS bundles are real secrets or intentionally public keys.

**Root cause:** SquirrelScan detects high-entropy strings in client JS bundles and flags them as potential secrets. Some are expected to be public (Supabase anon key, Stripe publishable key, Google OAuth client ID). Others (2 AWS-pattern strings) need verification.

**Files to investigate:**

- Build output: `.next/static/chunks/` or equivalent
- `shared/config/env.ts` — check which env vars are in `clientEnv` vs `serverEnv`

**Implementation:**

- [ ] Run `yarn build` and inspect the output chunks
- [ ] Search built JS for patterns matching `AKIA` (AWS access key prefix) or long base64 strings
- [ ] Cross-reference with `clientEnv` in `shared/config/env.ts` — anything in clientEnv is intentionally public
- [ ] Verify:
  - Supabase anon key → **Expected in client bundle** (public by design, protected by RLS)
  - Stripe publishable key → **Expected in client bundle** (public by design, starts with `pk_`)
  - Google OAuth client ID → **Expected in client bundle** (public by design, used for OAuth redirect)
  - AWS patterns → **INVESTIGATE** — if real AWS secret keys, this is a security incident requiring immediate key rotation
- [ ] Document findings: which strings are safe (public keys) vs which need rotation

**No tests needed** — this is an investigation task.

**Verification:**

1. If AWS patterns are confirmed as false positives (e.g., Cloudflare Worker tokens, or high-entropy strings that aren't actually AWS keys), document and close
2. If real AWS secrets are found: immediately rotate the keys, move to `serverEnv`, and create a separate security incident PRD

---

### Phase 2: Identify and Eliminate Unused JS Chunk (3-4 hours)

**User-visible outcome:** Homepage loads 222 KiB less JavaScript. Mobile LCP drops from 6.8s toward 4s. TTI drops from 8.5s.

**Root cause:** A chunk identified as `ed9f2dc4` (222 KiB) is 100% unused on the homepage per Lighthouse Coverage. This chunk is likely pulled in by a dynamic import or a component that's included in the page bundle but never rendered on the homepage.

**Investigation Steps:**

- [ ] Run Lighthouse with Coverage panel to identify the exact chunk filename in the current build
- [ ] Use `@next/bundle-analyzer` to visualize chunk contents:
  ```bash
  ANALYZE=true yarn build
  ```
  If not configured, add it temporarily to `next.config.js`:
  ```javascript
  const withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: process.env.ANALYZE === 'true',
  });
  ```
- [ ] Identify what code is in the chunk — likely candidates:
  - Heavy library (e.g., a charting lib, markdown processor, or image manipulation lib) imported at the page level
  - A client component that should be dynamically imported but isn't
  - A third-party script bundled instead of loaded externally
- [ ] Once identified, apply the appropriate fix:

**Fix strategies (pick based on investigation):**

**Strategy A: Dynamic Import**
If the chunk contains a component only needed after user interaction:

```typescript
// FROM:
import { HeavyComponent } from '@/components/HeavyComponent';

// TO:
import dynamic from 'next/dynamic';
const HeavyComponent = dynamic(() => import('@/components/HeavyComponent'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-muted rounded-xl" />,
});
```

**Strategy B: Route-level Code Splitting**
If the chunk contains code for a different route that's leaking into the homepage:

- Check `app/page.tsx` and `app/layout.tsx` for unnecessary imports
- Move heavy imports to the specific route that needs them

**Strategy C: External Script**
If the chunk is a third-party analytics/tracking script:

```typescript
// Move from bundled import to external script
<Script src="https://..." strategy="lazyOnload" />
```

**Tests Required:**

| Test File                                         | Test Name                                     | Assertion                                  |
| ------------------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| `tests/unit/performance/bundle-size.unit.spec.ts` | `Homepage JS payload should be under 400 KiB` | Total JS transferred on homepage < 400 KiB |

**Verification:**

1. Run `yarn build` before and after → compare `.next/static` sizes
2. Run Lighthouse on homepage → mobile performance should improve to 80+
3. Run Coverage panel → confirm the previously-unused chunk is eliminated or reduced

---

### Phase 3: Address Render-Blocking CSS (1 hour)

**User-visible outcome:** FCP improves by ~520ms on mobile. CSS is loaded without blocking first paint.

**Root cause:** 2 CSS files block first paint per Lighthouse. These are likely global Tailwind CSS + a component library CSS file.

**Investigation Steps:**

- [ ] Run Lighthouse and identify the 2 render-blocking CSS files
- [ ] Determine if they're:
  - Tailwind main CSS (expected, hard to defer)
  - Third-party CSS (can be deferred or inlined critical CSS)
  - Component-specific CSS (can be lazy-loaded)

**Implementation (based on investigation):**

- [ ] If a third-party CSS file: load with `media="print"` then swap to `all`:
  ```html
  <link rel="stylesheet" href="..." media="print" onload="this.media='all'" />
  ```
- [ ] If Tailwind CSS is too large: ensure purge is working correctly in `tailwind.config.ts`
  - Check for patterns that prevent purging (template literals for class names, etc.)
  - The report mentions 17 KiB unused CSS → verify Tailwind content paths cover all files
- [ ] Consider extracting critical CSS for above-the-fold content using `critters` or similar

**Tests Required:**

Performance tests should be manual Lighthouse runs before/after.

**Verification:**

1. Run Lighthouse → FCP should improve
2. Confirm no visual regressions (CSS still loads correctly)

---

## Acceptance Criteria

- [ ] Phase 1: JS bundle secrets investigation documented — all flagged patterns classified as safe or escalated
- [ ] Phase 2: Homepage unused JS reduced by at least 150 KiB
- [ ] Phase 2: Mobile Lighthouse performance score >= 80
- [ ] Phase 3: Render-blocking CSS reduced (FCP improvement measurable)
- [ ] `yarn verify` passes (no regressions from optimization changes)

---

## Expected Impact

| Fix                       | Metric            | Expected Change  |
| ------------------------- | ----------------- | ---------------- |
| Eliminate unused JS chunk | Mobile perf score | 72 → 82+         |
| Eliminate unused JS chunk | Mobile LCP        | 6.8s → ~4.5s     |
| Eliminate unused JS chunk | Mobile TTI        | 8.5s → ~6s       |
| Render-blocking CSS       | Mobile FCP        | 1.7s → ~1.2s     |
| Combined                  | CWV score         | 80/100 → ~88/100 |

**Note:** These are estimates. Actual improvement depends on what's in the chunk and the user's network conditions. Lighthouse scores on slow 3G (default mobile emulation) will show larger improvements than real-world 4G/WiFi.

---

## Checkpoint Protocol

After each phase, run:

```bash
yarn verify
```

Run Lighthouse before Phase 2 starts (baseline) and after Phase 2/3 complete (comparison).
