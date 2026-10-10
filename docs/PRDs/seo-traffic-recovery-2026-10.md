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
