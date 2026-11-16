# GSC Request Indexing Backlog

Created: 2026-05-06
Deduplicated: 2026-07-22
API-inspected: 2026-08-03

## When To Use

After a production SEO change, open Google Search Console URL Inspection for each pending URL below and click **Request indexing**. Keep one row per URL. Resolve a pending row only when either (a) the request is visibly accepted in the GSC UI, or (b) the URL Inspection API proves Google successfully crawled the URL after the recorded production change and currently reports `Submitted and indexed`; annotate API-resolved rows explicitly so they are not misreported as manual requests.

Note: On 2026-06-12, `https://myimageupscaler.com/sitemap.xml` and `https://myimageupscaler.com/sitemap-static.xml` were resubmitted through the Search Console Sitemaps API and both returned `204 No Content`. This does not replace manual URL Inspection request indexing.

## Pending

> **2026-11-13:** daily Request-indexing quota reached after 11 accepted; continue with the unchecked rows on the next day.

### Sitemap/noindex submission cleanup — live reconciled and resubmitted 2026-11-16

The Nov 2 pending-deployment state is superseded by normal public readback, not by assuming all eight URLs must remain excluded. `/compare/midjourney-vs-stable-diffusion`, `/es/alternatives/vs-imgupscaler`, and `/fr/alternatives/vs-adobe-express` remain 200/noindex and are absent from submitted `<loc>` entries. The other five Adobe Express locale URLs (`es,pt,de,it,ja`) are now 200/self-canonical/**index, follow** and correctly remain submitted; do not delete these restored indexable URLs based on the old report. All seven sitemaps retain their actual category hubs; the English Adobe Express owner remains indexable. No robots directives were changed in this run.

**Completed 2026-11-16:** submitted `/sitemap-compare.xml` and `/sitemap-alternatives-{es,pt,de,fr,it,ja}.xml` through the GSC Sitemaps API, **7/7 PUT 204**, followed by exact-target **7/7 GET 200** with `lastSubmitted` `2026-11-16T17:48:04.920Z`–`17:48:06.134Z`, `isPending: true`, errors/warnings 0. Submission is accepted; Google processing/crawl/indexing is not yet proven. This is **not** a URL Inspection Request indexing. Check processing on **2026-11-19**; investigate any errors or a sitemap still pending, without automatic duplicate submissions. No new URL rows for this cleanup; the queue below governs current totals. Independent Topaz/TikTok/Photoshop gates are unchanged.

### Print export format support link — live verified 2026-10-26

- [x] `https://myimageupscaler.com/blog/what-resolution-for-print` — **API-resolved 2026-11-02, not a manual request:** `Submitted and indexed`, indexing allowed, successful post-link-write crawl `2026-10-27T16:07:15Z`, matching Google/user canonicals. **Reopened 2026-10-26:** one contextual body link to `/blog/best-high-resolution-image-format`; authenticated content hash remains `eb24994a1eed700ee2e3251e7d19e3692e0fba20649266b80c91baf32724ea35`, and normal public rendered article exposes exactly one followed link (200, one self-canonical, index/follow). Prior June 5 change was API-resolved Aug 3. Native browser connection timed out twice; **no manual request claimed**. Link-effect window Oct 27–Nov 9; earliest final-data readback **2026-11-13**. Destination already indexed; no duplicate request or experiment reset.

### TikTok PFP rung-2 description — live verified 2026-11-09

- [x] `https://myimageupscaler.com/blog/tiktok-profile-picture-ideas` — **Reopened 2026-11-09:** seo_description-only rung 2 replaces the vague brand/click promise with the eight existing PFP styles and crop/clarity preparation. Authenticated GET and normal public HTML match SHA256 `e2746a9f380b3eb77c089a135a21758a702a6e6e1751954feef1c527274c35e1`, HTTP 200 / one self-canonical / index-follow; title/body unchanged. API updated_at `2026-11-09T16:19:55.531234+00:00`. Nov 9 inspection reports Submitted and indexed, indexing allowed, matching Google/user canonicals, but last crawl `2026-11-04T21:13:35Z` predates this new write and cannot resolve it. Native browser preflight timed out twice; **no manual request claimed**. Inspect for a successful post-write crawl Nov 12; measure Nov 10–23, earliest conservative final-data verdict **2026-11-27**. Prior title rung: **API-resolved 2026-10-26, not a manual request**, successful post-title-change crawl `2026-10-23T19:16:16Z`; original 2026-10-19 title test measured Oct 20–Nov 2, earliest final-data verdict **2026-11-06**, now judged FLAT without resetting its dates. Do not repeat a rung inside the open window. — **API-resolved 2026-11-13, not a manual request; reverified 2026-11-16:** Submitted and indexed, indexing allowed, page fetch successful, matching Google/user canonicals; successful post-description-write crawl `2026-11-13T18:11:19Z` after the Nov 9 write. Original exposure/measurement dates retained; no new manual request claimed.

> **2026-08-13 deploy — daily quota reached.** GSC's URL Inspection "Request indexing"
> button is capped at ~10 submissions per property per day. 10 were submitted and
> 9 confirmed ("URL was added to a priority crawl queue"); the 11th returned
> **Quota Exceeded**. The remaining entries below need another pass tomorrow — the
> quota resets daily.
>
> All 38 URLs were also submitted via **IndexNow** (38/38 accepted), which covers
> Bing/Yandex immediately and is not subject to this quota. The GSC requests are a
> Google-specific nudge on top of the sitemap, not the only path to recrawl.

> **2026-08-25 browser pass — daily quota reached after 11 accepted requests.**
> The following blog URLs were visibly accepted with "URL was added to a priority
> crawl queue": `/blog/remove-noise-in-photoshop`,
> `/blog/best-free-ai-image-upscaler-2026-tested-compared`,
> `/blog/fixing-pixelated-photos`,
> `/blog/screenshot-upscaling-rescue-low-resolution-captures`, `/blog/dpi-of-image`,
> `/blog/best-video-upscaler`, `/blog/why-upscaled-text-looks-blurry-how-to-fix`,
> `/blog/ai-quality-enhancer`, `/blog/damaged-old-photographs`,
> `/blog/turn-image-into-illustration`, and `/blog/what-is-8k-image-resolution`.
> The next attempt, `/blog/photo-restoration-near-me`, returned **Quota Exceeded**;
> it remains unchecked for the next daily reset. The dashboard request was rejected
> during live testing because the deployed URL correctly exposes `noindex, follow`;
> it is recorded below as an intentional noindex cleanup, not as an accepted
> indexing request.

### Remove-background CTR metadata refresh — request after deployment

- [x] `https://myimageupscaler.com/tools/remove-bg` — 2026-09-28 pSEO title/meta/H1/intro refresh for the 27,950-impression remove-background cluster. Deployed 2026-10-15; live title and H1 expose `Remove Background Online Free`. Indexing requested 2026-10-17 in the GSC URL Inspection UI, confirmed "URL was added to a priority crawl queue".

### Three Kings refresh — live verified, ready to request

- [x] `https://myimageupscaler.com/blog/poster-size-dimensions-pixels` — **API-resolved 2026-10-05, not a manual request:** `Submitted and indexed`, successful crawl `2026-09-27T09:53:32Z` after the 2026-09-21 write, matching Google/user canonical. Normal public article now exposes the effective-PPI module; API body hash verified. Earlier public exposure is unknown: measurement conservatively starts 2026-10-05; earliest final-data verdict 2026-10-23.
- [x] `https://myimageupscaler.com/alternatives/vs-adobe-express` — indexing requested 2026-09-04, confirmed "added to a priority crawl queue" — 2026-09-03 Three Kings refresh; production HTML and sitemap `lastmod` verified after deploy.
- [ ] `https://myimageupscaler.com/blog/photoshop-upscale-image` — **Reopened 2026-11-16: HOLD indexing until repaired navigation is exposed in normal public HTML.** Content-only PATCH at `2026-11-16T17:37:03.466358+00:00` repairs three dead Neural Filters/batch/print fragment destinations; API GET matches SHA256 `9d9b92103fc566f838b221d065ac527a30825f0e2212a762ad88d6a0fa0132d2`. The five API-body jump links now resolve to existing rendered heading IDs (previously two); headings, link labels, metadata/CTAs/media unchanged. **Public delivery remains incomplete:** four normal GETs still render the three old targets, HTTP 200/self-canonical/index-follow. No repeat PATCH, cache-buster, purge, deployment, new measurement window or manual indexing request. Check normal HTML **2026-11-19**; only after all five jumps work may the existing indexing operator inspect/request once. Earlier indexing requested **2026-09-04**, visibly accepted in the priority crawl queue, for the Sep 3 refresh; retain that history, not completion for today's repair.

### Three Kings ladder actions — request after current live HTML is verified

- [x] `https://myimageupscaler.com/blog/text-image-enhancer` — **API-resolved 2026-11-05, not a manual request:** `Submitted and indexed`, indexing allowed, successful post-description-write crawl `2026-11-04T11:13:45Z`, matching Google/user canonicals. Resolves the **Reopened 2026-10-29** rung-2 seo_description-only readability test; prior July 22 refresh was API-resolved Aug 3. Authenticated API and normal public meta still match SHA256 `78521227d940e3f82b5bee461ee305503fa85a30c754c7003d61403accff6bcb` (200, one self-canonical, index/follow); API updated_at remains `2026-10-29T16:20:24.414992+00:00`, body hash unchanged. The Oct 28 crawl reported Nov 2 was pre-write; today's crawl qualifies. Native browser timed out twice; no manual request claimed. No new edit or measurement reset. Measure Oct 30–Nov 12; earliest conservative final-data verdict **2026-11-16**.

- [ ] `https://myimageupscaler.com/blog/topaz-labs-free-trial` — **Reopened 2026-11-16: HOLD measurement and indexing.** Rung-3 content PATCH and authenticated GET agree at `2026-11-16T16:21:29.640128+00:00`, SHA256 `a9fa46705fe9ea9c4c7c9c4301ab1b76f1bddead8b30149d6eedd685c6df199b`. The normal public URL remains 200 / self-canonical / index-follow but its rendered article still serves the prior body (three ordinary GETs, no cache-buster); API success is not confirmed search exposure. Recheck normal rendered HTML on **2026-11-19**; after it matches, anchor 14 complete GSC days to first confirmed exposure, then allow the existing indexing operator to proceed. No fixed verdict date until exposure; no manual request claimed, deploy or purge. Nov 16 inspection is Submitted and indexed / allowed / matching canonicals, but last crawl `2026-11-07T19:47:30Z` predates this write. **Prior history:** **API-resolved 2026-10-29, not a manual request:** `Submitted and indexed`, indexing allowed, successful post-rollback crawl `2026-10-28T09:11:25Z`, matching Google/user canonicals; normal public HTML remains 200 / one self-canonical / index-follow with the exact restored meta. Resolves the 2026-10-26 reopening for the rung-2 LOSS rollback; prior Sep 21 write was API-resolved Oct 5. No new edit or manual request. Cooling-off Oct 27–Nov 9; earliest final-data verdict **2026-11-13**.
- [x] `https://myimageupscaler.com/blog/best-ai-upscaler` — **API-resolved 2026-11-02, not a manual request:** `Submitted and indexed`, indexing allowed, successful post-rollback crawl `2026-11-01T12:58:39Z`, matching Google/user canonicals. Resolves the **Reopened 2026-10-26** rung-3 LOSS rollback: exact prior body retained, API hash `96dbc0886be1f25a1bc7c172e964a2c13723eb5a930cebf0b801a612d85f61ee` and normal rendered article verified (200, one self-canonical, index/follow), experimental module absent. The prior Sep 24 write was API-resolved Oct 5. No new write or manual request claimed. Cooling-off Oct 27–Nov 9; earliest final-data verdict **2026-11-13**.
- [x] `https://myimageupscaler.com/blog/topaz-video-upscaler` — **API-resolved 2026-10-05, not a manual request:** `Submitted and indexed`, successful crawl `2026-09-26T02:42:58Z` after the 2026-09-24 write, matching Google/user canonical. Normal public article now exposes the Topaz Video vs Pro module; API body hash verified. Earlier public exposure is unknown: measurement conservatively starts 2026-10-05; earliest final-data verdict 2026-10-23.
- [x] `https://myimageupscaler.com/blog/best-image-upscaler` — **API-resolved 2026-10-15, not a manual request:** `Submitted and indexed`, indexing allowed, successful crawl `2026-10-13T17:00:05Z` after the final 2026-10-12 rung-3 write, matching Google/user canonicals. Normal public rendered article now exposes the software-workflow evidence module and corrected closing CTA (200, self-canonical, index/follow); authenticated API final SHA256 `f3180ce35db4a0f7b910faa9a2bddae130d2fc66bb4a0efa74e8b84a555473a9` matches. Earlier final-copy exposure is unknown: measurement conservatively starts 2026-10-15, with 14 complete days Oct 16–29 and earliest final-data verdict 2026-11-02. Original DB date, rung, prior body and 2026-09-24 description rollback retained; no new production write or manual indexing request.

### Blog index parameter deindex signal — request after deployment

- [x] `https://myimageupscaler.com/blog` — indexing requested 2026-09-11, confirmed "added to a priority crawl queue" — reopened 2026-09-07 for the blog index parameter deindex signal. **Verification done 2026-09-10 post-deploy:** `/blog?page=2&q=4k` returns `200` with `noindex, follow` and canonical `https://myimageupscaler.com/blog`; `/blog` itself is `index, follow`.

### Dashboard noindex cleanup — request after deployment

- [x] `https://myimageupscaler.com/dashboard` — **not an indexing candidate.** Live production returns `X-Robots-Tag: noindex, follow`; GSC live testing detected the indexing issue and rejected the request on 2026-08-25 as expected. The noindex signal is now verified; do not retry the indexing request.

### GSC 404 recovery — request after deployment

- [x] `https://myimageupscaler.com/de/tools/resize/resize-image-for-telegram` — **not an indexing candidate.** The route serves 200 with `noindex, follow`, which is PRD 01's deliberate rule for untranslated dedicated locale tools. GSC rejected the request ("indexing issues were detected") as expected. Removed from the queue rather than retried.
- [x] `https://myimageupscaler.com/use-cases-expanded/real-estate-photography` — indexing requested 2026-08-21, confirmed "added to a priority crawl queue" — restored page route and sitemap registration.
- [x] `https://myimageupscaler.com/guides/how-to-upscale-images` — indexing requested 2026-08-13, confirmed "added to a priority crawl queue" — owner for the retired `/guides/how-to-upsize-images` family; request indexing after deployment.
- [x] `https://myimageupscaler.com/tools/convert/jpg-to-webp` — indexing requested 2026-08-13, confirmed "added to a priority crawl queue" — canonical owner for legacy converter paths; request indexing after deployment.

### PRD 06 — crawled but not indexed blog set (2026-08-13)

Request indexing after the deployment that includes the indexation-report and internal-link fixes.
Keep all 33 requests unchecked until URL Inspection confirms the post-change crawl.

- [x] `https://myimageupscaler.com/blog/enhance-pictures-in-photoshop` — indexing requested 2026-08-13, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/jpg-vs-png-quality` — indexing requested 2026-08-13, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/how-to-upscale-avif-tiff-bmp-image-formats` — indexing requested 2026-08-13, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/picture-restoration-software` — indexing requested 2026-08-13, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/windows-11-snap-layouts` — indexing requested 2026-08-13, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/image-enlarger-vs-image-upscaler` — indexing requested 2026-08-13, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/how-to-fix-resolution` — indexing requested 2026-08-13, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/sunset-camera-settings` — indexing requested 2026-08-21, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/picture-to-oil-painting-convert` — indexing requested 2026-08-21, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/remove-noise-in-photoshop` — indexing requested 2026-08-25, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/screenshot-upscaling-rescue-low-resolution-captures` — indexing requested 2026-08-25, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/dpi-of-image` — indexing requested 2026-08-25, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/best-video-upscaler` — indexing requested 2026-08-25, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/why-upscaled-text-looks-blurry-how-to-fix` — indexing requested 2026-08-25, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/ai-quality-enhancer` — indexing requested 2026-08-25, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/damaged-old-photographs` — indexing requested 2026-08-25, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/turn-image-into-illustration` — indexing requested 2026-08-25, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/what-is-8k-image-resolution` — indexing requested 2026-08-25, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/photo-restoration-near-me` — indexing requested 2026-09-11, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/noise-reduction-in-images` — indexing requested 2026-08-28, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/ai-image-extender` — indexing requested 2026-08-28, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/how-to-enhance-a-picture-in-photoshop` — indexing requested 2026-09-11, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/what-is-denoising` — indexing requested 2026-09-11, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/image-out-of-focus` — indexing requested 2026-09-11, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/enhance-picture-quality-ai` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-28T09:47:13Z.
- [x] `https://myimageupscaler.com/blog/how-to-preserve-old-photographs` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-12T23:19:05Z.
- [x] `https://myimageupscaler.com/blog/heic-iphone-photo-upscaling-guide` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-06T21:22:55Z.
- [x] `https://myimageupscaler.com/blog/how-to-make-png-background-transparent-free` — indexing requested 2026-08-28, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/reduce-image-noise` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-12T09:55:42Z.
- [x] `https://myimageupscaler.com/blog/noise-reduction-in-image` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-15T06:49:47Z.
- [x] `https://myimageupscaler.com/blog/ai-photo-restoration` — **Manual request 2026-11-13:** Request indexing accepted in the GSC UI (priority crawl queue).
- [x] `https://myimageupscaler.com/blog/how-to-clear-up-a-photo` — indexing requested 2026-10-12 in the GSC URL Inspection UI, confirmed "URL was added to a priority crawl queue"; closes the 2026-08-13 PRD 06 pending request. Normal public GET: 200, self-canonical, index/follow, cache HIT. Fresh GSC Sep 12–Oct 9: 28 clicks / 4,009 impressions, position 13.8. **2026-10-19 API follow-up:** `Submitted and indexed`, successful post-request crawl `2026-10-17T23:17:27Z`, indexing allowed and matching Google/user canonicals. No repeat request; no traffic-lift claim.
- [x] `https://myimageupscaler.com/blog/best-image-upscaling-tools-2026` — **Closed 2026-11-13, not indexable:** 308 → https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared. Do not request indexing.

- [x] `https://myimageupscaler.com/`

- [x] `https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared` — indexing requested 2026-10-12 in the GSC URL Inspection UI, confirmed "URL was added to a priority crawl queue". Normal public GET: 200, self-canonical, index/follow, cache HIT; rendered article contains the corrected comparison heading and vendor facts from the 2026-09-16 factual repair. **2026-10-19 API follow-up:** `Submitted and indexed`, successful crawl `2026-10-19T07:04:00Z` after both the request and Oct 13 recovery write, indexing allowed and matching canonicals. No repeat request or ranking-recovery claim; retain the Oct 31 earliest final-data review for the Oct 13 experiment.
- [x] `https://myimageupscaler.com/blog/best-free-ai-photo-enhancer-online`

- [x] `https://myimageupscaler.com/blog/fix-blurry-photos-ai-methods-guide`
- [x] `https://myimageupscaler.com/blog/fix-pixelated-image`
- [x] `https://myimageupscaler.com/blog/fixing-pixelated-photos` — 2026-09-10 regression rollback restored the prior meta/opening and removed the failed proof module; request indexing after live HTML exposes the repair. — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-08T13:23:03Z.
- [x] `https://myimageupscaler.com/blog/free-ai-upscaler-no-watermark`
- [x] `https://myimageupscaler.com/blog/how-to-upscale-midjourney-images-for-print`
- [x] `https://myimageupscaler.com/blog/how-to-upscale-youtube-thumbnails` — **API-resolved 2026-11-05, not a manual request:** `Submitted and indexed`, indexing allowed, successful post-rollback crawl `2026-11-03T09:37:41Z`, matching Google/user canonicals. Resolves the **Reopened 2026-10-26** rung-3 LOSS rollback: normal rendered article still omits the diagnostic proof module and retains the corrected opening, official upload guidance, guest/DPI/fidelity repairs and R2 image migration (200, one self-canonical, index/follow). Authenticated API content hash remains `05d4b6fc56e336a85ac7d9e93e450c6cbf9d21f61499aaea77e25cdcbd3177fe`, updated_at `2026-10-26T16:23:25.345793+00:00`. Prior Oct 5 write was API-resolved Oct 8; the Oct 24 crawl previously reported was pre-rollback. Native browser timed out twice; no manual request claimed, new edit or experiment reset. Cooling-off Oct 27–Nov 9; earliest final-data verdict **2026-11-13**.
- [x] `https://myimageupscaler.com/blog/image-upscaler-8x`
- [x] `https://myimageupscaler.com/blog/photo-restoration-program` — 2026-09-10 regression rollback removed the failed comparison expansion while retaining truthful metadata and credit copy; request indexing after live HTML exposes the repair. — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-06T05:02:24Z.

## Completed

- [x] `https://myimageupscaler.com/formats/upscale-gif-images` — manually requested in GSC URL Inspection on 2026-08-08 after the GIF consolidation deploy was verified live (`/format-scale/gif-upscale-16x` → `301` to this owner, owner `200` + self-canonical, sitemap `lastmod` `2026-08-03`). Recovery checkpoint: 2026-08-22, see [SEO changes backlog](./seo-changes-backlog.md) open follow-ups.

- [x] `https://myimageupscaler.com/blog/photoshop-upscaler-vs-ai-tools` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-15 after the 2026-06-05 change.
- [x] `https://myimageupscaler.com/blog/sharpen-a-video` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-23 after the 2026-06-21 change.
- [x] `https://myimageupscaler.com/blog/upscale-image-for-print-300-dpi-guide` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-02 after the 2026-05-26 change.
- [x] `https://myimageupscaler.com/comparisons-expanded/ai-models-comparison` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-21 after the 2026-05-26 change.
- [x] `https://myimageupscaler.com/es` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-01 after the 2026-06-29 change.
- [x] `https://myimageupscaler.com/it` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-27 after the 2026-06-29 change.
- [x] `https://myimageupscaler.com/ja` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-31 after the 2026-06-29 change.
- [x] `https://myimageupscaler.com/pt` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-01 after the 2026-06-29 change.

- [x] `https://myimageupscaler.com/blog/ai-image-upscaling-vs-sharpening-explained`
- [x] `https://myimageupscaler.com/blog/ai-upscaler-muryou-osusume`
- [x] `https://myimageupscaler.com/blog/best-ai-image-enhancer`
- [x] `https://myimageupscaler.com/blog/best-app-to-restore-old-photos`
- [x] `https://myimageupscaler.com/blog/free-photo-restoration-app`
- [x] `https://myimageupscaler.com/blog/how-ai-image-upscaling-works-guide`
- [x] `https://myimageupscaler.com/blog/how-to-upscale-anime-images-with-ai`
- [x] `https://myimageupscaler.com/blog/how-to-upscale-images-for-instagram`
- [x] `https://myimageupscaler.com/blog/image-resolution-guide-everything-you-need-to-know`
- [x] `https://myimageupscaler.com/blog/mejorar-calidad-imagen-ia-gratis`
- [x] `https://myimageupscaler.com/blog/pixelcut-ai-photo-editor`
- [x] `https://myimageupscaler.com/blog/topaz-denoise-ai`

- [x] `https://myimageupscaler.com/blog/video-upscaling-software`
- [x] `https://myimageupscaler.com/scale/upscale-16x`
- [x] `https://myimageupscaler.com/tools/ai-image-upscaler`

## Product-truth copy pass — deployed 2026-09-10

58 pSEO pages had their `metaTitle`/`metaDescription` changed by the product-truth pass: the false `no signup` claim was removed from account-backed upscaling pages, and hardcoded regional credit grants were made tier-safe. These are SERP-visible snippet changes, so they only matter once Google recrawls. Grouped rather than listed as 58 separate rows — GSC's manual URL Inspection quota makes one-by-one requests impractical.

Request these first (named in the source audit or highest traffic):

- [x] `https://myimageupscaler.com/formats/upscale-avif-images` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-06T14:25:51Z.
- [x] `https://myimageupscaler.com/formats/upscale-heic-images` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-05T21:53:57Z.
- [x] `https://myimageupscaler.com/formats/upscale-raw-images` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-28T22:01:32Z.
- [x] `https://myimageupscaler.com/formats/upscale-svg-images` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-04T21:46:16Z.
- [x] `https://myimageupscaler.com/scale/pixel-boost-upscaler` — **Manual request 2026-11-13:** Request indexing accepted in the GSC UI (priority crawl queue).
- [x] `https://myimageupscaler.com/scale/ultra-hd-upscaler` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-20T16:54:45Z.
- [x] `https://myimageupscaler.com/scale/upscale-8x` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-03T14:05:47Z.
- [x] `https://myimageupscaler.com/scale/upscale-to-4k` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-30T08:13:02Z.
- [x] `https://myimageupscaler.com/scale/upscale-to-hd` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-03T11:08:19Z.

Then the remaining 49 as quota allows — or simply let the sitemap `lastmod` carry them:

<details>
<summary>Remaining changed URLs</summary>

- [x] `https://myimageupscaler.com/camera-raw/upscale-nef-images` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-30T00:15:28Z.
- [x] `https://myimageupscaler.com/device-use/desktop-ecommerce-upscaler` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-16T20:58:01Z.
- [x] `https://myimageupscaler.com/device-use/desktop-graphic-design-upscaler` — **Manual request 2026-11-13:** Request indexing accepted in the GSC UI (priority crawl queue).
- [x] `https://myimageupscaler.com/device-use/desktop-photo-editing-upscaler` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-13T08:40:14Z.
- [x] `https://myimageupscaler.com/device-use/desktop-presentations-upscaler` — **Manual request 2026-11-13:** Request indexing accepted in the GSC UI (priority crawl queue).
- [x] `https://myimageupscaler.com/device-use/desktop-professional-printing-upscaler` — **Closed 2026-11-13, not indexable:** meta robots noindex, follow. Do not request indexing.
- [x] `https://myimageupscaler.com/device-use/desktop-video-thumbnails-upscaler` — **Manual request 2026-11-13:** Request indexing accepted in the GSC UI (priority crawl queue).
- [x] `https://myimageupscaler.com/device-use/mobile-content-creation-upscaler` — **Manual request 2026-11-13:** Request indexing accepted in the GSC UI (priority crawl queue).
- [x] `https://myimageupscaler.com/device-use/mobile-ecommerce-upscaler` — **Manual request 2026-11-13:** Request indexing accepted in the GSC UI (priority crawl queue).
- [x] `https://myimageupscaler.com/device-use/mobile-messaging-upscaler` — **Manual request 2026-11-13:** Request indexing accepted in the GSC UI (priority crawl queue).
- [x] `https://myimageupscaler.com/device-use/tablet-content-creation-upscaler` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-02T05:06:41Z.
- [x] `https://myimageupscaler.com/device-use/tablet-digital-art-upscaler` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-19T21:55:33Z.
- [x] `https://myimageupscaler.com/device-use/tablet-ecommerce-upscaler` — **Closed 2026-11-13, not indexable:** meta robots noindex, follow. Do not request indexing.
- [x] `https://myimageupscaler.com/device-use/tablet-photo-editing-upscaler` — **Manual request 2026-11-13:** Request indexing accepted in the GSC UI (priority crawl queue).
- [x] `https://myimageupscaler.com/device-use/tablet-social-media-upscaler` — **Closed 2026-11-13, not indexable:** meta robots noindex, follow. Do not request indexing.
- [x] `https://myimageupscaler.com/format-scale/avif-upscale-16x` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-24T21:05:28Z.
- [x] `https://myimageupscaler.com/format-scale/avif-upscale-2x` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-13T20:04:47Z.
- [x] `https://myimageupscaler.com/format-scale/avif-upscale-4x` — **Closed 2026-11-13, not indexable:** meta robots noindex, follow. Do not request indexing.
- [x] `https://myimageupscaler.com/format-scale/avif-upscale-8x` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-09-21T06:24:28Z.
- [x] `https://myimageupscaler.com/format-scale/bmp-upscale-16x` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-09-21T02:53:37Z.
- [x] `https://myimageupscaler.com/format-scale/bmp-upscale-8x` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-27T07:49:32Z.
- [x] `https://myimageupscaler.com/format-scale/gif-upscale-16x` — **Closed 2026-11-13, not indexable:** 301 → https://myimageupscaler.com/formats/upscale-gif-images. Do not request indexing.
- [x] `https://myimageupscaler.com/format-scale/gif-upscale-2x` — **Closed 2026-11-13, not indexable:** 301 → https://myimageupscaler.com/formats/upscale-gif-images. Do not request indexing.
- [x] `https://myimageupscaler.com/format-scale/gif-upscale-8x` — **Closed 2026-11-13, not indexable:** 301 → https://myimageupscaler.com/formats/upscale-gif-images. Do not request indexing.
- [x] `https://myimageupscaler.com/format-scale/heic-upscale-16x` — **Manual request 2026-11-13:** Request indexing accepted in the GSC UI (priority crawl queue).
- [x] `https://myimageupscaler.com/format-scale/heic-upscale-2x` — **Manual request 2026-11-13:** Request indexing accepted in the GSC UI (priority crawl queue).
- [ ] `https://myimageupscaler.com/format-scale/heic-upscale-8x`
- [x] `https://myimageupscaler.com/format-scale/jpeg-upscale-16x` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-04T21:44:52Z.
- [x] `https://myimageupscaler.com/format-scale/jpeg-upscale-8x` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-06T17:57:59Z.
- [x] `https://myimageupscaler.com/format-scale/png-upscale-4x` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-03T12:11:05Z.
- [x] `https://myimageupscaler.com/format-scale/png-upscale-8x` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-06T14:54:37Z.
- [x] `https://myimageupscaler.com/format-scale/raw-upscale-2x` — **Closed 2026-11-13, not indexable:** meta robots noindex, follow. Do not request indexing.
- [x] `https://myimageupscaler.com/format-scale/webp-upscale-16x` — **Closed 2026-11-13, not indexable:** meta robots noindex, follow. Do not request indexing.
- [ ] `https://myimageupscaler.com/industry-insights/travel-tourism-enhancement`
- [x] `https://myimageupscaler.com/interactive-tools/photo-quality-enhancer` — **Closed 2026-11-13, not indexable:** 404 not found. Do not request indexing.
- [x] `https://myimageupscaler.com/platform-format/canva-upscaler-avif` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-17T11:32:50Z.
- [ ] `https://myimageupscaler.com/platform-format/canva-upscaler-bmp`
- [x] `https://myimageupscaler.com/platform-format/canva-upscaler-heic` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-20T20:33:37Z.
- [x] `https://myimageupscaler.com/platform-format/canva-upscaler-jpg` — **Closed 2026-11-13, not indexable:** meta robots noindex, follow. Do not request indexing.
- [x] `https://myimageupscaler.com/platform-format/canva-upscaler-raw` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-29T00:45:49Z.
- [x] `https://myimageupscaler.com/platform-format/canva-upscaler-tiff` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-06T20:28:25Z.
- [x] `https://myimageupscaler.com/platform-format/canva-upscaler-webp` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-09-25T21:42:58Z.
- [ ] `https://myimageupscaler.com/platform-format/midjourney-upscaler-webp`
- [x] `https://myimageupscaler.com/platform-format/photoshop-upscaler-png` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-09T23:23:47Z.
- [ ] `https://myimageupscaler.com/platform-format/photoshop-upscaler-webp`
- [x] `https://myimageupscaler.com/platform-format/stable-diffusion-upscaler-png` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-10-06T02:05:06Z.
- [x] `https://myimageupscaler.com/platforms/canva-upscaler` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-04T21:22:00Z.
- [ ] `https://myimageupscaler.com/use-cases/cartoon-image-upscaler`
- [x] `https://myimageupscaler.com/use-cases/portrait-photo-upscaler` — **API-resolved 2026-11-13, not a manual request:** Submitted and indexed, last crawl 2026-11-13T15:05:11Z.

</details>
