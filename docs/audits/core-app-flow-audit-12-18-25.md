# Core App Flow Audit (End-to-End)

**Project:** PixelPerfect  
**Date:** 2025-12-18  
**Auditor:** Claude Code (Claude Sonnet 4.5)  
**Rating:** ★★☆☆☆ (2/5)

This audit traces the core product flow end-to-end (auth → workspace processing → billing/webhooks → cron/sync) and flags issues by severity with concrete file/line evidence.

---

## Scope

**Included**

- Next.js App Router pages and middleware routing (`app/*`, `middleware.ts`)
- Core API routes: processing (`/api/upscale`), auth gates, billing (`/api/checkout`, `/api/portal`), webhooks (`/api/webhooks/stripe`), cron sync (`/api/cron/*`), download proxy (`/api/proxy-image`)
- Core client flows: auth + redirects, workspace processing + download, billing portal and success state (`client/*`)

**Excluded**

- Supabase DB schema/RLS policies (not validated against a live project)
- Third-party dashboard configuration (Cloudflare/Supabase/Stripe consoles)

---

## Core Flow (What Happens)

1. **Landing → Auth → Dashboard**
   - `middleware.ts` refreshes Supabase session cookies and redirects:
     - Authenticated `/` → `/dashboard`
     - Unauthenticated `/dashboard/*` → `/?login=1&next=/dashboard/...`
   - `client/store/userStore.ts` listens to Supabase auth changes, loads cached user data, and performs post-auth redirect via `client/utils/authRedirectManager.ts`.

2. **Dashboard → Upload → Process → Credits**
   - `client/components/features/workspace/Workspace.tsx` → `client/hooks/pixelperfect/useBatchQueue.ts` → `client/utils/api-client.ts:processImage()`
   - Client calls `POST /api/upscale` with base64 image + config.
   - `app/api/upscale/route.ts`:
     - Requires `X-User-Id` from middleware header
     - Applies stricter per-user upscaling limiter
     - Checks batch/hour limit (in-memory)
     - Validates payload with Zod and size limits
     - Computes credit cost, processes via provider, and updates credits via RPC

3. **Billing → Checkout → Webhooks → Credits**
   - Client starts checkout via `client/services/stripeService.ts` calling `POST /api/checkout`.
   - `app/api/checkout/route.ts` creates Stripe Checkout Session with unified metadata.
   - `app/api/webhooks/stripe/route.ts` verifies signature, performs idempotency, and routes to handlers:
     - subscription updates, invoice renewals, credit pack purchases, refunds.

4. **Cron Sync**
   - `workers/cron/index.ts` triggers `POST /api/cron/*` with `x-cron-secret`.
   - `app/api/cron/*` handlers validate `x-cron-secret` and run reconciliation against Stripe + DB.

---

## Findings (By Severity)

### Critical

#### C1) Auth bypass token accepted in non-test environments

- **Evidence:** `lib/middleware/auth.ts:97` accepts `Bearer test_auth_token_for_testing_only` unconditionally.
- **Impact:** Any attacker who knows this constant can call protected `/api/*` endpoints gated by `verifyApiAuth()` without real Supabase authentication. This undermines billing, credit protection, and any protected API surface.
- **Recommendation:** Gate _all_ test-token shortcuts behind `serverEnv.ENV === 'test'` (and/or a dedicated flag like `PLAYWRIGHT_TEST`) and remove the hardcoded fallback token.

#### C2) Stripe secret key is written to logs

- **Evidence:** `app/api/webhooks/stripe/services/webhook-verification.service.ts:36` logs `serverEnv.STRIPE_SECRET_KEY`.
- **Impact:** Credential leakage into logs (Cloudflare, Baselime, etc.) can lead to full Stripe account compromise.
- **Recommendation:** Remove the secret from logs entirely (or mask to last 4 chars at most, but best is to not log it).

#### C3) Cron jobs are blocked by middleware authentication

- **Evidence:**
  - Middleware enforces JWT for non-public `/api/*` (`middleware.ts:57`)
  - Public routes list excludes `/api/cron/*` (`shared/config/security.ts:69`)
  - Cron worker sends only `x-cron-secret` (`workers/cron/index.ts:65`)
  - Cron handlers expect `x-cron-secret` (`app/api/cron/check-expirations/route.ts:30`, `app/api/cron/reconcile/route.ts:45`, `app/api/cron/recover-webhooks/route.ts:30`)
- **Impact:** In production, cron triggers will likely receive `401` from middleware before reaching handlers, so subscription reconciliation and webhook recovery won’t run.
- **Recommendation:** Explicitly bypass JWT middleware for `/api/cron/*` and rely on `x-cron-secret` auth (or add `/api/cron/*` to public API routes while keeping secret validation).

