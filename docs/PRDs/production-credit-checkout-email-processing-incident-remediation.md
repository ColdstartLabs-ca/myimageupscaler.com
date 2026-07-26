# PRD: Production Incident Fix — Minimal Urgent Scope

**Date:** 2026-07-18
**Status:** Ready for implementation
**Severity:** SEV-1
**Supersedes:** the full remediation plan, preserved at `docs/PRDs/incident-remediation-followup-full.md`. Everything not listed here is deferred to that follow-up.

## Confirmed Product Decision

**Free welcome credits are 5 (standard) / 3 (restricted) / 0 (paywalled)** — the March 2026 policy (`0b08c682`, `20260331000000_reduce_free_credits_to_5.sql`) stands. The full PRD's 10-credit decision is REVOKED. Any copy promising 10 free credits is wrong and must say 5.

## ⚠️ Production Database State (verified 2026-07-18 ~18:40 UTC)

A previous session already applied the four 10-credit migrations to the **remote production database** AND ran the data operations:

- `claim_free_credit_grant` in prod now accepts **only 0 or 10** and raises on 3/5 (verified via `pg_get_functiondef`).
- The **cohort repair already executed**: 83 users received 10-credit repair transactions (`free_grant_repair%`, `decision_reason='eligible_unique'`) and 40 paywalled users received idempotent zero decisions — the incident cohort is already compensated, at 10 credits instead of 5.
- The stale-email cancellation also ran: 5 queue rows cancelled (3 `zero-credits`, 2 `low-credits`) with normalized stale-balance reasons. Benign; nothing deleted.

Consequences:

1. **Do NOT delete the four applied migration files** (`20260718110000`, `113000`, `114500`, `121000`) from `supabase/migrations/` — they are in the remote migration history. Deleting them creates local/remote drift. Keep the files; roll **forward** with a new migration.
2. **A new migration is REQUIRED before deploying the app.** The committed app calls the RPC with 5/3; the live function raises on those values — deploying without the rollback migration breaks every new signup with an HTTP 500. The new migration must restore the `20260718021253` function semantics (accept 0/3/5, identity fallback, 5/3/0 amounts).
3. **The 83 users who already got 10 credits: leave them.** Clawing back 5 credits from 83 users is customer-hostile and riskier than the ~415-credit cost. No further cohort repair is needed — the repair step is REMOVED from this PRD. (Formal clawback would need a separate approved decision anyway.)

## The Incident (unchanged facts)

1. **Zero-credit signups:** prod DB migration zeroed new profiles; deployed app never calls `claim_free_credit_grant`. ~71 standard/restricted users got 0 instead of 5/3. (Roberto: standard, should have 5.)
2. **Checkout broken:** stale `I7KzZir1i` price family reached checkout against the `DctxcZv2` live account. Fix already exists in local commits (`057e1b1c`, `bdafe974`). (Tomasz retried successfully — no action needed.)
3. **Stale balance email:** Greg got a "zero credits" email 14 days late while holding 39 credits — queue rows render frozen `template_data` without send-time revalidation.
4. **Processing result loss** (J Hill): DEFERRED to follow-up — credits were already refunded; no active harm.

## P0 Scope — the only things in this PR

### 1. Revert the 10-credit rework in the working tree

Restore to HEAD (they implement the revoked 10-credit decision):

