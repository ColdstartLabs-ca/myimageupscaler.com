# PRD: Revenue Conversion, Retention, and Core Telemetry Trust

**Date:** 2026-08-01
**Status:** Ready for implementation
**Owner:** Growth / Monetization / Billing / Platform
**Complexity:** 10 → HIGH mode; mandatory checkpoint after every phase
**Primary outcome:** Increase net revenue per 1,000 monetization-eligible sessions
**Scope:** Core KPI events only; the remaining Amplitude taxonomy is out of scope
**Related PRDs:** `first-purchase-conversion-experiment-program.md`, `shared-bandit-experiment-platform.md`, `revenue-optimization-2026-07-10/06-subscription-cancellation-retention.md`, `analytics-instrumentation-fixes.md`

## 0. Complexity assessment

**Score: 10 → HIGH mode**

- +3 touches more than 10 files across analytics, checkout, webhooks, lifecycle, experiments, and tests.
- +2 complex event ordering, attribution, and idempotency state.
- +2 external integrations: Stripe and Amplitude Data/Analytics.
- +2 controlled customer-facing monetization and retention experiments.
- +1 operational monitoring and production reconciliation.

Each phase ends at its stated exit criterion. Do not begin the next phase while the prior checkpoint has unresolved correctness, revenue-attribution, or guardrail failures.

## 1. Executive summary

MyImageUpscaler's primary goal is higher revenue, led by better monetization-surface click-through and checkout-to-paid conversion, with stronger customer retention as the second growth lever. The last-30-day telemetry audit reports healthy product activity but unreliable subscription, revenue, churn, attribution, and failure-rate measurement. The business cannot safely identify which prompts, paywalls, offers, checkout paths, or retention interventions increase durable revenue.

This initiative first makes Stripe webhooks and successful image-processing outcomes authoritative for core business events. It then creates one ordered funnel from monetization impression through click, plan selection, checkout, confirmed payment, renewal, and churn. That foundation is used to repair the highest-intent purchase paths, recover failed payments, run controlled revenue experiments, and measure subscriber retention without optimizing vanity clicks.

The work is proof-first. Repository inspection shows that `$revenue`, `subscription_renewed`, `subscription_created`, and `subscription_canceled` code paths already exist, and approved purchase-conversion and cancellation-retention PRDs already define experiment infrastructure and customer treatments. This PRD repairs their measurement dependencies, prioritizes their revenue-bearing work, and adds rollout gates; it does not build competing systems.

## 2. Problem and evidence

### Audit baseline (last 30 days, supplied 2026-08-01)

| Signal                       | Observed | Risk                                                                               |
| ---------------------------- | -------: | ---------------------------------------------------------------------------------- |
| `image_upscaled`             |    7,520 | Healthy volume, incomplete usage context                                           |
| `account_created`            |      733 | Healthy volume, no event-level UTM snapshot                                        |
| `checkout_completed`         |       76 | Funnel event is available                                                          |
| `revenue_received`           |       76 | Exact parity may be valid for first purchases, but does not prove renewal coverage |
| `subscription_created`       |        2 | Cannot measure new recurring subscriptions reliably                                |
| `subscription_canceled`      |        0 | Currently represents effective termination only, not cancellation intent           |
| `processing_failed`          |      424 | 5.6% relative to `image_upscaled`; 142 failures on 2026-07-26                      |
| `payment_failed`             |       17 | Available for payment-health analysis                                              |
| Amplitude event descriptions | 0 of 102 | Analysts cannot discover trustworthy semantics                                     |
| Events in tracking plan      | 0 of 102 | No schema validation or required-property governance                               |

The approved first-purchase experiment program provides a separate July 1–29, 2026 funnel baseline: 11,357 `upgrade_prompt_shown`, 745 `upgrade_prompt_clicked`, 5,352 purchase-modal opens, 335 checkout opens, and 77 confirmed purchases. Those totals are not an ordered funnel because surfaces use conflicting semantics and some downstream events lose their originating trigger. This PRD must lock an ordered, unique-user baseline before measuring lift.

### Current-code findings

1. `trackRevenue()` already emits `revenue_received` with `$revenue`, `$productId`, `$quantity`, `$revenueType`, `amountCents`, and `currency` from `server/analytics/analyticsService.ts`.
2. Initial checkout and recurring invoice handlers already call `trackRevenue()`. Adding `$revenue` to `checkout_completed` would risk double-counting and is not the selected design.
3. `invoice.payment_succeeded` already emits `subscription_renewed` when `billing_reason === 'subscription_cycle'`.
4. `subscription_created` is selected from database row existence inside a shared create/update handler. Because checkout handling can upsert the subscription row first, a Stripe `customer.subscription.created` event can be mislabeled `subscription_updated`.
5. `subscription_canceled` is emitted only from `customer.subscription.deleted`, which occurs when access actually ends. A scheduled cancellation first arrives as `customer.subscription.updated` with `cancel_at_period_end: true`.
6. The database already has `subscriptions.cancellation_reason`, but the effective-cancellation event does not include it.
7. Type definitions contain image dimensions, yet at least one `image_upscaled` producer emits a different, incomplete payload. The contract is not enforced consistently.

