# SEO Changes Backlog

Purpose: keep a concise operational trail of SEO changes so future audits can connect ranking, indexing, CTR, and attribution movement to actual site changes.

Maintenance rules:

- Add an entry every time SEO-facing code, metadata, content, sitemap, schema, canonical, hreflang, robots, redirects, IndexNow, GSC, GA4 attribution, pSEO data, or blog SEO changes.
- Keep entries short: what changed, why, files/surfaces touched, validation, and follow-up.
- Keep the last ~3 weeks in full detail. Roll older entries into one monthly rollup (newest month first) when the file passes ~80 KB. See the `seo-changes-backlog` skill for the rollup recipe.
- Full pre-rollup detail for 2026-05 → 2026-10-19 stays in git: `git show 3bdb8f1e:docs/SEO/maintenance/seo-changes-backlog.md`.
- Link related reports, PRDs, or follow-up backlog files instead of pasting long analysis.

## 2026-11-21

### Blog contextual links to intent-owning tool pages

- **Why:** Route blog traffic to the tool or alternative page that owns the intent (PRD-TR-2026-11-02 AC-4) without editing Supabase blog content.
- **Changes:** New `getBlogContextualToolLinks` maps a post slug through an ordered rule list (background/transparent/cutout → remove-bg + make-image-transparent; adobe/photoshop → vs-adobe-express; image-upscaler-8x → ai-image-upscaler; upscale/resolution/enlarge → homepage), max 2 links, with 4 open experiment slugs excluded. Blog post page renders a server-only "Try it" box after the article body and before related posts.
- **Files:** `lib/seo/blog-tool-links.ts`, `app/[locale]/blog/[slug]/page.tsx`, `tests/unit/seo/internal-links-funnel.unit.spec.ts`.
- **Validation:** `tests/unit/seo/internal-links-funnel.unit.spec.ts` 10/10; full `tests/unit/seo/` 1,722/1,722 pass; `tsc --noEmit` clean.
- **Follow-up:** Read back outbound click and tool-page sessions from the 4 mapped blog clusters after 14 days.

### Index-bloat consolidation — 66 blog 301s, 14 noindex, list filtering

- **Why:** Execute the Phase 2 dispositions in the 2026-11-21 index-bloat manifest so duplicate-intent posts stop competing and zero-demand posts leave the index.
- **Changes:** Generated `shared/constants/blog-consolidation.json` from the manifest (reproducible with `node scripts/seo/audit-index-bloat.cjs --emit-consolidation`); appended plain and locale-prefixed 301s in `next.config.js`; unioned redirect and noindex slugs into `BLOCKED_BLOG_SLUGS`; noindexed the 14 consolidation slugs in blog post metadata (follow stays true); filtered blocked slugs from `getAllPublishedPosts` and `server/blog.getPostsBySlugs`, keeping single-post reads available.
- **Files:** `shared/constants/blog-consolidation.json`, `shared/constants/blocked-blog-slugs.ts`, `next.config.js`, `app/[locale]/blog/[slug]/page.tsx`, `server/services/blog.service.ts`, `server/blog.ts`, `scripts/seo/audit-index-bloat.cjs`, `scripts/seo/blog-indexation-report.ts`.
- **Validation:** new RED-first assertions for redirect parity, no chains, guarded targets, blocked sets, noindex helper and list filtering; `tests/unit/seo/` 1,710/1,710 pass; `tsc --noEmit` clean.
- **Follow-up:** After deploy, confirm 301 responses for the 66 sources and `noindex` on the 14 rendered posts in GSC URL Inspection.

### SERP snippet repair for 5 pSEO pages and plain-link llms.txt

- **Why:** Remove broken English and false promises from high-impression snippets, and align llms.txt with real product facts.
- **Changes:** Rewrote `vs-iloveimg` title to "AI Upscaling Compared (2026)"; made `vs-adobe-express` meta description and intro open with an at-a-glance limits summary (limited free features vs. free credits for AI detail recovery), keeping the "Adobe Express image upscaler" keyword; rewrote `make-image-transparent`, `remove-bg`, and `image-cutout-tool` titles/descriptions around verified free, no-signup, no-watermark, in-browser processing; added free/account and upload FAQs to `make-image-transparent` and `image-cutout-tool`; removed every `utm_source=chatgpt` suffix from `/llms.txt`, corrected the max scale to 8x (`MODEL_COSTS.MAX_SCALE_PREMIUM`), and added a "Free Tools (No Signup)" list.
- **Files:** `app/seo/data/alternatives.json`, `app/seo/data/tools.json`, `app/seo/data/interactive-tools.json`, `app/llms.txt/route.ts`.
- **Validation:** new RED-first assertions in `tests/unit/seo/llms-txt.unit.spec.ts` and `tests/unit/seo/pseo-alternatives-quality.unit.spec.ts`; full `tests/unit/seo/` suite 1,663/1,663 pass.
- **Follow-up:** Read back GSC CTR for the 5 URLs after 14 complete days.

### Squash `release/miu-recovery-20261101` onto `master` (local, awaiting deploy)

- **Why:** Reconciled and landed the remaining unshipped Nov 1 recovery commits on `master` alongside Nov 2–19 cache, sitemap, and `fetchPriority` work so the next production deploy ships all pending SEO, attribution, and static-caching fixes together.
- **Changes landed:**
  1. **Homepage King-3 subhead (`locales/en/common.json`):** English `heroSubtitle` `"Upscale images to 4K in seconds."` and `heroDescription` `"AI image upscaler that"` (title, H1, CTA, region-tiered free offer, and other locales unchanged; Oct 22–Nov 18 baseline for `image upscaler` on `/`: `416` clicks / `18,989` imp / `2.19%` CTR / pos `9.9`).
  2. **GA4 organic `sign_up` attribution & auth race hardening (`app/api/users/setup/route.ts`, `client/analytics/signup-conversion.ts`, `client/components/analytics/AnalyticsProvider.tsx`, `client/utils/account-setup.ts`, `shared/analytics/types.ts`):** `sanitizeGa4Params` strips `null`/`undefined`; `/api/users/setup` extracts verified JWT provider and new-account signal; browser emits `signup_completed` → GA4 `sign_up` once bound to account owner without delaying redirect.
  3. **Static pSEO/homepage caching (`app/(pseo)/**`, `app/[locale]/page.tsx`, `app/[locale]/blog/[slug]/page.tsx`, `open-next.config.ts`, `public/\_headers`):** `revalidate = false` on 29 static pSEO/homepage routes (`604800`on`/blog/[slug]`), `defaultLongLivedTtlSec: 2592000`in`open-next.config.ts`(preserving Nov 13 non-blocking DO queue & direct cache purge), immutable`Cache-Control`on`/\_next/static/\*`.
  4. **E2E guard (`tests/e2e/pseo-new-categories.e2e.spec.ts`, `tests/e2e/landing-page-seo.e2e.spec.ts`):** HTTP hub-link checks + King-3 hero/cache unit test coverage.
- **Follow-up (post-deploy):** Deploy `master` (also ships Nov 16 `6f9e1a46` LCP `fetchPriority="high"` + 2× navbar logo), confirm GA4 `sign_up` within 48h, run `node scripts/perf/psi-profile.mjs https://myimageupscaler.com/` (`LCP ≤ 2.5s`), manually request indexing for `/`, and read back `image upscaler` after 14 complete GSC days. See [2026-11-21 traffic recovery report](../reports/2026-11-21-traffic-recovery-report.md) and [traffic-recovery-2026-11 PRD suite](../../PRDs/seo/traffic-recovery-2026-11/README.md).

## 2026-11-19

### Three Kings — public-exposure blockers cleared; Photoshop post-repair crawl resolved

- **Final evidence/control plane:** refreshed live final GSC **Jul 19–Nov 15**, three-day holdback/excluded current day, 120 site days / all 12 ledger URLs. **0 EDIT_NOW / 0 REGRESSION / 2 HOLD / 4 GATED / 1 STOP / 5 VERDICT / 0 NO_DATA**; no new closed experiment outcome. No eligible content write or rollback; completed ladders remain closed. Text/tool healthy-CTR, best-ai position-band, restoration junk-position and pixelated STOP gates respected; TikTok window still open.
- **Public reconciliation, not another edit:** `https://myimageupscaler.com/blog/topaz-labs-free-trial` authenticated content SHA256 remains `a9fa46705fe9ea9c4c7c9c4301ab1b76f1bddead8b30149d6eedd685c6df199b`, API updated_at `2026-11-16T16:21:29.640128+00:00`; normal rendered article now exposes the direct answer/full official-source module/refund guidance outside scripts/RSC. Preserve Nov 16 dbEditDate, exact prior body, backup and rung 3; first confirmed exposure conservatively anchors date/lastEdit **Nov 19**, requiring **Nov 20–Dec 3** complete GSC days, earliest final-data verdict **2026-12-07**. `https://myimageupscaler.com/blog/photoshop-upscale-image` API hash remains `9d9b92103fc566f838b221d065ac527a30825f0e2212a762ad88d6a0fa0132d2`, updated_at `2026-11-16T17:37:03.466358+00:00`; all **5/5** first-screen method jumps now match real heading IDs, three old dead targets absent. Both normal URLs **200 / one self-canonical / index-follow**; no cache-buster, new PATCH, purge or deployment. This clears delivery, not proof of traffic lift or purge effectiveness/earlier exposure.
- **Indexing/sitemaps:** Photoshop existing row **API-resolved, not a manual request**, successful post-repair crawl **2026-11-19T12:24:21Z**, Submitted and indexed / fetch successful / indexing allowed / matching Google/user canonicals. Topaz remains pending because Nov 19 inspection's **2026-11-07T19:47:30Z** crawl predates the write. Native browser timed out twice despite successful CLI connectivity; no fallback bypass or manual request claimed. Existing rows updated in place, **8→7 unique pending / 143 unique checkbox rows**, Sep 4 Photoshop accepted-request history retained. Seven Nov 16 sitemap submissions now **7/7 downloaded, isPending: false, errors/warnings 0**; lastDownloaded Nov 16 17:48:06.924Z–17:48:12.800Z. Processing follow-up closed without resubmitting; no per-URL indexing inference.
- **Safety/verification/persistence:** no production write, so no fresh backup required or claimed. Original Topaz/Photoshop pairs `backups/backup_2026-11-16_{09-18-37,10-34-45}.{schema,data}.sql.gz` remain listed by `yarn db:backups` and all four pass `gzip -t`. Ledger, blog changelog, canonical indexing/SEO backlogs updated; four new exposure/state tests proved RED before reconciliation, then GREEN. **1,658/1,658 SEO unit tests** pass; `yarn verify` passes (TypeScript, ICU, schema, indexation, 17 cache-config tests; 0 lint errors / 1,832 existing warnings). Required aggregate `yarn test <affected paths>` passed **228 API tests / 32 skipped**, then reached the **300-second E2E cap (exit 124)**; full E2E/aggregate green is not claimed. Historical rollback dates and rung-2 LOSS wording retained in the existing Topaz indexing row; no tests weakened to force stale state. Scoped diff check passes. Repository-only bookkeeping, no push/deploy; unrelated changes preserved.
- **Next:** Topaz post-write crawl follow-up **Nov 23**; next eligible final-data experiment review **Nov 27, 2026** (TikTok Nov 10–23). Topaz verdict **Dec 7**, never from the unexposed Nov 16 DB date. No new rung before the respective full windows; no repeat indexing request without evidence.

