# Growth Diagnostic — 2026-10-23 (traffic focus)

Scope: acquisition only. Sources: GSC API (final + fresh data through Oct 20), GA4 property 519826120 (through Oct 22), prod `profiles` / `credit_transactions` (read-only), git log, `docs/seo/reddit-post-log*.md`. Stripe, Amplitude and Replicate were not pulled.

## TL;DR

The traffic loss is a **brand-demand (awareness) collapse, not an SEO-ranking loss**. Brand queries fell from 782 clicks/wk (Jul 6) to 36/wk (Oct 12). Weekly signups follow the same curve (1,876 → 282). Non-brand GSC clicks fell only ~30% over the same span. On-site SEO edits cannot rebuild brand demand. Off-site presence (the Reddit marketing that stopped) is the most likely lever.

## Scoreboard

| Metric | Peak (wk Jul 6) | Now (wk Oct 12) | Source |
| --- | --- | --- | --- |
| Brand query clicks/wk (`my ?image ?upscal`) | 782 | 36 | GSC |
| Signups/wk | 1,876 | 282 | `profiles` |
| Activated signups/wk (`type='usage'`) | 1,138 | 174 | `credit_transactions` |
| All GA4 sessions/wk | 5,835 (wk 28) | 2,560 (wk 42) | GA4 |
| GSC clicks/wk | 2,031 (Jul 29) | 900 (Oct 14) | GSC |
| Reddit referral sessions/wk | 21–34 | 42–52 | GA4 |

Brand steps: **Jul 20** (−55%) and **Sep 14** (−70%). Both steps are visible in brand clicks and in signups.

## Findings

1. **Homepage loss = brand loss.** Homepage clicks peak→now 3,329 → 1,238. `myimageupscaler` −1,143 and `my image upscaler` −534. Non-brand `image upscaler` grew 363 → 512.
2. **Reddit link clicks never fell.** Reddit referral sessions were 20–50/wk the whole time. If Reddit drove brand demand, it did so through name exposure (people Google the name), not through link clicks. The repo log records only ~17 posted rows, so the real posting dates are with João.
3. **Reddit log activity matches the brand steps.** Log commits per month: May 11, Jun 9, Jul 12, Aug 4, Sep 1, Oct 8. Correlation only, unproven.
4. **AI Assistant referrals fell 58%** (281 → 116 sessions, 28d vs prior 28d). This is consistent with less off-site mention data. Unverified cause.
5. **Head-term cliff.** Homepage sits at position ~10 for `image upscaler` (65,944 impressions/90d, CTR 2.0%). A move from 9.6 to 10.3 (Oct 15–21) cut its impressions 42%. Position 5–6 is worth roughly 2–3x its clicks.
6. **pSEO scale pages grow.** `/scale` 485 clicks/28d from 17 pages; `/ai-features` 16 → 76; `/use-cases` 1 → 21.

## Prioritized moves

| # | Move | Impact | Effort | Score | Verify metric (baseline) |
| --- | --- | --- | --- | --- | --- |
| 1 | Restart Reddit brand-mention cadence for 14 days, helpful answers that name the tool, disclosed, within each subreddit's rules | 8 | 2 | 4.0 | Brand impressions/wk (~90) and signups/wk (282) |
| 2 | Expand `/scale` + `/format-scale` pSEO with missing scale/resolution variants | 5 | 4 | 1.3 | `/scale` clicks/28d (485) |
| 3 | Ship homepage King 3 edit (branch `seo/homepage-king3-2026-10`) after the Oct 27 hero readback | 4 | 1 | 4.0* | `image upscaler` position (10.4) |
| 4 | Earn links for the homepage on "image upscaler" (directories, comparison lists, tool roundups) | 7 | 7 | 1.0 | `image upscaler` position (10.4) |

*Gated by the Oct 27 readback, so it ranks after #1.

## What to ignore

- `how to fix pixelated photos` (72,818 impressions, 3 clicks) and `remove background` (24,797 impressions, position 5, 3 clicks): quarantined phantom impressions.
- More flagship-post title edits: ~280 impressions/day caps it near 150 clicks/wk.
- GIF 301 consolidation and pixelated snippet edits: known failures.
