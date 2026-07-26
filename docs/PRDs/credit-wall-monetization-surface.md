# PRD: Credit Wall as a Monetization Surface

**Date:** 2026-07-25
**Status:** Ready
**Complexity:** 5 → MEDIUM mode
**Owner:** Conversion / Growth
**Source:** [Growth Diagnostic 2026-07-25](../reports/growth-diagnostic-2026-07-25.md) — priority #2 (impact 9 ÷ effort 3 = 3.0)
**Mandatory context:** [rollback-anti-abuse-payment-recovery](./rollback-anti-abuse-payment-recovery.md) — read before proposing any gate change.

---

## 1. Context

**Problem:** Running out of credits is the single highest-intent monetization moment in the product. Today it is delivered as a **red error toast plus a red `ErrorAlert` banner**. An upgrade modal does open behind that, but the moment is framed as a failure the user caused, not an offer.

Production, 60 days: **1,033 users hit zero balance after genuinely engaging** (3+ credits consumed). That is the qualified paywall population — the most purchase-ready non-payers in the product, at a 0.9% converting business.

### 1.1 Correction to the source diagnostic

The growth diagnostic reported "1,208 `insufficient_credits` errors vs 112 `free_limit_gate_shown` — the paywall fires 10× more often as an error than as an offer." The ratio is real; **the stated cause was wrong**, and the correction matters because it changes the fix.

`free_limit_gate_shown` is **not rarely firing — it is dead code.** It was removed on 2026-07-22 by commit `1c95953c` ("roll back free-tier payment funnel gates"). Verified: zero references remain in `client/`, `app/`, `server/`, `shared/` outside the event-name union and the server whitelist. The 112 events are the tail of the ~5 days it was live (Jul 17-22).

**Why it was removed — this is the constraint this PRD must respect.** Per `rollback-anti-abuse-payment-recovery.md:24-25`, the removed gate was **non-dismissible** (`hardGate=true`: no close button, no backdrop dismiss, `handleDismiss` no-ops) and applied to free users _and unauthenticated guests_ at 0 credits. Result: **payments dropped 60-80%, signups dropped 45%.**

The lesson is **"non-dismissible gate = bad", not "upgrade offer at the credit wall = bad."** This PRD reframes the moment. It does not re-gate it.

### 1.2 The measured number is an undercount

The 1,208 events come from exactly one code path — the mid-batch failure handler (`client/hooks/useBatchQueue.ts:338-366`), i.e. users who ran dry _during_ a batch. Because batch is a client-side loop over `/api/upscale` (`useBatchQueue.ts:447-471`), each failing item fires its own event, so this number is also inflated per-user.

Meanwhile **two pre-flight credit walls emit no analytics at all**:

- `client/components/features/workspace/Workspace.tsx:447-465` — blocks batch start when `requiredCredits > totalCredits`, opens the modal, tracks nothing
- `client/components/features/workspace/BatchSidebar/ActionPanel.tsx:41-50` — opens `InsufficientCreditsModal`, tracks nothing

**We do not currently know how many users hit the credit wall.** Fixing that is Phase 1.

### 1.3 Files Analyzed

```
app/api/upscale/route.ts:823-837, 1031-1043      # 402 INSUFFICIENT_CREDITS, both sites
shared/utils/errors.ts:85-104, 156-163           # error shape + status mapping
shared/utils/credit-limit.ts:8-16                # getCreditLimitErrorCode (upscale no longer calls it)
client/utils/api-client.ts:288-313               # 402 degraded to bare Error — deficit discarded
client/hooks/useBatchQueue.ts:292-366            # red toast + error_occurred
client/components/features/workspace/Workspace.tsx:279-311, 447-465  # ErrorAlert + pre-flight wall
client/components/features/workspace/BatchSidebar/ActionPanel.tsx:41-50, 115-126  # untracked wall
client/components/stripe/PurchaseModal.tsx:33-45, 300-310, 589, 649  # the offer surface (already wired)
client/components/stripe/InsufficientCreditsModal.tsx                # untracked, warning-framed
client/components/stripe/OutOfCreditsModal.tsx                       # DEAD — zero imports
client/utils/purchaseModalDefaults.ts:122-131                        # already defaults to credits pack
server/services/revenue-recovery.service.ts:833-838                  # depends on trigger string
```

### 1.4 Current Behavior (verified in code)

Server returns a well-formed 402 with the deficit (`app/api/upscale/route.ts:823-837`):

```json
{ "success": false,
  "error": { "code": "INSUFFICIENT_CREDITS",
             "message": "You have insufficient credits. This operation requires N credits.",
             "details": { "required": N, "available": M } } }
```

The client then **throws the deficit away** (`client/utils/api-client.ts:309-313`):

```ts
const errorMessage =
  typeof errorData.error === 'object' ? errorData.error.message : errorData.error;
throw new Error(errorMessage || 'Failed to process image');
```