## 2026-11-16

### Homepage mobile CWV — LCP fetch priority + navbar logo 2x candidate

- **Signal:** PSI mobile `https://myimageupscaler.com/` (2026-11-16): Performance 84, LCP 3.8s with **2,403ms resource load delay**; `lcp-discovery-insight` (no `fetchpriority`) and `image-size-responsive` (Best Practices 96) failing.
- **Root cause:** Next 16.0.11 `priority` only emits a preload link, it no longer sets `fetchpriority="high"` (`next/dist/shared/lib/get-img-props.js`). The hero "after" image therefore loaded at Low priority behind CSS/fonts/scripts. The mobile navbar `<picture>` served a single 100px compact candidate (91×32 CSS px at DPR 1.75) with no 2x.
- **Change:** `fetchPriority="high"` next to `priority` in `client/components/landing/HeroSection.tsx` and `client/components/blog/BlogFeaturedImage.tsx`; the hero "before" image stays preload-only so the LCP image wins. `client/components/navigation/NavBar.tsx` now serves `1x/2x` CDN candidates (compact 100/200, full 200/400) via `srcSet`.
- **Tests:** new `tests/unit/seo/mobile-psi-lcp-hints.unit.spec.ts` (RED 3 → GREEN); `tests/e2e/homepage-performance.e2e.spec.ts` asserts the fetchpriority preload/`<img>` and, at DPR 2, the 2x logo candidate (RED without the `srcSet` → GREEN 3/3); `tests/unit/blog/blog-featured-image.unit.spec.ts` extended. `yarn verify` passes.
- **Follow-up:** AC-5 is post-deploy — re-run `node scripts/perf/psi-profile.mjs https://myimageupscaler.com/` and confirm LCP ≤ 2.5s plus those two insights passing. Legacy-JS chunk `3794` is recorded won't-fix in `docs/PRDs/platform/homepage-mobile-pagespeed-fixes.md` (Next's own polyfill module).

### Blog growth operator — seven live sitemap resubmissions completed; Photoshop jump repair API-saved, public HOLD

- **Governing state/evidence:** read Nov 2/Oct 26 cron outputs, canonical backlogs/changelog, Nov 1 report and affected git history before acting. Today's newer Three Kings state (0 EDIT_NOW / 0 REGRESSION; Topaz public-exposure HOLD and TikTok Nov 27 gate) governs, not the old cron's pending counts/indexing advice. Fresh GSC Oct 17–Nov 13 vs Sep 19–Oct 16 is complete (zero failed requests; query click coverage 50.82%): named non-brand clicks 2,387→1,655, branded 176→133, privacy-hidden 2,176→1,730. GA4 Organic Search Oct 19–Nov 15 vs Sep 21–Oct 18 sessions 5,350→4,065; not signup counts. No forced CTR experiment or duplicate-intent post. Photoshop guide has 22→30 clicks / 4,558→6,956 impressions, position 6.86→6.29; GA4 27→37 organic sessions. Chosen class B is confirmed broken navigation, not an invented explanation of traffic loss.
- **Completed class E/live action:** reconciled the Nov 2 sitemap follow-up against all seven current sitemap GETs and eight page GETs. The three still-noindex URLs (`/compare/midjourney-vs-stable-diffusion`, `/es/alternatives/vs-imgupscaler`, `/fr/alternatives/vs-adobe-express`) are absent from `<loc>`. The five Adobe Express locales `es,pt,de,it,ja` are now 200/self-canonical/index-follow and remain correctly submitted; do not remove restored indexable pages using stale Nov 2 evidence. All actual localized category hubs and the indexable English owner remain. Submitted `/sitemap-compare.xml` and `/sitemap-alternatives-{es,pt,de,fr,it,ja}.xml`: **7/7 GSC PUT 204**, exact-target **7/7 GET 200**, `lastSubmitted` **17:48:04.920Z–17:48:06.134Z on Nov 16**, errors/warnings 0, `isPending: true`. Submission accepted, processing/indexing not proven; no URL Inspection Request indexing claimed. No robots or sitemap code changed in this run.
- **Class B/API action and blocker:** on `/blog/photoshop-upscale-image`, normal rendered HTML proves three of five first-screen jump links target nonexistent IDs. Changed only those Neural Filters/batch/print fragment destinations to existing headings, with visible labels/headings/all other text/metadata/media/CTAs unchanged. Fresh `yarn db:backup` pair `backups/backup_2026-11-16_10-34-45.{schema,data}.sql.gz` passed test extraction/byte comparison, `yarn db:backups` and `gzip -t` before PATCH 200 at **2026-11-16T17:37:03.466358+00:00**. Authenticated GET exactly matches body SHA256 `9d9b92103fc566f838b221d065ac527a30825f0e2212a762ad88d6a0fa0132d2`; prior hash `c8eff25b547c78fe2f3e5af8f54e75941f1d98e5b421a177555b63e4fb761d32`, reversible three-string mapping in `scripts/seo/photoshop-jump-links.cjs`. Only content/automatic reading_time (14→15 min)/updated_at differ. Matching API fragments against real unchanged public heading IDs gives **2/5→5/5 valid**, but **four normal public GETs still serve old targets** (200/one self-canonical/index-follow). Public repair is incomplete, not a live navigation or traffic win. No repeat PATCH/purge/deploy to force it; shared invalidation diagnosis remains open.
- **Tests/state/commit:** **1,651/1,651 SEO unit tests**, including five new guarded/idempotent/content-only repair tests, pass; `yarn verify` passes (0 lint errors / 1,832 existing warnings). Required aggregate `yarn test <affected path>` passes 228 API tests / 32 skipped, then reaches the 300-second E2E cap; full E2E green is not claimed. Change artifact/tests committed **`538a4738`**; the Sep 3 historical indexing guard now retains the accepted Sep 4 request while permitting only the evidence-backed Nov 16 public-HOLD reopening (RED after the state change, then GREEN), instead of forcing a stale checked box. Updated blog changelog plus both canonical backlogs, no dated report. Existing Photoshop row reopened once with public-HOLD gate and Sep 4 accepted-request history retained: **7→8 unique pending URLs, 143 unique rows**, no duplicates; no >10 queue alert. Unrelated dirty Reddit log preserved. Repository commits local-only; no push, deploy or runtime config change.
- **Exact next triggers:** **Nov 19, 2026** read the seven GSC sitemap records; investigate errors or pending processing rather than resubmitting blindly. Same date, check ordinary Photoshop and already-pending Topaz HTML before any further edit/indexing action; if still stale, fix/test the shared invalidation path and seek release authorization, not another content write. Photoshop indexing remains deferred until all five public jumps work; no new CTR-rung/measurement dates. Preserve TikTok's **Nov 27** final-data review. No traffic-lift claim.

### Three Kings — Topaz rung-3 saved; public HTML stale, measurement/indexing HOLD

- **Final evidence/verdicts:** live final GSC Jul 16–Nov 12, three-day holdback/excluded current day. Initial 1 EDIT_NOW / 0 REGRESSION / 1 HOLD / 4 GATED / 1 STOP / 5 VERDICT; final **0 EDIT_NOW / 0 REGRESSION / 2 HOLD / 4 GATED / 1 STOP / 5 VERDICT / 0 NO_DATA**, all 12 URLs. Newly closed outcomes: Oct 26 Topaz rollback **FLAT** (44→37 clicks/14d, adjusted 0.85), best-ai rollback **LOSS** (9→8, position +5.1), YouTube rollback **LOSS** (10→3, position +0.3), Oct 29 text description **FLAT** (7→7, adjusted 1.01). Rollback outcomes are diagnostic, never permission to reapply losing variants. Completed ladders remain closed; TikTok window remains open.
- **One eligible rung/API:** `https://myimageupscaler.com/blog/topaz-labs-free-trial`, rung 3 content-only direct answer and official Photo/Video/account/refund evidence table. Latest exact-canonical 14d windows 37/4,189→31/3,445 clicks/impressions, position 5.33→5.29, CTR 0.90%; no ≥40% stable-position demand collapse. Trial queries have one canonical owner (fragments excluded); preserve sibling video/denoise and free-comparison intent. Google SERP was a JS shell; no verified top-three/depth claim or broad expansion. All three linked primary-source docs fetched 200. Metadata, original remainder/CTAs/media/slug/status unchanged.
- **Safety/readback blocker:** fresh `backups/backup_2026-11-16_09-18-37.{schema,data}.sql.gz` exported through the Supabase CLI fallback, test-extracted/byte-compared, listed by `yarn db:backups`, and passed `gzip -t` before PATCH 200 at `2026-11-16T16:21:29.640128+00:00`. All older backup sets retained. GET verifies only content, automatic reading_time (13 min read), updated_at changed; SHA256 `a9fa46705fe9ea9c4c7c9c4301ab1b76f1bddead8b30149d6eedd685c6df199b`, exact previous body retained. **Normal public rendered article still serves old copy on three ordinary GETs**, 200 / one self-canonical / index-follow / cache HIT. Not live success: ledger `liveVerification.status=pending`, original DB date retained, measurement and indexing HOLD. No retry PATCH, cache-buster, site purge, deploy, new post or unrelated product change.
- **Canonical state/indexing:** ledger stores the four outcomes and reversible rung-3 anchor/backup/API hash. Blog changelog updated; existing Topaz row reopened in place as request-deferred, **6→7 unique pending URLs / 143 unique checkbox rows**. Nov 7 crawl predates this write. Fresh TikTok inspection confirms the already-recorded Nov 13 successful post-description crawl / Submitted and indexed / allowed / matching canonicals; row evidence clarified, no new request or measurement reset. Native browser timed out twice despite healthy CLI connectivity: no fallback bypass or manual request claimed. Historical tests now retain exact experiment dates/rollback records while allowing subsequent judged outcomes/rungs and evidence-backed API resolutions.
- **Verification/persistence:** payload and state tests RED→GREEN; **62/62 affected SEO tests and 1,646/1,646 full SEO unit tests pass**. `yarn verify` passes after final code changes (TypeScript, lint 0 errors / 1,832 existing warnings, ICU, schema, indexation, 17 cache-config tests). Required aggregate `yarn test <affected paths>` passed **228 API tests / 32 skipped**, then reached the **300-second cap in E2E**; full-suite/E2E green is not claimed. Final normal-HTML recheck still serves the old Topaz article; retain the explicit pending blocker. Scoped diff check passes; the pre-existing Reddit-log blank-EOF warning remains untouched and its SHA256 is identical to the start. Repository bookkeeping local-only, no push of unrelated commits. Older Oct 3–22 details consolidated below with raw recovery anchor `a9ed2715`.
- **Next:** reconcile Topaz normal rendered HTML **Nov 19, 2026**; after a match, preserve dbEditDate, anchor first confirmed exposure, require 14 complete post-exposure GSC days plus exporter holdback. No fixed Topaz verdict date before exposure. Next already-anchored final-data review **Nov 27, 2026** (TikTok Nov 10–23). Known Nov 13 blog-purge readback remains blocked by this real edit; no unrelated cache fix authorized here.

