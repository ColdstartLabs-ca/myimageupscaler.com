# PRD: Organic Traffic Recovery, October 2026

Status: PROPOSED. Written 2026-10-06. No site change has shipped from this plan.

## 1. Problem

GSC shows 20 URLs losing clicks. Window: current 2026-09-06 to 2026-10-03, previous 2026-08-09 to 2026-09-05.

| Metric           | Previous 28d | Current 28d | Change      |
| ---------------- | ------------ | ----------- | ----------- |
| Clicks           | 6,353        | 5,394       | -959 (-15%) |
| Impressions      | 333,727      | 336,876     | +1%         |
| Branded clicks   | 885          | 346         | -539        |
| Non-brand clicks | 2,309        | 2,537       | +228        |

Do not trust the GSC "average position" figure (17.55 to 10.27). Phantom-query clusters distort it.

## 2. Evidence

### E1. The daily step-down starts on 2026-09-11

Daily clicks run about 235/day up to 2026-09-10. They fall to about 165/day from 2026-09-12 and stay there through 2026-10-03.

The Product Truth deploy (`b90c56da`, `d4781071`) shipped on 2026-09-10. It removed free-offer wording from the homepage, tools, free, scale and blog copy. The restore (`3143e88e`) shipped on 2026-09-25. Clicks did not rebound by 2026-10-03.

Likely reason: Google needs weeks to recrawl and re-snippet the restored copy. This matches the signup drop of about 40% already in memory. Treat it as a strong correlation, not proven cause.

### E2. Branded clicks account for 56% of the net loss

- `/` lost 563 clicks. The query "myimageupscaler" alone lost 352.
- Brand impressions fell by 680. Brand CTR fell from 9.25% to 5.79% at position 1.
- Two causes are likely. Fewer visitors means fewer brand searches. The homepage meta description lost its free offer from 2026-09-10 to 2026-10-03.
- `/fr` (-41) shows the same pattern.

### E3. One page holds the largest non-brand loss

`/blog/best-free-ai-image-upscaler-2026-tested-compared` lost 498 clicks (844 to 346). Position held at about 5.7. CTR fell from 8.08% to 3.66%.

Our changes on this page:

- 2026-08-17: proof-led H1 and description.
- 2026-09-10: rollback, then title changed to "Limits Compared".
- 2026-09-16: vendor facts corrected.

Suspect the 2026-09-10 title change plus the free-wording removal. Daily data must confirm this before any edit.

### E4. About 10 URLs lost impressions with flat position

These are `/blog/gif-upscaler`, `/tools/ai-image-upscaler`, `/blog/photoshop-upscale-image`, `/format-scale/png-upscale-4x`, `/scale/2k-upscaler`, `/blog/free-ai-upscaler-no-watermark`, `/blog/best-ai-image-quality-enhancer-free`, and three low-position pages.

Our rule (`gsc-causation-correlation` skill): impressions down with position flat is a demand or SERP change. Do not edit content over it.

The low-position pages are `/scale/4k-image-upscaler` (position 36 to 65), `/free/free-photo-enhancer` (position 65 to 71) and `/fr/scale/hd-upscaler` (15 impressions). Their losses are noise from junk positions.

### E5. Real ranking losses, with no edit from us

- `/blog/cartoon-to-realistic-ai`: position 12.1 to 16.0.
- `/pt`: position 26.9 to 33.6.

### E6. Expected losses from the intentional locale retraction

`/es/formats/upscale-gif-images`, `/fr/scale/hd-upscaler` and `/de/tools/transparent-background-maker` serve `noindex, follow` and sit outside every sitemap. This follows commit `d08a19da` (2026-08-25). No action. Total at stake: about 56 clicks.

### E7. Real technical defects, verified live on 2026-10-06

1. `/free/free-photo-enhancer` emits two identical canonical tags.
2. The same page has a doubled brand title: "... | MyImageUpscaler | MyImageUpscaler".
3. Code gap: the fix for duplicate canonicals sits on unshipped branch `seo/canonical-single-emitter`.
4. Code gap: `7240bd83` (blog cache tags) is local only. The YouTube thumbnail rung-3 body is live in the DB but the public HTML is stale.

