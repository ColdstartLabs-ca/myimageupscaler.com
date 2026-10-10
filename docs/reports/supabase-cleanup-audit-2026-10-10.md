# Supabase quota and cleanup audit — MyImageUpscaler

This was the original message leading to this audit

Supabase
Hello,

Your Supabase organization ColdStartLabs (ID: aqsyoufmnfjkrwhxcsxo) has consumed its quota for this billing cycle. Requests to your projects are dropped until your quota refills during October 13, 2026.

Your usage (check Usage Dashboard for full details and learn how to manage your usage):

Database size: 1.41 GB of 1.1 GB
Storage size: 5.47 GB of 1.1 GB
You continue to have full access to your database through the dashboard while other services are restricted.

Upgrade to Pro plan to increase your usage quota now.

Learn more about Fair Use Policy and if you have any questions, our support is here to help you.

Best regards,
The Supabase Team

---

Date: October 10, 2026 (PDT). Production inventory: 10:50–10:53 PDT; Cloudflare configuration inspection: 10:56 PDT. Scope: investigation and reports only. No deletion, pruning, vacuum, deployment, upgrade, permission change, or production-data write was performed.

## 1. Decision and incident scope

**Reclaim the verified temporary-upload backlog, but do not mistake cleanup for an immediate service-recovery plan or blindly run the existing broad cleanup jobs.** Customer gallery data alone is larger than the notice's Free storage threshold. Existing database-retention code also has audit, rollback, experiment-state and webhook-idempotency hazards that should be addressed before increasing its throughput.

The live Management API attributes both `myimageupscaler.com` (`xqysaylskffsfwunczbd`) and `autopilotrank.com` (`xuuwrabuavfplyyolngf`) to ColdStartLabs organization `aqsyoufmnfjkrwhxcsxo`. `ACTIVE_HEALTHY` is an infrastructure status, not proof that customer APIs are unrestricted.

Supabase's September 8, 2026 grace notice reported 1.11 GB organization database usage and stated that Fair Use would apply from October 9. Its October 9 notice, received at 15:43 PDT / 22:43 UTC, reported 1.41 GB database and 5.47 GB file-storage usage against stated 1.1 GB thresholds, with requests restricted until the October 13 billing refill. Source: coldstartlabs INBOX messages 1283 and 1511, read using preview; envelope dates independently checked.

Live MIU edge logs corroborate the outage: from October 9 22:43 UTC to October 10 17:47 UTC, **2,278 requests returned HTTP 402**: 1,924 REST, 194 Storage and 160 Auth. Only 2 REST and 30 Auth requests returned 200 in this window; this is not a complete product-level success metric. Prior-window traffic was predominantly successful. No customer request bodies, identities or raw URLs were exported.

Supabase's current documentation distinguishes three measurements: current database bytes, overall disk bytes, and billing-period quota usage. Storage quota uses GB-hours, so deleting late in a cycle does not instantly erase accumulated usage. Organization Fair Use database restrictions use the billing-period daily average across projects. These are distinct from per-project read-only/disk protection. This explains why the 5.47 GB notice is not directly comparable with today's 7.90 GB object inventory. Do not derive AutopilotRank's size by subtracting a live MIU value from the period notice.

## 2. Measured inventory and cleanup boundaries

Units below are decimal MB/GB; exact bytes are retained in the evidence JSON. Storage sizes come from object metadata, not an independent backing-store billing reconciliation.

| Inventory                        |         Count |   Exact bytes | Interpretation                                      |
| -------------------------------- | ------------: | ------------: | --------------------------------------------------- |
| upscale-inputs                   | 4,750 objects | 4,600,951,110 | Mixed input bucket; never empty wholesale           |
| saved-images                     | 1,658 objects | 3,296,674,531 | Mostly retained customer content                    |
| blog-images                      |   136 objects |     5,435,208 | Published content; preserve                         |
| Total current objects            |         6,544 | 7,903,060,849 | 7.9031 GB                                           |
| Conservative stale direct inputs | 3,815 objects | 4,254,281,039 | 4.2543 GB cleanup candidates, not approval          |
| Referenced gallery files         | 1,632 objects | 3,238,661,385 | 3.2387 GB protected customer content                |
| Unmatched gallery files          |    26 objects |    58,013,146 | 58.01 MB orphan candidates; further checks required |

