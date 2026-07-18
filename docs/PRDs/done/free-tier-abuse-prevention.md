# PRD: Free-Tier Abuse Prevention

**Status:** Complete
**Date:** 2026-07-17
**Source:** Amplitude freeloader audit (last 30 days)

## Problem

A small set of users is systematically gaming the free tier. The free limit appears to reset per session/device, so power users re-authenticate daily, upload, download, dismiss the upgrade prompt, and leave — for months — without ever converting.

Data (last 30 days):

- 85% of uploaders are casual (1–2 uploads) — not a problem, don't add friction for them.
- 5 users did 51–100+ uploads (2 of them 100+).
- Top abuser pattern: daily return, login via `/auth/callback` each session, drag & drop uploads, dismisses `upgrade_prompt` within ~22s, has never clicked upgrade across Feb–Jun.
- 1 user has dismissed the upgrade prompt 11–20 times; 41 users dismissed 5+ times.
- Batch limit modal hits grew +58% in 4 weeks (69 → 109/week); its upgrade conversion is healthy (~9–13%).

## Abuse Patterns Observed

| #   | Pattern                                  | Signal                                                                       |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Limit-reset via re-login                 | Same account, fresh `/auth/callback` every session, limits reset per session |
| 2   | Heavy sustained free usage               | 51–100+ uploads/month on free tier                                           |
| 3   | Serial paywall dismissal                 | `upgrade_prompt_dismissed` 5+ times (tracked via existing `dismissCount`)    |
| 4   | (Likely) cookie-clear / incognito resets | Consistent with per-device counters resetting                                |

## Current Free Tier (from code)

Free = **5 credits lifetime per account** (`shared/config/credits.config.ts:30` `DEFAULT_FREE_CREDITS: 5`; `shared/config/subscription.config.ts:288-291` — `initialCredits` one-time on signup, `maxBalance: 5`, no refresh). Regional anti-freeloader tiers already exist (`lib/anti-freeloader/region-classifier.ts`: 5 default / 3 restricted / 0 paywalled).

**Key implication:** if the lifetime cap were correctly enforced, 51–100+ uploads per account would be impossible. So the real problem is a **bypass**, not a missing limit. Candidate holes (to be confirmed in P0):

1. Amplitude "upload" events fire client-side before credit gating — abusers upload but never successfully process (numbers inflated, low real cost).
2. Credit balance reset on re-login — `getAuthenticatedUser` → `UserRepository.getOrCreate` creates a profile with 5 default credits when none is found (`server/middleware/getAuthenticatedUser.ts:60`); if profiles are ever missed/recreated, each login is a refill. Matches the observed daily `/auth/callback` pattern.
3. A processing path (some tool/endpoint) that skips credit deduction.

## Goal

No free account can consume more than its lifetime credit allowance, regardless of sessions, devices, or re-logins — with **zero added friction for the 85% casual users**.

Success criteria:

- Root cause of the 51–100+ upload accounts identified and closed.
- Every processing request deducts credits server-side per `userId`; at 0 credits the request is rejected.
- Casual users (1–5 uploads) see no new prompts, modals, or friction.
- Upgrade conversion from limit gates ≥ current batch modal baseline (~9–13%).

## Solution — Minimum Required Changes

### P0: Diagnose and close the bypass

The core fix. Everything else is secondary.

1. **Diagnose**: pull the 5 abuser accounts from Supabase — check `credits_balance` history / transactions vs. their Amplitude upload counts. Determine which hole (above) they're exploiting. Check whether "uploads" actually resulted in completed upscales.
2. **Close it**:
   - If events fire before gating → fix analytics event placement (fire on successful processing, not upload) and confirm no real abuse exists; PRD may end here.
   - If re-login refills credits → make `getOrCreate` idempotent per `userId` (never re-grant initial credits to an existing user; grant initial credits exactly once, recorded in a transaction log).
   - If a path skips deduction → route it through the existing atomic `deduct_credits` function.
3. **Enforce**: every processing endpoint rejects with a typed error (e.g. `FREE_LIMIT_EXCEEDED`) at 0 balance; client shows the existing upgrade path (non-dismissible for the session — upgrade or leave).

