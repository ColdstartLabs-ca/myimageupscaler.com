# Multi-Armed Bandit Opportunities for Retention and Purchase Conversion

Date: 2026-05-26
Scope: MyImageUpscaler product, checkout, onboarding, pricing, and post-result flows
Goal: identify additional adaptive experiments beyond the existing regional pricing bandit.

## Executive Summary

The codebase already has the strongest foundation for bandits in place: `/api/geo` selects regional pricing arms, checkout passes `bandit_arm_id`, and the Stripe webhook records conversion revenue. The next best opportunities are not generic A/B tests. They are high-intent product decisions where the app repeatedly chooses copy, timing, default purchase item, or next action, and where rewards can be observed from existing Amplitude and webhook events.

Highest-priority opportunities:

1. **Model-gate purchase path bandit**: optimize what locked-model clicks do next: direct small credit checkout, compact credit picker, subscription prompt, or discounted starter path.
2. **Engagement discount bandit**: optimize eligibility thresholds, discount percent, target pack, and display format for engaged free users.
3. **Checkout rescue bandit**: optimize rescue-offer timing, discount, and ordering relative to the exit survey.
4. **Post-download next-action bandit**: optimize the first successful result moment for retention and second-session probability.
5. **Onboarding activation bandit**: optimize first-upload and first-download guidance for new users without over-teaching.

These should use a shared contextual bandit service rather than one-off local `getVariant()` calls. Start with low-risk UI/timing arms, then graduate to price/discount arms after guardrails and revenue attribution are reliable.

## Impact Ratings

Live Amplitude fetch was attempted locally on 2026-05-26 for 2026-05-01 through 2026-05-25 using `yarn amplitude:check:prod` and `yarn amplitude:check`. Production env files were unavailable locally, and the local env did not include `AMPLITUDE_SECRET_KEY`, so the Dashboard REST API could not authenticate.

The ratings below incorporate the user's live Amplitude brief for the last 30 days:

- Revenue funnel: `6,731` upgrade prompts shown, `480` clicked, `239` checkouts opened, `23` purchases confirmed.
- Purchase modal: `426` modal opens and `239` checkout opens, or about `56%` modal-to-checkout conversion.
- Engagement discount: `231` offers shown, `3` CTA clicks, `0` checkouts, `0` purchases.
- Checkout: `239` checkout opens, `372` checkout abandoned events, `23` purchases.
- Post-download: `3,602` image downloads and about `45` daily unique downloaders.
- Activation: `2,701` uploads, `2,166` completed upscales, `1,428` first-upload completions.
- Retention after first upload: day 1 `5.6%`, day 7 `1.4%`, day 14 `1.9%`.

Onboarding note: onboarding has been intentionally deactivated before, so current `onboarding_*` telemetry should not be interpreted as a clean product failure. The live anomaly where `onboarding_completed` exceeds `onboarding_started` means onboarding-specific events are not yet reliable reward events. That said, the low retention after first upload makes onboarding worth restoring as a bandit with a no-onboarding control and activation/retention rewards.

Rating scale:

- **5 / Transformational**: likely direct revenue or retention unlock; known large leak or high-intent surface.
- **4 / High**: meaningful upside with enough volume or strong strategic leverage.
- **3 / Medium**: useful optimization, but smaller audience, delayed reward, or more uncertain path.
- **2 / Low**: valid future experiment but needs more traffic/instrumentation first.
- **1 / Minimal**: not recommended as a near-term bandit.