So downstream code cannot see `required`/`available` and instead **string-matches on the message** (`useBatchQueue.ts:338`):

```ts
} else if (error instanceof Error && error.message.includes('insufficient credits')) {
  errorType = 'insufficient_credits';
  analytics.track('error_occurred', { errorType: 'insufficient_credits', ... });
  ...
  showToast({ message: 'Insufficient credits: Please purchase more credits to continue processing images.',
              type: 'error', duration: TIMEOUTS.TOAST_LONG_AUTO_CLOSE_DELAY });
```

And `Workspace.tsx:279-311` additionally pushes it into `globalErrors` → red `ErrorAlert`, _while_ opening the upgrade modal. The user sees a red toast, a red banner, and a purchase modal simultaneously.

`PurchaseModal` is already correctly wired for this moment — `outOfCredits` copy exists (`:589` `'Keep enhancing instantly'`), `purchaseModalDefaults.ts:122-131` already defaults `insufficient_credits` to the credits pack, and `upgrade_prompt_shown` already fires with `trigger:'insufficient_credits'`. **The component is fine. The framing around it is the defect.**

---

## 2. Goals / Non-Goals

**Goals**

- Measure every credit-wall encounter, including the two currently-silent pre-flight paths.
- Present the wall as an offer, not a failure: remove the error toast and red banner for this specific case.
- Preserve the typed deficit end-to-end so the offer can say "you need 2 more credits" instead of a generic string.
- Keep the modal dismissible, always.

**Non-Goals**

- **Re-introducing any non-dismissible gate.** Explicitly out of scope; see §1.1.
- Changing the free grant size — that is [free-grant-calibration-experiment](./free-grant-calibration-experiment.md).
- Changing pricing or pack contents.
- Reviving `OutOfCreditsModal` (dead code — see §6).
- Changing checkout mechanics downstream of the click — covered by [click-to-checkout-conversion-fix](./click-to-checkout-conversion-fix.md).

---

## 3. Solution

### Phase 1 (P0) — Measure the wall

Add a single event, `credit_wall_shown`, fired at **every** credit-wall encounter with `{ source: 'preflight_batch' | 'preflight_action_panel' | 'midbatch' | 'server_402', requiredCredits, currentBalance, deficit }`.

Deliberately a **new event name, not a revival of `free_limit_gate_shown`.** That name is semantically bound to the removed hard gate, and two regression tests assert it does not fire (§5). A new name keeps the rollback guardrails intact and gives a clean baseline.

Register in `server/analytics/types.ts` and the server whitelist `app/api/analytics/event/route.ts` (both required, plus `tests/unit/bugfixes/analytics-event-whitelist.unit.spec.ts`).

Ship Phase 1 alone first and let it run ~7 days. **We currently cannot size this problem**, and Phase 2's success metric depends on this baseline.

### Phase 2 (P0) — Preserve the deficit

Introduce a typed `InsufficientCreditsError` on the client carrying `required`/`available`, mapped in `api-client.ts` from the 402 body — mirroring the existing `FreeLimitExceededError` pattern (`api-client.ts:36-45`). Replace the `message.includes('insufficient credits')` string match in `useBatchQueue.ts:338` with an `instanceof` check.

This is a prerequisite for specific copy and removes a fragile string dependency.

### Phase 3 (P1) — Reframe

1. **Remove the red toast** for `insufficient_credits` (`useBatchQueue.ts:338-366`). Keep item status as errored so the queue UI stays truthful.
2. **Stop pushing credit errors into `globalErrors`** (`Workspace.tsx:279-311`) — no red `ErrorAlert` for this case. The modal _is_ the response.
3. **Instrument and reframe `InsufficientCreditsModal`** (`ActionPanel.tsx:151-158`) — currently amber `AlertCircle` warning-framed and untracked. Precedent for the reframe already argued in [conversion-funnel-optimization-v2](./conversion-funnel-optimization-v2.md) §1 (warning icon → opportunity framing); cite rather than re-derive.
4. **Use the deficit in copy** — "You need 2 more credits to finish this image" beats "Insufficient credits".
5. Modal stays dismissible. `upgrade_prompt_dismissed` with `trigger:'insufficient_credits'` must keep firing — `revenue-recovery.service.ts:833-838` depends on that exact string to queue the `credit-wall-dismissed-48h` campaign. **Do not change the trigger string.**

### Phase 4 (P2) — Offer strength, behind an experiment

The engagement discount (20% first purchase, `shared/config/engagement-discount.ts`) is already triggered from a weaker signal — a 10-minute abandonment timer (`client/hooks/useUpgradeAbandonmentDetector.ts`). The credit wall is a stronger intent signal and is a natural trigger.

**Constraint:** eligibility is once-ever per user (`profiles.engagement_discount_offered_at`), so a credit-wall trigger competes with the abandonment trigger for the same one-shot. Requires an explicit priority decision — do not ship both racing.

