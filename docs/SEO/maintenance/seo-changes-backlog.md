# SEO Changes Backlog

Purpose: keep a concise operational trail of SEO changes so future audits can connect ranking, indexing, CTR, and attribution movement to actual site changes.

Maintenance rules:

- Add an entry every time SEO-facing code, metadata, content, sitemap, schema, canonical, hreflang, robots, redirects, IndexNow, GSC, GA4 attribution, pSEO data, or blog SEO changes.
- Keep entries short: what changed, why, files/surfaces touched, validation, and follow-up.
- If this file gets large, summarize older detailed entries into a monthly rollup and keep only recent operational detail.
- Link related reports, PRDs, or follow-up backlog files instead of pasting long analysis.

## Open Follow-Ups

- [ ] After next deploy, complete [GSC request indexing backlog](./gsc-request-indexing-backlog.md).
- [ ] After the next deploy, run GSC **Validate fix** for the four supplied Japanese social-resize 5xx examples. Their missing `/resize/` path now has a direct locale-preserving `301`; the matching YouTube route was fixed preventively. Sampling the `Crawled - currently not indexed` (905) and `Google chose different canonical` (236) groups still requires URLs from the GSC UI because the aggregate export and API do not expose them.
- [ ] Reduce Cloudflare Worker/cache CPU for localized pSEO pages, then recrawl all sitemap URLs. The 2026-07-30 crawl reproduced `error code: 1102` on 63 of 1,927 URLs after retry, concentrated in localized `platform-format`, `format-scale`, and `device-use` pages. A representative generated OpenNext cache record is about 1.1 MB; a tested client-boundary change did not reduce it.
- [ ] GIF consolidation: redirect + indexing steps are DONE (2026-08-08 — all four `/format-scale/gif-upscale-{2x,4x,8x,16x}` verified returning a direct `301` to `/formats/upscale-gif-images`; owner `200` + self-canonical; indexing requested manually in GSC). Still open: rerun mobile PageSpeed, start GSC LCP/INP validation only after field data reflects the deployment, and run the **2026-08-22 recovery checkpoint** — if the owner is still worse than position 15, the `301` did not transfer signals and the variants need `noindex` instead. See [GSC drop diagnosis 2026-08-08](../reports/gsc-drop-diagnosis-2026-08-08.md).
- [ ] Measure the implemented [GSC SEO recovery PRD](../../PRDs/gsc-opportunity-recovery-2026-07-22.md): first complete 14-day comparison on or after 2026-08-05 and 28-day success-criteria evaluation on or after 2026-08-19. Keep the PRD outside `done/` until the 28-day evaluation is recorded.
- [ ] On or after 2026-07-19, compare `/blog/best-free-ai-photo-enhancer-online` for 2026-06-22 through 2026-07-07 against the next complete 16-day GSC window; inspect query and competing-URL losses before any further edit. A 2026-07-20 fresh 28-day check found this URL at 2,985 impressions, 21 clicks, avg position 38.93; no edit was made because the stronger matured CTR action was on `/blog/best-free-ai-image-upscaler-2026-tested-compared`.
- [ ] On or after 2026-08-25, compare `/blog/fixing-pixelated-photos` for the first complete 14-day GSC window after the 2026-08-10 proof-led snippet/body pass. If `how to fix pixelated photos` remains at avg position 3-10 with CTR below 0.2%, stop repeating snippet tests and evaluate cannibalization/consolidation with `/blog/fix-pixelated-image`. For `/blog/topaz-video-upscaler` and `/blog/best-ai-upscaler`, use the next blog monitor run to classify current GSC state before any further rewrite.
- [ ] After the 2026-06-29 Spanish homepage metadata has matured, evaluate `/es` query movement and add natural Spanish internal links only if visibility still needs support.
- [x] After next deploy, verify `https://myimageupscaler.com/sitemap-static.xml` includes `/de`, `/es`, `/fr`, `/it`, `/ja`, and `/pt`. Verified 2026-05-13.
- [x] After next deploy, re-inspect `https://myimageupscaler.com/it` in GSC and confirm it now has a referring sitemap. Verified 2026-05-13: URL Inspection reports `Submitted and indexed` with sitemap `https://myimageupscaler.com/sitemap.xml`.
- [x] In GA4 Admin, grant Editor access on property `519826120` to `cloudstartlabs-service-acc@coldstartlabs-auth.iam.gserviceaccount.com`, then run `node ./.claude/skills/ga-analysis/scripts/ga4-key-events.cjs --create` to mark the SEO funnel events and emitted GA4 event names as key events. Completed 2026-05-13.

## 2026-08-13

### GSC Recovery PRD Set (planning)

Source: GSC coverage + Core Web Vitals exports of 2026-08-12/08-10 and the 2026-08-13 audit report. Raw exports committed to `docs/PRDs/gsc-recovery-2026-08/data/`.

Created [docs/PRDs/gsc-recovery-2026-08/](../../PRDs/gsc-recovery-2026-08/README.md) — six sliced PRDs, each with a live-URL verification gate rather than unit tests alone:

- 01 404 elimination (303): locale interactive-tool slug lists drifted from the English routes and the sitemaps (11 slugs × 6 locales); `middleware.ts` `redirectMap` covers only 12 of 194 distinct 404 paths; `/use-cases-expanded/*` has data and a sitemap route but no page route.
- 02 Locale indexation integrity (239 duplicate-canonical, 107 noindex, 5 5xx): hreflang/canonical decided per category instead of per page; stub `locales/ja/interactive-tools.json` entries; plus the still-open Worker 1102 503s.
- 03 Index bloat pruning (790 crawled-not-indexed): sitemap eligibility earned from a committed 90-day GSC snapshot; publish freeze below 85% indexation.
- 04 Taxonomy cannibalization: generalize the shipped GIF-intent consolidation into a cluster table — gated on a clean post-2026-08-04 measurement first.
- 05 LCP (95 poor / 0 good): `images.unoptimized: true` makes `sizes` inert; Cloudflare/Unsplash image loader + preconnect.
- 06 Blog indexation (33 posts) and the seven zero-click URLs (156K impressions → 389 clicks).

Shipped with the PRDs (PRD 01 Phase 0): `lib/seo/gsc-verification.ts` + `scripts/seo/verify-gsc-fixes.ts`, exposed as `yarn seo:verify:gsc --set=404|noindex|5xx|dup|cni`. Re-fetches the exported URL lists against a live origin, resolves redirect destinations (a `301` to a `404` is not a fix), walks `/sitemap.xml` for the noindex/cni rule, writes `seo-reports/gsc-verify-<set>-<date>.json`, exits 1 on any violation. 31 unit tests in `tests/unit/seo/gsc-verification.unit.spec.ts`.

Validation: `yarn verify` passed; 1,050 SEO unit tests green. Live baselines 2026-08-13 — `--set=404`: **212 of 303 still violating** (206 still 404, 6 redirect into a 404, 91 already fixed by earlier work); `--set=5xx`: 0 of 5 violating, because the four Japanese social-resize URLs now `301` into `/ja/tools/resize/*` (GSC **Validate fix** can be run for them) and the 1102 URL answered 200 on that request — intermittent, so not resolved. Negative controls observed: `--expect=404` flips the verdict on live data, and mutating the 404 expectation to always-pass turns 6 unit tests red.

Follow-up: implement in order 01 → 02/05 → 03 → 04/06; each PRD's post-deploy GSC checkpoints are dated inside it.
### PRD 01 — GSC 404 elimination (shipped to master)

Changes:

- Centralized the 24 interactive resize/convert/compress slugs and their canonical paths; locale pages now render English fallback copy with `noindex, follow` for untranslated dedicated tools.
- Removed divergent sitemap path maps, restricted locale hreflang to translated dedicated tools, and restored the `use-cases-expanded` page plus sitemap registration.
- Generated 314 permanent 301 legacy redirects from the GSC export and SEO data owners, wired them into `next.config.js`, and removed the duplicated static middleware map. Middleware retains casing, translated-slug, junk-path, and `undefined` platform normalization.
- Locale-prefixed legacy blog redirects now go directly to unprefixed canonical blog URLs, avoiding the middleware's second hop; the combined redirect table has no duplicate sources.
- Added the reusable GSC verifier CLI and unit coverage for route parity, sitemap parity, redirects, and pSEO category registration.

Validation:

- Full unit suite passed: 379 files, 5,316 tests, with 1 skipped file and 6 skipped tests. `yarn verify` and `yarn build` passed; the generated redirect build reported zero undocumented unmapped GSC paths.
- Production deployment and post-deploy GSC validation are still pending.

Follow-up:

- After deployment, run `yarn seo:verify:gsc --set=404 --base-url=https://myimageupscaler.com`, submit changed owners through IndexNow, and use GSC **Validate Fix** only after the live gate reports zero 404s.

Localized-runtime repairs folded into the same change: localized resize/convert/compress pages keep translated display copy but take `toolComponent` and `toolConfig` from the canonical English runtime record (covers incomplete Japanese YouTube data and unsafe Spanish/Portuguese converter records, and stops `/es/tools/compress/image-compressor` rendering `ImageResizer`). The 404 verifier now accepts only a direct 200 or a single 301 to a 200 — 302/303/307/308 stay violations.

Follow-up:

- Production deployment and post-deploy GSC validation remain pending. The local production build reaches static-page generation but is still blocked by the pre-existing `use-cases-expanded/web-design-development` data/template mismatch and placeholder Supabase environment.
- The source PRD still contains TBD caller cells.
### LCP image delivery and budget gate

Source: [GSC recovery LCP page-experience PRD](../../PRDs/gsc-recovery-2026-08/05-lcp-page-experience.md)

Changes:

- Replaced the global `next/image` `unoptimized` setting with the custom image loader, using Cloudflare Image Resizing for same-origin assets, Supabase render transforms for public blog objects, and width-matched AVIF URLs for Unsplash assets.
- Added the Unsplash and production Supabase image-host preconnects, a fixed six-URL Core Web Vitals input set, the `seo:pagespeed` budget command, and a public-asset size guard.
- Removed four unused original before/after PNGs from `public/before-after/originals/`; `girl-before.png` measured 565,843 bytes (552.6 KiB), while the other three exceeded the 1 MB public-asset limit.

Validation:

- Unit and browser checks covered rendered `srcset`, the exact Supabase acceptance hero transform, loader wiring, both image-host preconnects, asset weight, and the `unoptimized` regression control; the e2e file now matches the configured Playwright project.
- The LCP budget unit control confirms the gate uses current Lighthouse LCP rather than rolling field data.
- [Baseline report](../../../seo-reports/cwv-baseline-2026-08-13.md) captured all 12 real mobile and desktop Lighthouse measurements after PSI API quota fallback to local Lighthouse; one transient desktop 503 was rerun successfully.
- A live Cloudflare Image Resizing probe returned `200` with `image/avif`.

Follow-up:

- After deployment, rerun the six-URL gate on the production host, complete the Slow 4G/LCP manual checkpoint, and monitor the GSC mobile CWV checkpoints in the PRD through 2026-10-08.

## 2026-08-10

### Pixelated Photos Proof-Led SERP Support Pass

Source: autonomous blog growth operator using fresh GSC 14-day data through 2026-08-07 (`/tmp/miu-gsc-14-2026-08-10.json`), fresh GSC 28-day data through 2026-08-07 (`/tmp/miu-gsc-28-2026-08-10.json`), fresh GA4 organic data through 2026-08-09 (`/tmp/miu-ga-28-2026-08-10.json`), current SEO/indexing backlogs, blog changelog, the 2026-08-08 GSC drop diagnosis, and recent git history.

Evidence:

- The recorded 2026-08-10 trigger for `/blog/fixing-pixelated-photos` matured. Fresh 14-day GSC shows the canonical page at 33,152 impressions / 7 clicks / 0.021% CTR / avg position 9.22.
- The target query `how to fix pixelated photos` has 32,210 impressions / 0 clicks / avg position 8.83 on `/blog/fixing-pixelated-photos`; GSC also shows a much smaller competing `/blog/fix-pixelated-image` row at 159 impressions / 0 clicks / avg position 14.66, so the canonical owner is clear enough for one support pass but cannibalization should be evaluated if this fails.
- GA4 organic and GSC sitewide data did not justify a new overlapping post; the safe highest-value action was an edit to the existing canonical page.

Changes:

- Updated the production blog record for `/blog/fixing-pixelated-photos` directly via Supabase service role because the production blog API returned `500` (`Server configuration error`) despite a valid local `BLOG_API_KEY`.
- Changed `description` and `seo_description` to a tested 2x/4x AI workflow snippet.
- Rewrote the opening to answer the query directly, added a `What Actually Works on Pixelated Photos` proof/limitation module, and corrected remaining stale `10 free credits` body claims to `5 welcome credits`.
- Updated `tests/unit/seo/trending-down-blog-recovery.unit.spec.ts`, `.claude/skills/blog-changelog.md`, and the existing `/blog/fixing-pixelated-photos` GSC request-indexing row in place.

Why:

- This satisfied action class A: a qualifying CTR/meta/intro/body support update to an existing canonical page after the prior title-only test failed its own measurement gate.
- Publishing a new pixelated-photo post would be cannibalizing; repeating another title-only edit would ignore the 2026-08-08 diagnosis.

Validation:

- Fresh production DB backups created before the write: `backups/backup_2026-08-10_10-33-55.schema.sql.gz` and `backups/backup_2026-08-10_10-33-55.data.sql.gz`; `yarn db:backups` listed both and `gzip -t` passed for both archives.
- Supabase readback confirmed the new metadata, proof module, no remaining `10 free credits`, and `updated_at: 2026-08-10T17:37:51.400792+00:00`.
- Live production HTML returned `200`, self-canonical, contained the new meta description and `What Actually Works on Pixelated Photos`, and no longer contained `10 free credits`.
- `yarn vitest run tests/unit/seo/trending-down-blog-recovery.unit.spec.ts` passed.
- `yarn verify` passed; existing warnings only.

Follow-up:

- Commit: this commit (`fix(seo): support pixelated photos ctr recovery`); final hash is recorded in the operator delivery.
- Deploy state: production blog DB content is live immediately; repo test/backlog/changelog changes are local until this commit is pushed/deployed.
- Manual action: request indexing for `https://myimageupscaler.com/blog/fixing-pixelated-photos` in GSC URL Inspection; the backlog row is now unchecked for the 2026-08-10 version.
- Next trigger: on or after 2026-08-25, compare the first complete 14-day GSC window after this edit. If the target query remains avg position 3-10 with CTR below 0.2%, stop snippet testing and evaluate consolidation/canonical handling with `/blog/fix-pixelated-image`.

### Blog Core Web Vitals: static/ISR route and lazy embeds

Source: `/home/joao/Downloads/myimageupscaler.com-core-web-vitals-Issue-2026-08-10.zip` (mobile LCP issue; target row reports 5.2s for `/blog/fixing-pixelated-photos`). Local Lighthouse reproduced 9.1s mobile LCP, with the hero image as LCP, 2.35s server response, and an eager embedded iframe competing during load.

Changes:

- Added `force-static` with 24-hour ISR to the database-backed blog post route so public blog HTML is generated/cacheable instead of assembled on each request.
- Added `loading="lazy"` to article iframes, after spread props, so embedded media cannot override the deferral or compete with the hero.
- Added `tests/unit/seo/blog-core-web-vitals.unit.spec.ts`; no URL, metadata, canonical, schema, or hero-image behavior changed.

Validation:

- Focused blog/SEO unit suite: 12 files, 102 tests passed.
- Blog Chromium E2E: 7 tests passed.
- `yarn build` passed; prerender manifest contains 126 static blog routes plus the dynamic route definition.
- `yarn verify` passed: TypeScript, lint (existing warnings only), ICU, and Schema.org validation.

Follow-up:

- Deploy through the normal review path, then rerun mobile PageSpeed and GSC Core Web Vitals after field data reflects the deployment. No indexing request is needed because URLs and SEO signals were unchanged.

## 2026-08-08

### Enhancer Cluster Internal-Link Verification

Source: [GSC drop diagnosis](../reports/gsc-drop-diagnosis-2026-08-08.md)

Changes:

- No production content edit was needed for the P3 recommendation: `/blog/best-ai-photo-enhancer-reddit` and `/blog/best-free-ai-photo-enhancer-online` already link to `/tools/ai-photo-enhancer`.

Validation:

- Public HTML inspection confirmed the target link on both live blog pages; no database write was performed:
  - `/blog/best-ai-photo-enhancer-reddit` → `https://myimageupscaler.com/tools/ai-photo-enhancer`
  - `/blog/best-free-ai-photo-enhancer-online` → `/tools/ai-photo-enhancer`

Follow-up:

- Treat the P3 internal-link option as satisfied. Preserve the scheduled 2026-08-10 proof-led follow-up for `/blog/fixing-pixelated-photos`.

## 2026-08-03

### Orphan Sitemap Retirement + GIF Lastmod Signal

Source: autonomous blog growth operator using fresh GSC 28-day data through 2026-07-31 (`/tmp/gsc-miu-28-2026-08-03.json`), GA4 organic data through 2026-08-02 (`/tmp/ga-miu-28-2026-08-03.json`), current SEO/indexing backlogs, blog changelog, the 2026-07-30 GSC diagnosis, the 2026-07-31 CTR batch review, and recent git history.

Evidence:

- Fresh GSC confirms active snippet tests should not be stacked yet: `/blog/fixing-pixelated-photos` still has only 1 click / 83,326 impressions for `how to fix pixelated photos` in the latest 28 days and its 2026-07-27 title test has a 2026-08-10 trigger; `/blog/poster-size-dimensions-pixels` is under the 2026-07-22 recovery window with 49 clicks / 19,073 impressions / avg position 6.73; `/blog/best-free-ai-image-upscaler-2026-tested-compared` has a broad 8.41% page CTR but zero-click exact 2026 variants, so it remains a measurement candidate rather than a same-run rewrite.
- Fresh GA4 shows organic search is up 27.21% sessions and 32.87% conversions versus the prior 28 days, so the safest growth move was technical indexability cleanup rather than adding overlapping blog content.
- The 2026-07-31 CTR batch review found the retired `use-cases-expanded` child sitemap still live even though its URLs have no route, and found the truthful GIF owner still carried stale `lastUpdated` despite the 2026-07-30 GIF consolidation.

Changes:

- Changed `app/sitemap-use-cases-expanded.xml/route.ts` from a child sitemap listing unrouted 404 URLs to a cacheable `410 Gone` retirement response.
- Updated `app/seo/data/formats.json` so `/formats/upscale-gif-images` has `lastUpdated: 2026-08-03T00:00:00Z`, matching the GIF ownership/correctness change that should be recrawled.
- Extended `tests/unit/seo/sitemap-index.unit.spec.ts` and `tests/unit/seo/gif-intent-consolidation.unit.spec.ts` to lock both behaviors.
- Updated the existing GIF owner row in `docs/SEO/maintenance/gsc-request-indexing-backlog.md`; no duplicate indexing row was added.

Why:

- This fixes a concrete indexability/sitemap defect without touching active blog snippet experiments that are still inside stated GSC lag windows.
- The GIF change is recorded as a correctness/indexing-signal improvement, not a CTR-recovery claim; current GSC still shows `gif upscaler` and `upscale gif` splitting across retired `/format-scale/gif-upscale-16x` URLs until the redirect/lastmod change is deployed and recrawled.

Validation:

- `yarn vitest run tests/unit/seo/gif-intent-consolidation.unit.spec.ts tests/unit/seo/sitemap-index.unit.spec.ts` passed: 2 files, 25 tests.
- `yarn verify` passed (`tsc`, `eslint --fix`, ICU translation check, and schema validation); eslint emitted pre-existing warnings only.

Follow-up:

- Commit: this commit (`fix(seo): retire orphan sitemap and refresh gif lastmod`); final hash is recorded in the operator delivery.
- Deploy state: not deployed; code/backlog changes are local until this commit is pushed and deployed.
- After deploy, verify `https://myimageupscaler.com/sitemap-use-cases-expanded.xml` returns `410`, verify `/formats/upscale-gif-images` appears in the formats sitemap with `2026-08-03T00:00:00Z`, then request indexing for the existing pending GIF owner row in GSC URL Inspection.
- Next trigger: preserve the existing blog measurement windows — best-free comparison on/after 2026-08-04, July 22 recovery pages on/after 2026-08-05, and pixelated-photo snippet on/after 2026-08-10. Do not rewrite those pages before their trigger unless production health/indexability breaks.

## 2026-07-31

### Free-credit comparison copy correction

Changes:

- Replaced the obsolete "3 free images per day" comparison claim with the current one-time "5 free credits on signup" policy in both comparison data copies.

Validation:

- Extended `tests/unit/seo/free-credit-policy-copy.unit.spec.ts` to reject the obsolete recurring claim; the focused test failed before the copy change and passed afterward.

Follow-up:

- Deploy through the normal review flow; no separate indexing request is needed for this narrow copy correction.

## 2026-07-30

### Merchant Listing Product Images

Changes:

- Added a valid shared product image, stable product IDs, and canonical pricing URLs to the four subscription `Product` JSON-LD blocks emitted in the homepage pricing section.
- Replaced the pricing-page schema's missing `/og-image-pricing.png` reference with the deployed `/og-image.png` asset.

Validation:

- Added `tests/unit/seo/homepage-plan-schema.unit.spec.ts` to verify every monthly plan emits a crawlable image, URL, ID, and offer price.

Follow-up:

- After deployment, re-run URL Inspection on the homepage and confirm the four Merchant listings no longer have the critical missing-image issue. Optional `validFrom`, `shippingDetails`, and `hasMerchantReturnPolicy` notices remain non-blocking because these are digital subscriptions.

### Deployment SEO Guard Sitemap Parity

Changes:

- Aligned the deploy-blocking sitemap-index E2E expectation with the routed 85-child index after `use-cases-expanded` was removed.

Validation:

- The guard now checks the same category set already covered by `tests/unit/seo/sitemap-index.unit.spec.ts`; focused SEO guard, SEO unit suite, and repository verification run before deployment.

Follow-up:

- No new indexing request; complete the existing post-deploy GSC and redirect checks below.

### GSC Diagnosis Execution: GIF Ownership and Mobile CWV

Source: [GSC performance diagnosis](../reports/gsc-performance-diagnosis-2026-07-30.md)

Changes:

- Consolidated `/format-scale/gif-upscale-{2x,4x,8x,16x}` and localized variants with direct permanent redirects to the truthful `/formats/upscale-gif-images` owner.
- Made the truthful GIF owner English-only; localized owner and scale URLs redirect to it, while runtime loaders, localized sitemaps, hreflang, and internal links exclude retired or contradictory variants.
- Added direct locale-preserving redirects for all five legacy social-resize paths missing `/resize/`; corrected the canonical resize pages' schema and visible breadcrumbs, and included them in localized tool sitemaps.
- Removed the unrouted `use-cases-expanded` child sitemap from the sitemap index after all 10 URLs in that sitemap returned 404.
- Deferred the navbar purchase modal so Stripe loads only when needed across public templates; stopped the homepage comparison slider from downloading a duplicate LCP image or promoting overlay images to high priority.
- Held homepage and active blog snippet metadata. Fresh 14-day GSC evidence shows `image upscaler` improved from position 11.42 to 10.33 (+74 clicks), while exact branded losses remained at position ~1 and occurred across desktop/mobile and countries.

Validation:

- Red/green coverage added in `tests/unit/seo/gif-intent-consolidation.unit.spec.ts` and `tests/unit/seo/homepage-performance.unit.spec.ts`.
- Sitemap-index regression coverage verifies the unrouted `use-cases-expanded` category is excluded and the index contains 85 child sitemaps.
- `yarn vitest run tests/unit/seo` passed: 69 files, 1,014 tests.
- Production crawl: 86 child sitemaps and 1,927 unique URLs checked; status totals were 1,853×200, 1×308, 10×404, and 63×503. Sequential checks identified the 503 body as Cloudflare Worker CPU error 1102.
- Production mobile PageSpeed baselines before deploy: homepage LCP 5.91s, INP 419ms, 380 KiB unused JavaScript; GIF format page LCP 3.50s and 366 KiB unused JavaScript. Lighthouse attributed 168 KiB of homepage waste to always-loaded Stripe.

Follow-up:

- Production verification, request indexing, PageSpeed rerun, and CWV validation are pending the next deploy.
- The four supplied 5xx examples are addressed in code; after deploy, confirm each redirects to its Japanese canonical page and run GSC **Validate fix**. Sampling the 905/236 exclusion groups remains manual because the supplied export and Search Console API do not expose their example URLs.
- Independent deploy review caught and corrected a localized-tools sitemap regression before deploy; coverage now proves existing generic tool URLs remain alongside the new nested social-resize URLs.

### GSC Performance, Coverage, and CWV Diagnosis

Source: [GSC performance diagnosis](../reports/gsc-performance-diagnosis-2026-07-30.md)

Changes:

- Pulled fresh 7-, 28-, and 90-day GSC datasets and ran the blog SEO audit; correlated the results with the supplied Coverage and mobile Core Web Vitals exports.
- Documented that the recent movement is concentrated in the homepage and GIF landing-page losses, while the pixelated-photo query is inflating impressions and depressing CTR.
- No production content, metadata, URL, canonical, sitemap, robots, redirect, database, or indexing state changed.

Validation:

- Fresh URL Inspection passed 10/10 priority URLs with matching canonicals; Coverage showed 1,045 indexed pages stable from July 10 through July 23.
- Cross-checked conclusions against the SEO and request-indexing backlogs.

Follow-up:

- Executed in the preceding entry: GIF ownership was consolidated, the four supplied 5xx URLs were fixed, and the existing August measurement windows were preserved without further snippet edits.

## 2026-07-27

### Pixelated Photos SERP CTR Escalation

Source: autonomous blog growth operator using fresh GSC 28-day data through 2026-07-24, GA4 organic data through 2026-07-26, prior 2026-07-06/2026-07-13 blog monitor and opportunities reports, current SEO/indexing backlogs, blog changelog, and recent git history.

Changes:

- Applied the matured 2026-07-03 follow-up on `/blog/fixing-pixelated-photos`: changed the production blog record `seo_title` from `How to Stop and Fix Pixelated Photos & Images` to `How to Fix Pixelated Photos Online: 3 Fast AI Fixes`.
- Changed `seo_description` to `Learn how to fix pixelated photos online in 3 steps: upscale, sharpen, or rescan blocky images, then try the free AI upscaler.`
- Kept slug, canonical, robots, H1/title, and body content unchanged to make this a narrow SERP CTR test.
- Moved `https://myimageupscaler.com/blog/fixing-pixelated-photos` back to the pending GSC request-indexing backlog because the URL changed again after the older completed request.

Why:

- Fresh 28-day GSC shows the canonical page at 56,994 impressions, 9 clicks, avg position 9.69; the exact query `how to fix pixelated photos` accounts for 55,669 impressions, 1 click, avg position 9.34. The previous reports set 2026-07-20 as the edit-now date if the 2026-07-03 update matured with near-zero clicks, and that threshold is now met.
- GA4 organic sessions are up sitewide, so the highest-value safe action was not new content; it was a narrow CTR escalation on an existing canonical URL already ranking on page one.

Validation:

- Created and verified fresh production DB backups before the production blog update: `backups/backup_2026-07-27_10-34-37.schema.sql.gz` and `backups/backup_2026-07-27_10-34-37.data.sql.gz`; `yarn db:backups` listed both and `gzip -t` passed.
- Supabase update/readback confirmed the published record has the new `seo_title`, `seo_description`, and `updated_at`.
- Production HTML returned `200`, self-canonical, and rendered `How to Fix Pixelated Photos Online: 3 Fast AI Fixes | MyImageUpscaler` with the new meta description.
- Added SEO unit coverage in `tests/unit/seo/trending-down-blog-recovery.unit.spec.ts`; `yarn vitest run tests/unit/seo/trending-down-blog-recovery.unit.spec.ts` and `yarn verify` passed in this job.

Follow-up:

- Commit: `89c910b6` (`fix(seo): escalate pixelated photos SERP CTR`).
- Deploy state: production blog DB content is live immediately; repo backlog/test changes are local until the commit is pushed/deployed.
- Manual action: request indexing for `https://myimageupscaler.com/blog/fixing-pixelated-photos` in GSC URL Inspection.
- Next trigger: on or after 2026-08-10, compare the first complete 14-day GSC window after 2026-07-27 for `how to fix pixelated photos`; if avg position remains 3-10 and CTR stays below 0.2%, escalate to a proof-led snippet/body support pass rather than another title-only edit.

## 2026-07-26

### Credit Economy Copy and pSEO Parity

Source: [Credit economy correctness PRD](../../PRDs/credit-economy-correctness.md)

Changes:

- Updated the portrait-upscaler pSEO tier data and FAQ copy so Face Pro and Ultra credit claims match the provider-aware pricing configuration.
- Updated all seven locale mirrors and help-center credit explanations; no URL, metadata, canonical, hreflang, robots, sitemap, or redirect changed.

Validation:

- Added `tests/unit/seo/use-cases-credits.unit.spec.ts` to verify the pSEO values and rendered `FAQPage` schema.
- Added locale and shared credit-display parity coverage; focused tests passed.

Follow-up:

- No GSC request-indexing or IndexNow action is needed for this copy-only change. Recheck the public FAQ schema after the next normal deployment.

## 2026-07-22

### GSC Opportunity Recovery Implementation

Source: [GSC opportunity recovery PRD](../../PRDs/gsc-opportunity-recovery-2026-07-22.md)

Changes:

- Updated `/blog/text-image-enhancer` through the production blog API with the approved H1 and SEO title, a direct-answer opening, a five-problem clarity table, separate human-readability/OCR guidance, and a natural `/tools/ai-photo-enhancer` link.
- Updated only the requested poster snippet fields on `/blog/poster-size-dimensions-pixels`; retained its existing first-screen 150/200/300 DPI table. Corrected all three stale 10-credit body references to five welcome credits without using one-time language.
- Expanded `/blog/photo-restoration-program` with a published-evidence comparison across restoration tasks, limits, pricing model, privacy, and best use case; distinguished face restoration, scratch repair, colorization, and general enhancement; removed the unsupported `Tested & Ranked` snippet claim and corrected stale 10-credit copy.
- Verified ownership signals already present for the GIF format page, canonical best-free-upscaler comparison, Spanish informational guide, AI photo enhancer tool, no-signup research page, and broad enhancer comparison; no new page, URL, redirect, canonical, sitemap, or robots change was introduced.
- Deduplicated the GSC request-indexing backlog to one row per URL. Any URL with conflicting historical states remains pending; the three refreshed articles are pending until GSC UI confirmation.

Validation:

- Created and verified fresh backups before production writes: `backups/backup_2026-07-22_14-35-17.schema.sql.gz` and `backups/backup_2026-07-22_14-35-17.data.sql.gz`; `yarn db:backups` listed both and `gzip -t` passed for each.
- Production blog API PATCH/GET readback returned published records with the intended metadata and content contracts.
- Production HTML returned `200`, `index, follow`, self-canonicals, and the updated rendered titles for all three URLs.
- Added `tests/unit/seo/gsc-opportunity-recovery.unit.spec.ts`; focused test and repository verification results are recorded with the implementation handoff.

Follow-up:

- Complete the pending manual requests in [GSC request indexing backlog](./gsc-request-indexing-backlog.md); do not check off a URL without GSC UI confirmation.
- Compare complete GSC windows on or after 2026-08-05 and 2026-08-19. Move the PRD to `docs/PRDs/done/` only after the 28-day evaluation.

### GSC SEO Recovery PRD

Source: [GSC opportunity recovery PRD](../../PRDs/gsc-opportunity-recovery-2026-07-22.md)

Changes:

- Documented a focused response to the fresh GSC analysis: recover the text-image article, improve the poster snippet, clarify page ownership, expand the existing restoration comparison, and wait for recent edits to mature.
- Recorded production backup, SEO testing, indexing, and measurement requirements for later implementation.
- No production content, metadata, canonical, sitemap, robots, redirect, or indexing state changed in this planning step.

Validation:

- Cross-checked the PRD baselines and dates against the 2026-07-22 GSC export and recent SEO backlog entries.
- Ran `yarn verify` after the documentation changes.

Follow-up:

- Begin implementation only after approval; keep the July 27, July 31, and August 4 recheck dates intact.

## 2026-07-20

### Blog SERP Title Test: Best Free AI Image Upscaler 2026

Source: fresh 28-day and 90-day GSC exports through 2026-07-17 plus GA4 organic export through 2026-07-19.

Changes:

- Ran the autonomous blog growth operator against current GSC/GA evidence, recent reports, SEO/indexing backlogs, blog changelog, and recent git history.
- Applied the matured 2026-06-29 CTR escalation on `/blog/best-free-ai-image-upscaler-2026-tested-compared`: changed `title` and `seo_title` from `Best Free AI Image Upscaler Online 2026: 12 Tested` to `Best Free AI Image Upscaler 2026: Only 3 Worked`.
- Kept description, H1, body content, canonical, and indexability unchanged so this remains a narrow SERP-title test, not another broad rewrite.
- Updated the existing GSC request-indexing backlog row in place rather than duplicating the URL.

Why:

- Fresh 28-day GSC data shows the exact query cluster still leaking clicks after the 2026-06-29 description test: `best free ai image upscaler 2026` has 2,189 impressions, 0 clicks, avg position 5.95; `best free ai image upscaler online 2026` has 854 impressions, 0 clicks, avg position 4.50; `best ai image upscaling tools 2026` has 953 impressions, 0 clicks, avg position 5.96. The 90-day view confirms this is persistent, with 7,048 / 2,808 / 2,299 impressions respectively and still zero clicks for the same canonical page rows.
- GA4 organic sessions are up overall, so this action targets a SERP CTR leak on a page-one blog URL rather than publishing duplicate coverage.

Validation:

- Blog API PATCH returned `200`; GET readback confirmed the new title/SEO title and `published` status.
- Production HTML returned `200`, `index, follow`, self-canonical, and rendered `Best Free AI Image Upscaler 2026: Only 3 Worked | MyImageUpscaler`.
- Added SEO unit coverage in `tests/unit/seo/trending-down-blog-recovery.unit.spec.ts` and ran focused tests plus `yarn verify`.

Follow-up:

- Commit: pending in this run until verification/commit completes.
- Deploy state: production blog API content updated immediately; repo test/backlog changes are local until the commit is deployed.
- Manual action: request indexing for the existing unchecked URL in [GSC request indexing backlog](./gsc-request-indexing-backlog.md).
- Next trigger: on or after 2026-08-04, compare query-level CTR for the exact 2026 best-free-upscaler cluster over 14 complete GSC days after the 2026-07-20 update; if position remains 3-10 with zero clicks, escalate to a proof-led snippet/body support pass instead of another title-only test.

### Production Welcome-Credit Policy Correction

Source: [production incident remediation PRD](../../PRDs/production-credit-checkout-email-processing-incident-remediation.md)

Changes:

- Corrected stale English locale, SEO/pSEO, pricing-feature, and lifecycle-email claims from 10 or unlimited recurring free credits to the standing five-credit welcome policy.
- Preserved the regional grant contract of 5 standard / 3 restricted / 0 paywalled credits; URLs, metadata ownership, canonicals, and indexability are unchanged.

Validation:

- Expanded `tests/unit/seo/free-credit-policy-copy.unit.spec.ts` to scan all owned English locale and SEO data plus pricing/email source copy for revoked 10-credit and recurring-free-credit promises.
- Ran the focused SEO/config tests and repository verification gates recorded with the incident remediation.

Follow-up:

- No GSC request-indexing or IndexNow action is required because this is a product-terms correction without URL, canonical, sitemap, or indexability changes.

## 2026-07-17

### One-Time Free-Credit Copy Alignment

Changes:

- Corrected free-category, AI upscaler, and comparison copy that incorrectly described recurring monthly free credits or no-signup access.
- Aligned English SEO data and locale mirrors with the product policy: new accounts receive five free credits, credits do not renew, and users must purchase credits or a paid plan to continue.

Validation:

- Added `tests/unit/seo/free-credit-policy-copy.unit.spec.ts` to reject recurring free-credit claims on the affected surfaces.
- Ran the focused SEO/config tests and `yarn verify`.

Follow-up:

- No GSC request-indexing action required; this corrects product terms without changing URLs, metadata ownership, canonicals, or indexability.

## 2026-07-14

### Trending-Down Blog CTR Recovery

Changes:

- Investigated five Search Console trending-down blog URLs with fresh 28-day GSC data through 2026-07-11 and classified the losses by ranking, CTR, and demand.
- Refreshed `/blog/best-image-upscaler` title, SEO title, description fields, and direct-answer opening around `best image upscaling software 2026` after its persistent sub-0.2% CTR escalation matured.
- Refreshed `/blog/how-to-upscale-youtube-thumbnails` title, SEO title, description fields, H1, and direct-answer opening around blurry/low-quality YouTube thumbnail queries after impressions increased while page-one CTR fell.
- Left `/blog/best-free-ai-photo-enhancer-online` unchanged until its scheduled 2026-07-19 evaluation, and avoided speculative edits to the improving Spanish page and low-volume frame-rate article.

Validation:

- Added `tests/unit/seo/trending-down-blog-recovery.unit.spec.ts` for SERP lengths, query-language alignment, and distinct intent targeting.
- Blog API PATCH and GET readback confirmed both records; production HTML renders the new metadata on `200`, indexable, self-canonical pages.

Follow-up:

- Manually request indexing for both refreshed URLs using their existing unchecked entries in [GSC request indexing backlog](./gsc-request-indexing-backlog.md).
- Compare page/query CTR after 14 complete GSC days, with a stronger 28-day decision window; retain the 2026-07-19 photo-enhancer checkpoint.

## 2026-07-13

### GSC-Backed SEO Equity Internal-Link Promotion

Changes:

- Refreshed `content/seo-equity.json` from fresh 90-day GSC data through 2026-07-10 so homepage/blog/start-here/related-post internal-link surfaces now promote active opportunities instead of the stale June set.
- Promoted `/blog/poster-size-dimensions-pixels`, `/blog/how-to-upscale-youtube-thumbnails`, and `/blog/photoshop-upscale-image` into high-equity blog surfaces; `/blog/poster-size-dimensions-pixels` also now receives related-post links from 54 blog pages.
- Fixed `scripts/seo/generate-seo-equity-snapshot.ts` to preserve the current GSC export shape's `meta.dateRange` window instead of falling back to `1970-01-01` metadata.

Validation:

- Fresh GSC fetch completed: 18,475 query/page rows, 90-day window 2026-04-14 to 2026-07-10.
- `content/seo-equity.json` readback confirmed homepage picks and blog start-here links include the promoted opportunity URLs.
- Added unit coverage for the current snapshot window and promoted URLs.

Follow-up:

- After deploy, request indexing for `/` and `/blog`; the promoted target pages are already open in the GSC request-indexing backlog.

## 2026-07-10

### Homepage Blog Selection Test Maintenance

Changes:

- Updated the homepage internal-link unit test to validate the current `getHomepageBlogPicks` SEO-equity selector instead of the retired hardcoded slug array. Runtime homepage behavior and URLs are unchanged.
- Stabilized the signup-query redirect E2E assertion by checking the middleware response before the client consumes the one-shot functional parameter.

Validation:

- `yarn vitest run tests/unit/seo/homepage-internal-links.unit.spec.ts`
- `yarn playwright test tests/e2e/seo-redirects.e2e.spec.ts --project=chromium`

Follow-up:

- None; this is test maintenance and does not require GSC or IndexNow action.

### Premature Measurement Check (Observation Only)

- Pulled fresh GSC data through 2026-07-07 and GA4 organic data through 2026-07-09 at the user's request; the scheduled 2026-07-19/20 measurement windows are not complete, so no page was rewritten and both dated follow-ups remain open.
- In the latest complete four-day GSC comparison (2026-07-04 through 2026-07-07 vs. 2026-06-30 through 2026-07-03), `/blog/fixing-pixelated-photos` increased from 386 to 5,613 impressions and improved from position 15.6 to 10.1; `/blog/best-ai-upscaler` increased from 237 to 1,894 impressions and improved from 19.3 to 11.8; `/blog/topaz-video-upscaler` increased from 738 to 1,951 impressions and improved from 11.1 to 9.0. Click volume remains too small for a CTR conclusion.
- `/blog/best-free-ai-photo-enhancer-online` remained weak in that four-day comparison: 530 impressions, zero clicks, and position 37.9 versus 396 impressions, one click, and position 36.4. Its planned next complete 16-day comparison is still required before another edit.
- GA4 organic behavior for 2026-07-03 through 2026-07-09 was directionally positive but low-volume: the four English pages produced 16 sessions and three configured key events in total, with each page flat or up in sessions versus the preceding seven days. Treat these as event counts, not purchases.

### SEO Growth Plan Execution: Commercial Funnels, Blog Routing, and Ranking Pages

Source: [SEO growth plan 2026-07-10](../reports/seo-growth-plan-2026-07-10.md)

Changes:

- Corrected the three high-traffic commercial landing funnels: `/tools/ai-image-upscaler` now states the five-credit signup requirement, `/formats/upscale-gif-images` no longer promises unsupported animated-GIF processing, and `/scale/upscale-16x` explains the real two-pass 4x workflow. Their hero CTAs now use page-specific destinations and copy.
- Normalized English-only blog routing so canonical `/blog/...` URLs always serve the internal English route regardless of visitor locale, while `/es/blog/...` and other locale-prefixed variants permanently redirect to the unprefixed canonical URL. This fixes the GSC-to-GA path mismatch seen on Spanish and Japanese posts.
- Refreshed production `/blog/topaz-labs-free-trial` around current 2026 official terms: current Topaz Photo has no trial mode, uses a two-day refund window, and differs from the discontinued preview-only Photo AI trial. Added inbound links from the Topaz Video, Topaz Denoise, and best AI enhancer articles.
- Improved `/blog/pixelcut-ai-photo-editor` first-screen intent satisfaction with a direct official-tool link, clear independent-comparison label, current free/paid positioning, and a concise verdict.
- Added a Pixelcut-specific hero intent notice so mobile visitors can see that this is an independent comparison and open the official Pixelcut editor before the featured image or generic MyImageUpscaler CTA.
- Added all changed and normalized URLs to the GSC request-indexing backlog; preserved the report's measurement guardrails as dated follow-ups rather than rewriting pages inside their evaluation windows.

Validation:

- Added SEO unit coverage for commercial claims/CTA destinations and English-only blog URL normalization.
- Corrected commercial-funnel `entry_page` attribution to use session storage instead of persistent local storage, and capture the landing page before analytics consent/provider checks. Signup, upload, processing, result, activation, and checkout events now retain the real commercial landing route within the session.
- Added funnel-sequence coverage for `/tools/ai-image-upscaler`, `/formats/upscale-gif-images`, and `/scale/upscale-16x` across signup, upload, processing start/completion, first result, and checkout.
- Production blog API PATCH requests returned `200`; GET readback confirmed Topaz metadata/content, all three inbound links, and the Pixelcut first-screen update.
- Official Topaz and Pixelcut documentation was checked before editing product terms.
- GA4 Admin key-event audit for property `519826120` confirmed all nine expected internal funnel events and all six emitted GA4 event names are configured; no expected events are missing.
- Mobile visual verification at `390x844` confirmed the Pixelcut disclosure and official-editor link render above the fold without horizontal overflow or console errors.

Follow-up:

- After deploy, manually request indexing for the new 2026-07-10 group in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).
- Run the dated 2026-07-19, 2026-07-20, and early-August GSC comparisons above before further edits.

## 2026-07-03

### CTR / Ranking Lift Pass: Pixelated, Best AI Upscaler, Topaz Video

Source: fresh 90-day GSC export through 2026-06-30, GA4 organic export through 2026-07-02, and blog SEO audit rerun.

Changes:

- Updated `/blog/fixing-pixelated-photos` SEO title and description around the `fix pixelated photos` / `stop pixelated photos` query cluster, and tightened the above-fold direct-answer paragraph.
- Updated `/blog/best-ai-upscaler` title, SEO title, descriptions, opening summary, and added a quick-answer comparison table for AI image upscaler websites.
- Updated `/blog/topaz-video-upscaler` title, SEO title, descriptions, and first H2/intro around `Topaz Video AI vs alternatives 2026`.
- Added the three changed URLs to [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).

Validation:

- Blog API PATCH returned `200` for all three posts; GET readback confirmed updated metadata/content.
- Production HTML spot checks for all three URLs returned canonical, indexable pages and rendered the new title/body text.
- Blog SEO audit rerun cleared the title-length warning for `/blog/topaz-video-upscaler` and keyword-overlap warning for `/blog/fixing-pixelated-photos`; historical CTR flags remain pending new GSC data.

Follow-up:

- Manually request indexing for the three changed URLs, then judge CTR/ranking only after 14-28 complete GSC days.

## 2026-06-29

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-06-29.md](../reports/blog-opportunities-publisher-2026-06-29.md), [blog-performance-recovery-2026-06-29.md](../reports/blog-performance-recovery-2026-06-29.md)

Changes:

- Ran the blog opportunities publisher against fresh 90-day GSC query+page data through 2026-06-26; selected no new publish because all strong candidates duplicate existing canonical blog/tool/pSEO ownership.
- Ran the blog performance monitor against 14-day blog comparison windows: previous 2026-05-30–2026-06-12 and current 2026-06-13–2026-06-26.
- Updated `/blog/best-free-ai-image-upscaler-2026-tested-compared` `description` and `seo_description` only, after persistent zero-click exact-query rows crossed the edit-now threshold while page-level CTR improved.
- Added the changed blog URL to [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).

Validation:

- GSC exports completed for 90-day opportunity discovery and 14-day blog monitoring.
- Blog API PATCH and GET verified the updated description fields.
- Production page HTML rendered the new meta description.

Follow-up:

- User attention required: manually request indexing for the 30 unchecked URLs in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).
- Recheck `/blog/best-free-ai-image-upscaler-2026-tested-compared` exact-query CTR after 2026-07-15; if rows remain 300+ impressions, positions 3-10, and zero clicks after indexing, test a title angle.
- Do not judge 2026-06-20/21 refreshed blog pages until 2026-07-07/08.

## 2026-06-29

### Localized Homepage Metadata Fallback Fix

Source: 28-day GSC export through 2026-06-25 and user-reported trending-down query cluster.

Changes:

- Investigated the reported impression dip; 28-day web clicks and impressions were up overall, but CTR was down and Spanish image-quality queries were ranking too low.
- Added missing localized `meta.homepage` title/description blocks for `es`, `it`, `pt`, and `ja` so localized homepages no longer fall back to English metadata.
- Aligned Spanish homepage metadata with GSC terms around `mejorar calidad de imagen con IA`, `gratis`, and photo-quality improvement.
- Added SEO unit coverage to prevent missing localized homepage metadata and to assert Spanish query-intent alignment.

Validation:

- GSC export completed for current 2026-05-29 to 2026-06-25 versus previous 2026-05-01 to 2026-05-28.
- `npx vitest run tests/unit/seo/locale-homepage-meta.unit.spec.ts` passed.
- `yarn i18n:helper validate` passed for `es`, `it`, `pt`, and `ja` `common.json`.
- `yarn verify` passed.
- `yarn test` completed API and E2E successfully, but the final Vitest phase still has unrelated existing failures in ModelGallery upgrade tests, homepage internal-link source assertions, and email service provider expectations.

Follow-up:

- After deploy, request indexing for the changed localized homepages listed in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).

## 2026-06-22

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-06-22.md](../reports/blog-opportunities-publisher-2026-06-22.md), [blog-performance-recovery-2026-06-22.md](../reports/blog-performance-recovery-2026-06-22.md)

Changes:

- Ran the blog opportunities publisher against fresh 90-day GSC query+page data through 2026-06-19; selected no new publish because all high-evidence candidates duplicate existing canonical blog/tool pages or are inside GSC lag from 2026-06-20/2026-06-21 edits.
- Ran the blog performance monitor against 14-day blog comparison windows: previous 2026-05-23–2026-06-05 and current 2026-06-06–2026-06-19.
- Applied no `blog-edit` changes because candidates were either recently refreshed, improving at page-level despite exact-query CTR leaks, or below edit-now thresholds.

Validation:

- GSC exports completed for 90-day opportunity discovery and 14-day blog monitoring.
- Production spot checks for key loser URLs returned `200`, self-canonical, `index, follow`.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- User attention required: manually request indexing for the 25 unchecked URLs in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).
- Re-run after 2026-06-25 for best-free-upscaler and AI-upscaling-vs-sharpening exact-query CTR escalation; wait until 2026-07-07/08 for pages changed on 2026-06-20/21.

