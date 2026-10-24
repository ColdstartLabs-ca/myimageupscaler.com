# PRD-seo-lock-monitoring — Weekly SEO lock check, stop-loss and digest

**Status:** IN PROGRESS — local acceptance checks verified; shared production checks pending
**Priority:** P1 — the lock prevents unapproved edits, but drift with no commit (DB edit, dependency, cache), losing approved bets and ranking drops on unchanged winners stay invisible (AC-1 to AC-4 open).
**Complexity:** 6 → MEDIUM; risk override: none (breakdown: 8 implementation files +2, new module +2, GSC API +1, DB migration +1)
**Owner:** SEO dev agent; João reads the digest and signs every revert or fix.
**Depends on:** [PRD-seo-lock-approval-gate](seo-lock-approval-gate.md) (needs `content/seo-lock.json` and `lib/seo/seo-lock.ts`).

## Context
The lock stops the edits we make. This PRD covers "cut your losses quickly" and changes that nobody committed:
- **Drift without a commit:** a direct DB edit, a dependency bump or a stale cache changes production. Only a check against live HTML catches it.
- **Stop-loss on approved bets:** each signed value change has `change.baselineClicks28d` and `change.readbackDate`. Today `gsc-causation-correlation` judges pre/post by hand, and only on request.
- **Unchanged winner losing traffic:** there is nothing to revert, so this case is a diagnosis alert, not a trade.
- **New winners:** a URL that passes 20 clicks/28d stays unguarded until somebody runs regen.

Facts checked on 2026-10-23:
- ✅ Scheduled jobs already run on Cloudflare: `workers/cron/wrangler.toml` `[triggers] crons` → `workers/cron/index.ts` maps each pattern to a `POST /api/cron/*` route with the `x-cron-secret` header. No GitHub Actions cron is needed.
- ✅ Prod already calls GSC live: `app/api/cron/refresh-3kings-sitemap/route.ts` uses `createGscAccessToken`, `buildGscDateRange` and `queryAllSearchAnalyticsRows` from `server/services/gsc.service.ts`, with `GSC_SERVICE_ACCOUNT_EMAIL` and `GSC_PRIVATE_KEY` already in the Worker secrets. No new GSC client and no new secret are needed for GSC.
- ✅ Alert email pattern: `getEmailService().send({ to, type: 'transactional', template })` (`server/services/upscale-completion-health.service.ts:203`). Templates register in `server/services/email-providers/base-email-provider-adapter.ts:325,353,396`.
- ⚠️ `ADMIN_EMAIL` exists only as client env (`NEXT_PUBLIC_ADMIN_EMAIL`, default `admin@myimageupscaler.com`, zero users). The server has no `ADMIN_EMAIL`. Phase 0 adds it.
- ✅ The Brevo free cap is 276 emails per day. One email per week has no effect on it.

## Solution
0. **`ADMIN_EMAIL` server env** = `admin@coldstartlabs.ca`. Add it to the server schema in `shared/config/env.ts`, to `.env.api.example`, to the prod secret `myimageupscaler-api-prod` (gcloud-secrets safe-update flow: fetch prod, append one line, push, verify) and to the Worker allowlist in `scripts/deploy/steps/05-secrets.sh`. The digest goes to `ADMIN_EMAIL`.
1. **One weekly cron route** `app/api/cron/seo-lock-digest/route.ts`, triggered by a new Monday pattern in `workers/cron` (`0 7 * * 1`). One run does all checks and sends at most one email:
   - **Drift:** fetch each locked URL from `https://myimageupscaler.com` (`redirect: 'manual'`, one retry on 5xx, else "unreachable") and diff with `diffLock`. URL, field, lock value, live value.
   - **Stop-loss** for changes whose `readbackDate` passed: WIN, FLAT or LOSS. The rule is the change in clicks against the control (site-wide non-brand clicks over the same windows), with a minimum hold of 14 days. LOSS = −25% or worse against control. LOSS rows include a one-line revert command (restore the last signed values, then sign).
   - **Unchanged locked URLs that dropped:** −30% or worse in clicks, last 28 days against the 28 days before, with at least 20 clicks before. Diagnosis only.
   - **New winners auto-added this week** (see item 2). Plus proposals from `three-kings-manager` and `blog-opportunities-publisher` for locked URLs.
   - **Gate-file commits** this week (`scripts/seo/seo-lock-gate.ts`, `.github/workflows/deploy.yml`, `content/seo-lock.json`, any `supabase/migrations/*` file that mentions `seo_lock`), read from the public GitHub commits API.
   - No rows → no email.
