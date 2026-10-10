# PRD-SQR-01 — Oct 13 full Storage backup, stale-input purge, and inactive free-gallery purge

**Status:** NOT STARTED
**Priority:** P0 — Storage usage (7.9 GB) is 7× the Free limit. GB-hours run out again about 4 days after the 2026-10-13 refill unless AC-4 lands.
**Complexity:** 3 (LOW); risk override: HIGH — destructive production Storage deletes.
**Owner:** Claude (scripts), João (go/no-go for the live purge)
**Depends on:** None

## Context

The audit (`docs/reports/supabase-cleanup-audit-2026-10-10.md` §2) found 3,815 stale direct inputs (4.254 GB) in `upscale-inputs`. These inputs are more than 7 days old by both `created_at` and `updated_at`. No gallery row, nonterminal reservation, or nonterminal job references them. The hourly `:20` input sweeper did not remove them. The root cause is not known (see PRD-SQR-03). Supabase Storage returns 402 until the refill, so this purge cannot run before 2026-10-13.

The candidate query already exists in `docs/reports/supabase-cleanup-audit-2026-10-10.readonly.sql:16-38`.

Do **not** reuse `runGalleryCleanup()` or call `/api/cron/gallery-cleanup`. Both can delete referenced customer images (audit §4.1).

## Solution

**Access.** Read `SUPABASE_SERVICE_ROLE_KEY` and the DB password from `myimageupscaler-api-prod`, and `NEXT_PUBLIC_SUPABASE_URL` from `myimageupscaler-client-prod`. Read them at runtime the way `scripts/db-backup.sh:180-200` does, and never print them. Every subcommand first runs a preflight: list 1 object in `upscale-inputs`. A 402 response means the quota is still restricted. The script then exits with code 3 and the message `quota still restricted`, and no work runs. Use the service-role Storage API for listing, download and remove. Use direct Postgres (as in `db-backup.sh`) for the eligibility SQL, because the REST API also returns 402.

**Where.** The backup is about 7.9 GB. Check `df -h ~` first, and keep at least 15 GB free. The laptop copy goes to `joao@192.168.1.126:~/backups/miu-storage/<run-id>/` with `rsync -a --checksum`, then `ssh … sha256sum -c`.

One operator script, `scripts/storage/backup-and-purge.mjs`, with three subcommands. Each subcommand writes to `~/backups/miu-storage/<run-id>/`:

1. `backup --bucket <name|all>`: lists every object with the service-role Storage API and downloads it. Writes `manifest.jsonl` (`bucket, path, bytes, sha256, created_at, updated_at`) and runs `sha256sum -c`. A second copy goes to the Debian laptop through `rsync`. Covers **all three buckets** (about 7.9 GB), not only the inputs, so PRD-SQR-02 has a verified fallback.
2. `plan-purge`: runs the audit candidate query with fresh timestamps. Keeps only paths that exist in a verified backup manifest. Writes `purge-manifest.jsonl`. This step is read-only.
3. `purge --manifest <file> --confirm`: per batch of 50 or fewer, it re-runs the reference checks for those exact paths. Any path that became referenced is dropped. It calls `storage.remove()` and then confirms each path is absent. On the first error it stops and writes `purge-result.json`. A path not in the frozen manifest is never deleted.

4. `plan-expire` / `expire --manifest <file> --confirm`: this is the first wave of inactive free-gallery cleanup. A user is eligible when `auth.users.last_sign_in_at` is more than 30 days old (or null and the account is more than 30 days old). The user also must have no active subscription and no credit purchase. `plan-expire` exports those users' `saved_images` rows to `expire-rows.jsonl` with their object paths. Every path must be present in the verified backup. `expire` deletes the Storage objects for each batch first and confirms that each one is absent. Only then does it delete **those exact row IDs**. A row is never deleted while its object still exists. Images saved after the manifest was frozen are left alone. This fixes the ordering bug in `galleryCleanup.service.ts:428-445` for this run only. PRD-SQR-04 fixes it in the service.

After both purges, `verify-integrity` (shared with PRD-SQR-02) resolves every `saved_images` storage path and every blog image reference. It reports `missing: 0` or a list.

