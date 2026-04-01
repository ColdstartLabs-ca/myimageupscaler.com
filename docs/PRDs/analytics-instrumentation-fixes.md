# Analytics & Instrumentation Fixes Plan

## Context

Analytics review revealed 8 instrumentation gaps hurting conversion measurement and optimization. These range from a debug flag left in production code, to missing event properties, to entirely untracked features. Item 9 (NA free credits reduction) is already shipped.

---

## Fix 1: Discount Banner CTA (Fix Immediately)

**Problem:** 167 eligible, 2 clicks (1.2%). Offer converts when clicked, but UI fails to drive clicks.

**File:** `client/components/engagement-discount/EngagementDiscountBanner.tsx`

**Critical bug found:** Unstaged local changes have `FORCE_SHOW = true` debug flag AND a reference to `activeOffer` inside a `useEffect` that runs before `activeOffer` is defined (line ~106 references it, but it's declared at ~147). This will crash at runtime.

**Changes:**

1. Remove `FORCE_SHOW` constant and all associated mock/guard logic (revert to clean `offer`-based flow)
2. Fix the `activeOffer` reference bug in the tracking `useEffect` - use `offer` directly since the guard already checks `offer` is truthy
3. Show discounted price on mobile - remove `hidden md:flex` from pricing div, show at least `$X.XX` next to CTA on small screens
4. Make CTA more visible: change from `bg-white text-accent` to `bg-yellow-400 text-black hover:bg-yellow-300` (high contrast against gradient)
5. Add price context to CTA button on mobile: "Claim 20% Off - $X.XX"

---

## Fix 2: copyVariant Label Logging (Fix Immediately)

**Problem:** A/B test running but variant names blank for ~60% of events. 3 components fire upgrade events without `copyVariant`.

**Files to modify:**

| File                                                              | Trigger            | Change                                                                                          |
| ----------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `client/components/features/workspace/PostDownloadPrompt.tsx`     | `after_download`   | Add `getVariant('after_download_copy', ['value', 'outcome', 'urgency'])`, pass to all 3 events  |
| `client/components/features/workspace/AfterUpscaleBanner.tsx`     | `after_upscale`    | Add `getVariant('after_upscale_copy', ['value', 'outcome', 'urgency'])`, pass to all 3 events   |
| `client/components/features/image-processing/ImageComparison.tsx` | `after_comparison` | Add `getVariant('after_comparison_copy', ['value', 'outcome', 'urgency'])`, pass to both events |

**Pattern:** Follow exactly how `UpgradeSuccessBanner.tsx:38` does it.

---

## Fix 3: Scale `after_comparison` Trigger

**Problem:** 18% CTR (best surface) but only 268 impressions. 48h cooldown + session gate is too restrictive.

**File:** `client/components/features/image-processing/ImageComparison.tsx`

**Changes:**

1. Reduce cooldown from 48h to 4h (matching `after_batch`): change `48 * 60 * 60 * 1000` to `4 * 60 * 60 * 1000`
2. Remove session-level gating (sessionStorage check) — `canShowPrompt` already handles throttling
3. Add `maxPerWeek: 5` to both `canShowPrompt` and `markPromptShown` calls to prevent fatigue
4. Remove the `AFTER_COMPARISON_SESSION_KEY` constant

---

## Fix 4: Instrument `currentModel` on `upgrade_prompt_shown`

**Problem:** 94% of prompt events lack model context, blocking model-specific copy optimization.

**Files to modify:**

| File                       | Trigger            | Change                                                                                      |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| `ImageComparison.tsx`      | `after_comparison` | Add `imageVariant: modelUsed` to both events (prop already exists)                          |
| `UpgradeSuccessBanner.tsx` | `after_batch`      | Add `currentModel?: string` prop, pass `imageVariant: currentModel` to all 3 events         |
| `PostDownloadPrompt.tsx`   | `after_download`   | Add `currentModel?: string` prop, pass `imageVariant: currentModel` to all 3 events         |
| `Workspace.tsx`            | (caller)           | Pass `currentModel={config.qualityTier}` to `UpgradeSuccessBanner` and `PostDownloadPrompt` |

**Already working:** `AfterUpscaleBanner` and `PremiumUpsellModal` already pass model context.

---

## Fix 5: `outOfCredits` Property Consistency

**Problem:** Only 38 users tagged `outOfCredits=true` vs 395 hitting the limit. The property defaults to `false` on most paths.

**File:** `client/components/features/workspace/Workspace.tsx`

**Change:** In the error monitoring `useEffect` (line 220), when an "insufficient credits" error is detected, auto-open the upgrade modal with `outOfCredits: true`:

```typescript
if (item.error?.toLowerCase().includes('insufficient credits')) {
  errorTitle = t('workspace.errors.insufficientCredits');
  openUpgradeModal(true, 'insufficient_credits');
}
```

This ensures `outOfCredits=true` flows through `PurchaseModal` (which already tracks it at line 50).

**Also:** Add `'insufficient_credits'` to `IUpgradePromptTrigger` union in `server/analytics/types.ts`.

---

## Fix 6: `paywall_shown` Event

**Problem:** Country paywall (Mar 21) has zero tracking. Can't measure conversion impact or regional patterns.

**Files:**

**a) `server/analytics/types.ts`** — Add event types:

- Add `'paywall_shown'` to event name union
- Add `IPaywallShownProperties` interface: `{ country: string; context: 'guest_api' | 'authenticated_workspace' }`

**b) `app/api/upscale/guest/route.ts`** — Server-side tracking:

- After the paywall block at line 46, add `trackServerEvent('paywall_shown', { country, context: 'guest_api' }, ...)`

**c) `client/components/features/workspace/Workspace.tsx`** — Client-side tracking:

- Import `useRegionTier`, add effect that fires `paywall_shown` when `isPaywalled && isFreeUser`
- Use a ref to fire only once per mount

---

## Fix 7: `first_upload_completed` Event (Verification Only)

**Already implemented.** Event fires via `markFirstUploadCompleted()` in `ProgressSteps.tsx:171-184`, called from `Workspace.tsx:286`. Uses localStorage to fire once ever. Type definition exists.

**Action:** Verify in Amplitude that events are appearing. No code changes needed.

---

## Fix 8: `account_delete_confirmed` Event

**Problem:** Self-serve deletion is live but completely untracked.

**Files:**

**a) `server/analytics/types.ts`:**

- Add `'account_delete_modal_opened'`, `'account_delete_confirmed'`, `'account_delete_completed'` to event name union

**b) `client/components/settings/DeleteAccountModal.tsx`:**

- Import `analytics` from `@client/analytics/analyticsClient`
- Add `useEffect` for `account_delete_modal_opened` when `isOpen` becomes true (place before early returns — restructure component to move the `if (!isOpen)` guard after hooks, using conditional rendering in JSX)
- Add `analytics.track('account_delete_confirmed', { method: 'self_serve' })` at start of `handleDelete`
- Add `analytics.track('account_delete_completed', { method: 'self_serve' })` after `setDeleted(true)`

**c) `app/api/account/delete/route.ts`:**

- Add server-side `account_delete_completed` event with `hadStripeCustomer` context

---

## Implementation Batches

**Batch A (standalone):** Fix 1 (EngagementDiscountBanner), Fix 8 (DeleteAccountModal)
**Batch B (overlapping files):** Fixes 2, 3, 4, 5 together (ImageComparison + Workspace + upgrade components)
**Batch C (server + types):** Fix 6 (paywall_shown tracking)
**Batch D (no code):** Fix 7 (verify in Amplitude)

---

## Critical Files

- `client/components/engagement-discount/EngagementDiscountBanner.tsx`
- `client/components/features/image-processing/ImageComparison.tsx`
- `client/components/features/workspace/Workspace.tsx`
- `client/components/features/workspace/UpgradeSuccessBanner.tsx`
- `client/components/features/workspace/PostDownloadPrompt.tsx`
- `client/components/features/workspace/AfterUpscaleBanner.tsx`
- `client/components/settings/DeleteAccountModal.tsx`
- `server/analytics/types.ts`
- `app/api/upscale/guest/route.ts`
- `app/api/account/delete/route.ts`

---

## Verification

1. `yarn verify` must pass after all changes
2. Unit tests: Add/update tests in `tests/unit/client/upgrade-prompts.unit.spec.tsx` for copyVariant and currentModel presence
3. Type check: `npx tsc --noEmit` to catch missing properties
4. Manual: Trigger each prompt surface in browser, verify events in console/Amplitude with correct properties
5. Regression: Ensure existing prompt frequency/throttling still works after Fix 3 changes