2. **Auto-add in the database.** The same weekly run inserts each URL above 20 clicks/28d that is not locked yet into the table `seo_lock_auto_entries` (`path` primary key, the same 8 fields as a JSON entry, `clicks28d`, `added_at`). It uses the live values that the drift check already extracted.
   - A trigger rejects every UPDATE and DELETE, so a row is frozen from its insert. Insert uses `on conflict do nothing`.
   - **Effective lock** = `content/seo-lock.json` plus the table rows. `loadEffectiveLock()` in `lib/seo/seo-lock.ts` merges them, and the signed JSON wins when both have the same path. To change an auto-added value, João copies the entry into the JSON with new values and signs the commit.
   - Readers: the deploy gate (R1, `SUPABASE_SERVICE_ROLE_KEY` is already in `deploy.yml`), the blog API gate (one indexed select by path) and the weekly drift check.

⚠️ Cloudflare limits (unverified, check in Phase 1):
- CPU: 10ms. Extract only from `<head>`, the first `<h1>` and the first `<p>`. Read CPU time in Workers observability on the first run. If it is over the limit, the cron worker calls the route in chunks (`?offset=`).
- Same-zone fetch: the app Worker fetches its own hostname. If that subrequest fails or loops, move the HTML fetch into `workers/cron` (a separate Worker, the same pattern as today) and POST the results to the route.

## Acceptance Criteria
- [x] AC-1 [local]: `serverEnv.ADMIN_EMAIL` reads `ADMIN_EMAIL` and defaults to `admin@coldstartlabs.ca`. `05-secrets.sh` uploads it. proof: `yarn vitest run tests/unit/config/admin-email-env.unit.spec.ts tests/unit/deploy` — Evidence: `yarn vitest run tests/unit/config/admin-email-env.unit.spec.ts tests/unit/deploy`: red 2/2 before the change, green 106 tests / 13 files after. Server default and explicit override verified; Worker allowlist includes ADMIN_EMAIL.
- [x] AC-2 [local]: The drift check reports a row when a fixture "live" page differs from the lock, and zero rows when it matches. The stop-loss gives WIN, FLAT or LOSS from fixture GSC series, including a site-wide drop where the page holds against control (expected FLAT, not LOSS). proof: `yarn vitest run tests/unit/seo/seo-lock-digest.unit.spec.ts` — Evidence: 14 route-level cases cover matching/drifting pages, proportional site-wide decline → FLAT, page-specific LOSS and WIN, the 14-complete-day hold, insert conflicts and monitoring failures. Missing-module red first; 94 related tests across 11 files passed after implementation.
- [x] AC-3 [local]: The digest renders only the sections that have rows, sends to `ADMIN_EMAIL`, and sends nothing when every section is empty. The route rejects a wrong `x-cron-secret` with 401. proof: same spec, through the route handler and the `seo-weekly-digest` template — Evidence: The actual route handler rejects wrong secrets, sends one populated digest to ADMIN_EMAIL, skips email for empty sections and fails on provider refusal. Two email template tests verify section omission and text escaping. Compiled Next endpoint returned 401 for wrong/missing secret and 405 for GET on the LAN laptop.
- [x] AC-4 [local]: The weekly run inserts a fixture new winner and skips a path that is already locked. `loadEffectiveLock()` merges both sources, and the JSON wins on the same path. The migration has the trigger that rejects UPDATE and DELETE. The deploy gate and the blog API gate reject a change to an auto-added field. proof: `yarn vitest run tests/unit/seo/seo-lock-digest.unit.spec.ts tests/unit/seo/seo-lock-gate.unit.spec.ts tests/unit/api/blog-posts-seo-lock.unit.spec.ts` + the actual PostgreSQL fixtures `tests/integration/seo-lock-auto-entries.sql` and `tests/integration/seo-lock-sync-run-type.sql` — Evidence: Route fixtures insert a new >20-click winner, ignore existing/duplicate paths and read database locks. Effective-lock collision tests keep signed JSON authoritative. Real temporary PostgreSQL tests verify inserts, conflict preservation, RLS, permissions and UPDATE/DELETE/TRUNCATE rejection. Deploy and blog API consumer tests reject changed auto entries. The new sync job constraint rejects the digest before its migration and accepts all five valid job types afterward; unknown jobs remain rejected.
- [ ] AC-5 [shared]: After deploy, one manual `POST /trigger` on `workers/cron` for the Monday pattern finishes 200, its CPU time is under the limit in observability, and one email reaches `admin@coldstartlabs.ca`. proof: Worker log line + inbox check by João — Evidence: pending.

