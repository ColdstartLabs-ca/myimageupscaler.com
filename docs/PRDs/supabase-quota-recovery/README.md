# Supabase quota recovery (Oct 2026)

Source audit: `docs/reports/supabase-cleanup-audit-2026-10-10.md`.

The Supabase org (MIU + AutopilotRank) went over the Free quota on 2026-10-09. The audit recorded HTTP 402 restrictions. Read-only MIU checks on 2026-10-10 returned HTTP 200 for Storage and confirmed database access; execution must use current checks rather than assume a refill date.

## Decisions (2026-10-10, João)

- Stay on the Free plan. Move all MIU file storage to Cloudflare R2.
- Back up locally before any deletion or migration. Verify the backup before the source is touched.
- Expire free-user gallery images after 30 days of inactivity. João confirmed that recently active users must be kept, including users whose sessions refresh without a new sign-in. Check sign-in, session refresh, gallery saves and processing activity. Send one warning email at least 7 days before deletion. Paid users are exempt.
- Stay on Free as long as possible (decided 2026-10-10). Upgrade to Pro (about $35/mo) only when paying users make it worth the cost, or when retention can no longer keep a project inside its budget. Suggested revenue trigger (Claude, João to confirm): combined MRR of $350 or more, so Pro costs 10% of revenue or less.
- The DB budget is shared. MIU prunes its own tables. AutopilotRank gets its own PRD in its repo.

## Environment and access (verified 2026-10-10)

| Item               | Value                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supabase org       | ColdStartLabs `aqsyoufmnfjkrwhxcsxo`, Free plan. 402 restriction until the 2026-10-13 refill (time of day not stated).                                                                                                                                                                                                                                                               |
| Supabase projects  | MIU `xqysaylskffsfwunczbd`, AutopilotRank `xuuwrabuavfplyyolngf`                                                                                                                                                                                                                                                                                                                     |
| Cloudflare account | `c5dbf25d94692c78b79a8403959f8e54`. Zone `myimageupscaler.com` (Free). Image Transformations **enabled**.                                                                                                                                                                                                                                                                            |
| R2 S3 endpoint     | `https://c5dbf25d94692c78b79a8403959f8e54.r2.cloudflarestorage.com`                                                                                                                                                                                                                                                                                                                  |
| R2 buckets         | `miu-private` (private, CORS headers `content-type` and `if-none-match` since 2026-10-11, lifecycle `inputs/` 2 days and `dev/` 1 day) and `miu-public` (blog images, custom domain `assets.myimageupscaler.com` live)                                                                                                                                                               |
| MIU prod secrets   | GCloud project `myimageupscaler-auth`. Secrets `myimageupscaler-api-prod` (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_REGION`, `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) and `myimageupscaler-client-prod` (`NEXT_PUBLIC_SUPABASE_URL`). Read them at runtime the way `scripts/db-backup.sh:180-200` does. Never print the values. |
| Worker secrets     | Deploy pushes only the allowlist in `scripts/deploy/steps/05-secrets.sh:41-64`, guarded by `tests/unit/deploy/worker-secret-allowlist.unit.spec.ts`. New secrets must be added to both.                                                                                                                                                                                              |
| Backup targets     | Desktop `~/backups/miu-storage/<run-id>/`. Laptop `joao@192.168.1.126:~/backups/miu-storage/<run-id>/` (SSH key auth; see the `laptop-offload` skill).                                                                                                                                                                                                                               |
| Ping João          | `python3 ~/.claude/skills/attention-ping/scripts/ping_attention.py --title "Claude needs your attention" --message "Project: MIU quota. Blocker: <one line>. Action: <exact reply>."` Send it only at a go-gate, and only when no other safe work is left. Quiet hours 23:00–09:00 are deferred by the script.                                                                       |

## Scope clarification (2026-10-11, João)

Preserve the existing state and clean up junk. Pre-existing missing content does not require restoration to complete cleanup. This supersedes earlier absolute zero-missing requirements only for the exact known blog reference above; it does not waive backup verification, overwrite/concurrency safeguards, or authorize deleting retained customer content. The reference verifier/apply guard enforces this precise exception; native source fencing and deletion guards remain fail-closed.

## Execution timeline

| When            | Work                                                                                                                                                 | Gate                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Now → Oct 12    | Code: SQR-01 phase 1, SQR-02 phases 1–2, SQR-03 phases 1–2, SQR-04. AutopilotRank AQR-01 phase 1, AQR-02, AQR-03 phase 1. Run in parallel worktrees. | None                                 |
| Oct 13 (refill) | SQR-01 phases 2–3: backup, verify, then purge and expire                                                                                             | Ping before `--confirm`              |
| Oct 13          | AutopilotRank: deploy AQR-02, then AQR-03 phase 2                                                                                                    | Ping before deploy and before delete |
| Oct 13 → 15     | SQR-02 phase 3: copy, deploy, delta copy, verify, Supabase delete                                                                                    | Ping before deploy and before delete |
| Oct 15+         | SQR-03 phase 3: drain and `VACUUM FULL`. SQR-04 deploy.                                                                                              | Ping before each                     |

## Customer-data safety contract (applies to every PRD here)