Scout claim NOT confirmed: "hreflang tags duplicated on every localized page". A curl grep found no hreflang link tags in the homepage head. Re-check before acting.

## 3. Plan

Rule for every step: one change per page per measurement window. No bulk copy edits. Each change gets a `seo-changes-backlog.md` entry and a 7-day readback. Free-offer wording stays wherever the regional grant is above zero.

### Phase 0: Measure, no site change (about 30 minutes)

1. Run `gsc-daily-correlate.cjs` for `best-free-ai-image-upscaler` and the homepage. Add the 2026-09-10, 2026-09-16, 2026-09-25 and 2026-10-03 events to `default-events.json`.
2. Pass test: the best-free CTR step lands on 2026-09-10 or 2026-09-11. If it does not, stop and drop E3 as a title problem.
3. Pull brand-query daily data for "myimageupscaler". Pass test: brand impressions fell before 2026-09-10 means a demand cause. After means a snippet or traffic cause.

### Phase 1: Ship the pending code fixes (about 2 hours)

1. Merge `seo/canonical-single-emitter` with a unit test in `tests/unit/seo/`. Fixes defect E7.1.
2. Fix the doubled brand suffix on `/free/free-photo-enhancer` with a unit test. Fixes defect E7.2.
3. Deploy `7240bd83` so cache tags persist. Then confirm the YouTube page HTML shows the rung-3 body.
4. Add a backlog entry for each. After deploy, request indexing for `/free/free-photo-enhancer` and the YouTube thumbnail URL. Log both in `gsc-request-indexing-backlog.md`.

### Phase 2: One snippet test on the best-free page (only if Phase 0 step 2 passes)

1. Reword the title to restore a "Free" plus number hook. It must stay factually safe. Do not bring back "Tested". Example direction: "Best Free AI Image Upscalers 2026: Free Limits Compared".
2. Edit only the title. Use the `blog-edit` API mechanics and run the backup gate first.
3. Backlog entry, 7-day readback. Success: CTR above 6% at position 5 to 6.

### Phase 3: Wait for recrawl (no edits)

1. Homepage description restored on 2026-10-03. Read back on 2026-10-10 and 2026-10-17.
2. Track daily clicks. Success: back to 215/day or more by 2026-10-17. Full recovery target: 235/day by 2026-10-31.
3. If clicks stay at about 165/day on 2026-10-17, request indexing for `/`, `/tools/ai-image-upscaler` and the best-free blog. Then open a new analysis.

### Phase 4: Do not touch

- The 10 demand-bucket URLs in E4.
- The three `noindex` locale URLs in E6.
- `/scale/4k-image-upscaler`, `/free/free-photo-enhancer` and `/fr/scale/hd-upscaler` content. Positions are too low.
- `/blog/cartoon-to-realistic-ai` and `/pt`. Add them to the Three Kings ladder only after the readbacks above.

## 4. Risks and open questions

- E1 is a time correlation. Seasonality or a Google update could add to it.
- Two post-09-25 restores may take 3 to 6 weeks to show in GSC.
- The free-tier offer is still 0 credits in some regions. Copy must stay region-safe.

## 5. Verification (required before closing)

- `yarn test` on affected areas, `yarn verify` green.
- New or changed SEO behavior covered in `tests/unit/seo/`.
- Backlog entries appended to `docs/SEO/maintenance/seo-changes-backlog.md`.
- Move this PRD to `docs/PRDs/done/` with `git mv` in the closing commit.

## 6. Evidence files (session scratchpad, not committed)

`gsc28.json` (GSC export), `r1-gsc.md`, `r2-changes.md`, `r3-live.md` (scout reports).

## 7. Execution round, 2026-10-13

Status: IN PROGRESS. Source: full re-investigation on 2026-10-13 (GSC daily, GA4, prod DB read-only, live HTML, CrUX via PSI).

### 7.1 What the data says (4-week window Jun 29–Jul 26 vs Sep 14–Oct 11, -4,513 clicks)