## Blocked on
- Email delivery seen in João's inbox (AC-5) — unblocked by João.

## Integration Ledger
| Capability | Reachable consumer/trigger | Replaces / disposition | Evidence |
|---|---|---|---|
| `ADMIN_EMAIL` server env | `serverEnv.ADMIN_EMAIL` ← `myimageupscaler-api-prod` ← `05-secrets.sh` allowlist | New. Client `NEXT_PUBLIC_ADMIN_EMAIL` stays untouched | AC-1 |
| Weekly drift + stop-loss + digest | `workers/cron` `0 7 * * 1` → `POST /api/cron/seo-lock-digest` → `getEmailService().send` template `seo-weekly-digest` to `ADMIN_EMAIL` | Replaces manual stop-loss checks with `gsc-causation-correlation` for locked URLs | AC-2, AC-3, AC-5 |
| New winners into the lock | same weekly route → insert into `seo_lock_auto_entries` → read by `loadEffectiveLock()` in the deploy gate, the blog API gate and the drift check | Replaces manual regen for new winners | AC-4, AC-5 |

## Decisions
- 2026-10-23 (João): alerts are one weekly email batch, kept low-noise. ⚠️ Agent pushback, recorded: drift on the homepage title can wait up to 7 days before João sees it. João can ask for an immediate email for drift only, which is expected less than once a month.
- 2026-10-23 (João): use Cloudflare cron (`workers/cron`), not GitHub Actions. Prod already has the GSC key and the email service, so no new CI secrets are needed.
- 2026-10-23 (João): send the digest to a new server env `ADMIN_EMAIL` = `admin@coldstartlabs.ca`, also stored in the secret vault.
- 2026-10-23 (agent): one weekly route replaces the daily sentinel and its `seo-lock-reports` branch. The email is weekly, so a daily check gives no faster alert, only more moving parts.
- 2026-10-23 (João): add new winners automatically, stored in an append-only Supabase table. Cloudflare cannot commit to git, and a CI auto-commit needs a GitHub write token and new GitHub secrets.
- 2026-10-23 (agent): the auto-add runs weekly in the same route, not monthly. One cron is simpler, and new winners get guarded sooner.
- 2026-10-23 (agent): only auto-added entries live in the DB. Signed values stay in git, because agents hold the service-role key and can write to the DB. Removing the trigger needs a migration, which shows in the digest's gate-file commit list.
- 2026-10-23 (João): fold the "unchanged page dropped" alert into this work. Agent framing: diagnosis only, because there is no change to revert.
- 2026-10-23 (agent): the stop-loss proposes a revert and does not run it. A revert changes lock values, so it needs João's signature, the same as any other change.
- 2026-10-23 (agent): the control is site-wide non-brand clicks. A drop that the whole site also shows is FLAT, not LOSS, so a Google update does not trigger false reverts.

## Execution Phases
#### Phase 0: `ADMIN_EMAIL` env and secret
**Status:** LOCAL CODE VERIFIED — production secret update pending
**Files:** `shared/config/env.ts` (server schema + `loadServerEnv`) · `.env.api.example` · `scripts/deploy/steps/05-secrets.sh` · prod secret `myimageupscaler-api-prod` (no file)
**Implementation:** Clone the `PROVIDER_ALERT_EMAIL` pattern. Update the prod secret with the gcloud-secrets safe-update flow. Keep the previous secret version as the backup.
**Verification:** AC-1. Red first: the env spec fails before the schema change.

