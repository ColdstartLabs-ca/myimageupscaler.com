# Revenue telemetry reconciliation — 2026-08-01

**Status:** local read-only artifact template. External Stripe and Amplitude validation was not available in this repository run. No production API was called, and no production count or root-cause claim is made here.

## Purpose

This artifact is the TASK-2 handoff for a single 30-day window. Run the fixture-first script against separately exported Stripe and Amplitude data:

```bash
yarn analytics:reconcile -- --mode test --input ./path/to/reconciliation-export.json
```

Live-labeled input requires an explicit acknowledgment and remains read-only:

```bash
yarn analytics:reconcile -- --mode live --allow-live-read --input ./path/to/reconciliation-export.json
```

The script does not load credentials, call Stripe, call Amplitude, replay webhooks, or write a report file. Redirect stdout to a local artifact only after reviewing the input source.

## Required run metadata

| Field                         | Value in this artifact                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Window                        | 2026-07-02 through 2026-08-01 UTC, exclusive end as supplied by the export               |
| Deployed commit SHA           | Not supplied — external validation unavailable                                           |
| Amplitude project label       | Not supplied — do not print API keys; identify the selected project by a safe label only |
| Amplitude project selected by | Not supplied — `server_key`, `client_key`, or `manual` is expected                       |
| Stripe webhook endpoint mode  | Not supplied — must be `test` or `live` and match the selected input mode                |
| Enabled Stripe event types    | Not supplied — export configuration metadata, not secrets                                |
| Stripe 30-day object totals   | Not supplied — populate from a read-only export                                          |

## Reconciliation checks

The local report contains one row for each check below. Counts and unmatched IDs are intentionally `not supplied` until a read-only export is attached.

| Check                       | Stripe object                        | Canonical Amplitude event | Stable ID                     | Stripe count | Amplitude count | Unmatched IDs | Mismatch category |
| --------------------------- | ------------------------------------ | ------------------------- | ----------------------------- | -----------: | --------------: | ------------- | ----------------- |
| Created subscriptions       | `customer.subscription.created`      | `subscription_created`    | `subscriptionId`              | Not supplied |    Not supplied | Not supplied  | Not classified    |
| Paid invoices               | paid invoice                         | `revenue_received`        | `sourceObjectId` / invoice ID | Not supplied |    Not supplied | Not supplied  | Not classified    |
| Renewal invoices            | `billing_reason=subscription_cycle`  | `subscription_renewed`    | `invoiceId`                   | Not supplied |    Not supplied | Not supplied  | Not classified    |
| Completed checkout sessions | completed Checkout session           | `checkout_completed`      | session ID                    | Not supplied |    Not supplied | Not supplied  | Not classified    |
| Deleted subscriptions       | `customer.subscription.deleted`      | `subscription_canceled`   | `subscriptionId`              | Not supplied |    Not supplied | Not supplied  | Not classified    |
| Failed payments             | failed charge/invoice/payment object | `payment_failed`          | `sourceObjectId`              | Not supplied |    Not supplied | Not supplied  | Not classified    |
| Successful charges          | successful charge/payment object     | `purchase_confirmed`      | charge/session/invoice ID     | Not supplied |    Not supplied | Not supplied  | Not classified    |

Zero-dollar invoices and foreign-mode records are separate fields in the JSON report and must not be silently folded into the paid-revenue total. Test and live records must never be combined.

## Mismatch taxonomy

Every unmatched or contradictory record receives one category in the output:

- `producer` — default when no more specific evidence was supplied; this is a follow-up category, not a root-cause claim.
- `webhook_delivery` — the export says Stripe did not deliver the webhook.
- `handler` — webhook delivery exists but handler evidence says the canonical event was not emitted.
- `environment_routing` — the Stripe and Amplitude records belong to different explicit modes.
- `ingestion` — emission or receipt evidence exists but the event is missing, failed, or duplicated in ingestion.
- `taxonomy` — a stable ID is attached to a non-canonical event name.
- `dashboard_query` — the event exists but the supplied dashboard-inclusion evidence is false.

The report includes unmatched stable IDs per check, amount deltas, duplicate IDs, missing-ID counts, and the 0.5% amount-tolerance result. IDs are correlation fields for this local artifact and must not be copied into public logs.

## Validation state

**External validation:** unavailable. Attach the read-only Stripe/Amplitude export, record the safe metadata above, run the test-mode reconciliation first, and only then run the explicitly acknowledged live-mode reconciliation. Do not mark this document as reconciled from repository source inspection alone.