| Rank | Opportunity                                        |                                Impact | Confidence  | Evidence and reasoning                                                                                                                                                                                                                                                                              |
| ---- | -------------------------------------------------- | ------------------------------------: | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Model-gate purchase path bandit                    |              **5 / Transformational** | High        | The last 30 days show `480` upgrade clicks but only `239` checkout opens and `23` purchases. This is high purchase intent with a short reward window and a large click-to-checkout leak.                                                                                                            |
| 2    | Purchase modal layout and default selection bandit |              **5 / Transformational** | High        | The modal opened `426` times but only `239` users reached checkout. A `56%` modal-to-checkout rate means roughly `187` high-intent users abandoned the picker before Stripe loaded.                                                                                                                 |
| 3    | Post-download next-action bandit                   |                          **4 / High** | High        | `3,602` image downloads in 30 days, about `120/day`, is enough volume for a 4-arm retention bandit. This is the strongest ready-to-run retention surface.                                                                                                                                           |
| 4    | Onboarding restoration and activation bandit       |                          **4 / High** | Medium-high | Activation volume is strong: `2,701` uploads, `2,166` completed upscales, and `1,428` first-upload completions. Retention after first upload is weak: day 1 `5.6%`, day 7 `1.4%`. Restore onboarding as a bandit, but do not use `onboarding_completed` as the main reward until tracking is fixed. |
| 5    | Engagement discount bandit                         |                          **4 / High** | Medium      | The current fixed offer is effectively dead: `231` shown, `3` clicks, `0` checkouts, `0` purchases. It has enough volume for a slower bandit, but CTA-to-checkout tracking and UX need cleanup.                                                                                                     |
| 6    | Checkout rescue bandit                             |                   **3 / Medium-high** | Medium      | `239` checkout opens and `23` purchases imply `9.6%` checkout-to-purchase. The pool is real, but rescue only helps users who already get past the larger modal/picker leak. Clarify duplicate `checkout_abandoned` counting before optimizing.                                                      |
| 7    | Free-credit and paywall threshold bandit           |                        **3 / Medium** | Medium      | Potentially large revenue and cost impact, especially by region, but it directly affects COGS, abuse, and user trust. Needs stronger guardrails before adaptive rollout.                                                                                                                            |
| 8    | Model gallery ordering and recommendation bandit   |                        **3 / Medium** | Medium      | The model gallery is central to both retention and premium interest. Impact is real, but much of the purchase upside overlaps with the higher-priority model-gate purchase-path bandit.                                                                                                             |
| 9    | Auth timing bandit                                 |                        **3 / Medium** | Low-medium  | Important for preserving intent through login and checkout, especially unauthenticated direct checkout. Impact depends on auth drop-off volume, which was not available from the attempted Amplitude fetch.                                                                                         |
| 10   | Lifecycle email / reactivation bandit              | **2 / Low near-term, High long-term** | Low-medium  | Could improve 7-day retention and first purchase, but requires reliable identity, consent, email deliverability, and holdout measurement. Best after in-product activation/purchase bandits are working.                                                                                            |

Near-term recommendation: implement the shared experiment primitive, then launch `model_gate_purchase_path` and `purchase_modal_default_selection` first for purchase conversion. In parallel, restore onboarding behind an `onboarding_activation` bandit with a no-onboarding holdout and reward it on upload/process/download/return behavior, not onboarding event completion.

## Existing Bandit and Experimentation Baseline

### Already implemented

- `lib/pricing-bandit/bandit.service.ts` uses Thompson Sampling for regional discount arms.
- `supabase/migrations/20260408_pricing_bandit_arms.sql` stores regional arm impressions, conversions, and revenue.
- `app/api/geo/route.ts` returns `discountPercent` and `banditArmId`, then client-side `useRegionTier()` caches that decision for the session.
- `app/api/checkout/route.ts` applies the bandit arm discount at checkout and preserves `bandit_arm_id` metadata.
- `app/api/webhooks/stripe/handlers/payment.handler.ts` records successful payment revenue back to the selected arm.

### Existing adaptive-adjacent surfaces

- `client/components/features/workspace/ModelGalleryModal.tsx` already uses `getVariant('batch_limit_copy', ['value', 'outcome', 'urgency'])`, but this is not reward-optimized.
- `shared/config/engagement-discount.ts` has fixed thresholds: `3` upscales, `2` downloads, `1` model switch, requiring `2` of `3`.
- `shared/config/checkout-rescue-offer.ts` has a fixed `20%` rescue offer for `10` minutes.
- `client/components/features/workspace/Workspace.tsx` has onboarding, sample images, first-download celebration, post-download model exploration, direct model-gate checkout, and engagement tracking.
- Analytics taxonomy already includes `upgrade_prompt_*`, `purchase_modal_*`, `checkout_*`, `purchase_confirmed`, `onboarding_*`, `sample_image_*`, `first_upload_completed`, `image_download`, `engagement_discount_*`, and `model_gallery_*`.

## Recommended Shared Bandit Primitive

