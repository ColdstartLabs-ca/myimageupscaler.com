# Task 02: Sample Images - Zero-Friction Trial

**Status:** Pending
**Estimated Effort:** 1-2 days
**Dependencies:** Task 01 (Hero Redesign)

## Description

Create a sample image selector that allows users to experience upscaling without uploading their own image. This removes friction for users who don't have an image ready.

## Requirements

### 1. Sample Image Assets
- Create 3 optimized sample images (~50KB each, WebP format):
  - **Photo**: Portrait or product photo (shows general upscaling)
  - **Illustration**: Digital art or vector (shows detail preservation)
  - **Old Photo**: Scanned vintage photo (shows restoration capability)

### 2. Sample Image Selector Component
- Display 3 sample cards with thumbnails
- Each card shows: thumbnail, title, one-click "Try this" button
- Only show to first-time users (no upload history in localStorage)

### 3. Processing Flow
- On click: automatically upload and process with optimal settings
- Show before/after comparison after processing
- Store used sample images in localStorage for analytics

## Files to Create

- `client/components/features/workspace/SampleImageSelector.tsx` — Main component
- `client/hooks/useSampleImages.ts` — Hook for sample image management
- `shared/config/sample-images.config.ts` — Sample metadata configuration
- `public/samples/` — Directory for sample images (3 WebP files)
- `tests/unit/client/sample-images.unit.spec.tsx` — Unit tests

## Files to Modify

- `client/components/features/workspace/Workspace.tsx` — Integrate SampleImageSelector
- `locales/en/workspace.json` — Add sample image labels

## Implementation Steps

1. Create sample image configuration:
```typescript
// shared/config/sample-images.config.ts
interface ISampleImage {
  id: string;
  type: 'photo' | 'illustration' | 'old_photo';
  src: string;
  beforeSrc: string;
  afterSrc: string;
  qualityTier: QualityTier;
  scaleFactor: number;
  title: string;
  description: string;
}
```

2. Create `useSampleImages` hook:
   - Check localStorage for upload history
   - Return `showSamples: boolean` based on first-time status
   - Track sample image usage

3. Create `SampleImageSelector` component:
   - Render 3 cards from configuration
   - Handle click → trigger upload with optimal settings
   - Fire `sample_image_selected` analytics event

4. Prepare sample images:
   - Source or create 3 representative images
   - Optimize to WebP format (~50KB each)
   - Place in `public/samples/` directory

5. Wire into Workspace:
   - Conditionally show `SampleImageSelector` for first-time users
   - Position near upload zone for discoverability

## Analytics Events

| Event | Properties | Location |
|-------|------------|----------|
| `sample_image_selector_viewed` | `availableSamples: number` | SampleImageSelector |
| `sample_image_selected` | `sampleType: 'photo' \| 'illustration' \| 'old_photo'` | SampleImageSelector |
| `sample_image_processed` | `sampleType`, `durationMs`, `qualityTier` | SampleImageSelector (after processing) |
| `first_upload_completed` | `source: 'sample' \| 'upload'` | Workspace (global tracker) |

## localStorage Keys

```typescript
const SAMPLE_IMAGES_USED_KEY = 'miu_sample_images_used';
const ONBOARDING_COMPLETED_KEY = 'miu_onboarding_completed';
```

## Acceptance Criteria

- [ ] 3 sample image cards render with correct metadata
- [ ] Samples only shown to first-time users (no history)
- [ ] Clicking a sample automatically processes with optimal settings
- [ ] Before/after comparison shown after processing
- [ ] All analytics events fire correctly
- [ ] Used samples tracked in localStorage
- [ ] All unit tests pass
- [ ] `yarn verify` passes

## Tests Required

| Test Name | Assertion |
|-----------|-----------|
| `should render 3 sample image cards` | 3 cards with correct metadata |
| `should not show samples to returning users` | Component returns null when upload history exists |
| `should fire sample_image_selected on card click` | analytics.track called with correct event and sampleType |
| `should store used samples in localStorage` | localStorage updated correctly after selection |

## Verification

1. Run unit tests: `yarn test tests/unit/client/sample-images.unit.spec.tsx`
2. Run `yarn verify` to ensure no regressions
3. Manual check: Visit homepage as first-time user, click each sample, verify processing works

## References

- Main PRD: `/docs/PRDs/first-time-user-activation.md` — Phase 2 section
- Retention PRD: `/docs/PRDs/retention-and-reengagement.md` — Sample images reference implementation