The final temporary-input query ran at **2026-10-10 17:52:11.932327 UTC**. It required both `created_at` and `updated_at` older than seven days and the exact direct-input grammar: UUID-shaped user / UUID-shaped filename with jpg, png, webp or heic extension. It excluded gallery references, nonterminal reservations, nonterminal processing jobs, reservation output URLs and processing-job output paths. All five reference flags were false for the returned group. Nested delivery paths and system state were outside this grammar. This updates the earlier 3,810 count; the rolling age cutoff advanced during investigation.

Separate joins found historical terminal-reservation references to earlier candidates: 2,242 completed and 254 refunded, all with `terminal_at`. Historical references are not proof of an active workload. The status inventory contained completed/refunded reservations and completed/failed processing jobs only. This is a point-in-time check of the named durable columns, not a claim that arbitrary embedded payloads or future references have been ruled out. Recheck eligibility immediately before any separately approved deletion and retain a private exact-path manifest.

Removing only the final temporary candidates would leave **3,648,779,810 bytes, or 3.6488 GB**, in MIU. Even retained gallery content alone exceeds the notice's 1.1 GB threshold. Therefore safe cleanup reduces waste substantially but does not preserve this product's current customer-data contract on Free.

Postgres at 17:53 UTC measured 644,115,603 bytes in the primary database and **659,356,469 bytes across all cluster databases** including templates. The cluster sum matches Supabase's documented database-report definition. `default_transaction_read_only` was `off`; this session was not in read-only mode. A bounded 24-hour Postgres-log query found no 25006/53100/57P03 entries; absence in this window is not a universal health guarantee.

| Application table      | Total bytes, including indexes/TOAST |  Heap bytes | Index bytes |
| ---------------------- | -----------------------------------: | ----------: | ----------: |
| email_lifecycle_queue  |                          223,723,520 | 133,701,632 |  89,948,160 |
| email_lifecycle_events |                           92,815,360 |  47,112,192 |  45,654,016 |
| webhook_events         |                           88,457,216 |  48,775,168 |  11,468,800 |

Exact queue counts: 194,844 skipped, 10,409 sent, 9,899 cancelled, 3,930 pending and 1,106 failed. Of these, 192,625 skipped records had `updated_at` older than 30 days. Whole-table size is **not** a promised reclaim amount for any subset. A normal PostgreSQL DELETE/standard VACUUM generally makes space reusable rather than reliably shrinking the allocated file. `VACUUM FULL` locks and rewrites tables and needs its own maintenance assessment; none was run.

## 3. Cleanup exists and is scheduled; execution is the unresolved boundary

Parent execution of `node scripts/check-cron-setup.mjs` returned `OK: cron setup valid (11 jobs)`, exit 0. More importantly, read-only Cloudflare API inspection verified **all 11 live schedules exactly match the local configuration**. The hourly input schedule `20 * * * *` and retention schedule `25 * * * *` were created September 26 at 03:14 UTC and last modified October 7 at 04:28 UTC. This rules out the narrow claim that these schedules simply do not exist.

Latest inspected cron deployment: `6f6bc4d5-c126-478f-a2f2-9af6668a467f`, October 7 04:28:53 UTC, version `340004cb-067b-4d7a-90ff-ed69ff3a56c7` at 100%. Main deployment: `f64faa5f-328f-4bfa-86ee-9cd401fb153c`, October 7 04:28:52 UTC, version `6b1d6d87-aea8-430e-8f8c-98edd803a86f` at 100%. Downloaded deployed code contains both cleanup route markers; the main bundle contains cursor-state and `listV2` markers. The deployed input endpoint explicitly checks `dryRun=true` and passes that option into the sweeper. These are feature-presence checks, not a byte-for-byte commit attribution or proof of successful invocation.

