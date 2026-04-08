# Plan: Redirect Post-Download Prompts to Model Gallery

## Context

Post-download is the highest-satisfaction moment — the user just got value and is still engaged. Currently, two components fire at this moment (`PostDownloadPrompt` on 2nd download, `FirstDownloadCelebration` on 1st download ever) but both funnel users to the **PurchaseModal** with a direct "upgrade" ask.

The insight: a curiosity-driven "see what other models can do" CTA that opens the **ModelGalleryModal** (which already has before/after comparisons on every card) will convert better than a cold upgrade ask. The gallery provides visual proof; the modal gate inside the gallery still routes to PurchaseModal when users click a locked model.

**Flow change:**
```
Before: Download → "Upgrade Now!" → PurchaseModal
After:  Download → "Explore Models" → ModelGalleryModal → (user clicks locked model) → PurchaseModal
```

## Changes

### 1. PostDownloadPrompt.tsx
**File:** `client/components/features/workspace/PostDownloadPrompt.tsx`

- Rename prop `onUpgrade` → `onExploreModels`
- Remove `setCheckoutTrackingContext` import and call (no longer going to checkout)
- Update analytics triggers: `'after_download'` → `'post_download_explore'`
- Update analytics destination: `'purchase_modal'` → `'model_gallery'`
- Update copy: "Want sharper, cleaner output?" → i18n-driven curiosity copy
- Update CTA: "Upgrade Now" → "Explore Models" (via i18n)
- Update secondary CTA: "Continue Free" → "Maybe Later" (via i18n)
- Add `useTranslations('workspace.postDownloadPrompt')` (currently uses hardcoded strings)
- Update aria-label from "Dismiss upgrade prompt" → "Dismiss prompt" (via i18n)

### 2. FirstDownloadCelebration.tsx
**File:** `client/components/features/workspace/FirstDownloadCelebration.tsx`

- Rename prop `onUpgrade` → `onExploreModels`
- Rename handler `handleViewPlans` → `handleExploreModels`
- Remove `setCheckoutTrackingContext` import and call
- Update analytics: trigger `'celebration'` → `'celebration_explore'`, destination → `'model_gallery'`
- Update i18n key reference: `t('seePlans')` → `t('exploreModels')`
- Update skip text i18n key to curiosity-driven copy

### 3. Workspace.tsx
**File:** `client/components/features/workspace/Workspace.tsx`

- Add state: `const [exploreGalleryOpen, setExploreGalleryOpen] = useState(false);`
- Add handler:
  ```ts
  const openExploreGallery = () => {
    analytics.track('model_gallery_opened', { source: 'post_download_explore', currentTier: config.qualityTier, isFreeUser });
    setExploreGalleryOpen(true);
  };
  ```
- Update existing `ModelGalleryModal` to merge open states:
  - `isOpen={mobileGalleryOpen || exploreGalleryOpen}`
  - `onClose` clears both states
  - `onUpgrade` trigger derived from which source opened it
- Update `PostDownloadPrompt`: `onUpgrade={...}` → `onExploreModels={openExploreGallery}`
- Update `FirstDownloadCelebration`: `onUpgrade={...}` → `onExploreModels={openExploreGallery}`

### 4. i18n — English
**File:** `locales/en/workspace.json`

Update `postDownloadPrompt`:
```json
"postDownloadPrompt": {
  "title": "Curious what other models can do?",
  "body": "We have 14+ AI models — each optimized for different image types.",
  "cta": "Explore Models",
  "dismiss": "Dismiss prompt",
  "maybeLater": "Maybe Later"
}
```

Update `progressCelebration`:
```json
"progressCelebration": {
  "title": "First upscale complete!",
  "subtitle": "You just upscaled your first image! Curious what other AI models can do with it?",
  "uploadAnother": "Upload Another",
  "exploreModels": "Explore Models",
  "skipText": "See the difference our premium models make",
  "dismiss": "Dismiss celebration"
}
```

### 5. i18n — Other locales
**Files:** `locales/{de,es,fr,it,ja,pt}/workspace.json`

Same key changes with translated values. Use the translator agent.

### 6. Tests
**File:** `tests/unit/client/upgrade-prompts.unit.spec.tsx`

**PostDownloadPrompt tests (lines 653-807):**
- All `onUpgrade` prop → `onExploreModels`
- `trigger: 'after_download'` → `trigger: 'post_download_explore'`
- `destination: 'purchase_modal'` → `destination: 'model_gallery'`
- CTA button lookup: `/Upgrade Now/i` → `/Explore Models/i`
- Text assertion: `/Love the result\?/i` → new i18n title
- Add assertion: `setCheckoutTrackingContext` is NOT called

**FirstDownloadCelebration tests (lines 1003-1166):**
- All `onUpgrade` prop → `onExploreModels`
- `trigger: 'celebration'` → `trigger: 'celebration_explore'`
- `destination: 'purchase_modal'` → `destination: 'model_gallery'`
- Button text: `/See Premium Plans/i` → `/Explore Models/i`
- Add assertion: `setCheckoutTrackingContext` is NOT called
- i18n mock keys: update `workspace.progressCelebration.seePlans` → `workspace.progressCelebration.exploreModels`

**Workspace.test.tsx (mocks only):**
- Mocks render `() => null` so no functional changes needed, but update mock shapes for type safety if using TypeScript strict mode

## What NOT to Change

- `ModelGalleryModal.tsx` — no changes. Same props, same internal model-gate behavior
- `PremiumUpsellModal` — unrelated flow (random download interception)
- `AfterUpscaleBanner` — separate concern (after 3rd upscale)
- `PurchaseModal` — still opens from gallery's internal model-gate
- `QualityTierSelector` / `BatchSidebar` — desktop inline gallery untouched

## Verification

1. `yarn test tests/unit/client/upgrade-prompts.unit.spec.tsx` — all PostDownloadPrompt and FirstDownloadCelebration tests pass
2. `yarn test client/components/features/workspace/__tests__/Workspace.test.tsx` — workspace tests pass  
3. `yarn verify` — full build + lint + type check passes
4. Manual check: free user downloads on 2nd download → PostDownloadPrompt shows with "Explore Models" CTA → clicking opens ModelGalleryModal
5. Manual check: first-time user downloads → celebration shows "Explore Models" → clicking opens ModelGalleryModal
6. Manual check: inside the opened gallery, clicking a locked premium model still opens PurchaseModal
