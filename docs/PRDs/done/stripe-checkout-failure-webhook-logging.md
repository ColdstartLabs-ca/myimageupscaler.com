# Stripe Checkout Failure Webhook Logging PRD

`Complexity: 2 -> LOW mode`

## Complexity Assessment

```
+1  Touches 1-5 files
+1  External API integration (Stripe webhooks -> Amplitude HTTP API)
=2  LOW
```

## 1. Context

**Problem:** Amplitude shows checkout opens and successful purchases, but Stripe-side session expiry and hard payment failures are not visible enough to explain whether the current checkout drop is abandonment or card/payment failure.

**Files Analyzed:**

- `app/api/webhooks/stripe/route.ts`
- `server/services/stripe-webhook-event-processor.ts`
- `app/api/webhooks/stripe/handlers/payment.handler.ts`
- `app/api/webhooks/stripe/handlers/invoice.handler.ts`
- `app/api/checkout/route.ts`
- `client/hooks/useCheckoutSession.ts`
- `server/analytics/types.ts`
- `server/analytics/index.ts`
- `tests/unit/api/stripe-webhook-event-processor.unit.spec.ts`
- `tests/unit/analytics/payment-telemetry-audit.unit.spec.ts`
- `docs/PRDs/done/checkout-friction-investigation.md`
- `docs/PRDs/analytics-tracking-enhancement.md`

**Current Behavior:**

- Client checkout flow tracks `checkout_opened`, `checkout_session_created`, `checkout_abandoned`, checkout errors, and checkout step events.
- Stripe webhook success path tracks server-side `checkout_completed`, `purchase_confirmed`, and revenue.
- Stripe webhook failure coverage exists for `invoice.payment_failed`, `checkout.session.async_payment_failed`, and `charge.failed`.
- `checkout.session.expired` is not routed by `processStripeWebhookEvent`, so Stripe-expired Checkout Sessions are treated as unhandled.
- `payment_intent.payment_failed` is not routed, so some hard card/payment failures may only be visible if Stripe also sends `charge.failed` with enough profile linkage.

## Integration Points

**How will this feature be reached?**

- [x] Entry point identified: Stripe webhook route `POST /api/webhooks/stripe`
- [x] Caller file identified: `app/api/webhooks/stripe/route.ts` calls `processStripeWebhookEvent(event)`
- [x] Registration/wiring needed: add event type cases in `server/services/stripe-webhook-event-processor.ts`

**Is this user-facing?**

- [x] NO -> Internal/background analytics feature triggered by Stripe webhooks.

**Full user flow:**

1. User opens checkout from the app.
2. `/api/checkout` creates a Stripe Checkout Session with user, product, region, and Amplitude stitching metadata.
3. User either leaves checkout until Stripe expires the session, or payment fails inside Stripe.
4. Stripe sends `checkout.session.expired` or `payment_intent.payment_failed` to `/api/webhooks/stripe`.
5. Webhook handler emits Amplitude events that distinguish abandoned sessions from hard failures.

## 2. Solution

**Approach:**

- Reuse existing analytics names where possible instead of creating a parallel taxonomy.
- Track `checkout.session.expired` as `checkout_abandoned` with webhook-specific context.
- Track `payment_intent.payment_failed` as `payment_failed` with normalized decline/error details.
- Preserve Amplitude stitching by reusing `amplitude_device_id` and `amplitude_session_id` metadata already sent from `client/hooks/useCheckoutSession.ts`.
- Ensure one-time checkout PaymentIntent metadata receives checkout metadata if Stripe does not already inherit enough metadata for `payment_intent.payment_failed`.

**Key Decisions:**

- [x] Use existing `checkout_abandoned` for Stripe session expiry. This lets Amplitude compare client-close abandonment and Stripe-expired abandonment in the same funnel while filtering by `source: 'stripe_webhook'`.
- [x] Use existing `payment_failed` for hard failures. The event already exists and is used by invoice and charge failure handlers.
- [x] Do not add database tables. This is observability only.
- [x] Do not throw webhook errors when analytics delivery fails. Use fire-and-forget logging so Stripe retries are not caused by Amplitude outages.

