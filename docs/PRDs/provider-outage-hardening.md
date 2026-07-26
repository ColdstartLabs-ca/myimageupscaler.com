# PRD: Provider Outage Hardening

> **Complexity: 7 -> MEDIUM/HIGH mode**
>
> Origin: production incident 2026-07-26, 13:40–19:46 UTC (~6h06m, 100% processing failure).

## 1. Context

**Problem:** On 2026-07-26 Replicate returned `402 Insufficient credit` for every prediction request between 13:40 and 19:46 UTC. Replicate support later confirmed this was **their** bug — a rate-limit configuration mismatch that produced false 402s while the account still held ~$20 credit.

The upstream fault lasted 6 hours. Our handling of it turned a provider blip into revenue-damaging customer harm:

- Replicate's raw 402 body was shown verbatim to end customers, telling them to **buy credits**.
- 4 customers purchased credit packs during the outage window that they could not use.
- Failed attempts still consumed each user's hourly processing quota, so customers stayed locked out _after_ the provider recovered.
- A customer hitting the batch limit gets a UI permanently frozen at "Enhancing image… 90%".
- Production logging has been silently dead, so nothing alerted and diagnosis took hours of manual DB/API forensics.

**Timeline (UTC, 2026-07-26):**

| Time        | Event                                                                               |
| ----------- | ----------------------------------------------------------------------------------- |
| 13:39:55    | Last successful Replicate prediction before the outage                              |
| 13:40–19:46 | 100% failure. 118+ attempts, all failed and auto-refunded, 37 affected users in 24h |
| 16:55       | `babs.moore@icloud.com` buys 50 credits (false credit wall)                         |
| 19:05       | `jestor_85@hotmail.com` buys 50 credits (false credit wall)                         |
| 19:22       | `puckered.wallet@gmail.com` buys **200** credits (false credit wall)                |
| 19:30       | `luismanuelvivanco@gmail.com` buys a 2nd 50-credit pack (false credit wall)         |
| ~19:45      | Replicate applies their fix                                                         |
| 19:46:41    | First successful prediction; real customers processing normally again               |
| 19:52:59    | Confirmed recovered (`flux-2-pro`, `real-esrgan` all succeeding)                    |

**Files analyzed:**

- `server/services/replicate/utils/error-mapper.ts` — `mapError()` handles 403 but has **no 402 branch**
- `app/api/upscale/route.ts:1149` — returns raw provider `error.message` to the client
- `app/api/upscale/route.ts:431` — `checkAndIncrement` runs before processing, never rolled back
- `server/services/batch-limit.service.ts:55` — no decrement/release method exists
- `client/hooks/useBatchQueue.ts:318-340` — `BatchLimitError` branch never resets item status
- `server/monitoring/logger.ts:40-50` — passes a plain object as `ctx` to `BaselimeLogger`
- `shared/config/model-costs.config.ts:36` — `NANO_BANANA_PRO_COST: 0.13` (stale)

**Evidence gathered:**

- Cloudflare Workers live tail (`wrangler tail myimageupscaler`, 117 records): `POST /api/upscale -> 200` confirming recovery, plus `2x TypeError: this.ctx.waitUntil is not a function` — one per upscale POST.
- Replicate API (prod token, account `jonit-dev`): prediction gap 13:39:55 → 19:46:41.
- Supabase `credit_transactions`: clean 100%-refund break, first clean success at 19:46:41.
- Supabase `batch_usage`: `jestor_85` at **28/28 counted from failed attempts**; `luismanuelvivanco` 9 (8 failed).

**What was NOT the cause** (ruled out during investigation): application/CDN caching, actual Replicate balance depletion, customer abuse, and the morning deploy. Nano Banana Pro usage was legitimate paid traffic — one customer, 38 successful runs, $5.70 provider cost against $29.96 revenue (~81% gross margin).

---

## 2. Bugs to fix

### BUG-1 (P0) — Provider billing errors are surfaced to customers as a purchase prompt

