# Growth Diagnostic — 2026-07-25

Sources: Stripe (live), Supabase (prod), Amplitude (30d: 2026-06-25 → 07-24), GA4 (28d), GSC (28d).

---

## TL;DR

> **⚠️ REVISED 2026-07-25 (later same day).** Writing the follow-up PRDs surfaced two errors in the original version of this report. Both are corrected below; the original text is preserved in §0 so the reasoning trail is auditable. **The headline changed.**

**Signup volume is down ~40% since July 18, but the funnel itself is healthy. The cause is traffic, not product.**

Active users per signup — DB ground truth, immune to analytics instrumentation:

| Date       | Signups       | Active users  | Active/signup       |
| ---------- | ------------- | ------------- | ------------------- |
| Jul 15-17  | 270, 256, 247 | 178, 162, 153 | 0.659, 0.633, 0.619 |
| **Jul 18** | 185           | **38**        | **0.205** 🔴        |
| Jul 19-20  | 149, 136      | 110, 96       | **0.738, 0.706** ✅ |
| Jul 23-25  | 171, 137, 133 | 112, 81, 84   | 0.655, 0.591, 0.632 |

July 18 was a **one-day** SEV-1 — the grant-RPC value mismatch — fixed the same day by `99a73485`. The funnel recovered on July 19 and has held. `txns_per_active` never moved (1.5-2.3 throughout).

What remains is traffic: GSC clicks −18%, but **impressions +5% and average position improved 12.0 → 10.7**. No penalty, no deindexing. CTR fell 3.1% → 2.0% while impressions spiked — Google is showing the site for more, broader queries and converting fewer of them. That is the open question, and it is an SEO/CTR question, not a product one.

Monetization is structurally capped, and the machine built to fix it is switched off:

- Paid conversion is flat at **0.67–0.94%** for five months — stuck, not collapsing.
- Users rarely reach a paywall: 5 free credits, median spend 1.25.
- When they do, it is framed as a red error toast, not an offer.
- The lifecycle email system has **3,254 messages queued and 0 eligible to send** — and the backlog is _growing_ ~130/day.

**The one thing: unstick the email queue, then reframe the credit wall.** Both are days of work. The traffic/CTR question is worth a separate look but the funnel below it is working.

---

## 0. Corrections to the original version of this report

Both errors were caught while writing the implementation PRDs, by reading the code and the daily data rather than the monthly rollups.

### Correction 1 — "Acquisition is working" was wrong

**Original claim:** "Signups (July) 5,606 ▲17% — acquisition is the healthiest part of the funnel."

**Reality:** July's total hid a 41% mid-month collapse that is ongoing. Monthly aggregates are unsafe during an incident; the daily series is in the TL;DR above.

**Why I got it wrong:** I compared month-over-month totals and never plotted the daily series. The GSC/GA4 pulls are 28-day _aggregates_ and agreed with the monthly view, which made the error feel corroborated when it was just the same mistake twice.

### Correction 2 — the `free_limit_gate_shown` ratio was real but the cause was wrong

**Original claim:** "1,208 `insufficient_credits` errors vs 112 `free_limit_gate_shown` — the paywall fires 10× more often as an error than as an offer."

**Reality:** `free_limit_gate_shown` is **dead code**. It was removed on 2026-07-22 by commit `1c95953c` after the gate it belonged to caused a 60-80% payment drop and a 45% signup drop. The 112 events are the tail of the ~5 days it was live.

The underlying insight survives — the credit wall _is_ framed as a failure — but the prescribed fix was dangerously wrong. "Add a paywall gate" is precisely what was just rolled back. The correct fix is to reframe the moment while keeping the modal dismissible. → [credit-wall-monetization-surface](../PRDs/credit-wall-monetization-surface.md)

**Also corrected:** the original success metric "`free_limit_gate_shown` ≥ `insufficient_credits`" would have required resurrecting the removed gate and would have broken two regression tests that exist specifically to prevent that.

### Correction 3 — "the signup regression is unrecovered" was also wrong

**Claim (added in revision 1, now withdrawn):** "Signups per organic session fell 25% and the Jul 22 rollback did not fix it. Root cause unidentified." A P0 PRD was written on this basis and has been **deleted**.

**Reality:** Jul 18 was a one-day SEV-1 — the grant-RPC value mismatch — fixed the same day by `99a73485`. Active-users-per-signup recovered to baseline on **Jul 19**, three days _before_ the rollback, and has held since. No conversion regression exists.

**Why I got it wrong:** I compared Jul 13-17 against Jul 18-24. Five of those seven "post" days were the broken window, so the average manufactured a persistent regression out of a resolved one-day outage. Compounding it, I reached for GA4 sessions and Amplitude events — both of which had their own problems — instead of the DB ratio that settles it in one query.

