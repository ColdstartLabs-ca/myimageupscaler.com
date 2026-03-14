# Manual Testing — First-Time User Activation PR

Branch: `night-watch/22-first-time-user-activation-converting-visitors-to-uploaders`

## Pre-flight

```bash
# Start dev server
yarn dev

# Open in incognito / clear localStorage before each scenario
localStorage.clear()
```

All scenarios below should be run as a **logged-out, first-time visitor** unless noted.

---

## 1. Hero CTA Redesign

**Page:** `/` (homepage)

| #   | Action                                     | Expected                                                                                                                |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Load homepage                              | Primary CTA says **"Upload your first image"** with ImagePlus icon; secondary says **"Try a sample"** with sparkle icon |
| 2   | Click **"Upload your first image"**        | Navigates to `/tools/ai-image-upscaler`                                                                                 |
| 3   | Click **"Try a sample"**                   | Navigates to `/tools/ai-image-upscaler?sample=true`                                                                     |
| 4   | Check analytics (Network tab or Amplitude) | `hero_upload_cta_clicked` fires with `ctaType: 'primary'` / `'secondary'` respectively                                  |
| 5   | Load `/de/` (German locale)                | CTAs navigate to `/de/tools/ai-image-upscaler` (locale prefix applied)                                                  |

---

## 2. Sample Image Selector

**Page:** `/tools/ai-image-upscaler` — with empty queue, first-time visitor

| #   | Action                             | Expected                                                                         |
| --- | ---------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Load page with empty queue         | Sample selector appears with 3 cards: **Photo**, **Illustration**, **Old Photo** |
| 2   | Hover over a card                  | Image transitions from before → after preview                                    |
| 3   | Click **"Try this"** on Photo card | `sample_image_selected` fires; selector hides; result shown                      |
| 4   | Revisit page after using a sample  | `miu_sample_images_used` in localStorage contains the used sample ID             |
| 5   | Navigate to `?sample=true`         | Sample selector should be visible (this param is the handoff from hero CTA)      |
| 6   | Upload your own image (non-sample) | Selector disappears once queue is non-empty                                      |

---

## 3. Progress Steps Bar

**Page:** `/tools/ai-image-upscaler` — first-time visitor only

| #   | Action                                                                        | Expected                                                                      |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Load page (no prior upload)                                                   | 3-step bar visible: **Upload → Configure → Download**; Step 1 highlighted     |
| 2   | Upload an image                                                               | Step 2 (Configure) becomes active                                             |
| 3   | Click process / upscale                                                       | Step 3 (Download) becomes active when result ready                            |
| 4   | Step 1 and 2 show a ✓ checkmark when passed                                   | Completed steps show green check circle                                       |
| 5   | Check localStorage: `miu_onboarding_started`                                  | Should be set (timestamp) on first render                                     |
| 6   | Check analytics                                                               | `onboarding_started` fires once; `onboarding_step_viewed` fires for each step |
| 7   | **Returning user:** set `miu_first_upload_completed` in localStorage → reload | Progress bar should **not** render                                            |

---

## 4. First Download Celebration Modal

**Trigger:** After downloading the first upscaled image (first-time user)

| #   | Action                                             | Expected                                                              |
| --- | -------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | Complete first download (clear localStorage first) | Confetti modal appears with **"First upscale complete!"**             |
| 2   | Confetti animation                                 | 50 pieces fall with CSS animation, no jank                            |
| 3   | Click **X** (dismiss)                              | Modal closes; `miu_celebration_shown` is written to localStorage      |
| 4   | Reload page, complete another download             | Modal does **not** appear again (`miu_celebration_shown` already set) |
| 5   | Click **"Upload Another"**                         | Modal closes; upload zone receives focus                              |
| 6   | Click **"See Premium Plans"** (free user only)     | Navigates to `/dashboard/billing`; `upgrade_prompt_clicked` fires     |
| 7   | Logged-in paid user completes download             | "See Premium Plans" button is **not shown**                           |
| 8   | Check analytics                                    | `onboarding_completed` fires once with `source` and `totalDurationMs` |

