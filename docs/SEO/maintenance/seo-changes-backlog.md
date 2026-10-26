# SEO Changes Backlog

Purpose: keep a concise operational trail of SEO changes so future audits can connect ranking, indexing, CTR, and attribution movement to actual site changes.

Maintenance rules:

- Add an entry every time SEO-facing code, metadata, content, sitemap, schema, canonical, hreflang, robots, redirects, IndexNow, GSC, GA4 attribution, pSEO data, or blog SEO changes.
- Keep entries short: what changed, why, files/surfaces touched, validation, and follow-up.
- Keep the last ~3 weeks in full detail. Roll older entries into one monthly rollup (newest month first) when the file passes ~80 KB. See the `seo-changes-backlog` skill for the rollup recipe.
- Full pre-rollup detail for 2026-05 → 2026-10-19 stays in git: `git show 3bdb8f1e:docs/SEO/maintenance/seo-changes-backlog.md`.
- Link related reports, PRDs, or follow-up backlog files instead of pasting long analysis.

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

## 2026-10-22

### Reddit outreach monitor, Oct 17–22 — no SEO surface changed

Source: `docs/seo/reddit-post-log.md` (ledger of record; the monitor reruns daily and writes there, not here).

- **Off-site action recorded:** on 2026-10-17 a disclosed link to `https://myimageupscaler.com/blog/poster-size-dimensions-pixels` was posted in r/print (thread `1wmyik0`, comment `phcntjm`). The log reconciled it from the thread Atom feed on Oct 18. Earlier no-link replies were posted in r/AskPhotography (Oct 9, 11, 14) and r/ricohGR (Oct 14).
- **Self-link rule:** the next blog link stays deferred until nine confirmed no-link replies follow the last self-link. The held candidate is `/blog/best-image-upscaler` for the zero-click query `best ai image upscaling workflow 2026` (GSC Sep 22–Oct 19: 228 impressions, 0 clicks, position 9.43; GA4 organic Sep 24–Oct 21: 26 sessions, 23.08% bounce). The page has no edit pending.
- **Pending queue:** 342 MIU recommendations are recommended-not-posted; ten were resurfaced each day Oct 18–22 with no new rows. Reddit JSON and rules routes return 403 or challenge shells, so prior-reply history and commentability stay manual checks.
- **Not touched:** no URL, metadata, sitemap, canonical, robots or GA4 change. The two dirty files in the worktree (`client/analytics/webVitals.ts`, `server/analytics/analyticsService.ts`) hold formatting-only edits.
- **Due now, not yet run:** Oct 22 TikTok PFP post-edit crawl check; Oct 23 final-data review of the four Oct 5 exposure rows (see the Oct 19 and Oct 15 entries).

## 2026-10-19

### Blog growth operator — live TikTok PFP title-only CTR experiment