Run as an arm on the existing `purchase_modal_default_selection` bandit (`PurchaseModal.tsx:145-160`) rather than a hard cutover.

---

## 4. Dependency

Phase 3 changes what a dismissal means, and the `credit-wall-dismissed-48h` recovery campaign is currently **undeliverable** — see [lifecycle-email-queue-eligibility-restoration](./lifecycle-email-queue-eligibility-restoration.md). Recovery email for this moment will not send until that ships. Sequence that PRD first, or accept that Phase 3's downstream recovery arm is inert.

---

## 5. Testing (green/red)

**Two existing tests are rollback guardrails. They must keep passing — do not "fix" them:**

`tests/unit/api/free-limit-errors.unit.spec.ts:19-26` asserts `app/api/upscale/route.ts` does **not** call `getCreditLimitErrorCode` and does emit `ErrorCodes.INSUFFICIENT_CREDITS`. This PRD makes no server-side error-code change, so it stays green.

`tests/unit/client/components/PurchaseModal.analytics.unit.spec.tsx:366-385` asserts the modal always has a working close button for zero-credit users and that `free_limit_gate_shown` / `free_limit_gate_upgrade_clicked` are **not** tracked. Using a new event name keeps this green — which is precisely why we are not reviving the old name.

New cases:

| Case                                         | Expected                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| Pre-flight batch block (`Workspace.tsx:447`) | `credit_wall_shown` with `source:'preflight_batch'`                          |
| ActionPanel block (`ActionPanel.tsx:41`)     | `credit_wall_shown` with `source:'preflight_action_panel'`                   |
| Mid-batch 402                                | `credit_wall_shown` with `source:'midbatch'`, deficit populated              |
| 402 body → typed error                       | `required`/`available` survive `api-client.ts`                               |
| Mid-batch 402                                | **no** error toast, **no** `globalErrors` entry                              |
| Modal for zero-credit user                   | dismissible (existing guardrail)                                             |
| Dismissal                                    | `upgrade_prompt_dismissed` with `trigger:'insufficient_credits'` still fires |
| New event                                    | present in `app/api/analytics/event/route.ts` whitelist                      |

Also update: `client/components/features/workspace/__tests__/Workspace.test.tsx:540-565`, `tests/unit/client/upgrade-prompts.unit.spec.tsx`, `server/services/__tests__/revenue-recovery.service.test.ts:354-460` (trigger string lock).

Run `yarn test:unit` then `yarn verify`.

---

## 6. Contradiction to Resolve

[segment-aware-upgrade-funnel](./segment-aware-upgrade-funnel.md) (`:223`, `:231`) plans to add a `userSegment` prop to **`OutOfCreditsModal`** — a component with **zero imports anywhere in `client/` or `app/`**. The live credit wall uses `PurchaseModal` and `InsufficientCreditsModal`.

Recommendation: delete `OutOfCreditsModal` as part of this PRD and amend that PRD to target the live components. Flagging rather than silently diverging.

---

## 7. Success Metrics

Phase 1 establishes the real baseline; these are the post-Phase-3 targets.

| Metric                                    | Baseline                          | Target                           |
| ----------------------------------------- | --------------------------------- | -------------------------------- |
| `credit_wall_shown` (all sources)         | **unknown — Phase 1 establishes** | measured                         |
| Wall → `upgrade_prompt_shown`             | unmeasurable today                | > 95%                            |
| Wall → `checkout_opened`                  | unmeasurable today                | establish, then +50%             |
| `error_occurred` / `insufficient_credits` | 1,208 / 30d                       | → 0 (reclassified, not an error) |
| 30-day cohort conversion                  | 0.937%                            | > 1.2%                           |
| Qualified wall population converting      | 1,033 users / 60d, ~0%            | > 3%                             |

**Counter-metrics — the rollback's failure signature. Halt if breached:**

| Counter-metric                   | Baseline | Halt if      |
| -------------------------------- | -------- | ------------ |
| Signups / day                    | ~215     | < 175 (−20%) |
| `checkout_completed` / 30d       | 104      | < 85         |
| Activation (signup → ≥1 upscale) | ~57%     | < 50%        |

---

## 8. Risks

| Risk                                           | Likelihood          | Mitigation                                                                                   |
| ---------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| Repeating the Jul-17 collapse                  | **Low but severe**  | No gate introduced; modal stays dismissible; counter-metrics above; guardrail tests retained |
| Removing the toast hides a real failure        | Medium              | Item status still shows errored; only the _credit_ case loses the toast                      |
| Discount trigger races the abandonment trigger | High if unaddressed | Explicit priority decision required before Phase 4                                           |
| Recovery email inert                           | **Certain today**   | Sequence the email PRD first (§4)                                                            |
| Changing `trigger` string breaks recovery      | Low                 | Locked by `revenue-recovery.service.test.ts`; called out in §3.5                             |