---

## 5. Onboarding Tour

**Trigger:** Tooltip tour for first-time users on the workspace

| #   | Action                                                                                    | Expected                                                                                                 |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Load workspace as first-time user                                                         | Tour auto-starts (overlay + tooltip on Upload Zone)                                                      |
| 2   | `miu_onboarding_tour_completed` or `miu_onboarding_tour_skipped` in localStorage → reload | Tour does **not** auto-start                                                                             |
| 3   | Click **Next**                                                                            | Advances to step 2 (Quality Tier tooltip)                                                                |
| 4   | Click **Next** again                                                                      | Advances to step 3 (Download tooltip)                                                                    |
| 5   | On last step, click **Finish**                                                            | Tour closes; `miu_onboarding_tour_completed = true` written; analytics fires `onboarding_tour_completed` |
| 6   | Click **Skip tour** (any step)                                                            | Tour closes; `miu_onboarding_tour_skipped = true` written; `onboarding_tour_skipped` fires with `atStep` |
| 7   | Click the **overlay** (outside tooltip)                                                   | Skips the tour                                                                                           |
| 8   | Click **Previous** on step 2+                                                             | Goes back one step                                                                                       |
| 9   | Tooltip position                                                                          | Tooltip appears near the target element, not off-screen                                                  |
| 10  | Mobile (375px viewport)                                                                   | Tooltip is visible and not clipped                                                                       |

---

## 6. localStorage State Verification

After running through the full flow, open DevTools → Application → Local Storage and confirm:

| Key                             | Expected value                              |
| ------------------------------- | ------------------------------------------- |
| `miu_onboarding_started`        | Timestamp (number as string)                |
| `miu_first_upload_completed`    | Timestamp                                   |
| `miu_sample_images_used`        | JSON array of used sample IDs               |
| `miu_onboarding_completed`      | `"true"`                                    |
| `miu_celebration_shown`         | Timestamp                                   |
| `miu_onboarding_tour_completed` | `"true"` (or `miu_onboarding_tour_skipped`) |

---

## 7. Analytics Events (Amplitude / Network tab)

Fire up the network tab filtered to `/api/analytics` or check Amplitude debugger.

Expected event sequence for a full first-time flow:

1. `hero_upload_cta_clicked` — from homepage CTA
2. `sample_image_selector_viewed` — on tool page load
3. `sample_image_selected` — on sample click
4. `onboarding_started`
5. `onboarding_step_viewed` × 3 (steps 1, 2, 3)
6. `first_upload_completed`
7. `onboarding_completed`
8. `onboarding_tour_started`
9. `onboarding_tour_step_viewed` × 3
10. `onboarding_tour_completed`

---

## 8. Regression Checks

These existing flows must still work:

| #   | Check                                                                | Expected                                     |
| --- | -------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Logged-in user loads workspace                                       | No sample selector, no progress bar, no tour |
| 2   | Returning visitor (has `miu_first_upload_completed`) loads tool page | No progress bar shown                        |
| 3   | Homepage CTAs on `/de/`, `/fr/`, `/es/`                              | Locale prefix preserved in navigation        |
| 4   | Upload a real image (not sample)                                     | Normal upscaling flow unaffected             |
| 5   | Paid user downloads result                                           | No "See Premium Plans" in celebration modal  |

---

## Known Issues (Not Blocking)

- `HeroActions.tsx` has unused `openAuthModal` and `hasTrialEnabled` vars — lint errors, CI is red until fixed
- `FirstDownloadCelebration`: `trackCompletion()` should be in a `useEffect` (currently called in render body)
- `FirstDownloadCelebration`: X-button dismiss doesn't persist `CELEBRATION_SHOWN_KEY` — celebration reappears on remount
