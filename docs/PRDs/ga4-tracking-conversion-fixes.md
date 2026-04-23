# PRD: GA4 Tracking & Conversion Fixes

**Complexity: 1 → LOW**
**Status:** Ready for implementation

---

## 1. Context

**Problem:** GA4 records 0 organic conversions and attributes 89% of organic sessions to `(not set)` landing page, making SEO analysis nearly blind.

**Files Analyzed:**
- `client/components/analytics/GoogleAnalytics.tsx`
- `client/components/stripe/CheckoutModal.tsx`
- `client/hooks/useCheckoutAnalytics.ts`
- `next.config.js` (redirects — already done, no action needed)

**Current Behavior:**
- `GoogleAnalytics` loads `gtag.js` with `strategy="lazyOnload"` and `send_page_view: false`
- `GAPageViewTracker` fires `useEffect` on mount; `window.gtag` is `undefined` at that moment → guard returns early → landing page page_view is never sent
- On subsequent SPA navigations `gtag` has loaded → page views work fine → 11% of sessions get a landing page
- `handleComplete` in `CheckoutModal` calls `markCompleted()` + Amplitude events but never calls `gaSendEvent` → GA4 sees 0 purchases
- Blog cannibalization 301 redirects already deployed in `next.config.js` lines 138–165

---

## 2. Solution

**Approach:**
1. Fix initial page_view: set `send_page_view: true` in `gtag('config', ...)` so the init script itself fires the first page_view once gtag loads (regardless of when that is relative to React hydration)
2. Skip first render in `GAPageViewTracker` (via `useRef`) to avoid double-counting the landing page
3. Forward purchase to GA4: call `gaSendEvent('purchase', 'checkout', priceId)` inside `handleComplete` in `CheckoutModal`

**Key Decisions:**
- Keep `strategy="lazyOnload"` — avoids blocking render; the init-script's page_view handles first-load attribution
- Use `useRef` skip pattern — idiomatic React, zero state overhead
- Minimal blast radius: 2 files changed, existing behaviour unchanged for all other page views

---

## 4. Execution Phases

### Phase 1: Fix GA4 landing page tracking (the `(not set)` bug)

**Files:**
- `client/components/analytics/GoogleAnalytics.tsx`
- `tests/unit/client/components/analytics/GoogleAnalytics.unit.spec.tsx` *(new)*

**Implementation:**

- [ ] In the init `<Script>` inline content, change `send_page_view: false` → `send_page_view: true`
  ```diff
  - send_page_view: false
  + send_page_view: true
  ```
- [ ] In `GAPageViewTracker`, add a `isInitialRender` ref and skip firing on first mount:
  ```diff
  function GAPageViewTracker(): null {
    const pathname = usePathname();
    const searchParams = useSearchParams();
  + const isInitialRender = useRef(true);

    useEffect(() => {
  +   if (isInitialRender.current) {
  +     isInitialRender.current = false;
  +     return;          // init script already fired this page_view
  +   }
      const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
      gaSendPageView(url);
    }, [pathname, searchParams]);

    return null;
  }
  ```

**Tests Required:**

| Test File | Test Name | Assertion |
|---|---|---|
| `tests/unit/client/components/analytics/GoogleAnalytics.unit.spec.tsx` | `should skip gaSendPageView on initial mount` | `gaSendPageView` not called when component first mounts |
| `tests/unit/client/components/analytics/GoogleAnalytics.unit.spec.tsx` | `should call gaSendPageView on subsequent pathname change` | `gaSendPageView` called with new path after pathname updates |
| `tests/unit/client/components/analytics/GoogleAnalytics.unit.spec.tsx` | `gaSendPageView should no-op when window.gtag is undefined` | No throw; function returns silently |

**User Verification:**
- Action: Open GA4 Realtime → navigate to myimageupscaler.com
- Expected: Realtime shows a session with landing page `/` (not `(not set)`)

---

### Phase 2: Forward purchase events to GA4

**Files:**
- `client/components/stripe/CheckoutModal.tsx`

**Implementation:**

- [ ] Import `gaSendEvent` at the top of `CheckoutModal.tsx`:
  ```diff
  + import { gaSendEvent } from '@client/components/analytics/GoogleAnalytics';
  ```
- [ ] Call `gaSendEvent` in `handleComplete` immediately after `markCompleted()`:
  ```diff
  const handleComplete = useCallback(() => {
    clearOffer();
    markCompleted();
  + gaSendEvent('purchase', 'checkout', priceId);
    trackStepViewed('confirmation');
    if (onSuccess) onSuccess();
    setTimeout(() => onClose(), 1500);
  }, [clearOffer, markCompleted, trackStepViewed, onSuccess, onClose, priceId]);
  ```
  Note: `priceId` is already in scope (prop + `useCheckoutAnalytics` dep).

- [ ] After deploying, go to GA4 Admin → Events → find `purchase` → toggle **Mark as key event**

**Tests Required:**

| Test File | Test Name | Assertion |
|---|---|---|
| `tests/unit/client/components/stripe/CheckoutModal.unit.spec.tsx` (existing) | `should call gaSendEvent with purchase on checkout complete` | `gaSendEvent` called with `('purchase', 'checkout', priceId)` when `handleComplete` fires |

**User Verification:**
- Action: Complete a test purchase (use Stripe test mode)
- Expected: GA4 Realtime → Events shows a `purchase` event

---

## 5. Acceptance Criteria

- [ ] GA4 Realtime shows landing page (not `(not set)`) for direct visits
- [ ] GA4 Realtime shows `purchase` event on checkout completion
- [ ] `gaSendPageView` not called on initial mount (verified by unit test)
- [ ] `gaSendPageView` still called on SPA route changes (verified by unit test)
- [ ] `yarn verify` passes
- [ ] All tests pass

---

## 6. Out of Scope

- `/it` locale bounce rate: 1 session is too small a sample to diagnose — monitor over 4+ weeks before acting
- `/scale/upscale-16x` and `/ja` GA tracking gaps: investigate separately after the landing page fix ships (may self-resolve)
- Blog 301 redirects: already deployed in `next.config.js`