## 2026-11-13

### Blog — stop prefetching uncached /blog pages; pagination links skip the /en 301

- **Signal (measured, Lighthouse on a blog post):** 12 RSC prefetches per view, including `/blog` and `/blog?q=<tag|category>` at 0.8–1.8s Worker time each; `/blog` is `private, no-store`. `/en/blog?page=2` → 301 → `/blog?page=2`.
- **Change:** `prefetch={false}` on the post breadcrumb `/blog`, category and tag links (`app/[locale]/blog/[slug]/page.tsx`, `client/components/blog/BlogPostTags.tsx`); pagination hrefs use `getLocalizedPath('/blog', locale)` (`app/[locale]/blog/page.tsx`). Links stay crawlable `<a href>`.
- **Test:** `tests/unit/seo/blog-link-hygiene.unit.spec.ts` (RED 4 → GREEN).

### Blog sitemap — redirected slugs excluded, drift guard added

- **Signal (measured):** HEAD on all 316 `sitemap-blog.xml` URLs: 315 × 200, 1 × 308 (`/blog/best-ai-image-quality-enhancer` → `/blog/best-ai-image-enhancer`).
- **Root cause:** `next.config.js` blog redirects and `BLOCKED_BLOG_SLUGS` are separate lists. Added `best-ai-image-quality-enhancer` + `best-image-upscaling-tools-2026` to `shared/constants/blocked-blog-slugs.ts`.
- **Guard:** `tests/unit/seo/blog-redirects-blocked-from-sitemap.unit.spec.ts` parses every `source: '/blog/<slug>'` in `next.config.js` and requires it in the blocked set (RED without the fix → GREEN).

### CWV mobile LCP > 4s — stale ISR hits stop waiting on the revalidation Durable Object

- **Signal:** GSC CWV export 2026-11-13: 174 mobile URLs, "LCP longer than 4s", group LCP 4.5s (`/blog/poster-size-dimensions-pixels`). CrUX origin p75: **TTFB 3.3s**, FCP 4.2s, LCP 4.4s. The LCP image (preloaded) loads in ~0.5s, so server wait is the cause.
- **Root cause found:** OpenNext `cacheInterceptor` does `await queue.send()` on every STALE hit, and `doQueue.send` awaits a cross-region DO RPC. With `revalidate = 86400` and low per-page traffic, 11/30 random blog first visits were STALE: **0.97s vs 0.48s** TTFB for HIT.
- **Change:** `open-next.config.ts` wraps `doQueue` so `send` runs in `ctx.waitUntil` (fire-and-forget). Revalidation still runs; the response no longer waits for it. Test: `tests/unit/seo/opennext-cache-config.unit.spec.ts` (RED 3 fails on old config → GREEN 19/19 with interception suite).
- **Tag-cache follow-up (owner chose option 1):** each cache hit also made 1–2 `DOShardedTagCache` RPCs (183 tag calls / 108 page GETs in a 4-min tail; Asia cache-served wall p75 658ms at ~30ms CPU). `open-next.config.ts` now sets `bypassTagCacheOnCacheHit: true` + `cachePurge: purgeCache({ type: 'direct' })`, so `revalidatePath` purges regional HTML by cache-tag. Deploy wiring: `05-secrets.sh` uploads `CACHE_PURGE_API_TOKEN` + `CACHE_PURGE_ZONE_ID` (from `CLOUDFLARE_ZONE_ID`); `01-preflight.sh` probes purge-by-tag and blocks the deploy if it fails. Owner added Zone > Cache Purge to the existing `myimageupscaler.com` token on 2026-11-13; the purge-by-tag probe and `_check_cache_purge` now pass, and `CACHE_PURGE_API_TOKEN` defaults to `CLOUDFLARE_API_TOKEN` (424d99fa). Tests RED 2 → GREEN 46. Review fix: `cachePurge` flips the adapter default `shouldLazilyUpdateOnCacheHit` to false, which would leave other regions on an old copy for up to 24h after timed revalidation; it is now set to `true` explicitly (RED 1 → GREEN 23).
- **Pre-deploy speed proof (2026-11-13):** lab — real `cacheInterceptor` STALE hit with a 500ms DO stub: **503–507ms → 0–1ms** (old `doQueue` vs wrapper). Live A/B on `myimageupscaler-perf-preview` (same next build, two OpenNext bundles, 30 pSEO/home URLs × 5 rounds, all HIT, from YVR): TTFB **p50 55→42ms, p75 66→51ms, p90 83→71ms**; tag-DO calls **0.61→0.00 per GET**. YVR is near the DO, so per-RPC savings are small here; far regions save one cross-region RPC per hit (prod tail: DO-side wall p50 148ms, plus RTT) — projected, not measured.
- **Deployed 2026-11-13 19:37Z** (version `2dc88220`, rollback `f9e50230`; backup `backups/backup_2026-11-13_11-59-07.*`). Prod readback (YVR, measured): 30 blog URLs, round 1 right after deploy p50 507 / p90 801 ms (cold regional cache after the build change), round 2 p50 **70** / p75 94 / p90 133 ms, all `x-opennext-cache: HIT`; tail 0 exceptions. **Open:** blog hits still call `DOShardedTagCache.hasBeenRevalidated` ~2.6×/GET (10 warm GETs → 26 calls), unlike pSEO/home in the A/B (0). Blog pages take another cache path (not intercepted, or fetch/soft-tag checks); investigate before claiming the tag-DO win for /blog. Blog-edit purge readback still pending on the next real edit.
- **Readback:** after deploy, sample 30 blog first visits (STALE TTFB should match HIT; tail should show ~0 `DOShardedTagCache` events per cached GET); publish a blog edit and confirm the new title shows on the next request; CWV field data needs ~28 days (check ~2026-12-15).

## 2026-11-09

### Three Kings — TikTok rung-2 description applied and verified live

- **Final evidence/control plane:** refreshed final GSC **Jul 9–Nov 5**, retaining the three-day holdback/excluded current day. Initial **1 EDIT_NOW / 0 REGRESSION / 4 HOLD / 2 GATED / 1 STOP / 4 VERDICT / 0 NO_DATA**; final **0 EDIT_NOW / 0 REGRESSION / 5 HOLD / 2 GATED / 1 STOP / 4 VERDICT / 0 NO_DATA** across 12 URLs. Completed ladders stay closed. TikTok Oct 19 title test is **FLAT**: Oct 5–18 → Oct 20–Nov 2, **14/4,154 → 10/2,613 clicks/impressions**, position **8.03→8.00**, site ratio **0.89054**, exact adjusted ratio **0.80208** (rounded ledger 0.80 is just above the LOSS boundary). Not a lift/causation claim. Latest exact-page windows Oct 9–22 → Oct 23–Nov 5: **9/3,731 → 9/2,730**, position **7.98→8.00**, current CTR **0.33%**; no ≥40% stable-position demand gate. Four focused PFP/ideas queries have one canonical owner; fragment sitelinks are not competing posts. Google returned a JS shell, so no verified top-three/depth claim or body expansion.
- **One rung/live proof:** `https://myimageupscaler.com/blog/tiktok-profile-picture-ideas` changed only `seo_description` to **Explore 8 TikTok PFP ideas: headshots, anime avatars, neon designs, logos, and more. Choose a style and use crop and clarity tips to prepare your photo.** (152 chars), replacing the vague brand/click promise with existing article choices. PATCH **200**, `updated_at` **2026-11-09T16:19:55.531234+00:00**. Authenticated readback proves only seo_description/updated_at changed; field SHA256 `e2746a9f380b3eb77c089a135a21758a702a6e6e1751954feef1c527274c35e1`. Normal public HTML exactly matches: **200 / one self-canonical / index-follow**; title/H1, body/CTAs/media, hero description, slug/status unchanged. Body SHA256 remains `3f619d58bff5fc2f1aa1e19c7fc3385cb4823e5f271cd5eb7333b5e87067ab49`. No rollback, new post, deployment, purge or unrelated product change.
- **Safety/state:** before PATCH, fresh `yarn db:backup` exported schema/data via Supabase CLI fallback; `backups/backup_2026-11-09_09-17-02.{schema,data}.sql.gz` passed extraction/byte comparison, appeared in `yarn db:backups`, and passed `gzip -t`; all older sets retained. Ledger records rung 2, exact prior description, backup and verified exposure, preserving the original title history. Existing TikTok indexing row reopened once, **67→68 unique pending URLs**, oldest group **Aug 13: user attention required**; all 143 checkbox rows unique. Inspection reports Submitted and indexed / allowed / matching canonicals, but **Nov 4 21:13:35Z** crawl predates today's write. Native browser timed out twice; **no manual indexing request claimed**. Blog changelog updated; older Oct 12 detail compacted into its rollup with `e0ef9919` recovery anchor.
- **Verification/persistence:** payload and bookkeeping tests RED→GREEN. **1,631/1,631 SEO unit tests**, including all affected suites, pass; `yarn verify` passes (TypeScript, ICU, schema, indexation, 12 cache-config tests; 0 lint errors / 1,832 existing warnings). Historical rollback test now accepts a later evidence-backed reopening rather than forcing a stale checked box; original title/inspection dates remain asserted. Required aggregate `yarn test <affected paths>` passed **228 API / 32 skipped**, then hit the **300-second cap in E2E**; not full-suite green. Scoped diff check passes; unrelated production-error/Reddit logs preserved byte-for-byte. Local bookkeeping only; do not push/deploy the 24 pre-existing local commits.
- **Next gates:** post-write crawl inspection **Nov 12**; earliest program final-data review **Nov 13** for Oct 26 rollbacks/link, **Nov 16** for text. TikTok requires **14 complete GSC days Nov 10–23**, earliest conservative final-data review **Nov 27, 2026**. Preserve all HOLD/GATED/STOP states and exact previous values.

## 2026-11-05

### Three Kings — no eligible rung; text/YouTube post-change crawls API-resolved

