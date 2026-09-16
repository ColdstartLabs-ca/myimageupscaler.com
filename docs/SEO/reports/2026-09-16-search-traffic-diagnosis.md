# Search traffic diagnosis — September 16, 2026

**The decline is real, but a new regression from the September fixes is not established. Web clicks are down 17.6% over 28 days and 2.1% over the latest complete week. The last three complete days are weaker (−15.7%), so this should not be dismissed as “expected SEO lag.” Most of the measured loss predates the latest improvements.**

Analysis complete. GSC, GA4, production metadata, live HTML, URL Inspection, and the SEO change history were checked. This investigation changes only this report.

## 1. What changed

All comparisons below run **previous → current**. GSC uses finalized data with a three-day holdback. GA4 uses the same calendar dates; its property timezone is America/Vancouver, matching the Pacific dates used by GSC.

| Window        | Previous              | Current                |
| ------------- | --------------------- | ---------------------- |
| 28 days       | July 20–August 16     | August 17–September 13 |
| Latest 7 days | August 31–September 6 | September 7–13         |
| Trend context | June 22 onward        | Through September 13   |

| Metric                                    | Previous 28 days | Current 28 days |                   Change |
| ----------------------------------------- | ---------------: | --------------: | -----------------------: |
| GSC web clicks                            |            7,523 |           6,200 |      **−1,323 / −17.6%** |
| GSC web impressions                       |          381,338 |         323,563 |                   −15.2% |
| GSC web CTR                               |           1.973% |          1.916% | −0.057 percentage points |
| GSC average position, changing search mix |            13.44 |           16.07 |     2.63 positions worse |
| GA4 organic sessions                      |            8,769 |           7,207 |               **−17.8%** |
| GA4 Google / organic sessions             |            8,197 |           6,572 |                   −19.8% |
| GA4 total sessions, direct aggregate      |           15,439 |          12,922 |                   −16.3% |

**The click loss is real:** GSC and GA4 independently show a similar 28-day decline. It is not explained solely by GA4 tracking.

**The latest full week is broadly stable, but that hides a weaker finish:** latest-week GSC clicks moved 1,522 → 1,490, impressions rose 78,066 → 80,793, and average position improved 12.99 → 11.52. Classified non-brand clicks were essentially flat, 607 → 602. GA4 organic sessions rose 1,693 → 1,905 (+12.5%); Google / organic rose 1,553 → 1,712 (+10.2%). Clicks and sessions measure different things and need not move identically.

| Monday–Sunday week    | Web clicks | Homepage clicks | Best-free article clicks |
| --------------------- | ---------: | --------------: | -----------------------: |
| August 10–16          |      1,667 |             609 |                      289 |
| August 17–23          |      1,758 |             675 |                      289 |
| August 24–30          |      1,430 |             580 |                      112 |
| August 31–September 6 |      1,522 |             526 |                      148 |
| September 7–13        |      1,490 |             496 |                      171 |

The best-free article is recovering from its late-August low, although it remains well below July. The homepage continues to soften. These deserve separate investigations.

### Is this a regression, or expected after the improvements?

**Verdict: earlier acquisition losses + recently shipped repairs + a concerning short post-release signal. No single cause explains all three.**

| Same weekdays, Friday–Sunday | September 4–6 | September 11–13 |     Change |
| ---------------------------- | ------------: | --------------: | ---------: |
| GSC web clicks               |           638 |             538 | **−15.7%** |
| Homepage clicks              |           212 |             170 |     −19.8% |
| Best-free article clicks     |            75 |              51 |     −32.0% |
| GA4 organic sessions         |           755 |             686 |      −9.1% |

This confirms the user's concern about the most recent visible days. It is not merely comparing a weekend with weekdays. However, three days after a release, multiple simultaneous changes, and unknown first post-change crawl times do not isolate a causal regression. The homepage had already fallen 910 → 609 weekly clicks between August 3–9 and August 10–16, a month before the September recovery work.

**A focused post-release check does not show a new broad homepage ranking regression.** Reusing the five exact queries already pinned in the September 10 baseline gives this Friday–Sunday comparison:

| Homepage query    | Clicks, September 4–6 → September 11–13 | Impressions, previous → current | Blended position, previous → current |
| ----------------- | --------------------------------------: | ------------------------------: | -----------------------------------: |
| image upscaler    |                                 21 → 22 |                     1,269 → 902 |                        12.48 → 13.37 |
| upscaler          |                                  10 → 4 |                       632 → 475 |                          9.13 → 9.43 |
| image upscaler 4k |                                   1 → 8 |                       113 → 112 |                        10.10 → 12.21 |
| ai image upscaler |                                   1 → 1 |                       141 → 119 |                        27.97 → 28.87 |
| upscale image     |                                   2 → 2 |                         17 → 17 |                        42.53 → 40.18 |

Across those queries, clicks moved **35 → 37**, while impressions fell **2,172 → 1,625**. Holding the same **212 query × country × device combinations** and their previous-period impression weights constant, position was **12.55 → 12.51**. The apparent blended deterioration is therefore not reproduced by this matched control. This is a three-day, low-click sample covering only part of homepage traffic; it cannot rule out losses on other queries or later effects. It does make an immediate broad rollback of recent homepage work unsupported by the available evidence.

**Expected:** a 28-day comparison can remain negative while it contains mostly pre-fix dates; a change Google crawled September 16 cannot explain performance ending September 13. **Not automatically expected:** a continuing decline on the same queries after recrawl, a broken destination, or lost funnel events. Those require investigation rather than an indefinite waiting period.

### Git history: improvements already made

The review used actual diffs and dated production verification, not PR titles or unchecked PRD lists alone.

