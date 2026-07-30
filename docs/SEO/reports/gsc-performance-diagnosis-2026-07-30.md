# GSC Performance Diagnosis — 2026-07-30

## Executive diagnosis

The site is not in a broad search visibility collapse.

- Over 28 complete days, web clicks increased **81.0%** and impressions increased **27.1%**. Average position was effectively flat, moving from **11.12 to 11.25**.
- Over the latest seven complete days, impressions increased **45.3%** and average position improved from **11.21 to 10.94**, but clicks fell **21.7%** because CTR dropped from **3.11% to 1.67%**.
- The apparent impression spike and CTR collapse are dominated by `/blog/fixing-pixelated-photos`: it added **37,895 impressions** week over week but only **3 clicks**. Without that page, site impressions would have declined only about **1,757 (-2.2%)**.
- The real click loss is concentrated in the homepage and `/formats/upscale-gif-images`. Together they lost **525 clicks**, equal to **97.6%** of the site's net seven-day click decline.
- The Coverage export shows no recent deindexing event. Indexed pages rose from **835 to 1,045** on July 10 and remained at 1,045 through July 23. Core Web Vitals are poor and need work, but they do not match the timing of the short-term click change.

Confidence: **high** for the concentration and mix-shift diagnosis; **medium** for attributing the GIF loss to the July 10 content change because the timing and query reassignment align, but GSC does not prove causation.

## Data used

| Dataset | Current period | Comparison period | Purpose |
| --- | --- | --- | --- |
| Fresh GSC 90-day export | 2026-04-29–2026-07-27 | 2026-01-29–2026-04-28 | Long-term direction |
| Fresh GSC 28-day export | 2026-06-30–2026-07-27 | 2026-06-02–2026-06-29 | Current baseline |
| Fresh GSC 7-day export | 2026-07-21–2026-07-27 | 2026-07-14–2026-07-20 | Recent incident |
| Coverage ZIP | Through 2026-07-23 | Historical series from 2026-04-30 | Indexing state |
| Core Web Vitals ZIP | Through 2026-07-28 | Historical series from 2026-04-30 | Page experience risk |
| Blog SEO audit | GSC 90-day data + 212 published posts | N/A | Snippet and intent checks |

GSC held back the most recent three days. All comparisons use complete Pacific-time days.

## What the chart movement means

| Window | Clicks | Impressions | CTR | Average position | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| 90 days vs prior 90 | +306.5% | +451.6% | -26.3% | 13.90 → 11.44 | Strong long-term growth; new lower-CTR visibility diluted CTR |
| 28 days vs prior 28 | +81.0% | +27.1% | +42.4% | 11.12 → 11.25 | Traffic improved; position was essentially flat |
| 7 days vs prior 7 | -21.7% | +45.3% | -46.1% | 11.21 → 10.94 | Click loss despite better rank, caused by query/page mix and weak CTR |
| Jul 24–27 daily line | 227 → 257 clicks from Jul 25 | 18,629 → 15,828 | 1.28% → 1.62% | 10.53 → 12.14 | Small click rebound after the trough; impressions fell 15.0% from the spike |

Average position is impression-weighted. When high-ranking homepage and GIF impressions disappear while lower-ranking long-tail pages remain, the sitewide average can worsen even without a sitewide demotion.

## Primary causes

