# February–June Conversion Diagnostic

## Conclusion

The reported conversion collapse is not supported by corrected cohort data. The source report treated 289 credit-processing refund rows as pack purchases and compared calendar totals rather than equally matured signup cohorts. After restricting purchases to genuine `Credit pack purchase` ledger entries and applying identical maturity windows, June converted better than February.

No pricing or checkout redesign should be justified by the original 4.8% → 1.1% claim.

## Definitions and reconciliation

- Cohort: UTC calendar month of signup.
- Conversion: first eligible confirmed pack purchase within 7 or 30 days of signup.
- Exclusions: internal, test, and refunded signups or purchases.
- Segment threshold: at least 20 signups in both cohorts.
- Primary decomposition axis: mutually exclusive first-touch source/medium.
- Purchase identity join: 88 of 88 eligible cohort purchases (100%); zero unmatched.
- Stripe cross-check: June had 51 paid pack sessions versus 54 genuine Supabase pack transactions. The small difference is consistent with ledger/session timing and repeat transactions. February Stripe history is unavailable in the current Stripe account and is explicitly not treated as a successful cross-check.

| Maturity | February buyers / signups | February rate | June buyers / signups | June rate |
| -------- | ------------------------: | ------------: | --------------------: | --------: |
| 7 days   |                 6 / 1,366 |        0.439% |            39 / 4,791 |    0.814% |
| 30 days  |                 7 / 1,366 |        0.512% |            20 / 1,315 |    1.521% |

The 30-day June denominator includes only signups mature by the July 10 analysis cutoff.

## Decomposition

At seven days, comparable source/medium groups cover 4,161 June signups. Holding eligible February source rates against the June mix predicts a 1.388% rate. The calculation attributes +39.49 expected buyers to mix and -24.76 buyers to within-source movement relative to the February aggregate. This short-window result is sensitive to acquisition attribution: `www.google.com / referral` is classified separately from organic search.

At 30 days, comparable groups cover 1,100 mature June signups. The counterfactual rate is 1.350%, with +9.21 buyers attributed to mix and +3.15 buyers to within-source performance. Both effects are positive; there is no mature-cohort product regression to repair.

## Ranked findings and actions

| Rank | Finding                                          | Evidence                                                                                                                                           | Decision                                                                                                                                   |
| ---- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Google referral attribution is fragmented        | The seven-day `www.google.com / referral` segment has 1/36 February buyers and 16/1,597 June buyers, producing 28.36 expected-minus-actual buyers. | Map to PRD 03 Phase 3 checkout diagnostics only as an attribution audit; normalize Google referrers before treating this as checkout loss. |
| 2    | Non-pSEO traffic improved                        | Mature non-pSEO conversion increased from 7/1,365 to 20/1,312.                                                                                     | No action; do not suppress this traffic or redesign its funnel.                                                                            |
| 3    | Authenticated and standard-tier cohorts improved | Mature authenticated conversion increased from 7/1,366 to 20/1,315; standard-tier conversion increased from 5/602 to 20/1,181.                     | No action; retain current pricing and identity flow while monitoring forward cohorts.                                                      |

## Data limitations

February Amplitude data predates the current `account_created`, `checkout_opened`, and `purchase_confirmed` funnel contract, so stage-by-stage February regression claims cannot be reconstructed reliably. Acquisition/device dimension coverage across joined identities is 81.7%. The offline analyzer reports counts, rates, suppressed segments, non-comparable coverage, and join failures so these limitations remain visible.

The repeatable analysis runs in `scripts/analyze-conversion-cohorts.ts`; no cohort computation runs in a Cloudflare request path.
