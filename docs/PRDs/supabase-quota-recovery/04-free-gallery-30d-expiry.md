# PRD-SQR-04 — Free-gallery 30-day inactivity expiry with warning email

**Status:** IN PROGRESS
**Priority:** P1 — Without a working expiry, gallery storage keeps growing toward the R2 10 GB free limit. The current cleanup uses the wrong activity signal and can leave orphan files (AC-1, AC-2).
**Complexity:** 5 (MEDIUM)
**Owner:** Claude
**Depends on:** PRD-SQR-02 (the gallery lives on R2). PRD-SQR-01's first-wave purge is planned only; no production deletion has run.

## Context

- `runGalleryCleanup` (`server/services/galleryCleanup.service.ts:333-399`) treats a user as inactive when `profiles.updated_at` is more than 30 days old. Any profile write changes that field, not only a login. `auth.users.last_sign_in_at` is not used anywhere.
- `galleryCleanup.service.ts:428-445` and `galleryStorage.service.ts:409-447` delete DB rows even when the Storage remove fails. This leaves orphan files and loses the path needed to retry. A user-wide row delete can also remove an image saved during the run (audit §4.1).
- Schedule: `workers/cron/wrangler.toml` `0 0 * * *` → `/api/cron/gallery-cleanup`.
- Email hook: `queueLifecycleEmail` (`server/services/email-lifecycle.service.ts:391`). Helpers at `:484` and `:565` show the pattern. Campaign seeds are in `supabase/migrations/20260607011814_create_email_lifecycle_tables.sql:109`. The template map is in `base-email-provider-adapter.ts:326-354` (`GalleryExpiryWarning` registered at `:326`/`:354`).
- Brevo free tier: 276 emails per day (memory: email lifecycle send constraints). The warning emails share that cap.

## Approved safety contract (2026-10-10)

- João requires both desktop and laptop copies to pass byte-count and SHA-256 verification before an image can expire. A scheduler cannot inspect LAN disks: missing, stale, or mismatched registered proof means KEEP, including beyond 30 days. No automatic deletion is enabled today.
- Activity is the greatest account creation/sign-in, persistent-session refresh/create/update, gallery save, and processing reservation time. Preserve the raw PostgreSQL timestamp, including microseconds. Any recent activity resets the period. Paid subscriptions, purchased balance, and any positive historical purchase/subscription credit transaction exempt the user.
- Expiry requires 30 days inactivity AND actual warning delivery at least 7 days earlier for the exact activity period. Queue insertion or failed delivery is insufficient. Delivery proof survives queue pruning.
- Register verified individual image proofs only from the operator backup job after independently checking both machines. Bind the exact saved-image JSON snapshot, immutable source key/ETag/bytes, SHA-256, backup manifest/run, two verification timestamps, and a verified immutable private R2 recovery archive. An empty registry keeps every image. Registration, copy, migration, and deployment remain operator gated.
- Before external deletion, durably claim an individual image as `deleting`. Gallery reads use the immutable verified recovery archive whenever a registered proof is ready or deleting. A stale worker can delete a restored original after a new worker releases the lease; keeping archive reads after release preserves availability through that race. Check source identity, delete only that object, require HEAD 404, then atomically recheck current activity/payment/warning and exact DB snapshot before deleting only that row. Never delete by user ID.
- Process unfinished claims before new expiry on every run. If the row remains or commit outcome is uncertain, restore without overwriting using the immutable archive (R2 `x-amz-copy-source-if-match` plus `cf-copy-destination-if-none-match: *`), verify HEAD, then release the claim. Keep the archive and both LAN copies; no archive purge is part of this change. An absent row can complete the journal without deleting another object.
- Recovery-copy conditions require a real R2 smoke proof before activation; documented destination conditions are beta. Source and destination checks occur at different times, so the archive itself must be immutable. Reference: https://developers.cloudflare.com/r2/api/s3/extensions/#conditional-operations-in-copyobject-for-the-destination-object.

## Original solution (superseded where the approved contract is stricter)

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

## Remaining activation gates

- João has authorized deployment and continued execution. Automatic expiry remains disabled until per-image desktop/laptop backup registration, immutable recovery-copy proof, and scheduled warning/delivery verification pass. The paused production cron must not be replaced until those safety gates are satisfied.

