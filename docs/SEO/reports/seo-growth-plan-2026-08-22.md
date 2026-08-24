# SEO Growth Plan: myimageupscaler.com

**Period:** 2026-07-23 to 2026-08-19 (GSC) / 2026-07-25 to 2026-08-21 (GA4), versus the previous 28 days  
**Data sources:** fresh GSC and GA4 exports synthesized 2026-08-22, repository history, [SEO changes backlog](../maintenance/seo-changes-backlog.md), and [GSC request-indexing backlog](../maintenance/gsc-request-indexing-backlog.md)

## Verdict

The aggregate decline is real, but it does **not** prove a broad SEO ranking collapse. The first version of this plan overstated several automated findings:

- GSC clicks and GA4 organic sessions fell by similar amounts, but the [August 17 root-cause investigation](./2026-08-17-gsc-decline-root-cause.md) showed that the earlier peak was heavily branded and that signup loss stepped down after the July 17 account-setup deploy.
- One query, `how to fix pixelated photos`, supplies 68,545 impressions and 3 clicks. It materially distorts sitewide impressions, CTR, and average position.
- GA4 `conversions` in this export are configured key-event counts, not customers or purchases. A page-level percentage is therefore a key-events-per-session diagnostic, not a revenue conversion rate.
- GSC query/page rows are not proof of cannibalization. Multiple URLs appearing for a query require intent, canonical, and time-series review before redirects or consolidation.

The immediate priority is to validate recovery from the August 17-18 signup and Worker fixes, then diagnose landing-page funnel events. Do not launch a broad metadata, redirect, or sitemap-removal batch from these aggregates.

## Baseline

| Metric | Current | Previous | Change | Interpretation |
| --- | ---: | ---: | ---: | --- |
| GSC clicks | 7,437 | 9,350 | -20.5% | Real decline, but the comparison includes the prior branded spike |
| GSC impressions | 373,735 | 321,720 | +16.2% | Dominated by a near-zero-click query cluster |
| GSC CTR | 1.99% | 2.91% | -31.5% | Mix-sensitive; not a sitewide snippet verdict |
| GSC average position | 14.3 | 11.5 | 2.8 worse | Impression-weighted and distorted by query mix |
| GA4 organic sessions | 8,699 | 11,074 | -21.5% | Directionally agrees with GSC traffic loss |
| GA4 organic key events | 9,571 | 16,268 | -41.2% | Event count, not purchases or converting sessions |

The GSC-clicks-to-GA-organic-sessions ratio is 0.85, inside the technique's 0.6-1.6 gross-mismatch band. That rules out an obvious channel-wide tracking break; it does not prove page-level attribution or key-event completeness.

## Biggest Bottleneck

The highest-confidence bottleneck is measurement and recovery of the signup/upscale funnel, not a new sitewide SEO intervention. The July 17 account-setup change cut signups per organic click from 0.83 to roughly 0.44; fixes shipped August 17-18. This report's 28-day GA4 window is mostly pre-fix and cannot judge recovery. The same investigation found roughly 300 daily Cloudflare `exceededMemory` events before the upload fix, another conversion suppressor that GSC cannot observe.

Measure both fixes over a clean post-fix window before attributing the traffic and key-event decline to rankings.

## Priority Actions

| Priority | Score | Surface | Evidence | Action | Success metric |
| ---: | ---: | --- | --- | --- | --- |
| 1 | 94 | Organic signup/upscale funnel | Signups per organic click fell 0.83 to about 0.44; fixes shipped Aug 17-18 | Track database signups per GSC click and Cloudflare `exceededMemory` daily for a clean 14-day window | Signups/click trends toward 0.7-0.8 and memory failures trend toward zero |
| 2 | 88 | `/tools/ai-image-upscaler`, `/formats/upscale-gif-images`, `/scale/upscale-16x` | 462, 160, and 110 organic landing sessions respectively, with zero attributed key events in the synthesis | Run one logged-out journey per landing page and verify `entry_page` through signup, upload, result, and checkout; fix only the first observed break | Each landing records the expected funnel sequence in GA4 DebugView/realtime |
| 3 | 81 | GIF intent owner | `/formats/upscale-gif-images` lost 564 clicks, but GIF redirects/ownership shipped before this report and GSC is still showing retired URLs | Validate live redirects and canonical ownership, then compare a complete post-deploy 14-day query/page window; do not repeat the completed consolidation | Retired GIF URLs stop receiving new impressions and the owner gains query share |
| 4 | 75 | `/dashboard` and locale dashboards | Exact brand-query rows include `/dashboard`; `robots.txt` currently disallows dashboard crawling, which is not a `noindex` directive | Scope a tested removal change: serve `noindex` while Google can crawl the page, verify removal, then reassess the crawl block | Dashboard URLs disappear from indexed brand results without affecting app access |
| 5 | 70 | CNI and sitemap policy | A historical 767-URL CNI set overlaps 167 current sitemap URLs | Refresh the export and classify each overlap as index-worthy, duplicate/redirect, intentional noindex, or low-value before changing a sitemap | Zero sitemap/noindex contradictions; index-worthy canonicals remain submitted |

