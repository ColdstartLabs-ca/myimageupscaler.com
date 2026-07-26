# Production Email Delivery Investigation

**Date:** July 24, 2026  
**Environment:** Production  
**Scope:** Cloudflare Email Service, Brevo, lifecycle queue, cron delivery, and production configuration  
**Investigation type:** Read-only; no emails were sent and no production data or secrets were changed

## Executive summary

Cloudflare Email Activity is showing mostly payment emails because the application intentionally reserves Cloudflare Email Service for transactional mail. Marketing and lifecycle emails are explicitly excluded from Cloudflare and routed through Brevo.

Lifecycle delivery has been operating: Supabase recorded 988 successful marketing sends during the seven days preceding this investigation, and Brevo reported 1,472 requests with 1,391 deliveries from July 16 through July 24. The lifecycle pipeline sent as many as 200 marketing emails per day before exhausting its policy-approved recipients.

The current lifecycle queue is not drainable. Production contains 3,125 pending and overdue rows, but none satisfy the recipient-value policy required for delivery:

- 1,784 rows are classified as `hold_experiment`.
- 1,341 rows are unclassified.
- Zero rows are classified as `protected`, `keep_high`, or `keep_medium`.

The production lifecycle endpoint consequently reports `eligible: 0` and sends nothing. This is not a Cloudflare provider failure or a broken cron. It is the direct result of the recipient-value release policy.

## Key conclusions

1. **Cloudflare is the wrong dashboard for lifecycle email activity.** Cloudflare is intentionally transactional-only; lifecycle campaigns use Brevo.
2. **Lifecycle emails have been sent successfully.** Production records and Brevo statistics independently confirm recent marketing delivery.
3. **The cron worker is deployed and authenticated.** All seven expected schedules are active, and the production lifecycle endpoint responds successfully.
4. **The present blocker is queue eligibility.** Every remaining due marketing row is either held for an experiment or unclassified, so the database delivery function returns no candidates.
5. **The readiness diagnostic has a production-targeting weakness.** It can silently use the schema's localhost `BASE_URL` default when the fetched production environment does not define `BASE_URL`.

## Intended provider architecture

The email provider manager implements the following routing:

| Email class         | Primary provider         | Fallback       | Visible in Cloudflare Email Activity |
| ------------------- | ------------------------ | -------------- | ------------------------------------ |
| Transactional       | Cloudflare Email Service | Brevo          | Yes, when Cloudflare is used         |
| Marketing/lifecycle | Brevo                    | None currently | No                                   |

The manager explicitly removes Cloudflare from the eligible provider list when `type === 'marketing'`. Resend is also excluded from current provider selection.

Relevant implementation:

- `server/services/email-providers/email-provider-manager.ts`
- `server/services/email-providers/cloudflare.provider-adapter.ts`
- `server/services/email-providers/brevo.provider-adapter.ts`

## Production evidence

### Provider readiness

The production configuration was fetched read-only from Google Cloud Secret Manager using the repository-scoped MyImageUpscaler credential. Secret values were not printed.

| Check                                  | Result                     |
| -------------------------------------- | -------------------------- |
| Cloudflare sending domain              | Enabled                    |
| Brevo API authentication               | Successful                 |
| Brevo sender                           | Verified                   |
| Brevo domain                           | Authenticated and verified |
| Brevo plan                             | Free                       |
| Brevo reported daily limit             | 300                        |
| Enabled production API secret versions | 7                          |

The active global `gcloud` account belonged to an unrelated project. The investigation used the repository's scoped credential without changing the global CLI account.

### Application email logs

| Period       |          Type |  Sent | Failed |
| ------------ | ------------: | ----: | -----: |
| Last 7 days  |     Marketing |   988 |      0 |
| Last 7 days  | Transactional |    86 |      0 |
| Last 30 days |     Marketing | 2,902 |  2,838 |
| Last 30 days | Transactional |   564 |     34 |

The latest observed lifecycle send occurred on **July 23 at 04:41 UTC**, used the `feature-reminder` template, and was submitted through Brevo.

The latest observed payment email occurred on **July 24 at 14:57 UTC** and was submitted through Cloudflare.

