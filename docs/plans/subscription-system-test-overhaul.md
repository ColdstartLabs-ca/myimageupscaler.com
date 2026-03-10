# Subscription System Test Overhaul

## Goal

Replace shallow billing tests with a subscription proof suite that demonstrates, with stateful assertions, that the subscription system works for real user journeys.

This plan exists because the current suite mostly proves:

- handlers return `200`
- mocked helpers are called
- isolated math and routing logic looks correct

It does **not** currently prove:

- `Free -> Hobby` signup ends with the correct tier and credits
- `Pro -> Business` upgrade is reflected in both DB state and client-visible state
- webhook races do not leave a user stuck with free credits or stale plan data

## What Must Be Proven

Every critical subscription journey must end with all of these invariants true:

1. `profiles.subscription_status` is correct
2. `profiles.subscription_tier` is correct
3. `subscriptions.price_id` is correct
4. `subscription_credits_balance` and `purchased_credits_balance` are correct
5. `credit_transactions` contains the expected reference IDs and amounts
6. the dashboard and billing UI show the same final state the DB shows
7. duplicate or reordered webhooks do not change the final state incorrectly

## Why Current Tests Miss Bugs

### 1. Webhook "integration" tests are not end-state tests

Current files like [billing-workflow.api.spec.ts](/home/joao/projects/myimageupscaler.com/tests/integration/billing-workflow.api.spec.ts) explicitly run in mocked/test-mode conditions and mainly assert `200` / `received: true`.

That allows all of these real bugs to pass:

- signup stays at 10 credits
- upgrade stays on old tier in the UI
- webhook race skips real credit allocation

### 2. E2E tests bypass Stripe behavior

Current browser billing tests like [billing.e2e.spec.ts](/home/joao/projects/myimageupscaler.com/tests/e2e/billing.e2e.spec.ts) mock checkout and focus on UI interaction quality, not real subscription state convergence.

### 3. Idempotency tests encode unsafe behavior

Current idempotency coverage accepts `processing` duplicates as success. That is not enough. The suite needs to prove that "duplicate while processing" cannot leave the system in a missing-credits or stale-tier state.

### 4. Subscription-change tests are mostly logic tests

Files like [subscription-change-fixes.unit.spec.ts](/home/joao/projects/myimageupscaler.com/tests/unit/api/subscription-change-fixes.unit.spec.ts) verify small rules, not real workflow outcomes.

## New Test Architecture

### Layer 1: Pure Unit Tests

Keep deterministic tests for:

- tier math
- downgrade detection
- rollover and expiration calculation
- price-resolution fallback behavior
- idempotency state transition rules

These should be narrow and fast.

### Layer 2: Stateful Webhook Integration Tests

Add a new suite that uses:

- a real test database schema
- real webhook route execution
- realistic Stripe event fixtures
- no mocked "success-by-default" DB writes

These tests must assert final persisted state, not just HTTP response.

### Layer 3: Browser Journey Tests

Add browser tests for:

- post-signup success page
- post-upgrade confirmation page
- dashboard/billing refresh behavior

These tests must assert what the user actually sees after the server has changed state.

## Required Scenario Matrix

### A. New Subscription Signup

1. `Free -> Hobby`
   Expected:
   - `subscription_tier = hobby`
   - `subscription_status = active`
   - total credits > 10
   - one initial subscription credit allocation only

2. `Free -> Pro`
   Expected:
   - same invariants with Pro values

3. `Free -> Business`
   Expected:
   - same invariants with Business values

### B. Initial Webhook Race Cases

For a new signup, run all of these orderings:

1. `checkout.session.completed -> customer.subscription.created -> invoice.payment_succeeded`
2. `customer.subscription.created -> checkout.session.completed -> invoice.payment_succeeded`
3. `invoice.payment_succeeded -> checkout.session.completed -> customer.subscription.created`
4. same as above with one duplicate delivery per event

Expected:

- final tier is correct
- credits allocated exactly once
- no path leaves user at free credits

### C. Upgrade Flows

1. `Hobby -> Pro`
2. `Pro -> Business`
3. `Starter -> Hobby`
4. `Starter -> Business`

Expected:

- `profiles.subscription_tier` updates immediately
- `subscriptions.price_id` updates correctly
- upgrade credits are correct
- dashboard reflects new tier without manual refresh

### D. Downgrade Flows

1. `Business -> Pro`
2. `Pro -> Hobby`
3. `Hobby -> Starter`

Expected:

- schedule created when downgrade is deferred
- current tier remains active until period end
- scheduled change fields are correct
- no immediate credit clawback unless explicitly intended

### E. Renewal Flows

1. renewal with rollover below cap
2. renewal at cap
3. renewal after upgrade
4. renewal after downgrade effective date

Expected:

- new credits allocated exactly once
- rollover/expiration behavior is correct

### F. Failure and Recovery

1. checkout webhook skipped, subscription webhook must recover
2. invoice webhook skipped, checkout/subscription path must recover
3. event inserted as `processing`, worker crashes before completion
4. recovery cron reprocesses failed events safely

Expected:

- no permanent "active plan, free credits" state
- no permanent "processing forever" state for revenue-critical events

### G. Refund / Dispute / Cancellation

Expected:

- subscription state changes correctly
- credit clawback rules are correct
- purchased credits remain distinct from subscription credits

## Test Design Rules

### Rule 1: Assert End State

Every workflow test must query and assert:

- `profiles`
- `subscriptions`
- `credit_transactions`
- any user-facing API or UI state affected

### Rule 2: No "200 Means Success"

A `200` response is not a sufficient assertion for billing.

### Rule 3: Use Real Fixtures

Store realistic Stripe fixtures for:

- subscription created
- subscription updated
- checkout session completed
- invoice paid
- invoice payment succeeded

Include variants with:

- generated `price_data` price IDs
- missing period fields
- duplicated deliveries
- reordered events

### Rule 4: Simulate Concurrency

Add tests that intentionally fire the same event twice or fire related events in parallel.

The assertion is the final state, not the intermediate logs.

### Rule 5: Prove Client Convergence

After server-side change:

- success page must refresh user store
- confirmed upgrade page must refresh user store
- dashboard must not remain on stale cached tier

## Concrete New Test Files

### Stateful Integration

- `tests/integration/subscription-signup-proof.integration.spec.ts`
- `tests/integration/subscription-upgrade-proof.integration.spec.ts`
- `tests/integration/subscription-downgrade-proof.integration.spec.ts`
- `tests/integration/subscription-renewal-proof.integration.spec.ts`
- `tests/integration/webhook-ordering-proof.integration.spec.ts`
- `tests/integration/webhook-recovery-proof.integration.spec.ts`

### Browser Proof Tests

- `tests/e2e/subscription-signup-proof.e2e.spec.ts`
- `tests/e2e/subscription-upgrade-proof.e2e.spec.ts`

### Strengthened Unit Tests

- `tests/unit/api/webhook-idempotency-state-machine.unit.spec.ts`
- `tests/unit/api/subscription-price-resolution-fallbacks.unit.spec.ts`

## Required Assertions Per Proof Test

Each proof test should have a helper like:

`assertSubscriptionState(userId, { tier, status, subscriptionCredits, purchasedCredits, latestPriceId })`

and:

`assertSingleCreditAllocation(referenceId, expectedAmount)`

and:

`assertVisiblePlan(page, 'Business')`

and:

`assertVisibleCredits(page, 210)` or the exact expected balance for that scenario.

## Exit Criteria

The overhaul is complete only when:

1. every critical subscription scenario above exists as a stateful test
2. no subscription test passes based only on HTTP `200`
3. webhook race tests prove correct final state under duplicate and reordered events
4. browser tests prove the user sees the updated tier and credits after signup/upgrade
5. a new billing bug must break at least one proof test

## Recommended Execution Split

### Fast CI

- unit tests
- narrow route tests
- selected stateful integration smoke tests

### Full Billing CI

- full proof integration matrix
- browser proof tests
- webhook ordering and duplicate-delivery suite

### Pre-Release Gate

- complete signup, upgrade, downgrade, renewal proof suite

## First Implementation Slice

Build these first:

1. `Free -> Hobby` signup proof
2. `Pro -> Business` upgrade proof
3. duplicate/reordered initial webhook proof
4. client store refresh proof after upgrade/signup

If these four existed already, the recent bugs would have been caught.