---

### High

#### H1) Download proxy fallback likely fails (auth mismatch)

- **Evidence:**
  - Client fallback calls proxy without Authorization: `client/utils/download.ts:88`
  - Proxy route is not public and will be intercepted by middleware JWT check: `middleware.ts:57`
  - Proxy route exists at `app/api/proxy-image/route.ts`
- **Impact:** Users will see intermittent download failures when direct fetch + canvas methods fail due to CORS; the intended proxy fallback is blocked.
- **Recommendation:** Either make `/api/proxy-image` a public API route (still validate allowed domains), or include the user’s JWT in the proxy request.

#### H2) Proxy allowlist domain check is bypassable (`endsWith`)

- **Evidence:** `app/api/proxy-image/route.ts:18` uses `urlObj.hostname.endsWith(domain)`.
- **Impact:** Hostnames like `evilreplicate.com` match `replicate.com` and pass allowlist, enabling SSRF-style downloads from attacker-controlled domains.
- **Recommendation:** Use a strict boundary check: `hostname === domain || hostname.endsWith('.' + domain)`.

#### H3) CORS configuration has insecure/invalid defaults and is duplicated

- **Evidence:**
  - Global headers set `Access-Control-Allow-Credentials: true` with origin defaulting to `*` when `ALLOWED_ORIGIN` is unset: `next.config.js:79`
  - Middleware CORS sets `*` when origin is missing and still sets credentials: `lib/middleware/securityHeaders.ts:37` + `lib/middleware/securityHeaders.ts:42`
- **Impact:** Browser behavior becomes inconsistent; production can ship with permissive or broken CORS. If any cookie-based API usage emerges, this becomes dangerous.
- **Recommendation:** Centralize CORS in one layer, never combine `credentials: true` with `origin: '*'`, and default `ALLOWED_ORIGIN` to an explicit production domain.

#### H4) CSP is permissive for production (`unsafe-eval`, `unsafe-inline`)

- **Evidence:** `shared/config/security.ts:14`
- **Impact:** Weakens XSS defenses significantly. Even if no obvious XSS exists today, CSP should be a backstop.
- **Recommendation:** Remove `unsafe-eval` and minimize `unsafe-inline` in production; use nonces/hashes where needed.

#### H5) Rate limiting and batch limiting are in-memory (weak on Cloudflare multi-instance)

- **Evidence:** `server/rateLimit.ts:2`, `server/services/batch-limit.service.ts:2`
- **Impact:** Limits can be bypassed across edge locations/instances; results are inconsistent under load or global traffic.
- **Recommendation:** Move to a shared store (Durable Objects/KV/Supabase table) or accept that these are “best effort” only and apply upstream Cloudflare rate limiting.

---

### Medium

#### M1) Production build is fragile in restricted/offline environments (Google Fonts fetch)

- **Evidence:** `app/layout.tsx:3` uses `next/font/google` (Inter).
- **Impact:** CI/CD or locked-down build environments can break due to the build-time Google Fonts fetch; also adds an external dependency during build.
- **Recommendation:** Self-host fonts or vendor them locally for deterministic builds.

#### M2) Admin users API is not scalable (fetches all auth users every request)

- **Evidence:** `app/api/admin/users/route.ts:39` uses `supabaseAdmin.auth.admin.listUsers()` and then filters locally.
- **Impact:** Will become slow/expensive with many users; pagination/search won’t scale.
- **Recommendation:** Use paginated `listUsers({ page, perPage })` and apply search server-side where possible.

---

### Low

#### L1) README tech stack mismatch with actual dependency versions

- **Evidence:** `README.md:10` references Next.js 15; `package.json` uses `next: 16.0.10`.
- **Impact:** Confuses contributors and deployment expectations.
- **Recommendation:** Update README to match.

#### L2) History page is placeholder

- **Evidence:** `app/dashboard/history/page.tsx:1`
- **Impact:** Product completeness/UX, not a blocker.

---

## Validation / Checks Run

- Not run in this review (code inspection only).

---

## Recommended Fix Order

1. **Remove auth bypass token** (`lib/middleware/auth.ts`) and ensure test-only behavior is gated by environment.
2. **Remove Stripe secret logging** (`app/api/webhooks/stripe/services/webhook-verification.service.ts`).
3. **Fix cron routing** so `/api/cron/*` is reachable with `x-cron-secret` (middleware/public route config).
4. **Fix proxy-image**: make it reachable as designed + harden allowlist boundary.
5. **Harden CORS + CSP** for production defaults.
6. **Decide on distributed rate limiting strategy** for Cloudflare.
