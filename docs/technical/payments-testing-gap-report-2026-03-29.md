# Payments Testing Gap Report

**Date:** March 29, 2026
**Scope:** Checkout, portal, subscriptions, credits, Stripe webhooks, webhook recovery, and user-visible billing state

## Executive Summary

The repo already has a lot of payment-related tests, but the system is **not yet covered end to end in a way that would make payment failures safe by default**.

What exists today is strongest at the **unit** and **API contract** level:

- `tests/unit/api/stripe-webhooks.unit.spec.ts`
- `tests/unit/api/credit-refund-dispute-webhooks.unit.spec.ts`
- `tests/unit/api/cron-recover-webhooks.unit.spec.ts`
- `tests/api/checkout.api.spec.ts`
- `tests/api/portal.api.spec.ts`

What is still missing is a **trustworthy, runnable billing proof layer** that exercises persisted state and recovery behavior across the full flow.

Two concrete findings from the audit:

1. The browser "proof" tests are not true payment E2E.
   They preload auth state, mock Supabase, and in places mock `/api/checkout`, so they only prove UI rendering after a simulated outcome.

2. Part of the backend "proof" suite is currently not trustworthy as a billing gate.
   Running
   `yarn playwright test --project=integration tests/integration/subscription-lifecycle-proof.integration.spec.ts --grep "Invoice payment failed sets past_due"`
   failed because `ctx.supabaseAdmin` was `null`, not because of billing logic.

## What Already Exists

### Good coverage already present

- Checkout API validation and auth coverage in `tests/api/checkout.api.spec.ts`
- Portal API validation and security coverage in `tests/api/portal.api.spec.ts`
- Webhook route and handler logic coverage in `tests/unit/api/stripe-webhooks.unit.spec.ts`
- Refund/dispute/clawback unit coverage in `tests/unit/api/credit-refund-dispute-webhooks.unit.spec.ts`
- Webhook recovery cron unit coverage in `tests/unit/api/cron-recover-webhooks.unit.spec.ts`
- A large set of "proof" integration specs intended to cover signup, ordering, recovery, renewal, upgrade, downgrade, and lifecycle flows

### Current trust problems

- `tests/e2e/subscription-signup-proof.e2e.spec.ts` and `tests/e2e/subscription-upgrade-proof.e2e.spec.ts` are browser assertions over mocked state, not real payment journeys.
- `tests/helpers/test-data-manager.ts` returns `null` for the Supabase client in `ENV=test`.
- `tests/helpers/test-context.ts` exposes that `null` via `ctx.supabaseAdmin`.
- Several proof integration tests dereference `ctx.supabaseAdmin.from(...)`, so they are not currently runnable as written.
- `tests/integration/billing-system.integration.spec.ts` still targets stale routes like `/api/billing/checkout`, `/api/billing/portal`, and `/api/billing/subscription`.
- CI is not enforcing billing tests. `.github/workflows/code-quality.yml` runs lint, format, and `tsc`, but not `test:billing`, `test:billing:e2e`, or targeted billing unit/API suites.

## Testing Still To Be Created

## P0: Must Create First

### 1. A runnable stateful billing proof harness

Before adding more billing proof tests, the existing proof layer needs a working persistence-backed harness.

Needed:

- Make proof integration tests run against a real test datastore or a coherent in-memory substitute
- Remove reliance on `ctx.supabaseAdmin` being available in `ENV=test`
- Ensure proof tests can assert persisted rows in `profiles`, `subscriptions`, `credit_transactions`, and `webhook_events`

Without this, the billing proof suite cannot be treated as evidence.

### 2. A real payment-failure proof flow

There is no trustworthy end-to-end proof today that a failed recurring payment is caught all the way through persistence and user-visible state.

Needed test:

- Create active subscriber
- Deliver `invoice.payment_failed`
- Assert persisted `profiles.subscription_status = past_due`
- Assert user-facing billing/dashboard state reflects `past_due`
- Deliver recovery payment (`invoice.payment_succeeded` or subscription update)
- Assert state recovers correctly

This is the single most important missing proof relative to your request.

### 3. A failed-webhook-to-recovery proof

Needed test:

- Force a webhook handler failure
- Assert `webhook_events.status = failed`
- Run `/api/cron/recover-webhooks`
- Assert the event is retried and final subscription/credit state is correct

Right now recovery is unit-tested, but not proven as part of the full persisted billing flow.

### 4. CI billing gate

Needed:

- Add a dedicated CI job that runs billing-critical suites
- At minimum:
  - billing unit webhook tests
  - checkout/portal API tests
  - runnable stateful proof tests

Right now billing regressions can merge without any billing tests running in GitHub Actions.

## P1: High-Value Missing Coverage

### 5. True checkout-to-webhook-to-success-page flow

Current browser proof tests do not verify a real checkout session creation plus backend state transition.

Needed test:

- Use real `/api/checkout`
- Complete the app-side success path without `page.route('/api/checkout', ...)`
- Deliver matching Stripe webhook sequence
- Assert success page, billing page, and persisted state all agree

### 6. Missing or late webhook delivery scenarios

Needed proof cases:

- `checkout.session.completed` missing, but subscription + invoice recover correctly
- `invoice.payment_succeeded` missing, but checkout + subscription do not leave a bad state
- `customer.subscription.created` delayed relative to invoice
- event delivery order permutations still converge to one final state

There are specs intended for this, but they need a working persistence harness before they count.

### 7. Customer lookup race / missing identity fallback

This is especially important because of the bug report in `docs/bugs/webhook-subscription-activation-failure.md`.

Needed proof cases:

- `checkout.session.completed` with `metadata.user_id`
- fallback via `client_reference_id`
- fallback via `stripe_customer_id`
- missing all identity sources returns retryable failure and is later recoverable

### 8. Portal-driven subscription changes

Needed tests:

- plan upgrade via `/api/subscription/change` plus subsequent webhook
- scheduled downgrade completion via `subscription_schedule.completed`
- cancellation via `/api/subscriptions/cancel` plus webhook propagation
- cancel scheduled downgrade via `/api/subscription/cancel-scheduled`

These flows matter because many real subscription state transitions originate outside initial checkout.

### 9. Refund and dispute full-flow proofs

Unit coverage exists, but persisted end-to-end proofs are still needed.

Needed tests:

- `charge.refunded` claws back correct pool and leaves auditable transactions
- `invoice.payment_refunded` claws back subscription credits
- `charge.dispute.created` flags account and holds/claws back credits
- `charge.dispute.updated` with `won` restores account state
- `charge.dispute.closed` finalizes bookkeeping

## P2: Guardrails That Should Also Be Added

### 10. Route drift detection for billing tests

There are still tests pointing at removed `/api/billing/*` routes.

Needed:

- a small contract test that validates billing tests only reference current routes
- or a cleanup pass deleting/replacing obsolete suites

### 11. "No false E2E" labeling guardrail

Needed:

- rename mock-driven browser proof specs so they are clearly marked as UI-state tests, not payment E2E
- alternatively add a lint/check that prevents mock-driven tests from being the only "proof" for billing

### 12. Billing smoke matrix

Needed smoke coverage for deploy confidence:

- checkout endpoint healthy
- webhook endpoint reachable and signature path valid
- portal endpoint healthy
- recovery cron auth and basic execution path valid

## Specific Tests I Would Add Next

If the goal is to reduce risk fastest, create these in this order:

1. `tests/integration/payment-failure-recovery-proof.integration.spec.ts`
   Covers `invoice.payment_failed` -> `past_due` -> recovery success

2. `tests/integration/webhook-failure-to-cron-recovery-proof.integration.spec.ts`
   Covers failed webhook persistence and cron retry success

3. `tests/integration/subscription-activation-race-proof.integration.spec.ts`
   Covers missing `metadata.user_id`, `client_reference_id` fallback, and `stripe_customer_id` fallback

4. `tests/integration/refund-dispute-proof.integration.spec.ts`
   Covers refund/dispute webhook flows against persisted credit pools

5. `tests/e2e/billing-past-due-ui.e2e.spec.ts`
   Covers what the user sees when payment fails and after recovery

6. `tests/e2e/checkout-to-success-real-backend.e2e.spec.ts`
   Uses the real app-side checkout route and backend state transitions, not mocked Supabase state

## Tests / Suites That Need Rewrite or Cleanup

- `tests/integration/billing-system.integration.spec.ts`
  Uses stale `/api/billing/*` routes and should be rewritten or removed.

- `tests/e2e/subscription-signup-proof.e2e.spec.ts`
  Keep if useful for UI checks, but it should not be counted as payment E2E coverage.

- `tests/e2e/subscription-upgrade-proof.e2e.spec.ts`
  Same issue: useful UI regression coverage, not payment proof.

- The proof integration suites under `tests/integration/*-proof.integration.spec.ts`
  Keep the scenarios, but repair the datastore/test harness first so they are executable evidence.

## Evidence Collected During Audit

### Browser proof result

Command:

```bash
yarn playwright test --project=chromium tests/e2e/subscription-signup-proof.e2e.spec.ts --grep "Success page shows correct plan after signup"
```

Result:

- Passed
- Confirms only mocked post-purchase UI state, not real payment plumbing

### Backend proof result

Command:

```bash
yarn playwright test --project=integration tests/integration/subscription-lifecycle-proof.integration.spec.ts --grep "Invoice payment failed sets past_due"
```

Result:

- Failed before billing assertion completed
- Failure: `TypeError: Cannot read properties of null (reading 'from')`
- Cause: proof test uses `ctx.supabaseAdmin`, while `tests/helpers/test-data-manager.ts` returns `null` for the Supabase client in test mode

## Bottom Line

What is left to create is not just "more tests". The missing work is:

- a trustworthy persisted billing proof harness
- a real proof for payment failure and recovery
- a real proof for failed webhook -> cron recovery
- true end-to-end coverage for portal-driven subscription state changes
- persisted refund/dispute proofs
- CI enforcement so billing regressions cannot merge silently

Until those exist, the repo has **good component-level billing coverage**, but it does **not** yet have the kind of end-to-end protection that would let us say payment failures are fully caught.
