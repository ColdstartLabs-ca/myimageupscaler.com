# PRD-revenue-growth-2026-09 — Upgrade-funnel truth and repeat-use revenue (Sep 16–Oct 16, 2026)

**Status:** IN PROGRESS (Phase 1 locale fix committed at `0fff2b59`, release-gated 19/19, fast-forward pushed to `origin/master`, CI deploy run `35153609328` queued; AC-4 five-journey stop review complete and evidence-backed; AC-2/AC-6/AC-7 open; AC-8 partial)
**Flag:** POST-DEPLOY-EVALUATION-REQUIRED — authorized production rollout and public/consented journey verification (AC-2)
**Complexity:** 2 → LOW; risk override: none (breakdown: 7 locale templates + ≤3 callers = ≤10 planned non-test implementation files +2; no new module, schema, API, or billing boundary. Reassess to HIGH only if the funnel trace verifies an actual security, cache, or money-logic risk)
**Owner:** Revenue/Growth dev agent; João owns founder outreach and the production rollout (authorized by explicit 2026-09-16 GO)
**Depends on:** None.
**Coordination:** One-writer sequencing only with [PRD-traffic-recovery-2026-09](./traffic-recovery-2026-09.md) on `client/components/pages/HomePageClient.tsx`; neither PRD blocks the other.
**Baseline:** [30-day search-traffic action plan](../SEO/reports/2026-09-16-search-traffic-action-plan.md)

## Context

A confirmed locale-contract defect: `client/components/pages/HomePageClient.tsx:338` passes `freeCredits` while `locales/en/common.json:91` expects `{creditOffer}`, and the de/es/fr/it/ja/pt templates use `{freeCredits}` where `client/components/landing/HeroSection.tsx:85` and `client/components/landing/SectionSignupCTA.tsx:51` pass `creditOffer`. English renders the raw `homepage.finalCtaSubtext` key and German shows `homepage.ctaSubtext` twice. Region and locale are independent: each supported locale renders the offer for its regional eligibility case using the existing `welcomeCreditCopy` semantics (null → "Welcome credits vary by region", ≤0 → "Plans available in your region", otherwise "{n} welcome credits"). The regional grant can be 5, 3, or 0 credits, so the fix must render the correct regional wording, not merely remove the raw key and not literally advertise "0" free credits.

The user-reported Amplitude prompt funnel is 1,405 views → 191 clicks → 12 purchases (6.3% click-to-purchase; window and cohort unknown). Stripe complete windows: Aug 17–Sep 15 gross $428.17 / net of recorded refunds $379.17 / 52 charges, versus Jul 18–Aug 16 gross $435.80 / net $428.62 / 63 charges — captured payments, not revenue or profit. The 51 purchase events differ in window and funnels from the 12 purchases, and are events, not 51 unique users; do not subtract or blend. Supabase seven-day sign-up cohorts show 62.4% recorded usage, 4.2% two-usage-days (all sign-ups), 1.19% paid. COGS and actual fees are unknown.

**Household target (user-supplied, 2026-09-16):** **CAD 3,000 monthly take-home.** This is the required input for the day-14 income-gap decision and the single target definition for this PRD. Gross captured cash (the Stripe charge/settlement figures above) is **not** take-home; no tax, net-of-fee, or actual-profit conversion is assumed or invented here.

The business outcome is paying and repeat-use customers; a modest SEO rebound cannot be relied on to fund the household in 30 days. Reuse existing `server/services/revenue-recovery.service.ts`, `server/services/upscale-completion-health.service.ts`, and the read-only checkers `scripts/diagnostics/upscale-completion-rate.ts` / `scripts/monitor-processing-failure-rate.ts`; do not rebuild emails, checkout, guest mode, or the paywall, and do not change money logic or production data in this plan.

## Solution

