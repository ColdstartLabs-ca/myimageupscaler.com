# PRD-SQR-04 — Free-gallery 30-day inactivity expiry with warning email

**Status:** NOT STARTED
**Priority:** P1 — Without a working expiry, gallery storage keeps growing toward the R2 10 GB free limit. The current cleanup uses the wrong activity signal and can leave orphan files (AC-1, AC-2).
**Complexity:** 5 (MEDIUM)
**Owner:** Claude
**Depends on:** PRD-SQR-02 (the gallery lives on R2). PRD-SQR-01 already ran the first wave by hand.

## Context

- `runGalleryCleanup` (`server/services/galleryCleanup.service.ts:333-399`) treats a user as inactive when `profiles.updated_at` is more than 30 days old. Any profile write changes that field, not only a login. `auth.users.last_sign_in_at` is not used anywhere.
- `galleryCleanup.service.ts:428-445` and `galleryStorage.service.ts:409-447` delete DB rows even when the Storage remove fails. This leaves orphan files and loses the path needed to retry. A user-wide row delete can also remove an image saved during the run (audit §4.1).
- Schedule: `workers/cron/wrangler.toml` `0 0 * * *` → `/api/cron/gallery-cleanup`.
- Email hook: `queueLifecycleEmail` (`server/services/email-lifecycle.service.ts:391`). Helpers at `:484` and `:565` show the pattern. Campaign seeds are in `supabase/migrations/20260607011814_create_email_lifecycle_tables.sql:109`. The template map is in `base-email-provider-adapter.ts:~310-325`.
- Brevo free tier: 276 emails per day (memory: email lifecycle send constraints). The warning emails share that cap.

## Solution

- **Inactivity:** `last_sign_in_at` is more than 30 days old (or null and the account is more than 30 days old). Same free-user filter as today: no active or trialing subscription, free or null tier. Also exclude users who have ever bought credits.
- **Warning:** at 23 days without sign-in, queue a `gallery_expiry_warning` lifecycle email once per inactivity period. The email links to `/dashboard/gallery`. The cleanup deletes only users who were warned at least 7 days ago and still have not signed in. Signing in resets the period.
- **Safe delete order:** select the row IDs → remove their objects → confirm each object is absent → delete **only those row IDs**. Keep a row when its object remove failed. A run never deletes by user ID.
- **Copy:** add one line about gallery retention to the gallery UI and the terms. Keep all free-offer wording (CLAUDE.md conversion-copy constraint).

## Acceptance Criteria

- [ ] AC-1 [local]: The cleanup selects users by `last_sign_in_at` and the free/paid filters. A user who signed in recently but has an old `profiles.updated_at` is kept. proof: `yarn test tests/unit/server/galleryCleanup` (extend). Evidence: pending.
- [ ] AC-2 [local]: When the Storage remove fails, the row is kept. An image saved during the run survives. proof: same spec. Evidence: pending.
- [ ] AC-3 [local]: A user inactive for 23 days gets exactly one warning email. A user not warned 7 or more days ago is not deleted. Signing in cancels the pending deletion. proof: the email lifecycle unit spec plus the gallery cleanup spec. Evidence: pending.
- [ ] AC-4 [shared]: The first scheduled run after deploy logs counts (warned, deleted, failed: 0), and its `last_success_at` (from PRD-SQR-03) is updated. proof: cron worker logs. Evidence: pending.
- [ ] AC-5 [local]: The gallery page and the terms state the retention rule, and the free-offer protection tests pass. proof: `yarn test tests/unit/seo/free-offer-conversion-copy.unit.spec.ts tests/unit/seo/protected-pages.unit.spec.ts`. Evidence: pending.

## Blocked on

- The deploy needs João's go. Ping: `Project: MIU quota. Blocker: gallery-expiry deploy ready. Action: reply go or stop.`

## Integration Ledger

| Capability     | Reachable consumer/trigger                                             | Replaces / disposition                                                             | Evidence         |
| -------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------- |
| Gallery expiry | cron `0 0 * * *` → `/api/cron/gallery-cleanup` → `runGalleryCleanup`   | Edited in place. The signal moves from `profiles.updated_at` to `last_sign_in_at`. | AC-1, AC-2, AC-4 |
| Warning email  | Daily lifecycle scan → `queueLifecycleEmail('gallery_expiry_warning')` | New campaign                                                                       | AC-3             |

## Decisions

- 2026-10-10 (João): Inactive means no sign-in for 30 days. Only free users expire. A warning email goes out about 7 days before deletion.
- 2026-10-10 (João): The first wave runs on Oct 13 in PRD-SQR-01 with no warning email. Waves after that one get the warning.

## Execution Phases

#### Phase 1: Signal and delete-order fix

**Status:** NOT STARTED
**Files:** `galleryCleanup.service.ts`, `galleryStorage.service.ts`
**Verification:** AC-1 and AC-2 red → green.

#### Phase 2: Warning email and copy

**Status:** NOT STARTED
**Files:** a campaign seed migration, `emails/templates/GalleryExpiryWarning.tsx`, the adapter map, `email-lifecycle.service.ts`, the gallery UI and terms copy
**Verification:** AC-3 and AC-5. AC-4 after deploy.