- **Final evidence/control plane:** refreshed final GSC **Jul 5–Nov 1**, retaining the three-day holdback/excluded current day. All 12 rows: **0 EDIT_NOW / 0 REGRESSION / 5 HOLD / 2 GATED / 1 STOP / 4 VERDICT / 0 NO_DATA**. No newly closed experiment window; ledger remains byte-identical, preserving dates/rungs/outcomes/rollback anchors. Completed ladders stay closed without new evidence. No production blog write, rollback, new post, deletion, deployment or cache purge; no new backup required or claimed.
- **Live/indexing evidence:** authenticated API field/body hashes and original updated_at match the ledger for text, YouTube and TikTok; normal public HTML is **200 / one self-canonical / index-follow**, matching title/meta. Rendered YouTube article retains the bounded rollback and factual repairs, not script/RSC-only evidence. Existing text row **API-resolved**, successful post-Oct-29 description crawl **2026-11-04T11:13:45Z**; YouTube row **API-resolved**, successful post-Oct-26 rollback crawl **2026-11-03T09:37:41Z**. Both Submitted and indexed, indexing allowed, matching Google/user canonicals. Native browser preflight timed out twice; no fallback bypass or manual request claimed. **User attention required: 67 unique pending URLs (69−2), oldest group Aug 13**; all 143 checkbox URL rows remain unique. Changelog and indexing rows updated in place; no measurement reset.
- **Verification/persistence:** new evidence assertions RED (two pending rows)→GREEN; historical text-state guard now accepts only explicit qualifying post-write crawl evidence. **61/61 affected unit tests; 1,626/1,626 SEO tests** pass. `yarn verify` passes (TypeScript, ICU, schema, indexation, 12 cache-config tests; 0 lint errors / 1,832 existing warnings). Required aggregate `yarn test <affected paths>` passed **228 API / 32 skipped**, then hit the **300-second cap during E2E**; full-suite/E2E green is not claimed. Scoped diff check passes. Unrelated dirty production-error/Reddit logs preserved byte-for-byte; bookkeeping stays local, no push of the 23 pre-existing local commits.
- **Next gates:** **Nov 6, 2026** TikTok title review once all Oct 20–Nov 2 days enter the final export; **Nov 13** Oct 26 rollbacks/link (Oct 27–Nov 9); **Nov 16** text (Oct 30–Nov 12). Post-change indexing evidence does not shorten these windows. Remaining manual queue stays with the existing indexing operator; the separate Nov 2 sitemap-release follow-up is not a Three Kings content-edit authorization.

## 2026-11-02

### pSEO performance snapshot refreshed — unblocks deploy gate; 37 net pages pruned

- **Why:** `yarn seo:indexation:gate` blocked deploy: the report and `content/pseo-performance.json` passed the 35-day limit (Sep 28 → Nov 2). Refreshed with `yarn seo:sync:performance` (GSC 90-day window **2026-08-02 → 2026-10-30**, 472 pages, indexation **66.95%**, `seo-reports/indexation-2026-10-30.md`). The gate passes because the diff adds no pSEO rows.
- **Effect:** pruned pages (noindex,follow + sitemap removal) **107 → 144** (73 newly pruned, 36 restored). Decision (Opus 5.5 review, João delegated): accept the real 90-day verdict, pin nothing. All 73 were English with a carried-over `impressions: 1` flag (not real counts); 57 have 0 impressions in 180 days; only 4 had 1–2 clicks. Groups: compare 23, tools 13, platform-format 11, use-cases-expanded 8. A longer window changes the count but keeps the same 0–5 impression tail.
- **Do not read as a decline:** the 76.06% → 66.95% drop mostly removes the inflated flag baseline. The refresh lost 23.4% of earning pages (guard limit 25%).
- **Tests:** 8 tests that hard-coded pruned pages now pick fixtures from the snapshot (`page-eligibility`, `pruned-page-signals`, `sitemap-noindex-parity` uses `vs-fotor` as pruned control); the duplicate-row merge test uses a mocked snapshot.
- **Rollback:** `git revert` the commit and deploy. **Readback 2026-11-30:** recheck the 4 click-earning pruned pages (`ai-sharpness-enhancement-upscaler`, `tiff-upscale-4x`, `free-ai-photo-enhancer`, `free-background-remover`) and total organic clicks. Pruning is one-way, since a noindexed page cannot earn impressions.
- **Note:** prod `myimageupscaler-api-prod` and local `.env.api` GSC keys fail with `invalid_grant`; the refresh used the `gsc-analysis` service-account key. Rotate before the next monthly refresh.

### Blog growth operator — eight sitemap/noindex conflicts fixed; deployment pending

- **Governing state:** read the Oct 26/19 cron outputs, canonical backlogs/changelog, Nov 1 GSC report and affected-file history. Today's newer Three Kings entry governs: 0 EDIT_NOW / 0 REGRESSION / 5 HOLD / 2 GATED / 1 STOP / 4 VERDICT. Preserve Nov 6/13/16 experiment gates; the print source is already API-resolved, so the older cron's manual-indexing recommendation is superseded. Class A's additional enlarger candidate has 8 clicks / 1,724 impressions / position 10.08 but API `updated_at` Oct 22, so no overlapping rewrite; its earliest 14-complete-day final-data review is Nov 9. No new distinct-intent post or repeated link experiment was justified. Selected the concrete class B issue already recorded Nov 1.
- **Fresh evidence:** GSC Oct 3–30 vs Sep 5–Oct 2 export is complete (zero failed requests; query click coverage 50.48%): named non-brand clicks 2,545→1,813, branded 353→152, privacy-hidden 2,543→1,928. GA4 Organic Search Oct 5–Nov 1 vs Sep 7–Oct 4 sessions 6,362→4,321 (−32.08%); these are not signup counts. Normal public GETs prove all eight affected pages return 200 / self-canonical / noindex while present as submitted `<loc>` entries in seven live sitemaps. These eight URLs have no exact-page clicks/impressions in this export; the cleanup is not claimed to explain or reverse the traffic decline.
- **Action/code:** commit `af9cc7f062335146e14314f8ca80a52ae6674068` (`fix(seo): exclude eight noindex sitemap submissions`). Shared direct/locale eligibility now rejects explicit `noindex` even for pinned/fresh pages. The six alternatives locale routes load their actual translated records, not English dates/slug inventory. Real route GETs remove `/compare/midjourney-vs-stable-diffusion`, `/es/alternatives/vs-imgupscaler`, and `/{es,pt,de,fr,it,ja}/alternatives/vs-adobe-express` from submitted `<loc>` output; all category hubs and the indexable English Adobe Express owner remain. Files: `lib/seo/{data-loader,page-eligibility,locale-sitemap-handler}.ts`, six `app/sitemap-alternatives-*.xml/route.ts`, new `tests/unit/seo/sitemap-noindex-parity.unit.spec.ts`. No robots/canonical/content/product-offer changes, production DB write or new backup needed.
- **Verification:** new regression suite RED (9 failures), then GREEN; final 48/48 focused tests pass, including indexing-state guards. Entire SEO unit directory: 1,622 passed / 2 failed; both failures are pre-existing stale indexing-backlog assertions (`topaz-free-trial-snippet` still requires an unresolved row; `three-kings-2026-09-24` rejects the newer “successful post-rollback crawl” wording). Both test files and their backlog input were byte-identical to HEAD before this run's backlog annotation; do not undo evidence-backed indexing resolutions to appease them. `yarn verify` passes (0 lint errors / 1,832 existing warnings). Required aggregate `yarn test <affected paths>` passed 228 API tests / 32 skipped, then exceeded the 300-second cap in E2E; full-suite green is not claimed. Scoped diff check passes; concurrent Reddit log preserved.
- **Canonical state/deploy/trigger:** indexing backlog annotated in place with this non-indexing cleanup; 69 unique pending URLs remain (oldest Aug 13), no duplicate rows or manual requests. Blog changelog unchanged because no post changed. **Local-only code; no push/deploy/cache purge. The eight live conflicts still exist until an authorized release includes this commit.** On the next authorized deploy, verify all seven affected sitemap GETs omit these eight `<loc>` URLs, retain the English owner/hubs, and confirm unchanged noindex pages; do not request indexing for these intentionally excluded URLs. Operational follow-up **Nov 5, 2026**: check deployment inclusion; if undeployed, carry this exact commit forward, not a new content experiment. Sitemap cleanup is not a traffic experiment; retain the independent blog gates above.

### Three Kings — closed-window outcomes recorded; two indexing rows API-resolved

- **Final evidence/verdicts:** refreshed final GSC Jul 2–Oct 29, retaining the three-day holdback/excluded current day. **0 EDIT_NOW / 0 REGRESSION / 5 HOLD / 2 GATED / 1 STOP / 4 VERDICT / 0 NO_DATA** across all 12 ledger URLs. No eligible production edit or rollback; no rung restart. No production write means no new backup required or claimed. No deployment, cache purge, new post, deletion or unrelated product change.
- **Closed outcomes, not causation claims:** `/blog/best-free-ai-image-upscaler-2026-tested-compared` Oct 13 recovery **FLAT**: Sep 29–Oct 12 → Oct 14–27, **103/3,892 → 78/4,176 clicks/impressions**, position **6.12→6.11**, other-site click ratio **0.81**, adjusted ratio **0.93**. The earlier >5% CTR line was a readback target, not an achieved result; the complete post-window CTR is **1.87%**. `/blog/best-image-upscaler` Oct 15 final-copy exposure **WIN**: Oct 1–14 → Oct 16–29, **9/2,701 → 10/2,896**, position **10.00→8.31**, market ratio **0.81**, adjusted **1.38**. Low-volume policy WIN; raw clicks do not show a 38% gain. Ledger stores both outcomes and preserves original rungs, dates and rollback anchors; Topaz Video/poster retain prior FLAT judgments.
- **Readback/indexing:** authenticated GETs plus normal public HTML verified for flagship, best-image, text, best-ai, YouTube and print-resolution: **200 / one self-canonical / index-follow**, correct title/meta; relevant body hashes/modules/rollback removals and the followed print-format link verified outside script/RSC. Existing best-ai row **API-resolved**, successful post-Oct-26 rollback crawl **2026-11-01T12:58:39Z**; print-link row **API-resolved**, post-Oct-26 crawl **2026-10-27T16:07:15Z**. Both Submitted and indexed, indexing allowed, matching Google/user canonicals; **not manual requests**. Text Oct 28 and YouTube Oct 24 crawls still predate their writes and remain pending. Native browser preflight timed out twice despite successful CLI connectivity; no bypass or GSC request claimed. **User attention required: 69 unique pending URLs (71−2), oldest group Aug 13**, no duplicate rows.
- **Verification/persistence:** new backlog evidence test RED before the two resolutions, then **52/52 affected SEO unit tests pass**. `yarn verify` passes (TypeScript, ICU, schema, indexation, 12 cache-config tests; 0 lint errors / 1,832 existing warnings). Required aggregate `yarn test <affected paths>` passed **228 API / 32 skipped**, then hit the **300-second cap during E2E**; full aggregate/E2E green is not claimed. Blog changelog and canonical backlogs updated. Scoped diff check passes. Repository bookkeeping remains local-only: do not push the 17 unrelated pre-existing local commits merely to persist these read-only API resolutions.
- **Next gates:** pending text/YouTube crawl follow-up **Nov 5**; earliest final-data experiment review **Nov 6** for TikTok (Oct 20–Nov 2), **Nov 13** for Oct 26 rollbacks/link (Oct 27–Nov 9), **Nov 16** for text (Oct 30–Nov 12). Completed rung-3 pages require new evidence before any ladder restart; preserve all HOLD/GATED/STOP states.