1. **Fix the locale contract (day 1, ~1–2h).** Align caller and template across en/de/es/fr/it/ja/pt for each supported locale across the regional eligibility cases, using the existing `welcomeCreditCopy` semantics. The zero-credit case must show truthful no-free-offer wording ("Plans available in your region"), not literally advertise 0 free credits. Then assert the rendered homepage shows the expected offer wording and no raw `homepage.finalCtaSubtext` / `homepage.ctaSubtext` key, and that each `*Subtext` caller supplies its template's variables; assert the numeric value only where a credit count is appropriate.
2. **Follow the money before changing copy.** Trace the real ordered stages through `client/components/stripe/PurchaseModal.tsx` → `CheckoutModal.tsx` / `client/store/checkoutStore.ts` → `app/api/checkout/route.ts` → `app/api/webhooks/stripe/handlers/payment.handler.ts` (and `subscription.handler.ts`), with `server/analytics/coreKpiDefinitions.ts` as the existing definition source. `app/api/analytics/event/route.ts` is the client event sink, not the definition or source of all payments. Segment by trigger, device, sign-in state, plan; keep unknown windows/cohorts explicit. No defect was reproduced in the ordered stages, and five individual abandoned journeys were reviewed (read-only, anonymized) and showed early dismissal (closed within 1–3 s with no CTA click) with zero checkout errors — so the documented stop decision stands and no arbitrary paid-funnel redesign ships.
3. **Founder-led repeat-use test.** Start Sep 23–29, or earlier once proof and cost are ready. One existing paid batch workflow: 20 warm, permissioned prospects, stop after 20 contacts or the available demos. Report actual responses against learning thresholds, not a promised 5 demos / ≥2 paying accounts. Existing product and pricing; no feature build, ad spend, or discount; check variable compute cost first. Any checkout change is functionally tested in Stripe test mode only; revenue validation relies on lawful actual sales, never QA/test transactions.
4. **Weekly scorecard and day-14 decision.** One fixed definition each for paid customers/captured payments, click-to-purchase, qualified organic clicks, 7-day repeat usage, and actual processing cost per paid job/credit. At day 14, with no paid-segment signal and volume that cannot plausibly close the gap, reserve time for a separate near-term income source instead of escalating SEO or spend. A second 20-prospect expansion may begin Oct 7–16 once ≥2 real paying accounts exist and delivery/unit cost is acceptable, rather than waiting for Oct 16; the day-30 final review remains.

## Acceptance Criteria

