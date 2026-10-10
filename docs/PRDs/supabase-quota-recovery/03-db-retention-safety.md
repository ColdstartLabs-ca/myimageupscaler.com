# PRD-SQR-03 — Cron cleanup execution and dependency-aware DB retention

**Status:** NOT STARTED
**Priority:** P1 — MIU uses 659 MB of the org's 1.1 GB DB budget. The `:25` retention job did not prune 192,625 skipped rows that are more than 30 days old (AC-1, AC-5).
**Complexity:** 5 (MEDIUM); risk override: HIGH — production row deletes and a locking `VACUUM FULL`.
**Owner:** Claude (code), João (go for the production drain and compaction)
**Depends on:** None. This PRD runs alongside PRD-SQR-01 and PRD-SQR-02.

## Context

Audit §2–§4 (`docs/reports/supabase-cleanup-audit-2026-10-10.md`):

- The Cloudflare schedules exist and match the config. But the evidence shows neither `:20` (inputs) nor `:25` (retention) cleans anything. Old inputs remain. The cursor object is absent. 192k skipped queue rows are more than 30 days old. The root cause is not known.
- `workers/cron/index.ts:178-185` treats HTTP 200 as success even when the body reports `failed > 0`.
- `databaseRetention.service.ts:57-61` prunes terminal queue rows by `created_at`, not by the time the row became terminal. Pruning-run items cascade on delete. The restore migration `20260725000100_restore_email_queue_eligibility.sql:120-143` and the holdout state (`:306-356`) need these rows.
- `databaseRetention.service.ts:64-68` deletes webhook rows after 90 days. That removes the `event_id` dedupe gate in `app/api/webhooks/stripe/services/idempotency.service.ts:14-45`.
- A plain DELETE does not shrink the reported DB size. Only `VACUUM FULL` returns the space, and it locks the table.

Largest tables: `email_lifecycle_queue` 224 MB, `email_lifecycle_events` 93 MB, `webhook_events` 88 MB.

## Solution

1. **Find the cron root cause first.** Read the cron worker's invocation logs and the main route's responses for `:20`/`:25` (use the `cloudflare-worker-debugger` agent). Check auth (`CRON_SECRET` on both sides), the route response, and each Storage/DB step separately. Fix the cause. The router must treat `failed > 0` or a missing count as failure. Each job writes a `last_success_at` with counts that an existing health or alert path can read.
2. **Dependency-aware retention:**
   - Queue: prune terminal rows by terminal age (`updated_at`, or a `terminal_at` column if `updated_at` is touched later). Never prune rows referenced by pruning-run items, holdout or release state, pending rows, sent rows, or rows that are 90 days old or less and carry click attribution.
   - Webhooks: after 90 days, set the payload to null but keep the `event_id`, status and type as a tombstone.
3. **Drain and compact:** run `yarn db:backup` and verify the archives. Drain in bounded batches. Then run `VACUUM FULL` on the three tables in a quiet window, one table at a time. Then re-measure the cluster bytes with the audit query.

## Acceptance Criteria

- [ ] AC-1 [shared]: After deploy, the `:25` retention run and the `:20` input run each log a measured result with counts and `failed: 0`. `last_success_at` is less than 2 hours old. proof: cron worker logs and the `last_success_at` query. Evidence: pending.
- [ ] AC-2 [local]: The cron router reports a job as failed when the body has `failed > 0` or no counts. proof: `yarn test tests/unit/workers/cron` (extend the existing spec). Evidence: pending.
- [ ] AC-3 [local]: Retention keeps queue rows that the restore migration, holdout state or click attribution need. It prunes a row by terminal age, not by `created_at`. proof: an integration test against local Supabase (`supabase start`) with real FKs. Evidence: pending.
- [ ] AC-4 [local]: After a webhook row is tombstoned, a replay of the same Stripe `event_id` is still rejected as a duplicate. proof: same integration test. Evidence: pending.
- [ ] AC-6 [local]: A daily guard measures the MIU cluster bytes, the Supabase Storage bytes and the R2 bytes. It emails `PROVIDER_ALERT_EMAIL` when any value reaches 80% of the README budget, and the email includes days left at the 30-day growth rate. proof: a unit spec on the threshold and runway math, plus a forced-threshold run through the real cron route. Evidence: pending.
- [ ] AC-5 [local]: After the drain and `VACUUM FULL`, the MIU cluster size is 450 MB or less. Pending and sent queue counts are unchanged from before the drain. proof: the audit size query plus a before/after count. Evidence: pending.

## Blocked on

- The production drain and `VACUUM FULL` run only after João's go, following a verified `yarn db:backup` (archives checked with `yarn db:backups` and `gzip -t`). Ping: `Project: MIU quota. Blocker: drain ready, <n> rows, backup <path> verified. Action: reply go or stop.`
- For the AC-1 root cause, use the `cloudflare-worker-debugger` agent on workers `myimageupscaler-cron` and `myimageupscaler`. Production 403s on the `dryRun` diagnostic (audit §3) are a clue: check `CRON_SECRET` on both workers.
- AC-1 needs a deploy, which is João's call.

## Integration Ledger

| Capability             | Reachable consumer/trigger                                                                    | Replaces / disposition                     | Evidence   |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------- |
| Retention job          | `workers/cron` `25 * * * *` → `/api/cron/database-retention` → `databaseRetention.service.ts` | Rules edited in place                      | AC-1, AC-3 |
| Cron failure reporting | `workers/cron/index.ts` dispatch                                                              | Edited in place                            | AC-2       |
| Webhook dedupe         | Stripe → `/api/webhooks/stripe` → `idempotency.service.ts`                                    | Unchanged. The tombstone keeps it working. | AC-4       |

## Decisions

- 2026-10-10 (João): Stay on Free as long as possible. The size guard (AC-6) gives early warning so retention can tighten before a breach.

- 2026-10-10 (João): MIU prunes only its own tables. AutopilotRank `activity_events` gets a separate PRD in that repo.

## Execution Phases

#### Phase 1: Cron root cause and failure reporting

**Status:** NOT STARTED
**Files:** `workers/cron/index.ts`, the affected `app/api/cron/*/route.ts`
**Verification:** AC-2 red → green. AC-1 after deploy.

#### Phase 2: Retention rules

**Status:** NOT STARTED
**Files:** `server/services/databaseRetention.service.ts`, an optional migration for `terminal_at` or the webhook tombstone
**Verification:** AC-3 and AC-4 against local Supabase.

#### Phase 3: Production drain and compaction (needs João's go)

**Status:** NOT STARTED
**Verification:** AC-5.
