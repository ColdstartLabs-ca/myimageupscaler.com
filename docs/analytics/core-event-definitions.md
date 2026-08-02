# Core Amplitude Event Definitions

Status: repository contract for PRD section 6. The local validator is
`scripts/validate-core-amplitude-schema.ts`.

## Evidence and validation state

This document is based on repository evidence only:

- Canonical KPI metadata: `server/analytics/coreKpiDefinitions.ts`.
- Event semantics and property names: PRD section 6 in
  `docs/PRDs/revenue-conversion-retention-and-telemetry-trust.md`.
- Property types, examples, and alternate-required rules: the local schema
  document exported by `scripts/validate-core-amplitude-schema.ts`.

Live Amplitude Data validation has not been run. No event is marked official
from this repository-only artifact, and no claim is made about current
production event delivery, invalid-property counts, or the seven-day
observation window. Run the validator against a local, redacted export when
one is available; it does not call Amplitude itself.

The corrected telemetry release annotation is `2026-08-01`. Metrics before
that release remain an unreliable pre-release interval and must not be silently
combined with corrected KPI data.

## Contract rules

- Event names are `snake_case`; property names are `camelCase`.
- `amountCents` is an integer number of cents. `currency` is lowercase ISO
  currency. `$revenue` is the Amplitude Revenue value in dollars.
- `identifier` means a stable correlation key, not an email address. Examples
  below are synthetic and contain no production identifiers.
- UTM values may be `null`; `attributionAvailable=false` distinguishes missing
  capture from direct traffic.
- `purchase_confirmed` requires at least one of
  `stripeCheckoutSessionId` or `invoiceId`. The canonical KPI module lists
  both as optional because payment paths vary; the PRD's either/or rule is
  enforced by `requiredAnyOf` in the local schema.
- Cancellation reasons are allowlisted. Free text, raw URLs, filenames,
  image data, stack traces, card data, and secrets are not event properties.

## Event catalog

| Event                           | Category     | Owner     | Status | KPI role                | Source                                           | Meaning                                                                  |
| ------------------------------- | ------------ | --------- | ------ | ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `account_created`               | acquisition  | Growth    | active | acquisition denominator | `app/api/users/setup/route.ts`                   | First successful account setup.                                          |
| `monetization_surface_shown`    | monetization | Growth    | active | CTR denominator         | client monetization surfaces                     | A unique eligible user can see a purchase CTA.                           |
| `monetization_surface_clicked`  | monetization | Growth    | active | CTR numerator           | client monetization surfaces                     | User activates a purchase CTA.                                           |
| `plan_selected`                 | checkout     | Billing   | active | offer selection         | client checkout entry                            | User selects a subscription or credit pack.                              |
| `checkout_opened`               | checkout     | Billing   | active | checkout start          | client checkout flow                             | Stripe checkout is requested for a selected offer.                       |
| `checkout_error`                | checkout     | Billing   | active | checkout friction       | client checkout flow                             | Client checkout cannot load, continue, or complete.                      |
| `image_upscaled`                | activation   | Platform  | active | activation / usage      | `app/api/upscale/route.ts` and client processors | User receives a successful processed result.                             |
| `processing_failed`             | processing   | Platform  | active | processing health       | `app/api/upscale/route.ts`                       | Processing ends without a delivered result.                              |
| `checkout_completed`            | checkout     | Billing   | active | checkout funnel only    | Stripe checkout webhook                          | Checkout reports completion; payment may still be pending.               |
| `purchase_confirmed`            | billing      | Billing   | active | purchase conversion     | Stripe payment / invoice webhook                 | Successful initial charge is server-confirmed.                           |
| `revenue_received`              | billing      | Billing   | active | recognized revenue      | Stripe payment / invoice webhook                 | Successful initial or recurring charge represented in Amplitude Revenue. |
| `subscription_created`          | billing      | Billing   | active | new subscriptions       | subscription webhook                             | Subscription reaches accepted `active` or `trialing` state.              |
| `subscription_renewed`          | billing      | Billing   | active | renewal health          | invoice payment webhook                          | Paid subscription-cycle invoice is recognized.                           |
| `subscription_cancel_scheduled` | retention    | Retention | active | gross churn intent      | subscription update webhook                      | Cancellation is scheduled for period end.                                |
| `subscription_cancel_reversed`  | retention    | Retention | active | cancellation recovery   | subscription update webhook                      | Scheduled cancellation is reversed before termination.                   |
| `subscription_canceled`         | retention    | Retention | active | effective churn         | subscription deleted webhook                     | Subscription access has ended.                                           |
| `payment_failed`                | billing      | Billing   | active | payment health          | Stripe payment / invoice webhook                 | Stripe confirms a failed charge or invoice payment.                      |
| `payment_recovery_started`      | recovery     | Recovery  | active | recovery funnel         | recovery client flow                             | Eligible user opens a payment-recovery path.                             |
| `payment_recovered`             | recovery     | Recovery  | active | recovered revenue       | Stripe payment / invoice webhook                 | Previously failed payment later succeeds.                                |

