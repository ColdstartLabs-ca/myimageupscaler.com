# 30-day traffic and revenue plan — September 16 to October 16, 2026

This is the single action plan for the next 30 days, through October 16. Its purpose: repair the friction we can verify, test one direct route to qualified paying customers, and protect the organic pages that still carry the site. "Latest" means the newest complete data (GSC through September 13, Stripe through September 15). One candid sentence on the money: at roughly $379 in captured payments net of recorded refunds, before fees, costs, or taxes, a modest SEO rebound cannot be relied on to fund a family within 30 days.

## TLDR (ranked)

1. **Fix the broken homepage offer today.** English renders the raw key `homepage.finalCtaSubtext`; German shows `homepage.ctaSubtext` twice. A small bounded locale-contract repair (~1–2 hours) aligns caller and template across en/de/es/fr/it/ja/pt, plus a test.
2. **Follow the money after the upgrade click.** User-reported Amplitude chart: 1,405 viewers → 191 clickers → 12 purchasers, **6.3% click-to-purchase** ([upgrade funnel](https://app.amplitude.com/analytics/coldstartlabs-552056/chart/g9ammnw8), window unknown). Trace click → modal → checkout → payment, segmented by trigger, device, sign-in state, and plan, before changing any copy.
3. **Ask existing repeat-use buyers directly.** One founder-led batch-workflow test (for example, product-catalog images): 20 warm, permissioned prospects → 5 demos → at least 2 paying accounts — a learning test, not a forecast, prioritized over small blog CTR work.
4. **Keep SEO bounded and protect what works.** Preserve the two pages that still supply most clicks, make the one factual correction on the flagship, and run at most one optional first-paragraph test. No rebuilds, no ten new posts.
5. **Investigate slow mobile server response.** In local lab, TTFB dominates observed LCP in the two cold mobile samples. Investigate origin and HTML cache first — not a guaranteed cause of the simulated 4.54s LCP.

## Baseline

All amounts are USD.

| Signal                                                  | Latest                                                                      | Previous                                                | Read                                                                                                                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Organic clicks (GSC)                                    | 6,200 (Aug 17–Sep 13)                                                       | 7,523 (Jul 20–Aug 16)                                   | −17.6%                                                                                                                                                       |
| Captured payments (Stripe)                              | $379.17 net of recorded refunds / 52 charges (Aug 17–Sep 15); gross $428.17 | $428.62 net / 63 charges (Jul 18–Aug 16); gross $435.80 | −11.5% net; −1.8% gross                                                                                                                                      |
| Upgrade funnel (user-reported Amplitude, Aug 17–Sep 16) | 1,405 view → 191 click → 12 purchase                                        | —                                                       | **6.3% click-to-purchase** ([chart](https://app.amplitude.com/analytics/coldstartlabs-552056/chart/g9ammnw8)); 0.85% end-to-end; window/cohort not inspected |
| Mature activation and repeat (Supabase 7-day cohorts)   | 62.4% recorded usage, 4.2% two usage-days, 1.19% paid                       | 54.5%, 4.1%, 0.72%                                      | recorded usage up, repeat flat                                                                                                                               |
| Mobile lab (local Lighthouse 12.8.2, 3 runs)            | performance median 76; simulated LCP 4.54s; CLS .003; TBT 199ms             | desktop 98 / LCP 0.89s                                  | TTFB-dominated                                                                                                                                               |

Recorded charge-cohort refunds (attributed to charge-created date, not refund-date cash flow): $7.18 → $49.00.

Sign-up cohorts, each with a fixed 7-day window: previous Jul 15–Aug 11 (n=4,141); current Aug 12–Sep 8 (n=2,764). "Recorded usage within 7 days" (usage-ledger proxy) 54.5% → 62.4%; "2 usage-days within 7 days" 4.1% → 4.2%; actual paid 0.72% → 1.19%. These are not download-completion or D7 retention rates.

Traffic and payments both fell, but payments fell less than traffic, and the two big pages' click losses were offset by gainers elsewhere — these aggregates do not establish a sitewide conversion collapse.

Financial reality check. The required household take-home remains unspecified: on day 1, write it down and retrieve actual processing/fee costs. The illustrative $1,000 and $2,000 monthly figures are not user targets or forecasts. At the current $379.17 ÷ 52 ≈ $7.29 captured net of recorded refunds per charge, $1,000 needs ≈138 total charges and $2,000 ≈275 at the unchanged mix (ceil of the unrounded ratio), before fees, taxes, and compute. Two new buyers is only a learning gate. If by day 14 there is no paid-segment signal and the confirmed gap still cannot fit plausible volume, reserve time for a separate near-term income source instead of escalating SEO or spend.

## Four levers

### 1. Remove the confirmed friction, then follow the upgrade path

**First deliverable (day 1):** correct the homepage offer. `HomePageClient.tsx:338` passes `freeCredits` while `locales/en/common.json:91` expects `{creditOffer}`; the non-English templates (de/es/fr/it/ja/pt) still use `{freeCredits}` where `HeroSection.tsx:85` and `SectionSignupCTA.tsx:51` pass `creditOffer`. Align caller and template across those locales, then add a test asserting the rendered homepage contains no raw `homepage.finalCtaSubtext`/`homepage.ctaSubtext` key and each `*Subtext` caller supplies its template's variables. Small bounded locale-contract repair, ~1–2 hours. Root cause: `/tmp/miu-performance-review.json` (confirmed by 4/4 local Lighthouse runs and live HTML).

**Then:** trace after the upgrade click (191 → 12, **6.3%**, [chart](https://app.amplitude.com/analytics/coldstartlabs-552056/chart/g9ammnw8), window unknown). Segment by trigger, device, sign-in state, and plan, and walk click → modal → checkout → payment to find where intent is lost. ~4–6 hours.

**Job health:** the September 8 completion repair likely helped; validate it with the existing unique/job terminal-status checker — do not announce a new outage before that check.

**Success / stop:** three consented end-to-end journeys complete, or one reproducible error is found and fixed. Keep one definition of the business metric — click-to-purchase, weekly paying customers, net payments. Audit the existing recovery automation (revenue-recovery service, email-lifecycle job); do not build new emails. If the trace finds no defect or mismatch, do not make an arbitrary controlled change: review five abandoned journeys or available consented feedback, then choose one evidence-backed test or stop. Functional flow can be verified in test mode — real or fabricated paid transactions are not needed for that; only legitimate actual sales validate processed revenue.

**Owner:** dev agent implements, João reviews.

### 2. Add qualified repeat-use customers directly

**First deliverable / shape:** pick one existing paid repeat-use workflow (for example, product-catalog batch images), assemble real owned before/after proof, and run a founder-led test: 20 warm, permissioned prospects → 5 demos → at least 2 paying accounts. These are learning thresholds, not a forecast or a family-income goal. Use the existing product and pricing — no feature build, new service, or artificial offer; no ad or new-tool budget, and existing credits with measured compute. Check variable compute cost before any discount or high-volume deal.

**Evidence:** repeat use is structurally low (4.2% of sign-ups use the product on two or more days within a week), so growth needs a genuinely repeatable workflow for a defined buyer, not habit messaging. Cutting the free grant is not the lever: it varies by region (5 / 3 / 0).

**Success / stop:** if there are no qualified replies after 20 contacts, or nobody pays after the demos, change the segment or offer before expanding. One community case study may be posted only with the owner's explicit approval; nothing is sent in this plan.

**Owner:** João for outreach, dev agent for tracking and proof assets. ~4–6 hours per week.

### 3. Protect and slowly recover the organic owners

**First deliverable:** preserve the homepage fixed-query baseline on September 21 and keep the existing reviews on schedule (Topaz September 18; poster and Photoshop September 21; the three description tests September 22). Do not rebuild the gated high-volume experiments.

**Then:** make one bounded fact correction on the flagship article (`/blog/best-free-ai-image-upscaler`) — update the four contradicted competitor figures and the "Tested" heading to "Compared" so it matches the page's own no-benchmark disclosure. Record and reset only that page, separate from any traffic or growth claim. ~2–3 hours.

The four corrections (vendor-stated as of 2026-09-16, not independently export-tested):

| Vendor        | Current published policy                       | Primary link                                                         |
| ------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| Let's Enhance | 10 signup credits, once; free tier watermarked | [letsenhance.io/pricing](https://letsenhance.io/pricing)             |
| Bigjpg        | 20 pictures/month, free up to 4x               | [bigjpg.com](https://bigjpg.com/)                                    |
| Pixelcut      | 3 free downloads/day, watermark-free           | [pixelcut.ai/image-upscaler](https://www.pixelcut.ai/image-upscaler) |
| Img.Upscaler  | 50 credits/month                               | [imgupscaler.com/pricing](https://imgupscaler.com/pricing)           |

**Evidence:** GSC shows the homepage lost 941 clicks and the flagship lost 666, partly offset by gainers, so those two pages are the ones to protect. For Three Kings there is no high-confidence, high-volume, eligible-now candidate.

**Decision rules (operational, not statistical proof):** on September 21 compare September 11–17 vs September 4–10 on the same five pinned non-brand queries, country, and device with matched weights; brand stays separate. On a closed article window: KEEP if clicks/CTR improve and matched positions are stable; if CTR falls with stable positions and impressions, run one next truthful snippet test after a SERP check; if positions worsen, check intent, the current weak king, and on-page proof before more metadata. Do not treat any previous claim as one that must be restored, and do not promise a 17.6% rebound. The 1,320 in-band impressions at 2% would be about 26 clicks (+25 over baseline) — arithmetic, not a forecast or main income lever. New content only if a genuine unserved commercial query appears.

**Owner:** dev agent, João reviews.

### 4. Repair mobile server response

**First deliverable:** investigate origin and HTML cache behaviour and response-time variability using the same local method (Lighthouse 12.8.2). Do not start with the hero image or a JavaScript rewrite.

**Evidence:** three-run LOCAL lab, not Google-hosted field data (the PageSpeed API returned a 429 quota error, so no Google-hosted score is available). Two cold mobile samples show document/server response (TTFB) at 81–86% of observed LCP, while the hero image loaded in 28–119ms observed; the other mobile sample was warm and faster (~207ms observed TTFB). This is where to investigate first — not a guaranteed sole cause of the simulated 4.54s LCP. Do not mix observed TTFB with the simulated LCP number. Evidence: `/tmp/miu-performance-review.json`.

**Success / stop:** after an actual change, run three new comparable mobile runs and reach a lab median LCP of ≤2.5s ([web.dev LCP](https://web.dev/articles/lcp)); this 2.5s is an operational lab target, and Google's official field assessment uses the 75th percentile, not a 3-run median. Do not repeat the baseline three-run set before any change without cause. Check the field data (114 affected URLs, validation started September 8, rolling 28-day window) around October 6. If the TTFB variance does not reproduce, stop and report. This is not a claim that performance caused the search decline.

**Owner:** dev agent. ~3–5 hours.

**Weekly scorecard (five distinct metrics weekly, using Amplitude + Stripe payer cohorts now):** (1) successful paid customers and captured payments net of recorded refunds (one business row); (2) upgrade click → purchase with a single fixed definition; (3) qualified organic clicks and core-query positions; (4) 7-day repeat USAGE for all new sign-ups with a mature fixed 7-day window (the 4.2% baseline uses this denominator); if an activated-only repeat is added, label it a separate cohort with no claim its baseline is 4.2%; (5) actual processing cost per paid job/credit. COGS is currently unknown, so obtain billing cost first before any margin claim. A bounded GA ID repair is in scope only if needed to measure a new channel; do not rely on GA4 organic revenue, which is largely Unassigned.

## Calendar

**Week 1 (Sep 16–22):** fix the homepage locale contract and add its test; trace the upgrade funnel; validate job-completion health with the existing terminal-status checker. Do not rerun the performance baseline — it is already done. Preserve the September 21 homepage query check and the scheduled reviews.

**Week 2 (Sep 23–29):** implement one justified conversion fix based on the trace; begin the first 20-prospect test; run the other scheduled SEO reviews on their existing dates. The September 28 flagship read is provisional.

**Week 3 (Sep 30–Oct 6):** measure the closed SEO windows; do the field Core Web Vitals check around October 6; keep demos moving. The October 4 gate applies only if there is no intervening edit; routine recrawls do not reset it. If the factual correction ships, count 14 complete days after the first crawl of the corrected version plus a 3-day holdback. No later routine recrawl resets that window.

**Week 4 (Oct 7–16):** expand to another 20 prospects only if at least two real paying accounts exist and delivery/unit cost is acceptable — not a generic "scale the winner". Check paid collections and decide whether to keep the optional SEO test. No ad spend.

No more than two implementation items should be in flight at once. The plan fits roughly 12–20 hours per week, not 80.

## Three Kings (short)

- **Eligible now:** none with high confidence and high volume.
- **Optional, one only (~30–60 min), launch Sep 18–22 only after higher priorities:** `/blog/what-resolution-for-print`, first paragraph only. Replace the current "Recommended DPI and pixel sizes… Try free now." with: "An 8x10 photo at 300 PPI is 2400 × 3000 pixels; at 150 PPI it is 1200 × 1500 pixels. Below are the exact pixel dimensions for 8x10 and other common print sizes, plus how to check if your image is large enough and when to upscale." (Old copy uses DPI; new copy uses PPI.) Do not change title or H1 at the same time, and do not bundle the on-page proof module. A 14-day full post-crawl window plus a 3-day holdback is needed for a verdict; do not wait until Week 4 to initiate the test or expect an October 16 verdict.
- **Hold:** the flagship, photo-restoration-program, YouTube thumbnails, poster size, best-ai-upscaler, topaz-video-upscaler, best-image-upscaler, topaz-labs-free-trial (review September 18), photoshop-upscale-image, and vs-adobe-express. **Stop:** fixing-pixelated-photos.
- The enlarger page's 475-impression pair (1 click, position 9.07) is below the 500 pair threshold and its title, H1, and intro already carry the query; the tool-vs-listicle gap is an unproven intent mismatch, not a title fix. The 8x10 pair (444 impressions, 0 clicks, position 6.81) sits inside a page with 8,812 impressions and 30 clicks, and its in-band slice is 674 impressions — label pair and slice separately.

## Limitations

- Data windows differ and are not directly comparable: GSC lags three days (through September 13); Stripe uses complete calendar windows through September 15; the Amplitude funnel is user-reported, its definition and cohort were not inspected, and it includes the current partial day.
- Stripe figures are captured payments net of recorded refunds, attributed to charge-created date, with fees, taxes, and costs excluded — not revenue, cash flow, or profit. COGS is unknown, so no margin, price-cut, or paid-growth recommendation is made.
- The 51 purchase events for the period are events, not 51 unique users; do not subtract the 12 funnel purchases from 51. Two payment-failure events cannot explain 179 non-conversions.
- Mature cohort figures are sign-up cohorts over a seven-day window, not day-7 or day-N retention. Amplitude D1 = 3.05% and D7 = 0.53% use an unknown cohort; the 11,631 browser new users are not registered profiles.
- The performance data is local lab, not Google-hosted field data (the PageSpeed API returned a 429 quota error). Do not mix observed TTFB with simulated LCP, and there is no evidence performance caused the search decline.

## Validation and sources

Read-only work only; this report changed nothing in the application and added no tests. Methods: a local Lighthouse 12.8.2 scan (three mobile runs, one desktop), a technical scan of three pages, read-only Amplitude, Stripe, and Supabase queries, and the finalized GSC 28-day export. Local evidence: `/tmp/miu-user-amplitude-charts-2026-09-16.txt`; `/tmp/miu-revenue-research.json` (corrections_v2 supersedes older money and retention fields); `/tmp/miu-acquisition-research.json`; `/tmp/miu-live-scans-summary.json`; `/tmp/miu-performance-review.json`. No secrets or personal data are included.

- User-reported Amplitude charts: [upgrade funnel](https://app.amplitude.com/analytics/coldstartlabs-552056/chart/g9ammnw8) · [purchases](https://app.amplitude.com/analytics/coldstartlabs-552056/chart/4szak9rl) · [retention](https://app.amplitude.com/analytics/coldstartlabs-552056/chart/ln1bv591). Reported figures, not independently re-derived.
- Related: [original diagnosis](2026-09-16-search-traffic-diagnosis.md) · [SEO changes backlog](../maintenance/seo-changes-backlog.md) · [Three Kings ledger](../maintenance/three-kings-ledger.json) · [homepage change log](../../../seo-reports/homepage-change-log-2026-09.md).

## Start in two minutes

Open `client/components/pages/HomePageClient.tsx` line 338 and confirm it passes `freeCredits` while `locales/en/common.json` line 91 expects `{creditOffer}`. That mismatch is the day-1 fix; correcting it and adding the render test is the first task on this plan.

## Execution PRDs

- Traffic: [PRD-traffic-recovery-2026-09](../../PRDs/traffic-recovery-2026-09.md) — GSC cohort windows, flagship corrections, optional Three Kings test, mobile origin/cache, field outcome.
- Revenue: [PRD-revenue-growth-2026-09](../../PRDs/revenue-growth-2026-09.md) — homepage locale-contract fix, paid-funnel truth, founder-led repeat-use test, weekly metrics.
