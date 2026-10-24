# PRD-seo-lock-monitoring — Weekly SEO lock check, stop-loss and digest

**Status:** IN PROGRESS — local env phase verified; remaining phases pending
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
- [ ] AC-2 [local]: The drift check reports a row when a fixture "live" page differs from the lock, and zero rows when it matches. The stop-loss gives WIN, FLAT or LOSS from fixture GSC series, including a site-wide drop where the page holds against control (expected FLAT, not LOSS). proof: `yarn vitest run tests/unit/seo/seo-lock-digest.unit.spec.ts` — Evidence: pending.
- [ ] AC-3 [local]: The digest renders only the sections that have rows, sends to `ADMIN_EMAIL`, and sends nothing when every section is empty. The route rejects a wrong `x-cron-secret` with 401. proof: same spec, through the route handler and the `seo-weekly-digest` template — Evidence: pending.
- [ ] AC-4 [local]: The weekly run inserts a fixture new winner and skips a path that is already locked. `loadEffectiveLock()` merges both sources, and the JSON wins on the same path. The migration has the trigger that rejects UPDATE and DELETE. The deploy gate and the blog API gate reject a change to an auto-added field. proof: `yarn vitest run tests/unit/seo/seo-lock-digest.unit.spec.ts tests/unit/seo/seo-lock-gate.unit.spec.ts tests/unit/api/blog-posts-seo-lock.unit.spec.ts` + a migration spec under `tests/unit/migrations/` — Evidence: pending.
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
**Status:** NOT STARTED
**Files:** `app/api/cron/seo-lock-digest/route.ts` · `workers/cron/wrangler.toml` + `workers/cron/index.ts` (Monday pattern)
**Implementation:** Clone the `refresh-3kings-sitemap` route shape (cron secret, sync run). Reuse `extractSeoFields` and `diffLock` from `lib/seo/seo-lock.ts`.
**Verification:** AC-2 (drift half).

#### Phase 2: Stop-loss, drops and digest email
**Status:** NOT STARTED
**Files:** same route · `emails/templates/SeoWeeklyDigestEmail.tsx` · `server/services/email-providers/base-email-provider-adapter.ts` (register the template)
**Implementation:** GSC through `server/services/gsc.service.ts` (`queryAllSearchAnalyticsRows` with the `page` dimension). Port only the brand regex from `gsc-causation-correlation`. Do not write a new GSC client.
**Verification:** AC-2, AC-3.

#### Phase 3: Auto-add table and live run
**Status:** NOT STARTED
**Files:** `supabase/migrations/<timestamp>_seo_lock_auto_entries.sql` (table, RLS on with no policies, the UPDATE/DELETE trigger) · same route (insert) · `lib/seo/seo-lock.ts` (`loadEffectiveLock`) · `scripts/seo/seo-lock-gate.ts` and `app/api/blog/posts/[slug]/route.ts` (switch to `loadEffectiveLock`)
**Implementation:** Before the prod migration, run `yarn db:backup` and confirm the archives with `yarn db:backups` and `gzip -t` (CLAUDE.md rule). The migration only adds a table.
**Verification:** AC-4, AC-5.

## Local execution decisions — 2026-10-23
- No production secret/schema mutation or deployment is part of these local checks. Phase 0 code and allowlist are complete; the production secret update remains pending.
- Stop-loss uses relative page/control lift `(pageAfter/pageBefore)/(controlAfter/controlBefore)-1` over matching windows, with minimum hold 14 days. LOSS ≤ −25%, WIN ≥ +25%, FLAT between; missing or zero control baseline yields no verdict. This defines the previously unspecified WIN boundary.

### Verified foundations
- `classifySeoChange` has 11 passing cases (red missing-module first), including site-wide proportional decline → FLAT, page-specific loss, gain, 14-day hold and insufficient control data. It is not wired to the digest yet.
- `loadEffectiveLock` has passing merge/collision/fail-closed tests; JSON overrides auto entries. Persistence and the route/gate consumers are not wired yet, so AC-4 remains open.
