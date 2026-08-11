# Growth Diagnostic — 2026-08-10

**Question asked:** active users keep declining — is it SEO-led?

**Answer: no.** Search is delivering *more* clicks than mid-June. The site now converts visitors
into signups at ~2/3 the rate it did. The bottleneck is engagement on the upload surfaces, not
acquisition.

## TL;DR — the one thing

**Fix the session → first-upload step on `/` and `/tools/*`.** Upload-CTA clicks per session fell
from 0.350 to 0.232 (−34%) and engagement rate on `/tools/*` fell 80.1% → 62.8%, while sessions
stayed flat. That gap is worth roughly **65 signups/day** at current traffic — more than any
SEO fix on the table.

## Why "SEO-led" is the wrong read

Everything depends on which baseline you pick. The Jul 3–17 window was a **traffic spike**, not the
trend line. Measured against the last stable pre-spike window:

| Metric (per day)      | Jun 16–Jul 02 | Jul 08–16 (peak) | Aug 01–07 | Aug vs Jun | Aug vs peak |
| --------------------- | ------------: | ---------------: | --------: | ---------: | ----------: |
| GSC clicks            |         243.8 |            395.0 |     299.4 |  **1.23x** |       0.76x |
| GSC impressions       |        13,265 |           14,454 |    14,193 |      1.07x |       0.98x |
| Organic sessions (GA) |         295.2 |           ~432   |     325.8 |  **1.10x** |       0.75x |
| Total sessions (GA)   |         608.1 |           ~824   |     555.9 |      0.91x |       0.67x |
| Amplitude `session_start` | 484.1     |           ~669   |     473.9 |      0.98x |       0.71x |
| **Signups (`profiles`)**  | **189.8** |        **267.6** | **124.7** |  **0.66x** |   **0.49x** |
| Active users (usage)  |         131.9 |            175.5 |      93.8 |      0.71x |       0.53x |

Search clicks are **up 23%** vs mid-June while signups are **down 34%**. Even measured from the
July peak the user is looking at, the decomposition splits **39% traffic / 61% conversion**
(log-share of the −51% signup change: clicks 0.76x, signups-per-click 0.65x).

## Where the loss actually is

Sessions are flat; every in-product action is down ~30–40% (Amplitude, Aug 01–09 vs Jun 16–Jul 02):

| Event                     | Jun 16–Jul 02 | Aug 01–09 | ratio |
| ------------------------- | ------------: | --------: | ----: |
| `session_start`           |         484.1 |     473.9 | 0.98x |
| `page_view`               |         497.4 |     376.1 | 0.76x |
| `hero_upload_cta_clicked` |         169.5 |     110.0 | 0.65x |
| `image_uploaded`          |         271.2 |     194.1 | 0.72x |
| `first_upload_completed`  |          85.6 |      52.0 | 0.61x |
| `image_upscaled`          |         230.5 |     145.6 | 0.63x |

Organic engagement rate degraded on the pages that carry the upload widget, and barely moved on
the ones that don't:

| Landing family | Jun 16–Jul 02 | Aug 01–09 | delta      |
| -------------- | ------------: | --------: | ---------- |
| `/tools/*`     |         80.1% |     62.8% | **−17.3pp** |
| `other-pseo`   |         77.7% |     68.8% | −8.9pp     |
| `/` (home)     |         87.3% |     80.9% | −6.4pp     |
| `/blog/*`      |         80.8% |     78.1% | −2.7pp     |

## What is NOT the problem (ruled out with data)

- **Instrumentation.** `auth.users` = `profiles` exactly, 0 missing rows every day for 60 days. The
  signup drop is real, not a broken profile-creation path.
- **Geo / region policy.** The drop is uniform across every country: US −48%, IN −51%, DE −42%,
  GB −44%, BR −43%, ID −41%. Not a paywalled-region effect.
- **Duplicate-account cleanup.** Repeat-identity signups were only 2.5% pre-Jul-18 and 1.4% post.
  Removing abusers explains ~1pp, not 34%.
- **Post-signup funnel.** It *improved*: active-per-signup 0.695 → 0.752; maturity-matched 30-day
  conversion 0.682% (May) → 0.877% (Jun) → 0.867% (Jul); activation 72% for non-paywalled tiers.
- **Processing reliability.** `processing_jobs` shows 0 failures/day across the whole window.

## Anti-abuse ship (Jul 17–18) — rollback status