**Data Changes:** None.

## 3. Execution Phases

#### Phase 1: Stripe Failure Visibility - Amplitude can split checkout drop-off into expired sessions vs. payment failures

**Files (max 5):**

- `server/services/stripe-webhook-event-processor.ts` - route `checkout.session.expired` and `payment_intent.payment_failed`
- `app/api/webhooks/stripe/handlers/payment.handler.ts` - add handlers for Checkout Session expiry and PaymentIntent failure
- `app/api/checkout/route.ts` - propagate custom checkout metadata to `payment_intent_data.metadata` for payment-mode sessions if needed
- `server/analytics/types.ts` - widen/define event property types for webhook-originated abandonment/failure context
- `tests/unit/api/stripe-webhook-event-processor.unit.spec.ts` and focused analytics handler tests - prove routing and event payloads

**Implementation:**

- [ ] Add webhook event types to `StripeWebhookEventType`:
  - `checkout.session.expired`
  - `payment_intent.payment_failed`
- [ ] Add processor cases:
  - `checkout.session.expired` -> `PaymentHandler.handleCheckoutSessionExpired(session)`
  - `payment_intent.payment_failed` -> `PaymentHandler.handlePaymentIntentFailed(paymentIntent)`
- [ ] Implement `handleCheckoutSessionExpired(session)`:
  - Resolve user from session metadata, `client_reference_id`, or customer profile using existing `resolveCheckoutSessionUserId`.
  - Build Amplitude options with existing `buildAmplitudeOpts`.
  - Emit `checkout_abandoned` with:
    - `source: 'stripe_webhook'`
    - `method: 'session_expired'`
    - `step: 'stripe_embed'`
    - `priceId: session.metadata?.price_id || 'unknown'`
    - `plan` derived from metadata where possible, otherwise `'free'`
    - `pricingRegion: session.metadata?.pricing_region || 'standard'`
    - `selectedType`: `subscription` or `credit_pack`
    - `selectedKey`: `plan_key` or `pack_key`
    - `sessionId`, `stripeCheckoutSessionId`, `stripeCustomerId`
    - `checkoutOpened: true`
    - `timeSpentMs`: `(session.expires_at - session.created) * 1000` when both are present, otherwise `0`
  - If user resolution fails, log a warning and emit no Amplitude event rather than failing the webhook.
- [ ] Implement `handlePaymentIntentFailed(paymentIntent)`:
  - Resolve user from `paymentIntent.metadata.user_id`, `paymentIntent.customer` -> profile lookup, or skip with warning if no user can be linked.
  - Emit `payment_failed` with:
    - `priceId`, `plan`, `customerId`, `attemptCount: 1`
    - `stripePaymentIntentId`
    - `stripeCustomerId`
    - `amount`, `currency`
    - `purchaseType` from metadata `type` (`plan` -> `subscription`, `pack` -> `credit_pack`)
    - `decline_reason` from `last_payment_error.decline_code`, `last_payment_error.code`, or `'generic'`
    - `errorType`: map `insufficient_funds`, `expired_card`, `card_declined`, else `generic`
    - sanitized `errorMessage`
  - Use metadata `amplitude_device_id` and `amplitude_session_id` when present.
- [ ] In `/api/checkout`, for `mode: 'payment'`, set `sessionParams.payment_intent_data.metadata` to the same safe checkout metadata needed by failure handlers:
  - `user_id`, `price_id`, `pricing_region`, `type`, `pack_key`, `plan_key` when present
  - `amplitude_device_id`, `amplitude_session_id`
  - checkout attribution metadata already accepted by `sanitizeCustomCheckoutMetadata`
- [ ] Keep webhook analytics fire-and-forget: `trackServerEvent(...).catch(...)`.
- [ ] Avoid direct `process.env`; continue using `serverEnv`.

