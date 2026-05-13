# Growth Skills Validation - 2026-05-13

Purpose: verify the newly created growth skills by running them against myimageupscaler.com data and checking whether they produce useful decisions, not just valid `SKILL.md` files.

## Data Used

- Fresh GSC pull: `sc-domain:myimageupscaler.com`, 28 days, fetched 2026-05-13 with the project-scoped fetcher.
- GSC output: `/tmp/gsc-miu-tighten.json`.
- Fresh GA4 pull: property `519826120`, Organic Search, 28 days, fetched 2026-05-13 with the project-scoped fetcher.
- GA4 output: `/tmp/ga-miu-tighten.json`.
- Synthesized output: `/tmp/seo-plan-miu-tighten.json`.
- pSEO inventory output: `/tmp/pseo-inventory-miu.json`.
- GSC latest complete date is expected to lag by 2-3 days; GA4 lags roughly 24 hours.

## Scope Cleanup

The new growth skills were moved from the global Claude skills root into this project:

- `.claude/skills/seo-growth-plan-technique`
- `.claude/skills/seo-money-page-lift-technique`
- `.claude/skills/serp-ctr-snippet-rewrite-technique`
- `.claude/skills/search-intent-cta-mapping-technique`
- `.claude/skills/cannibalization-consolidation-technique`
- `.claude/skills/pseo-page-quality-scoring-technique`
- `.claude/skills/organic-funnel-attribution-repair-technique`

The old global project-specific duplicates for `gsc-analysis` and `seo-content-3-kings-technique` were removed from `/home/joao/.claude/skills` after confirming richer project-scoped copies exist in `.claude/skills`. A final grep found no remaining global root skill references to `myimageupscaler`, `MIU`, `519826120`, or this project's upscaler-specific SEO workflows.

## GSC Baseline

| Metric                           |        Value |
| -------------------------------- | -----------: |
| GSC clicks                       |        1,979 |
| GSC impressions                  |       77,805 |
| GSC average CTR                  |        2.54% |
| GSC average position             |        10.62 |
| GSC click delta                  |      -16.81% |
| GSC impression delta             |       +9.26% |
| GA organic sessions              |        2,698 |
| GA organic engagement rate       |       72.91% |
| GA organic conversions           |            0 |
| GSC clicks / GA organic sessions | 0.73, normal |
| Joined URLs                      |          298 |
| URLs with both GSC + GA          |           82 |

## Skill Validation Summary

| Skill                                         | Verdict                         | Why                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `seo-growth-plan-technique`                   | Very useful                     | Now points directly at the project GSC, GA4, and synthesis scripts and correctly gates SEO work behind tracking sanity.                                                  |
| `seo-money-page-lift-technique`               | Very useful / attribution-gated | Fresh GA4 data works. The skill now separates real money-page UX opportunities from measurement gaps and auth/dashboard artifacts.                                       |
| `serp-ctr-snippet-rewrite-technique`          | Very useful                     | Fresh GSC produced obvious zero-click rankers that need snippet/answer/FAQ work.                                                                                         |
| `search-intent-cta-mapping-technique`         | Very useful                     | Now requires CTA recommendations to name events, segments, and attribution caveats.                                                                                      |
| `cannibalization-consolidation-technique`     | Very useful                     | Fresh GSC still shows competing URLs for the same query clusters.                                                                                                        |
| `pseo-page-quality-scoring-technique`         | Very useful / close             | Now includes a deterministic inventory script that found 358 pSEO pages and family-level CTA/content signals. Full scoring still needs joined URL performance by family. |
| `organic-funnel-attribution-repair-technique` | Very useful and high priority   | Fresh GA4 confirms the trigger: total conversions exist, Organic Search conversions are zero, and `(not set)` has 29 conversions.                                        |

## Actual Outputs From The Skills

### 1. SEO Growth Plan Technique

Biggest bottleneck: not discovery. Google is showing the site for high-intent terms, but clicks are leaking through CTR/cannibalization, and Organic Search conversion value is unreadable because GA4 shows zero Organic conversions while total conversions exist.

| Priority | Cluster                           | Evidence                                                                         | Action                                                                        | Skill                                                                           |
| -------: | --------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
|        1 | Organic conversion attribution    | GA4: 29 total conversions, 0 Organic conversions; `(not set)` has 29 conversions | Repair source/session continuity through auth, dashboard, checkout, purchase  | `organic-funnel-attribution-repair-technique`                                   |
|        2 | Best free AI image upscaler 2026  | 3,288 impressions, 0 clicks, avg position 8.31, 3 URLs                           | Keep one canonical page, rewrite SERP snippet, verify redirects/support links | `serp-ctr-snippet-rewrite-technique`, `cannibalization-consolidation-technique` |
|        3 | Money page conversion measurement | `/` has 1,198 organic sessions, `/dashboard` has 1,169, both 0 conversions       | Treat as attribution-gated money-page lift, not pure CTA failure              | `seo-money-page-lift-technique`, `organic-funnel-attribution-repair-technique`  |
|        4 | Upscaling vs sharpening           | 464 impressions for difference query, 0 clicks, two URLs                         | Strengthen primary explainer and make support page clearly subordinate        | `cannibalization-consolidation-technique`                                       |
|        5 | pSEO quality                      | Inventory found 358 pSEO pages; several large families have 0 CTA fields         | Score families before scaling more pages                                      | `pseo-page-quality-scoring-technique`                                           |