- [x] AC-1 [local; actor: agent]: For each supported locale across the regional eligibility cases, the rendered homepage shows the expected offer wording per the existing `welcomeCreditCopy` semantics (including truthful no-free-offer wording for the zero-credit case) and no raw `homepage.finalCtaSubtext` / `homepage.ctaSubtext` key; the numeric value is asserted only where a credit count is appropriate. One locale-contract test is red on the caller/template mismatch and green after the fix, covering every `*Subtext` caller and template variable — Evidence: `tests/unit/i18n/homepage-credit-offer.unit.spec.ts` (new). Red run 2026-09-16 12:42 — `en.homepage.finalCtaSubtext needs {creditOffer}: expected [ 'freeCredits' ] to include 'creditOffer'` plus the de/es/fr/it/ja/pt `{freeCredits}` mismatch, 7 failed / 1 passed. Green after fix: 8/8 passed. `yarn verify` clean (tsc, lint, i18n:icu COMPLETE, schema, indexation gate, cache config) in 38.46s.
- [~] AC-2 [shared; actor: João, agent]: The locale fix and any justified AC-4 funnel fix are deployed through the authorized rollout; an unauthenticated public render in the supported locales shows the expected offer wording per region and no raw key, and a consented journey through the real client → modal → checkout path opens correctly with no fabricated paid transaction (any checkout change is functionally tested in Stripe test mode only). No funnel fix ships (AC-4 stop). **Shipped so far:** the locale fix is committed at `0fff2b59`, passed the release gate 19/19, and was fast-forward pushed to `origin/master` under the explicit owner GO; CI deploy run `35153609328` is queued. **Remaining implementation:** wait for the deploy, then confirm the unauthenticated public render has 0 raw keys in `/` and the six locales and shows region-appropriate wording, and run the consented checkout journey — Evidence: rollout in flight; public readback pending.
- [x] AC-3 [local; actor: agent]: One paid-stage definition is recorded and reconciled against the traced client → modal → checkout → webhook purchase events (not `app/api/analytics/event/route.ts` alone), with unknown windows/cohorts preserved and an owner named — Evidence: definition and reconciliation in **Paid-stage definition** and **Funnel trace** below. Owner: Billing (per `server/analytics/coreKpiDefinitions.ts`). Reproduce with `yarn diag:paid-funnel --start 20260817 --end 20260915`.
- [x] AC-4 [local; actor: agent]: Exactly one evidence-backed funnel fix exists, or a documented stop decision follows five abandoned journeys/consented feedback; no arbitrary copy change ships — Evidence: a **STOP decision on shipping** is recorded in **AC-4 stop decision** below (no product-code funnel change), now backed by five individual abandoned journeys reviewed read-only via the Amplitude Export API (anonymized, Sep 14 2026). All five opened `purchase_modal` and dismissed via `close_button`/`backdrop` within 1–3 s with no `purchase_cta_clicked`; 4/5 defaulted to the credits tab, 1/5 was `outOfCredits`; zero `checkout_error`/`checkout_abandoned`. That is early dismissal, not a broken paid path, so the stop decision is evidence-backed and no paid-funnel redesign ships. Separate telemetry caveat retained: `plan_selected` is an **UNKNOWN ingestion status**, not a proven never-ingested defect (`400 "Invalid chart definition"` is indistinguishable from a fabricated event name), so only totals are asserted.
- [x] AC-5 [local; actor: agent]: Job health and recovery delivery are evidenced separately from read-only sources — (a) job health: `yarn diag:upscale-health --start YYYYMMDD --end YYYYMMDD` (read-only current production Amplitude; no offline input), with optional `yarn analytics:processing:monitor --mode test --input <anonymized-attempts.json>` (offline checker validation only); (b) recovery delivery: a bounded read-only aggregate over the observed `revenue_recovery_intents` / `email_lifecycle_queue` schema, since no existing read-only command audits it. A fixture alone cannot establish production job or recovery health. No emails, lifecycle jobs, or `--mode live`; credentials read-only via the gcloud-secrets skill, required only, never printed — Evidence: **Job health** and **Recovery delivery** below. Credentials fetched read-only from `myimageupscaler-api-prod` / `myimageupscaler-client-prod` via the project service account; no value printed, no secret version created, no production row written. `--mode live` never used; the offline `analytics:processing:monitor` validation was skipped (no anonymized attempts fixture on hand) and is optional per this AC.
- [ ] AC-6 [owner; actor: João]: The founder-led test is STARTED Sep 23–29 (or earlier once proof/cost is ready) and stopped after 20 contacts or the available demos; actual responses and learning thresholds are reported with no guaranteed 5 demos / 2 paid — Evidence: pending.
- [ ] AC-7 [owner; actor: João]: The required household take-home target is recorded — **CAD 3,000/month, supplied 2026-09-16** — and João retains the weekly payer/repeat/cash review through Oct 16, the day-14 income-gap decision (continue or refocus), and the day-30 final review, each recorded with the exposure count. Captured gross cash is not treated as take-home, and no tax or actual-profit assumption is invented — Evidence: target recorded 2026-09-16; weekly, day-14, and day-30 reviews still pending.
- [~] AC-8 [local; actor: agent]: Actual processing cost per paid job/credit and Stripe fees are obtained and recorded before any margin, spend-scale, or price-cut claim; an unavailable input is recorded pending/UNVERIFIED — never treated as a pass or as unknown-and-closed — Evidence: **Cost inputs** below. Stripe fees OBTAINED (actual settlement figures, grouped by settlement currency). Processing cost per job **UNVERIFIED** — runtime measured, dollar rate not obtainable from the Replicate API. AC-8 is therefore PARTIAL: the missing input is genuinely open, and the availability of the fee input does not make all cost evidence complete. No margin, spend-scale, or price-cut claim is made anywhere in this PRD.

## Integration Ledger

| Capability             | Reachable consumer/trigger                                                                                                                                                                                                                         | Replaces / disposition                                                 | Evidence                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| Homepage offer text    | Home render of `/` and localized routes via `HomePageClient.tsx:338`, `HeroSection.tsx:85`, `SectionSignupCTA.tsx:51` → `locales/*/common.json` `finalCtaSubtext` / `ctaSubtext`                                                                   | Raw-key render replaced by localized region-appropriate credit wording | AC-1 done; AC-2 rollout in flight      |
| Paid funnel definition | Client `PurchaseModal.tsx` → `CheckoutModal.tsx` → `app/api/checkout/route.ts` → `app/api/webhooks/stripe/handlers/payment.handler.ts`; definition source `server/analytics/coreKpiDefinitions.ts`; client sink `app/api/analytics/event/route.ts` | Telemetry unchanged — stop decision recorded, no fix shipped           | AC-3 done; AC-4 met (5-journey stop)   |
| Job health             | `server/services/upscale-completion-health.service.ts` via `scripts/diagnostics/upscale-completion-rate.ts` (read-only Amplitude) and `scripts/monitor-processing-failure-rate.ts` (offline `--mode test`)                                         | Reused read-only; Sep 1–8 incident found, recovered Sep 9              | AC-5a done                             |
| Recovery delivery      | No existing read-only aggregate command; audit `revenue_recovery_intents` / `email_lifecycle_queue` with a bounded read-only query (`server/services/revenue-recovery.service.ts` writes them)                                                     | Audited via new read-only `yarn diag:paid-funnel`; no emails sent      | AC-5b done                             |
| Founder-led test       | No runtime code; João outreach and tracking assets                                                                                                                                                                                                 | None                                                                   | AC-6                                   |

