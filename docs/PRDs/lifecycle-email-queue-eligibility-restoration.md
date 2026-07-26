# PRD: Lifecycle Email Queue Eligibility Restoration

**Date:** 2026-07-25
**Status:** Ready
**Complexity:** 6 → MEDIUM mode
**Owner:** Retention / Revenue Recovery
**Source:** [Growth Diagnostic 2026-07-25](../reports/growth-diagnostic-2026-07-25.md) — priority #1 (impact 8 ÷ effort 2 = 4.0)
**Related:** [email-delivery-investigation-2026-07-24](../reports/email-delivery-investigation-2026-07-24.md) (diagnosis), [lifecycle-recovery-email-delivery-restoration](./lifecycle-recovery-email-delivery-restoration.md) (prior restoration), [email-queue-recipient-value-pruning](./email-queue-recipient-value-pruning.md) (the policy this PRD amends)

---

## 1. Context

**Problem:** The lifecycle email system has **3,254 messages queued and 0 eligible to send**. It has sent nothing since 2026-07-24. The backlog is not static — it grows roughly 130 rows/day.

Live production, 2026-07-25:

| Decision                        | Pending | All overdue? | Oldest     |
| ------------------------------- | ------- | ------------ | ---------- |
| `hold_experiment` (policy `v1`) | 1,784   | yes          | 2026-07-02 |
| unclassified (`NULL`)           | 1,470   | 1,469        | 2026-07-16 |
| **eligible to send**            | **0**   | —            | —          |

Unclassified was 1,341 on 2026-07-24 and 1,470 on 2026-07-25.

Blocked campaigns, by revenue role:

| Campaign                 | Held | Unclassified | Total |
| ------------------------ | ---- | ------------ | ----- |
| `first-result-followup`  | 986  | 741          | 1,727 |
| `low-credits`            | 650  | 505          | 1,155 |
| `zero-credits`           | 3    | 122          | 125   |
| `high-usage-free-user`   | 118  | 3            | 121   |
| `checkout-abandoned-24h` | 0    | 69           | 69    |
| winback (all variants)   | 27   | 29           | 56    |

`low-credits` + `zero-credits` + `high-usage-free-user` + `checkout-abandoned-24h` = **1,470 direct monetization nudges** that are not being delivered, against a product converting at 0.9%.

### 1.1 The holds are not who the policy was designed for

The recipient-value policy was built to suppress low-monetization geographies. In production it is doing something else entirely:

| Bucket                               | `hold_experiment` | Share     |
| ------------------------------------ | ----------------- | --------- |
| IN/PH (the intended country caps)    | 40                | **2.2%**  |
| All other markets (score band 10-39) | 1,744             | **97.8%** |

Top held markets are US (112), BR (91), DE (76), TR (69), ES (59), AR (58), IT (57), GB (56). **The country caps are not the problem; the score band is.** Mainstream Western users are being withheld from revenue-critical email by a threshold calibrated for a different purpose.

### 1.2 Files Analyzed

```
supabase/migrations/20260715000100_restore_lifecycle_delivery_queue.sql   # live due-queue fn + claim fn + 200/day cap
supabase/migrations/20260712000100_email_recipient_value_classification.sql # nullable columns, no trigger
supabase/migrations/20260712000200_email_recipient_value_apply_rpc.sql    # whole-queue checksum guard
supabase/migrations/20260712000300_email_recipient_value_due_queue.sql    # superseded fail-open version
server/services/email-lifecycle.service.ts                               # 2nd eligibility gate, health metrics, drain
server/services/email-recipient-value.service.ts                         # scoring, country caps, dead holdout selector
app/api/cron/email-lifecycle/route.ts                                    # cron entry, MAX_SEND_LIMIT
workers/cron/index.ts                                                    # drain loop, early-stop on eligible===0
scripts/{audit,apply,report}-email-recipient-value.ts                    # operator pipeline
scripts/check-email-delivery-readiness.ts                                # readiness check
```