`ReplicateErrorMapper.mapError()` has branches for 403, rate limits, NSFW, timeouts, NoneType and GPU-memory, but **nothing for 402**. A 402 therefore falls through to the generic bucket, preserving Replicate's raw message. `app/api/upscale/route.ts:1149` then passes that message straight through:

```ts
const { body, status } = createErrorResponse(errorCode, error.message, statusCode, {
  replicateCode: error.code,
});
```

Customers literally saw:

> Upscale failed: Request to https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions failed with status 402 Payment Required: {"title":"Insufficient credit","detail":"You have insufficient credit to run this model. Go to https://replicate.com/account/billing#billing to purchase credit…"}

This leaks vendor identity and internal infrastructure, and — because the text is an instruction to purchase credit — it drove at least 4 credit-pack purchases during a window when nothing could be processed.

**Fix:**

- Add a 402 branch to `mapError()` mapping to a new `ReplicateErrorCode.PROVIDER_UNAVAILABLE`, message: _"Image processing is temporarily unavailable. Your credits have not been charged. Please try again shortly."_
- Never pass raw provider `error.message` to the client. Map to a safe, user-facing string; keep the raw message server-side in the log payload only.
- Audit every `createErrorResponse(..., error.message, ...)` call in the upscale route for the same leak.

**Acceptance:** a simulated Replicate 402 produces a "temporarily unavailable" response with no vendor name, no URL, and no purchase CTA anywhere in the payload or UI.

---

### BUG-2 (P0) — Failed attempts consume the hourly quota and are never refunded

`app/api/upscale/route.ts:431` calls `batchLimitCheck.checkAndIncrement(userId, userTier)` **before** processing. Credits are refunded on failure (`refundAfterRouteFailure`), but the batch counter is not — `batch-limit.service.ts` has no decrement path at all; the legacy `increment()` is a documented no-op.

Consequence: users who retried during the outage burned their hourly quota on attempts that produced nothing. They remained locked out with `429 BatchLimitError` _after_ Replicate recovered at 19:46. Measured in `batch_usage` for the 19:00 window:

| User                          | Counted | From failed attempts |
| ----------------------------- | ------- | -------------------- |
| `jestor_85@hotmail.com`       | 28      | 28                   |
| `luismanuelvivanco@gmail.com` | 9       | 8                    |
| `newusers1314121@gmail.com`   | 5       | 3                    |
| `puckered.wallet@gmail.com`   | 4       | 4                    |
| `co.fuenzalida@gmail.com`     | 3       | 3                    |

`jestor_85` bought credits at 19:05 _and_ burned 28 quota slots on failures — paying twice for nothing.

**Fix:** release the batch slot wherever credits are refunded. Add `batchLimitCheck.release(userId)` (atomic decrement, floored at 0) and call it from `refundAfterRouteFailure` so the two always move together. Only provider/internal failures release the slot — genuine user errors (safety filter, invalid input) should keep consuming quota to preserve abuse protection.

**Acceptance:** a forced provider failure leaves `batch_usage.count` unchanged from its pre-request value; a safety-filter rejection still increments it.

---

### BUG-3 (P0) — `BatchLimitError` freezes the UI at "Enhancing image… 90%"

In `client/hooks/useBatchQueue.ts`, `processSingleItem` sets the item to `PROCESSING`/`PREPARING` (line 213), and the progress callback moves it to `ENHANCING` (line 272), which `PreviewArea.tsx:235` interpolates up to 90% while awaiting the API.

Every catch branch resets the item — `FreeLimitExceededError` (line 307), `insufficient credits` (line 367), `timeout` (line 397), and the generic fallback (line 425) all call `updateItemStatus(item.id, { status: ERROR, stage: undefined })`.

The `BatchLimitError` branch (lines 318–340) is the **only** one that does not. It calls `setIsProcessingBatch(false)` and `setBatchLimitExceeded(...)`, then `return`s — leaving the item at `status: PROCESSING, stage: ENHANCING` forever. The progress bar sits at 90% with "AI model is enhancing your image" and never resolves. Reproduced directly on a free account during this incident.

**Fix:** add the missing `updateItemStatus(item.id, { status: ProcessingStatus.ERROR, error: 'Hourly limit reached', stage: undefined })` before the early return.