## 2026-11-01

### GSC analysis tooling — UI-only reports, click decomposition, completeness gate

- **Changed:** `gsc-fetch.cjs` adds retries, 16-month trend, freshness, click-change causes, position buckets, section/locale/device/country comparisons, anonymized traffic, sitemap coverage, `--inspect-sitemap`, `dataCompleteness` and `comparison.previousQuarantine`. New `gsc-ui-extract.cjs` reads UI-only reports from a signed-in GSC tab at `/u/1`. `ctr-tracker.cjs` no longer truncates at 1,000 rows. No site code, metadata or data changed.
- **Validation:** GSC unit specs 98/98. Real fetch on 2026-11-01: `dataCompleteness.complete` true, 748 sitemap URLs. Tests: `tests/unit/seo/gsc-analysis-gaps.unit.spec.ts`, `gsc-phantom-quarantine.unit.spec.ts`.
- **Baseline (Oct 2-29 vs Sep 4-Oct 1):** clicks 5,464→3,939. Impressions -17.3% raw, -10.9% without the Sep 24-26 `remove background` spike. Position ex-quarantine 10.76→11.65.
- **Ruled out:** locale clicks moved 236→155 (-81 of -1,525), so locale de-indexing does not explain the click loss.
- **Follow-ups, not fixed:** 8 URLs in live sitemaps serve `noindex` (`/compare/midjourney-vs-stable-diffusion`, `/es/alternatives/vs-imgupscaler`, 6 locale `vs-adobe-express` pages). GSC reports 139 mobile URLs Poor for LCP. 156 video pages are not indexed ("Video isn't on a watch page").

## 2026-10-29

### Three Kings — text-readability rung-2 description applied and verified live

- **Evidence/verdicts:** refreshed final GSC Jun 28–Oct 25 with the three-day holdback/excluded current day. Initial **1 EDIT_NOW / 6 HOLD / 2 GATED / 1 STOP / 2 VERDICT / 0 REGRESSION / 0 NO_DATA**; final **0 EDIT_NOW / 7 HOLD / 2 GATED / 1 STOP / 2 VERDICT / 0 REGRESSION / 0 NO_DATA**. Completed Topaz Video/poster ladders retain their measured FLAT results; no restart. Exact-canonical `/blog/text-image-enhancer`, Sep 28–Oct 11 → Oct 12–25: **10/430 → 9/1,098 clicks/impressions**, position **15.42 → 10.71**, current CTR **0.82%**. The improved rank rules out the stable-position demand gate; no edit-causation claim. Readability queries `how do i keep text sharp and readable in a image?` and `make image readable` have this URL as sole owner; generic enhancer terms still belong to `/blog/enhance-text-in-image`. Google's JS shell prevented a verified top-three comparison; no broad expansion was justified.
- **One authorized rung/live proof:** changed only `seo_description` on `https://myimageupscaler.com/blog/text-image-enhancer` to the 155-character crop/straighten/contrast/letter-review workflow, removing the old perfect-results promise. PATCH 200 at `2026-10-29T16:20:24.414992+00:00`; authenticated readback proves only seo_description/updated_at changed. Normal public meta exactly matches SHA256 `78521227d940e3f82b5bee461ee305503fa85a30c754c7003d61403accff6bcb`, **200 / one self-canonical / index-follow**. Body SHA256 unchanged `4c5bcb10e5f190b569636b57f2e3ef9019e58a01c0ae30e9bee6fca150fbe09a`; title/H1, other descriptions, media, CTAs, slug and status retained. No rollback, new post, cache purge, deployment or unrelated product change.
- **Backup/ledger:** fresh `yarn db:backup` succeeded via Supabase CLI fallback before the production PATCH; `backups/backup_2026-10-29_09-17-39.{schema,data}.sql.gz` passed extraction/byte comparison, appeared in `yarn db:backups`, and passed `gzip -t`. Prior backup sets preserved with process-local retention. Recorded rung 2, exact prior value, original DB date, backup pair and verified exposure in the ledger; blog changelog updated. Payload helper and tests protect the one-field patch and concurrent-edit/idempotence behavior.
- **Indexing/verification:** reopened the existing text row once; its Oct 28 crawl predates today's edit. Topaz trial rollback row **API-resolved, not manually requested**: Submitted and indexed, indexing allowed, successful post-Oct-26 crawl `2026-10-28T09:11:25Z`, matching canonicals and current live restored meta. Other rollback crawls predate their changes. Native browser timed out twice despite successful CLI connectivity, so no manual request claimed or bypass used. **User attention required: 71 unique pending URLs** (71 + 1 reopened − 1 resolved), oldest group Aug 13; zero duplicate URL rows. RED→GREEN; **70/70 affected unit tests** and `yarn verify` pass (0 lint errors / 1,832 existing warnings). Required aggregate `yarn test <affected paths>` passed **228 API / 32 skipped**, then hit its **300-second cap during E2E**; full aggregate/E2E green is not claimed. `git diff --check` passes; unrelated dirty Reddit log remains hash-identical.
- **Next gates:** earliest conservative final-data review **Oct 31** for flagship, **Nov 2** best-image, **Nov 6** TikTok, **Nov 13** Oct 26 rollbacks. Today's text edit requires **14 complete GSC days Oct 30–Nov 12**, earliest final-data review **Nov 16**. Inspect text for a post-write crawl **Nov 2**; do not repeat a confirmed request or edit inside an open window. Live via API; repository changes are preserved locally, not pushed/deployed.

## 2026-10-26

### Blog growth operator — contextual print-to-format support link live

- **Evidence/state:** read Oct 19/12 cron outputs, canonical backlogs/changelog, reports and git history. Final GSC through Oct 22: **6 HOLD / 3 GATED / 1 STOP / 2 VERDICT**, no eligible repeat rung; today's rollbacks govern. Fresh Sep 26–Oct 23 GSC: `/blog/what-resolution-for-print` **25 clicks / 7,984 impressions / position 5.88**; `/blog/best-high-resolution-image-format` **3 / 1,428 / 7.68**. GA4 Sep 28–Oct 25: **28 / 6** organic sessions respectively. Source had no contextual body link to this indexed, relevant destination. No clear safe title gap; format/print/8K intents already have owners. Existing internal-link validation passes 28 files; five targeted routes return 200.
- **Action D/live proof:** one contextual link added under print tips through blog-edit, PATCH 200 `2026-10-26T17:41:12.987734+00:00`. GET proves only `content`/`updated_at` changed; normal rendered article exposes one followed link. Both URLs remain 200 / single self-canonical / index-follow. Metadata, original copy, CTAs and media retained. Fresh backup `backups/backup_2026-10-26_10-39-59.{schema,data}.sql.gz` passed extraction/byte comparison, listing and gzip gates; exact old/new hashes and one-sentence rollback are in the blog changelog.
- **State/verification:** changelog updated; source indexing row reopened once, preserving prior history; **70→71 unique pending URLs**, oldest Aug 13 (**user attention required**). Native browser timed out twice; no UI request claimed. Destination already indexed, no duplicate request. RED→GREEN; **47/47 unit tests**, `yarn verify` and `git diff --check` pass (0 lint errors / 1,832 existing warnings). Aggregate `yarn test` passed **228 API / 32 skipped**, then timed out at 180 seconds during E2E; not fully green. Helper/test/changelog/indexing files were captured by concurrent commit **`b129699d3dbf9abce42d122a8810544a69f27cc7`** (`Fixes`); its unrelated Reddit change was not touched or rewritten. Follow-up commit stages only this run's own files.
- **Deploy/trigger:** live via API, no push/deploy/purge by this run. Source crawl check **Nov 2** (Oct 19 crawl predates the write); João may request indexing once. Measure **Oct 27–Nov 9**, final-data readback **Nov 13**, against final exact-page **Oct 9–22** (source **16 clicks / 4,093 impressions**, target **2 / 569**). Compare clicks, demand/rank and organic sessions separately; no causation/lift claimed. A ≥30% source click drop without comparable demand/rank shift triggers review of the one-sentence rollback. Existing Oct 31/Nov 2/Nov 6/Nov 13 ladder gates unchanged.

### Three Kings operator — three measured losses rolled back live

