# GSC Request Indexing Backlog

Created: 2026-05-06
Deduplicated: 2026-07-22
API-inspected: 2026-08-03

## When To Use

After a production SEO change, open Google Search Console URL Inspection for each pending URL below and click **Request indexing**. Keep one row per URL. Resolve a pending row only when either (a) the request is visibly accepted in the GSC UI, or (b) the URL Inspection API proves Google successfully crawled the URL after the recorded production change and currently reports `Submitted and indexed`; annotate API-resolved rows explicitly so they are not misreported as manual requests.

Note: On 2026-06-12, `https://myimageupscaler.com/sitemap.xml` and `https://myimageupscaler.com/sitemap-static.xml` were resubmitted through the Search Console Sitemaps API and both returned `204 No Content`. This does not replace manual URL Inspection request indexing.

## Pending

### GSC 404 recovery — request after deployment

- [ ] `https://myimageupscaler.com/de/tools/resize/resize-image-for-telegram` — dedicated locale route now renders fallback tool content; request indexing after deployment.
- [ ] `https://myimageupscaler.com/use-cases-expanded/real-estate-photography` — restored page route and sitemap registration; request indexing after deployment.
- [ ] `https://myimageupscaler.com/guides/how-to-upscale-images` — owner for the retired `/guides/how-to-upsize-images` family; request indexing after deployment.
- [ ] `https://myimageupscaler.com/tools/convert/jpg-to-webp` — canonical owner for legacy converter paths; request indexing after deployment.

### PRD 06 — crawled but not indexed blog set (2026-08-13)

Request indexing after the deployment that includes the indexation-report and internal-link fixes.
Keep all 33 requests unchecked until URL Inspection confirms the post-change crawl.

- [ ] `https://myimageupscaler.com/blog/enhance-pictures-in-photoshop`
- [ ] `https://myimageupscaler.com/blog/jpg-vs-png-quality`
- [ ] `https://myimageupscaler.com/blog/how-to-upscale-avif-tiff-bmp-image-formats`
- [ ] `https://myimageupscaler.com/blog/picture-restoration-software`
- [ ] `https://myimageupscaler.com/blog/windows-11-snap-layouts`
- [ ] `https://myimageupscaler.com/blog/image-enlarger-vs-image-upscaler`
- [ ] `https://myimageupscaler.com/blog/how-to-fix-resolution`
- [ ] `https://myimageupscaler.com/blog/sunset-camera-settings`
- [ ] `https://myimageupscaler.com/blog/picture-to-oil-painting-convert`
- [ ] `https://myimageupscaler.com/blog/remove-noise-in-photoshop`
- [ ] `https://myimageupscaler.com/blog/screenshot-upscaling-rescue-low-resolution-captures`
- [ ] `https://myimageupscaler.com/blog/dpi-of-image`
- [ ] `https://myimageupscaler.com/blog/best-video-upscaler`
- [ ] `https://myimageupscaler.com/blog/why-upscaled-text-looks-blurry-how-to-fix`
- [ ] `https://myimageupscaler.com/blog/ai-quality-enhancer`
- [ ] `https://myimageupscaler.com/blog/damaged-old-photographs`
- [ ] `https://myimageupscaler.com/blog/turn-image-into-illustration`
- [ ] `https://myimageupscaler.com/blog/what-is-8k-image-resolution`
- [ ] `https://myimageupscaler.com/blog/photo-restoration-near-me`
- [ ] `https://myimageupscaler.com/blog/noise-reduction-in-images`
- [ ] `https://myimageupscaler.com/blog/ai-image-extender`
- [ ] `https://myimageupscaler.com/blog/how-to-enhance-a-picture-in-photoshop`
- [ ] `https://myimageupscaler.com/blog/what-is-denoising`
- [ ] `https://myimageupscaler.com/blog/image-out-of-focus`
- [ ] `https://myimageupscaler.com/blog/enhance-picture-quality-ai`
- [ ] `https://myimageupscaler.com/blog/how-to-preserve-old-photographs`
- [ ] `https://myimageupscaler.com/blog/heic-iphone-photo-upscaling-guide`
- [ ] `https://myimageupscaler.com/blog/how-to-make-png-background-transparent-free`
- [ ] `https://myimageupscaler.com/blog/reduce-image-noise`
- [ ] `https://myimageupscaler.com/blog/noise-reduction-in-image`
- [ ] `https://myimageupscaler.com/blog/ai-photo-restoration`
- [ ] `https://myimageupscaler.com/blog/how-to-clear-up-a-photo`
- [ ] `https://myimageupscaler.com/blog/best-image-upscaling-tools-2026`