## Required and optional property definitions

Notation: `string`, `integer`, `number`, `boolean`, `identifier`, and
`timestamp` are the local schema types. A `?` means nullable. Every property
shown as required is also required in the event example.

| Event                           | Required properties                                                                                                                                                                                      | Optional properties                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `account_created`               | `method:string`, `pricingRegion:string`, `utmSource:string?`, `utmMedium:string?`, `utmCampaign:string?`, `attributionAvailable:boolean`                                                                 | none                                                                                      |
| `monetization_surface_shown`    | `surface:string`, `trigger:string`, `offerType:string`, `priceId:identifier`, `priceCents:integer`, `pricingRegion:string`, `funnelAttemptId:identifier`                                                 | `experimentAssignmentKey:identifier`                                                      |
| `monetization_surface_clicked`  | `surface:string`, `trigger:string`, `cta:string`, `destination:string`, `funnelAttemptId:identifier`                                                                                                     | `experimentAssignmentKey:identifier`                                                      |
| `plan_selected`                 | `purchaseType:string`, `planOrPack:string`, `priceId:identifier`, `priceCents:integer`, `pricingRegion:string`, `funnelAttemptId:identifier`                                                             | none                                                                                      |
| `checkout_opened`               | `purchaseType:string`, `priceId:identifier`, `entrySurface:string`, `trigger:string`, `funnelAttemptId:identifier`, `uiMode:string`                                                                      | none                                                                                      |
| `checkout_error`                | `errorType:string`, `failurePoint:string`, `priceId:identifier`, `uiMode:string`, `funnelAttemptId:identifier`, `retryable:boolean`                                                                      | none                                                                                      |
| `image_upscaled`                | `qualityTier:string`, `scaleFactor:number`, `inputWidth:integer`, `inputHeight:integer`, `outputWidth:integer`, `outputHeight:integer`, `fileType:string`, `fileSizeBucket:string`, `durationMs:integer` | none                                                                                      |
| `processing_failed`             | `errorType:string`, `reason:string`, `provider:string`, `qualityTier:string`, `retryable:boolean`, `durationMs:integer`, `requestId:identifier`                                                          | none                                                                                      |
| `checkout_completed`            | `purchaseType:string`, `sessionId:identifier`, `amountCents:integer`, `currency:string`, `paymentStatus:string`, `pricingRegion:string`                                                                  | none                                                                                      |
| `purchase_confirmed`            | `purchaseType:string`, `amountCents:integer`, `currency:string`, `priceId:identifier`, and `stripeCheckoutSessionId:identifier` **or** `invoiceId:identifier`                                            | `stripeCheckoutSessionId:identifier`, `invoiceId:identifier`, `sourceObjectId:identifier` |
| `revenue_received`              | `$revenue:number`, `$productId:identifier`, `$quantity:integer`, `$revenueType:string`, `amountCents:integer`, `currency:string`, `sourceObjectId:identifier`                                            | none                                                                                      |
| `subscription_created`          | `plan:string`, `amountCents:integer`, `currency:string`, `billingInterval:string`, `status:string`, `subscriptionId:identifier`                                                                          | none                                                                                      |
| `subscription_renewed`          | `plan:string`, `amountCents:integer`, `currency:string`, `subscriptionId:identifier`, `invoiceId:identifier`, `creditsAdded:integer`                                                                     | none                                                                                      |
| `subscription_cancel_scheduled` | `plan:string`, `subscriptionId:identifier`, `effectiveAt:timestamp`, `reasonCategory:string`, `reasonSource:string`                                                                                      | none                                                                                      |
| `subscription_cancel_reversed`  | `plan:string`, `subscriptionId:identifier`, `reversedAt:timestamp`                                                                                                                                       | none                                                                                      |
| `subscription_canceled`         | `plan:string`, `subscriptionId:identifier`, `effectiveAt:timestamp`, `reasonCategory:string`, `reasonSource:string`                                                                                      | none                                                                                      |
| `payment_failed`                | `errorType:string`, `attemptCount:integer`, `customerId:identifier`, `sourceObjectId:identifier`                                                                                                         | none                                                                                      |
| `payment_recovery_started`      | `purchaseType:string`, `failureType:string`, `recoveryChannel:string`, `funnelAttemptId:identifier`                                                                                                      | none                                                                                      |
| `payment_recovered`             | `purchaseType:string`, `amountCents:integer`, `currency:string`, `sourceObjectId:identifier`, `originalFailureObjectId:identifier`, `recoveryChannel:string`                                             | none                                                                                      |