Two bounded production diagnostics were attempted only with `?dryRun=true`, after confirming the deployed input route's read-only flag. Both input-cleanup and database-retention requests returned non-JSON HTTP 403 to this operator. They did **not** produce application cleanup results. This establishes an access blocker for this diagnostic path, not a proven downstream failure or secret mismatch in the scheduler. No destructive endpoint call was made.

The current cursor object `_system/gallery-cleanup-state.png` is absent from Storage metadata. Current code persists it after a non-dry-run sweep, even with zero deletions. Absence is inconsistent with a currently retained success marker, but does not distinguish no invocation, failed authentication, failed info/list/remove/state-upload, older execution, later state removal, or quota restrictions. `pg_cron` is absent but irrelevant to the checked-in Cloudflare scheduler.

Relevant source:

- `workers/cron/wrangler.toml:10–39`; `workers/cron/index.ts:141–188`: schedule-to-route mapping and authenticated HTTP dispatch. No retry loop or durable completion record here.
- `server/services/galleryCleanup.service.ts:34–50,141–181,184–203,216–324`: one-hour created-at TTL, 100 objects/page, ten pages/run, batches of 50, persistent cursor. No updated-at or durable-job guard in the automatic sweeper.
- `app/api/upscale/route.ts:1873–1889`; `server/services/async-upscale.service.ts:829–841`: request-finally cleanup intentionally skips async handoff; async reservations retain the input path. Independent cleanup is necessary.
- `app/api/cron/upscale-input-cleanup/route.ts:10–24`; `workers/cron/index.ts:178–185`: partial removal can return `failed > 0` in an HTTP-200 `success:true` response; router HTTP success is not complete cleanup success.
- `.github/workflows/deploy.yml:115–167`; `scripts/check-cron-setup.mjs:116–167`: deployment checks schedule presence and generic health, not full successful Storage cleanup. Production invocation/operation logs remain the missing causal evidence.

**Confirmed outcome:** old temporary data remains despite present code and live schedules. **Not yet confirmed root cause:** why the :20 invocations did not remove it before restrictions began. Current Storage 402s prevent ordinary Storage access during the incident, but must not be retroactively blamed for the pre-restriction backlog without invocation logs.

## 4. Unsafe cleanup paths and dependency findings

1. **Gallery orphan factory and content-loss risk.** Broad `runGalleryCleanup()` deliberately selects referenced images of apparently inactive free users using profile.updated_at, not a demonstrated last-activity event. It must not be used as temporary-input cleanup. `galleryCleanup.service.ts:428–445` logs Storage removal errors but still deletes the saved-image rows. `galleryStorage.service.ts:409–447` has similar error ordering. Failed removal can leave billable orphaned objects and erase retryable paths. A concurrent save can also be removed by user-wide DB deletion even if its path was not in the original file snapshot. These are proven code-level hazards; they are not proven causes of the observed 26 orphans.
2. **Queue audit/rollback loss.** Current retention deletes skipped/cancelled/failed queue rows older than 30 days by **created_at**, not time of terminal transition (`databaseRetention.service.ts:57–61`). Live FK inspection confirmed pruning-run items cascade on queue deletion and lifecycle events lose their queue link via SET NULL. Local migration `20260725000100_restore_email_queue_eligibility.sql:120–143` needs retained rows to restore pruned recipients. Recently cancelled old-created rows can disappear immediately under this policy. Do not mass-prune terminal rows without a dependency-aware retention policy.
3. **Experiment and link state are not junk.** Holdout-release state and its daily release guard live in queue rows (`20260725000100_restore_email_queue_eligibility.sql:306–356`). Sent rows are intentionally excluded by retention and feed caps/cooldowns; original rows also support click attribution (`email-lifecycle.service.ts:1179–1193,1713–1802`). Preserve operational preferences, pending/sent rows and 90-day click/return attribution. Audit-suppression dedupe has a shorter one-day lookback, but that does not make all terminal statuses disposable.
4. **Webhook replay key loss.** Retention deletes completed/unrecoverable webhook rows after 90 days (`databaseRetention.service.ts:64–68`). `app/api/webhooks/stripe/services/idempotency.service.ts:14–45` relies on the existing unique event_id row to deny repeat processing. Removing that row removes this gate. Preserve compact event-id/status tombstones and prune bulky payloads separately. Actual duplicate downstream financial effects were not demonstrated; never erase billing ledgers as cleanup.
5. **Automatic sweeper safety/observability gaps.** The one-hour created-at-only filter does not protect active/recovering input references; no current inventory conflict was measured, but that guard is missing. Daily broad cleanup and hourly input cleanup share a cursor with no lease, giving a source-level race risk. HTTP-200 partial failures, bounded dry-run slices and missing durable last-success metrics can conceal a backlog. Existing mocked unit tests do not establish remote operation or real FK safety.

