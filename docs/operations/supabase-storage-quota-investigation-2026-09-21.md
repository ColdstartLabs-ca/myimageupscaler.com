# Supabase storage/quota investigation — 2026-09-21

## Decision

Do **not** delete inactive users as the primary cleanup mechanism. The database growth is mostly append-only operational history, and the object-storage problem is mostly abandoned temporary upload files.

Recommended order:

1. Fix and accelerate cleanup of `upscale-inputs` temporary objects.
2. Add a bounded database-retention cron for terminal email, webhook, and sync history.
3. Delete in batches, monitor for a week, then decide whether an upgrade is still justified.
4. Do not purge users, credit ledgers, billing records, or active/pending jobs for quota relief.

No production data was changed during this investigation.

## Scope and validation

- Supabase project verified before querying: `xqysaylskffsfwunczbd` (`https://xqysaylskffsfwunczbd.supabase.co`).
- Read-only aggregate queries executed at `2026-09-21 16:02 UTC`.
- No user IDs, emails, object paths, or payload contents were extracted.
- SQL-level `pg_database_size(current_database())`: **596.5 MiB** (`625,437,843` bytes).
- The earlier dashboard/reminder figure was **1.11 GB**. This does not match the current SQL-level database size. Recheck the dashboard after cleanup/measurement refresh before paying for an upgrade.

## What is consuming the database

| Relation                        | Total size | Estimated rows | Finding                                                                                    |
| ------------------------------- | ---------: | -------------: | ------------------------------------------------------------------------------------------ |
| `public.email_lifecycle_queue`  |  209.8 MiB |        206,261 | Largest table; 93.8% of rows are terminal `skipped` records. Includes 82.2 MiB of indexes. |
| `public.email_lifecycle_events` |   87.4 MiB |        228,124 | Mostly duplicate suppression audit events tied to skipped queue attempts.                  |
| `public.webhook_events`         |   83.9 MiB |         36,699 | Large JSON payload archive; 81.1% of rows are older than 90 days.                          |
| `auth.users`                    |   32.3 MiB |         28,410 | Not the main problem.                                                                      |
| `auth.identities`               |   22.6 MiB |         28,472 | Not the main problem.                                                                      |
| `public.credit_transactions`    |   21.8 MiB |         61,726 | Financial ledger; retain.                                                                  |
| `auth.refresh_tokens`           |   21.6 MiB |         50,817 | Supabase-managed; do not build application cleanup around it.                              |
| `public.free_credit_grants`     |   15.8 MiB |         28,542 | Abuse/credit audit trail; retain unless a separate compliance policy is approved.          |
| `public.sync_runs`              |    6.1 MiB |         24,501 | Routine operational logs suitable for retention.                                           |

The email queue plus its event table consume **297.2 MiB**, about **49.8%** of the current SQL-level database size.

## Main database junk: suppression audit amplification

`email_lifecycle_queue` contains:

- `193,496` skipped rows — **93.8%** of estimated queue rows.
- `190,609` skipped rows older than 30 days.
- Only `5,770` pending rows.
- The largest skipped reasons are:
  - `suppressed_frequency_cap`: `83,633`
  - `suppressed_campaign_cooldown`: `62,965`
  - `suppressed_lifecycle_weekly_cap`: `46,226`

The largest campaign sources are:

- `winback-never-uploaded-14d`: `74,231` skipped rows
- `winback-credit-holder-21d`: `74,095` skipped rows
- `winback-former-buyer-45d`: `16,937` skipped rows
- `unused-credits-14d`: `14,946` skipped rows

The matching event table contains `193,472` `suppressed_frequency_cap` events. The application already deduplicates suppression audit lookup over a **one-day** window, so preserving months of these rows is not required for that runtime behavior.

### Recommendation

Create an **hourly backlog-retention job** that deletes in small, repeatable batches. At the current 1,000-row cap, hourly execution can drain the roughly 190,000-row suppression backlog before the October 9 enforcement date; daily execution would not.

- `email_lifecycle_queue`
  - `skipped`, `cancelled`, or `failed` older than **30 days**
  - never delete `pending`
  - initially retain `sent` for **180 days**; reduce only after confirming reporting/attribution needs
- `email_lifecycle_events`
  - suppression events older than **30 days**
  - retain send/click/return/purchase events for **180 days** initially
- Cap destructive batches at `1,000` rows per policy; authenticated dry-runs may inspect up to `5,000` candidates.
- Emit actual deleted-row counts rather than assuming every selected candidate still matched at delete time.

This attacks the actual growth mechanism without deleting customer accounts.

## Second database target: webhook payload archive

`webhook_events` contains:

- `36,699` rows total.
- `29,779` terminal rows older than 90 days (**81.1%**).
- Approximately **45.6 MiB** of JSON payload data older than 90 days before index/row overhead.
- `27,639` old completed rows and `2,140` old unrecoverable rows.

There are also two indexes on `event_id`: a unique constraint index and a second non-unique index. The unique index had no recorded scans while the non-unique index was heavily used; this is a candidate for a separate index review, not an immediate drop without checking query plans and constraint semantics.

### Recommendation

- Purge terminal `completed` and `unrecoverable` webhook rows older than **90 days** in bounded batches.
- Retain failed/retryable/non-terminal rows regardless of age until resolved.
- Keep 90 days of event IDs for idempotency and investigations.
- Do not drop the unique constraint merely because its index scan counter is zero; PostgreSQL constraints still depend on it.

## Other safe retention candidates

- `sync_runs`: delete successful runs older than **90 days**; retain failures for **180 days**.
- `email_logs`: keep at least **90 days**, because the code queries failed delivery history over a 90-day window.
- Completed processing jobs/reservations: no quota-driven deletion yet. They are relatively small and tied to credit delivery/audit behavior.
- Credit transactions, free-credit grants, profiles, subscriptions, and billing records: retain.

## Inactive-user idea: not recommended

- Total users: `28,410`.
- Users inactive for more than 180 days: `4,241` (**14.9%**).
- Inactive users are associated with many queue rows, but inactivity is not the root cause; the email system repeatedly generated terminal suppression records.
- Deleting users risks cascading deletion of profiles, email history, saved-image records, and potentially useful billing/credit evidence.

If account deletion is ever introduced, it should be a separate privacy/product policy with warnings, grace periods, exclusions for purchasers/subscribers/positive balances, and legal retention rules—not a database quota cron.

## Separate and more urgent object-storage leak

Supabase object metadata shows approximately **6.0 GiB** across the inspected buckets:

| Bucket           | Objects | Stored bytes | Finding                                                                                                                                        |
| ---------------- | ------: | -----------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `upscale-inputs` |   3,090 |     3.09 GiB | `3,084` objects are older than one hour; `3,004` objects / 2.96 GiB are older than one day. All are direct two-segment temporary upload paths. |
| `saved-images`   |   1,612 |     2.98 GiB | Mostly intentional gallery data; 1,586 matching DB records declare about 2.92 GiB. Existing inactive-free-user cleanup policy applies.         |
| `blog-images`    |     136 |      5.2 MiB | Negligible.                                                                                                                                    |

The existing `galleryCleanup.service.ts` is intended to remove `upscale-inputs` after one hour, but it scans only **100 objects per daily run** using a cursor. A 3,000-object stale backlog proves that current throughput/cadence is inadequate or the production cron is not completing reliably.

### Recommendation

- Run temporary-input cleanup **hourly**, not daily.
- Process multiple pages per invocation within a strict runtime/object cap, rather than only one 100-object page.
- Expose metrics: scanned, eligible, deleted, failed, next cursor, oldest remaining temporary object, and remaining stale count.
- Alert when stale temporary bytes exceed a fixed threshold (for example 250 MiB) or oldest stale age exceeds two hours.
- Keep `saved-images` cleanup separate because those files are user-facing and governed by subscription/inactivity policy.

The temporary upload backlog is the clearest immediate waste: roughly **2.96 GiB older than one day**.

## Proposed cron shape

Use two separate jobs so failure domains and policies remain clear:

1. **Hourly object cleanup**
   - Delete only eligible `upscale-inputs` direct-upload objects older than one hour whose user and filename segments are UUID-shaped.
   - Process up to ten 100-object pages per invocation, with delete batches capped at 50 objects and metrics based on Supabase-confirmed deletions.
   - Provide authenticated `dryRun=true` reporting that never deletes objects or advances the cleanup cursor.
   - Require `x-cron-secret` on the Worker manual-trigger endpoint so callers cannot accelerate destructive jobs anonymously.
   - No database-account deletion.

2. **Hourly database backlog retention**
   - Delete terminal rows according to the table/status cutoffs above.
   - Cap each policy at 1,000 rows per run, reapplying terminal-state and cutoff filters during deletion to limit race risk.
   - Keep hourly cadence through the enforcement window; reassess a lower maintenance cadence after the backlog is gone.
   - The endpoint supports authenticated dry-run reporting before deployment.

Before the first production delete or schema change, follow the repository rule: run and verify `yarn db:backup`, record the backup paths, then execute and verify the cleanup.

## Upgrade decision

Do not upgrade solely from the current evidence.

First:

1. Clear the stale temporary object backlog.
2. Add terminal-history retention.
3. Recheck SQL database size and the Supabase dashboard measurement after its reporting lag.
4. Upgrade only if legitimate retained data continues to grow toward quota after retention is operating.