The large 30-day marketing failure count is historical rather than current. At least 999 old failed queue records were caused by the retired Resend path using an invalid API key. The current seven-day lifecycle health report showed zero provider failures.

### Brevo activity

Brevo's aggregate statistics for July 16 through July 24 reported:

| Metric        | Count |
| ------------- | ----: |
| Requests      | 1,472 |
| Delivered     | 1,391 |
| Soft bounces  |    35 |
| Hard bounces  |    11 |
| Blocked       |    13 |
| Invalid       |     0 |
| Unsubscribed  |    24 |
| Unique opens  |   342 |
| Unique clicks |     0 |

These provider-side figures independently confirm that lifecycle traffic was submitted outside Cloudflare.

### Daily lifecycle sends

| UTC date | Marketing sent | Marketing failed |
| -------- | -------------: | ---------------: |
| July 16  |            151 |               23 |
| July 17  |            200 |                0 |
| July 18  |            200 |                0 |
| July 19  |            200 |                0 |
| July 20  |            200 |                0 |
| July 21  |            200 |                0 |
| July 22  |            200 |                0 |
| July 23  |             98 |                0 |
| July 24  |              0 |                0 |

The application enforces a maximum marketing capacity of 200 per UTC day. The delivery rate reached that ceiling for six consecutive days, then processed the remaining eligible population on July 23.

## Current queue condition

At the time of investigation:

| Queue state         |   Count |
| ------------------- | ------: |
| Pending             |   3,125 |
| Due/overdue         |   3,125 |
| Sent, all time      |   3,638 |
| Failed, all time    |   1,107 |
| Skipped, all time   | 187,144 |
| Cancelled, all time |     872 |

### Recipient-value distribution

| Decision          | Pending count | Eligible for delivery |
| ----------------- | ------------: | --------------------- |
| Unclassified      |         1,341 | No                    |
| `hold_experiment` |         1,784 | No                    |
| `protected`       |             0 | Yes                   |
| `keep_high`       |             0 | Yes                   |
| `keep_medium`     |             0 | Yes                   |
| `cancel`          |             0 | No                    |

The due-queue database function only returns:

- Transactional campaigns, or
- Marketing campaigns with policy version `v1` and a decision of `protected`, `keep_high`, or `keep_medium`.

It deliberately excludes `hold_experiment` and unclassified marketing rows. The production endpoint confirmed the effect:

```json
{
  "success": true,
  "dryRun": true,
  "eligible": 0,
  "sent": 0,
  "failed": 0,
  "duePending": 3125,
  "unclassifiedDueReturned": 0
}
```

The oldest pending row was scheduled for **July 2 at 14:00 UTC** and is classified as `hold_experiment`.

### Largest overdue campaign populations

| Campaign                 | Due rows |
| ------------------------ | -------: |
| First-result follow-up   |    1,666 |
| Low credits              |    1,111 |
| High-usage free user     |      121 |
| Zero credits             |      114 |
| Checkout abandoned       |       61 |
| Win-back: never uploaded |       28 |
| Win-back: credit holder  |       23 |
| Unused credits           |        1 |

## Cron assessment

The deployed Cloudflare worker contains all seven schedules defined in `workers/cron/wrangler.toml`, including:

- Lifecycle eligibility and drain at minute 10 of every hour.
- Lifecycle catch-up drain at minute 40 of every hour.

Each lifecycle schedule can execute up to ten one-message drain requests. The sequence stops immediately when the endpoint returns zero eligible rows or reports a provider/health stop.

The production lifecycle endpoint authenticated successfully using the production cron secret. Its zero-send result is explained by `eligible: 0`, not by cron authentication, scheduling, provider health, or the daily capacity limit.

## Root-cause assessment

### Why Cloudflare shows payment mail

**Expected behavior.** Marketing mail is prohibited from selecting Cloudflare in application code. Payment emails are transactional and therefore use Cloudflare when it is available.

### Why lifecycle delivery is currently idle

**Policy-controlled queue starvation.** All remaining overdue marketing rows are excluded by recipient-value policy. The cron has nothing it is permitted to submit.