### 1.3 Root Causes (verified in code)

**Cause A — a fail-open default was changed to fail-closed, with nothing to classify new rows.**

`20260712000300` originally used `COALESCE(recipient_value_decision, 'keep_medium')`, so unclassified rows _were_ deliverable. The live function (`20260715000100_restore_lifecycle_delivery_queue.sql:82-90`) replaced that with a strict predicate:

```sql
AND (
  c.email_type = 'transactional'
  OR (
    c.email_type = 'marketing'
    AND q.recipient_value_decision IS NOT NULL
    AND q.recipient_value_decision IN ('protected', 'keep_high', 'keep_medium')
    AND q.recipient_value_policy_version = 'v1'
  )
)
```

The classification columns are nullable with **no trigger, no default, and no write at enqueue** (`20260712000100:45-53`). The only writer is the manual `apply_email_recipient_value_run` RPC. So every newly enqueued marketing row is born permanently ineligible. This is why the unclassified count grows daily and will never self-resolve.

Timeline this explains exactly: the pre-existing classified backlog drained at the 200/day cap Jul 17-22, exhausted Jul 23, and hit zero Jul 24.

A duplicate gate exists in application code and must be changed in step with the SQL — `server/services/email-lifecycle.service.ts:216-221`:

```ts
return (
  row.recipient_value_policy_version === RECIPIENT_VALUE_POLICY_VERSION &&
  row.recipient_value_decision !== null &&
  row.recipient_value_decision !== undefined &&
  ['protected', 'keep_high', 'keep_medium'].includes(row.recipient_value_decision)
);
```

**Cause B — `hold_experiment` is terminal. The release mechanism is dead code.**

`selectRecipientValueHoldout` (`server/services/email-recipient-value.service.ts:533-561`) implements the approved design — 10% per country|campaign stratum, deterministic sha256 ordering, `HOLDOUT_DAILY_LIMIT = 100`. It is referenced **only by its own alias and one unit test**. No cron path calls it, it never writes to the DB, and neither the due-queue SQL nor `isLifecycleDueQueueRowEligible` has a holdout exemption clause.

`rollback` on the apply RPC only un-cancels `cancel` rows (`20260712000200:50-103`); it does not touch holds. Re-running audit→apply re-derives the same decision from the same signals. There is no path out.

**Cause C — re-classification is impractical on a live queue.**

`apply_email_recipient_value_run` recomputes a count + md5 checksum over **all** `status='pending'` rows and aborts on any drift (`20260712000200:126-169`), plus a per-row `updated_at` equality check. Any enqueue or send between `audit` and `apply` invalidates the run. On a queue receiving ~130 rows/day, the window is effectively zero.

**Cause D — the health metric hides the failure.**

`getQueueHealth` (`email-lifecycle.service.ts:785-814`) reports `duePending` with no recipient-value predicate. It showed 3,125 due while `eligible` was 0. An operator reading "3,125 due" concludes the queue is working through a backlog.

**Cause E — throughput ceiling.** `MAX_SEND_LIMIT = 1` per HTTP call (`app/api/cron/email-lifecycle/route.ts:5-7`), 10 drains per schedule, 2 schedules/hour = 480/day theoretical, hard-capped at 200/day marketing by `LEAST(GREATEST(p_marketing_daily_limit,1), 200)` (`20260715000100:119-184`). Even fully unblocked, a 3,254 backlog needs **~16 days** to clear.

---

## 2. Goals / Non-Goals

**Goals**

- Marketing email sending resumes, and cannot silently stop again.
- New queue rows are classified at enqueue and never accumulate as unclassified.
- `hold_experiment` gains a real, throttled release path — or is retired as a decision class.
- Score-band thresholds are re-derived from evidence, not left at values that hold 97.8% of Western users.
- Operators and alerts see _eligible_, not just _pending_.