## 3. Objectives and success criteria

### Objectives

- Increase confirmed purchases and net revenue per 1,000 monetization-eligible sessions.
- Increase click-through from high-intent monetization surfaces into checkout without harming product activation.
- Increase checkout-to-paid conversion through price continuity, payment-method readiness, and recoverable failure handling.
- Increase renewal revenue and reduce effective subscriber churn with reason-aware, non-coercive retention paths.
- Make every successful Stripe charge visible exactly once as confirmed purchase and recognized revenue.
- Measure subscription creation, renewal, cancellation intent, cancellation reversal, and effective churn with distinct semantics.
- Make the core KPI event set documented, schema-governed, and testable.
- Add enough acquisition, image, and error context to answer the audit's segmentation questions without collecting image content or sensitive payment data.
- Detect processing incidents within 15 minutes.

### Success criteria

Measured over the first complete 14 days after release, excluding Stripe test mode:

| Metric                    | Pass condition                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| New subscription coverage | 100% of paid Stripe `customer.subscription.created` records correlate to one `subscription_created` event by `subscriptionId`              |
| Revenue coverage          | 100% of successful, non-zero Stripe charges correlate to one `purchase_confirmed` and one `revenue_received` event                         |
| Revenue accuracy          | Sum of Amplitude `$revenue` differs from Stripe gross successful payments by no more than 0.5%, with documented exclusions                 |
| Renewal coverage          | 100% of paid `subscription_cycle` invoices correlate to one `subscription_renewed` and one `revenue_received` event                        |
| Cancellation intent       | 100% of transitions from `cancel_at_period_end=false` to `true` emit one `subscription_cancel_scheduled` event                             |
| Effective churn           | 100% of `customer.subscription.deleted` deliveries emit one `subscription_canceled` event                                                  |
| Core schema governance    | All core events in section 6 have descriptions, owners, required properties, and valid status in Amplitude Data                            |
| Processing observability  | A threshold breach creates an alert within 15 minutes and includes top `errorType`, `reason`, and model/provider segments                  |
| Monetization CTR          | At least 20% relative lift in unique-user CTA clicks per 1,000 eligible high-intent impressions versus the locked baseline                 |
| Checkout conversion       | At least 20% relative lift in confirmed purchasers per 1,000 unique checkout starts versus the locked baseline                             |
| Revenue yield             | At least 15% relative lift in net revenue per 1,000 monetization-eligible sessions, with no material refund/chargeback regression          |
| Subscriber retention      | At least 10% relative reduction in 60-day effective churn or a positive lift in 60-day incremental retained revenue                        |
| Measurement quality       | At least 95% of monetization impressions join to downstream steps by `funnelAttemptId`, with no duplicate impressions per rendered surface |

## 4. Users and jobs to be done

- **Founder / growth owner:** trust MRR, LTV, conversion, and churn dashboards.
- **Prospective buyer:** reach a relevant, clear payment option with minimal friction and consistent price/value context.
- **Subscriber at risk:** see at most one relevant alternative while retaining a clear path to cancel.
- **Engineer / on-call:** identify a processing regression by provider, model, and error category quickly.
- **Product analyst:** segment signup and successful usage without reverse-engineering event producers.
- **Future implementer:** change instrumentation against an explicit contract and detect drift in tests and Amplitude Data.

The telemetry phases do not change customer behavior. Later optimization phases may alter existing prompt, credit-wall, checkout-recovery, and cancellation-retention surfaces only through controlled experiments with holdouts and guardrails.

### Competitive context

External feature comparison is not useful for this internal measurement and optimization program. The decision benchmark is MyImageUpscaler's locked funnel baseline, Stripe-confirmed net revenue, and retention holdouts. Copying competitor prices or checkout patterns without controlled evidence is explicitly excluded.

## 5. Scope

### In scope

1. Production reconciliation for the reported event-volume gaps.
2. Stripe-backed subscription and revenue event semantics, correlation, and idempotency.
3. Cancellation intent, reversal, effective churn, and cancellation-reason properties.
4. Event-level signup attribution and privacy-safe successful-image context.
5. Processing-failure incident analysis and alerting.
6. Amplitude descriptions and tracking-plan schemas for the core set only.
7. Ordered payment-funnel attribution from eligible impression to net revenue.
8. Revenue experiments on the existing high-intent credit wall and checkout paths.
9. Failed-payment recovery and reason-aware subscriber retention using existing billing/lifecycle systems.

### Non-goals