- **Final evidence and control plane:** refreshed live GSC `dataState: final`, Jun 25–Oct 22, retaining the three-day holdback/excluded current day. Initial check: **3 REGRESSION / 0 EDIT_NOW / 3 HOLD / 3 GATED / 1 STOP / 2 VERDICT / 0 NO_DATA**. Recorded closed rung-3 outcomes for Topaz Video and poster as **FLAT**; no ladder restart. Final check after action: **0 REGRESSION / 0 EDIT_NOW / 6 HOLD / 3 GATED / 1 STOP / 2 VERDICT / 0 NO_DATA**. No duplicate post, title/H1 batch rewrite, unrelated product change, deployment or cache purge.
- **Executed stop-losses, not causation claims:** `/blog/topaz-labs-free-trial` rung 2 `seo_description` restored exactly from `previousValue` after 5.00→3.57 clicks/day (impressions −11%, position −1.3); `/blog/best-ai-upscaler` rung 3 `content` restored exactly after 0.86→0.64 (impressions +28%, position +1.9). `/blog/how-to-upscale-youtube-thumbnails` rung 3 reached the exact LOSS boundary, **15→12 clicks/14d**, impressions −13%, position −0.1: removed the diagnostic proof module but retained the corrected opening, official upload guidance, guest/DPI/fidelity corrections and intervening Oct 12 R2 image migration. A blind full-body restore would reintroduce false claims and obsolete image URLs; the known original transform/recorded old body verified the bounded rollback. No prior value guessed. None meets the stable-position ≤−40% demand-collapse exception.
- **Backup/readback gate:** fresh `yarn db:backup` before EACH PATCH, using Supabase CLI fallback; schema and data passed extraction/byte comparison, appeared in `yarn db:backups`, and passed `gzip -t`. Pairs: `backups/backup_2026-10-26_09-18-22.{schema,data}.sql.gz` (Topaz), `09-21-37` (best-ai), `09-22-50` (YouTube). Older backups preserved. All PATCHes 200; authenticated GETs exactly match restored fields/hashes and prove no unrelated field changed (YouTube's `reading_time` is the verified automatic content-derived recalculation). Normal public rendered HTML confirms all three changes: 200, one self-canonical, index/follow, removed modules absent outside script/RSC. Final field SHA256: Topaz `79eb5981b59ce4c4019157ec6eef7bf348d80aa9ebfc8bd985ffb2ae60333304`; best-ai `96dbc0886be1f25a1bc7c172e964a2c13723eb5a930cebf0b801a612d85f61ee`; YouTube `05d4b6fc56e336a85ac7d9e93e450c6cbf9d21f61499aaea77e25cdcbd3177fe`.
- **Ledger/indexing state:** recorded three diagnostic rollback rows with original rung retained, exact undone field values, backup paths and verified exposure. Updated blog changelog and existing indexing rows without duplicates. TikTok API-resolved (not a manual request): Submitted and indexed, indexing allowed, matching canonicals, successful post-edit crawl `2026-10-23T19:16:16Z`. Reopened three rollback URLs; their crawls Oct 19/22/24 predate today's writes. Native browser `list_pages` timed out twice even though CLI connectivity passed; no fallback browser, request click or manual-submission claim. **70 unique pending URLs** (68 − 1 resolved + 3 reopened), oldest pending group Aug 13: user attention required.
- **Verification and next gates:** regression payload/state tests RED then GREEN; **64/64 affected unit tests pass** across nine suites. `yarn verify` passes (TypeScript, ICU, schema, indexation, 12 cache-config tests; 0 lint errors / 1,832 existing warnings). Required aggregate `yarn test <affected paths>` passed **228 API tests / 32 skipped**, then exceeded its 180-second cap during E2E; full aggregate/E2E green is not claimed. `git diff --check` passes. New reversible payload helper/tests plus ledger/changelog/backlogs preserved locally; no push/deploy. Unrelated dirty Reddit log untouched. Next eligible final-data review **Oct 31** (flagship), **Nov 2** (best-image), **Nov 6** (TikTok); today's rollbacks require all 14 complete days **Oct 27–Nov 9**, earliest conservative final-data review **Nov 13**. Indexing follow-up can proceed earlier only through the existing operator loop with visible confirmation or qualifying post-write API crawl evidence.

## October 2026 Rollup (Oct 3–22)

Raw detail: `git show a9ed2715:docs/SEO/maintenance/seo-changes-backlog.md`; prior anchors `e0ef9919`, `cf5af57c`, `b129699d`; [Oct 3 analysis](../reports/seo-report-2026-10-03.md). Later dated entries and the canonical ledger/indexing backlog govern current state.

- **Recovery/offer evidence:** Sep 12 Product Truth exposure coincided with signups ~100→60/day, Google sessions 249→175/day and flagship CTR 7%→2.2% at stable rank; these are associations, not isolated causation. Oct 3 restored free/no-card homepage framing without false guest access, corrected llms signup wording, restored scale/free/guides to 43→46 sitemap children and unblocked `/_next/`. Oct 13 recovery changed flagship title to `Best Free AI Image Upscaler Online 2026: 12 Compared`, descriptions and self-negating body wording while retaining signup/region facts and no-benchmark disclosure. Later Nov 2 **FLAT** verdict governs; >5% CTR was a target, not achieved proof. Homepage `HeroCreditOffer` now uses client region tiers (5/3/0), avoiding frozen ISR country promises; tier-safe fallback. Head-emitter cleanup removed duplicated canonicals/hreflang and repeated brand suffixes. Guards: free-offer-conversion-copy, llms-txt, robots, sitemap-index, pseo-category-coverage, single-head-emitter.
- **Three Kings/exposure discipline:** Oct 5 YouTube content-only diagnostic/PPI/source guidance and factual guest/DPI corrections initially stayed behind old HTML; verified Oct 8 and API-resolved from Oct 7 crawl. Oct 12 best-image software-workflow/PNG/equal-size evidence pass corrected regional-credit claims, including same-run closing CTA; final body hash `f3180ce35db4a0f7b910faa9a2bddae130d2fc66bb4a0efa74e8b84a555473a9`. First final-copy exposure Oct 15, Oct 16–29 measurement; later Nov 2 **WIN** governs. Prior description rollback retained. Oct 19 TikTok PFP title-only experiment (`25cfc942`) changed only seo_title to `TikTok Profile Picture Ideas: 8 PFP Styles (2026)`, exact prior/backup preserved, after stable-rank 6/4,305→16/4,257 clicks/impressions. Query ownership was unique; Google blocked reliable top-three inspection. Recurring exact-canonical daily collection added. Later Nov 9 title **FLAT** and rung-2 description govern. Guards: three-kings-2026-10-05, three-kings-2026-10-12, three-kings-exposure-2026-10-15, tiktok-pfp-title, indexing-backlog-state. Never start measurement or request indexing from API success alone; pending normal-HTML exposure remains HOLD. Fresh backup/list/gzip gates before every production write; preserve truthful corrections and later R2 media on rollbacks.
- **Indexing:** actual UI requests accepted Oct 12 for flagship/clear-up (`ec2c253b`) and Oct 17 for homepage/remove-bg, visible priority-queue confirmations. Oct 19 post-request crawls: flagship Oct 19 and clear-up Oct 17. Oct 5 poster/best-ai/Topaz Video/Topaz trial API-resolved from successful post-write crawls, anchoring conservative Oct 5 public exposure without claiming manual requests. Oct 15 best-image API-resolved after its Oct 13 crawl. Later rows/outcomes/reopenings supersede historical queue totals and gate dates; never submit again from an old report. Native browser failures were not bypassed with isolated sessions.
- **Performance/assets:** Oct 5 persistent sharded tags/queue (`7240bd83`) guarded scoped invalidation and restart persistence; later release entries govern deployment. Oct 7 removed hydration-hidden opacity from pSEO intro/H1, moving lab LCP ~6.8s (1/5) to FCP-aligned 3.4–4.4s (5/5), not field proof (pseo-hero-lcp, web-vitals-fixes). Oct 10–11 blog image writes moved to R2 WebP with legacy read compatibility; Cloudflare transforms replaced native sharp in the Worker. Upload proof returned 201/exact bytes after a reverted ownership-tag failure; no content/indexing edit. Oct 14 Inter/DM Sans moved from failing next/font/google downloads to committed local variable woff2, preserving CSS variables/design; homepage-performance guards. Later Nov 13 cache/LCP deployment and real-edit purge readback govern current work.
- **Carried forward (not all reverified):** do not revive historical pending-deploy/head-emitter blockers after Oct 15/17 confirmations. Never restore flagship `Only 3 Worked` as a fabricated benchmark. Generic upload-error mapping and exact missing asset identity (`1769887240667-tools-inline-1.webp`; `1769887231945` not proven equivalent) were unresolved in the old R2 audit. Gallery-retention copy in all seven locales discloses 30-day free-gallery inactivity expiry, ≥7-day warning, sign-in preservation and paid exemption; PRD-SQR-04 AC-5 integration proof was pending and is not reverified here. Temporary uploads have a separate two-day scheduled lifecycle; never delete a shared input on one job's terminal event. Guards: gallery-retention-copy, multilocale-retention-copy, tools-input-retention-copy, async-upscale and email specs. Post-deploy localized/tool PSI and weekly CrUX follow-ups remain evidence-based, not assumed complete. Oct 22 Reddit log is off-site history only; no new SEO surface. HR/security/account changes, Outrank scheduling and OAuth branding remain owner actions, not permission for this operator.

## September 2026 Rollup

Detail for 2026-09-03 → 2026-09-28 (plus late-filed Sep entries): see git history of this file before the rollup commit.

### Product Truth, then the free-offer regression and restore (Sep 10 → Sep 25)

- **Sep 10 "Product Truth" (PRD seo-recovery-2026-09 #1–3):** `shared/config/product-capabilities.ts` became the single derived source for credits, guest access, formats, scale and batch limits. All hardcoded "5/3/10 free credits" claims became "welcome credits"; 58 false "no signup" claims were dropped from account-backed pSEO pages; the animated-GIF promise was retired in all locales; four Supabase-only posts (flagship, poster, topaz-labs-free-trial, photo-restoration-program) were corrected (flagship title became "…Limits Compared"). Gate: `capability-claims.unit.spec.ts` (sweeps every pSEO JSON, `locales/en`, and `content/blog-data.json`).
- **Also Sep 10:** funnel attribution (`landing_page`/`device`/`mode` on every event, `yarn seo:funnel:report`); blog index topic links moved to client-side `BlogQueryLink` (no crawlable `?q=` URLs); `PrintReadinessChecker` on the poster article (`[!CTA_PRINT_READINESS]`); `upscale-16x` copy aligned to two 4x passes. Review of the checker (`b960b7b3`) fixed three defects: `MISSING_MESSAGE` errors on every render, a missing crop requirement, and a verdict that compared raw instead of displayed PPI. Worker secret allowlist fix brought the blog admin API back from 500 and enabled server-side GA4 (`GA4_API_SECRET` only reached the Worker on Sep 10, so earlier server-side conversions are absent from GA4).
- **Root defect found with it:** blog PATCH/publish/unpublish called `revalidatePath` on non-existent non-locale routes, so every blog edit since the locale refactor stayed behind ISR HTML. Fixed with `lib/blog/revalidate-blog-paths.ts` (locale segment for every supported locale). `CLOUDFLARE_API_TOKEN` still lacks purge scope.
- **Result:** the stripped "free" wording cut signups ~101 → ~61/day from Sep 12 and branded clicks 184 → 43/wk. **Sep 25 restored** the free framing ("N free credits", "Free to start", "No credit card required", "Fix My Images Free") while keeping the accuracy fixes. Guards: `free-offer-conversion-copy` and `protected-pages` unit specs, plus a rule in `CLAUDE.md`. See the Oct 3 and Oct 13 entries for the later readbacks.

### Three Kings ladder program (Sep 3 → Sep 28)

- **Tooling (Sep 3):** `.claude/skills/three-kings-manager/` (`tkm.cjs`) with the per-URL ledger `three-kings-ledger.json`, and `.claude/skills/gsc-causation-correlation/` (day-by-day GSC series, pre/post windows, weekly buckets, non-brand trend). Added eligibility gates (demand change, phantom cluster, junk-position bloat, open window, position 5–15, healthy-CTR) and outcome thresholds (WIN ≥1.2x clicks/day; LOSS ≤0.8x or +2 positions without gain). Sep 28: a `rollback` row can no longer emit a second `REGRESSION`.
- **Edits:** Sep 3 poster + photoshop-upscale-image + `/alternatives/vs-adobe-express`; Sep 4 rung-2 `seo_description` on best-ai-upscaler, topaz-video-upscaler, best-image-upscaler; Sep 10 rollback of three LOSS body passes (best-free flagship, fixing-pixelated-photos, photo-restoration-program); Sep 14 YouTube thumbnails rung 2; Sep 21 topaz-labs-free-trial rung 2 + poster rung 3; Sep 24 rung 3 on best-ai-upscaler and topaz-video-upscaler, plus rollback of the best-image rung 2.
- **Measured:** best-ai-upscaler rung 2 WIN (0.79 → 1.00 clicks/day, position 17.3 → 8.2); topaz-video-upscaler rung 2 WIN; topaz-labs-free-trial rung 1 WIN (6.43 → 8.14); poster rung 2 FLAT; best-image rung 2 LOSS (rolled back); historical 07-22 / 08-10 / 08-17 body passes LOSS.
- **Lessons:** the API write precedes public HTML (ISR), so no GSC request until live HTML matches. Never re-apply a copy state that a rollback already proved to lose. Every production write follows `yarn db:backup` → `yarn db:backups` → `gzip -t`.

### Technical SEO and performance

- **Sep 7:** `/blog` stays `index, follow`; any `q` filter or `page ≠ 1` returns `noindex, follow` with canonical `/blog` (`blog-index-params-noindex.unit.spec.ts`, `e4819767`).
- **Sep 8:** GSC 404 repair: 13 new paths merged, `jpg-en-png` alias, three article-owner redirects, exact `/use-cases-expanded` → `/use-cases` hub redirect. Mobile LCP: eager responsive hero image, single breakpoint-aware navbar logo, deferred below-fold sections, Stripe and analytics.
- **Sep 16:** OpenNext cache interception re-enabled (`e364d0aa`) on top of the durable-object revalidation queue; prerendered pages serve `x-opennext-cache: HIT`; measured TTFB 976 → 627 ms; variance cause still unproven. Homepage `creditOffer` locale-key mismatch fixed (raw `homepage.*` keys had rendered; `0fff2b59`). Flagship vendor facts corrected (heading "Tested" → "Compared"). IndexNow accepted the flagship and the YouTube guide. `yarn diag:paid-funnel` added (paid stage = `purchase_confirmed`).
- **Sep 28 `/tools/remove-bg`:** metadata refresh to front-load "Remove Background Online Free" (`95ab08c4`); the Sep 24–26 impression spike (30,148 impressions, 4 clicks) was an external SERP episode, so exclude it from page-level CTR evidence; `remove-bg-demand-capture.unit.spec.ts` guards its sitemap eligibility; `pseo-performance.json` sync now refuses refreshes that lose ≥20 earning pages and ≥25% of identities (a truncated export had almost de-listed 323 pages). pSEO final-CTA contract: optional `ctaTitle`/`ctaHighlightText`/`ctaDescription`/`ctaTrustItems`, honored first on remove-bg only (`pseo-cta-contract.unit.spec.tsx`).
- **Sep 3–4:** post-deploy HTML cache gate made deterministic (warm TTFB is a best-of-five warning).

### Carried forward

- Page-level CTR for `/tools/remove-bg` after Sep 28: judge only 14 complete days after the first post-deploy crawl, excluding Sep 24–26.
- Do not restore "Only 3 Worked" verbatim; it implies the removed benchmark.

## August 2026 Rollup

Detail for 2026-08-03 → 2026-08-31: see git history of this file before the rollup commit.

### GSC recovery PRD set (Aug 13, `docs/PRDs/gsc-recovery-2026-08/`)

Six lanes, five squashed to master on Aug 13 (PRD 01 `63bb04f9`, 05 `52619af4`, 06 `c1c24ba5`, 04 `e95af3c0`, 03 `a8c0514d`); deployed as `a9d583e3`. PRD 02 (locale indexation integrity, `78cfa256`) was NOT merged: its cache-record budget gate was red and its `translatedLocales` hreflang design conflicted with PRD 01's `availableLocales`.

- **PRD 01 – 404 elimination:** 24 interactive resize/convert/compress slugs centralized; 314 permanent 301s generated into `lib/seo/legacy-redirects.ts`; `use-cases-expanded` page restored; `yarn seo:verify:gsc --set=404|noindex|5xx|dup|cni`. The live 404 gate went from 212/303 to 1/303 violating. Aug 17: four case-only redirect rules were removed because they looped in `next dev` (310 rules; `legacy-redirect-loops.unit.spec.ts`).
- **PRD 03 – index-bloat pruning:** committed `content/pseo-performance.json` snapshot, shared eligibility filter for sitemaps and robots, 85% indexation gate. Found and fixed before deploy: redirect owners were pruned (`REDIRECT_OWNER_KEYS` now derived from `LEGACY_REDIRECTS`), duplicate snapshot rows hid traffic (rows merge with `Math.max`), and every locale was judged by the English record. 474 of 991 identities left the sitemaps (almost all non-English).
- **PRD 04 – taxonomy cannibalization:** `lib/seo/intent-ownership.ts` table-driven ownership, `yarn seo:measure:cluster`; fixed GIF baseline (2026-06-16 → 2026-07-13, ≥847 clicks); `/scale/upscale-16x` stays outside `memberPaths`. The GIF 301 consolidation later proved a failure (owner position 7 → 33, cluster 847 → ~100 clicks); never repeat it without the stop-loss in `cannibalization-consolidation-technique`.
- **PRD 05 – LCP:** custom image loader (Cloudflare Image Resizing, Supabase render, Unsplash AVIF) replaced global `unoptimized`; preconnects; public-asset size guard; `seo:pagespeed` budget command.
- **PRD 06 – blog indexation:** fail-closed indexation and CTR reports, ≥2 inbound links per published slug (`content/seo-equity.json`), above-fold CTA on `fixing-pixelated-photos`, 33 crawled-not-indexed URLs queued. `getAllPublishedSlugsStrict()` fails closed for reports; `getAllPublishedSlugs()` degrades for static generation.
- **Aug 25 batch:** exact legacy redirect coverage plus a titled/noindex 404 page; locale pSEO metadata parity and retraction of English mirrors; `/en/*` → canonical 301s and locale-less URLs as explicit English rewrites; no public cookies; honest GSC segments (`branded`, `nonBranded`, `unclassified`) with phantom-query quarantine. Added PRDs 4–6 from "The August 12 Cliff" triage.

### Blog CTR passes and the Aug 17 root cause

- **Aug 10:** `/blog/fixing-pixelated-photos` proof-led snippet and body pass (later judged LOSS and rolled back Sep 10); blog post route made `force-static` with 24h ISR and lazy iframes (`blog-core-web-vitals.unit.spec.ts`).
- **Aug 17:** `/blog/best-free-ai-image-upscaler-2026-tested-compared` proof-led snippet (`638179f3`, later LOSS and rolled back Sep 10).
- **Aug 31:** `/blog/topaz-labs-free-trial` alternative-led `seo_description` (became rung 1 WIN, see September).
- **Aug 17 GSC decline root cause** ([report](../reports/2026-08-17-gsc-decline-root-cause.md)): not SEO. Non-brand clicks were near all-time high. Brand clicks reverted to baseline after a Jun 20–Jul 17 spike. The real loss was signups per organic click (0.83 → 0.44) after the Jul 17 abuse-prevention deploy. `/api/users/setup` was made non-blocking (Aug 17) and the Worker OOM (~300/day) plus the `setupStatus: 'pending'` blocker were fixed Aug 18 (`0e9c7140`). Segment brand vs non-brand before reading site-wide averages; query day-by-day, because `rowLimit: 25000` truncates multi-day `date,query` pulls.

### Technical changes

- **Aug 3:** `sitemap-use-cases-expanded.xml` retired with `410 Gone`; GIF owner `lastUpdated` refreshed.
- **Aug 24:** `/dashboard/` removed from robots disallow and served with `X-Robots-Tag: noindex, follow` (so Google can recrawl and drop it); `seo-guard.e2e` realigned. Verified live Aug 25; GSC refuses indexing requests for it by design.
- **Aug 25–26 caching:** OpenNext long-lived regional R2 cache, `Cache anonymous HTML` zone rule with auth/dashboard exclusions, Turbopack → Webpack build (upload 12.17 → 7.89 MiB), localized homepages as SSG with 24h revalidation, and the HTML cache gate moved to post-deploy (accepts `x-opennext-cache: HIT`). Deploy hardening: R2 permission fallback to Wrangler OAuth, Worker upload retry. Dev-only `/cdn-cgi/image` rewrite (`lib/dev/cdn-cgi-rewrite.ts`).
- **Aug 25:** 11 blog URLs accepted into the GSC priority crawl queue; the daily quota stopped the rest (about 10 requests per property per day).
- **Aug 31:** Durable Object revalidation queue configured (`NEXT_CACHE_DO_QUEUE`, `DOQueueHandler`) with interception still off. It was enabled on Sep 16.

### Carried forward (status not re-verified in this rollup)

- Complete the [GSC request indexing backlog](./gsc-request-indexing-backlog.md) after each deploy.
- Reduce Worker/cache CPU for localized pSEO pages (Cloudflare `1102` on 63 of 1,927 URLs in the 2026-07-30 crawl; a localized OpenNext cache record is about 1.1 MB).
- Run GSC **Validate fix** for the four Japanese social-resize 5xx examples; sampling the `Crawled - currently not indexed` and `Google chose different canonical` groups still needs the GSC UI.
- Record the 28-day evaluation of the [GSC SEO recovery PRD](../../PRDs/gsc-opportunity-recovery-2026-07-22.md) before it moves to `done/`.
- Fix `deploy.sh` so its test stage does not point a test server at the production database; `yarn i18n` still reports 962 missing keys (deploys use `--skip-i18n`).
- Rotate `CLOUDFLARE_API_TOKEN` with cache-purge and R2 Object Read & Write scope.

## July 2026 Rollup

Detail for 2026-07-03 → 2026-07-31: see git history of this file before the rollup commit.

### Blog CTR and ranking edits (production blog API; backup-before-write evidence is recorded from Jul 22 on)

- **Jul 3:** `fixing-pixelated-photos`, `best-ai-upscaler`, `topaz-video-upscaler` titles, descriptions and openings (best-ai-upscaler also got a quick-answer table). Jul 7 early signal: impressions up on all three, clicks too small to judge.
- **Jul 10:** SEO growth plan execution: `/tools/ai-image-upscaler`, `/formats/upscale-gif-images` and `/scale/upscale-16x` copy corrected (five-credit signup requirement, no animated-GIF promise, honest two-pass 4x); `/blog/topaz-labs-free-trial` refreshed to current Topaz terms (no trial mode, two-day refund); `/blog/pixelcut-ai-photo-editor` first-screen disclosure. Canonical `/blog/...` always serves the internal English route and `/es/blog/...` style variants 301 to the unprefixed URL. Commercial-funnel `entry_page` moved to session storage and is captured before consent checks. GA4 key-event audit (property `519826120`) found all nine funnel events and six GA4 names configured.
- **Jul 13:** `content/seo-equity.json` refreshed from 90-day GSC (poster, YouTube thumbnails and photoshop-upscale-image promoted; poster gets related-post links from 54 pages); snapshot script keeps `meta.dateRange`.
- **Jul 14:** `best-image-upscaler` and `how-to-upscale-youtube-thumbnails` title/description/H1/opening refresh.
- **Jul 20:** flagship title `Best Free AI Image Upscaler Online 2026: 12 Tested` → `…2026: Only 3 Worked` (later rolled back, see September).
- **Jul 22:** GSC opportunity recovery PRD ([PRD](../../PRDs/gsc-opportunity-recovery-2026-07-22.md)): `text-image-enhancer` H1/title/opening/table, poster snippet fields, `photo-restoration-program` comparison expansion (body pass later judged LOSS and rolled back Sep 10). Backlog deduplicated to one row per URL.
- **Jul 27:** `fixing-pixelated-photos` `seo_title` → `How to Fix Pixelated Photos Online: 3 Fast AI Fixes` (28-day: 56,994 impressions, 9 clicks, position 9.69).

### Product-terms and schema corrections

- **Jul 17, Jul 20, Jul 31:** removed every "recurring/monthly free credits", "10 free credits", "no-signup" and "3 free images per day" claim in favor of the one-time five-credit welcome policy (regional grant 5 / 3 / 0). Guard: `free-credit-policy-copy.unit.spec.ts`. (Sep 10 later made the wording tier-safe, Sep 25 restored the "free" framing.)
- **Jul 26:** portrait-upscaler tier and FAQ credit claims aligned with provider-aware pricing (`use-cases-credits.unit.spec.ts`).
- **Jul 30:** four homepage subscription `Product` JSON-LD blocks gained a valid image, stable IDs and canonical URLs; pricing schema no longer points at the missing `/og-image-pricing.png` (`homepage-plan-schema.unit.spec.ts`).

### Jul 30 GSC diagnosis and execution ([report](../reports/gsc-performance-diagnosis-2026-07-30.md))

- GIF consolidation: `/format-scale/gif-upscale-{2x,4x,8x,16x}` and localized variants 301 to the English-only owner `/formats/upscale-gif-images` (later judged a failure, see August).
- Five legacy social-resize paths missing `/resize/` redirect locale-preservingly; unrouted `use-cases-expanded` sitemap dropped from the index (85 children; retired with `410` on Aug 3); deploy SEO guard aligned.
- Stripe loads only on intent; the homepage comparison slider stops downloading a duplicate LCP image. Production crawl: 1,927 URLs, 63 returned Worker CPU error `1102`.
- Held homepage and active blog snippet edits to protect measurement windows.

### Carried forward

- Complete the pending requests in the [GSC request indexing backlog](./gsc-request-indexing-backlog.md); do not check a URL off without GSC UI confirmation.
- After deploy, confirm the four homepage Merchant listings no longer report a missing image.

## June 2026 Rollup

Detail for 2026-06-01 → 2026-06-29: see git history of this file before the rollup commit.

### Three Kings and blog metadata passes (production blog via Supabase/API)

- **Jun 5:** seven thin-content refreshes (`poster-size-dimensions-pixels`, `what-resolution-for-print`, `best-image-upscaler`, `best-free-ai-photo-enhancer-online`, `how-to-upscale-midjourney-images-for-print`, `photoshop-upscaler-vs-ai-tools`, `how-to-upscale-youtube-thumbnails`); `/tools/ai-image-upscaler` H1/first paragraph front-loads "free AI image upscaler", "up to 8x", "no signup" (`locales/en/tools.json` synced).
- **Jun 7:** 3 Kings execution: `fixing-pixelated-photos` (H1/title, answer table, three internal links in), `topaz-video-upscaler`, `topaz-labs-free-trial` (truncated description fixed); `how-ai-image-upscaling-works-explained` consolidated into the `-guide` post with redirects and sitemap exclusion; Adobe Express alternative refreshed. Best-free flagship `seo_title` → `Best Free AI Image Upscaler Online 2026: 12 Tested` (90-day: 77,603 impressions, 238 clicks, position 7.08). CTR baseline recorded; judge only after 14 complete GSC days.
- **Jun 12:** `fixing-pixelated-photos` was last crawled before the Jun 7 refresh. Resubmitted `sitemap.xml` and `sitemap-static.xml` through the Sitemaps API (204); manual indexing stayed pending.
- **Jun 20–21:** `video-upscaling-software`; trending-down fixes on `best-free-ai-photo-enhancer-online`, `how-to-upscale-images-for-instagram`, `free-photo-restoration-app`; `[!CTA_TRY]`/`[!CTA_DEMO]` body CTA blocks on the nine highest-impression low-CTR posts, plus the reusable skill `seo-blog-ctr-body-cta`; new featured image for `fixing-pixelated-photos`.
- **Jun 29:** flagship `description`/`seo_description` only (zero-click exact queries at positions 3–10).
- **Blog growth maintenance runs (Jun 1, 2, 22, 29):** opportunities publisher chose no new post each time because every strong candidate duplicated existing canonical ownership (anti-cannibalization gate); the performance monitor applied edits only outside the 14-day lag windows. Reports are under `docs/SEO/reports/`.

### Template, schema and technical changes

- **Jun 5:** blog template rebuilt for CTR (problem-led `/blog` index, Blog/ItemList/BreadcrumbList JSON-LD, article hero with quick-answer panel, bounded pagination; `blog-template-signals.unit.spec.ts`); `BlogSpecialistSection` author bio for E-E-A-T (`reviewedBy.sameAs`); `BlogPostFooter` consolidation; homepage trimmed of duplicate feature and guide blocks while keeping hero `h1`, Popular Tools links, FAQ + JSON-LD and the blog module.
- **Jun 7:** SEO equity flywheel: `content/seo-equity.json` snapshot, scoring/loader helpers, diff gate and scheduled offline workflow; homepage blog picks, blog index cards and related posts read it.
- **Jun 21:** public unlocalized pSEO pages no longer refresh Supabase sessions in middleware (Worker `1102` CPU guard; `middleware-public-page-auth.unit.spec.ts`).
- **Jun 29:** added the missing localized `meta.homepage` blocks for `es`, `it`, `pt`, `ja` (they fell back to English) and aligned Spanish with GSC terms (`locale-homepage-meta.unit.spec.ts`).

### Carried forward

- Do not rewrite a page again before Google recrawls the edit and 14 complete post-recrawl GSC days exist.
- Complete the pending requests in the [GSC request indexing backlog](./gsc-request-indexing-backlog.md) (30 unchecked at the Jun 29 count).

## May 2026 Rollup

Detail for 2026-05-06 → 2026-05-31: see git history of this file before the rollup commit.

### Blog CTR metadata passes (production blog via Supabase/API)

- **May 6 (Batch 1, [report](../reports/seo-next-steps-2026-05-05.md)):** five posts refreshed (title/SEO title, H1, first paragraph); `ai-image-upscaling-vs-sharpening-explained` gained an answer block, comparison table and FAQ. IndexNow accepted 6 URLs; the Sitemaps API resubmit returned 204. The GSC request-indexing backlog file was created here.
- **May 12:** flagship `best-free-ai-image-upscaler-2026-tested-compared` refresh (short answer, comparison table, FAQs); six thin SEO descriptions expanded; `sample-article-title-for-testing` unpublished to draft.
- **May 14:** Three Kings on `best-ai-upscaler`, `topaz-video-upscaler`, `how-to-upscale-anime-images-with-ai`.
- **May 19:** blog CTAs repointed to `/tools/ai-image-upscaler` and `/tools/ai-photo-enhancer`; stale static slugs removed from `BLOCKED_BLOG_SLUGS` so they re-enter `sitemap-blog.xml`; fixed `Invalid Date` on static posts.
- **May 24:** metadata-only SERP pass on five posts after a 14-day GSC drop (clicks −40.89%, CTR −40.08%, position −4.42): flagship, upscaling-vs-sharpening, best-ai-upscaler, free-ai-upscaler-no-watermark, anime. Judge only after Jun 7.
- **May 26:** "fix-before-pushing" pages ([report](../reports/fix-before-pushing-pages-deep-dive-2026-05-26.md)): `/comparisons-expanded/ai-models-comparison`, `photoshop-upscale-image`, `sharpen-a-video`, `topaz-denoise-ai`, `best-ai-image-enhancer`, `topaz-video-upscaler`, `upscale-image-for-print-300-dpi-guide`; 308 from `best-ai-image-quality-enhancer` to `best-ai-image-enhancer`; internal links added; hero CTA click tracking and `acquisition_page_type` page-view dimensions. CTR baselines are in [ctr-baselines-2026-05-26.md](../monitoring/ctr-baselines-2026-05-26.md). The flagship was deliberately not touched that day.
- **May 31:** flagship `seo_title`/`seo_description` front-loaded `best free ai image upscaler 2026` (positions 5–6, 0% CTR).
- **Blog growth maintenance runs (May 13, 15, 18, 20, 22, 25):** opportunities publisher chose no new post each time (anti-cannibalization gate); the performance monitor triggered no `blog-edit` because candidates were inside GSC lag, consolidated, or improving. Redirects for retired blog URLs verified as `308`.

### Technical and measurement changes

- **May 12–13 GA4:** `GA4_EVENT_MAP` centralized for client and server; all nine internal SEO funnel events plus the five emitted GA4 names (`select_content`, `generate_lead`, `sign_up`, `begin_checkout`, `add_payment_info`) created as key events (`ga4-key-events.cjs --create`, after Editor access was granted; `purchase` already existed). May 6 added first-touch attribution fields and mapped `upscale_completed` to `generate_lead`.
- **May 12:** English-only pSEO sitemaps require only `en` and `x-default` hreflang; localized sitemaps keep all supported locales.
- **May 6 / May 13:** non-English homepages (including `/it`) added to `sitemap-static.xml`; verified live on May 13, and URL Inspection showed `/it` as `Submitted and indexed` with the sitemap association.
- **May 13 tools:** duplicate brand suffix removed from tool metadata; static `relatedTools` clusters honored first; `/tools` hub got a popular-tools block; the empty `sitemap-images.xml` expectation was dropped.

### Carried forward

- Complete the [GSC request indexing backlog](./gsc-request-indexing-backlog.md); the 2026-05-24 and 2026-05-26 batches had their CTR readbacks scheduled for Jun 7 onward (June and July rollups show the follow-on edits).

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