This may be intentional if `hold_experiment` is an unreleased experiment population. It is operationally problematic if the expectation is that these campaigns should continue sending, because the queue and dashboards do not clearly distinguish “due” from “eligible.”

### Why the queue appears severely backlogged

The `duePending` metric counts all overdue pending rows, including rows that policy will never return to the delivery worker. As a result, a queue can simultaneously report thousands of overdue rows and zero deliverable rows.

### Readiness-script defect

`scripts/check-email-delivery-readiness.ts` constructs its lifecycle URL from `serverEnv.BASE_URL`. The environment schema defaults this value to `http://localhost:3000`, and the fetched production secret did not export `BASE_URL` to the standalone Node diagnostic.

Therefore, the command labeled as a production readiness check can accidentally exercise a local server while using production database credentials. The investigation bypassed this ambiguity by calling `https://myimageupscaler.com/api/cron/email-lifecycle` directly.

## Risks

### High

- Revenue-critical campaigns such as low-credit and checkout-abandonment emails are currently held.
- The queue age is obscured by a metric that includes intentionally ineligible records.
- Operators checking only Cloudflare may incorrectly conclude that lifecycle email is entirely broken.

### Medium

- Releasing all 1,784 `hold_experiment` rows without throttling or revalidation could create an unwanted campaign burst.
- The 1,341 unclassified rows have no path to delivery under the current database policy.
- Production readiness can report success against the wrong application base URL.

### Monitor

- Brevo reported 11 hard bounces, 13 blocked recipients, and 24 unsubscribes during the inspected period.
- Brevo reported zero unique clicks. Application-owned click tracking may explain this, but tracking coverage should be verified separately.
- Historical Resend failures remain in aggregate reporting and can distort longer-period health summaries.

## Recommendations

### P0 — Clarify the intended release policy

Decide whether `hold_experiment` is:

1. An intentional hold that should remain excluded, or
2. A population that should enter a controlled experiment/release.

Do not bulk-release the entire population without current consent, suppression, balance, and campaign relevance revalidation.

### P0 — Resolve unclassified rows

Classify, cancel, or archive the 1,341 unclassified rows. Leaving them pending indefinitely makes queue health misleading and prevents deterministic lifecycle operations.

Any production database update must follow the repository's required backup procedure before execution.

### P1 — Separate queue metrics

Expose at least:

- Total pending
- Total overdue
- Policy eligible
- Held for experiment
- Unclassified
- Capacity blocked
- Provider blocked
- Oldest eligible row
- Oldest ineligible row

Alert on “eligible but not draining” separately from “overdue but policy-held.”

### P1 — Fix production readiness targeting

For production checks:

- Require an explicit HTTPS production base URL.
- Reject localhost and loopback hosts.
- Include the resolved target host in the readiness output.
- Make the cron result include `eligible`, not only `duePending`.

### P1 — Create provider-aware operational monitoring

Use:

- Cloudflare Email Activity for transactional mail.
- Brevo transactional activity for lifecycle and marketing mail.
- Supabase lifecycle queue/events as the internal source of truth.

A single operational view should show provider, campaign, queue eligibility, send status, and delivery outcome without recipient-level data.

### P2 — Review deliverability and click telemetry

- Confirm hard-bounce and blocked-recipient suppression.
- Investigate the 24 Brevo unsubscribes.
- Verify whether application click tracking explains Brevo's zero unique clicks.
- Keep historical Resend failures separated from current-provider health.

## Verification performed

- Production email configuration and provider readiness: passed.
- Direct production lifecycle endpoint dry-run: passed, with zero eligible rows.
- Remote Cloudflare cron schedule validation: passed; seven jobs matched.
- Focused email/cron test suite: 90 tests passed.
- Repository `yarn verify`: passed.
  - TypeScript: passed.
  - Lint: zero errors; existing warnings remain.
  - Translation ICU validation: passed.
  - Schema.org validation: passed.

## Changes made during investigation

None. No production database action, secret update, email submission, or source-code change was performed as part of the investigation. Temporary production environment files were removed after each check, and the global `gcloud` account/project configuration was left unchanged.