- [x] `https://myimageupscaler.com/`
- [x] `https://myimageupscaler.com/blog/best-ai-upscaler` — daily request-indexing quota reached on 2026-07-10; retry later.
- [x] `https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared` — refreshed 2026-07-20; request indexing for the latest version.
- [x] `https://myimageupscaler.com/blog/best-free-ai-photo-enhancer-online`
- [x] `https://myimageupscaler.com/blog/best-image-upscaler`
- [x] `https://myimageupscaler.com/blog/fix-blurry-photos-ai-methods-guide`
- [x] `https://myimageupscaler.com/blog/fix-pixelated-image`
- [ ] `https://myimageupscaler.com/blog/fixing-pixelated-photos` — refreshed again 2026-08-10 with a proof-led meta/body support pass after the 2026-07-27 title test still produced 0 clicks on 32,210 impressions for `how to fix pixelated photos` in the latest complete 14-day GSC window; request indexing for the latest version.
- [x] `https://myimageupscaler.com/blog/free-ai-upscaler-no-watermark`
- [x] `https://myimageupscaler.com/blog/how-to-upscale-midjourney-images-for-print`
- [x] `https://myimageupscaler.com/blog/how-to-upscale-youtube-thumbnails`
- [x] `https://myimageupscaler.com/blog/image-upscaler-8x`
- [x] `https://myimageupscaler.com/blog/photo-restoration-program` — refreshed 2026-07-22 with a current comparison table and policy-aligned credit copy.

## Completed

- [x] `https://myimageupscaler.com/formats/upscale-gif-images` — manually requested in GSC URL Inspection on 2026-08-08 after the GIF consolidation deploy was verified live (`/format-scale/gif-upscale-16x` → `301` to this owner, owner `200` + self-canonical, sitemap `lastmod` `2026-08-03`). Recovery checkpoint: 2026-08-22, see [SEO changes backlog](./seo-changes-backlog.md) open follow-ups.

- [x] `https://myimageupscaler.com/blog/photoshop-upscale-image` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-01 after the 2026-05-26 change.
- [x] `https://myimageupscaler.com/blog/photoshop-upscaler-vs-ai-tools` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-15 after the 2026-06-05 change.
- [x] `https://myimageupscaler.com/blog/poster-size-dimensions-pixels` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-01 after the 2026-07-22 refresh.
- [x] `https://myimageupscaler.com/blog/sharpen-a-video` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-23 after the 2026-06-21 change.
- [x] `https://myimageupscaler.com/blog/text-image-enhancer` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-26 after the 2026-07-22 refresh.
- [x] `https://myimageupscaler.com/blog/upscale-image-for-print-300-dpi-guide` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-02 after the 2026-05-26 change.
- [x] `https://myimageupscaler.com/blog/what-resolution-for-print` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-01 after the 2026-06-05 change.
- [x] `https://myimageupscaler.com/comparisons-expanded/ai-models-comparison` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-21 after the 2026-05-26 change.
- [x] `https://myimageupscaler.com/es` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-01 after the 2026-06-29 change.
- [x] `https://myimageupscaler.com/it` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-27 after the 2026-06-29 change.
- [x] `https://myimageupscaler.com/ja` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-07-31 after the 2026-06-29 change.
- [x] `https://myimageupscaler.com/pt` — API-resolved 2026-08-03: `Submitted and indexed`; last crawled 2026-08-01 after the 2026-06-29 change.

- [x] `https://myimageupscaler.com/alternatives/vs-adobe-express`
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
- [x] `https://myimageupscaler.com/blog/topaz-labs-free-trial`
- [x] `https://myimageupscaler.com/blog/topaz-video-upscaler`
- [x] `https://myimageupscaler.com/blog/video-upscaling-software`
- [x] `https://myimageupscaler.com/scale/upscale-16x`
- [x] `https://myimageupscaler.com/tools/ai-image-upscaler`
