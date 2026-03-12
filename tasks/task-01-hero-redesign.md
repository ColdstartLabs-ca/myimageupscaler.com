# Task 01: Hero Redesign - Clear CTA Above Fold

**Status:** Pending
**Estimated Effort:** 2-3 days
**Dependencies:** None

## Description

Redesign the homepage hero section to make the primary action (upload image) immediately visible and obvious. Currently, ~50% of visitors never upload, partly due to unclear CTAs and visibility issues.

## Requirements

### 1. Clear CTA Button
- Text: "Upload your first image" (explicit, action-oriented)
- Position: Top-right of hero, always visible without scrolling at 1366x768 viewport
- Add pulsing animation to draw attention
- Secondary CTA: "Try a sample" button (preparation for Phase 2)

### 2. Drag-and-Drop Zone Visibility
- Ensure zone is visible on 1366x768 resolution without scrolling
- Add visual cue: animated dashed border when no file is selected
- Add pulsing effect to draw attention

### 3. Before/After Examples
- Side-by-side comparison visible in hero section
- Label: "Original" vs "Upscaled 4x" with arrow indicating transformation
- Use real results from actual processing

## Files to Modify

- `client/components/landing/HeroSection.tsx` — Update layout and CTAs
- `client/components/features/workspace/UploadZone.tsx` — Add visibility improvements
- `locales/en/landing.json` or equivalent — Add new copy strings

## Files to Create

- `tests/unit/client/hero-redesign.unit.spec.tsx` — Unit tests for hero component

## Implementation Steps

1. Update `HeroSection.tsx`:
   - Restructure layout to ensure upload zone visible at 1366x768
   - Add "Upload your first image" CTA button with pulsing animation (use Tailwind)
   - Add "Try a sample" button (can be placeholder for now)
   - Add before/after comparison image component

2. Update `UploadZone.tsx`:
   - Add animated dashed border when empty
   - Add IntersectionObserver-based tracking for visibility analytics

3. Update localization:
   - Add keys for `hero.upload_cta`, `hero.try_sample_cta`, `hero.before_label`, `hero.after_label`

4. Add analytics tracking:
   - `hero_upload_cta_clicked` event with `ctaType` property
   - `hero_upload_zone_visible` event with viewport metrics

## Analytics Events

| Event | Properties | Location |
|-------|------------|----------|
| `hero_upload_cta_clicked` | `ctaType: 'primary' \| 'secondary'` | HeroSection |
| `hero_upload_zone_visible` | `viewportHeight`, `scrollDepth` | HeroSection |

## Acceptance Criteria

- [ ] "Upload your first image" button visible without scrolling at 1366x768 viewport
- [ ] Drag-drop zone has animated dashed border when empty
- [ ] Before/after comparison image visible in hero section
- [ ] "Try a sample" button present (wired to trigger placeholder)
- [ ] Both CTAs fire appropriate analytics events
- [ ] All unit tests pass
- [ ] `yarn verify` passes

## Tests Required

| Test Name | Assertion |
|-----------|-----------|
| `should show upload CTA button in hero` | Button element with "Upload your first image" text exists |
| `should show drag-drop zone above fold on 1366x768` | Zone visible without scroll at target viewport |
| `should fire hero_upload_cta_clicked on CTA click` | analytics.track called with correct event |

## Verification

1. Run unit tests: `yarn test tests/unit/client/hero-redesign.unit.spec.tsx`
2. Run `yarn verify` to ensure no regressions
3. Manual check: Open homepage at 1366x768, verify all elements visible without scrolling

## References

- Main PRD: `/docs/PRDs/first-time-user-activation.md` — Phase 1 section
- CLAUDE.md: Use Tailwind tokens only for colors/styling