**Acceptance:** a 429 from `/api/upscale` moves the item to a terminal error state; no item remains in `PROCESSING` after the queue settles.

**Hardening:** the `finally` block should guarantee no item is left in a non-terminal state, so a future branch cannot reintroduce this class of bug.

#### BUG-3b (P0, open) — the upgrade modal does not appear either; the 429 fails completely silently

Reported from the live repro on `/dashboard`: no `BatchLimitModal` appeared at all. The failure is fully silent — frozen progress bar, no modal, no toast, no error state. Only the browser console showed anything.

Static analysis did **not** explain this, and the cause is still unknown. Ruled out so far:

- `BatchLimitModal` render guard — only `if (!isOpen) return null`, driven by `isOpen={!!batchLimitExceeded}` (`Workspace.tsx:932`).
- `Modal` primitive — plain conditional render, no portal/mount-root dependency.
- Error type loss — `api-client.ts:353` rethrows with `throw error`, preserving the `BatchLimitError` instance.
- Invocation path — `processImage` has exactly one client caller (`useBatchQueue.ts:269`), so the `BatchLimitError` branch is definitely the one that runs.
- State ownership — `useBatchQueue` has a single consumer (`Workspace.tsx:89`); no duplicate hook instances.
- Auto-clear — `clearBatchLimitError()` is only called from the `handleAddPartial` handler and the modal's `onClose`.
- i18n — every key the modal requires exists in `locales/en/workspace.json`.
- A/B variant — `getVariant()` always returns one of the three variants passed, so `copy` cannot be undefined.
- Page mounting — `/dashboard` does render `Workspace`, so the modal is mounted.

**Next step:** reproduce at runtime rather than by inspection. Exhaust a free account's 5/hour quota against prod, then check whether `setBatchLimitExceeded` actually fires (React DevTools state), whether the `batch_limit_modal_shown` analytics event is emitted, and whether `app/[locale]/dashboard/error.tsx` catches a render error. Suspect a React state/closure issue in `processBatch`, since `processSingleItem` is recreated each render and is not wrapped in `useCallback`.

**Acceptance:** a 429 always produces a visible, actionable UI state. Add a regression test asserting the modal opens, not merely that the state setter was called.

**Note:** this is the more serious half of BUG-3. A frozen progress bar with no explanation is worse than a wrong error message — during the outage, affected users had no way to know they were rate-limited.

---

### BUG-4 (P1) — Production logging is silently dead

`server/monitoring/logger.ts:44` constructs the Baselime logger with a plain object literal as `ctx`:

```ts
const logger = new BaselimeLogger({
  service: 'myimageupscaler-api',
  namespace,
  apiKey: apiKey || '',
  ctx: { url: request.url, method: request.method, ...context },
  isLocalDev: !apiKey || isDevelopment(),
});
```

But `@baselime/edge-logger` expects a Cloudflare `ExecutionContext` and calls `this.ctx.waitUntil(...)` to flush (`dist/index.js:119,139`). The object literal has no `waitUntil`, so every flush throws:

```
TypeError: this.ctx.waitUntil is not a function
    at worker.js:145575:24
```

Confirmed live in the Workers tail — 2 occurrences, exactly one per upscale POST. **No application logs are reaching Baselime.** This is why a 6-hour total outage produced zero alerts and had to be diagnosed by hand from the database and the Replicate API.

**Fix:** pass the real `ExecutionContext` (via `getCloudflareContext()` from `@opennextjs/cloudflare`) into `createLogger`, or supply a shim exposing a compliant `waitUntil`, and move the request metadata to the `data`/context field where it belongs. Add a startup assertion that fails loudly if `ctx.waitUntil` is not callable.

**Acceptance:** logs from `/api/upscale` appear in Baselime; no `waitUntil` exception in `wrangler tail` across a full request cycle.

---

### BUG-5 (P1) — No provider health monitoring or alerting

100% of processing failed for 6 hours and the first signal was a customer support email. Nothing watched the failure rate, and nothing watched the provider.

**Fix:**

