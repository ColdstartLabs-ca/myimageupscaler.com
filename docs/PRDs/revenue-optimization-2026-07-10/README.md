# Revenue Optimization PRD Portfolio — 2026-07-10

**Source:** `docs/management/revenue-optimization-report-2026-07-10.md`  
**Status:** Ready for sequencing  
**Product direction:** Credit-pack-first. Cloudflare Email is the primary sender; Brevo and Resend are resilience fallbacks, not a pooled free-tier strategy.

## Decision Summary

The report mixes defects, experiments, product bets, and already-planned work. This portfolio splits only the independently releasable work that is not adequately specified elsewhere.

The lifecycle frequency cap should **not** be removed completely. A total removal would allow overlapping campaigns to over-message users, damage deliverability, and create compliance risk. Replace the current one-marketing-email-in-seven-days rule with a priority-aware policy:

- Transactional email bypasses marketing frequency limits but still honors bounce/complaint suppression.
- Revenue-critical marketing may send at most one message per user per 72 hours and two per rolling seven days.
- Education and generic win-back remain limited to one per seven days.
- Same-campaign cooldown, unsubscribe/preferences, bounce, and complaint checks always remain.
- A global emergency ceiling of three marketing messages per rolling seven days prevents configuration mistakes.

## Ordered Slices

| Order | PRD                                                                                                                  | Complexity | Outcome                                                                      | Dependency                                              |
| ----: | -------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
|     1 | [Cloudflare Email Primary and Priority Caps](./01-cloudflare-email-primary-and-priority-caps.md)                     | 6 → MEDIUM | Lifecycle delivery works without relying on free quotas                      | Cloudflare sending entitlement and API credentials      |
|     2 | [Purchase Experiment Reward Repair and Winner Rollout](./02-purchase-experiment-reward-repair-and-winner-rollout.md) | 6 → MEDIUM | Rewards are trustworthy; compact picker becomes default                      | None                                                    |
|     3 | [Conversion Collapse Diagnostic](./03-conversion-collapse-diagnostic.md)                                             | 5 → MEDIUM | Feb–June loss is isolated to source, landing cohort, region, or funnel stage | Slice 2 for trustworthy experiment attribution          |
|     4 | [Pre-Checkout Identity Capture](./04-pre-checkout-identity-capture.md)                                               | 6 → MEDIUM | Guest upgrade intent becomes recoverable                                     | Slice 1; existing recovery intent infrastructure        |
|     5 | [Repeat Pack Purchase and Auto Top-Up](./05-repeat-pack-purchase-and-auto-top-up.md)                                 | 9 → HIGH   | Repeat buyers can opt into threshold refills safely                          | Slice 1 for notices; Stripe saved payment method design |
|     6 | [Subscription Cancellation Retention](./06-subscription-cancellation-retention.md)                                   | 7 → HIGH   | Subscribers receive a relevant save option before cancellation               | Subscription pricing/product decision                   |

## Existing PRDs to Execute or Revise

| Report recommendation                    | Existing source of truth                                                                                        | Portfolio action                                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Revenue-recovery and heavy-usage cohorts | `docs/PRDs/revenue-recovery-email-cohorts.md`                                                                   | Execute after Slice 1; do not duplicate                                                                                          |
| Click-to-checkout repair                 | `docs/PRDs/click-to-checkout-conversion-fix.md` and `docs/PRDs/revenue-funnel-telemetry-and-checkout-repair.md` | Use findings from Slice 3 to choose phases                                                                                       |
| Post-first-success upsell                | `docs/PRDs/post-download-model-gallery-funnel.md`                                                               | Execute after compact picker rollout                                                                                             |
| Trials                                   | `docs/PRDs/trial-periods-PRD.md`                                                                                | Defer until retention and pricing are fixed; target heavy users only                                                             |
| Subscription pricing                     | `docs/PRDs/fix-subscription-pricing-vs-credit-packs.md`                                                         | **Re-open product decision.** Its $5.99/$9.99/$34.99/$99.99 proposal predates current evidence and should not ship automatically |
| Segment-aware subscription pitch         | `docs/PRDs/segment-aware-upgrade-funnel.md`                                                                     | Revise to pack-first for light/free users; subscription-first only for verified heavy users                                      |

## Explicit Deferrals

- Annual subscriptions: wait for monthly retention evidence.
- API/bulk tier, referral program, and alternative paywall paths: separate discovery after the six slices.
- Permanent next-pack discounts: measure auto-top-up and repeat-purchase prompts before introducing recurring margin erosion.
- Pack model-access restriction: retain current pack-unlocks-hobby behavior for now and make it explicit in the eventual pricing decision.

## Portfolio Definition of Done

- Each slice passes its phase tests, affected-area tests, and `yarn verify`.
- External changes (Cloudflare, Stripe) have manual production verification evidence.
- Revenue events are idempotent and attributable.
- No production campaign is bulk-released without a staged cohort and stop condition.