| Priority | Surface | Seven-day change | Diagnosis |
| ---: | --- | --- | --- |
| 1 | Homepage | Clicks **1,237 → 859**; impressions **20,296 → 15,558**; position **9.84 → 10.59** | Largest real traffic loss. Exact branded queries `myimageupscaler` and `my image upscaler` lost **285 clicks** combined, while `image upscaler` lost 27 clicks and 2,404 impressions. This is a mix of lower branded demand and a modest generic ranking loss. |
| 2 | `/formats/upscale-gif-images` | Clicks **158 → 11**; impressions **2,086 → 327**; position **7.11 → 20.97** | Acute ranking loss. The July 10 copy correctly disclosed that animated GIF processing is unsupported, but the page still targets “GIF upscaler” intent. Google shifted `gif upscaler` and `upscale gif` visibility toward `/format-scale/gif-upscale-16x`, which gained 19 clicks while making unsupported 16x/no-signup claims. This is an ownership and product-intent conflict. |
| 3 | `/blog/fixing-pixelated-photos` | Impressions **15,043 → 52,938**; clicks **1 → 4**; position **9.85 → 8.85** | The page is ranking better, not worse, but `how to fix pixelated photos` produced 52,374 impressions and one click. It creates nearly all of the apparent sitewide impression growth and CTR dilution. The July 27 snippet change has at most one complete GSC day here, so it cannot yet be evaluated. |
| 4 | Homepage/GIF mix shift | Combined **-525 clicks** | These two pages explain 97.6% of the site's net -538 clicks. The remaining site was approximately flat after gains and losses offset each other. |
| 5 | Long-tail page losses | Smaller individual losses | `/tools/ai-image-upscaler` lost 22 clicks as position moved 4.85 → 6.51; `/scale/upscale-16x` lost 28 clicks; several older blog pages lost impressions. These matter, but they do not explain the headline movement. |

## Positive signal: clicks rebounding on the best-free comparison

`/blog/best-free-ai-image-upscaler-2026-tested-compared` held clicks almost flat at **394 → 385** while impressions declined **19.3%**. CTR increased from **10.55% to 12.77%**, and position improved from **5.40 to 5.16**.

The July 20 title test may be helping the click rebound, but seven days is too early to call it a win. Keep the planned **2026-08-04** 14-day evaluation. Do not rewrite it again before then.

## Search-type mix

| Search type | Latest 28-day clicks | Impressions | Change vs prior 28 |
| --- | ---: | ---: | --- |
| Web | 9,363 | 354,738 | Clicks +81.0%; impressions +27.1% |
| Image | 25 | 22,202 | Clicks +127.3%; impressions +20.5% |
| News | 0 | 3 | Immaterial |
| Video, Discover, Google News | 0 | 0 | No visibility |

Image search is growing but contributed only 25 clicks. It is not driving the rebound or decline.

## CTR and quick-win findings

The blog audit found **74 of 212 published posts** below its position-based CTR benchmark. Its estimates are directional: GSC fragment URLs and unusual SERP features can overstate missed clicks.

| Page/query | 28-day signal | Action |
| --- | --- | --- |
| `how to fix pixelated photos` | 78,120 impressions, 1 click, position 9.06 | Hold the July 27 test; measure on/after 2026-08-10 |
| `image upscaler` → homepage | 15,757 impressions, 364 clicks, position 10.73 | Diagnose homepage SERP/rank loss by device and country; avoid a broad title rewrite without a query-level SERP check |
| `/blog/poster-size-dimensions-pixels` | 18,299 impressions, 0.25% CTR, position 6.63 | Hold the July 22 snippet test until the scheduled 14-day window |
| `/blog/how-to-upscale-youtube-thumbnails` | 9,296 impressions, 0.66% CTR, position 6.66 | Re-evaluate when data through July 28 is available; the 14-day edit window is just maturing |
| `/blog/topaz-labs-free-trial` | 16,628 impressions, 1.08% CTR, position 8.01 | Do not rewrite now; the page is a 28-day winner and recent clicks are nearly flat |

No new article is justified by this dataset. The strongest “content creation” cluster is photo-restoration software, but `/blog/photo-restoration-program` was expanded on July 22. Let that change mature before adding or rewriting overlapping pages.

## Cannibalization and ownership

1. **GIF intent is the actionable collision.** `/formats/upscale-gif-images` lost its rankings while `/format-scale/gif-upscale-16x` became the top page for `gif upscaler` and `upscale gif`.
2. **The GIF pages contradict each other.** The format guide says GIF processing is unsupported; the 16x page claims free, no-registration GIF processing and 16x output.
3. **Pixelated-photo overlap is not currently material.** The canonical article owns more than 99.8% of the query's impressions; the two secondary URLs have negligible visibility.
4. **Homepage locale overlap is also minor.** The English homepage owns almost all `image upscaler` impressions.
5. **GSC fragment rows are not separate canonical pages.** Do not treat `#...` rows in the audit as true competing URLs.