## Execution Phases

#### Phase 1: Locale-contract offer fix

**Status:** DONE (AC-1); AC-2 partial — locale fix committed at `0fff2b59`, release-gated 19/19, pushed to `origin/master`, CI deploy run `35153609328` queued; public readback pending
**ACs:** AC-1, AC-2
**Files:** `client/components/pages/HomePageClient.tsx`, `locales/en/common.json`, `locales/{de,es,fr,it,ja,pt}/common.json` (`ctaSubtext` L16 / `finalCtaSubtext` L39); one focused locale test (not counted).
**Implementation:** make every template consume `{creditOffer}` and every caller pass `creditOffer` through `welcomeCreditCopy`, so each locale renders its regional eligibility case (including truthful no-free-offer wording at zero); assert no raw key renders and each template variable is supplied, asserting the numeric value only where appropriate. One file writer at a time — coordinate the homepage caller with traffic.
**Verification:** E1 — `yarn test:unit tests/unit/i18n/locale-credit-parity.unit.spec.ts` (or a new sibling `<planned>.unit.spec.ts`, marked planned) test-first red from the raw key/mismatch, then green, plus a rendered-output assertion for the supported locales showing the expected regional wording; `yarn verify` once for the actual code/template change (AC-1). E2 — [owner] production rollout, then unauthenticated public render and consented checkout journey; any checkout change is functionally tested in Stripe test mode only (AC-2).
**Checkpoint:** AC-1 verified 2026-09-16. Actual change (11 files, all in the planned surface):

- `shared/config/product-capabilities.ts` — added `welcomeCreditOfferKey(credits)`, the localized counterpart of `welcomeCreditCopy`, returning `creditOfferUnknown` / `creditOfferNone` / `creditOfferCount` for the same three eligibility cases. `welcomeCreditCopy` is unchanged and still used by the English-only pSEO `CTASection`.
- `locales/{en,de,es,fr,it,ja,pt}/common.json` — `ctaSubtext` / `finalCtaSubtext` (and `pricingCtaSubtext` where present) now consume `{creditOffer}`; each locale gained the three `creditOffer*` strings.
- `client/components/landing/HeroSection.tsx`, `client/components/landing/SectionSignupCTA.tsx`, `client/components/pages/HomePageClient.tsx` — all three callers now pass `creditOffer = t(welcomeCreditOfferKey(credits), { credits })`.

**Deviation from the planned implementation, deliberate:** the plan said pass `creditOffer` through `welcomeCreditCopy`. `welcomeCreditCopy` returns hardcoded English, so doing that literally would have rendered "5 welcome credits • Keine Kreditkarte erforderlich • …" on the German homepage — trading a raw key for an English fragment inside six localized pages. The offer wording is therefore localized per locale while keeping the exact `welcomeCreditCopy` semantics (null → vary-by-region, ≤0 → plans-available, otherwise the count). Zero-credit regions render "Plans available in your region" and never the numeral 0, asserted by the test.

**Shipping progress 2026-09-16:** the fix is committed at `0fff2b59`, passed the local release gate (`yarn test:upscale:release` 19/19, 6.7m, no retries; homepage locale 8/8) and `yarn verify`, and was fast-forward pushed to `origin/master` (`c3ce6f93..0fff2b59`) under the explicit owner GO; CI deploy run `35153609328` is queued. The full 467-test browser suite was stopped, not passed. AC-2's public readback remains after the deploy. Caveat: the gate is local and its provider/Auth/Storage transport is simulated, not production proof; the untracked release-candidate identity/build log in `test-results/async-upscale-runtime/` was later deleted by a generic Playwright `test-results/` reset (the gate console log survives at `/tmp/homepage-release-log.8Fq8dr`, `GATE_EXIT=0`, `19 passed`, `Done in 402.43s`; the report holds the actual digests `sourceSha256 ddd6647e…`, `bundleSha256 9b7d9fc8…`).

