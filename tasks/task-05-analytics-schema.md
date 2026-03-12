# Task 05: Analytics Schema Updates

**Status:** Pending
**Estimated Effort:** 0.5 days
**Dependencies:** None (can be done in parallel with other tasks)

## Description

Add the new analytics event types and property interfaces required by the First-Time User Activation feature to `server/analytics/types.ts`.

## Requirements

Add new event types and property interfaces to support:
- Hero redesign tracking
- Sample image selection and processing
- Progress indicator and onboarding steps
- Onboarding tour interactions

## Files to Modify

- `server/analytics/types.ts` — Add new event types and interfaces

## Implementation Steps

1. Add new event types to `IAnalyticsEventName` union:
```typescript
export type IAnalyticsEventName =
  // ... existing events ...
  | 'onboarding_started'
  | 'onboarding_step_viewed'
  | 'onboarding_completed'
  | 'onboarding_tour_started'
  | 'onboarding_tour_step_viewed'
  | 'onboarding_tour_completed'
  | 'onboarding_tour_skipped'
  | 'hero_upload_cta_clicked'
  | 'hero_upload_zone_visible'
  | 'sample_image_selector_viewed'
  | 'sample_image_selected'
  | 'sample_image_processed'
  | 'first_upload_completed';
```

2. Add new property interfaces:
```typescript
// Onboarding progress
export interface IOnboardingStepViewedProperties {
  step: 1 | 2 | 3;
  durationToStepMs: number;
  source?: 'sample' | 'upload';
}

export interface IOnboardingCompletedProperties {
  totalDurationMs: number;
  source: 'sample' | 'upload';
  uploadCount: number;
}

// Onboarding tour
export interface IOnboardingTourStepViewedProperties {
  step: 1 | 2 | 3;
  trigger: 'auto' | 'manual';
}

// Sample images
export interface ISampleImageSelectedProperties {
  sampleType: 'photo' | 'illustration' | 'old_photo';
}

export interface ISampleImageProcessedProperties {
  sampleType: 'photo' | 'illustration' | 'old_photo';
  durationMs: number;
  qualityTier: string;
}

// First upload
export interface IFirstUploadCompletedProperties {
  source: 'sample' | 'upload';
  durationMs: number;
  fileSize?: number;
  fileType?: string;
}

// Hero tracking
export interface IHeroUploadCtaClickedProperties {
  ctaType: 'primary' | 'secondary';
}

export interface IHeroUploadZoneVisibleProperties {
  viewportHeight: number;
  scrollDepth: number;
}

export interface ISampleImageSelectorViewedProperties {
  availableSamples: number;
}
```

3. Ensure all new events are whitelisted in the event handler if applicable

## Acceptance Criteria

- [ ] All new event types added to `IAnalyticsEventName` union
- [ ] All new property interfaces defined with correct types
- [ ] TypeScript compilation passes
- [ ] `yarn verify` passes (typecheck)

## Tests Required

No new unit tests required (schema changes only, usage tested in component tests).

## Verification

1. Run `yarn typecheck` to ensure no TypeScript errors
2. Run `yarn verify` to ensure full validation passes

## References

- Main PRD: `/docs/PRDs/first-time-user-activation.md` — Analytics Schema section
- Existing types: `/server/analytics/types.ts`
