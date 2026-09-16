# Pinned-cohort review — homepage non-brand (AC-3)

**PRD:** [PRD-traffic-recovery-2026-09](../../PRDs/traffic-recovery-2026-09.md)
**Method source:** [search-traffic action plan](../reports/2026-09-16-search-traffic-action-plan.md) · [diagnosis](../reports/2026-09-16-search-traffic-diagnosis.md)

## Pinned method — do not redefine

- **Queries (five, non-brand, pinned in the September 10 baseline):** `image upscaler`, `upscaler`, `image upscaler 4k`, `ai image upscaler`, `upscale image`.
- **Page:** homepage. **Dimensions:** query × country × device (212 combinations in the pinned set).
- **Weighting:** previous-period impression weights held constant for the matched position control. Blended position is reported alongside but is not the decision input.
- **Brand stays separate.** The quarantined brand query and the unclassifiable residual are never assigned to either bucket.
- **Data pulls:** only newly completed windows on the scheduled dates. No method re-pull, no new queries, no performance re-baseline.

## Decision rules (operational, not statistical proof)

| Observation on a closed window                             | Decision                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Clicks/CTR improve and matched positions stable            | **KEEP**                                                                                                  |
| CTR falls with stable positions **and** stable impressions | **TEST** — one truthful snippet test, after a SERP check                                                  |
| Positions worsen                                           | **STOP and inspect** — intent, the current weak king, and on-page proof, before any further metadata edit |

No previous click level is treated as one that must be restored, and no 17.6% rebound is promised.

## 2026-09-16 — entry 1 (baseline carried forward, no new pull)

The latest GSC export ends **September 13**, so no newly completed window exists today. Recorded from the pinned September 4–6 → September 11–13 matched comparison already in the diagnosis; CTR is derived from those same click/impression figures.

| Query             |      Clicks |       Impressions |               CTR |                  Blended position |
| ----------------- | ----------: | ----------------: | ----------------: | --------------------------------: |
| image upscaler    |     21 → 22 |       1,269 → 902 |     1.65% → 2.44% |                     12.48 → 13.37 |
| upscaler          |      10 → 4 |         632 → 475 |     1.58% → 0.84% |                       9.13 → 9.43 |
| image upscaler 4k |       1 → 8 |         113 → 112 |     0.89% → 7.14% |                     10.10 → 12.21 |
| ai image upscaler |       1 → 1 |         141 → 119 |     0.71% → 0.84% |                     27.97 → 28.87 |
| upscale image     |       2 → 2 |           17 → 17 |   11.76% → 11.76% |                     42.53 → 40.18 |
| **Cohort**        | **35 → 37** | **2,172 → 1,625** | **1.61% → 2.28%** | matched control **12.55 → 12.51** |

**Status: KEEP (provisional).** Cohort clicks and CTR improved and the matched-weight position control is flat (12.55 → 12.51), which is the KEEP condition. It is provisional because this is a three-day, 37-click sample covering only part of homepage traffic; it cannot rule out losses on other queries or later effects, and `upscaler` (10 → 4 clicks, CTR 1.58% → 0.84%) is the one member trending against the cohort. No action is taken on a three-day sample.

## 2026-09-21 — entry 2 (scheduled, binding)

Compare **September 11–17 against September 4–10** on the pinned five queries, same country/device combinations, previous-period impression weights. The current export cannot contain this window; fetch it on the day. Also check recrawl timing. Record KEEP/TEST/STOP per the rules above, and resolve `upscaler` explicitly.

_Result: pending._

## 2026-10-16 — entry 3 (final review)

Repeat the pinned comparison on the latest completed window available at that date and record the final KEEP/TEST/STOP. If a required window has not closed by October 16, record that and leave the PRD PARTIAL — do not fabricate or extrapolate future data.

_Result: pending._

## Related scheduled reviews (preserve, do not reschedule)

September 18 Topaz · September 21 poster and Photoshop · September 22 the three description tests. September 28 flagship read is provisional; the October 4 gate applies only with no intervening edit. If the flagship factual correction ships, count 14 complete days from the first crawl of the corrected version plus a 3-day holdback; routine recrawls do not reset it.
