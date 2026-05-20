# Payment Conversion Regression Git Investigation

Date: 2026-05-20  
Incident window: abandonment surge starts week of 2026-05-11  
Primary symptom from Amplitude: upgrade clicks rose, but downstream checkout sessions and purchase confirmations did not rise with them.

Update: Amplitude cuts reviewed on 2026-05-20 confirm that the largest visible `checkout_abandoned` spike is mostly purchase-picker dismissal telemetry, while the highest-risk business issue is the `model_gate -> checkout_direct` path producing no observable downstream checkout events.

## Executive Summary

The git history and Amplitude data support a checkout-flow regression around the model gallery and `PurchaseModal` work on 2026-05-11. I do not see evidence of a broad Stripe outage in the code. The issue now separates into two parts:

1. The apparent abandonment surge is mostly measurement inflation: post-May-11 `checkout_abandoned` is dominated by users dismissing `PurchaseModal` before Stripe opens.
2. The real revenue risk is that high-intent `model_gate` clicks are not reliably reaching observable checkout sessions.

Key conclusions:

1. `b91c7c73` / `e8ad726c` on 2026-05-11 changed the model-gate path and redesigned the model picker and purchase modal at the same time the abandonment curve inflected.
2. The 2026-05-11 model-gate change temporarily routed locked-model clicks to the full purchase picker instead of direct checkout.
3. Amplitude confirms 214 of roughly 229 post-May-11 abandonment events are `checkoutOpened=False` purchase modal dismissals, not Stripe drop-offs.
4. Amplitude also confirms 25% of `model_gate` upgrade clicks still route to `upgrade_plan_modal` instead of `checkout_direct`.
5. The most serious finding is that 124 `model_gate -> checkout_direct` clicks produced 0 `checkout_opened` events and 0 purchases in the reviewed funnel.
6. `purchase_modal_opened` never appears with `trigger = model_gate` in the 289 reviewed modal opens, so model-gate users are either bypassing the modal as intended or failing before observable checkout instrumentation.
7. Fixed locally on 2026-05-20: checkout session metadata now carries `uiMode`, trigger, originating model, attribution chain, and price id into webhook-side `purchase_confirmed`.

My read: the recent PurchaseModal simplification is directionally useful but not sufficient by itself. The next required fix is to prove and harden the direct model-gate checkout path end to end: click, modal/render, session requested, session created, hosted redirect or embedded mount, and purchase confirmation attribution.

## Amplitude Findings Added 2026-05-20