#### Phase 2: Funnel truth, job health, and repeat-use

**Status:** PARTIAL — AC-3, AC-4, AC-5 done; AC-8 partial (processing cost UNVERIFIED); AC-6 and AC-7 open
**ACs:** AC-3, AC-4, AC-5, AC-6, AC-7, AC-8
**Files:** none until a defect is verified; then only the specific telemetry/flow file the trace names (`app/api/analytics/event/route.ts` is the client sink, not the definition source). Read-only checkers only. No product code for the outreach test; tracking/proof assets only.
**Implementation:** write one paid-stage definition and reconcile it against the traced event sources; make at most one evidence-backed fix; RUN the read-only health checkers; run the founder test to its stop rule; gather cost inputs and the weekly/day-14 decision. Never rebuild emails or checkout.
**Verification:** E3 — reconciliation output against the traced stages, plus `yarn test:unit <actual planned path>` (marked planned if new) through the real entry point where a fix is made, with `yarn verify` once for the actual code change (AC-3, AC-4). E4 — job-health output from `yarn diag:upscale-health --start YYYYMMDD --end YYYYMMDD` (read-only current production; required), plus optional validation of the offline monitor `yarn analytics:processing:monitor --mode test --input <anonymized-attempts.json>`, plus a separate bounded read-only recovery-delivery aggregate over `revenue_recovery_intents`/`email_lifecycle_queue` (AC-5); a fixture alone cannot establish production job or recovery health and `--mode live` (which emails) is never used. E5 — recorded prospect responses and exposure count, cost inputs (or pending/UNVERIFIED, never a pass), and the weekly/day-14 review (AC-6, AC-7, AC-8). No real emails or jobs triggered.
**Checkpoint:** 2026-09-16 — AC-3 and AC-5 verified; AC-4 now met (five-journey stop review recorded; no funnel fix ships); AC-8 recorded PARTIAL with its evidence gap open (see **Phase 2 findings** above). AC-6/AC-7 open.
One file added beyond the "read-only checkers only" allowance: `scripts/diagnostics/paid-funnel-scorecard.ts`
(+ `yarn diag:paid-funnel`, + `tests/unit/diagnostics/paid-funnel-scorecard.unit.spec.ts`). It replaces the
five throwaway probes used during the trace with a single read-only command, so the weekly scorecard in
Solution item 4 is reproducible instead of hand-rebuilt each week. No product, telemetry, money-logic, or
schema file was touched; no production data was written. `yarn verify` clean; affected-area unit tests 62/62.

**Correction pass 2026-09-16 (bounded):** household take-home target recorded (CAD 3,000/month); the
`formatMinorUnits` helper now scales by Stripe's minor-unit rules (not ISO/`Intl`) so ISK/UGX (`500` = 5)
and MGA (`500` = 500) are correct; `parseScorecardArgs` rejects a recovery window that overflows the
`Date` range before any external call; `runScorecard` is exported with one mocked entry-point regression
test covering whole-interval totals (not summed daily uniques), the single OR-filtered checkout query,
UNKNOWN-preserved/no-NEVER, sanitized auth/transport rejection, and separate charge currencies.
Affected-area tests 36/36 (scorecard 14, dashboardApi 7, upscale-completion-health 1, check-payment-decline 6,
homepage-credit-offer 8); `yarn verify` PASS (~42s: tsc, lint, i18n ICU COMPLETE, schema, indexation gate,
cache config 11/11). No production remeasurement; PRDs remain PARTIAL where their ACs say so.

## Phase 2 findings (2026-09-16)

The figures below are retained as historical read-only production observations. **Provenance caveat:**
the original reproduction script summed Amplitude's **daily** uniques, which cannot establish
whole-interval distinct users. The separate probes' exact aggregation is not established here, so
the historical unique-user figures and their derived ratios remain **UNVERIFIED** pending
remeasurement with the corrected scorecard (`seriesCollapsed`). Event totals are retained as
recorded; no production remeasurement occurred during this review. Run the corrected command with
`yarn diag:paid-funnel --start 20260817 --end 20260915` (`scripts/diagnostics/paid-funnel-scorecard.ts`,
run with the prod `.env.api` **and** `.env.client` values loaded — `SUPABASE_URL` resolves from
`NEXT_PUBLIC_SUPABASE_URL`, which lives in the client secret).

### Paid-stage definition (AC-3)