### P1: Per-person limits (IP/device), not just per-account

Closes the obvious next move: creating a new account to get 5 fresh credits.

- On signup / first credit grant, record an **identity hash** alongside the account: hashed IP (available for free from Cloudflare's `CF-Connecting-IP` header) + a lightweight device signal (user-agent hash; no third-party fingerprinting SDK).
- **Rule**: if the identity hash already received free credits on another account within the last 90 days, the new account gets `RESTRICTED_FREE_CREDITS` (3) on second account, `PAYWALLED_FREE_CREDITS` (0) from the third on — reusing the existing tier constants and anti-freeloader plumbing (`lib/anti-freeloader/`, `server/services/anti-freeloader.service.ts`).
- Store hashes, never raw IPs (privacy). Hash with a server-side salt.
- Known trade-off: shared IPs (offices, universities, CGNAT in some regions) can collide. That's why collision → _reduced_ credits, not a ban. Monitor false-positive volume via a `free_credits_reduced` event.

### P2: Escalating friction for serial dismissers

- Use the already-tracked `dismissCount` on `upgrade_prompt_dismissed`.
- After **3+ dismissals**: prompt requires an explicit "Continue with free plan" click after a short (~5s) delay instead of instant dismiss. No cooldowns, no blocking — just enough friction that the paywall registers.
- No change for users with < 3 dismissals.

### Explicitly out of scope (YAGNI)

- Device fingerprinting — deliberate decision, not an oversight:
  - Observed abusers reuse the _same account_; fingerprinting solves multi-accounting, which we have no evidence of yet.
  - Cost/benefit fails: paid SDKs (~$200+/mo) cost more than the free credits being stolen; free fingerprinting ≈ what IP + UA hashing already gives us.
  - GDPR surface (fingerprints are personal data) and false positives on common hardware/browser combos.
  - **Escalation ladder** (only if P0+P1 ship and multi-account abuse appears — distinct IPs, identical behavior): first a client-side hash of canvas/hardware signals (hashed in browser — free, no Workers CPU cost, no vendor), then a paid SDK only if that measurably fails.
- CAPTCHA, email verification tiers.
- Anonymous-user tracking changes.
- Any change to the batch limit modal — it converts fine; leave it alone.

## Implementation Sketch

1. **P0 diagnosis**: SQL against the 5 abuser accounts (credit transactions vs. Amplitude counts) → identify the bypass → targeted fix + regression test.
2. **DB (P1)**: migration adding a `free_credit_grants` table: `identity_hash`, `user_id`, `granted_credits`, `created_at`. Checked at signup/first-grant.
3. **API**: enforce 0-balance rejection in all processing routes; return typed error (`FREE_LIMIT_EXCEEDED`).
4. **Client**: handle `FREE_LIMIT_EXCEEDED` → show upgrade gate; add dismissal-count friction to the upgrade prompt (P2).
5. **Analytics**: fire `free_limit_gate_shown` / `free_limit_gate_upgrade_clicked` / `free_credits_reduced` events (Amplitude; no tracking in dev/test per project policy).
6. **Tests**: unit tests for grant idempotency (re-login never re-grants), 0-balance rejection, identity-hash duplicate detection, paid users unaffected. Cloudflare Workers 10ms CPU limit: hashing must be trivial (single SHA-256, no heavy fingerprint computation).

## Risks

- **Shared-IP false positives** (offices, CGNAT): mitigated by reducing rather than zeroing credits on first collision; monitor `free_credits_reduced` volume for 2 weeks.
- **Over-blocking legitimate free users**: allowance itself is unchanged (5 lifetime); only bypasses and duplicate grants are closed.
- **VPN rotation defeats IP hashing**: accepted — raises effort per 5 credits above the value extracted; revisit with stronger signals only if it actually happens.

## Measurement (2–4 weeks post-launch)

- Free accounts exceeding lifetime credit allowance → target: 0.
- Duplicate-identity signups receiving reduced credits (volume + false-positive reports).
- Upgrade conversion from the new hard gate.
- Casual-user upload funnel unchanged (no drop in 1–5 upload cohort completion).