## 2026-06-21

### Trending Down Blog CTR Recovery

Changes:

- Investigated Search Console trending-down URLs for 2026-06-05 to 2026-06-18 versus 2026-05-22 to 2026-06-04.
- Updated `/blog/best-free-ai-photo-enhancer-online` title/SEO title, description/SEO description, and first-screen quick answer around `free AI photo enhancer online` after a real impression/ranking drop.
- Updated `/blog/how-to-upscale-images-for-instagram` title/SEO title, description/SEO description, first-screen `2160x2700` answer, and in-body CTA markers.
- Updated `/blog/free-photo-restoration-app` title/SEO title, description/SEO description, first-screen answer, and in-body restoration CTA markers.
- Added in-body `[!CTA_TRY]` and `[!CTA_DEMO]` markers to `/blog/best-app-to-restore-old-photos`, `/blog/fix-pixelated-image`, `/blog/image-upscaler-8x`, and `/blog/sharpen-a-video`.
- Treated `/blog/best-ai-image-quality-enhancer` as an expected old-URL drop because production redirects it to `/blog/best-ai-image-enhancer`; the destination already has CTA markers and had been refreshed earlier on 2026-06-21.
- Did not rewrite `/blog/topaz-video-upscaler` because it was already refreshed on 2026-06-21 and remains in the indexing backlog; current GSC data is still inside the post-change lag window.
- Did not edit one-click/no-data rows where fresh GSC page/query data showed no current actionable query cluster.

Validation:

- API readback confirmed updated metadata on `/blog/best-free-ai-photo-enhancer-online`, `/blog/how-to-upscale-images-for-instagram`, and `/blog/free-photo-restoration-app`.
- API readback confirmed `[!CTA_TRY]` and `[!CTA_DEMO]` on all patched posts.
- `yarn verify` passed.

Follow-up:

- Manually request indexing for the new unchecked URLs in `gsc-request-indexing-backlog.md`, plus existing unchecked changed URLs already present there.
- Recheck after 14 complete GSC days; do not judge the 2026-06-21 edits from data before 2026-07-08.

### SEO Blog CTR Body CTA Skill Rename

Changes:

- Renamed the reusable blog CTR body CTA workflow from `.agents/skills/blog-ctr-body-cta/` to `.agents/skills/seo-blog-ctr-body-cta/` so it is easier to find with other SEO skills.
- Updated the Three Kings zero-CTR routing notes to reference `seo-blog-ctr-body-cta`.

Validation:

- Skill validation passed with `python /home/joao/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/seo-blog-ctr-body-cta`.
- Fresh GSC CTR export for 2026-05-22 to 2026-06-18 found two strict zero-CTR blog candidates; the renamed helper reported both as `unchanged` because both already contain `[!CTA_TRY]` and `[!CTA_DEMO]`.
- API readback confirmed both CTA markers on `/blog/best-free-ai-image-upscaler-2026-tested-compared` and `/blog/video-upscaling-software`.
- `yarn verify` passed.

Follow-up:

- No body CTA follow-up needed from this pass; both remaining zero-CTR candidates are already patched for this issue.

### Blog Body CTA Pass for High-Impression Low-CTR Pages

Changes:

- Used the 28-day CTR deficit export to identify blog URLs with 1,000+ impressions and CTR <= 0.25%.
- Added mid-body `[!CTA_TRY]` and `[!CTA_DEMO]` blocks to high-impact API-backed posts missing the pattern, including `/blog/fixing-pixelated-photos`, `/blog/topaz-video-upscaler`, `/blog/poster-size-dimensions-pixels`, `/blog/best-ai-upscaler`, `/blog/topaz-denoise-ai`, `/blog/best-ai-image-enhancer`, `/blog/video-upscaling-software`, `/blog/photo-restoration-program`, and `/blog/image-resolution-guide-everything-you-need-to-know`.
- Confirmed static legacy candidates already contained both CTA markers in `content/blog-data.json`.
- Added the reusable `.agents/skills/blog-ctr-body-cta/` workflow and script for future CTR body CTA passes.

Validation:

- Blog API readback confirmed both CTA markers on all API-backed candidates.
- Static JSON readback confirmed both CTA markers on legacy candidates.
- Public URL spot checks returned 200 and exposed CTA/tool-link text in rendered HTML for representative API and static posts.
- Skill validation passed with `python /home/joao/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/blog-ctr-body-cta`.

Follow-up:

- Request indexing for touched URLs already present in the GSC request-indexing backlog; add any missing touched URLs before the next deploy/indexing pass.

### Fixing Pixelated Photos Featured Image Refresh

Changes:

- Generated a less generic featured image for `/blog/fixing-pixelated-photos` with Replicate, showing a before/after pixelated-to-restored photo concept.
- Uploaded the compressed WebP to Supabase Storage and updated `featured_image_url` and `featured_image_alt` on the Supabase blog post.

Validation:

- Blog API readback confirmed the new Supabase WebP URL and alt text.
- New image URL returned `200` with `content-type: image/webp`.
- Public page HTML with a cache-busting query referenced the new image filename.

### Cloudflare Worker 1102 pSEO Middleware CPU Guard

Changes:

- Investigated production Worker 1102 at `2026-06-21 20:59:05 UTC`; Worker analytics showed CPU-heavy invocations around the failing minute without application exceptions.
- Stopped public unlocalized pSEO pages from refreshing Supabase sessions in middleware.
- Ensured dashboard routes continue through page auth before locale rewrites.

Validation:

- Added `tests/unit/seo/middleware-public-page-auth.unit.spec.ts` to assert public pSEO pages bypass session refresh while dashboard routes still refresh auth.
- Added `tests/e2e/middleware-auth-routing.e2e.spec.ts` to cover public pSEO rendering plus default and localized dashboard routing.

Follow-up:

- After deploy, monitor Cloudflare Workers CPU/1102 rates and request zone HTTP analytics access if exact Ray-to-URL mapping is needed.

## 2026-06-20

### Blog Thin Content Scan — Video Upscaling Software

Source: [blog-thin-content-scan-2026-06-20.md](../reports/blog-thin-content-scan-2026-06-20.md)

Changes:

- Pulled fresh 90-day GSC and GA4 organic data for the recurring blog thin-content scan.
- Updated Supabase blog content for `/blog/video-upscaling-software`: title, SEO title, description, SEO description, first-screen direct answer/use-case matrix, and contextual link to `/blog/topaz-video-upscaler`.
- Skipped high-impression recent-refresh URLs that remain in the GSC request-indexing backlog.

Validation:

- Blog API `PATCH` and `GET` returned `200` and verified the updated fields/content.
- Local frontend route `/blog/video-upscaling-software` returned `200` and rendered the new title/meta/quick-answer content.
- Re-ran the blog SEO audit; the historical CTR flag remains, but title-length/keyword-overlap issues for the edited post are cleared.

Follow-up:

- Manually request indexing in GSC for `https://myimageupscaler.com/blog/video-upscaling-software`, then recheck after 14-28 complete GSC days.

## 2026-06-12

### GSC Zero-Click Opportunity Follow-Up

Source: [zero-click-3-kings-follow-up-2026-06-12.md](../reports/zero-click-3-kings-follow-up-2026-06-12.md)

Changes:

- Pulled fresh 90-day GSC data through 2026-06-09 and GA4 organic data through 2026-06-11 for `/blog/fixing-pixelated-photos` and similar zero-click opportunities.
- Verified `/blog/fixing-pixelated-photos` is indexed, canonical, mobile-crawled, and has FAQ rich results, but Google last crawled it on 2026-05-22, before the 2026-06-07 Three Kings refresh.
- Resubmitted `https://myimageupscaler.com/sitemap.xml` and `https://myimageupscaler.com/sitemap-static.xml` through the Search Console Sitemaps API; both returned `204 No Content`.
- Attempted browser-based GSC request indexing, but the local browser connector was not logged into Search Console and Chrome installation requires sudo. Manual request indexing remains pending in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).

Follow-up:

- Manually request indexing in GSC for the unchecked 2026-06-07 and related high-priority URLs, then recheck after 14 complete GSC days.
- Do not rewrite `/blog/fixing-pixelated-photos` again until Google has recrawled the June 7 refresh and at least 14 complete post-recrawl GSC days are available.

## 2026-06-07

### SEO Equity Flywheel Snapshot + Read-Only Consumers

Changes:

- Added static SEO equity editorial config, generated snapshot, scoring/schema/loader helpers, saved-export generator, diff gate, no-op guarded GSC fetch stub, and scheduled offline snapshot workflow.
- Wired homepage blog picks, blog index featured/start-here cards, and blog footer related-post selection to static snapshot selectors with existing fallbacks.
- Added SEO unit coverage for schema validation, canonical-winner enforcement, scoring/filtering, diff materiality, and loader selectors.

Validation:

- `npx vitest run tests/unit/seo/seo-equity-schema.unit.spec.ts tests/unit/seo/seo-equity-scoring.unit.spec.ts tests/unit/seo/seo-equity-loader.unit.spec.ts`
- Generator rerun twice from `/tmp/gsc-miu-seo-equity-prd.json` produced a stable `content/seo-equity.json`; diff gate reported no material change.

Follow-up:

- After deployment/review, monitor promoted blog URLs after 14 complete GSC days and keep GSC fetching as an explicit offline/scheduled action only.

### 3 Kings Opportunities Execution

Source: [3-kings-opportunities-2026-06-07.md](../reports/3-kings-opportunities-2026-06-07.md)

Changes:

- Updated Supabase blog metadata and first-screen content for `/blog/fixing-pixelated-photos`, including the new H1/title, immediate answer, and cause/fix/tool-path table.
- Updated Supabase blog metadata and first-screen comparison table for `/blog/topaz-video-upscaler`.
- Updated Supabase blog metadata and opening answer for `/blog/topaz-labs-free-trial`, fixing the truncated SEO description.
- Added contextual internal links into `/blog/fixing-pixelated-photos` from `how-to-sharpen-blurry-images`, `restore-old-photos-service`, and `photo-restoration-near-me`.
- Consolidated `/blog/how-ai-image-upscaling-works-explained` into `/blog/how-ai-image-upscaling-works-guide` with redirects, sitemap exclusion, and internal PSEO reference cleanup.
- Refreshed English Adobe Express alternatives metadata, H1, intro, differentiators, and comparison rows.

Validation:

- Supabase SQL readback verified the updated titles, SEO descriptions, inserted first-screen copy, and internal links.
- Local JSON/redirect files passed targeted metadata/reference checks.

Follow-up:

- After deploy, request indexing for the dated 2026-06-07 backlog URLs and recheck GSC after 14 complete days.

### Blog SERP CTR Test: Best Free AI Image Upscaler

Changes:

- Updated Supabase blog metadata for `/blog/best-free-ai-image-upscaler-2026-tested-compared`.
- New SEO title: `Best Free AI Image Upscaler Online 2026: 12 Tested`.
- New SEO description: `Compare 12 free online AI image upscalers for 2026: no signup, no watermark, 4K/8K output, limits, speed, and realistic detail.`

Why it mattered:

- GSC 90-day web data showed 77,603 impressions, 238 clicks, 0.31% CTR, and average position 7.08.
- Top exact-match query rows such as `best free ai image upscaler 2026` and `best free ai image upscaler online 2026` remained zero-click despite page-one rankings.

Validation:

- Blog API `PATCH` returned 200 and revalidated `/blog` plus `/blog/best-free-ai-image-upscaler-2026-tested-compared`.
- Live HTML verified title and meta description after revalidation.
- CTR baseline saved at `/tmp/ctr-best-free-ai-upscaler-baseline-2026-06-07.json`.

Follow-up:

- Recheck CTR after 14-28 complete GSC days before making another snippet or content change.

## 2026-06-05

### Blog Thin Content Refresh

Source: [blog-thin-content-scan-2026-06-05.md](../reports/blog-thin-content-scan-2026-06-05.md)

Changes:

- Updated `/blog/poster-size-dimensions-pixels` around 24x36 poster pixel intent with a first-screen 150/200/300 DPI table, print-readiness rule, and upscaler CTA.
- Updated `/blog/what-resolution-for-print` around 8x10 print resolution with an above-fold `2400 x 3000 pixels at 300 DPI` answer, calculator-style table support, and links to the poster chart plus 300 DPI guide.
- Retargeted `/blog/best-image-upscaler` as a free-vs-pro support comparison and added canonical support links to `/blog/best-free-ai-image-upscaler-2026-tested-compared`.
- Strengthened `/blog/best-free-ai-photo-enhancer-online` with enhancer-vs-upscaler-vs-sharpener clarification, proof/test modules, and `/tools/ai-photo-enhancer` CTA alignment.
- Updated `/blog/how-to-upscale-midjourney-images-for-print` around Midjourney max resolution and print upscaling, using current Midjourney V7/V8.1 dimension notes checked against official docs.
- Updated `/blog/photoshop-upscaler-vs-ai-tools` around Photoshop Super Resolution vs AI upscaler comparison intent, with a direct answer and file-type test matrix.
- Updated `/blog/how-to-upscale-youtube-thumbnails` around blurry/low-quality thumbnail troubleshooting.

Validation:

- Blog API `PATCH` succeeded for all seven posts and returned updated `updated_at` timestamps plus recalculated reading-time values.
- Blog API `GET` verified updated titles, SEO descriptions, and inserted intent sections for all seven posts.
- Local frontend blog routes currently return a Next/Turbopack dev manifest `ENOENT` for the shared blog route, including unrelated blog URLs; API/content verification is clean.

Follow-up:

- After deploy, request indexing for the seven refreshed blog URLs and monitor GSC CTR/GA engagement after 14 complete days.

## 2026-06-05

### Tool Page Three Kings Pass: AI Image Upscaler

Changes:

- Updated `/tools/ai-image-upscaler` H1 and first paragraph to front-load "free AI image upscaler", "up to 8x", "online", "no signup", and "no watermarks".
- Synced `locales/en/tools.json` metadata/copy with the canonical English tool-page copy so localized data loading does not use the older 4K title.

Why it mattered:

- Fresh GSC showed `/tools/ai-image-upscaler` clicks improved from 17 to 61 and CTR from 1.10% to 4.52%, but average position slipped from 2.52 to 6.30. The strongest query/page candidates were "image upscaler 8x free" and "image upscaler 8x gratis" at positions 8.97 and 10.14.

Validation:

- `npx vitest run tests/unit/seo/tools-metadata.unit.spec.ts tests/unit/seo/tool-data-loader.unit.spec.ts`

Follow-up:

- After deploy, request indexing for `/tools/ai-image-upscaler` and recheck after 14 complete GSC days.

## 2026-06-05

### Blog specialist author section (E-E-A-T)

Changes:

- Added `BlogSpecialistSection` at the bottom of blog post articles with expanded Joao Furtado bio, expertise tags, About link, and X profile (`@joaocoldstart`).
- Extended `BLOG_SPECIALIST_PROFILE` with bio, expertise, and `sameAs` for schema.

Why it mattered:

- Strengthens reviewer attribution and E-E-A-T signals on blog posts with visible credentials and a personal social profile link.

Files:

- `client/components/blog/BlogSpecialistSection.tsx`
- `lib/blog/specialist-profile.ts`
- `app/[locale]/blog/[slug]/page.tsx`

Validation:

- `tests/unit/blog/blog-specialist-section.unit.spec.ts`
- `tests/unit/seo/blog-specialist-profile.unit.spec.ts`

Follow-up:

- None. Schema `reviewedBy.sameAs` updated; no reindex needed beyond normal deploy crawl.

### Blog post footer layout consistency

Changes:

- Consolidated blog post footer sections (Try It Yourself, Quick Verdict, Continue Reading, final CTA) into `BlogPostFooter` with shared `BlogSectionHeader` styling.
- Replaced the full-bleed cyan gradient bottom banner with a dark-theme card CTA aligned to the rest of the blog template.

Why it mattered:

- Footer sections had mismatched widths, spacing, iconography, and a jarring bright gradient that broke visual continuity on blog posts.

Files:

- `app/[locale]/blog/_components/BlogPostFooter.tsx`
- `client/components/blog/BlogSectionHeader.tsx`
- `app/[locale]/blog/[slug]/page.tsx`
- `client/components/blog/RelatedPosts.tsx`

Validation:

- `tests/unit/seo/blog-post-footer.unit.spec.ts`

### Homepage trim + distributed signup CTAs

Changes:

- Removed redundant hero "What is MyImageUpscaler?" feature grid (duplicated the `#features` section).
- Removed the "Popular Image Upscaling Guides" link block (overlapped with the crawlable "From the Blog" section and Popular Tools internal links).
- Added reusable signup CTAs after creators, popular tools, features, how-it-works, and FAQ sections.
- Kept SEO-critical surfaces: hero `h1`, Popular Tools internal links, FAQ (visible + JSON-LD), locale links, pricing, and blog module.

Validation:

- `yarn test tests/unit/seo/homepage-internal-links.unit.spec.ts`
- `yarn test tests/unit/seo/homepage-performance.unit.spec.ts`
- `yarn test tests/unit/client/components/homepage-cta.unit.spec.ts`

Follow-up:

- None. Homepage canonical and schema unchanged; no reindex needed beyond normal deploy crawl.

### Blog Template CTR and Conversion Restructure

Changes:

- Restructured `/blog` around problem-led CTR capture: stronger SERP metadata, upload/tool CTAs above the fold, problem search paths, curated topic filters, and high-intent internal-link cards.
- Added Blog and ItemList JSON-LD to the blog index for clearer collection-level search signals.
- Restructured `/blog/[slug]` with a stronger article hero, quick answer/CTA panel, linked topic tags, sticky desktop table of contents, BreadcrumbList JSON-LD, and article `keywords`/`about` topic entities.
- Replaced the all-pages pagination strip with bounded pagination plus ellipses to avoid mobile overflow and reduce crawl/UI clutter.

Validation:

- Added `tests/unit/seo/blog-template-signals.unit.spec.ts` for Blog, ItemList, BreadcrumbList, and article topical entity schema helpers.
- Updated blog E2E H1 expectations for the new CTR-focused heading.
- Local Playwright screenshots captured for `/blog` and `/blog/image-size-for-web` at 1440px desktop and 390px mobile.

Follow-up:

- After deploy, inspect `/blog` and a representative `/blog/*` URL in GSC URL Inspection and monitor blog page CTR, organic signups, and upload CTA clicks after the usual GSC lag.

## 2026-06-02

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-06-02.md](../reports/blog-opportunities-publisher-2026-06-02.md), [blog-performance-recovery-2026-06-02.md](../reports/blog-performance-recovery-2026-06-02.md)

Changes:

- Ran the blog opportunities publisher against fresh 90-day GSC query+page data through 2026-05-31 and selected no new publish because the strongest rows duplicate existing canonical blog coverage.
- Ran the blog performance monitor against direct 14-day blog GSC comparison windows: previous 2026-05-04–2026-05-17 and current 2026-05-18–2026-05-31.
- Confirmed no immediate `blog-edit` handoff was applied because the main candidates were updated on 2026-05-24 and/or 2026-05-26 and remain inside the 14-day post-refresh measurement guardrail.

Validation:

- GSC exports completed for 90-day opportunity discovery and blog monitoring.
- Anti-cannibalization gate blocked duplicate publishing for best-free-upscaler, AI-upscaling-vs-sharpening, background-transparent, sharpener/enhancer, and best-ai-upscaler intents.
- Production redirect checks confirmed retired blog URLs still return `308` to their canonical destinations.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- Re-run after 2026-06-07 for best-free-upscaler and AI-upscaling-vs-sharpening zero-click rows.
- Recheck Topaz, best-ai-upscaler, and grainy-photo rows after 2026-06-10 if they remain weak after the 2026-05-26 changes are measurable.
- Complete the 10 unchecked manual request-indexing items in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).

## 2026-06-01

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-06-01.md](../reports/blog-opportunities-publisher-2026-06-01.md), [blog-performance-recovery-2026-06-01.md](../reports/blog-performance-recovery-2026-06-01.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC query+page data through 2026-05-29 and selected no new publish because the strongest candidates duplicate existing canonical blog/tool ownership or recent metadata tests.
- Ran the blog performance monitor against 14-day blog GSC comparison windows: previous 2026-05-02–2026-05-15 and current 2026-05-16–2026-05-29.
- Confirmed no immediate `blog-edit` handoff was warranted because the main action candidates were updated on 2026-05-24 and/or 2026-05-26 and are still inside GSC lag.

Validation:

- GSC exports completed for 90-day opportunity discovery and 14-day blog monitoring.
- Anti-cannibalization gate blocked duplicate publishing for best-free-upscaler, AI upscaling vs sharpening, sharpener/enhancer, Topaz, print/DPI, and pixelated-photo intents.
- Production redirect checks confirmed retired blog URLs still return `308` to their canonical destinations.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- Re-run after 2026-06-07 for the best-free-upscaler and AI-upscaling-vs-sharpening zero-click rows.
- Recheck Topaz/fix-blurry rows after 2026-06-10, once 2026-05-26 changes have more complete GSC days.
- Complete the 10 unchecked manual request-indexing items in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).

## 2026-05-31

### Best-Free Upscaler CTR Title Test

Source: [3-kings-follow-up-2026-05-31.md](../reports/3-kings-follow-up-2026-05-31.md)

Changes:

- Updated Supabase blog SERP metadata for `/blog/best-free-ai-image-upscaler-2026-tested-compared` to front-load the exact `best free ai image upscaler 2026` query after GSC showed positions ~5–6 with 0% CTR.
- Kept the change metadata-only and narrow; did not rerun a broad Three Kings rewrite because `/blog/best-ai-upscaler` and `/blog/how-to-upscale-anime-images-with-ai` are waiting for another GSC window, and `/blog/topaz-video-upscaler` already received proof/content depth work on 2026-05-26.
- Added the changed URL to the GSC request-indexing backlog.

Validation:

- Supabase SQL update returned the expected `seo_title`, `seo_description`, and `updated_at` for the target post.
- Public URL check returned HTTP 200 after the update.

Follow-up:

- After deploy/cache refresh, request indexing for the URL listed in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).
- Recheck GSC after 14–28 complete post-change days; watch CTR/clicks for the `best free ai image upscaler 2026`, `online`, and `4K` query variants.

## 2026-05-26

### Fix-Before-Pushing Six Ranking Pages

Source: [fix-before-pushing-pages-deep-dive-2026-05-26.md](../reports/fix-before-pushing-pages-deep-dive-2026-05-26.md)

Changes:

- Repaired `/comparisons-expanded/ai-models-comparison` local pSEO metadata for 2026, fixed the broken meta description, added a top technical answer, and added a rendered model comparison table/technical model-family section.
- Updated Supabase blog content and SERP metadata for `/blog/photoshop-upscale-image`, `/blog/sharpen-a-video`, `/blog/topaz-denoise-ai`, and `/blog/best-ai-image-enhancer` to match the report's first-screen intent fixes.
- Updated Supabase blog content and SERP metadata for the report's non-2026-05-24 CTR rewrite candidates: `/blog/topaz-video-upscaler` and `/blog/upscale-image-for-print-300-dpi-guide`.
- Added permanent redirects from `/blog/best-ai-image-quality-enhancer` to `/blog/best-ai-image-enhancer`, including locale-prefixed variants, to resolve the broad enhancer cluster without disturbing the free sharpener page.
- Added homepage, tool-page, and relevant high-traffic blog internal links to the striking-distance pages from the report.
- Added homepage analytics improvements: hero CTA click tracking plus `acquisition_page_type` and `is_acquisition_landing_page` page-view dimensions to separate auth/dashboard app-flow traffic from acquisition landing-page reporting.
- Added CTR baseline tracking in [ctr-baselines-2026-05-26.md](../monitoring/ctr-baselines-2026-05-26.md) and queued changed URLs in the GSC request-indexing backlog.
- Did not touch `/blog/best-free-ai-image-upscaler-2026-tested-compared`, per the report guardrail and newer positive CTR data.

Validation:

- Supabase SQL verification returned updated metadata and top-of-content blocks for the four edited blog posts.
- Supabase SQL verification returned updated metadata and top-of-content blocks for the two additional CTR rewrite candidates.
- Local code/data changes passed TypeScript, pSEO data validation, schema validation, formatting check, and production build.

Follow-up:

- After deploy, verify the new `/blog/best-ai-image-quality-enhancer` redirects in production.
- After deploy, request indexing for the changed URLs listed in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).
- Recheck CTR against [ctr-baselines-2026-05-26.md](../monitoring/ctr-baselines-2026-05-26.md) after the listed dates.
- Monitor these repaired pages before adding new internal-link pushes; the report recommends waiting for CTR/engagement improvement.

### GSC Growth Opportunity Report

Source: [gsc-growth-opportunity-report-2026-05-26.md](../reports/gsc-growth-opportunity-report-2026-05-26.md)

Changes:

- Pulled fresh 28-day GSC data through 2026-05-23 and GA4 organic data through 2026-05-25.
- Ran SEO growth synthesis and blog SEO audit to identify current GSC drivers, CTR leaks, conversion/tracking issues, and ranking opportunities.
- Added a backlog-aware report note that the 2026-05-24 metadata pass is not yet measurable in the current GSC window.
- Added focused deep-dive report for fix-before-pushing pages: [fix-before-pushing-pages-deep-dive-2026-05-26.md](../reports/fix-before-pushing-pages-deep-dive-2026-05-26.md).
- Rechecked the free AI upscaler cluster against production redirects and GSC query/page splits; softened the report from "consolidate now" to "maintain existing consolidation and avoid touching the winning canonical page."

Validation:

- GSC export, GA4 export, SEO synthesis, and blog audit completed successfully.
- Cross-checked recent SEO changes backlog, GSC request-indexing backlog, and blog changelog before finalizing the report.
- Production redirect checks confirmed retired URLs redirect as expected.

Follow-up:

- Re-run CTR tracking after 2026-06-07 for the 2026-05-24 metadata batch before making another metadata pass on the same URLs.

## 2026-05-25

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-05-25.md](../reports/blog-opportunities-publisher-2026-05-25.md), [blog-performance-recovery-2026-05-25.md](../reports/blog-performance-recovery-2026-05-25.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC query+page data through 2026-05-22 and selected no new publish because the strongest candidates duplicate existing canonical blog clusters or are recent metadata tests still inside GSC lag.
- Ran the blog performance monitor against direct date+page+query GSC data, comparing 2026-04-25–2026-05-08 with 2026-05-09–2026-05-22.
- Confirmed no immediate `blog-edit` handoff was warranted because top actionable pages were updated on 2026-05-24, which is newer than the latest complete GSC date.

Validation:

- GSC exports completed for 90-day opportunity discovery and 31-day blog monitoring.
- Anti-cannibalization gate blocked duplicate publishing for existing best-free-upscaler, upscaling-vs-sharpening, sharpener/enhancer, transparent-background, and photo-restoration intents.
- Production redirect checks confirmed retired blog URLs return `308` to their canonical destinations.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- Re-run after 2026-06-03 for the first measurable read on the 2026-05-24 metadata pass, especially `/blog/best-ai-image-quality-enhancer-free`.
- Recheck the full 2026-05-24 metadata batch after 2026-06-07 for 14-day CTR movement.

## 2026-05-24

### GSC Click Recovery: Blog SERP CTR Metadata Pass

Source: [gsc-click-recovery-2026-05-24.md](../reports/gsc-click-recovery-2026-05-24.md)

Changes:

- Pulled fresh 56-day, 28-day, and 14-day GSC exports plus 56-day GA4 organic data.
- Confirmed the latest 14-day click loss is mainly a blog SERP CTR/ranking problem: clicks -40.89%, impressions -1.35%, CTR -40.08%, average position weaker by 4.42.
- Confirmed GA4/GSC tracking cross-check is sane for the 56-day window: GSC clicks to GA organic sessions ratio 0.85.
- Updated production Supabase blog SEO titles and descriptions for `/blog/best-free-ai-image-upscaler-2026-tested-compared`, `/blog/ai-image-upscaling-vs-sharpening-explained`, `/blog/best-ai-upscaler`, `/blog/free-ai-upscaler-no-watermark`, and `/blog/how-to-upscale-anime-images-with-ai`.
- Kept the pass metadata-only because the backlog shows those pages received recent May body-content refreshes.

Validation:

- Blog API PATCH calls succeeded for all five posts.
- Blog API verification confirmed updated `seo_title`, `seo_description`, and `updated_at` values.
- Public frontend checks returned HTTP 200 for all five changed blog URLs.

Follow-up:

- Request indexing for the five changed URLs in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).
- Re-run CTR tracking after 2026-06-07 when 14 complete GSC days can reflect the new SERP snippets.

## 2026-05-22

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-05-22.md](../reports/blog-opportunities-publisher-2026-05-22.md), [blog-performance-recovery-2026-05-22.md](../reports/blog-performance-recovery-2026-05-22.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC query+page data through 2026-05-19 and selected no new publish because the strongest candidates duplicate existing canonical blog clusters.
- Ran the blog performance monitor against direct date+page+query GSC data, comparing 2026-04-22–2026-05-05 with 2026-05-06–2026-05-19.
- Confirmed no immediate `blog-edit` handoff was warranted because top affected pages were recently refreshed, intentionally redirected/consolidated, or improved clicks/rank despite lower impressions.

Validation:

- GSC exports completed for 90-day opportunity discovery and 28-day blog monitoring.
- Anti-cannibalization gate blocked duplicate publishing for existing best-free-upscaler, upscaling-vs-sharpening, sharpener/enhancer, photo-restoration, background-removal, and AI-upscaling-explainer intents.
- Production redirect checks confirmed retired blog URLs return `308` to their canonical destinations.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- Re-run after 2026-05-26 when more post-refresh GSC data is available, especially for `/blog/best-ai-image-quality-enhancer-free`.
- Request indexing for unchecked URLs in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).

## 2026-05-20

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-05-20.md](../reports/blog-opportunities-publisher-2026-05-20.md), [blog-performance-recovery-2026-05-20.md](../reports/blog-performance-recovery-2026-05-20.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC query+page data through 2026-05-17 and selected no new publish because the strongest candidates duplicate existing canonical blog clusters.
- Ran the blog performance monitor against direct date+page+query GSC data, comparing 2026-04-20–2026-05-03 with 2026-05-04–2026-05-17.
- Confirmed no immediate `blog-edit` handoff was warranted because top affected pages were recently refreshed, intentionally redirected/consolidated, or improved clicks/rank despite lower impressions.

Validation:

- GSC exports completed for 90-day opportunity discovery and 28-day blog monitoring.
- Anti-cannibalization gate blocked duplicate publishing for existing best-free-upscaler, upscaling-vs-sharpening, sharpener/enhancer, anime, Photoshop, 8x, and 16x intents.
- Production redirect checks confirmed retired blog URLs return `308` to their canonical destinations.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- Re-run after 2026-05-23 when more post-refresh GSC data is available, especially for `/blog/best-ai-image-quality-enhancer-free`.
- Request indexing for unchecked URLs in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).

## 2026-05-19

### GSC Click Recovery: Blog CTR Links + Sitemap Blocklist Cleanup

Changes:

- Verified the fresh 28-day GSC pull through 2026-05-16: clicks -29.42%, impressions -9.48%, CTR -22.03%, average position weaker by 0.79.
- Updated Supabase blog metadata and CTA destinations for `/blog/best-free-ai-image-upscaler-2026-tested-compared`, `/blog/best-ai-image-quality-enhancer-free`, and `/blog/free-ai-upscaler-no-watermark`.
- Repointed generic homepage CTAs in those posts to the matching tool routes where intent is clearer: `/tools/ai-image-upscaler` and `/tools/ai-photo-enhancer`.
- Verified all stale static blog blocklist URLs return production `200`, then removed those static slugs from `BLOCKED_BLOG_SLUGS` so they can re-enter `sitemap-blog.xml`.
- Kept deliberate cannibalization/redirect slugs blocked from sitemap output.
- Fixed static blog post date fallback in the blog detail page so static JSON posts use `post.date` instead of rendering `Invalid Date`.

Validation:

- Production HEAD checks returned `200` for the previously blocklisted static posts before unblocking.
- Blog API PATCH calls succeeded and revalidated the changed blog URLs.

Follow-up:

- After deploy, verify `sitemap-blog.xml` includes the restored static posts, especially `/blog/how-ai-image-upscaling-works-guide`.
- Request indexing for the three changed Supabase posts and the restored static sitemap URLs if GSC still reports sitemap association gaps.

## 2026-05-18

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-05-18.md](../reports/blog-opportunities-publisher-2026-05-18.md), [blog-performance-recovery-2026-05-18.md](../reports/blog-performance-recovery-2026-05-18.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC data through 2026-05-15 and selected no new publish because candidates were duplicate, recently refreshed, redirected/consolidated, navigational, or better handled by existing page refresh/indexing.
- Ran the blog performance monitor against the default 28-day fetcher comparison for blog URLs.
- Confirmed no immediate `blog-edit` handoff was warranted because top affected pages were recently refreshed, intentionally consolidated, or improved clicks/rank despite lower impressions.

Validation:

- GSC exports completed for 90-day opportunity discovery and 28-day blog monitoring.
- Anti-cannibalization gate blocked duplicate publishing for existing canonical blog intents.
- Redirect checks confirmed retired blog URLs return `308` to their canonical destinations.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- Request indexing for unchecked URLs in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md), then re-run after 2026-05-21 when more post-refresh data is available.

