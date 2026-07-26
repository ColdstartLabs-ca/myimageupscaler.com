# Follow-up: Incident Remediation — Deferred Work

**Date:** 2026-07-18
**Status:** Backlog — do NOT execute until the minimal urgent PR (`production-credit-checkout-email-processing-incident-remediation.md`) has shipped and stabilized.

> ## ⚠️ POLICY CORRECTION
>
> An earlier version of this document declared a "confirmed" 10-credit welcome grant. **That was wrong and is revoked.** The free welcome-credit policy is **5 (standard payer countries) / 3 (restricted) / 0 (paywalled)** — the deliberate March 2026 decision (`0b08c682`, `20260331000000_reduce_free_credits_to_5.sql`). Acting on the earlier version already caused an unauthorized production change (10-credit migrations + an 83-user repair at 10 credits, executed 2026-07-18; see the urgent PRD's "Production Database State" section). Nothing in this file authorizes any credit-amount change. If anything below implies 10 credits, it is stale — 5/3/0 wins.

## Priority 1: Harden the deploy flow to fail early

**This is the actual goal of the follow-up** — not a pile of features. Every guardrail below is small, and each one would have caught a step of this incident before it hit users. In rough order of value:

1. **Migration/app compatibility gate** — the core incident lesson. The app declares the migration version it was built against (a constant next to `supabase/migrations/`); `06-verify.sh` (or a pre-deploy step) compares it to the remote's latest applied migration and fails on mismatch in either direction. This makes "DB migrated but old app still deployed" (exactly what zeroed 71 signups) a hard deploy failure instead of a silent SEV-1.
2. **Migration-history drift check, both directions** — deploy fails if (a) `supabase/migrations/` contains files not applied to the remote (**forgotten migration**), or (b) the remote history contains versions not in the repo (someone — human or agent — hot-applied to prod outside the repo). Direction (b) would have flagged the unauthorized 10-credit migrations within one deploy; direction (a) blocks the "shipped app calls an RPC that doesn't exist yet" failure.
   2b. **DB contract smoke after migration, before app deploy** — a small script that verifies the RPCs the app actually depends on: each critical function exists with the expected signature (`pg_get_function_arguments`), and for the grant RPC, a probe call with an invalid amount raises while valid amounts are accepted (rolled back / against a throwaway test user). Catches "RPC exists but its domain/contract changed" — exactly the 0/10-vs-0/3/5 mismatch that would have 500'd every signup today. Fail the deploy, not the users.
3. **Unpushed-commit guard** — already in `deploy.sh`; add a `git fetch` before the `@{upstream}` ancestry check so it can't pass on a stale tracking ref.
4. **Build-SHA verification, done right** — `APP_BUILD_SHA` appended to `.env.local` before the OpenNext build (the previous attempt set it only as a build-time shell env, so the worker always reported `"development"` and verification failed every deploy). One verification point in `06-verify.sh` comparing expected SHA to `/api/health`; skip the CI jq check and smoke-test duplication.
5. **Stripe account identity in the guard** — the existing fail-closed price guard plus `STRIPE_EXPECTED_ACCOUNT_ID` (see secret hygiene below) so a secret from the wrong Stripe account can never reach a production build.

Each of these is a few dozen lines at most. Ship them as one small "deploy guardrails" PR.

## Backlog (real problems, no urgency)

Each should become its own small PRD when picked up.

### 1. Stripe object ownership audit and repair (was Phases 4B1/4B2)

Stripe live logs showed ~75/wk `resource_missing: price`, ~80/wk `resource_missing: customer`, ~52/wk `resource_missing: event` — persisted IDs from the stale `I7KzZir1i` account being used against the live `DctxcZv2` account. Needed:

- Read-only ownership audit script classifying every persisted price/customer/subscription/payment-method/event ID against the canonical live account (PII-safe manifest).
- Checkout: validate/recreate only safely-replaceable foreign customers (free profile, no billing history); manual review for anything paid/active/ambiguous — never auto-clear.
- Reconcile/webhook-recovery crons: classify `resource_missing` once and stop retrying foreign/expired IDs every 15 minutes.
- Disable stale auto-top-up configs pending fresh consent; never migrate a payment method across accounts.

### 2. Release lineage / build-SHA verification (was Phase 0)

Keep the already-committed unpushed-commit guard in `deploy.sh`. Rebuild the SHA verification correctly: `APP_BUILD_SHA` must be appended to `.env.local` before the OpenNext build (or set as a wrangler var) — the previous attempt set it only as a build-time shell env, so the worker always reported `"development"` and verification failed on every deploy. One verification point (`06-verify.sh`) is enough; skip the CI jq check and smoke-test duplication.

### 3. Production secret hygiene (was Phase 4C)

- Add `STRIPE_EXPECTED_ACCOUNT_ID` (canonical live account `acct_1TPoZG17DctxcZv2`) to the prod GCloud secret via safe fetch-modify-push (keep two enabled versions), wire through `serverEnv`, the deploy guard, and the CI guard step's `env:`.
- Fix the multiline `GSC_PRIVATE_KEY` (currently truncated by the line-oriented `load-env.sh`): re-encode single-line (base64), decode via typed config, reject raw multiline values.
- Remove the duplicate `NEXT_PUBLIC_GA_MEASUREMENT_ID` in the client secret.
- Sanitized parity report across GCloud / GitHub Actions / Cloudflare (versions, key presence, per-destination hashes — never values).

### 4. Webhook readiness (was Phase 4D)

- Version-controlled required event set (`shared/config/stripe-webhook-events.ts`) compared read-only against the live endpoint during readiness; the endpoint has 16 events enabled while the app handles more (checkout.session.expired, payment-intent outcomes, invoice refund variants, subscription_schedule.completed).
- Stop treating the self-signed deploy challenge as Stripe endpoint verification (it only proves GCloud↔Cloudflare parity, and it pollutes webhook history with synthetic events); prove signing-secret correctness with one genuine Stripe-originated delivery observed as 2xx + idempotent DB handling.

### 5. Durable processing result recovery (was Phase 8)

The J Hill failure mode: provider completes, HTTP response is lost, client stuck at 90%, credits refunded while the work succeeded. Needed:

- Modernize the unused `processing_jobs` table: unique `(user_id, client_request_id)`, status/delivery_status, provider job ID, deduction/refund references, result URL + expiry; no raw images or provider payloads; service-role-only writes.
- Replace the unobservable `Promise.race` in `/api/upscale` with durable provider job IDs (Replicate `predictions.create/get/cancel`); persist the prediction ID before waiting and the result before reporting `completed`; idempotent refund only on terminal failure or after provider cancel — never refund while untracked provider work continues.
- Authenticated job-status route + client polling with bounded backoff; terminal/recovering UI states instead of indefinite 90%; retry creates a new request ID. `saved_images` is not a delivery receipt.
- Cloudflare 10 ms CPU limit remains binding throughout.

### 6. Operational loose ends

- Suspicious payment `py_3Tok1v17DctxcZv21NtqD4iL`: human review in the live Stripe Dashboard (Radar signals, customer history, fulfillment); record retain/refund/escalate; no automatic refund.
- Customer replies after their fixes are verified — short, factual, no internal details:
  - **Roberto** (zero-credit signup): repaired — his cohort received 10 credits, kept as goodwill.
  - **Tomasz** (checkout failure): later 50-credit purchase succeeded; apology only.
  - **Greg** (stale zero-credit email at balance 39): after send-time revalidation ships.
  - **J Hill** (checkout + lost results): after checkout smoke passes; note the 3 refunded credits; processing recovery is this backlog's item 5.
- Cleanup decision on the now-unused prod RPCs (`grant_free_credit_incident_repair`, stale-email cancel) if the urgent PR's restore migration doesn't drop them.
