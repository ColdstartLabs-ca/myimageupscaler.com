# PRD: Subscription Cancellation Retention

**Status:** Ready after subscription offer decision  
**Complexity: 7 → HIGH mode** (+2 touches 6–10 files, +2 multi-step retention state, +1 database change, +1 Stripe integration, +1 user-facing conditional flow)

## 1. Context

**Problem:** Most subscribers cancel in the first billing cycle, and `CancelSubscriptionModal` currently gathers a reason but provides no targeted save path.

**Product constraint:** Do not promise “convert remaining subscription credits to permanent credits” until credit expiry/ownership semantics are verified. Initial offers are pause (when supported), downgrade, or a bounded next-cycle discount.

## 2. Integration Points

- Entry point: billing page opens `CancelSubscriptionModal`.
- Cancellation reason and current plan determine one optional offer.
- Accepting an offer updates Stripe first, then local subscription state via webhook/sync.
- Declining proceeds through the existing cancellation endpoint without obstruction.
- Billing page displays the resulting pause, downgrade, discount, or scheduled cancellation state.

## 3. Solution

- Add server-owned offer eligibility; the client cannot choose arbitrary coupons or prices.
- Map “too expensive” to downgrade or one approved single-cycle discount; “not using enough” to pause/downgrade; product-quality reasons to direct cancellation plus feedback.
- Show at most one save screen, with a clear “continue cancellation” action.
- Store offer impression/acceptance and cancellation outcome idempotently for measurement.
- Do not stack regional, engagement, and cancellation discounts beyond an explicit server rule.

## 4. Execution Phases

### Phase 1: Reason-based offer — subscriber sees one valid alternative and can still cancel

**Files (max 5):** `client/components/stripe/CancelSubscriptionModal.tsx`, billing page, retention offer resolver, component test, resolver unit test.

**Tests:** correct offer by reason/plan; ineligible user sees direct cancellation; “continue cancellation” remains available; loading/error states preserve user choice.

**Manual checkpoint:** Verify keyboard/mobile flow and that the offer is not a dark pattern.

### Phase 2: Stripe execution — accepted offer produces the intended billing state

**Files (max 5):** retention API route, Stripe service/helper, webhook handler, API unit test, webhook unit test.

**Tests:** server rejects arbitrary coupon; accepted downgrade schedules correct price; duplicate request is idempotent; Stripe failure leaves subscription unchanged; cancellation still works.

**Manual checkpoint:** Stripe test clock verifies next invoice amount/date for each supported offer.

### Phase 3: Measurement and guardrails — retention is judged on durable saves

**Files (max 5):** additive migration, analytics types, reporting query/script, analytics unit test, lifecycle cancellation test.

**Implementation:** Measure offer shown, accepted, cancellation completed, retained at 30/60 days, incremental revenue, refund/chargeback, and later cancellation. Pause retention campaign emails when cancellation state changes.

## 5. Acceptance Criteria

- [ ] Cancellation is never blocked or visually hidden.
- [ ] Offer eligibility and values are server-controlled.
- [ ] Stripe and local state converge through existing webhook/sync paths.
- [ ] No discount stacking outside the documented rule.
- [ ] Primary metric is 60-day incremental retained revenue, not offer acceptance alone.
- [ ] Rollout starts at 10% with a holdout; stop for elevated refunds, complaints, or billing errors.
- [ ] Each phase passes automated checkpoint review, affected tests, `yarn test`, and `yarn verify`.