| Cut                                                               | Result                                                                                                                                                          | Interpretation                                                                                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout_abandoned` by source / step / `checkoutOpened` / method | 214 of roughly 229 post-May-11 abandonments were `purchase_modal` / `plan_selection` / `checkoutOpened=False`; only 15 were actual `checkout_modal` abandonment | The headline abandonment spike is mostly telemetry inflation, not Stripe checkout abandonment.                                                                          |
| `upgrade_prompt_clicked` by trigger / destination / model         | `model_gate -> checkout_direct`: 124 clicks; `model_gate -> upgrade_plan_modal`: 37 clicks                                                                      | Direct checkout was restored for most model gates, but 25% still take the modal fallback.                                                                               |
| `model_gate` funnel                                               | 146 upgrade clicks, 2 `purchase_modal_opened`, 0 `checkout_opened`, 0 purchases                                                                                 | Critical: direct checkout is not producing observable checkout entry. This may be a rendering failure, session creation failure, auth wall gap, or instrumentation gap. |
| Hosted vs embedded checkout                                       | 19 embedded sessions, 10 hosted sessions, 0 purchases with `uiMode`                                                                                             | Fixed locally on 2026-05-20 by preserving checkout metadata into webhook-side `purchase_confirmed`; verify after deploy.                                                |
| `purchase_modal_opened` by trigger / selection                    | 0 `model_gate` modal opens out of 289; `selectedType` and `selectedKey` null                                                                                    | Fixed locally on 2026-05-20 by adding initial tab, selected item type/key, price id, and credit-lock state to modal-open analytics; verify after deploy.                |

## Current Local Fixes Reviewed

Local uncommitted changes partially address the friction findings:

- `PurchaseModal` now defaults to the small starter credit pack instead of the popular medium pack.
- Credit packs and subscriptions are separated behind a segmented control instead of being shown as one long combined picker.
- Purchase modal copy now aligns better with the $4.99 starter path.
- `purchase_modal_opened` now includes the initial tab, selected item type/key, price id, and credit-lock state so modal-open analytics are no longer blind to the default selection.
- Pre-checkout picker dismissals now emit `purchase_modal_abandoned` instead of inflating `checkout_abandoned`; the payload includes `selectedType` and `selectedKey` when available.
- Pricing-page exits before checkout now emit `pricing_page_abandoned`, so generic
  `checkout_abandoned` is reserved for users who actually reached checkout.
- `ModelGalleryModal` layout was widened, which is visual polish but does not directly address checkout loss.
- Direct model-gate checkout is now instrumented with `checkout_direct_started`, `checkout_modal_mounted`, checkout-session request/create events, typed `checkout_error` failure points, and webhook purchase attribution.
- Unauthenticated direct model-gate checkout now goes through the auth-required flow instead of
  mounting `CheckoutModal` and failing session creation with `User not authenticated`; the
  post-auth return keeps the direct-checkout prefill context.

These changes are enough to harden the local code path, but production monitoring is still required after deploy. The Amplitude critical path must show `model_gate -> checkout_direct` producing `checkout_opened`, `checkout_session_requested`, and `checkout_session_created`.

## Relevant Timeline

| Date             | Commit     | Area                                        | Why it matters                                                                                                                                                |
| ---------------- | ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-09       | `f37b6a79` | New premium models, variable credit pricing | Adds Clarity Pro, Recraft Crisp, Nano Banana 2, and variable/high-cost model messaging. Could increase price/credit shock but precedes the sharp May 11 jump. |
| 2026-05-11 09:58 | `b91c7c73` | Model gallery upgrade flow                  | Large model gallery rewrite. Tests changed from direct checkout expectations to opening the upgrade modal.                                                    |
| 2026-05-11 17:48 | `e8ad726c` | Model gallery + `PurchaseModal`             | Large UX rewrite of both model selector and purchase picker. This is the highest-risk commit.                                                                 |
| 2026-05-11 17:56 | `e0befdf5` | `PurchaseModal` cleanup                     | Mostly formatting/import cleanup after the large purchase modal rewrite.                                                                                      |
| 2026-05-13       | `eb9f8357` | `PurchaseModal` tests/accessibility         | E2E test was updated to expect `PurchaseModal` after locked model click, not checkout. Confirms behavior at that point.                                       |
| 2026-05-14       | `04577aa8` | Direct checkout restoration + telemetry     | Restores direct checkout handling and adds more checkout/session telemetry.                                                                                   |

## Findings

### 1. High confidence: May 11 inserted an extra purchase-picker step into model-gate checkout

Before `04577aa8`, the May 11 model gallery path sent locked model clicks to `onUpgrade()`, which opens `PurchaseModal`, rather than `onUpgradeDirect()`.

Evidence:

- `b91c7c73` changed `ModelGalleryModal.upgrade-direct.unit.spec.tsx` expectations from `onUpgradeDirect` to `onUpgrade`.
- `eb9f8357` updated the E2E test to expect `[data-testid="purchase-modal"]` after clicking a locked tier.
- Current code has a restored direct path at `client/components/features/workspace/ModelGalleryModal.tsx:306`: destination is `checkout_direct` when `onUpgradeDirect` exists, then `resolveCheapestRegionalPlan(...)` and `onUpgradeDirect(...)` run at `client/components/features/workspace/ModelGalleryModal.tsx:317`.

Why this hurts:

- The user clicked a locked premium model. That is high intent and already implies willingness to unlock access.
- Sending them to a purchase picker makes them re-decide between packs/plans before payment.
- This matches the reported primary leak: `upgrade_prompt_clicked` to `checkout_opened`.

Potential fix:

- Keep locked model clicks on direct checkout by default.
- Use the small credit pack as the direct checkout default, matching the "From $4.99" promise.
- Keep a small "change option" affordance, but do not force the full purchase picker first.

### 2. High confidence: `PurchaseModal` became too dense and likely increased plan-selection abandonment

The pre-May-11 `PurchaseModal` used tabs: credits first, subscription second. The post-May-11 regression version rendered all credit packs and all subscription plans together, plus a large illustration, badges, expanded metadata, a support link, and a fixed CTA.

Evidence:

- The regression version defaulted to the popular credit pack rather than the starter pack.
- The regression version rendered credit packs and subscriptions in one combined scroll surface.
- Checkout only opened after `handleCTA` fired and set `showCheckoutModal`.
- Current local changes partially remediate this by defaulting to the starter pack and separating credits/subscriptions behind a segmented control.

Why this hurts:

- Users who came from "Get credits" or a locked model now see more choices than necessary.
- The default selected pack is the medium pack (`popular`) rather than the lowest-friction $4.99 pack.
- The final checkout CTA may be below the fold on smaller viewports, even though it is fixed within the modal container.

Potential fix:

- Keep `PurchaseModal` on a simpler one-decision layout.
- Split intent:
  - `model_gate`: direct small credit pack checkout.
  - `out_of_credits`: simple credit-pack purchase, small pack selected by default.
  - `billing/pricing`: full plan comparison.
- If retaining the combined modal, default to small pack for first-time/free users and place the primary CTA immediately after the selected option.

### 3. Medium-high confidence: abandonment telemetry became broader after May 14

`04577aa8` added `purchase_modal_opened` and started emitting `checkout_abandoned` when the purchase modal is dismissed before Stripe checkout is opened. This local fix now emits `purchase_modal_abandoned` for that pre-checkout picker dismissal instead.

Evidence:

- `purchase_modal_abandoned` is emitted from `PurchaseModal.handleDismiss` when `showCheckoutModal` is false at `client/components/stripe/PurchaseModal.tsx`.
- The event payload explicitly sets `step: 'plan_selection'`, `source: 'purchase_modal'`, and `checkoutOpened: false`.

Why this matters:

- This is useful telemetry, but it changes the meaning of `checkout_abandoned`.
- A post-May-14 spike may partly reflect newly counted purchase-modal dismissals, not only users who reached Stripe and abandoned.
- The May 11 surge still matters because the flow change happened before this telemetry change.

Potential fix:

- Split events:
  - `purchase_modal_abandoned` for pre-checkout/picker abandonment.
  - `checkout_abandoned` only after `checkout_opened` or `checkout_session_requested`.
- Keep `checkoutOpened` in Amplitude, but update dashboards to segment by it.

### 4. Medium confidence: direct checkout restoration may not cover all upgrade entry points

The active workspace passes `onUpgradeDirect` into `ModelGalleryModal`, and `handleUpgradeDirect` opens `CheckoutModal` directly.

Evidence:

- `Workspace` passes `onUpgradeDirect={handleUpgradeDirect}` at `client/components/features/workspace/Workspace.tsx:768`.
- `handleUpgradeDirect` tracks `checkout_opened` and sets `directCheckoutPriceId` at `client/components/features/workspace/Workspace.tsx:432`.
- `CheckoutModal` renders for `directCheckoutPriceId` at `client/components/features/workspace/Workspace.tsx:846`.
- Local regression tests now cover the direct handler call, direct checkout analytics, and `CheckoutModal` rendering after a model-gate direct click.

Risk:

- This direct path depends on `onUpgradeDirect` being wired at every model-gate entry point.
- If any route/page opens `ModelGalleryModal` without `onUpgradeDirect`, it now emits `checkout_direct_unavailable` before falling back to `PurchaseModal`, so the fallback is observable instead of silent.
- The empty-state workspace also renders a direct checkout modal, but it is worth validating both empty and active states.

Potential fix:

- Add regression tests for every model-gate entry:
  - active workspace model selector
  - empty workspace / sample path if applicable
  - post-download explore gallery
  - mobile quality selector
- Assert locked premium click results in `CheckoutModal`, not `PurchaseModal`, for high-intent model gates.

### 5. Medium confidence: mobile checkout behavior changed the surface from embedded to hosted

The current checkout hook redirects mobile users to hosted Stripe checkout.

Evidence:

- `useCheckoutSession` sets `checkoutUiMode = isMobileViewport() ? 'hosted' : 'embedded'` at `client/hooks/useCheckoutSession.ts:175`.
- For hosted mode it creates a hosted session and assigns `window.location.href` at `client/hooks/useCheckoutSession.ts:203`.

Why this may matter:

- Hosted Stripe is usually better on mobile than embedded, so this is not obviously bad.
- But dashboard funnels that expect embedded `checkout_step_viewed` or in-app completion may undercount/overcount if hosted redirect return paths are not segmented.

Potential fix:

- Segment conversion by `checkout_session_created.uiMode`.
- Confirm hosted mobile sessions have matching success-return and `purchase_confirmed` attribution.

## Recommended Fix Plan

### Immediate rollback-style fixes

1. Keep direct checkout for locked model clicks.
   - The current code has this restored. Confirm it is deployed.
   - E2E assertion added locally on 2026-05-20: clicking a locked model opens
     `CheckoutModal` directly and does not show `PurchaseModal`.

2. Stop sending pre-checkout picker dismissals as generic `checkout_abandoned`.
   - Rename or duplicate as `purchase_modal_abandoned`.
   - Keep `checkout_abandoned` for actual checkout sessions.

3. Simplify `PurchaseModal` for high-intent flows.
   - Partially addressed locally by defaulting to the starter pack and separating credits/subscriptions.
   - For `trigger === 'model_gate'`, still prefer direct checkout over any purchase picker.
   - If the direct path is unavailable, show a compact credit-pack-only fallback with the small pack selected.

4. Make CTA/price consistency explicit.
   - "From $4.99" should lead to the small credit pack checkout.
   - Do not default first-time model-gate users to the $14.99 popular pack.

### Follow-up product fixes

1. Reintroduce tabs or segmented controls in `PurchaseModal`.
   - Partially addressed locally with a segmented control.
   - Keep default on "Credits".
   - Put subscriptions behind a clear secondary tab or link.

2. Add trigger-specific defaults.
   - Done locally on 2026-05-20.
   - `model_gate`: small pack.
   - `out_of_credits`: smallest pack that covers the selected/pending job if known.
   - `batch_limit`: subscription if batch limit is the blocked feature.

3. Add funnel guardrail tests.
   - Done locally on 2026-05-20.
   - `upgrade_prompt_clicked` -> `checkout_opened` should happen on direct paths.
   - `checkout_session_requested` should follow `checkout_opened`.
   - Mobile hosted checkout should emit `checkout_session_created` with `uiMode: hosted`.

## Required Follow-up After Current Fixes

The local PurchaseModal changes are helpful, but they should not be treated as the complete fix. The incident should stay open until these are done:

1. Add direct-checkout regression coverage. Done locally on 2026-05-20.
   - Test every model-gate entry point that can emit `upgrade_prompt_clicked` with `trigger = model_gate`.
   - Workspace regression coverage now includes desktop/sidebar model selection, post-download
     explore gallery, and mobile quality selector paths.
   - Assert locked model click calls the direct checkout handler when available.
   - Assert `checkout_opened` fires with `source = direct_checkout`, `trigger = model_gate`, and `originatingModel`.
   - Assert `CheckoutModal` renders after the click.

2. Instrument direct checkout failure points. Done locally on 2026-05-20.
   - Emit an event when `directCheckoutPriceId` is set.
   - Emit an event when `CheckoutModal` mounts with that price id.
   - Emit a typed error event if `useCheckoutSession` returns early because Stripe is not configured, region is still loading too long, no hosted URL is returned, or no embedded `clientSecret` is returned.
   - Include `trigger`, `originatingModel`, `attributionChain`, `uiMode`, `priceId`, and authenticated state on these events.
   - Unauthenticated direct checkout now emits `checkout_auth_required`, stores the checkout
     intent for return, and avoids opening Stripe checkout until after authentication.

3. Fix remaining modal fallback routes. Done locally on 2026-05-20.
   - Investigate the 37 `model_gate -> upgrade_plan_modal` clicks and identify which component/page lacks `onUpgradeDirect`.
   - Do not allow a high-intent locked-model gate to silently fall back to the full purchase picker unless checkout cannot be opened.

4. Rename abandonment events. Done locally on 2026-05-20.
   - Keep `checkout_abandoned` for users who reached checkout.
   - Add or prefer `purchase_modal_abandoned` for `checkoutOpened = false` picker dismissals.
   - Use `pricing_page_abandoned` for pricing page exits before checkout starts.
   - Update dashboards so the health monitor does not treat picker dismissals as Stripe abandonment.

5. Preserve checkout attribution through purchase confirmation. Done locally on 2026-05-20.
   - Store `uiMode`, `trigger`, `originatingModel`, and `priceId` in checkout session metadata or local return context.
   - Ensure `purchase_confirmed` receives those properties from webhook or return-page confirmation.

6. Watch production after deploy. Still required after deployment.
   - Within 24 hours, verify `model_gate -> checkout_direct` produces `checkout_opened`, `checkout_session_requested`, and `checkout_session_created`.
   - The immediate success metric is not purchases alone; first prove the event chain is no longer breaking before checkout.
   - This is a manual Amplitude review after deploy and traffic, not a deploy blocker.

## Bottom Line

The main regression candidate remains the May 11 combination of model-gallery flow changes and the new `PurchaseModal`, but Amplitude refines the priority.

The PurchaseModal simplification should reduce friction and make the `$4.99` path clearer, but it does not by itself fix the critical loss. The highest-priority work is to harden and verify `model_gate -> checkout_direct` until those clicks reliably produce `checkout_opened` and `checkout_session_created`. After that, clean up abandonment naming and purchase-confirmed attribution so dashboards distinguish "picker abandoned" from "Stripe checkout abandoned."