**The lesson, now in the skill as Trap 5:** never let a comparison window straddle a known event. Split at the event boundary and check whether the metric recovered _before_ attributing a persistent effect.

### Correction 4 — the credit-wall volume is an undercount

The 1,208 events come from one code path (mid-batch failures). Two pre-flight credit walls emit no analytics at all. **We do not currently know how many users hit the credit wall.**

---

## Correction to a prior claim (original, still valid)

An earlier read of this data (including my own first pass today) showed conversion collapsing 5.2% → 0.9%. **That is wrong**, and `docs/management/conversion-collapse-diagnostic-2026-07-11.md` was right to reject it.

`credit_transactions.type='purchase'` contains refunds. February's 166 "purchases" were **159 rows described `'Processing refund'`** averaging 4.27 credits — the smallest real pack is 50 credits. Only 7 were genuine.

Filtering on `description ILIKE 'Credit pack purchase%'` and matching cohort maturity at 30 days:

| Cohort  | Signups | Paid ≤30d | Conversion |
| ------- | ------- | --------- | ---------- |
| 2026-02 | 1,366   | 13        | 0.952%     |
| 2026-03 | 3,869   | 29        | 0.750%     |
| 2026-04 | 3,433   | 23        | 0.670%     |
| 2026-05 | 3,519   | 24        | 0.682%     |
| 2026-06 | 3,734   | 35        | **0.937%** |

Flat, with June the best month since February. This is a _ceiling_ problem, not a regression. That changes the fix: stop hunting for a bug that broke conversion, start building the paywall that was never really there.

---

## Scoreboard

| Stage           | Metric                            | Now             | Prev                  | Verdict                      |
| --------------- | --------------------------------- | --------------- | --------------------- | ---------------------------- |
| **Acquisition** | **Signups/day**                   | **~140**        | **~265 (pre-Jul-18)** | **▼ 41% 🔴**                 |
|                 | **Active users per signup**       | **0.654**       | **0.637**             | **flat ✅ (funnel healthy)** |
|                 | GSC clicks/day                    | 316             | 386                   | ▼ 18%                        |
|                 | GSC impressions/day               | 12,939          | 12,349                | ▲ 5% (no penalty)            |
|                 | GSC avg position                  | 10.7            | 12.0                  | ▲ improved                   |
|                 | Organic sessions/day              | 351             | 444                   | ▼ 21%                        |
|                 | Organic sessions (28d agg)        | 11,074          | 5,972                 | ▲ 85% _(masks the above)_    |
|                 | GSC clicks (28d agg)              | 9,350           | 4,448                 | ▲ 110% _(lagging window)_    |
|                 | Avg position                      | 11.5            | —                     | page-2 cluster               |
| **Activation**  | Uploaders → upscaled              | 6,369 / 7,796   | —                     | 82%                          |
|                 | Upscaled → downloaded             | 3,983 / 6,369   | —                     | **63%**                      |
|                 | Signups never using a credit      | 43%             | 12.7% (Mar)           | ▼▼                           |
|                 | Avg credits used / user           | 1.25            | 2.86 (Mar)            | ▼ 56%                        |
| **Retention**   | Usage on 2+ days                  | 7.1%            | 15.5% (Mar)           | ▼ 54%                        |
|                 | Lifecycle emails eligible to send | **0**           | —                     | stalled                      |
| **Revenue**     | Cohort conversion (30d)           | 0.937%          | 0.952% (Feb)          | flat                         |
|                 | Net revenue (July, partial)       | $341            | $424 (Jun)            | ▼                            |
|                 | MRR                               | $110            | —                     | 6 active subs                |
|                 | AOV                               | $5.51           | $8.84 (May)           | ▼ 38%                        |
| **Referral**    | —                                 | not implemented | —                     | —                            |

---

## AARRR walk-through

### Acquisition — strong medium-term trend, acute short-term break

**Long run (28-day aggregate):** genuinely good. GSC clicks more than doubled on only 20% more impressions, meaning **ranking quality improved, not just coverage**. Average position 11.5 puts a large cluster just off page one. Channel mix: Organic 53%, Direct 26%, Unassigned 11%, **AI Assistant 5.6% growing 52% MoM** — AI-referred traffic is now a real, compounding channel.

**Last 8 days:** volume down, quality intact. Organic sessions fell 444 → 351/day and signups 265 → 149/day, but every conversion ratio below signup held (active/signup 0.637 → 0.654). The 28-day aggregates above are lagging windows still containing the strong first half of July; they will deteriorate if the traffic decline persists.