| Share | Loss                        | Cause                                                                                   | Fixable |
| ----- | --------------------------- | --------------------------------------------------------------------------------------- | ------- |
| 51%   | Brand queries (-2,300)      | Jul 20 summer spike ended. Sep 13 step: exact-brand impressions 45/day to 12/day, pos 1 | Partly  |
| 31%   | Best-free flagship (-1,394) | July query demand drop, then Aug 17 and Sep 10 edits: CTR 12% to 2.4% at flat pos 5–6   | Yes     |
| 14%   | GIF cluster (-650)          | Aug 8 301 consolidation never transferred rankings                                      | No      |
| 6%    | `/tools/ai-image-upscaler`  | Pos 5 to 12 since mid-Sep; queries moved to `/scale/upscale-8x` and `/scale/*-8k`       | Watch   |

Signups per GA4 Google session: 0.38 to 0.27 on Sep 12, flat after the Sep 25 and Oct 3 restores. Returning active users are flat (DB), so the lost brand searchers are new people. Purchases 13/wk to 6/wk.

### 7.2 Holes the earlier rounds left

1. Flagship title, description and body still carry the Sep 10 copy. The body tells readers and AI assistants "Not ours" and "Upscayl or Bigjpg are the better fit and ours is not".
2. Homepage hero subtext is server-rendered on a force-static page: every visitor reads "3 free credits". Standard tier (45%) gets 5, paywalled (26%) gets 0.
3. 72 comparison strings still read "Free credits for new accounts" (were "5 free credits").
4. Every English pSEO detail page emits two canonical tags (`SeoMetaTags` plus metadata API). Hub pages and some detail pages render "| MyImageUpscaler | MyImageUpscaler".
5. Homepage LCP hero preload has no `fetchpriority=high` and competes with the blurred "before" preload.
6. Local `master` diverged from `origin` (fixed: merge `6375bff1`).

### 7.3 Work items

| ID  | Change                                                     | Verify                                                     | Readback (metric, date)                       |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| W1  | Flagship title, description, body positioning (DB)         | Backup gate; API readback; live HTML                       | Page CTR > 5% at pos ≤ 6, 2026-10-27          |
| W2  | Hero credit subtext follows the visitor's real tier        | Unit test red then green; live check                       | Signups per Google session > 0.32, 2026-10-27 |
| W3  | Comparison strings: "Up to 5 free credits"                 | Free-offer guard specs green                               | Same as W2                                    |
| W4  | One canonical per page; no doubled brand in titles         | `tests/unit/seo/` spec red then green; live sitemap sample | Live sample: 0 duplicates                     |
| W5  | Homepage hero preload priority                             | Live HTML shows one high-priority preload                  | PSI mobile `/` LCP                            |
| W6  | Ship: `yarn verify`, `yarn test`, push, deploy, live check | All green; live checks pass                                | —                                             |

### 7.4 Not fixable in code (owner actions)

- Request indexing in GSC for the flagship and `/` after W1 and W2 are live.
- Outrank: unschedule the "Improvements" rewrites of ranked pages.
- Google OAuth consent screen: check brand verification. The screen names `xqysaylskffsfwunczbd.supabase.co` (88% of signups pass through it).
- Enable the CrUX History API (`gcloud services enable chromeuxreport.googleapis.com --project 614615075079`) to get the weekly p75 series.
- Field TTFB p75 is 2.85 s (58% poor). Fix needs edge HTML caching, which is out of scope here. See §7.5.

### 7.5 Performance verdict (2026-10-13)

Origin mobile p75 LCP 4,026 ms (26 ms over the "poor" line), INP 256 ms, TTFB 2,854 ms. GSC "100% poor" is a threshold effect: 25% of loads are poor. The Sep 8 and Sep 16 fixes are fully inside the window. The Oct 7 and Oct 10 fixes are 0–18% inside, so GSC cannot flip before about 2026-11-10. TTFB is the binding cause: `/pricing` is `private, no-store`, and cold OpenNext cache reads take 1–2 s. CWV did not cause the traffic decline (poor since July while clicks grew 10×).
