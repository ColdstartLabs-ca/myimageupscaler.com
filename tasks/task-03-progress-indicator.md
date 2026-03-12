# Task 03: Progress Indicator - Visual Flow Guidance

**Status:** Pending
**Estimated Effort:** 2-3 days
**Dependencies:** Task 01 (Hero Redesign), Task 02 (Sample Images)

## Description

Create a visual progress indicator that guides first-time users through the upload → configure → download flow, plus a celebration animation on first download completion.

## Requirements

### 1. Progress Steps Component
- 3-step indicator: "Step 1: Upload" → "Step 2: Configure" → "Step 3: Download"
- Active step: filled circle, bold text
- Pending steps: outlined circles, muted text
- Update automatically based on workspace state

### 2. Progress States
- **Step 1 (Upload)**: Active when no image is selected
- **Step 2 (Configure)**: Active when image uploaded, before processing
- **Step 3 (Download)**: Active when processing complete

### 3. First Download Celebration
- Show celebratory animation after first successful download
- Message: "First upscale complete!"
- CTAs: "Upload Another" / "See Premium Plans"
- Confetti animation (use lightweight CSS-based solution)
- Only show once (localStorage flag)

## Files to Create

- `client/components/features/workspace/ProgressSteps.tsx` — Progress indicator
- `client/components/features/workspace/FirstDownloadCelebration.tsx` — Celebration modal
- `tests/unit/client/progress-indicator.unit.spec.tsx` — Unit tests

## Files to Modify

- `client/components/features/workspace/Workspace.tsx` — Integrate progress tracking
- `locales/en/workspace.json` — Add progress step labels

## Implementation Steps

1. Create progress state interface:
```typescript
interface IProgressState {
  currentStep: 1 | 2 | 3;
  isFirstUpload: boolean;
}

const FIRST_UPLOAD_COMPLETED_KEY = 'miu_first_upload_completed';
```

2. Create `ProgressSteps` component:
   - Accept `currentStep` and `isFirstUpload` props
   - Render 3 steps with appropriate styling for each state
   - Only render when `isFirstUpload === true`
   - Fire `onboarding_step_viewed` analytics event on step changes

3. Create `FirstDownloadCelebration` component:
   - Show confetti animation (CSS keyframes)
   - Display success message and CTAs
   - Set `FIRST_UPLOAD_COMPLETED_KEY` flag on mount
   - Fire `onboarding_completed` and `first_upload_completed` events
   - Only render once based on localStorage flag

4. Integrate into Workspace:
   - Track workspace state: no image → uploaded → processed
   - Update `currentStep` based on state changes
   - Render `ProgressSteps` above workspace for first-time users
   - Render `FirstDownloadCelebration` after first successful download

## Analytics Events

| Event | Properties | Location |
|-------|------------|----------|
| `onboarding_started` | `timestamp` | ProgressSteps (on first mount) |
| `onboarding_step_viewed` | `step: 1 \| 2 \| 3`, `durationToStepMs` | ProgressSteps |
| `onboarding_completed` | `totalDurationMs`, `source: 'sample' \| 'upload'` | FirstDownloadCelebration |
| `first_upload_completed` | `source: 'sample' \| 'upload'`, `durationMs` | Workspace |

## localStorage Keys

```typescript
const FIRST_UPLOAD_COMPLETED_KEY = 'miu_first_upload_completed';
const ONBOARDING_STARTED_KEY = 'miu_onboarding_started_timestamp';
```

## Acceptance Criteria

- [ ] Progress steps show correct state at each stage
- [ ] Step transitions happen automatically based on workspace state
- [ ] Progress only shows for first-time users (no flag in localStorage)
- [ ] Celebration animation shows on first download
- [ ] Celebration only shows once (respects localStorage flag)
- [ ] All analytics events fire with correct properties
- [ ] All unit tests pass
- [ ] `yarn verify` passes

## Tests Required

| Test Name | Assertion |
|-----------|-----------|
| `should show Step 1 active when no image` | Step 1 marked active, others pending |
| `should advance to Step 2 after upload` | Step 2 active after image state changes |
| `should advance to Step 3 after processing` | Step 3 active after upscale completes |
| `should show celebration on first download` | Celebration component renders on first download |
| `should not show progress to returning users` | ProgressSteps returns null when flag exists |

## Verification

1. Run unit tests: `yarn test tests/unit/client/progress-indicator.unit.spec.tsx`
2. Run `yarn verify` to ensure no regressions
3. Manual check: Upload first image, verify step progression, then verify celebration appears on download

## References

- Main PRD: `/docs/PRDs/first-time-user-activation.md` — Phase 3 section