- Governing or rewriting all 102 events.
- Uncontrolled site-wide redesigns, blanket discount increases, or untested pricing changes.
- Backfilling historical Amplitude events as if they were observed in real time.
- Storing image contents, filenames, URLs, raw error stack traces, card data, email addresses, or unrestricted free-text cancellation responses in Amplitude.
- Replacing Amplitude, Stripe, Supabase, Baselime, or the existing analytics abstraction.
- Creating a second experimentation, bandit, retention-offer, or lifecycle-email platform.
- Fixing the root product/provider issue behind the 2026-07-26 spike before the incident analysis identifies it.

## 6. Canonical event contract

All property names use `camelCase`; event names use `snake_case`. Money is stored as integer cents in `amountCents`, lowercase ISO currency in `currency`, and dollars in Amplitude's `$revenue`. Stripe object IDs are correlation keys and must not be displayed in public logs.

| Event                           | Meaning and source                                                                            | Required properties                                                                                                                  | KPI role                   |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `account_created`               | First successful account setup, server-side                                                   | `method`, `pricingRegion`, `utmSource`, `utmMedium`, `utmCampaign`, `attributionAvailable`                                           | Acquisition denominator    |
| `monetization_surface_shown`    | A unique eligible user can actually see a purchase CTA                                        | `surface`, `trigger`, `offerType`, `priceId`, `priceCents`, `pricingRegion`, `funnelAttemptId`, `experimentAssignmentKey?`           | CTR denominator            |
| `monetization_surface_clicked`  | User explicitly activates the primary or secondary purchase CTA                               | `surface`, `trigger`, `cta`, `destination`, `funnelAttemptId`, `experimentAssignmentKey?`                                            | CTR numerator              |
| `plan_selected`                 | User selects a subscription or credit-pack offer                                              | `purchaseType`, `planOrPack`, `priceId`, `priceCents`, `pricingRegion`, `funnelAttemptId`                                            | Offer-selection conversion |
| `checkout_opened`               | A Stripe checkout UI is requested for a selected offer                                        | `purchaseType`, `priceId`, `entrySurface`, `trigger`, `funnelAttemptId`, `uiMode`                                                    | Checkout-start denominator |
| `checkout_error`                | Checkout cannot load, continue, or complete on the client path                                | `errorType`, `failurePoint`, `priceId`, `uiMode`, `funnelAttemptId`, `retryable`                                                     | Payment-friction diagnosis |
| `image_upscaled`                | A user receives a successful processed result                                                 | `qualityTier`, `scaleFactor`, `inputWidth`, `inputHeight`, `outputWidth`, `outputHeight`, `fileType`, `fileSizeBucket`, `durationMs` | Core activation/usage      |
| `processing_failed`             | A processing attempt ends without a result                                                    | `errorType`, `reason`, `provider`, `qualityTier`, `retryable`, `durationMs`, `requestId`                                             | Product-health numerator   |
| `checkout_completed`            | Stripe Checkout reports a completed session; payment may still require canonical confirmation | `purchaseType`, `sessionId`, `amountCents`, `currency`, `paymentStatus`, `pricingRegion`                                             | Checkout funnel only       |
| `purchase_confirmed`            | A successful initial charge is confirmed server-side                                          | `purchaseType`, `amountCents`, `currency`, `stripeCheckoutSessionId` or `invoiceId`, `priceId`                                       | Purchase conversion        |
| `revenue_received`              | A successful initial or recurring charge represented in Amplitude Revenue                     | `$revenue`, `$productId`, `$quantity`, `$revenueType`, `amountCents`, `currency`, `sourceObjectId`                                   | Revenue, ARPU, LTV         |
| `subscription_created`          | Stripe `customer.subscription.created` reaches an accepted paid/trialing state                | `plan`, `amountCents`, `currency`, `billingInterval`, `status`, `subscriptionId`                                                     | New subscriptions          |
| `subscription_renewed`          | Paid invoice with `billing_reason=subscription_cycle`                                         | `plan`, `amountCents`, `currency`, `subscriptionId`, `invoiceId`, `creditsAdded`                                                     | Renewal health             |
| `subscription_cancel_scheduled` | `cancel_at_period_end` transitions `false -> true`                                            | `plan`, `subscriptionId`, `effectiveAt`, `reasonCategory`, `reasonSource`                                                            | Gross churn intent         |
| `subscription_cancel_reversed`  | `cancel_at_period_end` transitions `true -> false` before termination                         | `plan`, `subscriptionId`, `reversedAt`                                                                                               | Save/recovery rate         |
| `subscription_canceled`         | Stripe `customer.subscription.deleted`; access has ended                                      | `plan`, `subscriptionId`, `effectiveAt`, `reasonCategory`, `reasonSource`                                                            | Effective logo churn       |
| `payment_failed`                | Stripe confirms a failed one-time charge or invoice payment                                   | `errorType`, `attemptCount`, `customerId`, `sourceObjectId`                                                                          | Payment health             |
| `payment_recovery_started`      | An eligible user opens a recovery path for a failed payment                                   | `purchaseType`, `failureType`, `recoveryChannel`, `funnelAttemptId`                                                                  | Recovery funnel            |
| `payment_recovered`             | A previously failed payment later succeeds                                                    | `purchaseType`, `amountCents`, `currency`, `sourceObjectId`, `originalFailureObjectId`, `recoveryChannel`                            | Recovered revenue          |