1. **Local backup first.** Before a script deletes or moves a Storage object, it writes the object to `~/backups/miu-storage/<run-id>/` plus a manifest (`path, bytes, sha256, bucket, db_reference`). Run `sha256sum -c` against the manifest before going on.
2. **Copy, verify, then delete.** A migration copies to R2, reads back each object, and compares the sha256 with the manifest. A Supabase delete runs only for objects whose R2 hash matches.
3. **No new missing objects.** After each run, resolve every `saved_images` path and blog image URL against the new store. Preserve every object that exists at the baseline with matching bytes. João accepted the already-missing blog object `2026/01/1769887240667-tools-inline-1.webp` for post `b26a2f86-ec30-40d0-8a33-bca21bfb7417` as a follow-up on 2026-10-11; leave its reference unchanged and report it separately. No other missing reference is exempt.
4. **Deletes come from a frozen manifest only.** No prefix or bucket-wide delete. The script checks eligibility again just before the delete.
5. **Bounded and resumable.** Batches of 50 or fewer. A failed batch stops the run. The DB row is never deleted before Storage confirms the delete.
6. **Retain backups** for 30 days after the last verification in this set passes.

## Free-plan budgets

| Resource               | Free limit                    | Budget                                                                                                                                             | Owner                  |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Org DB (both projects) | 1.1 GB                        | MIU 450 MB or less, AP 250 MB or less (about 700 MB, 36% headroom)                                                                                 | PRD-SQR-03, PRD-AQR-03 |
| Supabase Storage       | 1.1 GB                        | less than 50 MB (everything on R2)                                                                                                                 | PRD-SQR-02             |
| Supabase egress        | 5 GB/mo                       | Mostly removed: images are served from R2                                                                                                          | PRD-SQR-02             |
| R2 storage             | 10 GB free, then $0.015/GB-mo | Already paid: the OpenNext cache bucket `myimageupscaler-inc-cache` holds 101 GB (checked 2026-10-10). MIU files add about 3.3 GB, about $0.05/mo. | PRD-SQR-02, PRD-SQR-04 |

A daily guard in each project alerts by email (`PROVIDER_ALERT_EMAIL`) at 80% of budget. It also emails the 30-day growth rate and the days left. An alert is the trigger to tighten retention, not to upgrade.

## PRDs (execution order)

| #   | PRD                                                                      | Priority | Why it is in this order                                                                               |
| --- | ------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------- |
| 1   | [01-oct13-input-backup-and-purge.md](01-oct13-input-backup-and-purge.md) | P0       | Must run at refill. It frees about 4.25 GB of inputs, plus the first wave of inactive free galleries. |
| 2   | [02-r2-storage-migration.md](02-r2-storage-migration.md)                 | P0       | Gallery alone (3.24 GB) is over Free. Must land within about 3 days of refill.                        |
| 3   | [03-db-retention-safety.md](03-db-retention-safety.md)                   | P1       | Also finds why the :20/:25 crons did not clean up.                                                    |
| 4   | [04-free-gallery-30d-expiry.md](04-free-gallery-30d-expiry.md)           | P1       | Keeps R2 under 10 GB. Changes the customer contract.                                                  |

External: AutopilotRank PRDs AQR-01 to AQR-03 are in `autopilotrank.com/docs/PRDs/supabase-quota-recovery/`. The org DB total stays over 1.1 GB until PRD-AQR-03 AC-4 holds (AP 250 MB or less).

## Status 2026-10-12

- MIU database: 320–324 MB of the 450 MB budget. Done.
- Supabase Storage: 311 MB (was about 7.5 GB). It drops below 50 MB after the 2026-10-18 input run (PRD-SQR-02 AC-7).
- MIU R2: 8.03 GB now. It drops to about 3.6 GB after the 2-day `inputs/` lifecycle rule removes the copied inputs.
- PRD-SQR-02 cutover, source delete and production deploy are done (see that PRD). PRD-SQR-03 is complete. PRD-SQR-04 activation is parked (D14).
- AutopilotRank: João approved the AC-2 exception. The fresh measurement window is 2026-10-12T03:41:53Z to 2026-10-13T03:41:53Z. `QUOTA_ALERT_EMAIL` is set and AP was redeployed on 2026-10-12 (health and pages 200, migrations up to date). AP compaction (AQR-03) runs after the window passes.

## Current safety checkpoint (2026-10-12)

Programmatic continuation (2026-10-12): reference verification now rejects uploads, reference edits and native-version changes during destination readback; 80 affected tests (including real PostgreSQL/HTTP races), `yarn verify` and an independent native review passed. A fresh 6,591-object native-version proof is verified on both machines, and the new snapshot loader matches it in a read-only production check (SQR-02). This is delta detection, not a permanent write fence; apply stays disabled. Existing OAuth has no R2 read/write scope and is expired; no credential/permission refresh or billable enumeration was performed, so aggregate metrics remain unmeasured. AP investigation confirms the original 25-article backlog assumption conflicts with 164 distinct first-block events; the original threshold/window remains FAIL. No explicitly authorized real warning recipient was found; email remains pending independently. Deployment, source deletion and automatic expiry remain unchanged.

- Fresh Storage snapshot: 6,591 objects / 7,955,094,701 bytes verified on desktop and laptop, fully mirrored to R2 with full per-object readback SHA verification. Final mirror receipt and frozen plan are also verified on both machines; see SQR-02. This proves the frozen snapshot, not a source write fence or later delta coverage.
- Controlled recovery archive, repeat conditional registration and authenticated owner read passed; the synthetic account, metadata and its two R2 objects were then removed under a fresh dual database backup. All backups retained. SQR-04 local AC-1/2/3/5 pass, including exact timing and concurrent-save cases.
- Activation remains blocked: source fencing/delta/reference cutover and source purge are unverified; automatic gallery expiry and input cleanup remain paused. A real test-warning recipient is not authorized, scheduled gallery execution remains unproven, and R2 metrics access/actual budget alert delivery remain unresolved.
- AutopilotRank fixed-window measurement at 00:53:25Z: 164 warnings for 164 distinct articles, maximum one each, zero generic failures. The original 25-row criterion remains FAIL; no reset, waiver, archive registration or compaction. The updated source measurement is recorded in the AP PRDs.