**The paid stage is `purchase_confirmed`.** One event per confirmed initial charge, emitted
server-side from the Stripe webhook handlers (`payment.handler.ts`, `subscription.handler.ts`,
`invoice.handler.ts`), `kpiRole: 'purchase_conversion'`, owner **Billing**. It is not
`checkout_completed` (a session can complete with payment still pending) and not
`revenue_received` (which also counts recurring charges). `app/api/analytics/event/route.ts`
is the client sink and carries none of these three.

Counting rule: **totals** count payment events; whole-interval **uniques** count distinct event
users. Neither is a transaction-level reconciliation. The historical unique-user column has
unverified aggregation and must not be used as an established customer count.

### Funnel trace, Aug 17 – Sep 15 2026 (30 complete days)

| stage                          | totals (recorded) | reported uniques (UNVERIFIED) | kpi role                |
| ------------------------------ | ----------------: | ----------------------------: | ----------------------- |
| `monetization_surface_shown`   |             2,334 |                         1,448 | ctr_denominator         |
| `purchase_modal_opened`        |             2,659 |                           877 | surface detail          |
| `monetization_surface_clicked` |               288 |                           233 | ctr_numerator           |
| `checkout_modal_mounted`       |               261 |                           134 | checkout surface        |
| `checkout_opened`              |               164 |                           134 | checkout_start          |
| `checkout_error`               |                 6 |                             3 | checkout_friction       |
| `checkout_abandoned`           |                58 |                            48 | checkout_friction       |
| `checkout_completed`           |                50 |                            47 | checkout_funnel_only    |
| **`purchase_confirmed`**       |            **50** |                        **47** | **purchase_conversion** |
| `revenue_received`             |                50 |                            47 | recognized_revenue      |

**Aggregate comparison against Stripe (same date labels):** 52 succeeded charges vs 50 recorded
`purchase_confirmed` events gives a 96.2% count ratio. This does **not** establish capture coverage or
two missing events: the Amplitude project time zone is unverified, Stripe uses UTC, and no
transaction-level join proves matching populations. Stripe charge-currency gross USD $428.17 less
$49.00 currently recorded refunds = $379.17; this is a charge-creation snapshot, not profit.

**Window/cohort caveat, preserved:** the user-reported 1,405 → 191 → 12 funnel (6.3% ratio) is a
_different, unknown_ window and cohort. Measured here for Aug 17 – Sep 15: totals 2,334 → 288 → 50,
with unverified reported ratios of 16.1% surface CTR and 20.2% purchase/click (22.6% over
checkout-bound clickers). These are **aggregate period ratios, not a cohort conversion funnel**, and
the unique-count denominators are unverified. Do not blend, subtract, or reconcile the two sets.

**Definitional note, unverified:** `monetization_surface_clicked` is the declared `ctr_numerator`,
but its `destination` property showed ~11% of reported clickers routed to `model_gallery`, a
destination that cannot reach a checkout in the same step. Any purchase/click ratio computed over
all clicks understates checkout intent. That figure came from the pre-correction probes with unverified aggregation
and is pending remeasurement; the scorecard now reports one OR-filtered checkout-bound count instead
of summing per-destination users.

### AC-4 stop decision — no funnel fix shipped

**Five individual abandoned journeys were reviewed** (read-only Amplitude Export API, anonymized, Sep 14
2026, stages/timestamps only): 5/5 opened `purchase_modal` and dismissed via `close_button`/`backdrop`
within 1–3 s with no `purchase_cta_clicked`; 4/5 defaulted to the credits tab/small pack; 1/5 was
`outOfCredits` (`requiredCredits=1`, balance 0) and bounced three times. Zero `checkout_error`/
`checkout_abandoned` in the sample, and the ordered `PurchaseModal` → `CheckoutModal` → `checkoutStore` →
`app/api/checkout/route.ts` → Stripe webhook path reproduced no dead-end or unsupported branch (the
`model_gate` → `upgrade_plan_modal` fallback lands on the normal credits modal by design). This is fast
early dismissal, not a broken paid path. The aggregate segmentation below is retained as
corroborating context only, with its unverified unique counts unchanged.

- exit method: 683 `close_button`, 79 `backdrop` (reported uniques, unverified) — deliberate dismissal, not mis-click
- active tab at abandonment: 710 `credits`, 56 `subscribe` (unverified)
- 487 abandoned while `outOfCredits: true` (unverified)
- `checkout_abandoned` step: 24, all `plan_selection`; `checkout_error` only 3 (unverified)

