# PRD: Purchase Experiment Reward Repair and Winner Rollout

**Status:** Ready  
**Complexity: 6 → MEDIUM mode** (+2 touches 6–10 files, +2 complex attribution/idempotency, +1 database change, +1 payment integration path)

## 1. Context

**Problem:** `purchase_modal_default_selection` has thousands of assignments and zero rewards, so experiment learning is untrustworthy, while `compact_credit_picker` has sufficient directional evidence to replace the losing subscription-first model-gate path.

**Files analyzed:** `lib/experiments/experiment-bandit.service.ts`, `docs/PRDs/purchase-conversion-bandits.md`, `client/components/stripe/PurchaseModal.tsx`, `client/components/features/workspace/ModelGalleryModal.tsx`, `app/api/checkout/route.ts`, Stripe webhook handlers, `tests/unit/experiments/experiment-bandit.service.unit.spec.ts`.

## 2. Integration Points

- User opens purchase modal or clicks a locked model.
- Assignment metadata enters checkout session metadata.
- Stripe success webhook records one idempotent reward for the original assignment.
- Purchase modal keeps its experiment until Phase 1 proves reward health; model gate defaults to compact picker in Phase 2.

## 3. Solution

- Trace and repair assignment metadata from both surfaces through checkout and webhook.
- Replace silent reward failures with structured results and monitoring.
- Enforce uniqueness per purchase/experiment so webhook retries cannot double reward.
- After seven consecutive days of healthy reward attribution, retire `subscription_unlock` and set `compact_credit_picker` as the non-experimental default for model gate.

**Data changes:** Add a unique reward key based on Stripe checkout/payment identifier plus experiment key, or an equivalent unique constraint proven compatible with existing schema.

## 4. Execution Phases

### Phase 1: Reward integrity — every attributed purchase creates exactly one reward

**Files (max 5):** `lib/experiments/experiment-bandit.service.ts`, `app/api/checkout/route.ts`, the concrete purchase webhook handler, `tests/unit/experiments/experiment-bandit.service.unit.spec.ts`, the matching webhook unit test.

**Implementation:**

- [ ] Validate `experimentKey`, `armId`, `assignmentKey`, and `contextKey` before checkout.
- [ ] Copy validated attribution into Stripe metadata.
- [ ] Record reward only after confirmed payment; use Stripe event/payment identity for idempotency.
- [ ] Return/log `recorded`, `duplicate`, `missing_assignment`, and `invalid_arm` outcomes instead of swallowing errors.
- [ ] Reconcile a read-only sample of historical purchases to quantify missing attribution; do not backfill rewards into a live bandit without a separate approved script.

**Tests required:**

| Test                                                            | Assertion                                           |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `should carry purchase-modal assignment into checkout metadata` | All attribution fields preserved                    |
| `should record one reward for a paid checkout`                  | Reward and revenue increment once                   |
| `should ignore duplicate Stripe webhook`                        | Counters remain unchanged on retry                  |
| `should report missing assignment without throwing webhook`     | Payment processing continues, health signal emitted |

**Verification plan:** Run experiment and webhook unit tests, then a Stripe test-mode purchase for each surface. Confirm assignment → checkout metadata → reward row. Run `yarn verify`.

### Phase 2: Compact picker default — free users see the pack-first model-gate path

**Files (max 5):** `client/components/features/workspace/ModelGalleryModal.tsx`, `client/components/stripe/PurchaseModal.tsx`, experiment seed/retirement migration, relevant component test, relevant experiment test.

**Implementation:**

- [ ] Disable `subscription_unlock` for new assignments without mutating historical rows.
- [ ] Make compact credit picker the fallback/default when assignment service is unavailable.
- [ ] Keep existing assigned sessions stable until session expiry.
- [ ] Preserve subscription entry for heavy users through the segment-aware path; do not make it the default for light/free users.

**Acceptance criteria:**

- [ ] Reward attribution rate is ≥95% of paid checkouts with a known experiment assignment for seven days.
- [ ] Duplicate reward rate is zero.
- [ ] `subscription_unlock` receives no new assignments.
- [ ] Compact picker is visible and checkout-capable in desktop/mobile tests.
- [ ] Affected tests, `yarn test`, and `yarn verify` pass.