**Tests Required:**

| Test File                                                       | Test Name                                                                                | Assertion                                                                                                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/api/stripe-webhook-event-processor.unit.spec.ts`    | `should route checkout.session.expired to PaymentHandler.handleCheckoutSessionExpired`   | Processor returns `{ handled: true }` and calls the new handler with `event.data.object`                                              |
| `tests/unit/api/stripe-webhook-event-processor.unit.spec.ts`    | `should route payment_intent.payment_failed to PaymentHandler.handlePaymentIntentFailed` | Processor returns `{ handled: true }` and calls the new handler with `event.data.object`                                              |
| `tests/unit/api/payment-handler-failure-analytics.unit.spec.ts` | `should track checkout_abandoned when checkout session expires`                          | `trackServerEvent('checkout_abandoned', expect.objectContaining({ source: 'stripe_webhook', method: 'session_expired', sessionId }))` |
| `tests/unit/api/payment-handler-failure-analytics.unit.spec.ts` | `should track payment_failed when payment intent fails`                                  | `trackServerEvent('payment_failed', expect.objectContaining({ stripePaymentIntentId, errorType, decline_reason }))`                   |
| `tests/unit/api/payment-handler-failure-analytics.unit.spec.ts` | `should not throw when expired session cannot resolve a user`                            | Handler resolves without throwing and logs a warning                                                                                  |
| `tests/unit/api/checkout-payment-intent-metadata.unit.spec.ts`  | `should copy checkout attribution metadata to payment_intent_data for payment sessions`  | Stripe session create params include required metadata on `payment_intent_data.metadata`                                              |

**User Verification:**

- Action: Use Stripe CLI to send a `checkout.session.expired` event with Checkout Session metadata.
- Expected: Webhook returns 200 and Amplitude receives `checkout_abandoned` with `source=stripe_webhook`.
- Action: Use Stripe CLI or a test card decline to produce `payment_intent.payment_failed`.
- Expected: Webhook returns 200 and Amplitude receives `payment_failed` with decline details and Stripe correlation IDs.

## 4. Verification Strategy

**Automated:**

- `yarn test tests/unit/api/stripe-webhook-event-processor.unit.spec.ts`
- `yarn test tests/unit/api/payment-handler-failure-analytics.unit.spec.ts`
- `yarn test tests/unit/api/checkout-payment-intent-metadata.unit.spec.ts`
- `yarn verify`

**Manual / External Integration:**

```bash
stripe trigger checkout.session.expired
stripe trigger payment_intent.payment_failed
```

Then confirm webhook 200 responses and Amplitude event arrival for:

- `checkout_abandoned` where `source = stripe_webhook`
- `payment_failed` where `stripePaymentIntentId` is present

## 5. Acceptance Criteria

- [ ] `checkout.session.expired` is handled, not reported as an unhandled webhook type.
- [ ] `payment_intent.payment_failed` is handled, not reported as an unhandled webhook type.
- [ ] Expired Checkout Sessions emit `checkout_abandoned` with enough metadata to segment by plan/pack, region, trigger, session ID, and Stripe customer/session IDs.
- [ ] Failed PaymentIntents emit `payment_failed` with decline reason, normalized error type, amount, currency, user linkage, and Stripe PaymentIntent ID.
- [ ] Analytics failures do not cause Stripe webhook retries.
- [ ] Unit tests cover routing, payload shape, user-resolution fallback, and PaymentIntent metadata propagation.
- [ ] `yarn verify` passes.

## 6. Rollout Notes

- After deploy, build an Amplitude split for:
  - `checkout_opened` -> `purchase_confirmed`
  - `checkout_opened` -> `checkout_abandoned` filtered to `source=stripe_webhook`
  - `checkout_opened` -> `payment_failed`
- If the 75% drop is mostly `checkout_abandoned`, prioritize checkout UX/recovery.
- If it is mostly `payment_failed`, prioritize payment method support, pricing/region fit, and decline-specific messaging.