Scores use the growth-plan weighting: search demand 20, business value 25, conversion leak 20, SEO leverage 20, and effort inverse 15.

## Corrections to Automated Recommendations

### Pixelated-photo cluster: monitor, do not consolidate yet

`/blog/fixing-pixelated-photos` owns 68,021 of the query's 68,545 impressions (99.2%). The two alleged competitors account for only 526 impressions and zero clicks. That is not enough evidence that they are splitting meaningful traffic.

The owner was refreshed again on August 10 and its indexing request is still pending. GSC is complete only through August 19, so this report contains nine complete post-change days. Evaluate on or after August 27, when the normal three-day GSC lag should expose 14 complete post-change days. Before any redirect, compare intent, backlinks, unique content, and query ownership for both secondary URLs.

### CNI overlap: not a removal gate

`Crawled - currently not indexed` is an observation, not a desired final state. A URL that is canonical, indexable, useful, and intended for Search generally belongs in the sitemap even while Google has not indexed it. Conversely, redirects, duplicates, intentional `noindex` pages, and low-value pages should not be submitted.

The 167-URL overlap only proves that URLs from the historical CNI export are still in current sitemaps. It does **not** prove that all 167 should be removed. The verifier's documented contract is sitemap plus `noindex` overlap; treating every CNI/sitemap overlap as failure is broader than that contract and must not drive bulk pruning.

### Brand SERP: isolate app removal from content consolidation

The exact `myimageupscaler` query has 1,317 impressions and 685 clicks at average position 1.01. Its query/page breakdown lists 88 URLs, but page count alone does not mean 88 independently ranking results.

- Removing dashboard URLs from Search is reasonable because they are private app surfaces, but it needs crawlable `noindex`, not only `robots.txt` disallow.
- Do not canonicalize or redirect `/free/free-image-upscaler` from this dataset alone. It is a self-canonical public tool with distinct free-tool intent; first inspect the live SERP and query-level overlap with `/` and `/free/free-ai-upscaler`.

### CTR and AI Overviews: verify before editing

Low CTR at an averaged position does not prove an AI Overview caused the loss. Position is aggregated across devices, countries, dates, and result layouts. Manually inspect the target query and compare device/country segments before changing a title or restructuring content.

Prioritize mature, unedited candidates such as `/blog/best-image-upscaler`, `/blog/best-ai-upscaler`, and `/blog/topaz-video-upscaler` only after that check. Do not refresh publication dates without a substantive content update.

## Already Addressed / Hold

| Item | Repository evidence | Remaining validation |
| --- | --- | --- |
| Signup blockers | Fixed Aug 17-18 in `6d3a1946` and `0e9c7140` | Clean 14-day signups-per-organic-click window |
| Worker memory failures | Base64 allocation fix shipped in `0e9c7140` | Cloudflare `exceededMemory` trend |
| Commercial landing attribution | Funnel events, session-scoped `entry_page`, and key events were validated July 10 | Live journey validation on the three zero-event pages |
| GIF ownership | Conflicting GIF routes consolidated into `/formats/upscale-gif-images`; indexing requested Aug 8 | Complete post-deploy GSC query/page comparison |
| Pixelated-photo CTR support | Owner refreshed Aug 10; request indexing pending | Evaluate on/after Aug 27; no edit before then |
| Best-free comparison | Refreshed Aug 17; request indexing pending | Evaluate on/after Sep 3; no edit before then |

## Seven-Day Plan

1. Record daily signups per GSC organic click and Cloudflare `exceededMemory` after the August 18 fixes.
2. Walk the three commercial landing funnels logged out and capture the first missing event or blocked transition.
3. Validate GIF redirects, self-canonical, sitemap ownership, and new query/page impressions.
4. Refresh the CNI export and classify the 167 historical overlaps before changing sitemap eligibility.
5. Inspect the live SERPs and device/country segments for the three mature CTR candidates; prepare one test, not a batch.

## Measurement Dates

| Date | Check | Decision gate |
| --- | --- | --- |
| 2026-08-27 or later | Pixelated-photo Aug 10 edit | Change only with 14 complete post-edit GSC days |
| 2026-08-25 or later | GIF consolidation | Compare owner versus retired URLs over a complete post-deploy window |
| 2026-09-03 or later | Best-free Aug 17 edit | Change only if its exact target cluster remains weak |
| 2026-09-03 or later | Signup and Worker fixes | Escalate only if signups/click and memory failures have not recovered |

Google's [August 2026 spam update](https://status.search.google.com/summary) ran August 18-21. GSC in this report ends August 19, so it contains only the first two update days and cannot attribute the earlier August movement to that update.

## Reproducibility

The source artifacts for this run were `/tmp/gsc-miu.json`, `/tmp/ga-miu.json`, and `/tmp/seo-plan-miu.json`. The synthesis was generated at `2026-08-22T16:26:22Z`. Re-run the project SEO pipeline before acting if those temporary files are no longer available or the measurement dates above have passed.
