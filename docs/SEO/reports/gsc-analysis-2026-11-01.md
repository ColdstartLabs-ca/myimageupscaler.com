# GSC Analysis: myimageupscaler.com, 2026-11-01

**Current period:** 2026-10-02 to 2026-10-29. **Previous period:** 2026-09-04 to 2026-10-01.

**TLDR**

- ❌ The Three Kings job runs on Nov 2 at 09:09 and will likely roll back the flagship post to its worst measured title. Block this first.
- ❌ Clicks fell 27.9%. Non-brand search visibility now drives the loss. Brand stopped falling 7 weeks ago.
- ⚠️ The largest lever is `image upscaler` at position 10. The fix that targets it is tested and not deployed.

## What To Do Next

| # | Action | Rating | Effort | Owner |
| --- | ------ | ------ | ------ | ----- |
| 1 | Stop the flagship auto-rollback before Nov 2, 09:09 | ⭐⭐⭐⭐⭐ | 30 minutes | João decides, Claude patches |
| 2 | Deploy `release/miu-recovery-20261101` (head-term hero line and GA4 signup attribution) | ⭐⭐⭐⭐⭐ | About 1 hour | João approves, Claude ships |
| 3 | Get 5 real editorial links to `/` | ⭐⭐⭐⭐ | Ongoing | João |
| 4 | Remove the 8 `noindex` URLs from live sitemaps | ⭐⭐ | 30 minutes | Claude |

### 1. Stop the flagship auto-rollback

`tkm.cjs check` reports `REGRESSION` for `/blog/best-free-ai-image-upscaler-2026-tested-compared`. The enabled job `MIU Three Kings Manager` runs next on 2026-11-02 at 09:09. The skill says to revert immediately when `impDelta` is above -40%. Here `impDelta` is +7.

The verdict is wrong because the judge ignores the site-wide decline:

- The page moved 103 → 78 clicks (ratio 0.76). The rest of the site moved at ratio 0.83 in the same windows.
- The adjusted ratio is 0.92, which is FLAT.
- The rollback restores the title `Best Free AI Image Upscalers 2026: Limits Compared`. That edit has the worst adjusted result on this page (0.46).
- The rollback also restores the "welcome credits" wording and the self-negating lines that the Oct 13 edit removed.

Options:

- ⭐⭐⭐⭐⭐ Patch `judgeEdits` in `tkm.cjs` to divide by the site click ratio, with one red-green test. This fixes the root cause.
- ⭐⭐⭐⭐ Disable the job for this one run. This takes 1 minute and leaves the bug in place.
- ⭐ Let the rollback run. This restores a measured loser.

✅ Tested: a `stopRule` on the ledger entry does not stop the `REGRESSION` (dry run on a scratch copy). A ledger note alone is not enough.

### 2. Deploy the release branch

- The branch holds the King 3 hero edit: "AI image upscaler that" replaces "AI photo enhancer that". The term has 23,694 impressions and the homepage holds 458 of its 467 clicks.
- The branch also fixes GA4 `sign_up`. Without it, no SEO change can be judged on signups.
- ✅ Not live: the newest Worker deployment is 2026-10-15.
- ⚠️ This run did not rerun the branch tests. `yarn deploy` runs the full `yarn test`.

After the deploy:

1. Add the `seo-changes-backlog.md` entry.
2. Request indexing for `/` in Search Console.
3. Read back clicks and signups after 7 days.
4. Check `gsc-request-indexing-backlog.md`, which has 71 unchecked URLs.

### 3. Get real links to the homepage

This is a hypothesis, not a proven cause. `image upscaler` variants sit on page 2 and 3 of results on the homepage (`ai image upscaler` 20.3, `upscale image` 25.8, `image upscaler free` 30.6). The content already targets them, so the likely limit is authority.

The site has 969 external links and 598 of them go to `/`. Apart from `reddit.com` (184 links), the top 25 linking sites are mostly tool directories. This run did not compare competitor link profiles.