Create a generalized table/service before adding more product bandits:

```sql
experiment_arms (
  id bigserial primary key,
  experiment_key text not null,
  context_key text not null default 'global',
  arm_key text not null,
  arm_config jsonb not null,
  impressions integer not null default 0,
  rewards integer not null default 0,
  revenue_cents integer not null default 0,
  guardrail_failures integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experiment_key, context_key, arm_key)
);
```

Use session-stable assignment for UX arms and user-stable assignment for lifecycle arms. Every assignment should emit a common event such as `experiment_arm_assigned` with `experimentKey`, `armKey`, `armId`, `contextKey`, and `surface`.

Reward model:

- Binary reward for short loops: upload, process, download, checkout opened, checkout completed.
- Revenue-weighted reward for purchase loops: `purchase_confirmed.amount`.
- Delayed reward for retention loops: return within 1 day, return within 7 days, second download, second purchase.
- Guardrails: refund, support contact, checkout error, unsubscribe, payment decline, processing failure, free-credit abuse, margin floor.

## Opportunity 1: Model-Gate Purchase Path Bandit

Priority: P0
Primary goal: purchase conversion from locked-model intent
Current surface: `ModelGalleryModal.handleLockedClick()` and `Workspace.handleUpgradeDirect()`

### Why this is a strong bandit

Locked premium-model clicks are one of the highest-intent moments in the product. The user has already selected a desired outcome and hit a paywall. The repo recently investigated this path because direct checkout observability was a revenue risk. This is exactly where adaptive routing can outperform a fixed rule.

### Candidate arms

| Arm                      | Treatment                                                             | Good for                                             |
| ------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `direct_small_pack`      | Open checkout directly for cheapest eligible credit pack              | Lowest friction                                      |
| `compact_credit_picker`  | Show 2 credit packs only: small and best value                        | Users needing choice without full pricing complexity |
| `premium_model_bundle`   | Preselect pack sized for the clicked model and scale                  | Higher AOV when intent is clear                      |
| `subscription_unlock`    | Preselect Starter/Hobby subscription for repeated/high-cost model use | Repeat usage and retention                           |
| `discounted_direct_pack` | Direct checkout with small time-limited offer                         | Regions or segments with high price sensitivity      |

### Contexts

- `pricingRegion`
- `originatingModel`
- `deviceType`
- authenticated vs unauthenticated
- first session vs returning user
- credits balance and out-of-credits state
- source: manual gallery, post-download explore, mobile, first-time auto

### Reward

Primary: `purchase_confirmed` within 24 hours, revenue-weighted.
Secondary: `checkout_opened`, `checkout_session_created`, `checkout_auth_required` completion after auth, `image_download` after purchase.
Guardrails: `purchase_modal_abandoned`, `checkout_abandoned`, `checkout_error`, payment declines, refund rate.

### Implementation notes

- Preserve current direct checkout as the control arm.
- Assign the arm before `upgrade_prompt_clicked`, include `experimentArmId` in checkout tracking context, and pass it into checkout metadata.
- Attribute the final webhook-side `purchase_confirmed` back to the arm.
- Do not optimize only for checkout opens. Optimize for revenue per model-gate impression.

## Opportunity 2: Engagement Discount Bandit

Priority: P0
Primary goal: first purchase among highly engaged free users
Current surface: `useEngagementTracker()`, `ENGAGEMENT_DISCOUNT_CONFIG`, `engagement-discount.service.ts`

### Why this is a strong bandit

The current offer is fixed: 20% off the medium pack, shown after 2 of 3 engagement thresholds. That may be too late for some users, too generous for others, or pointed at the wrong pack. The system already captures exactly the behavioral signals needed to contextualize the arm.

### Candidate arms

| Arm                        | Thresholds                          | Offer                                     | Display                             |
| -------------------------- | ----------------------------------- | ----------------------------------------- | ----------------------------------- |
| `early_small_10`           | 1 upscale + 1 download              | 10% off small pack                        | Inline banner                       |
| `current_medium_20`        | 2 of 3 current thresholds           | 20% off medium pack                       | Existing toast/banner               |
| `late_medium_25`           | 3 upscales + 2 downloads            | 25% off medium pack                       | Modal-lite banner                   |
| `usage_based_pack`         | Enough usage to predict credit need | Discount pack sized to actual model usage | Inline purchase card                |
| `no_discount_value_prompt` | 2 of 3 current thresholds           | No discount, value reminder               | Control for discount incrementality |