**The open question is CTR, not rankings.** Impressions rose 5% and average position improved from 12.0 to 10.7 while clicks fell 18% — CTR dropped 3.1% → 2.0%, with an impression spike to 16.4k/16.9k on Jul 21-22. That pattern (more impressions, same or better position, worse CTR) usually means Google broadened the query set the site surfaces for. Worth a query-level diff in GSC: which queries gained impressions, and are they relevant?

Weekend seasonality is still not ruled out (Jul 18-19 and 25-26 are weekends) and should be checked before sizing any of this.

**This is now the strongest argument for SEO work, not against it** — the funnel converts fine; it is being fed less.

### Activation — a real leak, and one clear bug

Per-user the core product works: 82% of uploaders get a result. Two leaks below that:

**37% of users who successfully upscale never download.** 6,369 got a result, 3,983 downloaded. That is 2,386 users who did the work and walked away with nothing — the clearest activation loss in the data.

**Valid PNGs and JPEGs are being rejected at upload.** 277 events of `Invalid file type: image/png` and 161 of `image/jpeg` — both are on the allowlist. Cause is in `client/utils/file-validation.ts:159`: after the MIME allowlist passes, a 12-byte magic-number sniff runs and _hard-fails_ the upload on any mismatch or unrecognized header:

```ts
if (claimedMimeType !== detectedMimeType) {
  return { valid: false, reason: 'type', ... };
}
```

Any legitimate image whose header the 12-byte table doesn't recognize is turned away at the first step. ~438 events in 30 days.

Error volume overall is high: **`upscale_failed` is the single largest error at 3,410 events**, plus 171 `Unexpected token '<', "<!DOCTYPE"...` (an API returning an HTML error page where JSON is expected).

### Retention — halved, and the fix is currently disabled

Multi-day usage fell from 15.5% (March) to 7.1% (July). D30 retention is effectively zero.

The product has an extensive lifecycle email system built precisely for this — 24 campaigns, abandoned-cart capture, win-back drips. **It is not sending.** Per `docs/reports/email-delivery-investigation-2026-07-24.md`: 3,125 pending rows, of which 1,784 are `hold_experiment` and 1,341 unclassified, and **0 fall into any class the due-queue function will return**. Sends hit 0 on July 24.

Held campaigns are exactly the revenue-critical ones: `first-result-followup` (1,666), `low-credits` (1,111), `high-usage-free-user` (121), `zero-credits` (114), `checkout-abandoned` (61).

Also worth noting: Brevo reports **0 unique clicks** against 342 opens over 8 days. Either click tracking is broken or the emails have no working CTA. Verify before trusting any email attribution.

### Revenue — the structural ceiling

Conversion is flat at ~0.7–0.9% because **the paywall is unreachable by design**:

- Free grant: 5 credits (`DEFAULT_FREE_CREDITS`), no monthly refresh
- Median user consumes **1.25**
- Only **6.4%** of users consume 4+
- So ~93% of users never come near the limit

And for the minority who _do_ hit it, the moment is mishandled: **1,208 `insufficient_credits` errors vs 112 `free_limit_gate_shown` impressions.** The credit wall is firing ten times more often as a red error than as an upgrade offer. `free_credits_reduced` fired exactly **once** in 30 days.

Checkout itself converts acceptably: 376 opened → 104 completed (28%), with 132 `network_error` events worth cleaning up.

Two structural notes:

- **This is a credit-pack business, not a subscription business.** Subscription grants fell 38 (Mar) → 2 (Jul); 6 active subs total. Effort spent on subscription tiers is effort spent on 3% of the revenue.
- **AOV is falling** ($8.84 → $5.51) as buyers concentrate in the $4.99 small pack.

The anti-abuse system is also aggressive: 43–63% of signups since April get a clawback, at a **median 0.00 hours after signup** — it fires at registration, and **zero users were ever clawed back after using the product**. Clawed users consume 0.77 credits vs 2.54 for others. Some of this is correct dedup of recycled accounts, but the copy users see (`Multiple accounts detected on your device. Upgrade to a paid plan to continue.`, 168 events) is an accusation delivered before anyone has seen the product work.

### Referral — does not exist

No referral mechanism is implemented. Given ~7,800 monthly uploaders and 63% download completion, there is a natural share moment being wasted, but this is a build, not a fix.

---

## What to do, sorted by impact ÷ effort

