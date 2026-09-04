# GSC Request Indexing Backlog

Created: 2026-05-06
Deduplicated: 2026-07-22
API-inspected: 2026-08-03

## When To Use

After a production SEO change, open Google Search Console URL Inspection for each pending URL below and click **Request indexing**. Keep one row per URL. Resolve a pending row only when either (a) the request is visibly accepted in the GSC UI, or (b) the URL Inspection API proves Google successfully crawled the URL after the recorded production change and currently reports `Submitted and indexed`; annotate API-resolved rows explicitly so they are not misreported as manual requests.

Note: On 2026-06-12, `https://myimageupscaler.com/sitemap.xml` and `https://myimageupscaler.com/sitemap-static.xml` were resubmitted through the Search Console Sitemaps API and both returned `204 No Content`. This does not replace manual URL Inspection request indexing.

## Pending

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

### Three Kings refresh — request after production HTML is current

- [ ] `https://myimageupscaler.com/blog/poster-size-dimensions-pixels` — 2026-09-03 Three Kings refresh; request indexing after the refreshed title, H1, description, and metadata are visible.
- [ ] `https://myimageupscaler.com/alternatives/vs-adobe-express` — 2026-09-03 Three Kings refresh; request indexing after the refreshed title, meta description, and intro are deployed.
- [ ] `https://myimageupscaler.com/blog/photoshop-upscale-image` — 2026-09-03 Three Kings refresh; request indexing after the refreshed opening description is visible.

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
- [ ] `https://myimageupscaler.com/blog/photo-restoration-near-me`
- [x] `https://myimageupscaler.com/blog/noise-reduction-in-images` — indexing requested 2026-08-28, confirmed "added to a priority crawl queue"
- [x] `https://myimageupscaler.com/blog/ai-image-extender` — indexing requested 2026-08-28, confirmed "added to a priority crawl queue"
- [ ] `https://myimageupscaler.com/blog/how-to-enhance-a-picture-in-photoshop`
- [ ] `https://myimageupscaler.com/blog/what-is-denoising`
- [ ] `https://myimageupscaler.com/blog/image-out-of-focus`
- [ ] `https://myimageupscaler.com/blog/enhance-picture-quality-ai`
- [ ] `https://myimageupscaler.com/blog/how-to-preserve-old-photographs`
- [ ] `https://myimageupscaler.com/blog/heic-iphone-photo-upscaling-guide`
- [x] `https://myimageupscaler.com/blog/how-to-make-png-background-transparent-free` — indexing requested 2026-08-28, confirmed "added to a priority crawl queue"
- [ ] `https://myimageupscaler.com/blog/reduce-image-noise`
- [ ] `https://myimageupscaler.com/blog/noise-reduction-in-image`
- [ ] `https://myimageupscaler.com/blog/ai-photo-restoration`
- [ ] `https://myimageupscaler.com/blog/how-to-clear-up-a-photo`
- [ ] `https://myimageupscaler.com/blog/best-image-upscaling-tools-2026`

- [x] `https://myimageupscaler.com/`
- [x] `https://myimageupscaler.com/blog/best-ai-upscaler` — daily request-indexing quota reached on 2026-07-10; retry later.
- [x] `https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared` — refreshed again 2026-08-17 with a proof-led meta/H1/body support pass after the 2026-07-20 title test matured but the exact 2026 best-free-upscaler cluster still had 2,295 impressions / 0 clicks / avg position 6.51 in the latest GSC-backed audit; indexing requested 2026-08-25, confirmed "added to a priority crawl queue".
- [x] `https://myimageupscaler.com/blog/best-free-ai-photo-enhancer-online`
- [x] `https://myimageupscaler.com/blog/best-image-upscaler`
- [x] `https://myimageupscaler.com/blog/fix-blurry-photos-ai-methods-guide`
- [x] `https://myimageupscaler.com/blog/fix-pixelated-image`
- [x] `https://myimageupscaler.com/blog/fixing-pixelated-photos` — refreshed again 2026-08-10 with a proof-led meta/body support pass after the 2026-07-27 title test still produced 0 clicks on 32,210 impressions for `how to fix pixelated photos` in the latest complete 14-day GSC window; indexing requested 2026-08-25, confirmed "added to a priority crawl queue".
- [x] `https://myimageupscaler.com/blog/free-ai-upscaler-no-watermark`
- [x] `https://myimageupscaler.com/blog/how-to-upscale-midjourney-images-for-print`
- [x] `https://myimageupscaler.com/blog/how-to-upscale-youtube-thumbnails`
- [x] `https://myimageupscaler.com/blog/image-upscaler-8x`
- [x] `https://myimageupscaler.com/blog/photo-restoration-program` — refreshed 2026-07-22 with a current comparison table and policy-aligned credit copy.

## Completed

- [x] `https://myimageupscaler.com/formats/upscale-gif-images` — manually requested in GSC URL Inspection on 2026-08-08 after the GIF consolidation deploy was verified live (`/format-scale/gif-upscale-16x` → `301` to this owner, owner `200` + self-canonical, sitemap `lastmod` `2026-08-03`). Recovery checkpoint: 2026-08-22, see [SEO changes backlog](./seo-changes-backlog.md) open follow-ups.

- [x] `https://myimageupscaler.com/blog/photoshop-upscaler-vs-ai-tools` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-15 after the 2026-06-05 change.
- [x] `https://myimageupscaler.com/blog/sharpen-a-video` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-23 after the 2026-06-21 change.
- [x] `https://myimageupscaler.com/blog/text-image-enhancer` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-26 after the 2026-07-22 refresh.
- [x] `https://myimageupscaler.com/blog/upscale-image-for-print-300-dpi-guide` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-02 after the 2026-05-26 change.
- [x] `https://myimageupscaler.com/blog/what-resolution-for-print` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-01 after the 2026-06-05 change.
- [x] `https://myimageupscaler.com/comparisons-expanded/ai-models-comparison` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-21 after the 2026-05-26 change.
- [x] `https://myimageupscaler.com/es` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-01 after the 2026-06-29 change.
- [x] `https://myimageupscaler.com/it` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-27 after the 2026-06-29 change.
- [x] `https://myimageupscaler.com/ja` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-31 after the 2026-06-29 change.
- [x] `https://myimageupscaler.com/pt` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-01 after the 2026-06-29 change.

- [x] `https://myimageupscaler.com/blog`
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
- [ ] `https://myimageupscaler.com/blog/topaz-labs-free-trial` — Topaz free-trial snippet recovery updated 2026-08-31; request indexing after the new alternative-led SEO description is visible on the live HTML cache.
- [x] `https://myimageupscaler.com/blog/topaz-video-upscaler`
- [x] `https://myimageupscaler.com/blog/video-upscaling-software`
- [x] `https://myimageupscaler.com/scale/upscale-16x`
- [x] `https://myimageupscaler.com/tools/ai-image-upscaler`