### Property rules

- Unknown UTM values are sent as `null`; `attributionAvailable=false` distinguishes missing capture from direct traffic.
- UTM values are normalized and length-limited before ingestion. Query strings and referrer URLs are not copied into the event.
- `fileType` is a normalized MIME family or allowlisted extension. `fileSizeBucket` is one of `<1MB`, `1-5MB`, `5-10MB`, `10-25MB`, `25MB+`; do not send filenames.
- `reasonCategory` is an allowlisted value such as `too_expensive`, `not_using`, `quality`, `technical_issue`, `temporary_need`, `payment_failure`, `other`, or `unknown`.
- `reasonSource` is `in_app`, `stripe`, `support`, or `unknown`. Free text stays in its existing operational store and is not sent to Amplitude.
- `requestId`, Stripe session IDs, invoice IDs, and subscription IDs are used for correlation and deduplication. No event may depend on email as an identifier.
- CTR is unique users with `monetization_surface_clicked` divided by unique eligible users with a visible `monetization_surface_shown` for the same surface and assignment window. Modal mounts, rerenders, and hidden CTAs are not impressions.
- Checkout conversion is unique `purchase_confirmed` users divided by unique `checkout_opened` users in an ordered attribution window. Revenue decisions use net revenue, not clicks alone.

## 7. Functional requirements

### TASK-2 — Establish a production reconciliation baseline

- Record the deployed commit SHA, Amplitude project selected by server/client API keys, Stripe webhook endpoint mode, enabled event types, and 30-day Stripe object totals.
- Compare Stripe created subscriptions, paid invoices, completed checkout sessions, deleted subscriptions, and failed payments to Amplitude by stable object ID.
- Classify each mismatch as producer, webhook delivery, handler, environment routing, ingestion, taxonomy, or dashboard-query failure.
- Do not expose secret values or mutate production data.

**Acceptance criteria:** A dated reconciliation artifact reports counts, unmatched object IDs, and root-cause category for every core billing event. Test-mode objects and zero-dollar invoices are explicitly separated.

### TASK-3 — Make subscription creation source-authoritative

- Pass the Stripe event type or an explicit lifecycle action from the webhook processor to the subscription handler.
- Classify `customer.subscription.created` independently of whether checkout processing already inserted a Supabase row.
- Emit only after the subscription is in the accepted `active` or `trialing` state; define how an initially `incomplete` subscription later becoming active is emitted once.
- Use stable deduplication keyed by subscription ID and lifecycle action.

**Acceptance criteria:** Both webhook orderings—checkout first and subscription-created first—produce exactly one `subscription_created`, and updates never masquerade as creates.

### TASK-4 — Separate cancellation intent from effective churn

- On `customer.subscription.updated`, detect `cancel_at_period_end: false -> true` and emit `subscription_cancel_scheduled`.
- Detect `true -> false` and emit `subscription_cancel_reversed`.
- Keep `subscription_canceled` on `customer.subscription.deleted` only.
- Attach normalized cancellation reason and effective timestamp from existing app data or Stripe details, with `unknown` fallback.
- Preserve current subscription access and credit behavior.

**Acceptance criteria:** Schedule, reversal, and deletion fixtures each emit exactly their matching event. Unrelated subscription updates emit none of the three.

### TASK-5 — Preserve one canonical revenue path

- Keep `revenue_received` as the only event carrying Amplitude special revenue properties.
- Keep `checkout_completed` as a funnel event and `purchase_confirmed` as payment confirmation.
- Cover initial subscriptions, credit packs, renewals, and supported auto-top-ups without double counting.
- Add a stable `sourceObjectId` and use it as the event deduplication key.
- Document exclusions: refunds and disputes are measured separately and do not rewrite historical gross revenue events.

**Acceptance criteria:** Replayed webhooks do not increase recognized revenue; a completed but unpaid/failed asynchronous checkout does not emit positive revenue; each paid renewal does.

### TASK-6 — Verify and harden renewal telemetry

- Verify that production receives the relevant paid-invoice events and that `billing_reason` parsing matches the deployed Stripe API version.
- Require `invoiceId`, `currency`, and amount on `subscription_renewed`.
- Ensure the renewal and revenue events share the same user, subscription, invoice, amount, and currency.

**Acceptance criteria:** A paid subscription-cycle invoice emits one renewal and one revenue event; a first invoice does not emit `subscription_renewed`.

### TASK-7 — Add event-level acquisition attribution

- Snapshot normalized first-touch `utmSource`, `utmMedium`, and `utmCampaign` onto the server-side `account_created` event.
- Reuse the existing initial-attribution capture where possible; do not create a second attribution model.
- Include `attributionAvailable` and retain `pricingRegion` and auth `method`.
- Define direct/unknown behavior and prevent duplicate account-created events on setup replay.