### 4. Clean the sitemaps

8 URLs in live sitemaps serve `noindex` (`/compare/midjourney-vs-stable-diffusion`, `/es/alternatives/vs-imgupscaler`, 6 locale `vs-adobe-express` pages). This comes from the Nov 1 backlog entry and this run did not retest it. The expected click gain is near zero. Ship it with the next deploy, with a test in `tests/unit/seo/`.

## Do Not Do

- ❌ Do not edit blog titles now. The check shows 0 `EDIT_NOW` and 5 pages in open windows.
- ❌ Do not retitle `/scale/upscale-16x`. Its CTR stayed at 5 to 6% and its title did not change. Impressions fell from about 650 to 380 per week.
- ❌ Do not add pages for head-term variants. New pages would split the homepage signal.
- ❌ Do not 301 the `image upscaler 8x` pages together. The GIF 301 consolidation is a recorded failure.
- ❌ Do not act on the phantom queries listed under Quick Wins.
- ❌ Do not fix the 156 video pages ("Video isn't on a watch page"). They have 0 impressions.

## Data Completeness

- ✅ `dataCompleteness.complete` is true, with 0 failed requests.
- ⚠️ Query click coverage is 50.5%. Privacy filtering hides 1,951 of 3,939 clicks from the query dimension.
- ✅ UI reports read: Overview, Page indexing, Video indexing, Crawl stats, Core Web Vitals, Generative AI, Insights, Links, Shopping, Enhancements, Manual actions, Security issues, Removals. Extractor `gaps` is empty.
- ✅ Blog audit ran on 293 posts: 89 with errors, 95 below the CTR benchmark, 11 intent mismatches.
- ⚠️ Signups were not measured. The Oct 27 signup readback stays unverified.

**Skill version:** ✅ `ca83db58` on local `master` is the newest commit that touches the skill on all branches. ⚠️ `origin/master` does not have it, because local `master` is 16 commits ahead.

## Performance Summary

| Segment | Previous | Current | Change |
| ------- | -------- | ------- | ------ |
| Non-brand clicks (classified) | 2,541 | 1,833 | -27.9% |
| Unclassified clicks (privacy-hidden) | 2,560 | 1,951 | -23.8% |
| Brand clicks | 363 | 155 | -57.3% |
| Total clicks | 5,464 | 3,939 | -27.9% |
| Impressions, raw | 340,532 | 281,583 | -17.3% |
| Impressions, without the `remove background` spike | 315,872 | 281,583 | -10.9% |
| CTR, without the spike | 1.73% | 1.40% | -0.33 pt |
| Position, without the spike | 10.76 | 11.65 | +0.89 |
| Stable-cohort position (653 pages) | 10.28 | 11.47 | +1.19 |

| Week starting | Clicks | Non-brand | Brand | Unclassified |
| ------------- | ------ | --------- | ----- | ------------ |
| Oct 2 | 1,125 | 563 | 39 | 523 |
| Oct 9 | 1,039 | 476 | 43 | 520 |
| Oct 16 | 838 | 352 | 40 | 446 |
| Oct 23 | 937 | 442 | 33 | 462 |

- ✅ The last week rose 12%. One week is not a trend.
- ⚠️ Monthly clicks: July 10,192, August 7,589, September 5,942, October 4,115 (29 days).
- ✅ Classifier check: Google reports 3.83% branded clicks and the classifier gives 3.94%.
- **Search types:** web 3,939 clicks, image 33 clicks (33,493 impressions), multimodal 9 clicks, video, news and Discover 0.
- **Quarantine:** no query qualifies in the current period. The previous period holds `remove background` (24,660 impressions, 1 click).

## What Moved The Clicks

**Brand is no longer the driver.** Brand clicks hold at 33 to 43 per week. The -208 in the table comes from Sep 4 to 13, before the known brand step. The Oct 23 diagnosis was right for July to October, but it does not explain the current slide.

**Visibility is the driver, not CTR.** Named non-brand queries, without phantoms, moved 2,494 → 1,804 (-690):

