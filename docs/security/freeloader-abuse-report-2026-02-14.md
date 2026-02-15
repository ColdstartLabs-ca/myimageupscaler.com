# Freeloader Abuse Audit Report
Date: 2026-02-14  
Project: `myimageupscaler.com`  
Focus: free-credit farming, signup abuse, identity evasion, and adjacent credit-abuse paths.

## Scope
- Auth/signup flows
- Free-credit issuance logic
- Guest abuse controls
- Rate limiting architecture
- Credit/admin privilege boundaries

## Executive Summary
The current stack is vulnerable to automated free-credit farming via account churn.  
The main issue is architectural: signup is client-direct to Supabase and new-user credits are granted unconditionally at DB trigger time.  

Additionally, I found a critical adjacent issue: profile RLS appears to let users update their own `role`, which can lead to self-admin escalation and then unrestricted credit manipulation via admin endpoints.

## Findings

### 1) Unconditional free credits on account creation (High)
Impact: High  
Likelihood: High

Evidence:
- Client directly calls Supabase signup: `client/store/auth/authOperations.ts:61`, `client/store/userStore.ts:250`.
- New-user trigger grants credits immediately: `supabase/migrations/20260120_fix_signup_trigger.sql:20`.
- No `email_confirmed`/`email_verified` checks found in app/server/migrations for credit grant.

Why this matters:
- Any actor can automate account creation and receive 10 credits per account.
- Email verification does not gate credit creation in DB logic.

---

### 2) No signup anti-automation gate (captcha/risk/velocity) (High)
Impact: High  
Likelihood: High

Evidence:
- Active API routes do not include a server-side signup gate; signup happens client -> Supabase.
- No Turnstile/hCaptcha/reCAPTCHA checks found.
- Public route model shows guest controls only for `/api/upscale/guest`: `shared/config/security.ts:118`.

Why this matters:
- Bots can mass-register with disposable/plus-alias emails.
- No server point exists to apply IP reputation, ASN blocking, email-domain policy, or challenge escalation.

---

### 3) Guest identity is weak against determined evasion (Medium)
Impact: Medium  
Likelihood: High

Evidence:
- `visitorId` is client-supplied and only schema-validated as string: `app/api/upscale/guest/route.ts:18`.
- Fingerprint fallback is random timestamp ID: `client/utils/guest-fingerprint.ts:40`.
- Controls depend on IP + fingerprint set membership: `app/api/upscale/guest/route.ts:58`, `server/services/guest-rate-limiter.ts`.

Why this matters:
- Local checks are explicitly UX-only; server checks rely on IP and caller-provided identifier.
- VPN/proxy/IP rotation can bypass per-IP limits.

---

### 4) Rate limiting is in-memory for key protected routes (Medium)
Impact: Medium  
Likelihood: Medium-High

Evidence:
- In-memory map limiter with note about multi-instance limitation: `server/rateLimit.ts:2`, `server/rateLimit.ts:6`, `server/rateLimit.ts:26`.
- Authenticated upscale limiting uses this limiter keyed by `userId`: `app/api/upscale/route.ts:177`.

Why this matters:
- Limits reset on process restart and do not coordinate across instances/edges.
- Attackers can distribute load to reduce limiter effectiveness.

---

### 5) Critical: probable self-admin privilege escalation via profile UPDATE policy (Critical)
Impact: Critical  
Likelihood: Medium (needs direct Supabase API access with user JWT, which app already provides)

Evidence:
- Profiles UPDATE policy allows any authenticated user to update own row: `supabase/migrations/20250203_fix_admin_policy_recursion.sql:36`.
- Policy does not restrict mutable columns (including `role`).
- `is_admin(auth.uid())` checks profile role directly: `supabase/migrations/20260115_security_fixes.sql:235`.
- Admin middleware trusts `profiles.role = 'admin'`: `server/middleware/requireAdmin.ts:40`.
- Admin credit endpoint can set user balances via RPC: `app/api/admin/credits/adjust/route.ts:44`.

Why this matters:
- If users can set their own `role='admin'`, they can mint/modify credits and bypass normal monetization.

Note:
- This is broader than freeloader abuse, but directly affects credit economics and should be treated as immediate priority.

---

### 6) Latent trial-abuse risk if trials are re-enabled (Low now, High later)
Impact: Low currently / High if enabled  
Likelihood: Low currently / High if enabled

Evidence:
- Trial config exists with `allowMultipleTrials: false`: `shared/config/subscription.config.ts:37`.
- Checkout anti-duplication checks are per user subscription only: `app/api/checkout/route.ts:91`, `app/api/checkout/route.ts:286`.
- Trial days are applied from config only: `app/api/checkout/route.ts:413`.

Why this matters:
- If `trial.enabled` is turned on later, cross-account trial farming is not blocked.

## Effort × Impact Matrix

| # | Mitigation | Effort | Impact | Priority |
|---|---|---|---|---|
| 1 | Move signup behind server endpoint (`/api/auth/register`) and require challenge (Turnstile/hCaptcha) + risk scoring | M | Very High | P0 |
| 2 | Grant free credits only after verified email (`auth.users.email_confirmed_at IS NOT NULL`) or first paid-intent signal | M | Very High | P0 |
| 3 | Add anti-abuse identity graph: hashed IP, device fingerprint hash, email domain risk, ASN, velocity windows | M-L | Very High | P0 |
| 4 | ~~Fix profile RLS to prevent role mutation by users (separate admin-only role update path)~~ | S | Critical | **DONE** |
| 5 | Add DB constraints/triggers for credit grant idempotency per abuse identity (e.g., one signup bonus per device/IP window) | M | High | P1 |
| 6 | Replace in-memory rate limits with Redis/KV/DO-backed distributed limits for auth routes | M | High | P1 |
| 7 | Harden guest endpoint: signed visitor token from server, stronger bot signals, VPN/datacenter scoring | M | Medium-High | P1 |
| 8 | Add disposable-email/domain intelligence and temporary mailbox blocking | S-M | High | P1 |
| 9 | Add anomaly monitoring + auto-action (suspend, require phone, reduce limits) | M | High | P1 |

## Recommended Immediate Actions (next 72 hours)
1. ~~Patch RLS/admin escalation path first (`profiles.role` immutability for non-admin users).~~ **DONE 2026-02-14** — Migration `20260214_fix_profile_role_immutability.sql` adds BEFORE UPDATE trigger + RLS WITH CHECK. Test: `tests/unit/security/role-immutability.unit.spec.ts`.
2. Stop unconditional signup bonus issuance; gate bonus on verified email.
3. Introduce server-side signup endpoint with Turnstile and per-IP/per-device velocity limits.
4. Add temporary emergency throttles:
   - max new signups per IP /24 / ASN per hour
   - max signup bonuses per device hash per 7 days
5. Instrument abuse telemetry dashboard (signup success rate, bonus grant rate, conversion lag, suspicious clusters).

## Validation Tests To Add
- ~~Cannot update own `profiles.role` from authenticated client token.~~ **DONE** — `tests/unit/security/role-immutability.unit.spec.ts`
- Signup without verified email does not receive bonus credits.
- Signup route rejects failed captcha / high-risk fingerprints.
- Repeated signups from same IP/device/email-domain pattern are throttled or blocked.
- Distributed rate-limit consistency across multiple instances.