| Piece                                        | Status                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Shared-identity credit reduction             | **Rolled back** — migration `20260722193018_disable_shared_identity_reduction.sql`  |
| Repair of affected users                     | **Done** — 83 × "Missing one-time welcome credits repaired", 21 × "Jul 18 grant repair" |
| Non-dismissible `hardGate` modal             | **Removed** — no occurrences left in `client/`, `server/`, `app/`                   |
| Free-plan dismissal gate                     | **Removed** — `fbf00964` (Jul 31)                                                  |
| `FREE_LIMIT_EXCEEDED` server enforcement      | **Still live** — this is the legitimate P0 fix; keep it                            |
| Region-tier grants at signup                 | Still live, but **pre-existing behaviour** — paywalled regions had 0.8% activation both before *and* after Jul 18 |

**Leftovers worth attention (none are the smoking gun, but they are loose ends):**

1. `client/hooks/useBatchQueue.ts` and `Workspace.tsx` changes from `229b6b87` **survived** the
   Jul 22 rollback, and the engagement decline is on exactly those surfaces. This is the first
   place to look.
2. `free_limit_gate_shown` is allowlisted in `app/api/analytics/event/route.ts:56` and typed in
   `server/analytics/types.ts:772` but **has no emitter** — dead event. `credit_wall_shown`
   replaced it (35/day in Aug). Harmless, but it means the old gate metric reads as zero forever.
3. ~26% of signups (~34/day) land in paywalled regions with 0 free credits and 0.7% activation.
   Pre-existing design choice, not a regression — but a quarter of signups are dead on arrival.

## Prioritized moves

| # | Move | Impact | Effort | Score | Verification metric (current baseline) |
| - | ---- | -----: | -----: | ----: | -------------------------------------- |
| 1 | Diagnose session → first-upload on `/` and `/tools/*`. Start with the surviving `useBatchQueue`/`Workspace` changes from `229b6b87`, then Core Web Vitals on those routes. | 9 | 3 | 3.0 | `hero_upload_cta_clicked / session_start` = **0.232** (was 0.350) |
| 2 | Recover `/tools/*` engagement specifically — worst-hit surface, and organic clicks there are 0.66x mid-June. | 7 | 3 | 2.3 | `/tools/*` organic engagement rate = **62.8%** (was 80.1%) |
| 3 | Investigate the AI-Assistant channel collapse (ChatGPT/Perplexity referrals). | 5 | 3 | 1.7 | AI Assistant sessions/day = **19.3** (was 41.6) |
| 4 | Finish `/formats/upscale-gif-images` recovery — position 7.1 → 19.3, −26 clicks/day. Fix shipped Aug 3; GSC can't measure it yet. | 4 | 2 | 2.0 | page clicks/day = **0.7** (peak 27.0) |
| 5 | Re-point blog SEO at converting surfaces. Blog is 35.3% of organic sessions (was 26.0%) and grew 1.50x, but blog visitors don't upload. | 4 | 5 | 0.8 | home share of organic = **44.0%** (was 50.2%) |

## What I'd ignore

- **Re-adding any paywall gate.** Settled: cost 60–80% of payments in July, rolled back in `1c95953c`.
- **Checkout / pricing optimization.** Maturity-matched conversion *rose* to 0.87%. The funnel below
  signup is the healthiest part of the product right now.
- **Guest / anonymous upscaling.** Settled NO.
- **Revenue panic on the August number.** Aug 01–09 net was $66.14 across 19 charges vs
  $17.78/day for Jul 19–31. That is a real drop but the sample is too small to act on; revenue held
  flat for the *two full weeks* after the signup decline began, which is why signups — not
  monetization — is the thing to fix.

## Sources and windows

Stripe REST (`/v1/charges`, `/v1/subscriptions`, Apr 01–Aug 10) · Supabase prod SQL read-only
(`profiles`, `auth.users`, `credit_transactions`, `free_credit_grants`, `processing_jobs`,
`browser_fingerprints`) · Amplitude `/api/2/events/segmentation` (Jun 15–Aug 09) · GA4 Data API
(property 519826120, May 01–Aug 09, daily × channel / landing page / device) · GSC Search Analytics
(`sc-domain:myimageupscaler.com`, daily × page and × query, Jun 08–Aug 07, 3-day lag) · `git log`
Jul 10–Aug 11.

**Not pulled:** Cloudflare edge analytics (prod token still lacks
`com.cloudflare.api.account.zone.analytics.read` — known gap, unchanged since 2026-07-25);
Replicate COGS (`processing_jobs.provider_cost_usd` exists and is the better source — worth a
dedicated margin pass).