| Change                                                                        | Commit evidence                                                            | What it changes about this diagnosis                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| August 13 and 25 coverage, locale, sitemap, taxonomy and performance recovery | `63bb04f9`, `a8c0514d`, `e95af3c0`, `52619af4`, `d08a19da`                 | These are weeks old. “We just shipped” cannot explain away their entire follow-up period. They repaired technical eligibility; they did not guarantee recovery of the homepage's generic rankings.                                           |
| September 3–4 snippet/content tests                                           | `652be54c`, `d311493b`, Three Kings ledger                                 | Poster/Photoshop/Adobe and the later description tests already exist. Respect their recorded evaluation windows.                                                                                                                             |
| September 8 mobile LCP and new 404 repairs                                    | `dd1791c5`, `157158f2`                                                     | Homepage images, deferred scripts and redirect gaps were addressed. Do not recommend implementing those same fixes again. Field performance and query recovery still need measurement.                                                       |
| September 10 product-truth and page recovery                                  | `b90c56da` (#129), `b960b7b3` (#131), `d4781071`, `219aecfb`               | Homepage/CTA copy became region- and account-aware; misleading claims were removed. The print checker was built, inserted into the poster article, then corrected. Its controls are present in live HTML now.                                |
| September 10 flagship article changes                                         | `685bff2f` morning rollback; later production edits recorded in `219aecfb` | The same day also changed the title from **“Only 3 Worked” to “Limits Compared”**, corrected account/formats/credits/trial claims, and disclosed ownership. This is a **combined intervention**, not an isolated rollback or title A/B test. |
| September 10 measurement and publishing repairs                               | `27654f0c` (#130), `315623bb`, `010b8361`, `c13b8390`                      | Funnel dimensions shipped; missing Worker secrets were deployed; blog invalidation was corrected for locale routes. Git commit time, successful DB write, rendered HTML, and Google recrawl are distinct milestones.                         |
| September 11 indexing requests; September 14 YouTube test                     | `4182f2a5`, `7278fd49`, `c3ce6f93`, `14422850`                             | Several requests are already complete. YouTube's September 14 description is live now but entirely outside the performance window.                                                                                                           |

The unchanged homepage title was explicitly preserved in [its September baseline](../../../seo-reports/homepage-change-log-2026-09.md). Its body, CTA and description did change; preserving the title does not mean the page was unchanged. Removing unsupported “no signup” and unconditional free-credit promises could reduce low-intent clicks, but **that is a hypothesis, not an established explanation**. Qualified activation and revenue must validate the tradeoff.

The older [page-recovery PRD](../../PRDs/seo-recovery-2026-09/03-page-recovery.md) still describes the flagship edit as blocked and the poster checker as unreachable. Later change records and current live HTML supersede those statements. The checker does not need to be built again, and the article has already been corrected. Live HTML verification here proves the checker is rendered, not that its entire interaction flow was retested.

**Near-term check: September 21.** Compare September 11–17 against September 4–10, inspect the homepage's already-pinned five non-brand queries by country/device, and check recrawl timing. Escalate earlier for a non-200/noindex/canonical defect. If the full post-release week still loses clicks and fixed-query positions worsen, investigate the September changes directly rather than classifying the result as routine lag. For broad article rewrites, keep the existing September 28 review gate; if crawl exposure is later, extend the observation window explicitly.

### Search-type mix

Web supplied **6,200 of 6,211 clicks (99.8%)** across the fetched search types. Image search fell 21 → 11 clicks, while image impressions increased 23,241 → 23,447. Video, News, Discover, and Google News returned no traffic in either window. Image search does not explain the decline.

## 2. Separate real acquisition losses from misleading impressions

### Brand, non-brand, and undisclosed queries

The brand definition is deliberately narrow: variants of “myimageupscaler,” “my image upscaler,” and “my upscaler.” Ambiguous queries such as “my image” remain outside that brand bucket. The exact case-insensitive RE2 expression was `my[ ._-]*image[ ._-]*upscaler|myimageupscaler|my[ ._-]*upscaler`.

| Query bucket          | Previous clicks | Current clicks |          Change |
| --------------------- | --------------: | -------------: | --------------: |
| Classified brand      |             962 |            764 |   −198 / −20.6% |
| Classified non-brand  |           2,963 |          2,417 |   −546 / −18.4% |
| Unclassified residual |           3,598 |          3,019 |   −579 / −16.1% |
| Property total        |           7,523 |          6,200 | −1,323 / −17.6% |

The buckets reconcile exactly. The residual is the difference between unfiltered totals and query-filtered totals; it includes privacy-suppressed/non-returned query data and must not be assigned to brand or non-brand. Almost half of current clicks cannot be classified this way. Google documents that Search Analytics does not guarantee every row. [Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).

The exact query **“myimageupscaler”** fell 711 → 482 clicks and 1,376 → 911 impressions while position stayed 1.01 → 1.00. That is consistent with reduced branded search demand, rather than a loss of ranking for that query. Other brand variants partly offset it.

There is also a real ranking loss: **“image upscaler”** fell 464 → 218 clicks and moved 10.26 → 13.44. On the homepage specifically, it fell 457 → 203 clicks and moved 10.19 → 13.34. Reduced brand demand cannot explain this generic-query loss.

### One anomalous query distorts the impression chart

The [August baseline](brand-vs-nonbrand-baseline-2026-08-25.md) already quarantined **“how to fix pixelated photos.”** In this comparison it moved:

| Metric      | Previous | Current |
| ----------- | -------: | ------: |
| Impressions |   83,852 |   4,980 |
| Clicks      |        3 |       0 |

Its **78,872 lost impressions exceed the entire site's 57,775-impression decline**, while accounting for only three lost clicks. Its origin has not been established; this report does not label it bot traffic.

Excluding that exact query, property impressions increased **297,486 → 318,583 (+7.1%)**. Classified non-brand impressions increased **143,726 → 157,266 (+9.4%)**, while clicks fell **2,960 → 2,417 (−18.3%)** and CTR fell **2.06% → 1.54%**. That supports a problem with rankings, search mix, and click capture, rather than a uniform disappearance from search.

A control using the same 6,518 non-brand queries present in both periods, excluding the quarantined query and holding previous-period impression weights constant, moved **15.56 → 16.26**. Ranking deterioration remains in that control, but is smaller than the blended average suggests. It still does not hold country, device, or SERP features constant.

## 3. Where the clicks went

| Page or family                                                                                         | Clicks, previous → current |   Change | Diagnosis                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | -------------------------: | -------: | ---------------------------------------------------------------------------------------------------------- |
| [Homepage](https://myimageupscaler.com/)                                                               |              3,218 → 2,277 | **−941** | Both generic ranking loss and lower branded demand; CTR 4.52% → 3.97%.                                     |
| [Best-free article](https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared) |                1,386 → 720 | **−666** | Impressions nearly stable; CTR 12.44% → 6.67%. Recent rollback is still awaiting a full evaluation window. |
| GIF upscaler URL family¹                                                                               |                  310 → 182 |     −128 | Retired URLs lost clicks; the blog gained some, but the retained guide did not absorb all of them.         |
| [AI image upscaler tool](https://myimageupscaler.com/tools/ai-image-upscaler)                          |                  385 → 297 |      −88 | Impressions 5,954 → 4,690; position 6.97 → 7.82.                                                           |
| [No-watermark article](https://myimageupscaler.com/blog/free-ai-upscaler-no-watermark)                 |                   113 → 33 |      −80 | Impressions 3,397 → 1,101; position 5.89 → 7.47. Visibility/ranking loss, not just a snippet problem.      |

¹ URLs containing `/gif-` or `/upscale-gif`, including locale variants, the format-scale redirects, the retained format guide, and `/blog/gif-upscaler`; this is an explicit upscaler family, not every GIF-related article.

The homepage and best-free article together lost **1,607 page clicks**, more than the property's net loss because other pages gained. Examples: `/blog/gif-upscaler` +121, `/scale/2k-upscaler` +51, `/blog/best-app-for-unblurring-photos` +51, and `/blog/poster-size-dimensions-pixels` +40. Page-level totals differ from property totals: 7,581 → 6,277 versus 7,523 → 6,200. Page rows therefore should not be forced into an exact property-level attribution waterfall.

### Best-free article: strong symptom, incomplete causal evidence

Impressions moved just **11,146 → 10,797 (−3.1%)**, while average position moved **5.27 → 5.56** and clicks nearly halved. This is a clear page-level CTR regression, but not proof that one title or description caused it.

Only **261 previous clicks and 174 current clicks** appear in the page-filtered query exports. Of the page's 666-click loss, **579 is outside the disclosed query rows**. A precise lost-keyword explanation would overstate the evidence.

The change history records an August 17 body/metadata experiment, a September 10 morning rollback, and a separate September 10 evening factual/title rewrite. The largest weekly break occurred August 24–30. Google also rolled out its August spam update **August 18–21**. Both overlap the incident; timing alone cannot distinguish their effects. The broader homepage decline already appears before that update. Google's dashboard showed no active incident when checked September 16. [August update record](https://status.search.google.com/incidents/LEubPCm2octf2uMqCFKE), [current status](https://status.search.google.com/).

Live HTML now exposes the truthful “Limits Compared” title and no longer contains the removed proof module. URL Inspection reports a successful crawl on **September 16**, later than this report's performance cutoff. **Do not judge the combined September 10 intervention using data ending September 13, or attribute its eventual result to the rollback alone.**

### GIF migration and overlapping URLs

The retired `/format-scale/gif-upscale-16x` still returns exactly one **301 → `/formats/upscale-gif-images` → 200**, with an indexable, self-canonical destination. Its 171 → 0 clicks are an intentional migration signal, not evidence of a broken route.

Recovery is incomplete: the retained guide moved **38 → 35 clicks**, while the blog moved **14 → 135**. In the latest week, the blog itself fell **52 → 20**, a 32-click loss equal in size to the property's net weekly loss. Other page changes offset one another; this does not mean the blog alone caused every weekly movement.

For “gif upscaler,” Google currently favors the blog: **42 clicks, position 6.23**, versus the guide's **1 click, position 25.19**. Review the intended division between these two pages and their internal links. Do not reverse the redirect or promise native animated-GIF processing to regain unqualified clicks; the existing [measurement/URL hygiene PRD](../../PRDs/seo-recovery-2026-09/02-funnel-and-url-hygiene.md) explicitly keeps GIF processing educational.

For “image upscaler 8x,” the tool, blog, and scale page all appear; the tool receives 90 query/page clicks versus six each for the other two. This is a candidate for ownership review, not demonstrated harmful cannibalization. Page/query clicks can differ from property/query clicks. Branded sitelinks, locale URLs, and fragment links are not automatic consolidation candidates.

## 4. GA4: less acquisition, plus an attribution problem

Organic Search supplied **55.8% of total sessions**, versus 56.8% previously, using directly queried totals. No channel's share changed by ten percentage points. The decrease is not primarily a migration from Organic Search into another channel. Bing organic increased 338 → 387 sessions while Google organic fell 19.8%.

### Actual landing pages

These rows use **`landingPagePlusQueryString`**, not `pagePath`. Key-event rate means sessions containing any configured key event, not purchase conversion rate. [GA4 metric and dimension definitions](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema).

| Entry page             | Organic landing sessions, previous → current | Current engagement | Any-key-event session rate, previous → current |
| ---------------------- | -------------------------------------------: | -----------------: | ---------------------------------------------: |
| Homepage               |                                2,705 → 2,165 |              82.7% |                                  51.5% → 55.3% |
| Best-free article      |                                  1,749 → 899 |              87.7% |                                  43.7% → 42.4% |
| AI image upscaler tool |                                    348 → 307 |              77.2% |                                  27.0% → 32.6% |
| Poster-size article    |                                     55 → 127 |              44.1% |                                   10.9% → 6.3% |
| GIF upscaler blog      |                                     22 → 118 |              78.8% |                                     0% → 11.0% |

The best-free article's **48.6% landing-session decline** independently supports its GSC loss. The homepage's engagement and any-key-event rate improved among remaining visitors. Current evidence does not support a sitewide landing-page engagement collapse as the main traffic explanation.

The poster-size article has a real engagement opportunity: 55.9% bounce and 6.3% any-key-event rate. Git history and current live HTML confirm the print-readiness checker already serves that intent. Measure its existing `print_readiness_checked` event and downstream activation on post-release traffic before redesigning the CTA, while preserving the current snippet experiment. These aggregate metrics do not establish a purchase opportunity or revenue forecast.

### Conversion counts cannot currently establish SEO revenue

| Event            | Organic Search, previous → current | Unassigned, previous → current |
| ---------------- | ---------------------------------: | -----------------------------: |
| `select_content` |                      8,268 → 6,520 |                  5,774 → 5,965 |
| `generate_lead`  |                     **1,677 → 10** |                  6,926 → 4,843 |
| `begin_checkout` |                          253 → 259 |                      263 → 184 |
| `purchase`       |                          **0 → 0** |                    **35 → 29** |

Organic key events fell **10,198 → 6,789 (−33.4%)**, but **96.0% of the current total is `select_content`**. Those events are not interchangeable with signups, completed upscales, customers, or sales.

The daily export localizes an attribution/measurement discontinuity to **August 3**: organic `generate_lead` was 77–172 per day during July 20–August 2, then generally zero with occasional two-event days. Unassigned leads continue. Git now supplies a plausible mechanism: `8b80abe5` (August 1) removed normal browser `upscale_completed` emission and made the server own terminal upscale telemetry. Both `upscale_completed` and `image_upscaled`, plus `signup_started`, map to `generate_lead` in `shared/analytics/types.ts`. This metric is therefore not a signup count. The observed August 3 break is consistent with that ownership transition; the exact deployment time and event-by-event loss were not reconstructed.

**Git records a confirmed measurement regression and its repair:** `315623bb` added the missing `GA4_API_SECRET` to the Worker secret allowlist, and `010b8361` records production verification on September 10. Before that deployment, `trackGA4ServerEvent` returned early without this secret. Historical browser/other-path GA4 events still exist; the record does not mean the entire GA4 property was empty. Moving events to the server while this path was disabled makes pre/post conversion counts incomparable. Start a fresh server-funnel baseline on **September 11**, the first complete subsequent day.

**All 29 current purchase events are Unassigned**, including all seven observed September 11–13 purchases after the September 10 deployment. GA4 attributes zero revenue to Organic Search. That is insufficient evidence that organic traffic produces no revenue. The existing PRD already added landing/device/mode/country dimensions, but that alone does not establish GA4 session attribution. The current server sender uses `deviceId` or a generated `server-<timestamp>` value as `client_id`; whether each event carries the original GA client and session identifiers still needs a traced production journey. Event delivery was repaired; accurate channel attribution is not yet demonstrated.

### Device and country checks

GSC desktop clicks fell **4,029 → 3,326 (−17.4%)**; mobile fell **3,352 → 2,754 (−17.8%)**. The loss is not confined to mobile. GA4 mobile engagement remained **81.7% → 81.2%**; desktop engagement moved 77.9% → 75.5%. No fresh field-CWV evidence was collected, so this report does not assign the decline to LCP.

The largest country click losses were Indonesia (−126), Germany (−113), and Brazil (−86). GA4 organic sessions also fell in these countries. Brazil's impression movement is additionally affected by the previously flagged pixelated-photo query; it should not be used alone to infer a localization failure.

## 5. Indexing, live changes, and CTR opportunities

**All 10 inspected URLs passed**: submitted and indexed, successful fetch, indexing allowed, and no Google/user canonical mismatch. This includes the homepage, best-free article, AI upscaler tool, pixelated-photo article, GIF blog, and Topaz trial article. This targeted sample does not establish sitewide coverage or rule out manual actions; the corresponding GSC UI reports were not inspected.

| Check                         | Current evidence                                                                        | Action state                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Best-free September 10 edits  | Live corrected title/body and removed module absent; last Google crawl September 16     | **Defer with deadline:** review September 28, after the September 24 cooling window and final-data holdback. |
| Pixelated-photo rollback      | Live removed module absent; last Google crawl September 3, before rollback              | **Indexing follow-up:** request recrawl using its existing backlog row.                                      |
| YouTube thumbnail description | Live HTML and production metadata both contain the September 14 size/export description | **Indexing follow-up:** prior cache blocker cleared; request indexing, then evaluate October 2.              |
| Main sitemap                  | Zero reported errors/warnings; downloaded September 15                                  | No evidence for resubmitting it as a traffic fix.                                                            |
| Static sitemap                | Zero errors, one warning; downloaded September 8                                        | Inspect the existing warning in GSC before claiming resolution.                                              |

Sitemap API `indexed: 0` values are not used as an index-count diagnosis: URL Inspection independently confirms indexed pages. The inspection response lacks a sitemap association for the pixelated-photo article; this alone does not prove it is absent from the live sitemap.

**Open Actions: 71 unchecked indexing entries.** The oldest dated pending group is **August 13**, for eight remaining blog URLs. This is a queue count, not a count of unindexed pages. Reconcile each candidate against redirects, current indexability, and recent crawls before requesting indexing. In particular, the older consolidation record retires `best-image-upscaling-tools-2026`, which still appears as an unchecked request candidate. No requests were submitted or marked complete in this investigation. [Existing indexing backlog](../maintenance/gsc-request-indexing-backlog.md).

### Blog audit and near-term opportunities

The production audit read **260 published posts**. A corrected pass using exact canonical page rows found **145 posts with GSC data** and **83 heuristic CTR flags**. These are screening flags, not proof that metadata caused a loss or that benchmark click estimates are attainable.

The stock audit lets later fragment/query URL rows overwrite the canonical row for a slug. This report reran its pure audit logic against exact canonical rows using the already fetched effective metadata. No production content or audit implementation was changed.

| Candidate                 | 28-day evidence                                                                   | Next decision                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Poster-size article       | 33,462 impressions; position 6.27; CTR 0.28%; clicks growing                      | Review September 21 after the September 17 window closes; focus on print intent and engagement if the test still underperforms.                               |
| Topaz trial article       | 13,247 impressions; position 7.49; CTR 1.47%                                      | Review September 18 with final data through the closed window; no trial claim should change without current product verification.                             |
| YouTube thumbnail article | 6,223 impressions; position 7.01; CTR 0.51%                                       | Index the now-live description; hold further edits until October 2.                                                                                           |
| No-watermark article      | 70.8% fewer clicks; 67.6% fewer impressions                                       | Investigate lost visibility and current tool-vs-comparison intent now; a title-only CTR rewrite does not address the measured symptom.                        |
| New content               | Existing pages already cover the observed upscaler, print, and restoration demand | Defer new articles until the large existing losses and attribution gap are handled; this run establishes no missing-topic opportunity stronger than recovery. |

These are conservative review dates allowing three complete holdback days after each closing date. The September 4 description tests on best-ai-upscaler, topaz-video-upscaler, and best-image-upscaler should similarly wait until **September 22** for evaluation of their September 18 close. The performance data in this report cannot evaluate September 14 edits.

## 6. Five ranked actions

1. **Evaluate the existing homepage recovery — baseline now, 30 minutes; first full-week check September 21.** Reuse the September 10 fixed-query baseline and the shipped performance/product-truth changes. Track “image upscaler” (457 → 203 homepage clicks) plus the other four pinned queries by country/device. Compare September 11–17 with September 4–10; worsening fixed-query positions after recrawl trigger a focused review of the recent copy/template changes, not another general SEO rebuild.
2. **Measure the already-shipped flagship rewrite — 20 minutes now; decision September 28.** Record both September 10 interventions and the September 16 crawl. Preserve factual corrections and compare closed post-change periods using page clicks plus actual GA4 landing sessions. If losses persist, prepare a single-variable brief; do not restore false “no signup” claims or call the combined edit a controlled rollback experiment.
3. **Process the indexing queue by evidence — 15 minutes for the first batch.** Start with the pixelated-photo rollback and now-live YouTube description. Check the restoration rollback next. Reconcile retired/already-recrawled URLs rather than blindly submitting all 71 entries. Mark a request complete only after visible GSC confirmation.
4. **Validate the measurement repair already deployed — 60–90 minutes.** Start the comparable server-funnel baseline September 11. Trace an organic entry through signup, upload/upscale, checkout, and purchase using the existing attribution implementation. Locate the first event losing GA client/session context, then recheck processed reporting after 24–48 hours. The secret omission was fixed; reimplementing event collection is not the next action.
5. **Audit the remaining losing intent clusters — 45–60 minutes.** Start with the no-watermark article, then GIF guide/blog ownership and the 8x tool/blog/scale overlap. Preserve the working GIF redirect and accurate product claims. Use evidence from destination performance and query intent before selecting a content edit or consolidation.

**Next two-minute action:** open the homepage's GSC Performance report, filter to the exact query “image upscaler,” and set a September 21 reminder to compare September 11–17 against September 4–10.

## 7. Sources, reproducibility, and validation

Primary evidence came from `sc-domain:myimageupscaler.com`, GA4 property `519826120`, read-only production blog metadata, and ten live URL checks. Credentials were never written into the report. The production metadata read used the repository's service-account credential override after the named personal GCloud account lacked valid credentials; no secret versions or production data were changed.

Repository context: [SEO changes](../maintenance/seo-changes-backlog.md), [indexing queue](../maintenance/gsc-request-indexing-backlog.md), [Three Kings ledger](../maintenance/three-kings-ledger.json), [blog changelog](../../../.claude/skills/blog-changelog.md), and [existing measurement PRD](../../PRDs/seo-recovery-2026-09/02-funnel-and-url-hygiene.md). The historical August 17 report's “non-brand healthy” conclusion does not describe this newer 28-day window. Git review also covered the August 1 telemetry ownership change, August recovery batches, September 8 performance/redirect work, all three September 10 recovery PRs, the later secret/revalidation corrections, and September 11–14 follow-ups.

Temporary analysis artifacts, available in this workspace but not committed:

| Artifact                                                                       | Path                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------- |
| GSC 28-day export, including URL Inspection                                    | `/tmp/gsc-miu-2026-09-16-28d.json`          |
| GSC 7-day export                                                               | `/tmp/gsc-miu-2026-09-16-7d.json`           |
| GA4 standard export                                                            | `/tmp/ga-miu-2026-09-16-28d.json`           |
| Supplementary direct aggregates, actual landing pages, classified daily trends | `/tmp/miu-search-diagnosis-2026-09-16.json` |
| Page-filtered queries and dated lead/purchase evidence                         | `/tmp/miu-targeted-2026-09-16.json`         |

The focused post-release query/country/device export is `/tmp/miu-homepage-cohort-2026-09-16.json`. The live checks and canonical metadata audit are also retained at `/tmp/miu-live-check-2026-09-16.json` and `/tmp/blog-audit-canonical-miu-2026-09-16.json`. Temporary files may be removed by the operating system; the substantive findings and comparison windows are preserved here.

Standard refresh commands, using the installed `.agents` paths rather than the skills' stale `.Codex` examples:

```bash
node .agents/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/gsc-miu-refresh.json
node .agents/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=7 --search-types=web,image --inspect-top-pages=0 --output=/tmp/gsc-miu-refresh-7d.json
node .agents/skills/ga-analysis/scripts/ga-fetch.cjs --site=myimageupscaler.com --days=28 --lag-days=3 --output=/tmp/ga-miu-refresh.json
```

For this analysis, supplemental queries reused the fetchers' authentication/API functions with `dataState: final`, pagination up to 25,000 rows per request, actual `landingPagePlusQueryString`, and direct GA4 totals. The standard GA helper uses `pagePath` first and sums channel rows for totals; those outputs were not used as true landing-page or deduplicated total-session measures here. Supplemental GA responses reported no sampling/threshold flags. GA dimension totals still need not sum exactly to a dimensionless session total.

Validation: all supplemental API requests succeeded; classification buckets reconcile to GSC property clicks; finalized daily totals match the exported windows; primary page and GA4 figures were checked against the saved JSON. `yarn verify` passed, including the 11 cache-configuration tests. No application behavior changed, so no new implementation tests were added.
