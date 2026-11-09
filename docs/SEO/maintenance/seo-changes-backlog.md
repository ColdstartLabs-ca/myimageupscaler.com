# SEO Changes Backlog

Purpose: keep a concise operational trail of SEO changes so future audits can connect ranking, indexing, CTR, and attribution movement to actual site changes.

Maintenance rules:

- Add an entry every time SEO-facing code, metadata, content, sitemap, schema, canonical, hreflang, robots, redirects, IndexNow, GSC, GA4 attribution, pSEO data, or blog SEO changes.
- Keep entries short: what changed, why, files/surfaces touched, validation, and follow-up.
- Keep the last ~3 weeks in full detail. Roll older entries into one monthly rollup (newest month first) when the file passes ~80 KB. See the `seo-changes-backlog` skill for the rollup recipe.
- Full pre-rollup detail for 2026-05 → 2026-10-19 stays in git: `git show 3bdb8f1e:docs/SEO/maintenance/seo-changes-backlog.md`.
- Link related reports, PRDs, or follow-up backlog files instead of pasting long analysis.

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

## Early October 2026 Rollup (Oct 3–12)

Full detail through Oct 12: `git show e0ef9919:docs/SEO/maintenance/seo-changes-backlog.md`; earlier detail: `git show cf5af57c:docs/SEO/maintenance/seo-changes-backlog.md` and `git show b129699d:docs/SEO/maintenance/seo-changes-backlog.md`; analysis and original baselines: [Oct 3 report](../reports/seo-report-2026-10-03.md).

- **Oct 12 indexing:** actual GSC UI requests accepted for `/blog/best-free-ai-image-upscaler-2026-tested-compared` and `/blog/how-to-clear-up-a-photo`, visible priority-crawl-queue confirmations; commit `ec2c253b`. `indexing-backlog-state.unit.spec.ts` protects accepted-request history and uniqueness. Oct 19 post-request crawl evidence and later flagship recovery now govern; do not request again from this historical entry. Named non-brand clicks Sep 12–Oct 9 versus prior 28 days rose 2,347→2,439, branded fell 878→206, unclassified 3,076→2,282; GA4 Organic Search sessions fell 7,207→5,709. No causal/signup claim.
- **Oct 12 best-image rung 3:** `/blog/best-image-upscaler` advanced only after the Sep 24 diagnostic rollback window closed (7 clicks / 1,985 impressions / position 11.8); retained failed-description rollback. Software-workflow/PNG intent, including 1,411/1,495 cluster impressions, justified a content-only direct answer and equal-size/PNG/PPI evidence module linked to primary ON1/Topaz/W3C sources. Universal ten-credit claims, including a same-run closing-CTA completion, became tier-safe. Metadata, media, slug/status and free-comparison support ownership retained; Google SERP and Adobe retrieval were blocked, so no unverified competitor-depth claim or broad expansion. Fresh backup/list/gzip gates preceded each successful PATCH. A prior 403 left the DB unchanged; its cause is unproven. Final API write `2026-10-12T16:46:09.796203+00:00`, body SHA256 `f3180ce35db4a0f7b910faa9a2bddae130d2fc66bb4a0efa74e8b84a555473a9`; exact prior body/DB date preserved in ledger. Initial normal article still had the old closing CTA: public-copy HOLD, no indexing/measurement start until Oct 15 verified exposure. Later Nov 2 WIN and API-resolved indexing supersede this blocker. Guards: `three-kings-2026-10-12`, `three-kings-exposure-2026-10-15`, `indexing-backlog-state`. Malformed generated route types were preserved/regenerated without product edits. Local-only then; no unrelated deploy/cache purge. Subsequent dated entries govern current windows.