## 5. Bounded remediation plan and acceptance criteria

1. **Resolve service access separately from garbage collection.** Use the organization Usage page and actual API health to decide recovery; do not promise that deleting late-cycle data immediately lifts the average-based restriction. Do not disable a spend cap, upgrade, or move customer assets without explicit approval.
2. **Trace :20/:25 execution, not schedule existence.** Obtain live cron invocation status and operation-boundary failures before assigning causality. Check authentication, main route response and Storage info/list/remove/state-write separately. Add last-success, oldest-stale-age, scanned/eligible/confirmed-deleted/failed counts and alerts. Acceptance: one measured successful read-only inventory followed, only if separately authorized, by a verified completed sweep.
3. **Approve and execute temporary inputs only.** Create a fresh dual-timestamp/reference-checked private manifest; preserve originals according to the agreed backup policy; remove using bounded Storage API batches; verify each object absent and re-measure bytes. Exclude saved images, published images, delivery outputs and system cursor. Target at this snapshot: about 4.25 GB, subject to fresh checks. No blanket bucket deletion or broad gallery endpoint.
4. **Fix orphan prevention before orphan removal.** Retain deletion intent until Storage confirms removal, delete only the corresponding fetched record IDs, and protect concurrent saves. Age-grace and cross-reference-check the 26 orphan candidates independently. Acceptance: partial Storage failure does not lose the DB path; a concurrent save survives cleanup; confirmed deletion is distinguishable from partial failure.
5. **Make database retention dependency-aware.** Use terminal transition age, preserve pruning/rollback/experiment/link evidence, keep webhook tombstones, and then drain bounded backlog. Exercise real FK cascades and replay behavior in an isolated test database. Estimate bloat and lock/headroom cost before any optional physical compaction. Acceptance: rollback and holdout state remain intact; repeated financial webhook effects stay deduped; pending customer work remains untouched.

### Evidence and reproducibility

Companions in this directory: `supabase-cleanup-audit-2026-10-10.evidence.json`, `supabase-cleanup-audit-2026-10-10.cloudflare.json`, and `supabase-cleanup-audit-2026-10-10.readonly.sql`. Inventories were aggregate-only and read-only. The existing dirty checkout was preserved; this report and its companions are new local files, not a deployment. No unit/integration test suite was run in the dirty checkout; local registration and live provider configuration were actually exercised.

Official references, retrieved October 10, 2026:

- Supabase current storage/quota measurement: https://supabase.com/docs/guides/platform/manage-your-usage/storage-size
- Supabase database, disk, cluster-sum and Fair Use/read-only distinctions: https://supabase.com/docs/guides/platform/database-size
- Storage metadata is read-only; deletion must use Storage API: https://supabase.com/docs/guides/storage/schema/design
- PostgreSQL standard VACUUM versus locking/rewriting VACUUM FULL: https://www.postgresql.org/docs/current/routine-vacuuming.html

Cross-project audit complete: AutopilotRank independently measured 883,055,413 bytes across its cluster databases at 18:04 UTC, with 812,113,920 bytes in activity_events and 622,050 repeated structured-credit failures across 25 articles. Its image inventory is only 5,471,659 bytes. Together with MIU's earlier 659,356,469-byte cluster sum, the two current observations total approximately 1.5424 GB; this is not the organization billing-period average in the notice. AP needs retry-producer control and safe diagnostic retention; MIU needs temporary-input lifecycle repair. The organization restriction is shared, but the remediation targets are different. See `../../../autopilotrank.com/docs/reports/supabase-cleanup-audit-2026-10-10.md` for independently verified AP evidence.