## Indexing and canonical assessment

The supplied Coverage export reports:

| State | Pages | Assessment |
| --- | ---: | --- |
| Indexed | 1,045 | Stable from July 10 through July 23; no recent deindexing event |
| Crawled – currently not indexed | 905 | Large quality/indexability backlog; likely includes low-value pSEO, but the ZIP has no URL list |
| Google chose different canonical | 236 | Needs URL-level sampling before deciding whether it is expected deduplication |
| Server error (5xx) | 4 | Urgent URL-level inspection; aggregate ZIP does not identify the URLs |
| Alternate canonical / redirect / noindex / 404 | 1,535 total | Often intentional; validate samples rather than trying to index all exclusions |

Fresh URL Inspection passed all 10 priority URLs: all were indexed, fetchable, index-allowed, and had matching canonicals. The homepage was crawled successfully on 2026-07-30.

The sitemap API reports zero indexed URLs despite 1,045 indexed pages in Coverage and 10/10 passing inspections. Treat the sitemap indexed count as stale/inconsistent, not evidence that the site has zero indexed URLs.

## Core Web Vitals assessment

The mobile export reports:

- **86 poor URL groups** with LCP longer than 4 seconds; validation failed.
- **86 URL groups needing improvement** for INP longer than 200 ms; validation has not started.
- **0 good mobile URL groups** in the export.
- Poor groups increased from **38 on April 30 to 86 on July 28**.

This is a serious background ranking and conversion risk. It is not the best explanation for the short-term chart movement because seven-day average position improved while the CWV issue count remained high. Fix it as a parallel technical workstream, not as an emergency explanation for the July 24–27 line.

## Prioritized actions

1. **Resolve GIF ownership and correctness first.** Decide whether the site offers any static-GIF workflow. Remove unsupported claims from all GIF scale pages, then consolidate or noindex overlapping GIF pSEO URLs so one truthful page owns GIF intent.
2. **Investigate the homepage decline.** Compare the homepage's latest 14 days by device/country for branded and `image upscaler` terms; check the live SERP before changing metadata.
3. **Hold active snippet tests.** Measure the July 20, July 22, and July 27 changes on their existing 14-day dates; avoid stacking another edit inside the test windows.
4. **Open the four 5xx examples and sample the 905/236 exclusion groups in GSC.** The aggregate Coverage ZIP cannot identify affected URLs.
5. **Start a mobile LCP/INP remediation pass.** Prioritize templates covering the 86 affected groups and start validation only after field fixes are deployed.

## Execution record — 2026-07-30

| Action | Status | Evidence |
| --- | --- | --- |
| Resolve GIF ownership and correctness | Implemented; deploy pending | `/formats/upscale-gif-images` is the sole truthful, English-only owner. All four `/format-scale/gif-upscale-{2x,4x,8x,16x}` paths, their localized variants, and localized owner URLs issue direct permanent redirects to it. Runtime loaders, localized sitemaps, hreflang, and internal links exclude the retired or contradictory variants. |
| Investigate homepage decline | Complete; no metadata edit | Fresh July 14–27 GSC comparison: `image upscaler` improved from position 11.42 to 10.33 and clicks increased 145 → 219. The exact branded queries lost 607 clicks while remaining at position ~1.01; the loss spans desktop/mobile and multiple countries, supporting lower branded demand rather than a snippet or indexing failure. |
| Hold active snippet tests | Complete for this run | No homepage or blog metadata was changed. GSC data is complete only through July 27, so the YouTube test still lacks the report's requested July 28 endpoint; the August 4, 5, 10, and 19 checkpoints remain unchanged. |
| Inspect Coverage examples | Four supplied 5xx URLs fixed; deploy validation pending | The four Japanese examples were legacy `/ja/tools/resize-image-for-{linkedin,instagram,facebook,twitter}` paths missing the routed `/resize/` segment. Production returned 500 while every canonical `/ja/tools/resize/resize-image-for-*` destination returned 200. All five social paths, including YouTube preventively, now issue direct locale-preserving permanent redirects. Canonical-page schema, visible breadcrumbs, and localized tool sitemaps now use the nested route. Samples from the 905/236 groups still require example URLs from the GSC UI. |
| Start mobile LCP/INP remediation | Implemented; field validation pending deploy | Production baseline: homepage mobile LCP 5.91s and INP 419ms; GIF format page LCP 3.50s. Lighthouse found 168 KiB unused Stripe JavaScript on the homepage. The navbar now lazy-loads the purchase modal/Stripe, and the homepage slider no longer downloads a duplicate after image or promotes overlay images to high priority. |

