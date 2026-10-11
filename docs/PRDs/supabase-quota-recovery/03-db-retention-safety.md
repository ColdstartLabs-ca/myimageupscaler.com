# PRD-SQR-03 — Cron cleanup execution and dependency-aware DB retention

**Status:** IN PROGRESS — phases 1–2 implemented and unit-verified. AC-3/AC-4 SQL concurrency race verified on local Postgres 17. AC-1 last-success writer and AC-6 quota guard implemented with unit proof. Review findings 1–7 fixed (sent_at prune guard, completed-only tombstone, two-statement lock/delete, queue_id indexes, REST `.in` chunking, stale-cron quota email, cluster byte sum). R2 measurement and all production gates pending; AC-3/AC-4 Supabase-stack integration now verified on an owned disposable stack.
**Priority:** P1 — MIU uses 659 MB of the org's 1.1 GB DB budget. The `:25` retention job did not prune 192,625 skipped rows that are more than 30 days old (AC-1, AC-5).
**Complexity:** 5 (MEDIUM); risk override: HIGH — production row deletes and a locking `VACUUM FULL`.
**Owner:** Claude (code), João (go for the production drain and compaction)
**Checkout:** worktree `.worktrees/supabase-quota-db-retention`, branch `fix/supabase-quota-db-retention` at base `ba604949` (`master` `ba604949`).
**Depends on:** None. This PRD runs alongside PRD-SQR-01 and PRD-SQR-02. Another owner holds `.claude/worktrees/local-test-db` (unmerged); it was inspected only.

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