| #     | Move                                                                                                                                                                                                                                                                                                                                                                           | Impact | Effort | Score                      | Verify against                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | -------------------------- | ------------------------------------------------------- |
| **0** | ~~Diagnose the signup collapse.~~ **WITHDRAWN 2026-07-25** — there is no signup-conversion regression. Jul 18 was a one-day SEV-1, already fixed by `99a73485`; the funnel recovered Jul 19. The PRD was deleted. The residual is a **traffic/CTR question** (clicks −18% on rising impressions and improving position) and belongs in an SEO workstream, not an incident one. | —      | —      | —                          | —                                                       |
| 1     | **Unstick the lifecycle email queue.** Root cause is not "decide about `hold_experiment`" — nothing classifies rows at enqueue, so new rows are born ineligible and the backlog grows ~130/day. 3,254 messages held. → [PRD](../PRDs/lifecycle-email-queue-eligibility-restoration.md)                                                                                         | 8      | 2      | **4.0**                    | Eligible rows > 0; currently 0                          |
| 2     | **Reframe the credit wall as an offer.** Not "add a gate" — the gate was removed Jul 22 for causing a 60-80% payment drop. Remove the error framing, instrument the two silent pre-flight walls, keep the modal dismissible. → [PRD](../PRDs/credit-wall-monetization-surface.md)                                                                                              | 9      | 3      | **3.0**                    | `credit_wall_shown` (new event); no baseline exists yet |
| 3     | **Stop rejecting valid PNG/JPEG.** Downgrade the magic-byte mismatch in `file-validation.ts:159` from hard-fail to warn, or widen the signature table.                                                                                                                                                                                                                         | 6      | 2      | **3.0**                    | `upload_invalid_format` events; now 696/30d             |
| 4     | **Re-tune the free grant — BLOCKED, do not launch yet.** The prior is negative (reducing free credits is what triggered the Jul 17 collapse), the baseline is contaminated, and the RPC hard-rejects any value outside 0/3/5. → [PRD](../PRDs/free-grant-calibration-experiment.md)                                                                                            | 9      | 4      | **2.25** _(blocked on #0)_ | Revenue per signup by arm — not conversion rate         |
| 5     | **Close the download leak.** 37% of successful upscales are never downloaded — auto-download, or make the result CTA unmissable.                                                                                                                                                                                                                                               | 6      | 3      | **2.0**                    | `image_download` ÷ `image_upscaled`; now 63%            |
| 6     | **Lean into AI-assistant traffic.** 5.6% of sessions, +52% MoM, fastest-growing channel. `llm-search-optimization` skill already exists.                                                                                                                                                                                                                                       | 5      | 3      | **1.67**                   | AI Assistant sessions; now 1,163                        |
| 7     | **Root-cause `upscale_failed`.** Largest single error at 3,410 events; needs provider-level investigation.                                                                                                                                                                                                                                                                     | 8      | 5      | **1.6**                    | `upscale_failed`; now 3,410/30d                         |
| 8     | **Fix checkout `network_error`** (132 events) and the HTML-instead-of-JSON responses (171).                                                                                                                                                                                                                                                                                    | 3      | 2      | **1.5**                    | `checkout_error`; now 132                               |
| 9     | **Rewrite the multi-account gate copy.** Accusatory paywall shown before first value; 168 events.                                                                                                                                                                                                                                                                              | 3      | 2      | **1.5**                    | conversion of gated users; ~0 today                     |
| 10    | **Annual billing.** Roadmap calls it a top quick win — but subscriptions are 3% of revenue here.                                                                                                                                                                                                                                                                               | 4      | 3      | **1.33**                   | MRR; now $110                                           |
| 11    | **Referral program.** Real long-term lever, no short-term payback.                                                                                                                                                                                                                                                                                                             | 4      | 8      | **0.5**                    | n/a                                                     |

---

## What I would explicitly _not_ do next

- **~~More SEO/pSEO pages.~~ REVERSED 2026-07-25.** I argued against this twice, both times on a false premise — first that acquisition was already healthy, then that the funnel was leaking. Neither holds. The funnel converts at its normal rate and is simply being fed 18% fewer clicks. **Recovering CTR is now a legitimate priority** — though the specific move is a query-mix diagnosis, not publishing more pages. _(See §0.)_
- **Checkout optimization.** 28% open→complete is fine. Only 376 people reached it in 30 days — the problem is upstream of checkout, not inside it.
- **Subscription tiers / trials.** 2 subscription grants in July against 68 pack purchases. Optimizing the 3% is a distraction.
- **Tightening anti-abuse further.** It already fires on half of all signups at registration and has never once caught someone after they used the product. The next marginal tightening costs more legitimate users than it saves.

---

## Caveats

- July is a partial month (25 days); month-over-month revenue comparisons understate it.
- The July cohort is excluded from conversion analysis (immature at 30 days).
- Amplitude `image_upscale_started` (28,922) far exceeds `image_upscaled` (13,057), but per-user the ratio is 7,622 → 6,369. Retries are likely inflating the event-level count; do not read 45% as a per-attempt success rate without confirming retry semantics.
- Brevo reports 0 unique clicks over the period. Email click attribution is suspect for the whole window.
- Stripe reports CAD; the corporate account migration on 2026-04-24 means pre-April history lives in the legacy account and is not included.