#### Phase 1: Weekly route with drift check
**Status:** LOCAL VERIFIED — shared production run pending
**Files:** `app/api/cron/seo-lock-digest/route.ts` · `workers/cron/wrangler.toml` + `workers/cron/index.ts` (Monday pattern)
**Implementation:** Clone the `refresh-3kings-sitemap` route shape (cron secret, sync run). Reuse `extractSeoFields` and `diffLock` from `lib/seo/seo-lock.ts`.
**Verification:** AC-2 (drift half).

#### Phase 2: Stop-loss, drops and digest email
**Status:** LOCAL VERIFIED — shared production run pending
**Files:** same route · `emails/templates/SeoWeeklyDigestEmail.tsx` · `server/services/email-providers/base-email-provider-adapter.ts` (register the template)
**Implementation:** GSC through `server/services/gsc.service.ts` (`queryAllSearchAnalyticsRows` with the `page` dimension). Port only the brand regex from `gsc-causation-correlation`. Do not write a new GSC client.
**Verification:** AC-2, AC-3.

#### Phase 3: Auto-add table and live run
**Status:** LOCAL VERIFIED — shared production run pending
**Files:** `supabase/migrations/<timestamp>_seo_lock_auto_entries.sql` (table, RLS on with no policies, the UPDATE/DELETE trigger) · same route (insert) · `lib/seo/seo-lock.ts` (`loadEffectiveLock`) · `scripts/seo/seo-lock-gate.ts` and `app/api/blog/posts/[slug]/route.ts` (switch to `loadEffectiveLock`)
**Implementation:** Before the prod migration, run `yarn db:backup` and confirm the archives with `yarn db:backups` and `gzip -t` (CLAUDE.md rule). The migration only adds a table.
**Verification:** AC-4, AC-5.

## Local execution decisions — 2026-10-23
- No production secret/schema mutation or deployment is part of these local checks. Phase 0 code and allowlist are complete; the production secret update remains pending.
- Stop-loss uses relative page/control lift `(pageAfter/pageBefore)/(controlAfter/controlBefore)-1` over matching windows, with minimum hold 14 days. LOSS ≤ −25%, WIN ≥ +25%, FLAT between; missing or zero control baseline yields no verdict. This defines the previously unspecified WIN boundary.

### Verified foundations
- `classifySeoChange` has 11 passing cases (red missing-module first), including site-wide proportional decline → FLAT, page-specific loss, gain, 14-day hold and insufficient control data. It is not wired to the digest yet.
- `loadEffectiveLock` has passing merge/collision/fail-closed tests; JSON overrides auto entries. Persistence and enforcement readers are wired in the checkpoint below; weekly insertion remains pending, so AC-4 remains open.

### Local implementation checkpoint — 2026-10-23
- Persistence and both enforcement readers are now wired. `loadAutoSeoLocks` paginates past PostgREST's 1,000-row limit, supports indexed blog-path reads, and fails closed on storage errors. Inserts ignore path conflicts. The deploy gate checks auto-added URLs, and blog PATCH checks English and supported localized auto entries. New consumer tests failed before wiring and passed after it.
- Migration `20261024051259_seo_lock_auto_entries.sql` adds the private append-only table. An isolated PostgreSQL 17.6 container applied this migration successfully. `tests/integration/seo-lock-auto-entries.sql` proves service-role insert/read, duplicate preservation, denied service-role updates/deletes, enabled RLS, denied public access and mutation triggers including TRUNCATE. With triggers disabled locally the test failed at UPDATE; restoring them passed the complete transaction. No production database was changed, and this is not a full migration-chain claim.
- `readLiveSeoFields` and `collectSeoDrift` now cover matching pages, changed fields, unreachable URLs, manual redirects, one retry for 5xx, network errors and same-origin fetch boundaries (six passing cases, missing-module red first). The weekly route does not call them yet.
- `SeoWeeklyDigestEmail` renders nonempty sections and escapes remote values (two passing cases, missing-module red first); template registration is present. Delivery, GSC series, proposals, commit collection and cron wiring remain pending. AC-2 through AC-5 stay open.
- The table must exist before deploying its new readers; a missing table intentionally fails the gate and protected blog PATCH rather than silently dropping auto locks. Production migration and secret updates still require the documented backup and rollout steps.
- Checkpoint verification: 124 tests across 11 related files passed (storage, both enforcement consumers, lock/stop-loss helpers, drift, consolidated blog contracts, revalidation and email services/template). `yarn verify` passed after these changes. The isolated database container and its temporary volume were removed after the successful SQL test. Weekly cron/GSC/proposals/commits and production delivery remain unverified and incomplete.