**Acceptance criteria:** Signup tests cover attributed, direct, missing-attribution, and replay cases without putting full URLs or arbitrary query parameters in Amplitude.

### TASK-8 — Standardize successful image context

- Make all `image_upscaled` producers conform to one typed payload.
- Populate dimensions, scale factor, normalized file type, size bucket, quality/model tier, and duration when known.
- Use `unknown`/nullable fields where a browser-only processor cannot provide a value; do not fabricate values.
- Ensure the success event fires once per delivered image, including batch and background-removal paths.

**Acceptance criteria:** Contract tests cover each producer and reject filenames, image URLs, blobs, and raw file sizes where the bucket is required.

### TASK-9 — Make processing failures actionable

- Normalize provider errors into a bounded `errorType` and `reason` taxonomy.
- Add provider, quality tier/model, retryability, duration, and request correlation.
- Sanitize messages; dashboards and alerts must group on bounded fields rather than message text.
- Calculate failure rate as `processing_failed / (processing_failed + successful terminal processing events)` using matching scope and identity rules.

**Acceptance criteria:** Known provider, safety, timeout, validation, and unexpected failures map deterministically; no raw stack trace or user content is sent.

### TASK-10 — Investigate the 2026-07-26 incident

- Export the day's `processing_failed` breakdown by hour, provider, model/tier, `errorType`, and `reason`.
- Correlate the spike window with application/provider logs and deploy history.
- Identify onset, recovery, affected attempts/users, and whether retries later succeeded.
- Create a follow-up defect only after evidence identifies a product or provider cause.

**Acceptance criteria:** An incident note names the dominant failure segment, time window, likely cause with evidence, customer impact, and an owner for any remediation.

### TASK-11 — Add failure-rate monitoring

- Create a 15-minute rolling monitor with a minimum sample size of 20 terminal attempts.
- Warning threshold: failure rate at or above 5% for two consecutive windows.
- Critical threshold: failure rate at or above 10% in one window or three times the comparable seven-day baseline.
- Alert payload includes successful attempts, failures, rate, and top bounded error/provider/model segments.

**Acceptance criteria:** Synthetic test data demonstrates normal, warning, critical, and low-volume-noise behavior; the destination receives a test alert.

### TASK-12 — Govern the core Amplitude schema

- Add only section 6 events and properties to the Amplitude tracking plan.
- For every event, add description, category, owner, source, active/inactive status, property types, required/optional rules, and examples.
- Mark verified core events official after production reconciliation passes.
- Configure monitoring for unexpected, invalid, and out-of-date core events; do not reject production events until a non-blocking observation period succeeds.

**Acceptance criteria:** Each core event is valid/current in Amplitude Data during a seven-day observation window, with no undocumented required-property failures.

### TASK-13 — Repair dashboards and definitions

- KPI Dashboard uses `purchase_confirmed` for conversion, not `checkout_completed`.
- Revenue & Monetization uses Amplitude revenue properties from `revenue_received` and separates initial versus renewal revenue by `$revenueType`/product and source IDs.
- Add cancellation-intent, cancellation-reversal, effective churn, renewal rate, and processing-failure-rate views.
- Annotate the release date and the known unreliable pre-release interval.

**Acceptance criteria:** Dashboard totals reconcile to the production baseline and every chart links to its canonical event definition.

### TASK-14 — Build one ordered monetization funnel

- Create a stable `funnelAttemptId` when an eligible monetization surface is rendered and preserve it through click, plan selection, auth redirect, checkout, Stripe metadata, webhook confirmation, and revenue.
- Normalize existing prompt, modal, paywall, sidebar, pricing-page, and model-gate telemetry into `surface`, `trigger`, `cta`, and `destination`; retain legacy event names only where an existing dashboard still needs them.
- Count an impression once only when the primary CTA is visible; reopening or rerendering the same surface in one attempt does not increment it.
- Preserve `entrySurface`, `originatingTrigger`, pricing region, device class, selected product, experiment assignment, and displayed price through checkout.
- Publish ordered unique-user metrics for impression-to-click CTR, click-to-checkout rate, checkout-to-paid conversion, and net revenue per 1,000 eligible impressions.

**Acceptance criteria:** At least 95% of test purchases join backward to a single eligible impression and forward to one revenue event; the same surface rerender does not inflate CTR.

### TASK-15 — Repair experiment reward attribution before launching treatments

- Reuse the existing shared experiment platform and fixed-assignment patterns.
- Reconcile active experiment impressions, assignments, confirmed purchases, rewards, and revenue; repair experiments that record purchases but zero rewards.
- Allow only one checkout-owning shared experiment per session until multi-experiment checkout attribution is explicitly supported.
- Reward variants from webhook-side `purchase_confirmed` and net revenue, never client success-page views or CTA clicks.
- Lock pre-treatment baselines by surface, region, device, purchase type, and new/returning customer.