- Alert when the refund-to-usage ratio exceeds ~50% over a 10-minute window with a minimum volume threshold. This is provider-agnostic and would have fired around 13:50.
- Circuit breaker: after N consecutive provider failures, stop accepting jobs and serve a maintenance state instead of charging-then-refunding each user in turn.
- **Suppress credit-purchase CTAs while the breaker is open.** This is the single highest-value control — it directly prevents the false-purchase harm.
- Monitor Replicate account balance with a low-balance warning. Note: this incident was a false 402 at ~$20 balance, so balance monitoring alone is insufficient — the failure-rate alert is the primary signal.

---

### BUG-6 (P2) — Stale Nano Banana Pro cost constant

`shared/config/model-costs.config.ts:36` has `NANO_BANANA_PRO_COST: 0.13`; Replicate currently charges **$0.15** per output at 1K/2K. Customer billing stays profitable, but internal cost forecasting understates provider spend by ~15% on our most expensive model (28% of predictions, ~95% of provider cost). Did not contribute to the outage.

**Fix:** update to `0.15` and add a comment recording the source and date.

---

## 3. Priority & sequencing

| #   | Bug                               | Priority | Rationale                                                  |
| --- | --------------------------------- | -------- | ---------------------------------------------------------- |
| 1   | Provider errors → purchase prompt | **P0**   | Causes direct financial harm to customers                  |
| 2   | Failed attempts consume quota     | **P0**   | Extends outage past provider recovery                      |
| 3   | UI frozen at 90%                  | **P0**   | Dead-end UX, small localized fix                           |
| 3b  | 429 fails silently, no modal      | **P0**   | Cause unknown — needs runtime repro before it can be fixed |
| 4   | Baselime logging dead             | **P1**   | Blocks detection of everything else                        |
| 5   | No provider monitoring            | **P1**   | Detection gap; depends on #4                               |
| 6   | Stale cost constant               | **P2**   | Forecasting accuracy only                                  |

Suggested order: **3 → 1 → 2** (fastest customer-facing wins first), then **4 → 5** (restore observability), then **6**.

---

## 4. Testing requirements

Per `CLAUDE.md`, all changes need tests before completion.

- `tests/unit/services/error-mapper.unit.spec.ts` — 402 maps to `PROVIDER_UNAVAILABLE`; asserted message contains no `replicate`, no URL, no purchase language.
- New unit test — upscale route error responses never echo raw provider `error.message`.
- New unit test — `batchLimitCheck.release()` decrements atomically and floors at 0; provider failure releases the slot, safety rejection does not.
- `client/hooks/__tests__/useBatchQueue` — a 429 leaves no item in `PROCESSING`; assert across **all** catch branches, not just `BatchLimitError`.
- New unit test — `createLogger` produces a logger whose `ctx.waitUntil` is callable.

Run `yarn test` on affected areas and `yarn verify` before completion. No SEO surface is touched, so the SEO backlog does not apply.

---

## 5. Customer remediation (outside the code changes)

Not yet actioned — pending decision:

- 4 customers bought credit packs during the outage window driven by a false purchase prompt: `babs.moore@icloud.com` (50), `jestor_85@hotmail.com` (50), `puckered.wallet@gmail.com` (200), `luismanuelvivanco@gmail.com` (2nd 50-pack). Offer refund or goodwill credits.
- All failed attempts were correctly auto-refunded in credits — no credit balance is owed.
- Support replies to Luis Manuel Vivanco and Babs Moore are still on hold. Prod is verified recovered as of 19:52 UTC, so a reply can now accurately state the upstream provider issue is resolved and no credits were lost.
- Consider a post-incident note to `jestor_85@hotmail.com`, who both purchased during the outage and burned 28 quota slots on failed attempts.

---

## 6. Success criteria

1. A provider billing/auth/rate-limit failure never produces a credit-purchase prompt or reveals the vendor.
2. A user's hourly quota is unaffected by failures that were not their fault.
3. No queue item can remain in a non-terminal state after processing settles.
4. Application logs reach Baselime; the `waitUntil` exception is gone.
5. A repeat of this outage pages within ~10 minutes instead of surfacing via customer email ~3 hours later.