- **Oct 10–11 R2/blog delivery:** `server/services/blogImageStorage.service.ts` writes WebP to `miu-public`/`assets.myimageupscaler.com` with relative storage paths and legacy Supabase compatibility (`r2-blog-images.unit.spec.ts`). The upload route's native `sharp` initialization failed in a built Worker; replaced conversion with Cloudflare transformations and scoped temporary R2 cleanup. First rollout was reverted for the probe's overlength ownership tag; corrected upload returned 201 with exact R2/public bytes and fixture cleanup, then went to 100% (BUILD_ID `pRwFsxSaN5IgYBMueHE_5`). No blog content/indexing change. Historical phase-3 follow-up: fresh backup, copy/hash verification before DB URL rewrite or Supabase deletion; the old `best-image-upscaling-tools-2026` asset `1769887240667-tools-inline-1.webp` was absent, and `1769887231945` is not a proven substitute. Later Oct 12 image-migration/Nov 1 redirect evidence supersedes stale blanket deploy blockers; unresolved asset identity and generic upload-error mapping were not re-verified in this rollup.
- **Oct 10 retention copy:** all seven dashboard/terms locales disclose 30-day free-gallery inactivity expiry, at least seven days warning, sign-in preservation and paid exemption. `GalleryExpiryWarning.tsx` and adapter registration added; root-owned campaign seed/eligibility/send integration remained evidence-pending (PRD-SQR-04 AC-5; status not re-verified here). Privacy FAQ in `app/seo/data/tools.json` and all seven tool locales states temporary-upload deletion scheduled after two days, potentially later cleanup, separate saved-gallery policy; free-offer copy retained. Never delete shared temporary input objects on a single job's terminal event: two jobs can share `input_storage_path`; R2 lifecycle owns expiry. Guards: `gallery-retention-copy`, `multilocale-retention-copy`, `tools-input-retention-copy`, async-upscale/upscale-failure-recording and gallery-expiry-warning email specs.
- **Oct 7 hero performance:** removed hydration-hidden opacity from pSEO intro and localized H1, preserving copy/CTAs. Throttled runs changed LCP ~6.8s (1/5) to FCP-aligned 3.4–4.4s (5/5); not field proof. Guards: `pseo-hero-lcp.unit.spec.ts`, `web-vitals-fixes.e2e.spec.ts`. Historical post-deploy PSI follow-up on `/tools/ai-image-upscaler` and one localized tool remains unverified in this rollup.
- **Oct 8 YouTube exposure:** verified the Oct 5 body hash in normal HTML; successful post-write crawl `2026-10-07T04:57:12Z`, Submitted and indexed, matching canonicals; API-resolved, not manually requested. Anchored first confirmed exposure Oct 8 (Oct 9–22 measurement, Oct 26 final-data review). Later Oct 26 bounded rollback and Nov 13 cooling-off gate govern current action.

- **Oct 5 cache delivery:** `7240bd83` configured persistent sharded tags (`NEXT_TAG_CACHE_DO_SHARDED`, additive `v2-tag-cache`) and tag checks on warm regional hits in `open-next.config.ts` and both Wrangler configs. Actual adapter/workerd checks proved scoped invalidation, unrelated-tag isolation and restart persistence; `opennext-on-demand-revalidation.unit.spec.ts` guards the defect. Local-only at that time; the next authorized preview still needed compiled binding/DO export, warm CPU ≤10ms and live freshness acceptance before production. Do not infer later deployment from this historical entry.
- **Oct 5 YouTube rung 3:** changed `/blog/how-to-upscale-youtube-thumbnails` body only (original/export/YouTube diagnostics, pixel-count proof, linked upload guidance and factual guest/DPI repairs). Rung 2 was FLAT (1.00→0.93 clicks/day, impressions +4%, position −0.2). API hash/prior body retained in ledger after verified backup; public HTML was initially stale, so added the pending-exposure HOLD guard. Oct 8 verified public exposure and post-write crawl; Oct 26 subsequently rolled back only the failed diagnostic module. Those newer entries supersede the original pending-exposure/review dates; never restore obsolete factual claims or restart this rung.
- **Oct 5 indexing reconciliation:** poster, best-ai, Topaz Video and Topaz trial were API-resolved from successful post-write crawls (Sep 27, Oct 3, Sep 26, Sep 29); no manual requests. Preserved original `dbEditDate` and anchored conservative measurement to confirmed Oct 5 exposure (Oct 6–19, earliest final export Oct 23). Later outcomes/reopenings/resolutions govern current state; the historical 76→72 pending count is not today's queue. GSC Sep 5–Oct 2 clicks 6,365→5,441 (−14.52%), GA4 organic Sep 7–Oct 4 sessions 7,397→6,262 (−15.34%); no causal or signup inference.

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
