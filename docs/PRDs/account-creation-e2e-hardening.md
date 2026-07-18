# Account Creation E2E Hardening — Test Spec

**Date:** 2026-07-18
**Purpose:** e2e coverage for the signup → setup → free-credit-grant flow, written after the zero-credit SEV-1. Cases 10 and 11 are the two that would have caught the incident; case 8 locks the anti-abuse ladder behavior.

**Context for the implementer:**

- Playwright e2e already exists (`tests/e2e/auth.e2e.spec.ts`, global setup/teardown with test-user cleanup).
- In non-prod, `x-test-country` controls region classification and `CF-Connecting-IP` / `x-forwarded-for` controls anti-abuse identity — that's how you drive the gate deterministically. Note: `ENV=development` bypasses the identity gate entirely (per-user synthetic identity); these tests must run under `ENV=test`, where the real request identity is used.
- Every test asserts **both** UI state and DB state via service role: `profiles`, `free_credit_grants`, `credit_transactions`.
- Free-credit policy under test: **5 standard / 3 restricted / 0 paywalled**, one decision per user, ever.

## Happy paths

1. **Standard signup (US)** — fresh email + fresh spoofed IP → lands on dashboard showing 5 credits. DB: `region_tier='standard'`, one `free_credit_grants` row with `granted_credits=5`, exactly one `credit_transactions` row with `reference_id='free_grant:<uid>'` amount +5, `subscription_credits_balance=5`.
2. **Restricted country** — same flow with a restricted-tier country → 3 credits; same single-decision/single-transaction assertions.
3. **Paywalled country** (e.g. IN) → dashboard shows 0 + purchase CTA. DB: decision row `granted_credits=0`, **no** credit transaction. Then assert checkout still works: creating a checkout session for this user succeeds (anti-abuse must never block purchase).
4. **OAuth callback parity** — the OAuth completion path produces the identical outcome as email-confirm (5 credits, one decision) — and if both callback and confirm fire, still exactly one grant.

## Idempotency / concurrency

5. **Setup retry** — `POST /api/users/setup` a second time with the same session → `alreadySetup`, balance still 5, transaction count still 1.
6. **Concurrent setup** — fire 2–3 parallel setup requests for a fresh user → exactly one grant/transaction (advisory-lock proof).
7. **Auth-page replay** — reload the callback/confirm page after success → no duplicate grant, no duplicate `account_created` analytics event.

## Anti-abuse gate (ENV=test only)

8. **Identity ladder** — three accounts from the same spoofed IP: first gets 5, second gets 3, third gets 0. Each has its own recorded decision; the first account's balance is never retroactively reduced.
9. **Zero-decision user can still buy** — the third account from case 8 opens checkout and the session is created (a terminal zero decision is not a purchase restriction).

## Failure / provisional-state paths (the incident scenarios)

10. **Setup returns 500** — force it (break the RPC mock, or use a country the classifier rejects) → the auth completion page shows the retry/error UI and does **not** redirect to the dashboard as success. No decision row is written. A later successful retry yields the full 5 (the grant is not lost).
11. **Missing country → 202 pending** — omit `x-test-country` in test env → setup returns `202 {setupStatus:'pending'}`; the client retries then shows the error state; no decision is recorded (pending must not burn the grant); a subsequent sign-in with a country present grants 5.
12. **Provisional-zero processing guard** — a user with no grant decision calls `POST /api/upscale` and `POST /api/bg-removal/deduct` → both return `ACCOUNT_SETUP_PENDING` (not `FREE_LIMIT_EXCEEDED`), zero credit mutation, no paywall analytics event.
13. **Terminal-zero processing gate** — the paywalled user from case 3 calls upscale → gets the purchase gate (not pending), still no deduction.
14. **Dashboard never shows settled 0 mid-setup** — between session creation and the grant decision, the UI shows a loading state, never "0 credits" as if settled.

## Contract / security

15. **Unauthenticated setup** → 401; a client-supplied `X-User-Id` header is ignored (middleware overwrites it after JWT verification).
16. **No PII in responses/analytics** — the setup response and tracked events contain no IP, user agent, or identity hash.
17. **Paid/trialing profile** → setup completes with no welcome grant and no transaction.

## Infra requirements

- Unique throwaway emails per run; extend the existing global teardown to also delete `free_credit_grants` + `credit_transactions` rows for test users — otherwise the 90-day identity window makes case 8 flaky across runs.
- One spoofed-IP allocator per test file so identities never collide between cases.
- A DB assertion helper (service role) so every case ends with "expected rows in the three tables," not just UI checks — the incident was invisible at the UI layer.