## Integration Ledger

| Capability     | Reachable consumer/trigger                                             | Replaces / disposition                                                             | Evidence         |
| -------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------- |
| Gallery expiry | cron `0 0 * * *` → `/api/cron/gallery-cleanup` → `runGalleryCleanup`   | Edited in place. The signal moves from `profiles.updated_at` to `last_sign_in_at`. | AC-1, AC-2, AC-4 |
| Warning email  | gallery-cleanup cron → `queueGalleryExpiryWarnings` → `queueLifecycleEmail('gallery_expiry_warning')` | New campaign                                                                       | AC-3             |

## Decisions

- 2026-10-10 (João): Inactive means no sign-in for 30 days. Only free users expire. A warning email goes out about 7 days before deletion.
- 2026-10-10: The dated manual first-wave warning exception is separate from scheduled expiry. It does not waive the verified two-copy gate or authorize executing a production delete. Scheduled expiry requires seven days after actual warning delivery.
- 2026-10-10 (João): Recently active persistent logged-in users are kept. Any sign-in or gallery use resets the inactivity period, and paid users are exempt. The copy states the rule as "may expire after 30 days of inactivity, only after at least 7 days warning".
- 2026-10-11: The gallery-cleanup cron queues warnings through `queueLifecycleEmail`; the seeded campaign, registered template and delivery trigger persist actual `warning_sent_at`. Warnings become eligible at 23 days, and expiry requires both 30 days of inactivity and 7 days after delivery. Production deployment and the separate legacy-cron pause remain pending.

## Execution Phases

#### Phase 1: Signal and delete-order fix

**Status:** LOCAL CODE COMPLETE — explicit `GALLERY_EXPIRY_ENABLED=false` gate retained
**Files:** `galleryCleanup.service.ts`, `galleryStorage.service.ts`
**Verification:** AC-1 and AC-2 red → green.

#### Phase 2: Warning email and copy

**Status:** IN PROGRESS — template, adapter registration, English gallery UI and terms copy done and tested; the campaign seed migration, the gallery-cleanup cron queue wiring and the actual-delivery eligibility guard are implemented and tested. Production deploy remains pending.
**Files:** a campaign seed migration, `emails/templates/GalleryExpiryWarning.tsx`, the adapter map, `email-lifecycle.service.ts`, the gallery UI and terms copy
**Verification:** AC-3 and AC-5. AC-4 after deploy.

- 2026-10-10 verification: warning policy correction passed 9 service, 4 email, and 14 real PostgreSQL 17 cases. Template/UI/terms and seven-locale copy suites passed. Automatic expiry remains gated. Registry, recovery journal, two-copy native metadata registration, concrete operator commands, and archive-backed reads are now implemented and tested locally.

- Root concurrency review (2026-10-11): a renewed attempt UUID fences SQL completion but cannot fence a stale external R2 DELETE. Gallery reads therefore use the verified immutable archive for both `ready` and `deleting` proofs, including after restoration/release. Never purge an archive while its saved-image row exists. Both original and archive paths are immutable in application code. This avoids relying on a worker dying within its lease.
- Completed Opus 5.5 high review confirmed final eligibility uses a fresh post-lock snapshot at READ COMMITTED. The finalizer now rejects repeatable-read/serializable invocations; 17 real PostgreSQL cases passed. This was a focused snapshot review, not approval of the entire implementation.
- Recovery archive reads now cover both ready and deleting proofs; 53 focused gallery read/thumbnail tests passed. Registration requires full native-row metadata copied and verified on both machines, in addition to the pixels. Future R2 gallery backups use distinct source-store receipts; concrete adapters and real R2 conditional-copy proof remain under review. Automatic expiry is still disabled.

- Integration now dispatches to the verified executor only when the strictly parsed `GALLERY_EXPIRY_ENABLED` flag is true; its default and example are false. Executor failures return cron 500 and do not record success. Deployment allowlist carries the flag without changing any real secret. Missing registry proof keeps every image. The actual R2 recovery-copy smoke and operator go are still mandatory before enabling it.