Validation completed:

- `yarn vitest run tests/unit/seo`: 69 files and 1,014 tests passed.
- Regression coverage verifies Japanese and English redirects for all five legacy social-resize paths, the nested canonical route in JSON-LD and visible breadcrumbs, localized sitemap inclusion, and English-only GIF ownership.
- The final production build passed and generated 2,471 pages. Built-runtime checks returned direct 301s for the five Japanese legacy social-resize paths, the English check path, and localized GIF conflict paths; the Japanese LinkedIn destination returned 200.
- Built-runtime sitemap checks found the nested LinkedIn URL in the Japanese tools sitemap and no localized GIF owner in the Japanese formats sitemap. A mobile Playwright load made no Stripe request, no duplicate after-image request, and had no failed network requests; the only console errors were caused by intentionally absent local Supabase credentials.
- Independent deploy review caught a localized-tools sitemap preservation regression before deploy. The corrected builder retains existing generic `/tools/{slug}` entries while adding only routed social-resize pages; red/green coverage verifies both behaviors.
- A production crawl checked 86 child sitemaps and 1,927 unique URLs. The 10 discovered 404s share one cause: `use-cases-expanded` data was published without a page route. The sitemap index now excludes that unrouted category.
- Repeated 503 responses expose `error code: 1102` from Cloudflare. The failures cluster in uncached localized `platform-format`, `format-scale`, and `device-use` pages; reducing their Worker/cache hot path is tracked separately because a speculative client-boundary change did not reduce the generated OpenNext cache record.
- Post-deploy redirect checks and GSC **Validate fix** for the four reported 5xx URLs, PageSpeed comparison, manual request indexing, and GSC CWV validation remain operational follow-ups.

## Measurement plan

| Date | Check | Success signal |
| --- | --- | --- |
| When GSC includes 2026-07-28 | YouTube thumbnail page | CTR direction after 14 complete post-edit days |
| 2026-08-04 or later | Best-free upscaler comparison | Position 3–10 with sustained CTR improvement and stable/recovering clicks |
| 2026-08-05 or later | July 22 recovery pages | First complete 14-day comparison |
| 2026-08-10 or later | Pixelated-photo snippet | `how to fix pixelated photos` CTR above the pre-change near-zero baseline |
| 2026-08-19 or later | July 22 recovery PRD | Full 28-day success-criteria evaluation |

## Sources and reproducibility

- GSC exports created with `.agents/skills/gsc-analysis/scripts/gsc-fetch.cjs` using 7-, 28-, and 90-day windows and a 25,000-row limit.
- Blog audit created with `.agents/skills/gsc-analysis/scripts/audit-blog-seo.cjs --suggest`.
- Coverage source: `/home/joao/Downloads/myimageupscaler.com-Coverage-2026-07-30.zip`.
- Core Web Vitals source: `/home/joao/Downloads/myimageupscaler.com-core-web-vitals-2026-07-30.zip`.
- Change correlation: `docs/SEO/maintenance/seo-changes-backlog.md` and `docs/SEO/maintenance/gsc-request-indexing-backlog.md`.