**Acceptance criteria:** A Stripe test purchase updates exactly one intended experiment reward and revenue counter, no unrelated experiment, and survives auth redirects and webhook replay.

### TASK-16 — Optimize high-intent payment entry surfaces

- Implement the approved `insufficient_credits_purchase_path` experiment from `docs/PRDs/first-purchase-conversion-experiment-program.md` only after TASK-15 passes.
- Compare the current modal, smallest-sufficient-pack focus, and compact direct-checkout path while preserving an explicit “See all options” choice.
- Show exact credits required, current balance, resulting balance, product, price, billing terms, and the interrupted job that will resume.
- Keep post-download monetization non-blocking and analyze it as an assisted model-discovery path rather than a direct payment CTA.
- Do not deepen regional discounts in this phase; the existing pricing bandit owns price experimentation.

**Primary decision metric:** net confirmed revenue per 1,000 eligible surface impressions.
**Leading metrics:** surface CTR, checkout starts, time to checkout, and interrupted-job completion.
**Guardrails:** download/activation rate, refunds, chargebacks, duplicate charges, support contacts, and regional gross margin.

**Acceptance criteria:** Treatment ships only after a predeclared sample/decision gate and must improve revenue or be revenue-noninferior while materially improving a leading metric without breaching a guardrail.

### TASK-17 — Reduce checkout and failed-payment friction

- Verify production-domain registration, wallet rendering, dynamic payment methods, currency eligibility, and displayed-price-to-Stripe-price continuity before redesigning checkout.
- Segment checkout errors by hosted/embedded mode, device, region, purchase type, failure point, and retryability.
- Provide a safe retry path for transient session/network failures that preserves the selected product, price, attribution, and experiment assignment without creating duplicate sessions or charges.
- Use existing lifecycle email and authenticated in-app surfaces for recoverable failed-payment follow-up. Messages must identify the affected plan/order, use a secure destination, and stop after payment recovery or cancellation.
- Correlate `payment_recovered` to the original failure and count recovered net revenue.

**Acceptance criteria:** Test fixtures prove wallet/domain status, price continuity, retry idempotency, recovery suppression after success, and attribution from original failure to recovered revenue.

### TASK-18 — Improve subscriber retention and durable revenue

- Reuse the reason-based retention design in `docs/PRDs/revenue-optimization-2026-07-10/06-subscription-cancellation-retention.md` after cancellation telemetry is trustworthy.
- Offer at most one server-selected alternative: pause when supported, downgrade, or bounded next-cycle discount. Product-quality reasons may proceed directly to cancellation and feedback.
- Keep “continue cancellation” visible and never make cancellation harder than acceptance.
- Maintain a holdout and measure 30/60-day effective churn, renewal, incremental retained net revenue, later cancellation, refunds, chargebacks, and support complaints.
- Pair subscriber retention with product return metrics: successful processing days, second successful job, D7/D30 return, and credits used before renewal.
- Use existing lifecycle queues for relevant reminders; suppress messages when balance, purchase, cancellation, or subscription state makes them stale.

**Primary decision metric:** 60-day incremental retained net revenue per eligible subscriber.
**Leading metrics:** cancellation reversal, offer acceptance, next renewal, and second successful processing day.
**Guardrails:** cancellation completion time, complaints, refunds, chargebacks, involuntary churn, and discount cost.

**Acceptance criteria:** Rollout begins with a holdout and limited exposure; an offer is retained only when incremental revenue is positive and no cancellation-accessibility or billing guardrail regresses.

## 8. Key system flows

### Initial subscription

1. Stripe confirms checkout and/or subscription creation; webhook order may vary.
2. Handlers update existing billing state idempotently.
3. The Stripe lifecycle action emits one `subscription_created`.
4. Successful payment confirmation emits one `purchase_confirmed`.
5. The same charge emits one `revenue_received` with `$revenue`.
6. Correlation IDs allow all three records to reconcile without relying on arrival order.

### Scheduled cancellation and effective churn

1. User selects an allowlisted cancellation reason and schedules end-of-period cancellation.
2. Stripe `customer.subscription.updated` changes `cancel_at_period_end` to `true`.
3. Backend emits `subscription_cancel_scheduled`; access remains active.
4. If cancellation is undone, backend emits `subscription_cancel_reversed`.
5. If the period ends, Stripe emits `customer.subscription.deleted` and backend emits `subscription_canceled`.

### Processing health

1. Each attempt ends in exactly one successful or failed terminal event.
2. Both outcomes share compatible provider/model/request dimensions.
3. The monitor evaluates rolling rate only after the minimum sample size.
4. A breached threshold sends a segmented alert; on-call uses request IDs to inspect logs.

### Payment conversion and retention learning loop

1. An eligible surface receives a stable funnel and experiment assignment before impression.
2. User actions and checkout preserve the assignment through Stripe metadata.
3. Webhooks record confirmed purchase, net revenue, renewal, failure recovery, or churn.
4. Experiment analysis joins revenue and guardrails to the original eligible population.
5. A treatment rolls out only after its decision rule passes; losing arms stop without changing unrelated surfaces.