| Cause | Clicks | Share |
| ----- | ------ | ----- |
| Fewer impressions on queries in both periods | -427 | 62% |
| Lost queries (-256) and new queries (+140) | -116 | 17% |
| Lower CTR, position stable | -71 | 10% |
| Lower CTR, position moved | -75 | 11% |

The fetcher reports a larger `ctrEffect` (-892) at page level. That figure mixes in the exit of brand clicks, which have a CTR near 50%.

**It is probably not market demand.** Queries with stable position lost 15% of impressions (75,176 → 63,902). The worldwide Google Trends chart for `image upscaler` and `upscaler` looks flat from September to October (visual read, not a measured series). A page can keep its average position and lose impressions when it falls out of the top results for some users. Treat the fetcher `cause: demand` label as "visibility or demand".

**Where it moved:**

- **Sections:** blog 1,963 → 1,286, homepages 2,029 → 1,454, tools 489 → 338, scale 590 → 454. Small sections grew: `ai-features` 54 → 80, `use-cases` 18 → 28.
- **Pages:** `/` -483, flagship -195, `/scale/upscale-16x` -102, `/tools/ai-image-upscaler` -96, `/blog/topaz-labs-free-trial` -75.
- **Homepage:** brand-named queries are 46% of the visible loss (-184 of -401). Indonesia and India hold 65% of its impression loss.
- **Countries:** India 507 → 266, USA 820 → 638, Indonesia 330 → 202, Canada 205 → 118, Brazil 179 → 111.
- **Devices:** mobile 2,451 → 1,670, desktop 2,907 → 2,193.

**Blended position misleads.** It moved 10.29 → 13.79 across the 4 weeks, but impressions ranked below position 30 grew from 11.0% to 21.7% of named impressions. A fixed set of 130 non-brand queries moved only 13.42 → 14.33.

**Cause is not proven.** ✅ Manual actions and security issues are clean. Google's dashboard lists the September 2026 spam update from Sep 24 for 13 days and no October core update. One outlet reports unconfirmed volatility on Oct 20 and 21. These dates overlap the slide, which is correlation only.

### The Head Term

| Week starting | Clicks | Impressions | Position |
| ------------- | ------ | ----------- | -------- |
| Sep 4 | 55 | 3,184 | 12.3 |
| Sep 11 | 42 | 1,925 | 14.1 |
| Sep 18 | 237 | 12,874 | 8.7 |
| Sep 25 | 140 | 6,145 | 9.7 |
| Oct 2 | 179 | 8,844 | 9.1 |
| Oct 9 | 100 | 5,564 | 10.0 |
| Oct 16 | 80 | 4,029 | 10.5 |
| Oct 23 | 108 | 5,257 | 10.1 |
| Oct 30 to Nov 1 (partial) | 31 | 1,166 | 10.3 |

The 28-day totals hide this: 474 → 467 looks flat. At position 9.1 or better the query earned 179 to 237 clicks per week. At position 10 or worse it earned 80 to 108. A return to about position 9 could add 70 to 130 clicks per week, or 8 to 14% of the site. This rests on 8 weeks and does not prove the direction of cause.

### Three Kings Verdicts Are Confounded

I recomputed each ledger edit with the same windows and divided by the click ratio of all other pages.

| Set | WIN | FLAT | LOSS |
| --- | --- | ---- | ---- |
| All rows, raw | 14 | 10 | 9 |
| All rows, adjusted | 18 | 9 | 6 |
| Adjusted, 30 or more clicks before the edit | 7 | 4 | 3 |

- ✅ The program still has value. The 3 adjusted losses at that volume are real: flagship Aug 17 (0.66), flagship Sep 10 (0.46), best-image Sep 4 (0.79).
- ⚠️ The Oct 26 rollbacks reacted to the site decline. Their adjusted ratios are Topaz 0.90, best-ai 0.96, YouTube 1.05. Keep them in place until their windows close, because another change would add noise.
- ⚠️ The control set includes brand clicks and the rows are small, so treat ratios near the 0.8 and 1.2 limits with care.