### Weekly route implementation — 2026-10-23
- Monday scheduling and the authenticated manual cron trigger now reach `/api/cron/seo-lock-digest`. The route records a distinct `seo_lock_digest` sync run, measures checked/auto-added/alert counts and sends at most one email. `20261024052842_seo_lock_sync_run_type.sql` preserves the four existing job types and admits the digest type; actual PostgreSQL testing failed before this migration and passed after it. Both SQL test transactions pass together; the temporary database container and volume were removed.
- Drift and winner capture share cached live reads. Missing pages are reported instead of frozen, exact-threshold (20-click) pages stay unlocked, existing entries are skipped and duplicate inserts produce no false new-winner announcement. Storage failures fail the run; delivery refusal also marks the run failed.
- Approved bets use explicit signed `change` metadata: `approvedAt`, `baselineClicks28d`, `baselineEndDate`, `readbackDate`, `previousLockCommit`. Dates are `YYYY-MM-DD` in GSC's Pacific calendar. Baseline is the 28 days ending at `baselineEndDate`; post-change data starts the next full day after approval, ends at the earlier of the last final GSC day or day 28, and needs at least 14 complete days. Readback is at least 14 calendar days after approval. Different window lengths cancel in the page/control ratio. Older changes (over 56 days) also qualify for unchanged-winner diagnosis.
- The approval gate now freezes all entry metadata against unsigned changes. A signed rendered-value change requires valid evaluation metadata pointing at the previous verified SSH-signed lock commit. Establish the initial signed baseline before approving a bet. The digest proposes `yarn seo:lock:restore`, which verifies that source commit against João's public SSH signing keys, restores only the selected entry, preserves other entries and refuses staged or unstaged lock changes (including offsetting edits). It does not commit or apply a revert automatically.
- The referenced causation skill has no brand regex; its two exact brand queries are `myimageupscaler` and `my image upscaler`. The control excludes those two queries in the existing GSC client. A real read-only OAuth/query returned one aggregated control row (2,132 clicks for 2026-09-23 through 2026-10-20), proving the request filters and final-data mode work. No production writes or emails were made by that check.
- `content/seo-lock-proposals.json` supplies the shared proposal array; both producing skills now name its schema and include append-only database locks in their read-only check. The digest includes valid recent proposals for locked paths. Public GitHub commit collection paginates, deduplicates and inspects SQL content; unreadable evidence becomes a monitoring error rather than disappearing. A real public API read succeeded with zero relevant commits in its seven-day window.
- The production-config Next build passed on the LAN laptop in 83.16 seconds. Its real HTTP endpoint rejected wrong and absent secrets with 401 and GET with 405. Subsequent date/baseline and work-preservation guards were checked with related tests and final verification. Remote private env copies were removed. AC-5, production secrets/migrations, CPU/same-zone limits, inbox delivery and signing setup remain pending; no merge/deploy was performed.
- Verification choice: actual PostgreSQL transactions replace a static migration-string spec; they prove permissions and trigger behavior directly rather than checking for SQL text.
- Final checkpoint evidence: 94 related tests / 11 files passed. `yarn verify` passed (139.38 seconds); after the final baseline/work-preservation guards, the complete related group passed again, `yarn tsc` passed (13.81 seconds) and targeted ESLint passed (2.86 seconds). The full production build predates those narrow guards; its HTTP auth checks cover the unchanged route boundary, while the final guard behavior is covered by native-git fixtures and route tests.