### Contexts

- number of upscales/downloads/model switches
- model costs used in session
- free credits remaining
- `pricingRegion`
- first visit vs returning user
- source: engagement vs upgrade abandonment detector

### Reward

Primary: first `purchase_confirmed` within 24 hours and 7 days.
Secondary: `engagement_discount_cta_clicked`, `engagement_discount_checkout_started`, `checkout_session_created`.
Retention reward: return visit within 7 days and second processing session.
Guardrails: margin after regional discount stacking, refunds, support complaints, offer dismissal rate.

### Implementation notes

- Current service records a single `engagement_discount_offered_at`; for bandits, store `experimentArmId`, `offerType`, `targetPackKey`, and percent.
- Add a no-discount/control arm to measure whether the discount is incremental.
- Cap discount stacking with regional pricing so high-discount regions do not fall below margin floor.

## Opportunity 3: Checkout Rescue Bandit

Priority: P1
Primary goal: recover high-intent checkout abandonment
Current surface: `CheckoutModal`, `useCheckoutRescueOffer()`, `CHECKOUT_RESCUE_OFFER_CONFIG`

### Candidate arms

| Arm                          | Treatment                                                     |
| ---------------------------- | ------------------------------------------------------------- |
| `no_rescue_survey_only`      | Show only exit survey after qualifying time                   |
| `rescue_10_percent`          | 10% off, 10-minute expiry                                     |
| `rescue_20_percent`          | Existing 20% off, 10-minute expiry                            |
| `rescue_value_copy`          | No larger discount; copy explains credits/use case            |
| `rescue_after_survey_reason` | Ask reason first, then offer targeted rescue if price-related |

### Contexts

- checkout step: plan selection vs Stripe embed
- selected type: subscription vs credit pack
- time spent
- exit method
- `pricingRegion`
- mobile hosted checkout vs embedded checkout
- whether engagement discount already applied

### Reward

Primary: `purchase_confirmed` after rescue impression, revenue-weighted.
Secondary: rescue claim rate and `checkout_session_created`.
Guardrails: discount leakage to users who would have purchased anyway, lower AOV, refund rate.

### Implementation notes

- Rescue offers should be assigned only after real exit intent, not on every checkout open.
- Track a rescue impression event; currently the hook tracks exit intent and offer creation, but the reportable arm assignment should be explicit.
- Keep engagement-discount users out of rescue arms unless the treatment is specifically designed for stacked offers.

## Opportunity 4: Post-Download Next-Action Bandit

Priority: P1
Primary goal: retention after first successful value moment
Current surface: `FirstDownloadCelebration`, `PostDownloadPrompt`, `openExploreGallery()`, gallery save

### Why this matters

The first download is the clearest activation milestone. The user has received value, and the app can choose the next action: upload another image, save to gallery, explore premium models, batch process, or create an account.

### Candidate arms

| Arm               | Primary next action                            |
| ----------------- | ---------------------------------------------- |
| `upload_another`  | Start second job immediately                   |
| `save_to_gallery` | Save result and create durable account value   |
| `explore_models`  | Open model gallery with premium examples       |
| `batch_unlock`    | Promote batch workflow or subscription         |
| `share_result`    | Encourage download/share flow and return later |

### Contexts

- first-time vs returning user
- sample image vs uploaded image
- quality tier used
- result dimensions
- authenticated vs guest
- download count

### Reward

Primary retention: second upload, second processing completion, return visit in 1 or 7 days.
Primary purchase: `upgrade_prompt_clicked` -> `purchase_confirmed` from post-download source.
Guardrails: modal dismissal, lower download completion, support contacts, slower time-to-second-upload.

### Implementation notes

- Keep the first download itself clean. Assign the bandit after download success, not before.
- Add `experimentArmId` to `post_download_explore`, `celebration_explore`, and gallery save events.
- For guests, arms that require auth should be judged by completed post-auth return, not auth modal open.

## Opportunity 5: Onboarding Activation Bandit

