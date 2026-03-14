-- Seed Initial Campaign Definitions for Re-engagement Drip Campaign System
-- Phase 6: Launch & Optimization

-- =============================================================================
-- Segment 1: Non-Converters (uploaded but didn't pay)
-- Users who uploaded at least one image but never purchased credits or subscription
-- =============================================================================

-- Day 1: Result ready link
INSERT INTO public.email_campaigns (name, segment, template_name, send_day, subject, priority, enabled)
VALUES (
  'non_converter_day1_result_ready',
  'non_converter',
  'ResultReadyEmail',
  1,
  'Your upscaled image is ready',
  1,
  true
);

-- Day 3: Premium trial offer
INSERT INTO public.email_campaigns (name, segment, template_name, send_day, subject, priority, enabled)
VALUES (
  'non_converter_day3_premium_trial',
  'non_converter',
  'PremiumTrialEmail',
  3,
  'Try our premium models free',
  1,
  true
);

-- Day 7: Feature showcase
INSERT INTO public.email_campaigns (name, segment, template_name, send_day, subject, priority, enabled)
VALUES (
  'non_converter_day7_feature_showcase',
  'non_converter',
  'FeatureShowcaseEmail',
  7,
  'See what you''re missing',
  1,
  true
);

-- Day 14: Win-back (5 free credits)
INSERT INTO public.email_campaigns (name, segment, template_name, send_day, subject, priority, enabled)
VALUES (
  'non_converter_day14_win_back',
  'non_converter',
  'WinBackEmail',
  14,
  'We miss you - 5 free credits',
  1,
  true
);

-- =============================================================================
-- Segment 2: Non-Uploaders (signed up, never uploaded)
-- Users who created an account but never triggered image_uploaded event
-- =============================================================================

-- Day 1: Getting started guide
INSERT INTO public.email_campaigns (name, segment, template_name, send_day, subject, priority, enabled)
VALUES (
  'non_uploader_day1_getting_started',
  'non_uploader',
  'GettingStartedEmail',
  1,
  'Getting started with AI upscaling',
  1,
  true
);

-- Day 3: Possibility showcase (before/after examples)
INSERT INTO public.email_campaigns (name, segment, template_name, send_day, subject, priority, enabled)
VALUES (
  'non_uploader_day3_possibility_showcase',
  'non_uploader',
  'PossibilityShowcaseEmail',
  3,
  'See what''s possible',
  1,
  true
);

-- Day 7: One-click sample image trial
INSERT INTO public.email_campaigns (name, segment, template_name, send_day, subject, priority, enabled)
VALUES (
  'non_uploader_day7_one_click_try',
  'non_uploader',
  'OneClickTryEmail',
  7,
  'Try it with one click',
  1,
  true
);

-- =============================================================================
-- Segment 3: Trial Users (active trial, haven't converted)
-- Users with active trial_end date and no successful payment
-- Note: send_day for trial users represents days since trial start (or days before/after end)
-- =============================================================================

-- Trial Day 3: Progress tips
INSERT INTO public.email_campaigns (name, segment, template_name, send_day, subject, priority, enabled)
VALUES (
  'trial_user_day3_progress',
  'trial_user',
  'TrialProgressEmail',
  3,
  '3 days into your trial',
  1,
  true
);

-- Trial Day 5: Halfway reminder
INSERT INTO public.email_campaigns (name, segment, template_name, send_day, subject, priority, enabled)
VALUES (
  'trial_user_day5_reminder',
  'trial_user',
  'TrialReminderEmail',
  5,
  'Your trial is halfway through',
  1,
  true
);

-- Trial -1 day (send_day 6): Trial ending (discount)
-- Note: For trial ending emails, we use send_day 6 to indicate "one day before typical 7-day trial end"
INSERT INTO public.email_campaigns (name, segment, template_name, send_day, subject, priority, enabled)
VALUES (
  'trial_user_day6_ending',
  'trial_user',
  'TrialEndingEmail',
  6,
  'Your trial ends tomorrow',
  1,
  true
);

-- Trial Day 0 (expired, send_day 8): Trial expired - final offer
-- Note: send_day 8 indicates "after trial end" (typically day after 7-day trial)
INSERT INTO public.email_campaigns (name, segment, template_name, send_day, subject, priority, enabled)
VALUES (
  'trial_user_day8_expired',
  'trial_user',
  'TrialExpiredEmail',
  8,
  'Your trial expired - continue with discount',
  1,
  true
);

-- =============================================================================
-- Comments for documentation
-- =============================================================================
COMMENT ON TABLE public.email_campaigns IS 'Stores email campaign definitions for re-engagement drip campaigns. Seeded with 11 campaigns across 3 segments.';

-- Verification query (commented out, for manual verification)
-- SELECT segment, send_day, name, subject FROM public.email_campaigns ORDER BY segment, send_day;