The aggregates show _where_ users leave, not _why_ (877 reported modal openers, 233 click anything,
26.6% unverified). **Decision: ship no funnel change and no arbitrary copy or default-tab change** — the
five journey reviews above close the AC-4 evidence requirement.

Two findings handed to João rather than acted on:

1. **The purchase modal opens on the credits tab for 875 of 894 reported openers (97.9%,
   unverified)** (`PurchaseModal.tsx:203`, `useState<'credits' | 'subscribe'>('credits')`).
   Purchases follow the default: recorded totals show the product selling almost only one-time
   credit packs rather than subscriptions in the window. The PRD's stated outcome is
   repeat-use/recurring customers, so the default is worth a decision. Flipping it is a
   pricing/product call with real downside risk for out-of-credit users, so it is not an agent-side
   fix — it is a decision for the day-14 review.
2. **`plan_selected` ingestion status is UNKNOWN, not proven zero.** Declared `status: 'active'` with
   `kpiRole: 'offer_selection'` in `coreKpiDefinitions.ts`, whitelisted in the analytics route,
   typed, and live at `PricingPageClient.tsx:214` since commit `2b3d4b67` (2026-03-20) — yet the
   Dashboard API answers it identically to a fabricated event name (400 "Invalid chart definition").
   That response is **indistinguishable from a never-ingested event, so no "never once in six months"
   claim is made**. Three hypotheses were tested and **falsified**: (a) `getPlanForPriceId` returning
   null — it resolves all four live plan price IDs; (b) stale client/server price-ID drift — all
   seven prod price IDs match between `myimageupscaler-api-prod` and `myimageupscaler-client-prod`;
   (c) KPI schema rejection in `app/api/analytics/event/route.ts` — no such validation exists there.
   Per the retry circuit breaker, this escalates rather than getting a fourth guess. Impact is
   contained: `plan_selected` only ever covers the pricing page (158 `pricing_page_viewed` in 30
   days), so the offer-selection stage is effectively blind on the smallest surface, and no other
   stage depends on it.

### Job health (AC-5a)

`yarn diag:upscale-health --start 20260901 --end 20260915`, read-only against current production
Amplitude (no offline input):

```
date       started  completed  processing_failed  completion_rate
2026-09-01     161         93                 64             0.58
2026-09-02     151         93                 54             0.62
2026-09-03     223        116                108             0.52
2026-09-04     343        192                162             0.56
2026-09-05     122         86                 36             0.70
2026-09-06     261        160                 98             0.61
2026-09-07     279        141                144             0.51
2026-09-08      95         31                 67             0.33
2026-09-09     289        269                 20             0.93
2026-09-10     186        172                 14             0.92
2026-09-11     134        126                  8             0.94
2026-09-12      97         89                  8             0.92
2026-09-13     127        117                 10             0.92
2026-09-14      99         92                  7             0.93
2026-09-15      60         56                  4             0.93
Last complete day: 2026-09-15 ratio=0.93 threshold=0.95
```

**Sep 1–8 ran at a 0.33–0.70 completion rate — roughly half of all upscale attempts failed for eight
days — then recovered to ~0.93 on Sep 9 and has held there.** The checker exits non-zero because
0.93 is still under the 0.95 threshold. This is now checked, so it can be stated: there _was_ an
eight-day processing incident inside this PRD's baseline period, it ended Sep 9, and current health
is degraded-but-stable rather than broken. Whatever changed on Sep 9 is not identified here.

### Recovery delivery (AC-5b)

Bounded read-only aggregate, last 30 days, over the observed schema. No email sent, no job run,
no `--mode live`.

`revenue_recovery_intents` — 139 rows, every one `audience_key = checkout_abandoner`:
93 queued, 40 converted, 5 active, 1 expired.

`email_lifecycle_queue` — 12,203 rows: **5,463 pending, 3,207 skipped, 2,526 sent, 1,007 cancelled.**
Top skip/cancel reasons: 2,785 `suppressed_campaign_cooldown`, 916 `stale_first_result_followup`,
226 `suppressed_lifecycle_weekly_cap`, 195 `suppressed_revenue_72h_cap`.

**5,462 of the 5,463 pending rows are already past their `scheduled_for` time.** Only ~84 emails a
day actually send, against the ~240/day drain ceiling. The queue is not draining; it is accumulating
a permanently-late backlog that is 45% of everything queued. Recovery delivery is therefore _not_
healthy, and any plan that assumes lifecycle email will recover revenue is assuming throughput the
system does not have.