Priority: P1
Primary goal: first upload, first process, first download
Current surface: `ProgressSteps`, `SampleImageSelector`, `useOnboardingDriver()`, onboarding analytics events

### Why restore onboarding as a bandit

Onboarding was intentionally deactivated, so the right question is not "should onboarding stay off?" The better product question is which onboarding treatment improves activation and retention without slowing users down. The live data supports testing this: first-upload and processing volume are large enough, while day-1 and day-7 retention after first upload remain weak.

Use `no_onboarding` as an explicit control arm, not as the product default forever. This lets the bandit learn whether lightweight guidance, sample images, or task-based model selection creates more repeat sessions than no onboarding.

### Candidate arms

| Arm                       | Treatment                                                            |
| ------------------------- | -------------------------------------------------------------------- |
| `no_onboarding`           | Control arm; current intentionally deactivated experience            |
| `minimal_progress`        | Progress steps only, no blocking tour                                |
| `sample_prompt_visible`   | Surface sample images near upload without modal gating               |
| `guided_tour_delayed`     | Show tour only after 8-10 seconds of inactivity or upload hesitation |
| `task_based_model_picker` | Ask what the user wants to fix, then preselect or recommend a model  |
| `first_result_coaching`   | No upload guidance; show next-step guidance only after first result  |

### Contexts

- entry page: homepage, tool page, blog, pricing
- device type
- `pricingRegion`
- referrer/UTM
- first session
- whether user uploaded within first N seconds

### Reward

Primary: `first_upload_completed`, `upscale_completed`, `image_download`, and second upload/process within 7 days.
Secondary: `sample_image_selected`, upload-to-download duration, day-1 return, day-7 return.
Do not use `onboarding_completed` as the primary reward until `onboarding_started` and completion tracking are repaired.
Guardrails: upload rate, tour skip rate, modal close rate, time-to-upload getting slower, reduced first-download rate.

### Implementation notes

- Restore onboarding behind the experiment assignment layer, not as a single global feature flag.
- Do not optimize for `onboarding_completed`; that can reward overlong onboarding and current telemetry has a start/completion mismatch.
- Keep assignments session-stable and reset after first successful download.
- Sample-image arms are especially useful for visitors without a ready image, but should not replace real upload as the main success metric.
- Segment by upload hesitation. Users who upload immediately should often remain in `no_onboarding` or `first_result_coaching`; users who hesitate can receive stronger guidance.

## Opportunity 6: Pricing Page Layout and Default Selection Bandit

Priority: P1
Primary goal: pricing-page visitor to checkout and purchase
Current surface: `app/[locale]/pricing/PricingPageClient.tsx`, `SubscriptionPlanGrid`, `CreditPackSelector`, `PurchaseModal`

### Candidate arms

| Arm                      | Treatment                                       |
| ------------------------ | ----------------------------------------------- |
| `credits_first`          | Credit packs above subscriptions for free users |
| `subscription_first`     | Subscription comparison first                   |
| `starter_anchor`         | Emphasize $4.99/$9 entry price                  |
| `pro_recommended`        | Keep Professional as recommended                |
| `hobby_recommended`      | Recommend Hobby for personal/project visitors   |
| `regional_savings_badge` | Stronger localized discount framing             |

### Contexts

- source: navbar, pSEO CTA, out-of-credits modal, batch-limit modal, direct
- `pricingRegion`
- device type
- user plan/free credits remaining
- previous model-gate/source attribution

### Reward

Primary: `purchase_confirmed` revenue per pricing-page impression.
Secondary: `checkout_opened`, `checkout_session_created`, selected plan/pack.
Guardrails: lower AOV, increased refund/cancel rate, subscription downgrades.

### Implementation notes

- Keep this separate from the regional price discount bandit. One bandit chooses display/defaults; the existing bandit chooses regional discount.
- For subscriptions, include delayed rewards such as renewal or cancellation, not just first checkout.

## Opportunity 7: Free-Credit and Paywall Threshold Bandit

Priority: P2
Primary goal: balance activation, abuse, and purchase pressure
Current surface: free credits, regional free credit adjustments, guest limits, anti-freeloader/paywall code

### Candidate arms