**Non-Goals**

- Raising the 200/day marketing cap. Deliverability guardrail; separate decision.
- Rewriting the scoring model. This PRD recalibrates thresholds and fixes plumbing.
- Changing provider routing (Cloudflare transactional / Brevo marketing). Working as designed.
- Bulk-releasing the entire held backlog at once. Explicitly rejected — see §5.

---

## 3. Solution

Five changes, ordered so that each is shippable and verifiable alone.

### Phase 1 (P0) — Stop the bleeding: classify at enqueue

Every marketing row must carry a decision when it is written. Preferred implementation: classify inside the enqueue path in `email-lifecycle.service.ts` where the row is constructed, reusing the existing scoring function, so the decision and its reasons are recorded with the same policy version the due-queue expects.

A `BEFORE INSERT` trigger is the fallback if enqueue turns out to have multiple call sites — but the scoring function lives in TypeScript and depends on user signals, so the service-layer approach is preferred and a trigger should only backstop it by rejecting NULL decisions on marketing rows.

Backfill the existing 1,470 unclassified rows in the same deploy.

**Guard:** add a NOT-NULL-equivalent CHECK (marketing rows must have a decision + policy version) so this class of bug cannot recur silently.

### Phase 2 (P0) — Make re-classification possible

Scope the apply RPC's checksum guard to the **run's item set** rather than the entire pending queue. The per-row `updated_at` equality check already provides the real safety property (no row mutated since the dry run); the whole-queue checksum adds no protection that the per-row check lacks, and it is what makes the tool unusable in production.

Keep: advisory lock, policy-version match, expected-count match, per-row `updated_at` match, decision/band coherence, transactional-cancel prohibition.

### Phase 3 (P1) — Decide `hold_experiment`, then wire it

The evidence in §1.1 says the current hold population is not the one the policy targeted. Recommendation: **recalibrate the score band and wire the existing holdout release**, rather than bulk-releasing.

1. Re-derive the `hold_experiment` band from outcome data via `get_email_recipient_value_performance` — the 10-39 threshold was set a priori and has never been validated against a 30-day report (the pruning PRD explicitly left policy-v2 open at `:463`, `:526`).
2. Wire `selectRecipientValueHoldout` into the cron drain and add the corresponding exemption clause to the due-queue SQL and `isLifecycleDueQueueRowEligible`. The 10%/stratum, 100/day ceiling is already implemented and tested — it only needs a caller and a delivery path.
3. Release throttled, oldest-first, revalidating each recipient's signals at send time (a user who purchased since being held must not receive a `low-credits` nudge).

### Phase 4 (P1) — Observability that would have caught this

Split the health metrics into `pending`, `overdue`, **`eligible`**, `held`, `unclassified`, and alert on the condition that actually failed: **overdue > 0 AND eligible == 0** for more than one drain cycle. Also alert on `unclassified > 0`, which should now be structurally impossible.

Fix `scripts/check-email-delivery-readiness.ts` to target the real base URL — it builds from `serverEnv.BASE_URL`, which defaults to `http://localhost:3000`, so a "production readiness check" can pass against localhost while using production credentials.

### Phase 5 (P2) — Drain the backlog safely

At 200/day the backlog needs ~16 days. Drain oldest-first with per-campaign fairness so `checkout-abandoned-24h` (69 rows, time-sensitive) is not starved behind `first-result-followup` (1,727). Rows whose trigger condition has expired should be cancelled, not sent — a 23-day-old "finish your image" email is worse than no email.

---

## 4. Testing (green/red)

Extend `tests/unit/server/services/email-lifecycle-recipient-value.unit.spec.ts` (which today asserts the _opposite_ at `:188`, `'should exclude unclassified rollout rows from delivery'` — that test stays valid; the new guarantee is that unclassified rows cannot be created).