## 9. Conceptual data model

No database migration is expected for cancellation reason because `subscriptions.cancellation_reason` already exists. A migration is allowed only if implementation proves a missing durable idempotency field cannot be satisfied by the existing webhook event store.

| Entity                      | Key fields                                                                                               | Notes                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Analytics event envelope    | `eventName`, `userId`, `eventTime`, `insertId`, `properties`                                             | `insertId` derived from provider object plus lifecycle action |
| Revenue correlation         | `sourceObjectId`, `stripeCheckoutSessionId?`, `invoiceId?`, `subscriptionId?`, `amountCents`, `currency` | One successful charge maps to one revenue event               |
| Cancellation lifecycle      | `subscriptionId`, `scheduledAt?`, `effectiveAt?`, `reasonCategory`, `reasonSource`                       | Intent and effective churn remain distinct                    |
| Processing terminal outcome | `requestId`, `success`, `provider`, `qualityTier`, `durationMs`, `errorType?`, `reason?`                 | Bounded dimensions only                                       |

## 10. Technical approach and constraints

- Continue using Next.js 15 App Router, existing Stripe webhook handlers, Supabase billing state, and `trackServerEvent` / `trackRevenue`.
- Keep billing and revenue events server-side. Browser events cannot be the source of truth for payment success.
- Preserve Cloudflare's 10 ms CPU constraint: no synchronous aggregation, export, or incident analysis in a request handler.
- Use existing `clientEnv` / `serverEnv`; never access `process.env` in new application code.
- Analytics failures must be visible in structured logs but must not roll back a successful Stripe transaction.
- Event delivery must be idempotent under Stripe retries and webhook reordering.
- Optimize net confirmed revenue and durable renewal, not standalone CTR. CTR is a diagnostic/leading metric.
- Use the existing shared experiment and pricing-bandit systems; no new assignment framework is permitted.
- Run one material monetization experiment per surface at a time and preserve an unexposed holdout for retention interventions.
- Use `dayjs` for application date calculations.
- Use existing server/client logging modules and redact sensitive values.

### Likely implementation surfaces

- `server/services/stripe-webhook-event-processor.ts`
- `app/api/webhooks/stripe/handlers/subscription.handler.ts`
- `app/api/webhooks/stripe/handlers/invoice.handler.ts`
- `app/api/webhooks/stripe/handlers/payment.handler.ts`
- `server/analytics/analyticsService.ts`
- `server/analytics/types.ts`
- `app/api/users/setup/route.ts`
- `app/api/upscale/route.ts` and client success producers
- Existing analytics, Stripe webhook, account setup, and upscale unit tests
- `client/utils/checkoutTrackingContext.ts`, monetization surfaces, checkout hooks, experiment assignment/reward services, and lifecycle queues

## 11. Prerequisites and access

| Prerequisite                      | Status               | Requirement                                                                                                                          |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Repository and local dependencies | Available            | Run existing Yarn scripts from project root                                                                                          |
| Supabase schema/migrations        | Available locally    | Production access is read-only for reconciliation; no production mutation is authorized by this PRD                                  |
| Production database credentials   | Not required for PRD | If needed during implementation, retrieve only required credentials with the `gcloud-secrets` read-only workflow; never print values |
| Stripe CLI                        | Installed            | Auth status must be verified before replaying test-mode fixtures                                                                     |
| Stripe Dashboard                  | Access not verified  | Needs read access to webhook deliveries, subscriptions, invoices, and payments; test mode for replay                                 |
| Amplitude Analytics/Data          | Access not verified  | Needs read access for reconciliation and Manage Tracking Plans permission for schema publication                                     |
| Logging/monitoring                | Access not verified  | Needs read access to production logs and permission to create/test the agreed monitor                                                |
| Test users                        | Not verified         | One Stripe test-mode user for new subscription, scheduled cancellation/reversal, and renewal fixture                                 |

### Environment variables

No new variable names were discovered. Existing placeholders are already documented in `.env.api.example` and `.env.client.example`; active values remain in the project's established `.env.api` and `.env.client` files. Do not create `.env.local` for this project.

- `AMPLITUDE_API_KEY`: server ingestion; `.env.api`.
- `AMPLITUDE_SECRET_KEY`: read-only export/reconciliation where required; `.env.api`.
- `NEXT_PUBLIC_AMPLITUDE_API_KEY`: browser ingestion; `.env.client`.
- `STRIPE_SECRET_KEY`: Stripe test API and server integration; `.env.api`.
- `STRIPE_WEBHOOK_SECRET`: local/test webhook signature verification; `.env.api`.

### Required documentation