| Arm                            | Treatment                                            |
| ------------------------------ | ---------------------------------------------------- |
| `low_free_credits`             | Fewer initial credits, earlier purchase prompt       |
| `standard_free_credits`        | Current default                                      |
| `task_complete_credits`        | Enough credits to finish one clear workflow          |
| `regional_low_cost_activation` | More first-session credits in low-converting regions |
| `auth_bonus_credits`           | Extra credits only after signup                      |

### Contexts

- `pricingRegion`
- country/tier/paywall status
- guest vs authenticated
- abuse signals
- upload file size and model tier

### Reward

Primary: activated users who later purchase, revenue per visitor.
Secondary: first upload/download, signup rate.
Guardrails: processing COGS per visitor, repeated free-account abuse, provider cost spikes.

### Implementation notes

- This bandit has direct cost exposure, so start as a conservative contextual experiment.
- Apply hard caps for restricted/paywalled regions and suspicious traffic.
- Attribute cost, not just conversion.

## Opportunity 8: Model Gallery Ordering and Recommendation Bandit

Priority: P2
Primary goal: model selection success, retention, and premium interest
Current surface: `ModelGalleryModal` sorting, featured tiers, filters, search

### Candidate arms

| Arm                       | Treatment                                  |
| ------------------------- | ------------------------------------------ |
| `popular_starting_points` | Existing popular/cheap ordering            |
| `task_category_first`     | Emphasize filters/tasks before model cards |
| `free_success_first`      | Show best free models before premium lock  |
| `premium_preview_first`   | Show premium before/after examples earlier |
| `search_first`            | Search prompt is primary interaction       |

### Contexts

- search query intent
- current tier
- free vs paid
- source: manual, mobile, post-download, first-time auto
- selected image type if available from analysis

### Reward

Primary: process completion after model selection, download, purchase after premium click.
Secondary: model switch, time in gallery, search usage.
Guardrails: gallery close without selection, slower task completion, premium click without checkout.

### Implementation notes

- Distinguish retention reward from purchase reward. A free model recommendation can be a win if it increases successful downloads and repeat visits.
- For premium cards, optimize for purchase-confirmed, not locked-card clicks.

## Opportunity 9: Auth Timing Bandit

Priority: P2
Primary goal: reduce auth friction while preserving account-linked value
Current surface: auth-required modal, post-auth checkout redirect, gallery save, signup CTAs

### Candidate arms

| Arm                      | Treatment                                         |
| ------------------------ | ------------------------------------------------- |
| `auth_before_checkout`   | Current required-auth checkout path               |
| `auth_after_value`       | Delay signup until first download or save         |
| `auth_for_gallery_save`  | Ask auth when saving durable result               |
| `auth_for_bonus_credits` | Offer extra credits for signup after first result |

### Reward

Primary: completed checkout or account creation followed by activation.
Secondary: successful post-auth return and continuation of intended flow.
Guardrails: auth modal abandonment, lost checkout context, lower first download.

### Implementation notes

- Keep checkout paths compliant with Stripe/customer requirements.
- For unauthenticated direct checkout, the key reward is completing the original intent after auth, not merely opening login.

## Opportunity 10: Lifecycle Email/Reactivation Bandit

Priority: P3
Primary goal: bring activated non-buyers back
Current surface: email service/provider infrastructure, engagement and purchase telemetry

### Candidate arms

| Arm                    | Treatment                                             |
| ---------------------- | ----------------------------------------------------- |
| `result_reminder`      | Remind users of saved/upscaled result                 |
| `unused_credits`       | Remind about remaining credits                        |
| `model_recommendation` | Recommend model based on previous task                |
| `discount_followup`    | Offer small first-purchase discount after abandonment |
| `no_email`             | Holdout/control                                       |

### Reward

Primary: return visit, second processing session, first purchase within 7 days.
Secondary: click-through.
Guardrails: unsubscribe, spam complaint, discount cannibalization.

### Implementation notes

- This should be user-stable, not session-stable.
- Always include a no-email holdout; otherwise incremental lift is unknowable.

## Prioritized Rollout Plan

### Phase 1: Shared measurement and ready high-volume bandits

1. Add `experiment_arms` and a generic Thompson Sampling service.
2. Add `experiment_arm_assigned` event and metadata propagation through checkout.
3. Launch **purchase modal layout/default-selection bandit** because the modal-to-checkout leak is measured and the reward window is short.
4. Launch **post-download next-action bandit** because download volume is high and margin risk is low.
5. Restore onboarding as an **onboarding activation bandit** with `no_onboarding` as the holdout control.