## Indexing, Crawl, Core Web Vitals, AI

- ✅ **Indexed set fell by plan.** Indexed pages moved 1,128 → 772 (Aug 7 to Oct 23). `NO_INDEX_TAG` grew 107 → 1,031. All 256 English rows seen are `/blog?page=`, `/blog?q=` and `/dashboard`. The other 744 are locale or `/en/` pages (1,000 of 1,031 listed).
- ✅ **No click cost.** Pages that lost all impressions held 18 clicks. Locale pages moved 236 → 155.
- ✅ **Waste fell.** `CRAWLED` 818 → 446, `NOT_FOUND` 299 → 148, `DUP_USER_CANONICAL` 243 → 83.
- ⚠️ **Watch:** `DISCOVERED` rose 11 → 27, mostly blog URLs.
- ✅ **Crawl speed improved.** Sampled response time moved 2,007 ms (Aug 8) → 1,490 ms (Oct 3) → 281 ms (Oct 31). Responses: 200 at 86%, 301 at 10%, 4xx at 3%, 5xx below 1%.
- ⚠️ The crawl report shows "Problems in the past" for the main host. This run did not read the detail.
- ❌ **Core Web Vitals:** mobile has 139 Poor URLs (LCP above 4 s, validation started) and 139 with INP above 200 ms. Desktop has 139 at Needs improvement (LCP above 2.5 s). Good is 0. Poor URLs peaked at 209 on Oct 3. Earliest possible flip is about Nov 10, so no action is due now.
- ✅ **AI exposure is flat.** Sampled AI impressions stayed between 1,332 and 1,757 per day from July 31 to Oct 30, so AI growth did not cause the October loss. The blog holds 133,549 of about 151,700 in the top 12 sections. This caps blog CTR: `/blog/poster-size-dimensions-pixels` has 25,376 AI impressions and 0.26% CTR at position 6.
- ⚠️ **Structured data counts dropped at the Oct 31 point:** Product 29 → 17, Merchant 28 → 16, Breadcrumbs 164 → 114, with 0 invalid. No deploy happened and earlier swings exist. ✅ JSON-LD is present on the 4 live pages checked. Recheck on Nov 13.

## Quick Wins

Real queries, all on page 1 or close to it:

| Query | Clicks | Impressions | Position | Page | Note |
| ----- | ------ | ----------- | -------- | ---- | ---- |
| `image upscaler` | 467 | 23,694 | 9.8 | `/` | Action 2 |
| `upscaler` | 102 | 7,666 | 9.2 | `/` | Action 2 |
| `image upscaler 4k` | 87 | 2,180 | 8.5 | `/` | Action 2 |
| `image upscaler 8x` | 58 | 802 | 7.5 | `/tools/ai-image-upscaler` | CTR is healthy |
| `make image transparent` | 11 | 1,248 | 9.8 | `/tools/make-image-transparent` | Next tool page to review |

**Phantom-like queries, do not edit for these.** They show many impressions, 0 clicks and a high position, often from one country and device:

- `png upscaling algorithm 2026`: 2,818 impressions, Singapore and Hong Kong desktop.
- `jpg to pdf`: 1,036 impressions, mostly USA desktop, spike on Oct 4 to 8.
- `best ai image upscaling workflow 2026`: 336 impressions.
- `best free ai image upscaler websites 2026 full list`: 263 impressions.
- `remove background from photo online`: 3,001 impressions in the previous period, Latin American desktop.

These stay under the 5,000-impression quarantine limit, so the fetcher lists some of them as quick wins.

## Content Creation

No new pages now. The top `contentCreation` rows are head-term variants that the homepage already holds on page 2 or 3 (`ai image upscaler` 942 impressions at 20.3, `upscale image` 494 at 25.8, `image upscaler ai` 385 at 18.9). Action 3 applies to these.