| Case                                          | Expected                                                       |
| --------------------------------------------- | -------------------------------------------------------------- |
| Enqueue a marketing row                       | decision + policy version populated; never NULL                |
| Enqueue a transactional row                   | bypasses recipient-value, still deliverable                    |
| CHECK constraint                              | insert of marketing row with NULL decision is rejected         |
| Apply RPC with unrelated row enqueued mid-run | **succeeds** (regression for Cause C)                          |
| Apply RPC with a run item mutated mid-run     | still aborts                                                   |
| Holdout release                               | ≤10% per stratum, ≤100/day, deterministic for a fixed date key |
| Held user who purchased after being held      | excluded from `low-credits` release                            |
| Health metrics                                | `eligible` reported separately from `duePending`               |
| Alert condition                               | overdue > 0 && eligible == 0 fires                             |

Integration: `server/services/__tests__/email-recipient-value.integration.test.ts`. Cron sequencing: `tests/unit/api/email-lifecycle-cron.unit.spec.ts`, `workers/cron/index.test.ts`.

**Production verification before/after each phase:**

```bash
gcloud secrets versions access latest --secret=myimageupscaler-api-prod > .env.api.prod
gcloud secrets versions access latest --secret=myimageupscaler-client-prod > .env.client.prod
yarn email:queue:audit:prod          # dry run — never mutates
yarn email:delivery:readiness:prod
```

`yarn email:queue:apply:prod` requires `--write --action apply --run-id --policy-version v1 --expected-count`. **Run the audit and review its output before any apply.**

---

## 5. Explicitly Rejected

**Bulk-releasing all 1,784 held rows.** Sending 1,784 emails to a list that has been silent for three weeks, at a domain whose recent Brevo stats show 35 soft + 11 hard bounces and 24 unsubscribes per ~1,400 sends, risks reputation damage that outlasts the revenue gained. Throttled release with revalidation, per the already-approved 10%/100-per-day design.

**Reverting `20260715000100` to the `COALESCE(..., 'keep_medium')` fail-open.** It would restore sending in one line, but it re-opens the exact hole the migration closed and leaves classification permanently unimplemented. Fix the cause, not the symptom.

---

## 6. Success Metrics

| Metric                                           | Baseline (2026-07-25) | Target               |
| ------------------------------------------------ | --------------------- | -------------------- |
| Eligible rows                                    | 0                     | > 0 continuously     |
| Marketing sends / day                            | 0                     | 150-200 (at cap)     |
| Unclassified pending rows                        | 1,470 and growing     | **0**, structurally  |
| Pending backlog                                  | 3,254                 | < 500 within 21 days |
| `email_lifecycle_events` `purchased_after_email` | unmeasurable          | establish baseline   |
| Hard bounce rate                                 | ~0.8%                 | < 2% during drain    |
| Unsubscribe rate                                 | ~1.7%                 | < 3% during drain    |

**Counter-metrics — halt the drain if breached:** hard bounce > 2%, unsubscribe > 3%, or any Brevo block event.

**Prerequisite:** Brevo reported **0 unique clicks** against 342 opens. Verify click tracking before trusting any email-attributed conversion number from this system.

---

## 7. Risks

| Risk                                                | Likelihood | Mitigation                                                                                                       |
| --------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Reputation damage from resuming after a silence     | Medium     | Throttled release, oldest-first, counter-metrics above                                                           |
| Stale emails sent (23-day-old triggers)             | High       | Revalidate trigger conditions at send; cancel expired rows                                                       |
| Recalibrated thresholds re-suppress the wrong users | Medium     | Derive from `get_email_recipient_value_performance`; ship behind policy version `v2` so `v1` stays rollback-able |
| Loosening the apply guard permits a bad mutation    | Low        | Per-row `updated_at` check retained — the real safety property                                                   |
| Backfill misclassifies at scale                     | Medium     | Dry-run audit first; `--expected-count`; rollback path                                                           |