Run `yarn db:backup` before the purge, as the repository's production-safety rule requires.

## Acceptance Criteria

- [ ] AC-1 [local]: `plan-purge` excludes any path referenced by `saved_images`, a nonterminal reservation, a nonterminal job, or a reservation/job output, and any path younger than 7 days. proof: `yarn test tests/unit/scripts/storage-purge.unit.spec.ts`. Evidence: pending.
- [ ] AC-2 [local]: `purge` deletes only paths in the frozen manifest that have a verified backup hash. It stops at the first failed batch and drops any path that became referenced. proof: same spec. Evidence: pending.
- [ ] AC-3 [local]: The full backup of all 3 buckets passes `sha256sum -c` with 0 failures. The object count equals the live listing count. The laptop copy passes the same check. proof: `backup --bucket all` output. Evidence: pending.
- [ ] AC-4 [local]: After the purge, every purge-manifest path is absent. `upscale-inputs` falls by about 4.25 GB (re-measured with the audit inventory query). proof: `purge-result.json` and the inventory query. Evidence: pending.
- [ ] AC-5 [local]: `plan-expire` selects only free users with no sign-in for 30 days. It excludes paid users and users who purchased credits. `expire` deletes a row only after its object is confirmed absent. proof: `yarn test tests/unit/scripts/storage-purge.unit.spec.ts`. Evidence: pending.
- [ ] AC-6 [local]: After the gallery purge, the expired users' objects are absent. Their rows exist in `expire-rows.jsonl`, and every object hash is in the verified backup. No row of an eligible user saved after the freeze was touched. proof: `expire-result.json` and a row count query. Evidence: pending.
- [ ] AC-7 [local]: After both purges, `verify-integrity` reports `missing: 0` for `saved_images` and blog images. proof: `verify-integrity` output. Evidence: pending.

## Blocked on

- AC-3 to AC-5 need Storage access. Supabase returns 402 until the 2026-10-13 refill. Unblocked by the refill.
- The live `purge --confirm` and `expire --confirm` runs is a destructive production action. Unblocked by João's go after he reviews AC-3 and the `plan-purge` counts.

## Integration Ledger

Integration: unchanged. This is an operator-run script with no production code path.

## Decisions

- 2026-10-10 (João): Back up locally before any deletion. Verification steps must prove no customer data is lost.
- 2026-10-10 (João): Run the first inactive free-gallery cleanup in this PRD on Oct 13. This first wave has no warning email. Restore is possible from the local backup and `expire-rows.jsonl`. Later waves send the warning email (PRD-SQR-04).
- 2026-10-10 (João): Back up all buckets, not only the purge candidates. This gives a safety net for the R2 migration.

## Execution Phases

#### Phase 1: Script and unit proof (can start now)

**Status:** NOT STARTED
**Files:** `scripts/storage/backup-and-purge.mjs` (new), `tests/unit/scripts/storage-purge.unit.spec.ts` (new)
**Implementation:** Credentials come from the `gcloud-secrets` skill (read-only) and are not printed. The eligibility SQL is copied from the audit query and parameterized on the path list. Downloads stream to disk with concurrency 4 or less.
**Verification:** Unit spec red → green on AC-1 and AC-2. The spec covers a referenced path, a young path, a path that becomes referenced mid-run, and a failed batch.

#### Phase 2: Oct 13 backup (read-only on prod)

**Status:** NOT STARTED
**Verification:** AC-3. Run it on the laptop if the desktop is busy. Each download is read-only.

#### Phase 3: Oct 13 purges (needs João's go)

**Status:** NOT STARTED
**Go-gate:** after AC-3, send the ping with the counts: `Project: MIU quota. Blocker: purge ready (<n> inputs, <GB>; <u> inactive users, <m> images, <GB>). Action: reply go or stop.` Wait for João's reply in chat.
**Verification:** Run `yarn db:backup`, then `plan-purge` and `plan-expire`. Show João the counts and bytes, then run `purge --confirm` and `expire --confirm`. Then confirm AC-4, AC-6 and AC-7.