Verdict: useful. It correctly prevented "publish more content" from being the default answer.

### 2. SERP CTR Snippet Rewrite Technique

The skill produced useful rewrite targets immediately.

| Query                                               | Primary URL                                              | Impressions | Clicks | Avg position | Diagnosis                                                              |
| --------------------------------------------------- | -------------------------------------------------------- | ----------: | -----: | -----------: | ---------------------------------------------------------------------- |
| `best free image upscaler 2026`                     | `/blog/best-free-ai-image-upscaler-2026-tested-compared` |         641 |      0 |         8.78 | Strong rank, zero clicks, likely snippet/intent/cannibalization issue. |
| `ai image upscaling vs sharpening explained`        | `/blog/ai-image-upscaling-vs-sharpening-explained`       |         245 |      0 |         2.21 | Very strong rank, zero clicks, answer/snippet issue.                   |
| `best free ai image upscaler 2026 no signup`        | `/blog/best-free-ai-image-upscaler-2026-tested-compared` |         252 |      0 |         5.87 | CTA/snippet must explicitly answer no-signup expectation if true.      |
| `best free online ai image upscaler no signup 2026` | `/blog/best-free-ai-image-upscaler-2026-tested-compared` |         252 |      0 |         5.33 | Same canonical page should own no-signup modifier.                     |

Sample rewrite brief:

- URL: `/blog/best-free-ai-image-upscaler-2026-tested-compared`
- Title: `Best Free Image Upscaler 2026: No Signup Options`
- Meta: `Compare free AI image upscalers for 2026 by signup, watermark, 4K/8K output, quality, and limits before you upload.`
- H1: `Best Free AI Image Upscaler 2026: Tested for No Signup, No Watermark, and 8K`
- Direct answer block: Add a short top block naming the best overall free tool, best no-signup option, best no-watermark option, and best 8K option.
- FAQ additions: `What is the best free image upscaler in 2026?`, `Which free AI upscaler has no signup?`, `Which free AI upscaler has no watermark?`, `Can a free image upscaler export 8K?`
- Validation: request indexing, then compare GSC CTR/clicks after 14 and 28 days.

Verdict: very useful. This is the clearest immediate traffic skill.

### 3. Cannibalization Consolidation Technique

The skill found actionable clusters.

| Cluster                                | Evidence                                                                       | Decision                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Best free AI image upscaler 2026       | 3,288 impressions, 0 clicks, 3 URLs                                            | Primary: `/blog/best-free-ai-image-upscaler-2026-tested-compared`; retarget or redirect/support `/blog/best-image-upscaler`; keep enhancer page out of upscaler intent. |
| Best free AI image upscaler tools 2026 | 313 impressions, 0 clicks, 3 URLs                                              | Primary: canonical tested/compared page; verify old tools listicle is redirected or clearly supports the canonical page.                                                |
| Upscaling vs sharpening                | 464 impressions for difference query and 245 for exact explainer query, 2 URLs | Primary: `/blog/ai-image-upscaling-vs-sharpening-explained`; support/retarget `/blog/photo-enhancement-upscaling-vs-quality`.                                           |
| Best free AI image upscaler no signup  | 271 impressions, 0 clicks, 2 URLs                                              | Primary: canonical 2026 comparison; support no-watermark/no-signup page with exact internal link to primary.                                                            |

Verdict: very useful. It turns GSC overlap into URL decisions instead of another generic audit.

### 4. Search Intent CTA Mapping Technique

The skill produced usable CTA mappings.

| Intent                     | Page/Cluster                                       | CTA                                            | Destination                             | Placement                                             |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| Best free / no signup      | Canonical best-free comparison                     | `Try a free upscale` or `Upload an image free` | Tool upload flow                        | First viewport and after comparison table             |
| No watermark               | No-watermark support post and canonical comparison | `Upscale without watermark` only if true       | Tool or pricing depending actual gating | Hero support copy and FAQ                             |
| 8K                         | Best-free and scale pages                          | `Check 8K output options`                      | 8K/scale page or pricing limits         | Comparison table row and CTA near output-size section |
| Sharpen/unblur             | `/blog/best-ai-image-quality-enhancer-free`        | `Sharpen a blurry photo`                       | Photo enhancer/sharpener tool           | After first diagnostic section                        |
| Upscaling vs sharpening    | Explainer post                                     | `Compare on your image`                        | Upscaler/enhancer tool choice           | Immediately after comparison table                    |
| Pricing/brand navigational | `/pricing`, `/free`, `/tools`                      | `See plans` or `Start with free credits`       | Pricing or upload path                  | Above fold and sticky mobile footer                   |

Verdict: useful. It catches a real gap: the site has CTAs, but they need intent-specific promises.

### 5. SEO Money Page Lift Technique