- **Governing state:** read the Oct 12/Oct 5 cron outputs, current canonical backlogs/changelog, Oct 3 report, and recent affected-file history. The Oct 17 indexing/deploy confirmation supersedes the older cache/deploy blockers. Fresh manager data is final through Oct 15: the existing eleven entries remain **7 HOLD / 3 GATED / 1 STOP**, no eligible repeat edit. Retain Oct 23 (four Oct 5 exposure rows), Oct 26 (YouTube), Oct 31 (flagship final-data review), and Nov 2 (best-image) gates. No duplicate post or experiment reset.
- **Evidence and class A decision:** GSC Sep 19–Oct 16 vs Aug 22–Sep 18 has named non-brand clicks **2,275→2,387 (+4.92%)**, branded **684→176 (−74.27%)**, unclassified **2,785→2,176**; GA4 Organic Search Sep 21–Oct 18 vs Aug 24–Sep 20 sessions **6,594→5,295 (−19.70%)**. Do not infer signups or edit causation. The previously unledgered canonical `/blog/tiktok-profile-picture-ideas` has **22 clicks / 8,607 impressions / position 7.97**. Exact-page, final 14-day windows Sep 18–Oct 1 → Oct 2–15: **6/4,305 at 7.98 → 16/4,257 at 7.97**, CTR **0.14%→0.38%**; stable demand/rank, persistently weak CTR, not the phantom signature. `good pfp for tiktok` alone has 419 impressions / 0 clicks / position 8.14; all four checked PFP/ideas queries have exactly one page owner. API `updated_at` was July 6; no newer edit/backlog gate. The old title omitted `PFP` and used a vague “Stand Out” promise. Google blocked competitive SERP inspection, so no exact top-three ranking/depth claim or broad expansion was used. Existing internal-link validation passes 28 data files with zero invalid references.
- **Shipped:** PATCHed only `seo_title` to **`TikTok Profile Picture Ideas: 8 PFP Styles (2026)`** (49 chars), preserving title/H1, both descriptions, body/CTAs/credit offer, images, slug and status. Fresh `yarn db:backup` exported schema/data via its Supabase CLI fallback; `yarn db:backups` listed `backups/backup_2026-10-19_10-35-08.schema.sql.gz` and `.data.sql.gz`, both passed `gzip -t` and test extraction/byte comparison; prior sets retained. PATCH 200 at `2026-10-19T17:39:14.893624+00:00`; GET proves only `seo_title` and `updated_at` changed, body SHA256 unchanged (`3f619d58bff5fc2f1aa1e19c7fc3385cb4823e5f271cd5eb7333b5e87067ab49`). Normal public GET and refreshed browser DOM expose the new title, **200 / one self-canonical / index, follow**. An initial browser read was stale, resolved on subsequent normal GET/reload without another production write or broad purge. Recorded rung 1 and exact prior title for rollback; added exact-canonical daily collection so fragment impressions do not contaminate this test, retaining the old contains default for existing series.
- **Canonical state and indexing:** updated blog changelog, ladder ledger and indexing backlog in place. The two Oct 12 requests now have successful post-request crawls: flagship `2026-10-19T07:04:00Z`, clear-up `2026-10-17T23:17:27Z`; both Submitted and indexed, allowed and matching canonicals. No duplicate/repeated submission. Added one pending TikTok row; actual current-file count **67→68 unique pending URLs** (oldest group Aug 13; older reports' totals are superseded). **User attention required: 68 pending URLs.** Isolated browser is logged out; two native browser connection attempts timed out. No new manual indexing request is claimed; João can request this one updated URL.
- **Verification and files:** RED/GREEN for single-field payload, concurrent-edit refusal, idempotence, canonical measurement collection, reversible ledger and unique indexing row; **69/69 affected unit tests pass** across six suites. `yarn verify` passes (TypeScript, ICU, schema, indexation and 12 cache-config tests; 0 lint errors / 1,832 pre-existing warnings); `git diff --check` passes. Required aggregate `yarn test <affected paths>` was attempted with a 180-second cap but timed out during Chromium installation **before tests ran**; aggregate API/E2E green is not claimed. Three unrelated dirty files remained hash-identical. Files: `scripts/seo/tiktok-pfp-title.cjs`, `tests/unit/seo/tiktok-pfp-title.unit.spec.ts`, `.claude/skills/gsc-causation-correlation/scripts/gsc-daily-correlate.cjs`, `.claude/skills/blog-changelog.md`, `docs/SEO/maintenance/{three-kings-ledger.json,gsc-request-indexing-backlog.md}` plus this canonical entry. Action/state commit **`25cfc942e86fb7a069b13d5b4548811c20006b3f`** (`seo: ship TikTok PFP title-only CTR experiment`); this entry is the companion canonical-state commit.
- **Deployment and next triggers:** production title is **live via the blog API**, no code deploy required; repo commits **local-only, not pushed/deployed**. On **2026-10-22**, inspect this URL for a successful post-Oct-19 crawl and reconcile the pending row only with API/UI evidence; do not treat the pre-edit Oct 18 crawl as completion. Measure **14 complete post-exposure days Oct 20–Nov 2**, earliest conservative final-data verdict **2026-11-06**. Compare against the final Oct 5–18 baseline: ≥20% clicks/day lift is WIN; ≤80% clicks/day or >2-position degradation without click gain triggers the existing demand-gated exact-title rollback protocol; otherwise FLAT and assess rung 2 only after all safety gates pass. No further edit before that window; no growth lift claimed today.

## 2026-10-17

### GSC indexing requests after the Oct 15 deploy — remove-bg and homepage

- Code deploy confirmed live 2026-10-15 03:19 UTC: single canonical/hreflang, tier-aware hero offer, no `/_next/` robots disallow, 46-child sitemap index, remove-bg title/H1.
- Requested indexing in the GSC URL Inspection UI for `https://myimageupscaler.com/tools/remove-bg` and `https://myimageupscaler.com/`; both dialogs read "URL was added to a priority crawl queue". No content, metadata or DB change.
- Fresh data through Oct 16 (not final): flagship CTR ~2.1% at position 6 (no lift yet); homepage CTR 2.4% → ~3.3% on Oct 15–16 (two days, noise-level); site ~150 clicks/day flat; weekly clicks down four weeks in a row (1,438 → 1,064). No new edit: readbacks stay Oct 23, Oct 26, Oct 30–31 (flagship + hero) and Nov 2.

## 2026-10-15

### Three Kings — best-image final-copy exposure reconciled; all production actions gated

- Refreshed the correlator from live GSC with `dataState: final`: Jun 14–Oct 11, retaining the three-day holdback/excluded current day. Ledger check: **0 EDIT_NOW, 0 REGRESSION, 7 HOLD, 3 GATED, 1 STOP, 0 VERDICT/NO_DATA**. No eligible production blog write, rollback, new post, deployment or cache purge; no new backup gate needed. Existing demand/position/healthy-CTR/STOP gates retained.
- `https://myimageupscaler.com/blog/best-image-upscaler`: normal public GET is 200, self-canonical and index/follow; the rendered article (excluding script/RSC) now exposes the workflow evidence module **and corrected closing CTA**. Authenticated API final body SHA256 matches `f3180ce35db4a0f7b910faa9a2bddae130d2fc66bb4a0efa74e8b84a555473a9`, `updated_at` remains `2026-10-12T16:46:09.796203+00:00`. Reconciled pending→verified, retaining `dbEditDate`, rung 3, exact prior body and backup records. Earlier final-copy exposure is unknown: measurement conservatively starts Oct 15; no new history rung or inferred outcome.
- URL Inspection reports `Submitted and indexed`, indexing allowed, successful post-write crawl `2026-10-13T17:00:05Z` and matching Google/user canonicals. Updated the existing best-image indexing row in place as **API-resolved, not a manual request**, and appended exposure confirmation to the blog changelog. Pending unique URLs **69→68**, no duplicate rows; oldest pending group Aug 13. Native browser preflight initially timed out; CLI connectivity and the second native `list_pages` succeeded. No GSC request-indexing click or manual-submission claim. A separate read-only flagship inspection reports a successful Oct 15 crawl, but does not close its performance window or authorize another edit.
- Verification: new exposure-state test RED before reconciliation, then **44/44 affected unit tests GREEN**; `yarn verify` passes (TypeScript, ICU, schema, indexation and 12 cache-config tests; 0 ESLint errors, 1,832 existing warnings). Required aggregate `yarn test <affected paths>` completed **228 API tests / 32 skipped**, then hit the explicit 180-second cap during E2E; full aggregate/E2E green is not claimed. `git diff --check` passes; no unrelated files changed. Bookkeeping/test changes are local-only, not pushed/deployed.
- Next eligible final-data review: **2026-10-23** for the four Oct 5 exposure rows; YouTube **Oct 26**; flagship Oct 27 target requires final data through that date (earliest correlator export **Oct 31**). Best-image needs all 14 complete post-confirmation days **Oct 16–29**, earliest final-data verdict **2026-11-02**. Continue the existing indexing operator queue; do not re-edit HOLD pages or reapply diagnostic rollback losses.

## 2026-10-14

### Fonts self-hosted from committed files — perf-only, no copy change

The release build failed in `next/font/google`: Google Fonts returned a font URL with no file extension, and the loader crashed (`Cannot read properties of null (reading '1')`). Inter and DM Sans now load through `next/font/local` from `client/styles/fonts/*.woff2` (`client/styles/fonts.ts`), shared by `app/[locale]/layout.tsx` and `app/(pseo)/layout.tsx`. Same Google latin variable files, same CSS variables and `display: swap`; weights now cover the full axis. Not shipped: non-latin subsets (latin-ext, cyrillic, greek, vietnamese) — no supported locale needs them, and missing glyphs fall back per character. Guarded by `tests/unit/seo/homepage-performance.unit.spec.ts`. **Readback after deploy:** PSI mobile on `/` shows one preloaded woff2 per family and no CLS change.

## 2026-10-13

### Traffic-decline recovery round — flagship recovery, tier-aware hero offer, single canonical/hreflang

Evidence (GSC final data, 4-week window Jun 29–Jul 26 vs Sep 14–Oct 11, −4,513 clicks): brand queries −2,300 (51%; Jul 20 summer spike ending plus a real Sep 13 step, exact-brand impressions 45/day → 12/day at position 1.0), best-free flagship −1,394 (31%), GIF cluster −650 (14%), `/tools/ai-image-upscaler` −277 (position 5 → 12). Signups per GA4 Google session fell 0.38 → 0.27 on Sep 12 and did not move after the Sep 25 and Oct 3 restores. Full numbers and holes in [PRD §7](../../PRDs/seo-traffic-recovery-2026-10.md).

- **Flagship (`/blog/best-free-ai-image-upscaler-2026-tested-compared`, production DB):** title and `seo_title` → `Best Free AI Image Upscaler Online 2026: 12 Compared`; description and `seo_description` → `12 free AI image upscalers compared for 2026: which need an account, which watermark, max scale (4K/8K) and free limits. No-credit-card picks flagged.`; body: removed self-negating lines ("Not ours", "ours is not the better fit", "genuine disadvantage") and reworded "welcome credits" → "free credits". Facts unchanged: account still stated as required, no benchmark claim. Backup `backups/backup_2026-10-13_16-09-52.{schema,data}.sql.gz` verified with `gzip -t`; stored body hash equals prepared payload; live HTML serves the new title/description immediately (revalidation fix works). **Readback 2026-10-27:** page CTR > 5% at position ≤ 6 (baseline 2.4%). One change set on this page; no further edit before the readback.
- **Homepage hero (`HeroCreditOffer`):** the force-static homepage froze `CF-IPCountry` at ISR time, so every visitor read "3 free credits" and the paywalled tier (0 credits) was promised free credits. The offer line and first trust badge now follow `useRegionTier` on the client; pre-tier text is the number-free "Free credits on signup". **Readback 2026-10-27:** signups per Google session > 0.32 (baseline 0.27), branded clicks/wk > 43.
- **Head tags:** every English pSEO detail page emitted two canonical tags and two hreflang sets (factory `alternates` plus body `SeoMetaTags`/`HreflangLinks`); the body set listed all 7 locales, so English /scale, /free and /guides pages pointed hreflang at `noindex` locale pages; the localized homepage listed each hreflang twice; hub titles rendered `| MyImageUpscaler | MyImageUpscaler`. Factory/homepage metadata is now the single emitter (og:locale moved into the factory) and trailing brand suffixes are stripped. Live sample after deploy must show 1 canonical, no duplicate hreflang, and one brand per title. Guarded by `tests/unit/seo/single-head-emitter.unit.spec.ts` (red on 32 cases first).
- **Not changed on purpose:** hero/CTA/title copy on any other page (CLAUDE.md one-at-a-time rule); the 72 "Free credits for new accounts" comparison strings stay because `capability-claims` forbids hardcoding a regional grant — a tier-aware client component is the follow-up if the 2026-10-27 readback shows no signup recovery; GIF 301 consolidation (known failure); the `/_next/` robots unblock and English-only sitemap restore shipped Oct 3 and still await deploy.
- **Owner actions (cannot be done from code):** request indexing in GSC for the flagship and `/` after deploy; unschedule Outrank "Improvements" rewrites of ranked pages; check the Google OAuth consent screen (it names `xqysaylskffsfwunczbd.supabase.co`, 88% of signups pass through it); enable the CrUX History API on GCP project 614615075079 for a weekly p75 series.
- **Performance verdict:** origin mobile p75 LCP 4,026 ms (26 ms over the "poor" line), INP 256 ms, TTFB 2,854 ms; only 25% of loads are poor, so "100% poor" in GSC is a threshold effect. Sep 8/16 fixes are fully inside the 28-day window, Oct 7/10 fixes 0–18%; GSC cannot flip before about 2026-11-10. The binding cause is field TTFB (`/pricing` is `private, no-store`; cold OpenNext cache reads 1–2 s), not render priority. CWV did not cause the traffic decline.

## 2026-10-12

### Blog growth operator — two real GSC indexing requests completed

- Governing state: read the newest two cron outputs (Sep 28/Oct 5), current canonical backlogs/changelog, Oct 3 report and recent affected-file history. The newer Oct 8 YouTube exposure and this morning's best-image rung-3 HOLD supersede older deadlines. Fresh manager check through final Oct 8: **0 EDIT_NOW/REGRESSION/VERDICT, 6 HOLD, 4 GATED, 1 STOP**; flagship CTR 2.93% at position 6.1 is manager-gated, not permission to reapply the unsupported benchmark title. No repeated blog edit or cannibalizing post. Existing internal-link validator passes all 28 data files with zero invalid references; targeted static-blog link audit found no missing pSEO slug. No new safe, proven technical/content/link correction displaced the executable indexing backlog action.
- Fresh GSC web (Sep 12–Oct 9 vs Aug 15–Sep 11): named non-brand clicks **2,347 → 2,439 (+3.92%)**, branded **878 → 206 (−76.54%)**, unclassified **3,076 → 2,282** (do not relabel as brand/non-brand). Total clicks **6,301 → 4,927 (−21.81%)**, impressions **323,774 → 334,574 (+3.34%)**. GA4 Organic Search (Sep 14–Oct 11 vs Aug 17–Sep 13): sessions **7,207 → 5,709 (−20.79%)**; GA key events are not signup counts. The flagship still earns 227 clicks / 8,360 impressions at position 6.07; clear-up earns 28 / 4,009 at position 13.8. This supports clearing existing delivery/indexing work, not a causal claim or new rewrite.
- **Executed class E in the actual GSC URL Inspection UI:** requested indexing for `https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared` (Sep 16 factual repair) and `https://myimageupscaler.com/blog/how-to-clear-up-a-photo` (Aug 13 PRD 06 queue). For each exact target, read back the visible **“Indexing requested” / “URL was added to a priority crawl queue”** dialog. Normal public GETs are 200, self-canonical, index/follow and cache HIT; the flagship rendered article exposes its corrected comparison heading/vendor facts. These are actual accepted requests, not API-resolved rows and not guarantees of recrawl, new indexed copy or traffic lift.
- Updated both existing indexing rows in place, no duplicates: **71 → 69 unique pending URLs**, oldest pending group **2026-08-13**. Added `tests/unit/seo/indexing-backlog-state.unit.spec.ts` guarding URL uniqueness, the two accepted UI requests and best-image's pending-public-copy indexing gate. Blog changelog and ladder history unchanged: no content/metadata/production DB write. Fresh normal best-image GET still exposes the module but the obsolete ten-credit closing CTA; retain final-copy HOLD and do not request indexing for it.
- Verification: new test RED before backlog reconciliation, then **41/41 affected unit tests GREEN**; `yarn verify` passes (TypeScript, ICU, schema, indexation, 12 cache-config tests; 0 ESLint errors / 1,680 existing warnings). Required aggregate `yarn test <affected paths>` ran **228 API tests passed / 32 skipped**, then exceeded the explicit 180-second cap during E2E; no full aggregate/E2E-green claim. Scoped `git diff --check` passes; unrelated/concurrent dirty operations/reddit files left untouched (the pre-existing operations file has an unrelated trailing-blank-line warning).
- Action/test commit: **`ec2c253b6bd3de9e641e61cd995fc3b8ac986c0d`** (`seo: complete verified GSC indexing requests`); this entry is the companion canonical-state commit. Repository changes are local-only, **not pushed/deployed**; the two GSC submissions are already executed externally and need no deployment. No dated report-only artifact, cache purge, credentials change or production database mutation.
- Exact next triggers: **2026-10-19**, inspect the two accepted URLs for successful post-Oct-12 crawl/matching canonicals; do not submit them again merely because traffic has not improved. Continue the remaining eligible backlog from its existing unchecked rows, excluding undeployed `/tools/remove-bg` and pending-copy best-image. **2026-10-13**, verify best-image final public copy before any indexing/measurement action. Existing experiment verdict dates remain **Oct 23** for the four Oct 5 exposure rows and **Oct 26** for YouTube. João: no manual request needed for these two; persistent cache fix still requires authorized preview acceptance before any production release. No growth lift claimed yet.

### Three Kings — best-image-upscaler rung 3 applied; final public copy pending

- Refreshed final GSC daily evidence through Oct 8 plus 28-day query/page evidence. Initial check: 1 EDIT_NOW, 5 HOLD, 4 GATED, 1 STOP, no REGRESSION/VERDICT/NO_DATA. `/blog/best-image-upscaler` cooling-off window closed with 7 clicks / 1,985 impressions at position 11.8 (0.35% CTR). The Sep 24 rollback measured diagnostic LOSS (2.07→0.50 clicks/day, position +3, impressions −63%); no undo loop: retain the rollback and advance only the authorized next body rung. The position movement rules out the manager's stable-position demand gate, but is not proof of edit causation.
- Query/page evidence identifies software/subscription/workflow intent and `png upscaling algorithm 2026` (1,411 impressions, zero clicks, position 9.4 in the broad window). This URL owns 1,411 of that cluster's 1,495 impressions; preserve its software-support intent and links to the canonical free comparison rather than retargeting either sibling. Google returned a JS redirect shell, so no exact top-three ranking/depth comparison is claimed. Live primary ON1/Topaz/W3C pages verify the narrow workflow/PNG source claims; Adobe returned 403 across retrieval paths, so no unverified Adobe claim/correction was added and no whole-article expansion was attempted.
- Changed only production `content` on `https://myimageupscaler.com/blog/best-image-upscaler`: direct workflow answer, reproducible equal-size evidence module, PNG/transparency explanation and computed output-size proof; corrected four obsolete universal ten-credit claims using the region-tier credit configuration. Kept all metadata, slug, status, canonical, existing media and the free-comparison support role. No new post, deletion, deployment, broad purge or unrelated product change.
- Fresh backup gate before successful PATCH: `backups/backup_2026-10-12_09-31-36.schema.sql.gz` and `backups/backup_2026-10-12_09-31-36.data.sql.gz`. `yarn db:backup` succeeded with test extraction/byte comparison; both appeared in `yarn db:backups` and passed `gzip -t`. Retention was raised process-locally to preserve existing sets. The earlier bare PATCH returned 403 and GET proved the record unchanged; after another fresh backup, an explicit browser-like User-Agent and same-site Origin request succeeded. The original 403's cause is not established.
- Initial successful PATCH at `2026-10-12T16:34:45.892707+00:00` exposed the new module in the normal rendered article. Final audit then caught one remaining closing-CTA ten-credit claim; after another fresh schema/data backup (`backups/backup_2026-10-12_09-44-12.schema.sql.gz`, `backups/backup_2026-10-12_09-44-12.data.sql.gz`, full backup/list/gzip gate passed), corrected that clause within the same rung before any complete post-exposure day. Final PATCH at `2026-10-12T16:46:09.796203+00:00`; GET SHA256 `f3180ce35db4a0f7b910faa9a2bddae130d2fc66bb4a0efa74e8b84a555473a9` matches. Original pre-rung body SHA256 `fddb86f4a921147fe9fae9374967e2331873ff470077e4562e51945e9775cf94`, rung 3 and DB date retained; no extra history rung or failed-description reapplication.
- **End-to-end completion is pending:** three normal public checks return 200, self-canonical, index/follow and the new module in rendered `<article>`, but still show the prior closing CTA. Marked final-copy verification pending/HOLD; defer judgment and indexing until normal HTML matches the final API body. No further write, broad purge or unrelated deployment. Updated the existing indexing row and blog changelog without duplicates; native `list_pages` timed out, so no request is claimed. Final check: 0 EDIT_NOW/REGRESSION/VERDICT/NO_DATA, 6 HOLD, 4 GATED, 1 STOP. Indexing backlog remains 71 unique pending URLs, oldest pending group Aug 13.
- Verification: RED/GREEN content tests and affected manager/rollback suites pass **38/38**. Final `yarn verify` passes (TypeScript, ICU, schema, indexation and 12 cache-config tests; 0 ESLint errors, 1,680 existing warnings). A malformed generated `.next/dev/types/routes.d.ts` initially blocked final TypeScript verification: it contained a dangling route fragment after a closed declaration. Preserved the generated directory under scratch, regenerated real route types with `yarn next typegen`, and reran the full verify successfully; no product source/config changes. The required aggregate `yarn test <affected paths>` was attempted but its API Playwright web server timed out after 120 seconds before running tests; no full aggregate/API/E2E green claim. Corrected the existing Sep 24 bookkeeping test to accept evidence-backed resolved indexing rows instead of requiring them to stay permanently unchecked.
- Next eligible program review: Oct 23 for four Oct 5 exposure rows; YouTube Oct 26. Best-image remains pending: reconcile normal public final-copy exposure first, retain `dbEditDate`, then anchor its measurement date to first confirmation and require 14 complete GSC days plus exporter holdback. No fixed best-image verdict date is valid yet. Retain all HOLD/GATED/STOP controls. Bookkeeping/code is local-only; not pushed or deployed; unrelated dirty files preserved.

## 2026-10-11

### Worker-compatible blog image uploads

A built-Worker request to `/api/blog/images/upload` returned 500 during native `sharp` initialization, before auth or R2 access. The upload API and WebP output stay the same; conversion now uses Cloudflare transformations with scoped temporary R2 cleanup. Plan: `docs/PRDs/supabase-quota-recovery/02-r2-storage-migration.md`. No blog content, image references, metadata, schema, sitemap or indexing state changed. The first rollout was reverted because the probe's 52-character ownership tag exceeded the 50-character limit. The corrected probe passed on the hosted candidate at 0% traffic (upload 201, exact R2/public WebP bytes, fixture cleanup), and the candidate is now at 100% (BUILD_ID `pRwFsxSaN5IgYBMueHE_5`). Verified: 170 affected unit tests, 21 built-Worker release tests, database/home/auth guards. Manual GSC backlog items remain unchecked.

## 2026-10-10

### Free-gallery retention disclosure in dashboard and terms

Source: [PRD-SQR-04 — Free-gallery 30-day inactivity expiry](../../PRDs/supabase-quota-recovery/04-free-gallery-30d-expiry.md) (Phase 2, AC-5).

Changes:

- The English dashboard gallery (`client/components/dashboard/Gallery.tsx`) shows a retention note: free gallery images may expire after 30 days of inactivity, the user gets at least 7 days warning, signing in keeps them, and paid plans are exempt. Copy lives at `dashboard.gallery.retentionNote` in `locales/en/dashboard.json`; other locales fall back through the i18n deep merge.
- All seven `locales/*/terms.json` append one retention sentence to `credits.free.description`. Existing free-offer wording in that string is preserved.
- New lifecycle email template `emails/templates/GalleryExpiryWarning.tsx` (identifier `gallery-expiry-warning`, campaign key `gallery_expiry_warning`), registered in `server/services/email-providers/base-email-provider-adapter.ts` template, import and subject maps. CTA links to `/dashboard/gallery`. The queue, campaign seed migration and eligibility remain root-owned and are not wired here.

Validation:

- New `tests/unit/emails/gallery-expiry-warning-email.unit.spec.tsx` (4 tests) covers the copy, the CTA, the negative claims and the adapter registration.
- New `tests/unit/seo/gallery-retention-copy.unit.spec.ts` (4 tests) covers the English gallery note and the retention disclosure in all seven terms locales.
- `tests/unit/seo/free-offer-conversion-copy.unit.spec.ts` and `tests/unit/seo/protected-pages.unit.spec.ts` pass unchanged. Full `yarn verify` not run while other R2/queue editors are active.

Follow-up:

- Root wires the `gallery_expiry_warning` campaign seed and the warning send path. AC-5 stays evidence-pending until that send path exists.

### Blog images now write to Cloudflare R2 (public custom domain)

Source: [PRD-SQR-02 — Move all MIU file storage from Supabase to Cloudflare R2](../../PRDs/supabase-quota-recovery/02-r2-storage-migration.md) (Phase 2, AC-3).

Changes:

- `server/services/blogImageStorage.service.ts` now uses the shared R2 module (`put`/`deleteObject`, `R2_PUBLIC_BUCKET`, `R2_PUBLIC_BASE_URL`) instead of Supabase Storage. New uploads land in `miu-public`, whose object key equals the relative `storage_path` (no `blog/` prefix, because the public bucket holds blog images only), and return `https://assets.myimageupscaler.com/<YYYY/MM/<timestamp>-<name>.webp>`.
- The database `storage_path` stays relative (`YYYY/MM/<timestamp>-<name>.webp`), so the phase-3 DB URL rewrite can be rolled back. **No DB URL rewrite is applied in this change.**
- `next.config.js` allow-lists `assets.myimageupscaler.com` in `images.remotePatterns`; `client/utils/image-loader.ts` routes the R2 public domain through the site's Cloudflare image resizing.
- Legacy Supabase blog URLs still work (loader rewrites them to the Supabase render endpoint) and the Supabase remotePattern, CSP entry and layout preconnect stay, so no old blog image breaks. `app/[locale]/layout.tsx` adds a preconnect for the new assets domain.

Validation:

- New `tests/unit/seo/r2-blog-images.unit.spec.ts` (12 tests) covers the R2 upload/delete path, custom-domain URL, legacy Supabase compatibility, signed private R2 URLs passing through unchanged and private URLs not leaking into the public domain.
- `tests/unit/blog` (98 tests), `tests/unit/seo/image-optimization` and `tests/unit/seo/blog-lcp-hints` pass. `tsc --noEmit` and ESLint are clean on the owned files. Full `yarn verify` not run while another R2 editor is active.

Follow-up:

- Validation is pending post-deploy (AC-3 remains evidence-pending until a real blog upload renders on production).
- Phase 3: copy/verify R2 hashes with a fresh backup before any DB URL rewrite or Supabase delete. Until then both stores serve.
- Known-broken baseline: `best-image-upscaling-tools-2026` references `2026/01/1769887240667-tools-inline-1.webp`, which is absent. The similarly named `1769887231945` exists but is **not** proven to be the same asset. Do not silently replace or whitelist this reference; resolve it with hash evidence during phase-3 verification.
- `app/api/blog/images/upload/route.ts` still maps only the old Supabase error strings; an R2 failure falls through to the generic 500. Harmless, but worth aligning in a later pass.

### Temporary upscale inputs kept; retention relies on the R2 lifecycle rule

Source: [PRD-SQR-02 — Move all MIU file storage from Supabase to Cloudflare R2](../../PRDs/supabase-quota-recovery/02-r2-storage-migration.md).

Decision (corrects the earlier "clean up on terminal result" entry):

- No code deletes a temporary input at a job terminal state or at a sync route exit. Two jobs can share the same `input_storage_path` (the reservation has no unique constraint), so an early delete can break another pending job. The existing `inputs/` R2 lifecycle rule is the single owner of input expiry. Removed the async terminal cleanup and the sync route `finally` cleanup; `IReservation` dropped the optional `input_storage_path`; the orphaned `temporaryStoragePath` variable and `removeUpscaleInput` import were removed. `removeUpscaleInput` stays exported in `upscale-input-storage.service.ts` for operator and test use.
- Privacy FAQ copy corrected in `locales/en/tools.json` and `app/seo/data/tools.json`: the old answer claimed deletion "within 1 hour of processing", then "removed after processing". The answer now says temporary uploads are scheduled for automatic deletion after two days, cleanup may take longer, and saved-gallery retention is a separate policy. It no longer promises deletion after processing. Free-offer copy is unchanged.

Validation:

- `tests/unit/seo/tools-input-retention-copy.unit.spec.ts` (12 tests) pins the honest copy in both datasets, forbids a hard deletion deadline, and preserves the free-offer answer.
- `tests/unit/api/async-upscale.unit.spec.ts` covers shared-input retention on terminal success and failure; `tests/unit/api/upscale-failure-recording.unit.spec.ts` covers route-failure retention. Verified red on the shared-input guard before green.

Follow-up:

- None required. Full `yarn verify` not run while other R2 editors are active on this lane.

### Six localized dashboard gallery notes and privacy FAQ retention copy

Source: [PRD-SQR-04 — Free-gallery 30-day inactivity expiry](../../PRDs/supabase-quota-recovery/04-free-gallery-30d-expiry.md) (AC-5) and the R2 input-retention copy.

Changes:

- Added `gallery.retentionNote` to `locales/{de,es,fr,it,ja,pt}/dashboard.json`. The six strings translate the English note's exact meaning: 30-day inactivity expiry, at least 7-day warning, signing in keeps images, paid plans exempt. No English fallback; each uses the locale's own words (for example `ausgenommen`, `exentos`, `対象外`, `isentos`).
- Updated the ai-image-upscaler privacy FAQ answer in the same six `locales/*/tools.json` files (`pages[0].commonQuestions[4].answer`). The old copy promised deletion "within 1 hour of processing". The new answer matches the corrected English meaning: temporary uploads scheduled for automatic deletion after two days, cleanup may take longer, saved-gallery images follow a separate retention policy, and no training or third-party sharing.
- Both updates used `scripts/translation-helper.ts apply-inline` (UTF-8 safe); the incidental short-array reformatting was reverted so only the intended lines changed.

Validation:

- New `tests/unit/seo/multilocale-retention-copy.unit.spec.ts` (7 tests) checks all seven dashboard notes are present and non-empty, each states the 30/7-day rules and the paid exemption, and the seven privacy answers drop the 1-hour claim, promise no hard deadline, state the two-day schedule, and separate gallery retention. JSON parse and ICU brace checks included.
- Full `yarn verify` not run while other R2/queue editors are active.

Follow-up:

- None. English `tools.json` / `app/seo/data/tools.json` copy stays owned by the R2 lane.

## 2026-10-08

### Three Kings — YouTube exposure reconciled; no production edits eligible

- Refreshed final GSC daily evidence through Oct 4. Ledger check: 0 EDIT_NOW/REGRESSION/VERDICT/NO_DATA, 6 HOLD, 4 GATED, 1 STOP. No new rung, rollback, publication, production DB write, deployment or purge; backup gate was not needed.
- Normal public `https://myimageupscaler.com/blog/how-to-upscale-youtube-thumbnails` returns 200, self-canonical, index/follow, cache HIT and exposes the diagnostic module in the rendered article. Authenticated API hash exactly matches the Oct 5 write (`1e8e067b7bc53313c50e9802a16bcd92e9e3f825213d353c2f736b1a785f7fc9`). Reconciled its pending ledger row to verified with first confirmed exposure Oct 8 while preserving `dbEditDate`, rung 3 and exact prior body; no assumption about earlier exposure.
- URL Inspection reports Submitted and indexed, indexing allowed, successful crawl `2026-10-07T04:57:12Z` after the Oct 5 write and matching Google/user canonicals. Resolved its existing indexing row in place as **API-resolved, not a manual request**; unique pending rows 72 → 71 (oldest pending group Aug 13). Native desktop `list_pages` timed out; no manual request is claimed.
- Updated the blog changelog with exposure confirmation only. After reconciliation, focused manager/YouTube tests pass 30/30 and full `yarn verify` passes (TypeScript, ICU, schema, indexation and 12 cache-config tests; 0 ESLint errors, 1,680 existing warnings). No API/E2E suite claim. Unrelated dirty files remain hash-verified unchanged; pre-existing SEO backlog edits preserved. Bookkeeping is a local-only commit, not pushed or deployed.
- Next eligible review: best-image rollback Oct 12 (final data through Oct 8); four Oct 5 exposure rows Oct 23; YouTube Oct 26 (14 complete post-exposure days Oct 9–22 plus exporter holdback). Existing HOLD/GATED/STOP gates remain mandatory.

## 2026-10-07

### pSEO hero intro no longer hidden until hydration (perf only)

No copy, title, H1 or metadata change. The English pSEO `HeroSection` kept the intro `<p>` at inline `opacity:0` inside a framer-motion container until hydration. On a throttled live tool page (Slow-4G, 4x CPU) the intro became the LCP element in 1 of 5 runs at about 6.8 s; with the intro visible, LCP equaled FCP (about 3.4–4.4 s) in 5 of 5. The intro is now a plain `<p>`; badge and CTA keep their entrance animation and the visual order is unchanged. The localized `HeroSection` also gated the H1, and now renders H1 and intro as plain elements. Guards: `tests/unit/seo/pseo-hero-lcp.unit.spec.ts`, `tests/e2e/performance/web-vitals-fixes.e2e.spec.ts`. **Readback after deploy:** PSI mobile on `/tools/ai-image-upscaler` (baseline score 71–74, LCP 5.5–7.1 s) and one localized tool URL.

## 2026-10-05

### Blog growth operator — persistent invalidation fix; four indexing blockers resolved

Evidence and decision:

- Read the Sep 21/Sep 28 cron outputs, current blog changelog, indexing backlog, Oct 3 report and newer Oct 5 YouTube rung-3 entry before choosing work. The newer pending-public-exposure gate supersedes the older reports' edit deadlines; no repeated content experiment or near-duplicate post was published.
- Fresh GSC web export (Sep 5–Oct 2 vs Aug 8–Sep 4): 6,365 → 5,441 clicks (−14.52%), 334,670 → 338,692 impressions (+1.20%). GA4 Organic Search (Sep 7–Oct 4 vs Aug 10–Sep 6): 7,397 → 6,262 sessions (−15.34%); GA conversions are not treated as signups. YouTube alone has 6,548 impressions / 25 clicks, position 6.51. These trends motivate removing a delivery blocker, not a causal attribution or a claimed lift.
- Normal public GET and authenticated API checks confirm YouTube's Oct 5 diagnostic module remains absent from rendered `<article>` despite matching API hash; HTTP 200, self-canonical, index/follow, cache HIT. The checked-in OpenNext configuration omits the tag cache; the real installed adapter defaults to dummy tags, and its real cache interceptor reproduces a HIT after an invalidation write. This is a confirmed local invalidation defect; sole causation of production staleness is not established without deployed-bundle/preview proof.

Concrete action and verification:

- **Code commit `7240bd83d3a996b985b1e0c75146aaff27e25974` (`fix(seo): persist blog cache invalidation tags`):** configured the adapter's persistent sharded tag cache and ensured warm regional-cache hits still check tags. Added `NEXT_TAG_CACHE_DO_SHARDED` and additive `v2-tag-cache` migrations to production/preview Wrangler configs while preserving the durable queue and its v1 migration. Files: `open-next.config.ts`, `wrangler.json`, `wrangler.preview.json`, `tests/unit/seo/opennext-on-demand-revalidation.unit.spec.ts`. No production schema/data/cache writes, no broad purge.
- 62/62 affected unit tests pass across six suites via `yarn test:unit`; tests cover the old no-op, new page-scoped invalidation, unaffected unrelated pages, both bundles/bindings, warm regional hits and the measurement HOLD guard. Separate actual workerd + adapter SQLite Durable Object exercise passes: old entries invalidate, newer entries do not, unrelated tags do not, and persisted tags survive a runtime restart. `yarn verify` passes (TypeScript, ICU, schema, indexation and cache-config gates; 0 ESLint errors, 1,674 existing warnings). The aggregate `yarn test <paths>` expands to all API/E2E first: 228 API tests passed / 32 skipped, then timed out at 180 seconds during E2E; **full aggregate suite is not claimed green**. Targeted suites were then explicitly run and passed. `git diff --check` passed.
- Resolved existing indexing rows **in place, through read-only evidence, not manual requests** for `/blog/poster-size-dimensions-pixels`, `/blog/best-ai-upscaler`, `/blog/topaz-video-upscaler`, `/blog/topaz-labs-free-trial`: normal public articles expose their saved modules (Topaz trial meta exactly matches API); API hashes/updated_at verified; URL Inspection reports Submitted and indexed, successful post-DB-write crawls and matching Google/user canonicals. Crawl dates: Sep 27, Oct 3, Sep 26 and Sep 29 respectively. This verifies URL indexing, **not that Google has processed the revised copy**. Pending unique indexing rows decrease 76 → 72; oldest pending group remains Aug 13.
- In `three-kings-ledger.json`, retained each original write as `dbEditDate`, recorded live/API evidence, and anchored the four current experiment dates to first confirmed public exposure Oct 5 (earlier exposure unknown). No new rungs, inferred outcomes or rewritten rollback values. YouTube remains pending/HOLD; inspection's Oct 2 crawl predates its Oct 5 write. Blog changelog remains unchanged because this run did not edit blog content or metadata. Pre-existing dirty `content/blog-data.json` and `docs/seo/reddit-post-log.md` remained byte-identical to this run's saved hashes; unrelated untracked files preserved.

Deployment and exact next triggers:

- **Local commits only; not pushed or deployed.** Production freshness is not repaired yet. The next executable gate is an authorized preview release: verify compiled server/middleware tag adapter and DO export/binding, measure warm-hit CPU against the 10ms budget, then demonstrate one scoped invalidation and fresh normal-URL article without a broad purge. Only after this acceptance should a separately authorized production release proceed. Existing YouTube invalidation predates the tag store; use an approved scoped revalidation after release, not another body rewrite.
- On **2026-10-12**, inspect YouTube's normal rendered article and deployment state first. Until the diagnostic module is actually exposed, retain HOLD and do not request indexing or judge the rung. Once exposed, request indexing only through the actual GSC UI (or owner confirmation), record it, and measure from the first confirmed exposure date.
- For the four now-confirmed public pages, the 14 complete post-exposure days run Oct 6–19; earliest conservative final-data export/verdict is **2026-10-23**, replacing the earlier Oct 9/12 review assumptions below. Act if a measured LOSS requires exact rollback, or if a closed window remains below 0.2% CTR at position 3–10 / zero clicks or loses ≥30% clicks; follow each page's existing ladder/STOP gates rather than restarting an exhausted rung. No SEO lift is claimed before that readback.

### Three Kings YouTube rung 3 — API applied, public HTML pending

Evidence:

- Refreshed final GSC daily evidence through 2026-10-01 and the current 28-day query/page export. Initial ledger check: 1 EDIT_NOW, 5 HOLD, 4 GATED, 1 STOP, 0 REGRESSION/VERDICT/NO_DATA. YouTube rung 2 closed FLAT over all 14 complete post-edit GSC days (1.00→0.93 clicks/day; impressions +4%, position −0.2); latest 14 days: 13 clicks / 3,854 impressions at position 6.5. No competing canonical page was found for the blur/low-quality intent; fragment sitelinks are the same owner.
- Current official YouTube Help was fetched directly and confirms 3840×2160, 16:9, JPG/PNG, 2 MB mobile / 50 MB desktop video-thumbnail guidance. The Google search fetch returned a JS redirect shell, so an exact top-three competitive-depth comparison was not available; no whole-article expansion or benchmark claim was added.

Action and verification:

- Changed only `content` on `https://myimageupscaler.com/blog/how-to-upscale-youtube-thumbnails`: direct answer, an original/export/YouTube diagnostic proof module, pixel-count proof and linked upload guidance; corrected related contradictory DPI, guest-access and upload statements. Title, SEO title/description, slug, status, existing media and canonical remained unchanged. No new posts, deletion or unrelated production change.
- Fresh verified backup: `backups/backup_2026-10-05_09-27-17.schema.sql.gz` and `backups/backup_2026-10-05_09-27-17.data.sql.gz`. `yarn db:backup` succeeded with test extraction/byte comparison, both archives appeared in `yarn db:backups`, and both passed `gzip -t` before PATCH. Existing backup sets were retained.
- PATCH applied at `2026-10-05T16:33:09.439607+00:00`; authenticated GET exactly matches body SHA256 `1e8e067b7bc53313c50e9802a16bcd92e9e3f825213d353c2f736b1a785f7fc9`. Exact prior body SHA256 `467031956c2145dc245d6cb61196570bab592667716fba2c9ade1dcd394dd16d` is preserved in the ledger for rollback.
- **End-to-end action remains incomplete:** repeated normal public-URL checks return 200, self-canonical, `index, follow`, cache HIT, but the rendered article does not contain the new module. Revalidation/cache cause is not established; the target is absent from the local static blog inventory, so static precedence is not proven. No broad cache purge or unrelated deploy was attempted.
- Added a pending-public-exposure HOLD guard to the manager/skill so an API-only change cannot be judged as a search experiment or emit a premature regression. The final check is 0 EDIT_NOW, 6 HOLD, 4 GATED, 1 STOP, 0 REGRESSION/VERDICT/NO_DATA.
- Recorded the rung/prior value and pending exposure in the Three Kings ledger; updated the existing indexing row in place and the blog changelog. Indexing backlog remains 76 unique pending URLs (oldest pending group: 2026-08-13). Native browser `list_pages` timed out twice; CLI MCP connectivity passed but page control did not, so **no indexing request is claimed**.
- RED/GREEN verified for the new content transformation and pending-exposure guards; affected SEO suites pass 35/35. Full `yarn verify` passed after the changes (TypeScript, ICU, schema, indexation and 12 cache-config tests; 0 ESLint errors, 1,674 existing warnings). `git diff --check` passed. Unrelated dirty `content/blog-data.json` is byte-preserved (SHA256 `23ce65096417ee751d8959fce313037f9880cc24e7cd83c95d31333f516cc24e`).

Follow-up:

- Recheck normal public HTML before indexing. Once exposure is verified, retain the DB date, anchor the ledger's measurement date to the first confirmed public date, and require 14 complete post-exposure GSC days plus export holdback; do not treat the provisional 2026-10-19 DB-date window as a verdict deadline.
- Earliest other closed-window review: 2026-10-09, when this exporter's three-day holdback plus excluded current day can include final data through 2026-10-05 for the Topaz free-trial and poster rows. The September 24 rows become reviewable from 2026-10-12.

## Early October 2026 Rollup (Oct 3–4)

Full detail: `git show b129699d:docs/SEO/maintenance/seo-changes-backlog.md`; analysis and original baselines: [Oct 3 report](../reports/seo-report-2026-10-03.md).

- **Oct 3 recovery:** Sep 12 coincided with the Product Truth exposure: signups ~100→60/day (later 50), Google sessions 249→175/day, branded clicks ~25→5/day at position 1, Gemini/ChatGPT referrals −60%; named non-brand clicks rose 5–9%. Flagship CTR 7%→2.2% at flat rank; signup-intent completion 0.75→0.52. These were diagnostic associations, not isolated causation proof.
- Restored homepage free/no-card meta description and FAQ; corrected `llms.txt`/`llms-full.txt` signup wording. Derived sitemap index from `ALL_CATEGORIES` (43→46, scale/free/guides restored); removed the `/_next/` robots disallow. Guards: free-offer-conversion-copy, llms-txt, sitemap-index, robots, pseo-category-coverage.
- **Oct 4 tests:** removed sequential production sitemap crawl; local-build seo-guard checks all child `<loc>` duplicates plus blog/platform sitemap registration. No sitemap output change.
- **Follow-ups superseded:** Oct 13 records flagship/head-emitter recovery, Oct 15 confirms deployment, Oct 17 records homepage indexing. Do not revive the old pending-deploy or canonical-branch blockers. Historical readbacks were brand 41–43 clicks/week, Gemini 3–4 sessions/day, signups 50/day; current gates are in the later entries.

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
