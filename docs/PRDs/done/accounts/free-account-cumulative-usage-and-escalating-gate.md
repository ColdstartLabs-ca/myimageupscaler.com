# PRD: Free-credit exhaustion abuse prevention

**Status:** Complete

**Date:** 2026-07-17

**Scope:** Authenticated free accounts

## Decision

Keep the existing credit flow. Do not add a cooldown, dismissal-based authorization, a second cumulative-credit ledger, result replay storage, or a new client gate.

A free account receives five signup credits once. Those credits do not renew. Each accepted processing job consumes credits atomically on the server. When the balance cannot cover the job, processing is rejected. The user must then purchase credits or a subscription to continue.

This is already the requested product policy:

```text
free credits exhausted -> processing denied -> purchase required
```

There is no wait state and no suggestion that credits will return later.

## Why the original proposal was reduced

The suspected abuse signal was `image_uploaded`. That event is emitted when a file is added to the browser queue; it does not prove the API accepted, billed, or processed the image. A user can therefore produce many upload events without receiving free provider work.

The existing server controls already provide the relevant security boundaries:

- `handle_new_user` grants the initial balance only when an auth user is inserted. An authentication callback for the same account does not run the signup trigger again.
- `SUBSCRIPTION_CONFIG.freeUser.monthlyRefresh` is `false`.
- `consume_credits_v2` locks the profile row, verifies the combined balance, deducts atomically, and rejects insufficient funds before provider work.
- Failed jobs use the existing pool-aware, idempotent refund path. A refund restores only a failed job's deduction; it is not a periodic grant.
- `check_and_increment_batch_limit` enforces the hourly account limit atomically in Postgres and is keyed by `user_id`, so cookies, incognito mode, and re-authentication do not reset it.
- Cross-account signup cycling remains the responsibility of the existing anti-freeloader controls. A per-account cumulative ledger would not solve a user creating a different account.

## Requirements

1. Free signup credits remain a one-time grant of `CREDIT_COSTS.DEFAULT_FREE_CREDITS`.
2. Free credits never renew on a timer, prompt dismissal, login, or authentication callback.
3. A job that costs more than the user's available balance is rejected before provider work.
4. Active subscribers and users with purchased credits continue through the existing paid flow without a new policy gate.
5. Existing successful-job deduction and failed-job refund behavior remains unchanged.
6. Existing hourly account limits remain unchanged.
7. Prompt dismissals remain analytics/UX only and never authorize processing.

## Explicit non-goals

- No cooldown or countdown.
- No server-backed dismissal counter.
- No new free-usage status endpoint.
- No duplicate client gate or blocking modal.
- No second free-credit balance or grant ledger.
- No private result-replay bucket.
- No historical backfill.
- No payment-history eligibility resolver.
- No changes to prices, plan allocations, model access, refunds, or paid entitlement logic.
- No attempt to infer billable usage from client upload analytics.

## Regression proof

The change is documentation plus a focused configuration regression test. Existing tests remain the implementation proof:

| Boundary                                         | Evidence                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| One-time, non-renewing free allocation           | `tests/unit/config/subscription-config.unit.spec.ts`                              |
| Atomic insufficient-credit rejection             | `tests/integration/credit-operations.integration.spec.ts`                         |
| Upscale API rejects insufficient credits         | `tests/integration/upscaler-workflow.integration.spec.ts`                         |
| Server-only atomic hourly limit                  | `tests/unit/server/batch-limit.service.unit.spec.ts` and security hardening tests |
| Successful processing consumes credits           | image-generation and Replicate service unit tests                                 |
| Failed processing refunds once to original pools | credit-manager and refund integration tests                                       |

## Acceptance criteria

- [x] No cooldown exists in the processing authorization path.
- [x] No UI copy says or implies free credits will be restored after waiting.
- [x] Re-authenticating as the same account does not grant credits.
- [x] Free-credit exhaustion is enforced by the existing server balance check.
- [x] Paid and purchased-credit flows are untouched.
- [x] No production database migration or backfill is required.
- [x] Focused regression tests pass.
- [x] `yarn verify` passes.

## Follow-up only if evidence proves a real bypass

If server-side credit transactions show successful free-funded processing after the same account reached zero, first identify the concrete balance mutation or refund path that restored credits. Fix that path directly and add a reproducing test. Do not introduce a parallel entitlement system based on client event volume.