- `shared/config/credits.config.ts`, `lib/anti-freeloader/region-classifier.ts`, `shared/config/subscription.config.ts`
- All SEO/copy changes: `app/seo/data/*.json`, `locales/en/*.json`, `tests/unit/seo/*` (committed copy already says 5)
- **KEEP the four untracked migration files** (`20260718110000`, `113000`, `114500`, `121000`) — they are already applied to the remote DB (see above). Commit them as-is.
- Delete `scripts/audit-stale-balance-emails.ts` + its tests (already executed; Phase 5 revalidation makes any future backlog self-cancelling at send time)
- Revert the 10-credit expectations in `tests/unit/anti-freeloader/*`, `tests/unit/config/*`
- Revert Phase 0 SHA-verification changes (`.github/workflows/deploy.yml`, `app/api/health/route.ts`, `scripts/deploy/steps/06-verify.sh`, `APP_BUILD_SHA` in `env.ts`, `tests/smoke/health.smoke.spec.ts`, deploy unit-test changes) — the plumbing is broken (SHA never reaches the worker; would fail every deploy) and it is not needed to fix the incident. Follow-up.
- Revert working-tree changes to `scripts/deploy/*stripe*` / guard tests IF they add the `STRIPE_EXPECTED_ACCOUNT_ID` hard requirement — the committed guard from `bdafe974` must keep working without new secret provisioning. (Verify: CI and local deploy must pass with today's secrets.)

### 2. Keep these working-tree fixes (small, reviewed, real bugs)

- **`client/utils/account-setup.ts` + auth pages** (`app/[locale]/auth/callback/page.tsx`, `confirm/page.tsx`): auth completion awaits `/api/users/setup`, checks `response.ok` and terminal payload, bounded retry, error UI instead of silent zero-credit redirect. Root cause 2 of the incident.
- **Provisional-state guards** (`lib/anti-freeloader/check-freeloader.ts`, `app/api/upscale/route.ts`, `app/api/bg-removal/deduct/route.ts`): return `ACCOUNT_SETUP_PENDING` for a free profile with no grant decision — never `FREE_LIMIT_EXCEEDED`, never a deduction. Required because prod profiles now start at 0 until the RPC runs.
  - **MUST FIX before merge:** `app/api/users/setup/route.ts` currently returns `setupStatus:'complete'` when the country can't be resolved, recording no decision — the user is then stuck at `ACCOUNT_SETUP_PENDING` forever. Return a retryable pending response for an unclassified free profile instead. Add a test.
- **Email send-time revalidation** (`server/services/email-lifecycle.service.ts` + its tests, `scripts/check-recovery-delivery.ts`): after claiming a queue row and before the provider call, load current balances; cancel with a normalized reason if the campaign is no longer true; use fresh values otherwise; reschedule on read failure. Reviewed clean. Fixes Greg's failure mode and neutralizes the stale backlog without a separate cancellation script.
- Keep the setup route/service on the **committed 5/3/0 amounts** (revert its 10-credit parts, keep its structure/`response.ok` contract).

### 3. New migration: restore the 5/3/0 grant function

One new migration, `<timestamp>_restore_five_credit_grant_policy.sql`:

- Re-create `claim_free_credit_grant` with the `20260718021253` semantics: accept `(0, 3, 5)`, identity-based reduction, service-role-only, same locking and hashing. Copy the function body from that migration rather than rewriting it.
- Existing decisions (including the 123 `ten_credit_unique_v1` rows) are untouched — the RPC's existing-decision early-return makes them permanent no-ops.
- Optionally `DROP FUNCTION` the now-unused repair RPC (`grant_free_credit_incident_repair`) and stale-email-cancel RPC to remove dead SECURITY DEFINER surface; keep the welcome-grant unique index (it's policy-neutral and prevents duplicates).
- Delete `scripts/audit-free-credit-incident.ts` + tests — the cohort repair already happened; no further repair is authorized.

**Backup protocol applies:** `yarn db:backup`, verify via `yarn db:backups` + `gzip -t`, record paths — before applying this migration.

### 4. Ship it

1. `yarn test` + `yarn verify` green.
2. Commit in reviewable chunks; push; **deploy only the pushed SHA**.
3. **Backup** (`yarn db:backup` → `yarn db:backups` + `gzip -t` → record paths), then apply the restore-5/3/0 migration. Ordering matters: migration BEFORE app deploy (the old deployed app doesn't call the RPC, so the migration is backward-compatible; the new app requires it).
4. Deploy app. Verify: new test signup gets 5 credits; paywalled test signup gets 0 + purchase CTA; setup retry doesn't duplicate.
5. Checkout smoke: $4.99 small-pack session reaches Stripe under the live account.
6. Spot-check the incident cohort: 83 repaired users keep their 10; a user signing in with no decision gets 5 via setup.
7. Canary one stale zero-credit queue row: cancelled at send time, no provider call.

### Stop conditions

- New eligible signup doesn't get exactly 5 (or 3 restricted).
- Setup retry changes any balance.
- Auth completion redirects as success after a non-2xx setup response.
- Checkout smoke fails or references the stale price family.
- A stale balance email reaches the provider.
- Any attempt to claw back the 83 already-granted 10-credit repairs without an explicit approved decision.

## Explicitly Deferred (see `incident-remediation-followup-full.md`)

- Release lineage / build-SHA verification (Phase 0) — fix the env plumbing first
- Stripe object-ownership audit & foreign customer/event repair (4B1/4B2) — the recurring `resource_missing` noise continues until then; it does not block checkout after the price fix
- GCloud secret normalization, `STRIPE_EXPECTED_ACCOUNT_ID`, GSC key encoding (4C)
- Webhook readiness / event-set convergence (4D)
- Durable processing jobs + result recovery (8A/8B)
- Stale-email backlog cancellation script (superseded by send-time revalidation)
- Suspicious payment `py_3Tok1v17DctxcZv21NtqD4iL`: human review in Stripe Dashboard — do this anytime, no code
- Customer replies (Roberto/Tomasz/Greg/J Hill) — after their gates pass, per full PRD Phase 10

## Acceptance

- [ ] Working tree diff is reduced to the P0 files above
- [ ] New signups: 5/3/0 per region tier; idempotent under retry/concurrency
- [ ] No provisional-zero profile can process, be told "free limit exceeded", or get stuck pending forever
- [ ] Checkout smoke passes under the live account
- [ ] Balance emails revalidate at send time; stale rows cancel
- [ ] Cohort verified: 83 repaired users retain 10 (no clawback); any remaining decision-less free user gets 5 on next sign-in
- [ ] Copy says 5 free credits everywhere (committed state — verify, don't change)
- [ ] `yarn test` + `yarn verify` green
