# Task 04: Onboarding Tooltips - Contextual Tour

**Status:** Pending
**Estimated Effort:** 1-2 days
**Dependencies:** Task 01 (Hero Redesign), Task 03 (Progress Indicator)

## Description

Create a skippable 3-step onboarding tour that highlights key UI elements for confused first-time users.

## Requirements

### 1. Tour Steps
3 tooltips highlighting key areas:
1. **Upload Zone** — "Drag and drop any image here, or click to browse"
2. **Quality Selector** — "Choose your quality tier. Higher quality = better results"
3. **Download Button** — "Click to download your upscaled image"

### 2. Trigger Behavior
- Auto-trigger after 10 seconds of inactivity OR
- Manual trigger via "Show me how" button
- Only show to users with <1 upload (no `FIRST_UPLOAD_COMPLETED_KEY` flag)

### 3. User Controls
- "Next" and "Previous" buttons for navigation
- "Skip tour" button (X button) on each tooltip
- Don't re-show after completion or skip

### 4. Visual Design
- Highlight target element with overlay (darken rest of UI)
- Position tooltips intelligently (top/bottom/left/right based on space)
- Use portal/overlay for correct positioning

## Files to Create

- `client/components/features/workspace/OnboardingTour.tsx` — Tour component
- `client/hooks/useOnboardingTour.ts` — Tour state management hook
- `tests/unit/client/onboarding-tour.unit.spec.tsx` — Unit tests

## Files to Modify

- `client/components/features/workspace/Workspace.tsx` — Integrate tour
- `client/components/landing/HeroSection.tsx` — Add "Show me how" button
- `locales/en/workspace.json` — Add tour tooltip content

## Implementation Steps

1. Create tour step interface:
```typescript
interface ITourStep {
  id: string;
  target: string; // CSS selector for target element
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: ITourStep[] = [
  {
    id: 'upload',
    target: '[data-testid="upload-zone"]',
    title: 'Upload your image',
    content: 'Drag and drop any image here, or click to browse files.',
    position: 'bottom',
  },
  // ... other steps
];
```

2. Create `useOnboardingTour` hook:
   - Manage current step state
   - Handle inactivity timer (10s)
   - Check localStorage for completion/skip flags
   - Provide `startTour`, `nextStep`, `prevStep`, `skipTour` functions

3. Create `OnboardingTour` component:
   - Render overlay with highlighted target element
   - Position tooltip based on current step
   - Handle keyboard navigation (Escape to skip, arrows to navigate)
   - Use React Portal for proper z-index layering

4. Integrate into Workspace:
   - Mount tour component for first-time users
   - Wire "Show me how" button in hero section
   - Auto-trigger after 10s of inactivity

## Analytics Events

| Event | Properties | Location |
|-------|------------|----------|
| `onboarding_tour_started` | `trigger: 'auto' \| 'manual'` | OnboardingTour |
| `onboarding_tour_step_viewed` | `step: 1 \| 2 \| 3`, `trigger` | OnboardingTour |
| `onboarding_tour_completed` | `totalDurationMs`, `trigger` | OnboardingTour |
| `onboarding_tour_skipped` | `step: 1 \| 2 \| 3`, `trigger` | OnboardingTour |

## localStorage Keys

```typescript
const TOUR_COMPLETED_KEY = 'miu_onboarding_tour_completed';
const TOUR_SKIPPED_KEY = 'miu_onboarding_tour_skipped';
const TOUR_CURRENT_STEP_KEY = 'miu_onboarding_tour_current_step';
```

## Acceptance Criteria

- [ ] Tour auto-triggers after 10s of inactivity for first-time users
- [ ] "Show me how" button manually triggers tour
- [ ] All 3 steps render with correct content and positioning
- [ ] Next/Previous navigation works correctly
- [ ] Skip button sets localStorage flag and prevents future tours
- [ ] Completion sets localStorage flag and prevents future tours
- [ ] Returning users (with flag) never see tour
- [ ] All analytics events fire correctly
- [ ] All unit tests pass
- [ ] `yarn verify` passes

## Tests Required

| Test Name | Assertion |
|-----------|-----------|
| `should render first step on tour start` | First tooltip with correct content |
| `should advance to next step on Next click` | Second tooltip shown after Next click |
| `should complete tour and set localStorage flag` | Tour completed, flag set in localStorage |
| `should skip tour and set skip flag` | Tour skipped, skip flag set in localStorage |
| `should not show tour to returning users` | Tour doesn't start when flag exists |

## Verification

1. Run unit tests: `yarn test tests/unit/client/onboarding-tour.unit.spec.tsx`
2. Run `yarn verify` to ensure no regressions
3. Manual check: Stay on homepage for 10s without uploading, verify tour appears
4. Manual check: Click "Show me how" button, verify tour starts
5. Manual check: Complete tour, reload page, verify tour doesn't appear again

## References

- Main PRD: `/docs/PRDs/first-time-user-activation.md` — Phase 4 section