### Cost inputs (AC-8)

**Stripe fees — OBTAINED.** Settlement balance transactions _created_ Aug 17 – Sep 15, grouped by
settlement currency **CAD**: 52 charge/payment transactions, gross CAD 592.64, **fees CAD 49.50 =
8.35% effective**, avg fee CAD 0.952 per transaction. Charges are counted by charge-creation time and
refunds are the amounts currently recorded on them (not window-bounded); the USD $428.17
charge-currency gross and the CAD 592.64 settled gross are overlapping payment views, so do **not**
add them. Their different creation-time filters need transaction-level reconciliation before claiming
an exact currency-converted match. These are cash movements, not profit. The observed effective fee
rate is 8.35%; allocating it to fixed, cross-border, or conversion fees requires fee-detail evidence.

**Processing cost per paid job/credit — UNVERIFIED, pending.** Measured from the Replicate
predictions API: 97 succeeded predictions sampled (Sep 15–16), `predict_time` mean 12.84s,
median 11.00s, p90 22.88s, max 44.97s. Model mix on that page: `nightmareai/real-esrgan` 81,
`cjwbw/real-esrgan` 13, `recraft-ai/recraft-crisp-upscale` 2, `lqhl/realesrgan` 1. The dollar figure
requires the per-second hardware rate for each model, which neither the predictions nor the models
endpoint returns. **Recorded pending/UNVERIFIED — not a pass, not unknown-and-closed.** To close it,
João supplies the Replicate hardware rate (or a billing-period invoice total ÷ predictions).
Until then no margin, spend-scale, or price-cut claim may be made.

### Still owner-blocked or open

- **AC-2** — rollout in flight: the locale fix is committed at `0fff2b59`, pushed to `origin/master`,
  and CI deploy run `35153609328` is queued. Remaining implementation is post-deploy readback only:
  confirm 0 raw keys and region-appropriate wording in the unauthenticated public render for `/` and
  the six locales, then run the consented checkout journey.
- **AC-4** — met: five individual abandoned-journey reviews (read-only, anonymized) show early dismissal
  and no checkout defect, so the stop decision is evidence-backed and no funnel change ships.
- **AC-6** — the founder-led 20-prospect test (starts Sep 23–29).
- **AC-7** — the household take-home target is recorded (CAD 3,000/month, 2026-09-16); the weekly
  review, the day-14 income-gap decision, and the day-30 final review are still pending and need
  the exposure count. The day-14 decision on Sep 30 can now be made against the recorded number,
  but no production remeasurement has happened.
- **AC-8 (partial)** — processing cost per job is UNVERIFIED and must be closed before any margin,
  spend-scale, or price-cut claim. Fee evidence being available does not close the AC.
- **Unverified uniques** — the historical unique-user figures and ratios above need remeasurement with
  the corrected whole-interval scorecard before they are used as customer counts or funnel rates.

## Schedule (Sep 16 – Oct 16, 2026)

- **Day 1 / Week 1:** ship the locale-contract fix and its test; record the household take-home target (**CAD 3,000/month, supplied 2026-09-16**) and keep sourcing the billing/cost inputs (Stripe fees obtained; processing cost pending); capture the paid-stage definition; RUN the read-only job-completion health check (`yarn diag:upscale-health --start YYYYMMDD --end YYYYMMDD`). Do not announce an outage before that check.
- **Week 2 (Sep 23–29):** implement one justified fix from the trace or record the stop; START the founder-led test (or earlier once proof and cost are ready). The September 28 flagship read is traffic-owned and provisional.
- **Day 14 / Sep 30:** review the test with the exposure count; if no paid-segment signal exists and volume cannot close the gap, record the income-gap refocus. Weekly metrics continue through Oct 16.
- **Day 30 / Oct 16:** final cost/paid review. A second 20-prospect expansion may start any time Oct 7–16 once ≥2 real paying accounts exist and delivery/unit cost is acceptable, rather than waiting for Oct 16; the day-30 final review remains. No ad spend.

## Out of Scope

- Rebuilding emails, checkout, guest mode, or paywall enforcement.
- Billing-logic, pricing, or production-data changes without a later verified finding that warrants revised scope.
- Traffic content/GSC/performance ownership; revenue owns the paid-event attribution definition and publishes it for traffic to consume.
