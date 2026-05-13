---
name: seo-money-page-lift-technique
description: Combine Google Search Console and GA4 data to find organic landing pages with traffic, engagement, CTA, signup, checkout, and revenue lift opportunities. Use when prioritizing SEO pages by business value, conversion potential, funnel leaks, or monetization upside.
---

# SEO Money Page Lift Technique

Use this skill to turn organic landing page data into revenue-focused SEO actions. It connects GSC demand signals with GA4 behavior and conversion signals so recommendations are based on business upside, not traffic alone.

## Project Quick Run

For this repo, prefer the existing project scripts over manual exports:

```bash
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/gsc-miu.json
node ./.claude/skills/ga-analysis/scripts/ga-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/ga-miu.json
node ./.claude/skills/seo-growth-plan/scripts/seo-synthesize.cjs \
  --gsc=/tmp/gsc-miu.json --ga=/tmp/ga-miu.json --site=myimageupscaler.com \
  --output=/tmp/seo-plan-miu.json
```

Read `/tmp/seo-plan-miu.json` first. Use `summary.crosscheck.gscClicksVsGaSessions` to verify the join is trustworthy, then use `priorityActions`, `opportunities.conversionOpportunities`, `opportunities.trackingGaps`, and `joinedPagesTop` for page-level money decisions.

## Data Inputs

Prefer real exports or API output. If data access is unclear, ask for the smallest useful exports.

From GSC:

- Landing page, query, clicks, impressions, CTR, average position.
- Device and country when relevant.
- Date range and comparison period.

From GA4:

- Landing page, organic sessions, engaged sessions, engagement rate, average engagement time.
- CTA events, signup events, checkout starts, purchases, revenue, or the closest available key events.
- Device, country, and source/medium when relevant.
- Date range matching GSC as closely as possible.

Normalize URLs before joining: strip protocol/domain, standardize trailing slashes, remove tracking query parameters, and preserve meaningful query strings only when the site uses them as distinct landing pages.

## Minimum GA4 Export Request

When direct GA4 access is unavailable, request one export before final scoring:

| Dimension / Metric                  | Required? | Purpose                                  |
| ----------------------------------- | --------- | ---------------------------------------- |
| Landing page + query string         | Yes       | Join to GSC page data                    |
| Session default channel group       | Yes       | Filter to Organic Search                 |
| Source / medium                     | Yes       | Detect attribution leaks                 |
| Sessions                            | Yes       | Traffic volume                           |
| Engaged sessions or engagement rate | Yes       | Traffic quality                          |
| Average engagement time             | Helpful   | Intent satisfaction                      |
| Key events by event name            | Yes       | CTA/signup/upload/checkout/purchase path |
| Purchases or revenue                | Helpful   | Business value                           |
| Device category                     | Helpful   | Mobile/desktop CTA differences           |
| Country                             | Helpful   | Pricing/localization differences         |

For SaaS/tool sites, ask for key events such as upload started, upload completed, signup started, signup completed, checkout opened, checkout started, checkout completed, purchase confirmed, and any plan/upgrade events. If the export is unavailable, label the run `GSC-first, GA-limited` and avoid claiming revenue impact.

## Workflow

1. Define the business goal: more signups, checkout starts, purchases, revenue, qualified leads, or CTA engagement.
2. Fetch or ingest GSC data using the project GSC workflow when available:

```bash
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=DOMAIN --days=28 --output=/tmp/gsc-DOMAIN.json
```

3. Ingest GA4 organic landing page data using `./.claude/skills/ga-analysis/scripts/ga-fetch.cjs`, an export, API, BigQuery, or user-provided tables.
4. Join GSC and GA4 by normalized landing page. In this repo, use `./.claude/skills/seo-growth-plan/scripts/seo-synthesize.cjs`.
5. Segment pages by intent and page type: homepage, tool, product, pricing, comparison, template, article, pSEO, docs, or support.
6. Identify pages with demand, engagement, and funnel mismatch.
7. Score opportunities by incremental business value and implementation effort.
8. Return a prioritized lift plan with page-specific copy, UX, internal link, and measurement actions.

## Opportunity Patterns

Traffic-to-engagement lift:

- High GSC clicks or GA4 organic sessions with weak engagement.
- Likely causes: intent mismatch, poor above-the-fold answer, weak page speed, thin content, or misleading SERP promise.
- Actions: rewrite title/meta/H1/intro, improve first-screen answer, add examples, strengthen proof, or adjust page targeting.

Engagement-to-CTA lift:

- Healthy engagement with low CTA click rate or low key event rate.
- Likely causes: CTA is buried, generic, mismatched to intent, or visually weak.
- Actions: place intent-matched CTA above the fold, add contextual CTAs after value moments, clarify next step, add trust evidence.

CTA-to-signup lift:

- CTA clicks without proportional signups.
- Likely causes: landing page promise does not match signup page, form friction, weak benefit framing, missing social proof.
- Actions: align CTA copy with signup page, reduce fields, add expectation-setting microcopy, route to a more specific signup path.

Signup-to-checkout lift:

- Organic signups with low checkout starts.
- Likely causes: weak activation, unclear paid value, missing pricing path, trial/user onboarding gap.
- Actions: add product-use modules, pricing nudges, comparison proof, lifecycle prompts, and stronger post-signup measurement.

Checkout-to-revenue lift:

- Checkout starts with low purchase rate or revenue per session.
- Likely causes: pricing anxiety, payment friction, unclear guarantees, weak plan fit.
- Actions: improve pricing clarity, trust badges, refund/guarantee copy, plan recommendations, and checkout error tracking.

Revenue expansion:

- Pages with revenue but low GSC position, CTR, or internal links.
- Actions: apply Three Kings refresh, add internal links from high-authority pages, expand commercial sections, and protect rankings.

## Scoring

Score each page 1-10 for:

| Factor             | Weight | Guide                                            |
| ------------------ | -----: | ------------------------------------------------ |
| Organic demand     |     25 | GSC impressions, clicks, and position upside     |
| Engagement quality |     20 | Engaged sessions, engagement rate, time          |
| Funnel gap size    |     25 | CTA, signup, checkout, purchase, or revenue leak |
| Commercial intent  |     20 | Query/page intent tied to product value          |
| Effort             |     10 | Lower effort gets higher score                   |

Prioritize pages with both proven demand and a specific funnel leak. Do not over-prioritize high-traffic pages with low commercial intent unless the fix is cheap or supports internal linking to money pages.

## Attribution Gate

If all Organic Search conversion rates are zero while total-site conversions exist, do not present "page conversion rate is bad" as a pure UX truth. First flag an attribution or key-event problem and invoke `organic-funnel-attribution-repair-technique`.

For this project, a useful money-page report must separate:

- Real conversion opportunities: organic page has sessions, engagement, and measurable downstream events.
- Measurement gaps: organic page has sessions and engagement but GA4 key events/conversions are all zero.
- Auth/dashboard artifacts: `/auth/callback`, `/dashboard`, and localized dashboard/callback pages should usually be treated as attribution/funnel continuity pages, not SEO landing pages to optimize for rankings.

## Output Format

```markdown
# SEO Money Page Lift: [site]

**Period**: [date range] | **Data sources**: [GSC/GA4/API/export/manual]

## Executive Priority

[1-3 sentences naming the highest value page group and why]

## Opportunity Table

| Priority | Page | GSC Signal | GA4 Signal | Funnel Gap | Recommended Lift | Score |
| -------: | ---- | ---------- | ---------- | ---------- | ---------------- | ----: |

## Page-Level Actions

### [URL]

- Evidence: [queries, clicks/impressions/CTR/position, sessions, engagement, events, revenue]
- Diagnosis: [specific mismatch or leak]
- Changes: [title/meta/content/CTA/signup/checkout/internal links/measurement]
- Expected impact: [traffic, CTA, signup, checkout, or revenue metric]

## Measurement Plan

| Change | Primary Metric | Secondary Metric | Check Date |
| ------ | -------------- | ---------------- | ---------- |

## Next Steps

1. [highest value implementation]
2. [next implementation]
3. [validation or tracking fix]
```

## Related Skills

- Use `google-search-console-analysis` for deeper query, CTR, ranking, and indexation work.
- Use `google-analytics-seo-analysis` for deeper GA4 segmentation and conversion analysis.
- Use `seo-content-3-kings-technique` for pages close to top rankings.
- Use `internal-linking-optimizer` when high-value pages need more authority or routing.