## Synthetic examples

These examples are the values represented by the local schema's `example`
objects. They are documentation fixtures, not production observations. Required
properties must appear in the event example; optional properties may be shown
when useful but are not required for validation.

| Event                           | Example properties                                                                                                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_created`               | `{ "method": "email", "pricingRegion": "standard", "utmSource": null, "utmMedium": null, "utmCampaign": null, "attributionAvailable": true }`                                                                                                      |
| `monetization_surface_shown`    | `{ "surface": "credit_wall", "trigger": "out_of_credits", "offerType": "credit_pack", "priceId": "price_example", "priceCents": 499, "pricingRegion": "standard", "funnelAttemptId": "funnel_example", "experimentAssignmentKey": "arm_example" }` |
| `monetization_surface_clicked`  | `{ "surface": "credit_wall", "trigger": "out_of_credits", "cta": "buy_credits", "destination": "checkout_direct", "funnelAttemptId": "funnel_example", "experimentAssignmentKey": "arm_example" }`                                                 |
| `plan_selected`                 | `{ "purchaseType": "credit_pack", "planOrPack": "starter_pack", "priceId": "price_example", "priceCents": 499, "pricingRegion": "standard", "funnelAttemptId": "funnel_example" }`                                                                 |
| `checkout_opened`               | `{ "purchaseType": "credit_pack", "priceId": "price_example", "entrySurface": "credit_wall", "trigger": "out_of_credits", "funnelAttemptId": "funnel_example", "uiMode": "hosted" }`                                                               |
| `checkout_error`                | `{ "errorType": "session_creation_failed", "failurePoint": "session_request", "priceId": "price_example", "uiMode": "embedded", "funnelAttemptId": "funnel_example", "retryable": true }`                                                          |
| `image_upscaled`                | `{ "qualityTier": "high", "scaleFactor": 2, "inputWidth": 1000, "inputHeight": 800, "outputWidth": 2000, "outputHeight": 1600, "fileType": "jpeg", "fileSizeBucket": "1-5MB", "durationMs": 4200 }`                                                |
| `processing_failed`             | `{ "errorType": "provider_error", "reason": "upstream_unavailable", "provider": "replicate", "qualityTier": "high", "retryable": true, "durationMs": 12000, "requestId": "request_example" }`                                                      |
| `checkout_completed`            | `{ "purchaseType": "subscription", "sessionId": "cs_example", "amountCents": 999, "currency": "usd", "paymentStatus": "paid", "pricingRegion": "standard" }`                                                                                       |
| `purchase_confirmed`            | `{ "purchaseType": "subscription", "amountCents": 999, "currency": "usd", "priceId": "price_example", "stripeCheckoutSessionId": "cs_example", "invoiceId": "in_example", "sourceObjectId": "pi_example" }`                                        |
| `revenue_received`              | `{ "$revenue": 9.99, "$productId": "price_example", "$quantity": 1, "$revenueType": "initial", "amountCents": 999, "currency": "usd", "sourceObjectId": "pi_example" }`                                                                            |
| `subscription_created`          | `{ "plan": "pro", "amountCents": 999, "currency": "usd", "billingInterval": "month", "status": "active", "subscriptionId": "sub_example" }`                                                                                                        |
| `subscription_renewed`          | `{ "plan": "pro", "amountCents": 999, "currency": "usd", "subscriptionId": "sub_example", "invoiceId": "in_example", "creditsAdded": 100 }`                                                                                                        |
| `subscription_cancel_scheduled` | `{ "plan": "pro", "subscriptionId": "sub_example", "effectiveAt": "2026-09-01T00:00:00.000Z", "reasonCategory": "too_expensive", "reasonSource": "in_app" }`                                                                                       |
| `subscription_cancel_reversed`  | `{ "plan": "pro", "subscriptionId": "sub_example", "reversedAt": "2026-08-15T12:00:00.000Z" }`                                                                                                                                                     |
| `subscription_canceled`         | `{ "plan": "pro", "subscriptionId": "sub_example", "effectiveAt": "2026-09-01T00:00:00.000Z", "reasonCategory": "not_using", "reasonSource": "stripe" }`                                                                                           |
| `payment_failed`                | `{ "errorType": "card_declined", "attemptCount": 1, "customerId": "cus_example", "sourceObjectId": "pi_example" }`                                                                                                                                 |
| `payment_recovery_started`      | `{ "purchaseType": "subscription", "failureType": "card_declined", "recoveryChannel": "email", "funnelAttemptId": "funnel_example" }`                                                                                                              |
| `payment_recovered`             | `{ "purchaseType": "subscription", "amountCents": 999, "currency": "usd", "sourceObjectId": "pi_recovered", "originalFailureObjectId": "pi_failed", "recoveryChannel": "email" }`                                                                  |

## Local validation

```bash
yarn analytics:schema:template
yarn analytics:schema:validate
yarn analytics:schema:validate -- --mode test --input ./path/to/redacted-schema.json --json
```

The validator checks the exact 19-event set, canonical metadata, required and
optional property lists, property types, examples, and the
`purchase_confirmed` alternate-required rule. Passing means the local artifact
matches the repository contract; it does not mean Amplitude Data currently
accepts or receives every event. Live-labeled local input requires
`--mode live --allow-live-read`; the validator still makes no API calls.

## Dashboard canonical-definition metadata

These definitions are the local dashboard handoff for TASK-13. They are
templates pending external validation; no dashboard total is claimed here.

| Dashboard              | Metric                                        | Canonical events                                                                                                 | Formula                                                                            | Required filters                                                                 |
| ---------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| KPI Dashboard          | `checkout_to_paid_conversion`                 | `purchase_confirmed`, `checkout_opened`                                                                          | Unique `purchase_confirmed` users ÷ unique ordered `checkout_opened` users         | Exclude Stripe test mode; ordered attribution; deduplicate users                 |
| Revenue & Monetization | `recognized_gross_revenue`                    | `revenue_received`                                                                                               | Sum `$revenue`, split by `$revenueType`/`$productId`, deduplicate `sourceObjectId` | Exclude test mode and zero-dollar invoices; refunds/disputes separate            |
| Subscription Lifecycle | `intent_reversal_effective_churn_and_renewal` | `subscription_cancel_scheduled`, `subscription_cancel_reversed`, `subscription_canceled`, `subscription_renewed` | Unique `subscriptionId` counts by lifecycle event and cohort                       | Exclude test mode; scheduled intent remains distinct from effective cancellation |
| Processing Health      | `processing_failure_rate`                     | `processing_failed`, `image_upscaled`                                                                            | `processing_failed / (processing_failed + image_upscaled)`                         | 15-minute rolling window; minimum 20 terminal attempts; bounded segments         |

Every chart must link to the corresponding event definition and annotate the
2026-08-01 corrected-telemetry release plus the unreliable pre-release interval.

## Retention and product-return dashboard handoff

The retention holdout is assigned by the existing server-side retention rollout
(`10%` treatment when enabled; the remainder is holdout). The repository
contract for the decision metrics is
`server/analytics/retentionKpiDefinitions.ts`; the existing read-only SQL
health function is `get_subscription_retention_health`.

| Dashboard            | Metrics                                                                                       | Cohort rule                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Retention decision   | 30/60-day effective churn, renewal rate, incremental retained net revenue                     | Mature treatment and holdout cohorts only; compare by `subscription_id` and `variant`                              |
| Retention guardrails | Later cancellation, refunds, chargebacks, support complaints, billing errors                  | Attribute outcomes after assignment; keep cancellation completion accessible                                       |
| Product return       | Successful processing days, second successful job, D7/D30 return, credits used before renewal | Join `image_upscaled` and `credits_deducted` to the retention cohort without image content, filenames, or raw URLs |

These are dashboard definitions, not production observations. Live Amplitude
joins, 30/60-day cohort maturity, and the external retention decision remain
pending deployment and read-only production access.
