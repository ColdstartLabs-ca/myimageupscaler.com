---
name: search-intent-cta-mapping-technique
description: Use when mapping organic SEO query or page intent to the best CTA, offer, destination, and on-page placement for SaaS, tool, blog, or programmatic SEO pages. Especially useful for conversion audits, content briefs, landing page updates, GA4/GSC SEO analysis, and funnel optimization.
---

# Search Intent CTA Mapping Technique

Use this skill to turn search intent into a concrete conversion path. The output should specify the visitor's job, CTA, offer, destination, placement, supporting proof, and telemetry needed to validate performance.

## Project Quick Run

For this repo, pair the CTA map with GA4 landing-page evidence:

```bash
node ./.claude/skills/ga-analysis/scripts/ga-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/ga-miu.json
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/gsc-miu.json
node ./.claude/skills/seo-growth-plan/scripts/seo-synthesize.cjs \
  --gsc=/tmp/gsc-miu.json --ga=/tmp/ga-miu.json --site=myimageupscaler.com \
  --output=/tmp/seo-plan-miu.json
```

Use `opportunities.conversionOpportunities` for high-session CTA targets, `growthOverview.quickWins` for query intent, and `sourceMedium`/Organic conversion data to distinguish CTA problems from attribution problems.

## Project Backlog Context

Before recommending CTA or telemetry changes in this repo, read:

- `docs/SEO/maintenance/seo-changes-backlog.md`
- `docs/SEO/maintenance/gsc-request-indexing-backlog.md`

Use these backlogs to avoid re-adding CTA/event work that was already shipped. If Organic Search conversions are zero but total conversions exist, check whether analytics/event mapping was already implemented and treat remaining work as GA4 Admin/live validation until proven otherwise.

## Workflow

1. Classify the page and query intent:
   - **Do now**: visitor wants the tool immediately.
   - **Compare**: visitor is choosing between options.
   - **Learn/fix**: visitor needs diagnosis or education before action.
   - **Buy/upgrade**: visitor is evaluating price, limits, or paid value.
   - **Trust/risk**: visitor worries about watermark, signup, privacy, quality, or file handling.

2. Check the maintenance backlog for recent CTA, content, analytics, or pSEO template changes affecting the page.
3. Pick the conversion promise:
   - Match the exact query language where true.
   - Remove the biggest friction before adding feature claims.
   - Make the CTA outcome concrete: upload, preview, compare, enhance, price, or subscribe.

4. Map CTA, offer, destination, and placement:
   - **Primary CTA**: the next action most aligned with intent.
   - **Offer**: free use, sample preview, side-by-side result, plan comparison, downloadable output, or alternative comparison.
   - **Destination**: tool route, pricing page, comparison page, account/signup, checkout, or article section.
   - **Placement**: first viewport, after diagnostic section, after examples, sticky mobile footer, table row, FAQ, or exit-intent module.

5. Validate with telemetry:
   - Use GA4 SEO analysis for landing page sessions, engaged sessions, scroll depth, CTA clicks, upload starts, upload completes, preview views, signups, checkout starts, purchases, and returning-user behavior.
   - Use Google Search Console queries/pages for impression intent, CTR gaps, and page-query mismatches.
   - Use funnel telemetry to find the weak step: SERP click, CTA click, upload, processing, preview, download, signup, upgrade.
   - Segment by landing page type, query family, device, country, new vs returning visitor, and paid vs free plan when available.

## Intent Examples

For myimageupscaler.com and similar image tools:

| Query or page intent                      | Best CTA                  | Offer                                           | Destination                                        | Placement                              |
| ----------------------------------------- | ------------------------- | ----------------------------------------------- | -------------------------------------------------- | -------------------------------------- |
| "best free image upscaler"                | Upscale an image free     | Free first upload with visible result quality   | Tool upload page                                   | Hero and repeated after examples       |
| "image upscaler no watermark"             | Upscale without watermark | Watermark-free output claim, only if true       | Tool upload or pricing if gated                    | Hero subcopy, FAQ, download step       |
| "image upscaler no signup"                | Try without signup        | No-account preview or upload, only if true      | Tool upload page                                   | First viewport and upload module       |
| "4K image upscaler" / "8K image upscaler" | Upscale to 4K/8K          | Resolution selector or plan limit clarity       | Tool route with size preset, or pricing for limits | Hero, controls area, plan table        |
| "fix blurry photo"                        | Sharpen a blurry photo    | Before/after example and blur-specific promise  | Sharpen/enhance tool or relevant article CTA       | After diagnosis and before/after image |
| "sharpening vs upscaling"                 | Compare on your image     | Explain difference, then route to correct tool  | Blog section with dual CTAs                        | After comparison table                 |
| "image upscaler pricing"                  | See plans                 | Transparent limits, output sizes, batch credits | Pricing page                                       | Above fold and sticky mobile CTA       |
| "myimageupscaler alternatives"            | Compare results           | Honest comparison or migration offer            | Alternatives/comparison page                       | Comparison table rows and summary      |

## Output Format

Return a compact mapping:

- **Intent**: query/page type and visitor motivation.
- **Primary CTA**: exact CTA copy.
- **Offer**: what the visitor gets and what friction is removed.
- **Destination**: target URL or page type.
- **Placement**: where the CTA should appear.
- **Support**: proof, examples, FAQ, pricing detail, or trust language needed nearby.
- **Telemetry**: GA4/GSC/funnel events or segments to check before and after launch.
- **Risks**: claims that need verification, mismatched intent, or conversion tradeoffs.

## Rules

- Do not use a generic "Get started" CTA when the query implies a more specific action.
- Do not promise "free", "no watermark", "no signup", "4K", or "8K" unless the product actually supports it.
- For blog and pSEO pages, keep the first CTA contextual to the section; use a stronger tool CTA only after the page has answered the query.
- For comparison and alternatives pages, preserve trust with specific tradeoffs and direct plan/tool routes instead of only promotional copy.
- Prefer measurable CTA variants that can be tracked with GA4 events and tied back to organic landing pages.

## Measurement Requirement

Every CTA recommendation should name:

- Primary event to watch: upload started, upload completed, signup started, checkout started, or purchase confirmed.
- Secondary event: CTA click, scroll depth, pricing click, model selection, or download.
- Segment: Organic Search landing page, device, country, and new/returning user when available.
- Attribution caveat: if Organic Search conversions are all zero, validate event/key-event wiring before treating CTA copy as the root cause.