## 2026-05-15

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-05-15.md](../reports/blog-opportunities-publisher-2026-05-15.md), [blog-performance-recovery-2026-05-15.md](../reports/blog-performance-recovery-2026-05-15.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC data through 2026-05-12 and selected no new publish because candidates were duplicate, already published, navigational, or better handled by reindexing/refreshing existing URLs.
- Ran the blog performance monitor against the default 28-day fetcher comparison for blog URLs.
- Confirmed no immediate `blog-edit` handoff was warranted because top affected pages were recently refreshed or intentionally consolidated.

Validation:

- GSC exports completed for 90-day opportunity discovery and 28-day blog monitoring.
- Anti-cannibalization gate blocked duplicate publishing for existing canonical blog intents.
- Reports saved under `docs/SEO/reports/`.

Follow-up:

- Request indexing for unchecked URLs in [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md), then re-run after 2026-05-19 when more post-refresh data is available.

## 2026-05-14

### Three Kings Blog Metadata Refresh

Source: [3-kings-skill-run-2026-05-14.md](../reports/3-kings-skill-run-2026-05-14.md)

Changes:

- Updated Supabase-backed blog Three Kings metadata and opening copy for `/blog/best-ai-upscaler`, `/blog/topaz-video-upscaler`, and `/blog/how-to-upscale-anime-images-with-ai`.
- Checked the optional P3 `/blog/upscale-image-online-free` and skipped keeping changes because production redirects it to `/blog/free-ai-upscaler-no-watermark`.
- Left the recently refreshed `/blog/best-free-ai-image-upscaler-2026-tested-compared`, `/blog/ai-image-upscaling-vs-sharpening-explained`, and `/blog/best-ai-image-quality-enhancer-free` unchanged per the report's 14-day GSC safeguard.
- Added the three changed URLs to [gsc-request-indexing-backlog.md](./gsc-request-indexing-backlog.md).

Validation:

- Blog API GET/PATCH verification confirmed updated titles, descriptions, SEO titles, SEO descriptions, and opening content for all three changed URLs.
- Confirmed `/blog/upscale-image-online-free` returns `308` to `/blog/free-ai-upscaler-no-watermark`, so the optional P3 old-URL update was not retained.

Follow-up:

- Request indexing manually for the three changed URLs after deploy/content cache settles.
- Re-run GSC after 14 complete days before making another Three Kings pass.

## 2026-05-13

### Tool Pages CTR + Internal Linking Cleanup

Source: [tool-pages-seo-analysis-2026-05-13.md](../reports/tool-pages-seo-analysis-2026-05-13.md)

Changes:

- Removed duplicate `MyImageUpscaler` branding from high-value pSEO tool metadata in base and localized tool data.
- Strengthened static AI/background tool `relatedTools` clusters and updated related-page resolution so static `tools.json` relationships are honored before interactive fallback links.
- Improved `/tools` hub discovery with a popular-tools block, clearer category descriptions, descriptive anchors, and mapped interactive tool URLs.
- Documented intentional fallback `/tools/:slug` route policy in the pSEO validator and reduced noisy route warnings.
- Removed the empty `sitemap-images.xml` entry from the sitemap index expectations.

Validation:

- `yarn validate:seo:pseo` passed with 6 unrelated long-title warnings remaining outside the touched tool pages.
- `yarn validate:seo:pseo:verbose` passed and confirmed intentional fallback interactive tool routes.
- `yarn validate:seo:internal-links` passed.
- `yarn validate:seo:schema` passed.
- `yarn test:unit tests/pseo/qa/qa-related-pages-tools.test.ts` passed.
- `yarn verify` passed with existing lint warnings.

Follow-up:

- After deploy, monitor `/tools`, `/tools/ai-image-upscaler`, `/tools/ai-photo-enhancer`, and background-remover tool pages in GSC for CTR and internal-link routing improvements.

### GA4 SEO Funnel Key-Event Admin Check

Source: [seo-growth-skills-report-2026-05-13.md](../reports/seo-growth-skills-report-2026-05-13.md)

Changes:

- Checked GA4 Admin key events for property `519826120` using the configured service account.
- Confirmed the only currently configured key event visible through the API is `purchase`.
- Confirmed the SEO funnel events are not currently marked as GA4 key events: `image_uploaded`, `image_upscale_started`, `upscale_completed`, `signup_started`, `signup_completed`, `checkout_opened`, `checkout_started`, `checkout_completed`, and `purchase_confirmed`.
- Added `.claude/skills/ga-analysis/scripts/ga4-key-events.cjs` so the missing key events can be checked or created from the repo once the service account has GA4 Editor access.
- Updated the checker to cover both internal event names and the GA4 event names actually emitted after `GA4_EVENT_MAP` mapping: `select_content`, `generate_lead`, `sign_up`, `begin_checkout`, `add_payment_info`, and `purchase`.

Validation:

- GA4 Admin API list succeeded with read access for `cloudstartlabs-service-acc@coldstartlabs-auth.iam.gserviceaccount.com`.
- GA4 Admin API create attempts returned `403 PERMISSION_DENIED`, so the service account does not currently have permission to create key events.
- After GA4 Editor access was granted, `node ./.claude/skills/ga-analysis/scripts/ga4-key-events.cjs --create` created all nine internal SEO funnel key events and the five missing emitted GA4 key events successfully. `purchase` was already present.
- Focused analytics test passed: `yarn test:unit tests/unit/analytics/analytics-fixes.unit.spec.ts`.

Follow-up:

- Validate one fresh organic journey through landing page, auth, upload, checkout, and purchase after GA4 has processed new events.

### Production SEO Verification: Redirects + Locale Sitemap

Source: [seo-growth-skills-report-2026-05-13.md](../reports/seo-growth-skills-report-2026-05-13.md)

Changes:

- Verified production redirects for deprecated cannibalizing blog URLs instead of adding duplicate redirect work.
- Verified production `sitemap-static.xml` contains `/de`, `/es`, `/fr`, `/it`, `/ja`, and `/pt`.

Validation:

- `https://myimageupscaler.com/blog/photo-enhancement-upscaling-vs-quality` returns `308` to `/blog/ai-image-upscaling-vs-sharpening-explained`.
- `https://myimageupscaler.com/blog/best-free-ai-image-upscaler-tools-2026` returns `308` to `/blog/best-free-ai-image-upscaler-2026-tested-compared`.
- `https://myimageupscaler.com/blog/best-image-upscaling-tools-2026` returns `308` to `/blog/best-free-ai-image-upscaler-2026-tested-compared`.
- `https://myimageupscaler.com/sitemap-static.xml` includes all six localized homepage URLs.
- GSC URL Inspection for `https://myimageupscaler.com/it` reports `PASS`, `Submitted and indexed`, `INDEXING_ALLOWED`, Google canonical `https://myimageupscaler.com/it`, and sitemap `https://myimageupscaler.com/sitemap.xml`.

Follow-up:

- Complete the request-indexing backlog for recently refreshed blog URLs after the next content/deploy cycle.

### Blog Growth Maintenance: Opportunities + Performance Monitor

Source: [blog-opportunities-publisher-2026-05-13.md](../reports/blog-opportunities-publisher-2026-05-13.md), [blog-performance-recovery-2026-05-13.md](../reports/blog-performance-recovery-2026-05-13.md)

Changes:

- Ran the blog opportunities publisher against 90-day GSC data through 2026-05-10 and selected no new publish because candidates either duplicate existing canonical posts or lack enough evidence.
- Ran the blog performance monitor against the default 14-day comparison window for blog URLs.
- Confirmed performance alerts remain concentrated in best-free-upscaler, sharpener/enhancer, no-watermark, and upscaling-vs-sharpening clusters.

Validation:

- GSC exports completed for 90-day opportunity discovery and 14-day blog monitoring.
- Anti-cannibalization gate prevented duplicate publishing for existing canonical blog intents.

Follow-up:

- Request indexing for the existing GSC backlog URLs and re-run after 2026-05-16 to 2026-05-19, when GSC can reflect May 12 blog changes.

## 2026-05-12

### Blog Quality Monitor: Default 14-Day Visibility Check

Source: [blog-performance-recovery-2026-05-12.md](../reports/blog-performance-recovery-2026-05-12.md)

Changes:

- Ran the blog performance monitor against GSC complete data through 2026-05-09.
- Compared 2026-04-12 to 2026-04-25 against 2026-04-26 to 2026-05-09 for blog URLs only.
- Confirmed the largest losses are concentrated in the best-free-upscaler, sharpener/enhancer, no-watermark, and upscaling-vs-sharpening clusters.
- Deferred further same-day content edits because the top affected page was already refreshed on 2026-05-12 and GSC cannot measure that change yet.

Follow-up:

- Deploy the blog API revalidation patch, request indexing for the existing Priority 1 blog URLs, and rerun the monitor after 2026-05-16.

### Traffic Growth Plan: GA4 SEO Funnel Key Events

Source: [traffic-growth-plan-2026-05-12.md](../reports/traffic-growth-plan-2026-05-12.md)

Changes:

- Started Priority 1 from the May 12 traffic growth plan by expanding GA4 event mapping and conversion/key-event candidates for the SEO funnel.
- Centralized browser GA4 event naming on the shared `GA4_EVENT_MAP` so client and server analytics do not drift.
- Covered upload, upscale, signup, checkout, and purchase milestones used to diagnose Organic Search conversion attribution.
- Implemented the Priority 6 sitemap policy decision in the live sitemap structure validator: English-only pSEO sitemaps now require only `en` and `x-default` hreflang entries, while localized sitemaps still require all supported locales.
- Refreshed the Supabase-backed `best-free-ai-image-upscaler-2026-tested-compared` post with May 12 Three Kings/modifier work: first sentence, short-answer block, comparison table, FAQs, canonical sharpening guide link, and metadata.
- Completed the Priority 8 metadata backlog: unpublished `sample-article-title-for-testing` to draft and expanded Supabase SEO descriptions for `ai-upscaler-muryou-osusume`, `old-damaged-photos`, `photo-noise-reduce`, `fixing-pixelated-photos`, `how-to-enlarge-photo-without-losing-quality`, and `free-photo-restoration-app`.

Validation:

- Focused unit test passed: `yarn test:unit tests/unit/analytics/analytics-fixes.unit.spec.ts`.
- Focused unit test passed: `yarn test:unit tests/unit/seo/sitemap-structure-validator.unit.spec.ts`.
- Blog API refetch confirmed updated Supabase content and metadata for `best-free-ai-image-upscaler-2026-tested-compared`.
- Blog API refetch confirmed `sample-article-title-for-testing` is draft and all six refreshed metadata records have SEO descriptions of at least 120 characters.

Follow-up:

- After deploy, confirm the matching events are marked as GA4 key events and verify Organic Search conversions no longer remain at 0 while conversions are reported as `Unassigned`.
- Request indexing for `https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared` after the next deploy or content publish cycle.
- Request indexing after the next deploy/content publish cycle for the six metadata-refreshed published posts.

## 2026-05-06

### SEO Next Steps Execution: Batch 1 CTR Refresh, Attribution, Sitemap

Source: [seo-next-steps-2026-05-05.md](../reports/seo-next-steps-2026-05-05.md)

Changes:

- Refreshed 5 database-backed blog posts with Three Kings updates: title/SEO title, H1, and first paragraph.
- Added featured-snippet support to `ai-image-upscaling-vs-sharpening-explained`: answer block, comparison table, FAQ, and internal tool links.
- Added first-touch attribution fields to client analytics events so high-intent events retain source context after redirects.
- Mapped `upscale_completed` to GA4 `generate_lead`.
- Added non-English locale homepages to `sitemap-static.xml`, including `/it`.
- Created [GSC request indexing backlog](./gsc-request-indexing-backlog.md).

Validation:

- Focused tests passed: `tests/unit/seo/seo-next-steps-blog-refresh.unit.spec.ts`, `tests/unit/seo/homepage-locale-links.unit.spec.ts`, `tests/unit/analytics/analytics-fixes.unit.spec.ts`.
- `yarn verify` passed with existing warnings.
- IndexNow accepted 6 URLs.
- Search Console API sitemap resubmission succeeded with `204`.
- GSC URL Inspection API showed the 5 refreshed blog posts as `Submitted and indexed`.
- GSC URL Inspection API showed `/it` as indexed but with no referring sitemap before deploy.

Follow-up:

- Manually request indexing in GSC after deploy for URLs in [GSC request indexing backlog](./gsc-request-indexing-backlog.md).
- Confirm `/it` gets sitemap association after deploy.

## April 2026 Rollup

### Late April: Analytics + SEO Reporting Foundation

Related commits: `a48521c4`, `69fa5d26`, `ab773797`, `f7009f7e`

Changes:

- Added GA4/Amplitude provider split and analytics multiplexer.
- Added SEO report for 2026-04-25 and content gap report for the high-impression `best-free-ai-image-upscaler-2026-tested-compared` page.
- Updated blog content tracking and blog changelog discipline.
- Added content-gap skill/reporting workflow.

Why it mattered:

- Created a clearer connection between SEO traffic, behavior, and conversion attribution.
- Established evidence for the May 2026 Batch 1 CTR refresh.

### 2026-04-23: pSEO Expansion + Sitemap Coverage + CTR Planning

Related commits: `0522dd3b`, `46e2ea01`, `657401e5`, `41337187`, `5746e0cb`, `37907518`, `81621be0`

Changes:

- Added FormatConverter pSEO pages and tests.
- Added expanded comparison, technical guide, and persona sitemap coverage.
- Added AI Photo Editor hub page and metadata handling.
- Added PRD for SEO CTR quick wins and tools enhancement.
- Consolidated 6 cannibalizing blog URLs with 301 redirects and sitemap exclusions.
- Added GA4 analysis skill for SEO-focused reporting.

Why it mattered:

- Improved sitemap completeness for new pSEO surfaces.
- Reduced duplicate/cannibalizing blog URLs.
- Set up the next CTR improvement workstream.

### Mid April: Blog SERP Validation + 3-Kings Sitemap

Related commits: `9891f9be`, `30242052`, `fe795b60`

Changes:

- Added blog CTR audit report for 2026-04-15.
- Added SERP length validation for blog SEO title/description fields.
- Added 3-Kings sitemap route tests.
- Added hreflang/data-aware SEO tests and cannibalization coverage.

Why it mattered:

- Made SEO metadata changes testable.
- Added infrastructure to keep ranking-opportunity pages discoverable and internally prioritized.

### Early April: Blog Cannibalization + CTR Fixes

Related commits: `8e6bfe8c`, `d4e18873`, `f2d8fc64`

Changes:

- Added blog changelog discipline and wired content skills to it.
- Fixed blog cannibalization with redirects/unpublishing duplicate intent posts.
- Added blog CTR metadata tests, blog sitemap tests, cannibalization redirect tests, and tool metadata tests.

Why it mattered:

- Reduced ranking-signal dilution across overlapping blog posts.
- Established the pattern that SEO changes need regression tests.

## March 2026 Rollup

### Late March: Schema, Referral, and 3-Kings Tracking

Related commits: `7854c880`, `e6380caf`, `5e166033`, `0b08c682`

Changes:

- Added referral classification, robots, and schema generator tests.
- Added 3-Kings refresh report for 2026-03-25.
- Updated schema generator and metadata factory for pricing/copy/regional free-credit changes.

Why it mattered:

- Improved AI/search attribution visibility.
- Created historical baseline for blog CTR and 3-Kings refresh work.