- Production safety state (verified 2026-10-11): cron Worker `fd509583-a496-45ec-9248-ef798efefbb6`, deployment prefix `2c76fc18`, is deployed at 100% and its actual module pauses gallery and temporary-input cleanup before dispatch. All 11 schedules remain installed. The main app rollout to `7d7bd068-dcac-467a-ba9c-7c697fbcf12e` preserved that exact cron version and pause. Automatic expiry remains disabled. Keep the pause until per-image verified two-copy backup registration, immutable recovery-copy proof, and warning-first scheduled execution are verified; app deployment alone does not enable deletion.

- 2026-10-11 review fix (local only): warning candidates now require a current saved image; deleting the last image makes a pending warning stale before the bounded cancellation limit. Existing policy fixtures now explicitly contain old gallery images, so paid/activity/delivery assertions still exercise their original predicates. Both regressions failed before the SQL change and pass afterward; the 20-case real PostgreSQL warning suite and 17-case expiry registry suite pass. Production rollout remains gated.

- 2026-10-11 production read-only preview: `get_gallery_expiry_warning_candidates(5)` returned five candidates inside an explicitly verified read-only transaction, which was rolled back. Only activity anchors were reported; no warnings were queued or sent. This confirms the installed function can be queried, not that its definition matches the pending local correction or that scheduled warning delivery works. AC-3/AC-4 and expiry activation remain open.

- Installed-definition comparison (2026-10-11, read-only): both warning function bodies and their return types, language, volatility, security-definer mode and empty search path already match the local migration, including current-image eligibility and empty-gallery cancellation. The earlier local-only correction status is stale; no corrective migration or historical migration replay is needed. Installed definition SHA256: candidates `080f16d529b75ad89afa87c7946c6a0f5914d0f41f99249d6643f6e608a5f20e`, cancellation `eec3342be174d628870ddfb8992c2ab6f20427a307c8ba335c69c5d8b8b09c94`. No database changes, warning sends or cron changes occurred. Scheduled delivery and backup/recovery activation gates remain open.

- Recovery archive uploader repair (2026-10-11): removed the Node-to-Web stream bridge and always destroys the Node upload stream after PUT settles. Conditional creation, full-byte SHA verification, source checks and dual native-metadata proof are unchanged. All 48 focused adapter/registration tests and `yarn verify` (124.15 seconds) passed. New Node subprocess tests use injected fetch to cover complete 256 KiB uploads, early 412/500 responses and transport rejection; they do not reproduce the production crash timing or prove a hosted archive upload. Independent native review found no actionable blocker. Controlled owned-fixture recovery smoke remains required; automatic expiry and cron cleanup remain paused.

- Recovery-smoke database safety gate (2026-10-11): fresh `yarn db:backup` succeeded from the primary checkout; `yarn db:backups` listed `/home/joao/projects/myimageupscaler.com/backups/backup_2026-10-11_17-10-59.schema.sql.gz` and `.data.sql.gz`. Both archives passed local and laptop `gzip -t`, byte-count and SHA256 verification; laptop copies are `joao@192.168.1.126:~/backups/miu-db/2026-10-11_17-10-59/`. Schema: 68,359 bytes, SHA256 `b57afea6b4496f3fe940f3b8872877e9bcd0f3a12b339741a53aa82db4fe8dbc`; data: 54,201,111 bytes, SHA256 `c1202f0e10006ddc70c9cec23153151e1f3222aec2a112c9a1d9b3862a4d3a6e`. Backup retention was set to 1000; no older backups were pruned. No recovery fixture or database mutation has occurred yet.

- Controlled recovery smoke (2026-10-12): the owned synthetic image saved successfully and its fixture-only dual Storage snapshot verified. Registration stopped before archive creation or registry insertion because shared readback signing emitted `X-Amz-Expires=undefined`; exact read-only reproduction returned R2 HTTP 400 `InvalidArgument`. The source remains intact (923,643 bytes), archive HEAD is 404 and registry count is zero. Shared readback now defaults omitted/undefined expiry to the existing 900-second constant and preserves explicit values. Real-presigner regressions failed before the one-line fix; 112 focused migration/adapter/reference tests and `yarn verify` (66.60 seconds) passed; independent native review found no actionable blocker. The existing fixture is retained for a guarded resume, with fresh dual database backups before its password-only update and each registration; no new fixture, deletion or activation is authorized by the runner. Recovery smoke remains unproven until the live resume succeeds.
