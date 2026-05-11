/**
 * Local constant feature flags.
 *
 * These are build-time constants — change, rebuild, and redeploy to flip a flag.
 * No remote provider (LaunchDarkly, etc.) is used; this is intentional for a
 * small team that deploys frequently.
 */
export const FEATURE_FLAGS = {
  /**
   * Onboarding tour system (Driver.js tooltips, progress-step indicators,
   * and the first-download celebration modal).
   *
   * DISABLED (2026-05-07): Amplitude cohort analysis found that users who
   * saw the onboarding flow had *worse* Day-7 retention than the control
   * group who never saw it. We're keeping the code but gating it off while
   * we redesign the experience.
   */
  ENABLE_ONBOARDING: false,
} as const;