- [ ] AC-1 [shared]: After deploy, the `:25` retention run and the `:20` input run each log a measured result with counts and `failed: 0`. `last_success_at` is less than 2 hours old. Code implemented: `record_cron_job_success` upserts `cron_job_health.last_success_at` + counts (migration `20261010222341_cron_job_health.sql`); the retention and input-cleanup routes record on a failure-free completed run; `/api/health` reports stale or missing jobs as degraded. proof: `server/services/cronHealth.service.ts`, route specs. Evidence: unit-verified; production root-cause trace and deploy still pending.
- [x] AC-2 [local]: The cron router reports a job as failed when the body has `failed > 0` or no counts. proof: `evaluateCronResult` in `workers/cron/index.ts` plus specs in `tests/unit/workers/cron-router.unit.spec.ts` and `workers/cron/index.test.ts`. Evidence: unit-verified (26 passed, plus 24 worker tests).
- [ ] AC-3 [local]: Retention keeps queue rows that the restore migration, holdout state or click attribution need. It prunes a row by terminal age, not by `created_at`. Code implemented: `prune_email_lifecycle_queue` in `20261010221620_dependency_aware_email_queue_retention.sql` (CLI-generated name) prunes by `updated_at`, refuses delivered rows (`sent_at IS NOT NULL`), run-item, rollback, holdout and 90-day attribution rows, locks candidate ids with `FOR UPDATE SKIP LOCKED` in a first statement, then deletes them in a second statement whose fresh snapshot re-applies every dependency predicate. It also adds `queue_id`-leading indexes on `email_lifecycle_events` and `email_queue_pruning_run_items` so the delete's foreign-key checks stay indexed. A real two-session race on Postgres 17 (available image, distinct port 55432) proved the new function keeps the row+item while the pre-fix select-then-delete loses both to the FK cascade. proof: `tests/unit/server/services/databaseRetention.integration.unit.spec.ts` (deterministic lock race plus the keyed dependency seed) and the local Postgres race. Evidence: unit-verified and SQL race verified; Supabase-stack integration verified on the owned disposable stack `miu-sqr03-proof-1791674571` (10/10 tests passed, log `/tmp/miu-sqr03-real-integration.log`).
- [ ] AC-4 [local]: After a webhook row is tombstoned, a replay of the same Stripe `event_id` is still rejected as a duplicate. Code implemented: `tombstoneWebhookEvents` nulls the payload and re-applies the status/payload/age predicates on the UPDATE so an intervening retry cannot lose payload; `idempotency.service.ts` is unchanged. proof: the same integration spec now calls the real `IdempotencyService.checkAndClaimEvent` replay. Evidence: unit-verified; Supabase-stack integration verified on the owned disposable stack (replay returned `isNew: false`, `existingStatus: 'completed'`).
- [ ] AC-6 [local]: A daily guard measures the MIU cluster bytes, the Supabase Storage bytes and the R2 bytes. It emails `PROVIDER_ALERT_EMAIL` when any value reaches 80% of the README budget, and the email includes days left at the 30-day growth rate. Code implemented: `quotaGuard.service.ts` measures database bytes (`measure_current_database_bytes`, now the cluster total `sum(pg_database_size(datname))` over `pg_database`, matching the audit and AC-5) and Supabase Storage bytes (`measure_supabase_storage_bytes`), persists one sample per UTC day in `quota_guard_samples` (migration `20261010222346_quota_guard_samples.sql`), computes the 30-day growth rate and days-left runway, and emails `PROVIDER_ALERT_EMAIL` at 80% through the existing email provider (`quota-guard-alert` template). The same email now lists stale cron jobs and is sent when any job is stale, because the deploy gate only sees a degraded 200. Wired to real route `/api/cron/quota-guard`, schedule `0 2 * * *` in `workers/cron/wrangler.toml`, and worker required count `alertCount`. proof: `tests/unit/server/services/quotaGuard.service.unit.spec.ts`. Evidence: unit-verified. The integrated R2 checkout implements account-wide payload measurement through `server/services/r2-quota-metrics.service.ts`, including shared cache storage, and deploys the required Cloudflare bindings. A real read-only production request returned HTTP 403/error 10000; the token verified active and Worker settings returned 200. Actual metrics access remains unresolved; the guard correctly reports unmeasured rather than zero. This does not prove production alert delivery.
- [ ] AC-5 [local]: After the drain and `VACUUM FULL`, the MIU cluster size is 450 MB or less. Pending and sent queue counts are unchanged from before the drain. proof: the audit size query plus a before/after count. Evidence: production-pending (needs João's go).

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
| Last-success writer    | retention + input-cleanup routes → `cron_job_health` → `/api/health` cron check               | New                                         | AC-1       |
| Daily quota guard      | `workers/cron` `0 2 * * *` → `/api/cron/quota-guard` → `quotaGuard.service.ts`                | New                                         | AC-6       |

## Decisions

- 2026-10-10 (João): Stay on Free as long as possible. The size guard (AC-6) gives early warning so retention can tighten before a breach.

- 2026-10-10 (João): MIU prunes only its own tables. AutopilotRank `activity_events` gets a separate PRD in that repo.

## Execution Phases

#### Phase 1: Cron root cause and failure reporting

**Status:** PARTIAL — code implemented and unit-verified (AC-2). Production root-cause trace (AC-1) pending.
**Files:** `workers/cron/index.ts`, the affected `app/api/cron/*/route.ts`
**Verification:** AC-2 red → green (done). AC-1 after deploy (pending).

#### Phase 2: Retention rules

**Status:** DONE — code implemented; AC-3/AC-4 integration verified on the owned disposable Supabase stack `miu-sqr03-proof-1791674571`.
**Files:** `server/services/databaseRetention.service.ts`, `supabase/migrations/20261010221620_dependency_aware_email_queue_retention.sql`, `supabase/migrations/20261010222341_cron_job_health.sql`, `supabase/migrations/20261010222346_quota_guard_samples.sql`
**Verification:** AC-3 and AC-4 integration spec prepared (`tests/unit/server/services/databaseRetention.integration.unit.spec.ts`); run pending a disposable local Supabase.

#### Phase 3: Production drain and compaction (needs João's go)

**Status:** NOT STARTED — production gate.
**Verification:** AC-5.

## Verification notes

- Independent Opus 5.5 high review corrections landed: delivered failed emails (`sent_at IS NOT NULL`) are retained, only completed webhook payloads can be tombstoned, queue pruning locks candidates and then rechecks all dependencies in a separate statement, FK lookup indexes were added, REST id filters are capped at 100, stale cron jobs trigger quota email, and DB usage measures the cluster sum. A read-only production count found **1** failed email with non-null `sent_at`; no row was changed. Full `yarn verify` passed after these corrections in 35.72 seconds.

- Unit-verified locally (all passing): `tests/unit/workers/cron-router.unit.spec.ts` (26), `tests/unit/server/services/databaseRetention.service.unit.spec.ts` (8), `tests/unit/server/services/quotaGuard.service.unit.spec.ts` (7), `tests/unit/api/database-retention-cron.unit.spec.ts` (3), `tests/unit/api/upscale-input-cleanup-cron.unit.spec.ts` (3), `workers/cron/index.test.ts` (24 via `workers/cron` config). `yarn tsc` passes; `eslint` on the changed files has 0 errors. No dependency or lockfile change was needed.
- SQL concurrency verified on a real Postgres 17 (`public.ecr.aws/supabase/postgres:17.6.1.052`, port 55432, distinct from every other lane): every dependency scenario passes, and the two-session FK-insert race keeps the row+item for the new function while a control copy of the pre-fix select-then-delete loses both.
- The integration spec also carries a deterministic two-session lock race: a direct `pg` session holds `FOR UPDATE` on an otherwise prunable row, the RPC's `SKIP LOCKED` keeps it, and a second prune deletes it after release. Connection defaults to the owned stack's DB port (`apiPort + 1`), overridable with `SQR03_TEST_DB_PG_URL`/`SQR03_TEST_DB_PGHOST`/`SQR03_TEST_DB_PGPORT`.
- Run (passed): the AC-3/AC-4 integration spec ran on the owned disposable laptop Supabase stack (`miu-sqr03-proof-1791674571`, API 55431, DB 55432) reached over owned SSH tunnels with `DOCKER_HOST=ssh://joao@192.168.1.126 SQR03_REQUIRE_INTEGRATION=1`. The three SQR03 migrations were applied to that disposable DB (schema-only; no user data). Result: 10/10 tests passed (5 ownership/safety guards, 5 integration), 32.92s, log `/tmp/miu-sqr03-real-integration.log`. The spec needed two real corrections to run against the real stack: bypass the shared `vitest.setup.tsx` global stubs of `@supabase/supabase-js` and `fetch` via `vi.importActual`, and insert `priority: 'lifecycle'` (the `priority` column is TEXT; numeric ordering moved to `sort_priority`).
- No production action was taken: no migration applied, no rows drained, no `VACUUM FULL`, no secrets read. The production gate for the drain and compaction stays with João.

- R2 measurement code landed (unit-verified, append-only note; the AC-6 proof section is owned by the integration worker). `server/services/r2-quota-metrics.service.ts` makes one account-level `GET /accounts/{account_id}/r2/metrics` call with the existing `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` (`Bearer`, `redirect: 'error'`, `cache: 'no-store'`, `AbortSignal.timeout(10000)`). It sums every present class/state `payloadSize`; an absent state is zero, but an empty result or any present state without a valid non-negative safe-integer `payloadSize` returns `null`, never a fabricated zero. Missing credentials, a non-32-hex account id, a non-2xx status, `success: false`, a malformed body, a throw, or a timeout all return `null` before any write. `quotaGuard.service.ts` now persists the measured `p_r2_bytes` and reports `r2Measured: r2Bytes !== null`; the UTC sample day/window behavior is unchanged. proof: `tests/unit/server/services/r2-quota-metrics.service.unit.spec.ts` (8) and the R2 cases added to `tests/unit/server/services/quotaGuard.service.unit.spec.ts` (12 total, run with `TZ=America/Los_Angeles`). Evidence: unit-verified; the real API token-permission check was NOT run, so the root owner reads it read-only later.

- 2026-10-10 root verification: `yarn verify` passed in 78.37 seconds after UTC, owned real integration, and R2 metrics changes. Production read-only R2 metrics probe returned HTTP 403 / Cloudflare code 10000 with the existing production API token; no credentials or permissions changed. The monitor records R2 as unmeasured, never zero. Real R2 measurement remains blocked on a token authorized for account metrics.

- Production retention started after the corrected app passed deployment verification. Fresh dual-machine backup: `/home/joao/projects/myimageupscaler.com/backups/backup_2026-10-11_04-20-18.schema.sql.gz` and `/home/joao/projects/myimageupscaler.com/backups/backup_2026-10-11_04-20-18.data.sql.gz`; laptop `~/backups/miu-db/2026-10-11_04-20-18`; schema SHA `fd2c5f0350e534feabc19c0db58015efbc9aa9be4345fa8c650ed72e5fe8292d`, data SHA `59376286d933203b14caac886febc0dec510a3bc020ed8da8ab52c89399f9edd`, verified `2026-10-11T11:21:06.846Z`. The backup gate ran export/list/gzip/checksum and verified both laptop copies before mutations. Authenticated bounded dry-run returned 4,009 candidates and zero changes. First live batch removed 3,009 eligible old suppression/terminal-queue/sync rows and tombstoned 1,000 completed webhook payloads; webhook identity rows remain. All 14,016 protected pending/sent/delivered queue IDs remained, pending 3,569 and sent 10,446 counts unchanged. Durable retention success recorded at `2026-10-11T11:33:30.992Z`. Further bounded batches are running through the existing route, checking every preserved ID after each batch and stopping on any error. Full exhaustion, compaction, final counts and budget remain unverified; no Storage objects or customer images were deleted.

- Drain stopped on an HTTP 500 after 11 successful batches (44,000 logged changes after the first batch). Captured the retry failure: `prune_email_lifecycle_queue` exceeded the authenticator’s 8-second statement timeout. Read-only checks still found all 14,016 protected IDs and unchanged pending/sent counts. Candidate selection scanned/sorted about 182,000 rows and took 3,514 ms; the existing `(status, updated_at)` index could not supply the prune’s `(updated_at, id)` order across terminal statuses. Added migration `20261011114412_email_queue_prune_order_index.sql`, an ordered partial index using the existing static eligibility guards; no retention predicate or function changed. A real PostgreSQL 17 test with 50,000 rows failed before the index, then passed with no sort and exactly the same 1,000 selected IDs. `yarn verify` passed (52.55s). Fresh backup before production DDL: `/home/joao/projects/myimageupscaler.com/backups/backup_2026-10-11_04-45-21.schema.sql.gz`, `/home/joao/projects/myimageupscaler.com/backups/backup_2026-10-11_04-45-21.data.sql.gz`, laptop `~/backups/miu-db/2026-10-11_04-45-21`, schema SHA `5af6ceeab54a14a889787b3c1237e0cb851fc741b7b3283db00b7820b269b612`, data SHA `5bda74828cc5d5f5691312e5f1d3d3e6ad183065a8fc474e00f7f9f92d58f014`, verified `2026-10-11T11:46:07.455Z`. Created the index concurrently, verified ready/valid, then normal CLI history/push/history applied only this migration and confirmed no pending migrations. Production candidate selection now takes 107 ms with an ordered index-only scan. Bounded drain resumed; compaction is still pending. Security advisors were read after DDL; their existing function-permission/search-path and service-only RLS notices were not changed by this index.