- [Amplitude: Create a tracking plan](https://amplitude.com/docs/data/create-tracking-plan)
- [Amplitude: Monitor and validate events](https://amplitude.com/docs/data/validate-events)
- [Amplitude: Official events and properties](https://amplitude.com/docs/data/official-events-and-properties)
- [Stripe: Cancel subscriptions](https://docs.stripe.com/billing/subscriptions/cancel)
- [Stripe: Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)

### Open prerequisite policy

Unverified service access does not block this PRD. It blocks the affected implementation or production-validation task at TASK-1. No engineer should compensate for missing access by inferring production truth from local code.

## 12. Security, privacy, and operational safety

- Never emit Stripe secrets, card details, email, full URLs, raw image data, filenames, stack traces, or unbounded user text.
- Hashing does not make an identifier anonymous; avoid adding identifiers unless correlation requires them.
- Use allowlists and length limits for UTM, file type, cancellation reason, provider, model, and error properties.
- Production reconciliation is read-only. Any later production database mutation or migration requires a fresh verified backup under the repository's database-safety instructions.
- Test webhook replays in Stripe test mode. Production replay requires explicit approval and a deduplication dry run.
- Restrict Amplitude taxonomy publication and official designation to users with the appropriate data-governance role.

## 13. Testing and verification

Green/red TDD is required for each behavior change.

1. Unit tests cover webhook ordering, create/update classification, cancellation transitions, renewal classification, event properties, sanitization, and deduplication.
2. Contract tests assert every core producer conforms to the canonical event property type.
3. Stripe test-mode fixtures cover initial purchase, credit pack, renewal, scheduled cancellation, reversal, effective cancellation, failure, asynchronous payment, and replay.
4. Funnel tests cover visible-impression deduplication, auth redirect continuity, experiment assignment, displayed-price continuity, checkout retry, and webhook reward attribution.
5. Experiment tests cover holdout stability, one checkout-owning assignment, primary metric computation, and every stop/guardrail condition.
6. A production read-only reconciliation validates 14 complete post-release days against Stripe object IDs and amounts.
7. Run affected tests, then `yarn test`, then mandatory `yarn verify` before implementation completion.

## 14. Delivery phases

### Phase 0 — Prerequisite and baseline gate

- Verify access, deployed SHA, environment routing, webhook configuration, dashboard definitions, and baseline mismatch categories.
- Exit criterion: causes are known well enough to avoid duplicating working instrumentation.

### Phase 1 — Revenue and subscription lifecycle correctness

- Complete TASK-3 through TASK-6 with test-mode webhook reconciliation.
- Exit criterion: creation, renewal, cancellation, purchase, and revenue fixtures are idempotent and semantically distinct.

### Phase 2 — Product and acquisition context

- Complete TASK-7 through TASK-9.
- Exit criterion: signup, image success, and processing failure events conform to typed, privacy-safe contracts.

### Phase 3 — Incident response, governance, and dashboards

- Complete TASK-10 through TASK-13.
- Exit criterion: incident is explained, alert is tested, core schema is valid, and dashboards reconcile.

### Phase 4 — Revenue funnel and experiment readiness

- Complete TASK-14 and TASK-15.
- Exit criterion: ordered revenue funnel coverage reaches 95% and test purchases reward exactly one intended assignment.

### Phase 5 — Revenue and retention optimization

- Run TASK-16 first because revenue conversion is the primary business goal.
- Run TASK-17 after the checkout configuration audit identifies real friction.
- Run TASK-18 after cancellation intent/effective churn tracking and holdout measurement pass.
- Exit criterion: winning treatments improve net revenue under their predeclared decision rules and guardrails.

## 15. Assumptions and dependencies

- The audit reflects the production Amplitude project and a complete 30-day window.
- Stripe remains the source of truth for payment and subscription lifecycle state.
- The checkout/subscription webhook ordering is not guaranteed.
- Existing cancellation-reason storage can be normalized without a new customer-facing survey.
- The approved first-purchase experiment PRD and existing shared experiment platform remain the source of truth for arm mechanics and reward persistence.
- The existing cancellation-retention PRD remains the source of truth for offer eligibility and cancellation accessibility.
- Amplitude plan/schema features and permissions are available on the current account; otherwise manual catalog documentation is the fallback and the gap is recorded.
- A processing attempt can be assigned a stable request ID and exactly one terminal outcome.
- Historical metrics before the corrected release remain annotated and are not silently mixed with trustworthy post-release KPIs.

## 16. Definition of done

- TASK-2 through TASK-18 acceptance criteria pass.
- Core event contracts exist in code, tests, and Amplitude Data with the same semantics.
- Stripe and Amplitude reconcile within the success thresholds for 14 complete days.
- KPI and revenue dashboards use canonical events and show annotated pre-fix data.
- Processing failure alert has been test-fired successfully.
- Funnel dashboards report CTR, checkout conversion, revenue yield, renewal, and churn from ordered unique-user cohorts.
- At least one revenue experiment and the retention holdout can be evaluated from confirmed net revenue without manual event repair.
- Affected tests, `yarn test`, and `yarn verify` pass.
