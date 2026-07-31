# PRD: First-Purchase Conversion Experiment Program

**Date:** 2026-07-30  
**Status:** Approved — Proposal A  
**Owner:** Growth / Monetization  
**Complexity:** 10 — HIGH  
**Primary decision:** Proposal A approved on 2026-07-30  
**Related PRDs:** `prompt-ctr-optimization.md`, `credit-wall-monetization-surface.md`, `shared-bandit-experiment-platform.md`, `regional-pricing-bandit.md`, `checkout-friction-investigation.md`

## 1. Executive Summary

MyImageUpscaler has a real first-purchase conversion problem, but the raw event-count ratios mix different surfaces and stages. A read-only production review for July 1–29, 2026 confirms 11,357 `upgrade_prompt_shown` events, 745 `upgrade_prompt_clicked` events, 5,352 purchase-modal opens, 335 Stripe-checkout opens, and 77 confirmed purchases. It also shows that `PurchaseModal` emits upgrade-prompt events itself, so modal opens and prompt clicks are not successive steps in one clean funnel.

The recommended program fixes measurement first, then runs two isolated experience tests: a fixed A/B test that replaces the blocking post-download modal with a non-blocking model-exploration surface, and a shared-bandit experiment specifically for the insufficient-credit wall. Checkout work begins with Stripe wallet/domain verification and price continuity, not a speculative redesign. Regional pricing remains on its existing dedicated bandit because discounts are already aggressive: 40–65% statically, with live bandit arms ranging from 25–80%.

This PRD is approved and implementation-ready. Execution must follow the sequencing, experiment arms, success metrics, safeguards, acceptance criteria, and rollout gates defined below.

## 2. Objectives

1. Increase confirmed first purchases per 1,000 monetization-eligible sessions.
2. Increase net revenue per 1,000 monetization-eligible sessions.
3. Reduce disruptive, low-intent post-download prompts without reducing premium-model discovery.
4. Increase `insufficient_credits` wall-to-checkout and wall-to-purchase conversion.
5. Make every experiment attributable to a confirmed Stripe purchase without cross-experiment contamination.

## 3. Production Baseline and Corrections

### 3.1 July 1–29, 2026 baseline

Read-only Amplitude Dashboard API query using production credentials from Google Cloud Secret Manager:

| Event                      | Event total | Distinct users |
| -------------------------- | ----------: | -------------: |
| `upgrade_prompt_shown`     |      11,357 |          3,970 |
| `upgrade_prompt_clicked`   |         745 |            540 |
| `upgrade_prompt_dismissed` |       4,618 |          2,700 |
| `purchase_modal_opened`    |       5,352 |          1,708 |
| `purchase_modal_abandoned` |       2,250 |          1,403 |
| `checkout_opened`          |         335 |            260 |
| `purchase_confirmed`       |          77 |             63 |

The 6.56% prompt click rate and 42.04% plan-selection abandonment rate are event-count ratios, not same-user funnel conversion rates. The distinct-user ratios also cannot be treated as a funnel without ordered cohort analysis.

### 3.2 Trigger findings

| Trigger                   | Prompt shown | Prompt clicked | Prompt dismissed | Modal opened | Checkout opened | Purchase confirmed |
| ------------------------- | -----------: | -------------: | ---------------: | -----------: | --------------: | -----------------: |
| `post_download_explore`   |        3,068 |            158 |            2,331 |           18 |               0 |                  0 |
| `insufficient_credits`    |        1,932 |             43 |              686 |        1,932 |              42 |                  3 |
| `workspace_batch_sidebar` |            — |              — |                — |        1,383 |              33 |                 16 |
| `dashboard_sidebar`       |            — |              — |                — |        1,103 |              47 |                 22 |
| `mobile_tab_credits`      |            — |              — |                — |          355 |               4 |                  0 |
| `dashboard_layout`        |            — |              — |                — |          354 |              10 |                  3 |

Corrections to the initial interpretation:

- The reported “678 insufficient-credit shows” is close to the 686 dismissals. The trigger actually produced 1,932 prompt/modal impressions in this window.
- `post_download_explore` is highly disruptive: 75.98% of its impressions produced a dismiss event, while its click leads to the model gallery rather than checkout.
- 98.7% of purchase-modal opens already have a known `trigger`. The large gap between modal opens and `upgrade_prompt_clicked` is primarily an event-semantics problem: `PurchaseModal` emits `upgrade_prompt_shown` on open and `upgrade_prompt_clicked` only when its purchase CTA is clicked.
- `purchase_modal_abandoned` does not include `trigger`, so its 2,250 events cannot currently be attributed to an entry surface.

### 3.3 Regional pricing findings

| Region         | Current static discount | Prompt shown | Purchase confirmed |
| -------------- | ----------------------: | -----------: | -----------------: |
| South Asia     |                     65% |        1,730 |                  2 |
| Southeast Asia |                     60% |        1,137 |                  7 |
| Latin America  |                     50% |        1,396 |                  2 |
| Eastern Europe |                     40% |        1,038 |                  0 |
| Africa         |                     65% |          990 |                  3 |
| Standard       |                      0% |        5,066 |                 63 |

Non-standard regions account for 55.4% of prompt impressions. This does not prove that deeper discounts are the correct fix:

- The application already applies 40–65% static discounts.
- The regional pricing bandit is active with 25–80% arms.
- Prompt mix, checkout eligibility, payment methods, currency, and traffic intent differ by region.
- Event-level totals do not establish a same-user causal funnel.

### 3.4 Existing experiment-platform findings

The shared experiment platform is implemented and active:

- `useExperimentArm` provides stable session/user assignments.
- `/api/experiments/assign` selects active arms.
- Checkout context passes one experiment assignment into Stripe metadata.
- Stripe webhooks record idempotent purchase and revenue rewards.

Production aggregate counters reveal a blocker:

| Experiment                         | Active arms | Impressions | Rewards |
| ---------------------------------- | ----------: | ----------: | ------: |
| `purchase_modal_default_selection` |           3 |       4,243 |       0 |
| `model_gate_purchase_path`         |           4 |       5,114 |      30 |

The purchase-modal bandit is not learning because it has recorded zero purchase rewards despite live purchases. New purchase-modal or credit-wall arms must not launch until reward attribution is repaired and verified.

The checkout context carries only one shared experiment assignment. An upstream post-download bandit would overwrite or be overwritten by the existing model-gate experiment. The first post-download test must therefore use fixed A/B assignment and Amplitude cohort analysis, or the platform must first gain multi-experiment checkout attribution.

### 3.5 Stripe configuration findings

Read-only production Stripe API inspection found:

- Account country: Canada.
- Dynamic payment methods are active because Checkout Sessions do not specify `payment_method_types`.
- Apple Pay, Google Pay, Link, Pix, UPI, BLIK, and other methods are enabled in the active payment-method configuration.
- The API listed only `js.stripe.com` and `checkout.stripe.com` as registered payment domains; the production application domain was not listed.
- Regional inline prices use USD, which may limit eligibility for some local payment methods.

Stripe dynamically filters and orders eligible payment methods based on transaction and customer context. Wallets must be enabled, and embedded Checkout requires correct domain registration and compatible browsers. References:

- [Stripe dynamic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods)
- [Stripe payment-method Dashboard configuration](https://docs.stripe.com/payments/dashboard-payment-methods?payment-ui=embedded-form)
- [Stripe wallet rendering and domain checks](https://docs.stripe.com/testing/wallets?ui=embedded-form)
- [Stripe supported payment methods](https://docs.stripe.com/payments/payment-methods/overview)

## 4. Product Principles

1. Do not block the first successful result or download with a purchase request.
2. Monetize explicit high-intent actions: premium model selection, known credit deficit, or user-initiated pricing exploration.
3. Optimize confirmed purchase revenue, not prompt clicks alone.
4. Show the exact item, price, credit outcome, and renewal terms before checkout.
5. Run one checkout-owning shared experiment per session until multi-experiment attribution exists.

## 5. Target Users and Journeys

### 5.1 First successful free user

1. User processes and downloads a result.
2. The result view remains uninterrupted.
3. A non-blocking surface offers premium model exploration.
4. A click opens the model gallery.
5. A premium-model selection continues through the existing `model_gate_purchase_path` experiment.

### 5.2 User without enough credits

1. User configures an image-processing job.
2. Client preflight calculates required credits and current balance before submission.
3. Credit wall shows requirement, deficit, preserved job, and smallest sufficient pack.
4. User chooses the focused CTA or opens more options.
5. Authenticated user enters Stripe checkout; unauthenticated user completes auth and resumes.
6. Confirmed purchase restores credits and resumes the preserved job once.

### 5.3 Regionally priced buyer

1. User sees the same regional price in the monetization surface and Stripe checkout.
2. Stripe shows eligible wallet/local methods for device, browser, country, currency, and purchase type.
3. Purchase attribution records region, applied discount, entry surface, experiment assignment, and net revenue.

## 6. Proposals

### Proposal A — Measurement repair plus isolated experiments

**Decision: approved.**

Sequence:

1. Repair funnel semantics and shared-bandit reward attribution.
2. Run fixed A/B test for post-download placement.
3. Run a new credit-wall shared-bandit experiment after reward verification.
4. Verify Stripe production-domain registration and wallet rendering.
5. Continue the existing regional-pricing bandit; do not add blanket discounts.

Benefits:

- Uses the existing scaffold where purchase attribution is direct.
- Avoids nested experiment contamination.
- Separates prompt fatigue, offer selection, payment friction, and price effects.
- Produces reliable learnings even if a treatment fails.

Cost:

- Requires instrumentation repair before visible conversion changes.
- Full purchase conclusions will take multiple weeks because purchases are sparse.

### Proposal B — Immediate experience changes without controlled experiments

Remove the post-download modal, route insufficient-credit users directly to the starter pack, add trust copy, and register wallet domains immediately.

Benefits:

- Fastest visible change.

Risks:

- Cannot distinguish which change caused lift or harm.
- Starter pack may not cover the interrupted job.
- Existing bandit attribution remains broken.
- “Money-back guarantee” copy could create a policy commitment that has not been approved.

**Recommendation: reject.**

### Proposal C — Regional pricing first

Increase non-standard-region discounts before changing surfaces or checkout.

Benefits:

- Simple hypothesis.

Risks:

- Discounts already reach 80% in live arms.
- Reduces revenue without proving price is the constraint.
- Does not address missing wallets, USD eligibility, prompt mix, or instrumentation.

**Recommendation: reject.**

## 7. Proposed Experiments

### Experiment 1 — Post-download surface

**Assignment:** fixed 50/50 A/B, stable per user where authenticated and per device otherwise.  
**Do not use shared checkout bandit:** the downstream model gate already owns the checkout experiment assignment.

Arms:

- `blocking_modal_control`: current `PostDownloadPrompt`.
- `inline_explore_treatment`: no modal; show an inline “Explore premium models” action beside the completed result/download controls.

Primary metric:

- Confirmed purchases within seven days per assigned eligible user, analyzed as an ordered Amplitude cohort.

Leading metrics:

- Model-gallery opens per assignment.
- Premium-model selections per assignment.
- `model_gate` checkout opens per assignment.

Guardrails:

- Download completion rate.
- Second-job start rate.
- Seven-day return rate.
- Prompt/surface dismissal rate.

Decision rule:

- Ship treatment only if purchase/revenue is non-inferior and at least one guardrail or leading metric improves.
- Stop early for a material download or second-job regression.

### Experiment 2 — Insufficient-credit purchase path

**Platform:** shared bandit after reward repair.  
**Experiment key:** `insufficient_credits_purchase_path`.  
**Context:** `global` initially; device and region remain metadata, not separate contexts, to avoid starving arms.  
**Assignment:** session scope.

Arms:

- `current_modal_control`: current credits-first modal with starter pack selected.
- `sufficient_pack_focus`: select the smallest pack whose credits cover the deficit; show exact required credits, balance, post-purchase balance, price, and “Continue this upscale.”
- `direct_sufficient_pack`: compact summary with direct checkout for the smallest sufficient pack plus a visible “See all options” escape hatch.

Primary reward:

- Webhook-side `purchase_confirmed`, revenue-weighted.

Leading metrics:

- Credit-wall to checkout-open rate.
- Checkout-open to confirmed-purchase rate.
- Time from wall shown to checkout opened.

Guardrails:

- Refund and chargeback rate.
- Purchase followed by successful interrupted-job completion.
- Support contacts tagged pricing/credits.
- Duplicate processing or duplicate charge count.

Constraints:

- Preserve the interrupted job and selected model.
- Never start payment without an explicit click.
- Auto-resume at most once after confirmed credit fulfillment.
- Recommended pack must cover the calculated deficit.
- Do not default to a subscription in this experiment.

### Experiment 3 — Checkout reassurance

**Start as operational validation, not a bandit.**

Tasks:

- Register and verify every live/test application domain required by Stripe wallet rendering.
- Smoke-test Apple Pay, Google Pay, and Link on eligible devices and browsers.
- Verify which local methods render for representative South Asia, Southeast Asia, Latin America, and Eastern Europe transactions.
- Preserve the exact selected item and regional price from modal to Stripe.
- Add a concise refund/guarantee statement only after policy owner approval.

Possible later fixed A/B:

- `summary_control`: existing checkout transition.
- `price_continuity_treatment`: persistent order summary immediately before Stripe, showing item, credits, regional discount, final USD price, and recurring/one-time status.

Do not test multiple trust badges, rescue discounts, wallet changes, and guarantee copy simultaneously.

### Experiment 4 — Regional price optimization

Continue the existing specialized `pricing_bandit_arms` system.

Required changes before trusting its output:

- Report impressions, conversions, revenue, refund-adjusted revenue, and purchase type per arm.
- Confirm each assignment’s displayed discount equals Stripe’s applied discount.
- Analyze payment-method eligibility and checkout-open rate per region.
- Set a minimum-exploration and guardrail policy before deactivating arms.

Primary metric:

- Net revenue per assigned regional-pricing impression.

Do not optimize conversion rate alone; an 80% discount can increase conversion while reducing revenue.

## 8. Functional Requirements

### TASK-2 — Repair event semantics

- `upgrade_prompt_shown/clicked/dismissed` represent promotional surfaces only.
- Purchase-selection stages use `purchase_modal_opened`, `purchase_cta_clicked`, and `purchase_modal_abandoned`.
- `purchase_modal_abandoned` includes `trigger`, selected item, experiment metadata, and whether checkout opened.
- Existing dashboards receive a migration note and dual-write window if event renaming is required.

Acceptance criteria:

- A test session produces one ordered path without duplicate stage semantics.
- Event totals can be reconciled by `funnelAttemptId`.

### TASK-3 — Add stable funnel attempt attribution

- Create a non-PII `funnelAttemptId` at the first monetization surface.
- Persist it through auth redirect, purchase modal, checkout session, Stripe metadata, and purchase webhook.
- Preserve `trigger`, `originatingTrigger`, `attributionChain`, pricing region, and experiment assignment.

Acceptance criteria:

- A confirmed test purchase is traceable to one initial surface and one ordered attempt.
- No card, email, image, or other sensitive content appears in analytics properties.

### TASK-4 — Repair shared-bandit rewards

- Diagnose why `purchase_modal_default_selection` has 4,243 impressions and zero rewards.
- Verify assignment key and arm metadata survive modal selection, auth, checkout creation, and webhook handling.
- Add production-health counters for `recorded`, `duplicate`, `missing_assignment`, `invalid_arm`, and `storage_error`.

Acceptance criteria:

- Each active test arm records a test-mode or sandbox purchase reward exactly once.
- A production canary purchase records one reward and revenue on the assigned arm.
- No new purchase-modal experiment launches while reward health is failing.

### TASK-5 — Isolate experiments

- Post-download uses fixed A/B assignment and carries its variant as analytics context only.
- Credit-wall uses one shared experiment assignment.
- Model-gate and regional-pricing experiments continue independently.
- Checkout context must not silently replace an existing experiment assignment.

Acceptance criteria:

- Tests cover post-download → model gate → purchase attribution.
- Tests cover insufficient credits → selected arm → purchase reward.

### TASK-6 — Replace blocking post-download treatment

- Treatment removes the modal interruption.
- Inline action is visible but does not obstruct download or result review.
- Existing model-gallery and model-gate paths remain intact.

Acceptance criteria:

- Treatment users never receive `PostDownloadPrompt`.
- Download, model-gallery, and experiment events have the correct variant.

### TASK-7 — Implement sufficient-pack selection

- Calculate the smallest enabled pack covering `max(requiredCredits - currentBalance, 0)`.
- Fall back safely when required credits are unavailable.
- Show exact price after regional discount.
- Preserve a “See all options” route.

Acceptance criteria:

- Unit tests cover exact fit, between-pack deficit, larger-than-largest deficit, missing cost, and regional price.
- Selected pack always covers the known deficit.

### TASK-8 — Preserve and resume interrupted work

- Store only the minimal job configuration needed to resume.
- Resume once after confirmed credit fulfillment.
- Require user action if the saved job is stale or invalid.

Acceptance criteria:

- End-to-end test proves credit wall → purchase → one resumed job.
- Refresh, duplicate webhook, and repeated modal close do not duplicate processing.

### TASK-9 — Verify payment methods and price continuity

- Document Stripe Dashboard settings and registered domains.
- Test eligible wallets on production-equivalent domains.
- Record displayed modal price and Stripe applied amount for reconciliation.
- Report local-method eligibility by region and purchase type.

Acceptance criteria:

- Apple Pay/Google Pay/Link test matrix records expected availability or a documented eligibility reason.
- Modal and Stripe amount match in every supported pricing region.

### TASK-10 — Experiment reporting

- Report assignment count, surface exposure, checkout opens, confirmed purchases, revenue, refunds, and guardrails per arm.
- Separate event totals from distinct users and ordered funnel cohorts.
- Exclude pre-launch and attribution-unhealthy periods.

Acceptance criteria:

- One dashboard answers which arm produced the most net revenue per assignment.

## 9. Analytics Contract

Required common properties:

| Property                     | Purpose                                 |
| ---------------------------- | --------------------------------------- |
| `funnelAttemptId`            | Ordered attempt correlation without PII |
| `entrySurface`               | Strict source taxonomy                  |
| `trigger`                    | Immediate monetization trigger          |
| `originatingTrigger`         | Upstream trigger                        |
| `attributionChain`           | Bounded sequence of surfaces            |
| `pricingRegion`              | Regional analysis                       |
| `discountPercent`            | Displayed regional discount             |
| `selectedType`               | Credit pack or subscription             |
| `selectedKey`                | Pack or plan key                        |
| `priceId`                    | Server-validated Stripe price           |
| `experimentKey` / arm fields | Experiment attribution                  |

Source taxonomy must include all current call sites: `insufficient_credits`, `workspace_batch_sidebar`, `dashboard_sidebar`, `dashboard_layout`, `mobile_tab_credits`, `workspace_model_gallery`, `post_download_explore`, `navbar`, and `gallery_upgrade`.

## 10. UI Requirements

- Use existing Tailwind color tokens; no hardcoded colors.
- Keep download and result inspection as the primary post-processing actions.
- Credit-wall title states the continuation outcome, not only the error.
- Price, credits, one-time/recurring status, and regional discount remain visible before checkout.
- “See all options” is always available in focused/direct arms.
- All modal and inline actions are keyboard accessible and screen-reader labeled.

## 11. Technical Constraints

- Cloudflare Workers CPU budget is 10 ms; all assignment and price logic must remain bounded.
- Server validates country, discount, price ID, and experiment attribution.
- Never trust client-supplied price amounts or reward metadata.
- Stripe webhook remains the purchase-reward source of truth.
- Analytics must not contain card data, credentials, image content, or unnecessary PII.
- Any production database migration or data mutation requires a fresh verified backup before execution.

## 12. Prerequisites and Access

| Prerequisite                          | Status                                           |
| ------------------------------------- | ------------------------------------------------ |
| Amplitude Dashboard API               | Verified read-only on 2026-07-30                 |
| Google Cloud Secret Manager           | Verified read-only on `myimageupscaler-auth`     |
| Stripe production API                 | Verified read-only on 2026-07-30                 |
| Supabase aggregate experiment tables  | Verified read-only on 2026-07-30                 |
| Stripe Dashboard write access         | Required later for domain/payment-method changes |
| Zero-credit authenticated test user   | Required for implementation verification         |
| Stripe sandbox wallet-capable devices | Required for wallet verification                 |

Existing required server variables:

- `AMPLITUDE_API_KEY`
- `AMPLITUDE_SECRET_KEY`
- `STRIPE_SECRET_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

No new environment variables are proposed, so no `.env.local` placeholders were added.

## 13. Test Plan

Implementation must use red/green TDD and include:

1. Unit tests for event semantics, funnel context, sufficient-pack selection, and experiment isolation.
2. API tests for experiment attribution validation and checkout metadata.
3. Webhook tests for idempotent reward recording and failure-health outcomes.
4. E2E tests for post-download treatment and credit-wall purchase/resume.
5. Manual Stripe wallet/domain matrix on eligible production-equivalent devices.

Affected tests must pass with `yarn test`, followed by required `yarn verify`.

## 14. Rollout and Decision Gates

### Gate 1 — Measurement healthy

- Ordered funnel reconciles for sandbox purchases.
- Purchase-modal bandit records rewards.
- No unexplained attribution loss above 2%.

### Gate 2 — Post-download test

- Run at least 14 days and through two full weekly cycles.
- Do not call a winner from raw CTR alone.

### Gate 3 — Credit-wall experiment

- Launch only after Gate 1.
- Begin with bounded exposure and a control arm.
- Review guardrails daily for the first seven days.

### Gate 4 — Checkout/payment changes

- Verify domains and wallets first.
- Test one checkout hypothesis at a time.

### Gate 5 — Regional pricing decisions

- Use net revenue and refund-adjusted results.
- Do not deactivate pricing arms based on fewer than the pre-agreed minimum assignments/conversions.

## 15. Non-Goals

- No blanket move of monetization before the user experiences initial product value.
- No new subscription tiers or credit-pack sizes.
- No automatic guarantee or refund-policy commitment.
- No custom payment form replacing Stripe Checkout.
- No deeper regional discount outside the existing pricing bandit.
- No multi-experiment checkout-attribution platform expansion unless sequential isolation proves insufficient.

## 16. Assumptions and Approved Decisions

Assumptions:

- The first successful result remains available before monetization.
- Credit cost and balance are known for most insufficient-credit preflights.
- The smallest sufficient pack is preferable to the smallest absolute pack.
- Confirmed Stripe purchase and net revenue are the primary optimization outcomes.

Approved decisions:

1. Use Proposal A and its sequence.
2. Use fixed A/B for post-download rather than the shared bandit.
3. Use the shared bandit for `insufficient_credits` only after reward repair.
4. Treat guarantee copy as blocked until a formal money-back policy is separately approved.