Fresh GA4 validation works. The important tightening is that money-page lift must not mistake attribution failure for pure CTA failure.

| Page                                                     | GSC signal                                              | Likely money action                                                                        | Missing data                             |
| -------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `/`                                                      | 1,198 organic sessions, 79.8% engagement, 0 conversions | Treat as high-priority attribution-gated money page; measure upload/signup by landing page | GA4 key-event continuity                 |
| `/dashboard`                                             | 1,169 organic sessions, 94.9% engagement, 0 conversions | Treat as product/funnel attribution page, not SEO content page                             | Auth/session stitching                   |
| `/blog/best-free-photo-restoration-services-online`      | 83 organic sessions, 77.1% engagement, 0 conversions    | Add restoration-specific upload CTA and measure upload start                               | Key events by landing page               |
| `/blog/best-free-ai-photo-enhancer-online`               | 60 organic sessions, 50% engagement, 0 conversions      | Add enhancer/sharpener CTA and link to tool                                                | CTA + upload events                      |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` | 3,288 impressions, 0 clicks for main query              | CTR/cannibalization first; CTA second                                                      | Post-click engagement after CTR improves |

Verdict: very useful, with an attribution gate. The project GA fetcher supplies the required landing-page/session/engagement/conversion data.

### 6. pSEO Page Quality Scoring Technique

The skill is now close to very useful because it has a deterministic project inventory script.

Inventory run:

- Total pSEO pages found: 358.
- Largest families: `platform-format` 43 pages, `interactive-tools` 38, `format-scale` 36, `competitor-comparisons` 22, `alternatives` 19, `device-use` 17, `scale` 17.
- Families with many pages but 0 explicit CTA fields in the JSON inventory include `platform-format`, `format-scale`, `competitor-comparisons`, `device-use`, `scale`, `industry-insights`, and `use-cases`.

Sample partial scoring from available GSC:

| Family/Page                | GSC evidence                                                               | Preliminary action                                                              |
| -------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `/scale/upscale-16x`       | 44 clicks, 452 impressions, 29 GA sessions, 13.8% bounce                   | Keep/improve; link new 16x blog post to/from scale page.                        |
| `/tools/ai-image-upscaler` | Commercial tool page should be checked in joined plan and inventory        | Improve/internal-link; likely worth more authority.                             |
| `/free`                    | Should be scored as a free-tool family/hub with CTA and attribution checks | Improve snippet and CTA promise; check whether brand queries distort page role. |
| English-only pSEO groups   | Prior reports flagged sitemap/hreflang validator policy                    | Keep English-only policy explicit; monitor indexation by family.                |

Verdict: very useful / close. It can now generate the page-family inventory itself; the remaining limitation is that full 0-100 scoring still requires joining inventory URL paths to GSC+GA performance by family.

### 7. Organic Funnel Attribution Repair Technique

The skill matched a real issue already present in the repo.

Confirmed symptom from fresh GA4:

- Total conversions: 29.
- Organic sessions: 2,698.
- Organic engagement rate: 72.91%.
- Organic conversions: 0.
- `(not set)` source/medium conversions: 29.
- `google / organic` sessions: 1,980, conversions: 0.

Useful repair plan produced:

1. Verify GA4 key events are marked for `image_uploaded`, `image_upscale_started`, `upscale_completed`, `signup_started`, `signup_completed`, `checkout_opened`, `checkout_started`, `checkout_completed`, and `purchase_confirmed`.
2. Trace organic landing page -> auth callback -> dashboard -> checkout -> success with source/medium, landing page, user ID, anonymous ID, GA client/session ID, and Stripe customer/session IDs.
3. Check whether server-side purchase events include enough GA4 client/session attribution to avoid becoming Unassigned.
4. Confirm payment/auth domains are not becoming conversion referrers.
5. Validate after deployment by watching Organic Search conversions and Unassigned conversions over the next complete data window.

Verdict: useful and high priority. It is a diagnosis skill, not a direct implementation skill, which is appropriate.

## Overall Verdict

The skill set is now useful and project-scoped. Most skills are very useful; pSEO scoring is close because it now produces an inventory but still needs family-level performance joins for final scoring.

Keep:

- `seo-growth-plan-technique`
- `seo-money-page-lift-technique`
- `serp-ctr-snippet-rewrite-technique`
- `search-intent-cta-mapping-technique`
- `cannibalization-consolidation-technique`
- `organic-funnel-attribution-repair-technique`
- `pseo-page-quality-scoring-technique`

## Recommended Next Implementation Actions

1. Do not publish another "best free AI image upscaler" article.
2. Re-run indexing and CTR validation for `/blog/best-free-ai-image-upscaler-2026-tested-compared`.
3. Verify redirects or support links for the older listicle URLs competing with the canonical best-free page.
4. Strengthen `/blog/ai-image-upscaling-vs-sharpening-explained` as the primary answer and make `/blog/photo-enhancement-upscaling-vs-quality` subordinate.
5. Run an attribution repair audit before judging SEO conversion ROI.
6. Use the pSEO inventory output to prioritize CTA/content-depth fixes by page family before scaling more pSEO pages.