## CTR Fixes

No eligible edit today. The largest gaps either have open windows or carry heavy AI exposure:

| Page | Clicks | Impressions | Position | CTR | Status |
| ---- | ------ | ----------- | -------- | --- | ------ |
| `/blog/poster-size-dimensions-pixels` | 86 | 33,412 | 6.0 | 0.26% | All 3 rungs done |
| `/blog/topaz-labs-free-trial` | 98 | 9,148 | 5.7 | 1.07% | Hold to Nov 9 |
| `/blog/what-resolution-for-print` | 25 | 7,844 | 5.8 | 0.32% | Readback Nov 13 |
| `/blog/tiktok-profile-picture-ideas` | 24 | 7,114 | 8.0 | 0.34% | Hold, verdict Nov 6 |
| `/blog/photoshop-upscale-image` | 28 | 6,313 | 6.5 | 0.44% | 8,533 AI impressions |

**Flagship readback:** ❌ the Oct 27 target was CTR above 5%. The period CTR is 2.56% and the last week is 2.86%. The edit missed its target but did not cause a loss.

**Hero readback:** ❌ the target was above 43 brand clicks per week. The last week is 33.

## Cannibalization

- `image upscaler 8x`: 14 URLs. `/tools/ai-image-upscaler` at 7.3 has the clicks, then `/scale/upscale-8x` at 9.1 and `/blog/image-upscaler-8x` at 9.7. The homepage fell from 8.7 to 18.6 here. No action now.
- `upscale gif`: `/blog/gif-upscaler` at 8.7 and `/formats/upscale-gif-images` at 19.6. No action, for the 301 reason above.
- `image`: 3,848 impressions at position 94, mostly `/fr`. This is noise that inflates blended position.

## Technical Blockers

- ✅ No blocker explains the click loss.
- ✅ URL Inspection: 23 of 25 pages are indexed. `/es/tools/remove-bg` is `noindex` by plan.
- ⚠️ `/tools/gif-to-jpg` returns 200, sits in the sitemap and is unknown to Google.
- ⚠️ 187 of 748 sitemap URLs (25%) have 0 impressions, led by tools (48) and blog (32). 92 URLs with traffic sit outside the sitemaps.
- ✅ Stale report rows checked live: `/blog/best-image-upscaling-tools-2026` now redirects once to a 200, and `/blog/free-ai-upscaler-no-watermark` has no malformed `/n/n` link.

## Due Dates

| Date | Item |
| ---- | ---- |
| Nov 2, 09:09 | Three Kings job. Rollback risk, see action 1 |
| Nov 2 | Text post crawl check |
| Nov 6 | TikTok title verdict. Indexing operator job runs |
| 7 days after deploy | Hero clicks and signups readback |
| Nov 10 | Earliest Core Web Vitals flip |
| Nov 13 | Oct 26 rollbacks and print-link readback. Structured data recheck |
| Nov 16 | Text post verdict |

## Tooling Gaps Found

- `tkm.cjs check` writes outcomes to the ledger, but the skill calls this step read-only. This run changed the ledger by that route, and I restored the file (17 added and 2 removed lines, no other edits).
- `judgeEdits` has no site-trend control. See action 1.
- The 5,000-impression quarantine limit misses smaller phantom queries.
- `indexing.summary.pagesMissingFromKnownSitemaps` lists pages such as `/blog/topaz-labs-free-trial` that are not in `sitemapCoverage.outsideSitemap`, so treat that field as unreliable.

## Scope Of This Run

No site code, metadata, sitemap or production data changed. No code changed, so `yarn verify` did not run. This report is not committed.

**Sources:** [Google Search Status Dashboard, Ranking history](https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history), [Search Engine Roundtable, Oct 20 and 21 volatility](https://seroundtable.com/google-search-ranking-volatility-42347.html), [Google Trends chart](https://trends.google.com/trends/explore?date=2026-06-01%202026-11-01&q=image%20upscaler,upscaler,ai%20image%20upscaler).