### Phase 2: High-intent conversion bandits

1. Launch **model-gate purchase path bandit** with direct small-pack checkout as control.
2. Connect model-gate assignment through checkout metadata and webhook-side `purchase_confirmed`.
3. Add webhook reward attribution for `purchase_confirmed` revenue by experiment arm.

### Phase 3: Discount and pricing bandits

1. Repair engagement-discount CTA-to-checkout tracking and launch **engagement discount bandit** with a no-discount holdout and strict margin caps.
2. Clarify duplicate/partial `checkout_abandoned` counting and launch **checkout rescue bandit**.
3. Launch **pricing page layout/default-selection bandit** independently from regional discount arms.
4. Evaluate AOV, refund rate, and 7-day retention before promoting winners.

### Phase 4: Retention lifecycle

1. Add free-credit/paywall threshold bandit only after cost guardrails are automated.
2. Add lifecycle email bandit with a permanent holdout.

## Measurement Requirements

Every arm should record:

- `experimentKey`
- `armKey`
- `armId`
- `contextKey`
- `assignedAt`
- `surface`
- stable assignment key: session id or user id
- relevant product context: pricing region, source trigger, device type, plan, selected model, selected price id

Reward attribution windows:

- Activation: same session
- Checkout: 24 hours
- Purchase: 7 days, revenue-weighted
- Retention: 1 day and 7 days
- Subscription quality: 30-day cancellation/refund guardrail

Minimum guardrails before price/discount bandits:

- margin floor after all stacked discounts
- refund/cancel tracking
- checkout error segmentation
- no duplicate impression inflation from repeated modal opens
- assignment persisted across auth redirects and hosted Stripe returns

## Key Risks

1. **Optimizing the wrong event**: clicks and modal opens are not enough. Reward should usually be activation, purchase, revenue, or retention.
2. **Discount cannibalization**: rescue and engagement offers can train users to abandon. Use no-discount controls and delayed rescue eligibility.
3. **Stacked discount margin loss**: regional, engagement, and rescue offers can combine. Hard cap final price by product COGS and Stripe fee floor.
4. **Context leakage across auth/checkout**: assignment must survive login, hosted checkout redirects, and webhook attribution.
5. **Low-volume arms**: use contextual grouping and conservative priors; do not split thin traffic into too many arms.

## Recommended First Experiment Specs

### First retention experiment: `post_download_next_action`

Arms:

- `upload_another`
- `save_to_gallery`
- `explore_models`
- `batch_unlock`

Context:

- first-time user
- sample vs upload
- authenticated
- quality tier
- pricing region

Primary reward:

- second upload or process completion in same session.

Delayed reward:

- return visit within 7 days.

### First activation experiment: `onboarding_activation`

Arms:

- `no_onboarding`
- `minimal_progress`
- `sample_prompt_visible`
- `guided_tour_delayed`
- `task_based_model_picker`
- `first_result_coaching`

Context:

- entry page
- device type
- time to first upload attempt
- sample vs own upload
- authenticated
- pricing region

Primary reward:

- `first_upload_completed`, `upscale_completed`, and `image_download`.

Delayed reward:

- second upload/process and return visit within 7 days.

Guardrails:

- lower upload rate, slower time-to-upload, lower first-download rate, high skip/close rate.

### First purchase experiment: `model_gate_purchase_path`

Arms:

- `direct_small_pack` control
- `compact_credit_picker`
- `usage_based_pack`
- `subscription_unlock`

Context:

- clicked model
- source
- pricing region
- authenticated
- device type
- free credits remaining

Primary reward:

- `purchase_confirmed.amount` within 24 hours.

Guardrails:

- checkout error rate
- payment decline rate
- purchase modal abandonment
- refund rate

## Bottom Line

The best new bandit opportunities are clustered around moments where the user has already shown intent: locked model clicks, first result download, high engagement, and checkout exit. The repo already has enough analytics plumbing to support these, but it needs a shared experiment assignment and reward service so future bandits are measured consistently and can optimize for revenue, retention, and margin instead of surface-level clicks.
