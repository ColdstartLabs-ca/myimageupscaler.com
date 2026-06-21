---
name: pseo-page-quality-scoring-technique
description: Score programmatic SEO pages or page families using GSC indexation, impressions, clicks, GA4 engagement and conversions, unique data/content depth, internal links, and CTA usefulness, then recommend keep, improve, noindex, merge, redirect, or scale actions. Use when auditing pSEO quality, prioritizing page-family cleanup, or deciding which templates/content sets deserve expansion.
---

# PSEO Page Quality Scoring Technique

Use this workflow to turn mixed SEO, analytics, content, and UX signals into defensible page-level or page-family actions.

## Project Quick Run

For this repo, generate the inventory first, then pair it with the existing GSC + GA synthesis output:

```bash
node ./.Codex/skills/pseo-page-quality-scoring-technique/scripts/pseo-inventory.cjs \
  --output=/tmp/pseo-inventory-miu.json

node ./.Codex/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/gsc-miu.json
node ./.Codex/skills/ga-analysis/scripts/ga-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/ga-miu.json
node ./.Codex/skills/seo-growth-plan/scripts/seo-synthesize.cjs \
  --gsc=/tmp/gsc-miu.json --ga=/tmp/ga-miu.json --site=myimageupscaler.com \
  --output=/tmp/seo-plan-miu.json
```

Use `/tmp/pseo-inventory-miu.json` for family, CTA, FAQ, freshness, and unique-field signals. Use `/tmp/seo-plan-miu.json` for GSC + GA performance by URL. If the inventory has a family with many pages but few URLs in the joined plan, treat it as a discovery/indexation or low-demand family until proven otherwise.

## Project Backlog Context

Before recommending pSEO template, CTA, sitemap, indexation, or scaling changes in this repo, read:

- `docs/SEO/maintenance/seo-changes-backlog.md`
- `docs/SEO/maintenance/gsc-request-indexing-backlog.md`

Use these Markdown backlogs to identify families that were recently added, redirected, sitemap-adjusted, refreshed, or queued for indexing. Skip duplicate template or CTA telemetry work when the current tree already implements it; prefer scorecard joins, production validation, or post-indexing measurement.

## Inputs

- Page inventory grouped by template, page family, intent, data source, and canonical URL.
- Google Search Console data: index status, impressions, clicks, CTR, average position, query coverage, and excluded/discovered/crawled states.
- GA4 data: sessions, engaged sessions, engagement rate, average engagement time, key events, conversions, revenue or lead value when available.
- Crawl/template review: unique data fields, content depth, duplicate/thin patterns, internal links in/out, schema, canonical/noindex status, and CTA placement/usefulness.

Reference related skills when deeper work is needed: `programmatic-seo`, `google-search-console-analysis`, `google-analytics-seo-analysis`, `internal-linking-optimizer`, and `schema-markup`.

## Inventory Step

Before scoring, build or request a page-family inventory. Do not score a large pSEO system from top pages alone.

Minimum inventory fields:

| Field                | Example                                             |
| -------------------- | --------------------------------------------------- |
| URL                  | `/scale/upscale-16x`                                |
| Family               | `scale`                                             |
| Template             | `ScalePageTemplate`                                 |
| Intent               | `transactional / tool / comparison / informational` |
| Locale               | `en`, `es`, `fr`, etc.                              |
| Canonical URL        | preferred canonical                                 |
| Indexability         | index, noindex, canonicalized, redirected           |
| Sitemap group        | `sitemap-scale.xml`                                 |
| Unique data fields   | output size, format, platform, use case, examples   |
| Primary CTA          | upload, pricing, comparison, guide, signup          |
| Internal link source | hub, nav, related pages, blog, footer               |

For myimageupscaler.com-style sites, group families such as `/tools`, `/scale`, `/free`, `/formats`, `/use-cases`, `/platform-format`, `/device-use`, `/compare`, `/alternatives`, `/guides`, and blog posts separately. Score localized variants separately when localization quality, indexation, or engagement differs materially.

The bundled `scripts/pseo-inventory.cjs` scans `app/seo/data/*.json` and outputs family counts plus page-level fields such as URL, primary keyword, unique-field count, FAQ presence, CTA presence, and freshness.

## Scorecard

Score each page or family from 0-100. Use weighted averages for families, but also flag outlier pages that need separate action.

- Indexation and technical eligibility, 15 pts: indexed canonical pages score highest; discovered/crawled not indexed, soft 404s, duplicate canonicals, or blocked assets lose points.
- Search demand and traction, 20 pts: reward impressions, clicks, improving trend, query diversity, and rank movement; separate low-demand pages from underperforming high-demand pages.
- Engagement and business value, 20 pts: reward engaged sessions, engagement time, low pogo-sticking indicators, key events, assisted conversions, direct conversions, and revenue/lead value.
- Unique data and content depth, 20 pts: reward page-specific facts, comparisons, media, examples, FAQs, freshness, editorial utility, and data that cannot be found on every other template page.
- Internal links and discoverability, 15 pts: reward relevant inbound links, contextual outbound links, hub/listing placement, breadcrumbs, anchors that match intent, and crawl depth.
- CTA usefulness, 10 pts: reward CTAs that match search intent, page stage, and user task; penalize generic, intrusive, or absent next steps.

## Workflow

1. Build the page-family inventory, then segment pages by template and intent before scoring. Avoid mixing informational, comparison, local, directory, and transactional pages in one benchmark.
2. Check the SEO maintenance backlogs and recent git history for family-level work already done or queued.
3. Pull at least 90 days of GSC and GA4 data when available. For new pages, mark data confidence as low and rely more heavily on indexation, content depth, links, and CTA fit.
4. Normalize metrics within comparable page families. Use percentiles or buckets instead of global site averages when page families have different demand ceilings.
5. Score each component, then write the evidence in one short note per component. Missing data should reduce confidence, not automatically produce a zero.
6. Assign one primary action and, when useful, one secondary action.
7. Summarize family-level patterns: winners to scale, fixable pages, duplicates to consolidate, and pages that should leave the index.

## Action Rules

- Keep: score 75+, indexed, gets qualified traffic or conversions, and has defensible unique value. Maintain freshness and internal links.
- Scale: score 80+ at the family level, positive search or conversion trend, repeatable data/content supply, and no systemic thin-page risk.
- Improve: score 45-74 with impressions, rankings, engagement, or conversion potential. Prioritize content depth, data uniqueness, internal links, schema, titles/meta, and CTA fit.
- Merge: overlapping intent, cannibalized queries, thin variants, or fragmented links/conversions. Consolidate into the strongest canonical page or hub.
- Redirect: obsolete, duplicate, or replaced pages with backlinks, traffic, conversions, or a clearly superior destination.
- Noindex: low-value pages with little demand, weak uniqueness, poor engagement, no link equity, and no strong consolidation target. Keep crawlable if users need them after onsite navigation.

## Output Format

Return a concise table with:

- URL or page family
- Segment/template
- Score
- Confidence: high, medium, or low
- Key evidence from GSC, GA4, content/data, links, and CTA
- Recommended action
- Highest-leverage next step

End with a prioritized action summary grouped by keep, improve, noindex, merge, redirect, and scale.

## Usefulness Check

A useful run must produce at least:

- Top 5 page families by page count.
- Top 5 pSEO URLs with both GSC and GA evidence.
- Top 5 pSEO URLs with GSC demand but weak/absent GA sessions.
- Families that look scalable, fixable, or unsafe to scale.
- One concrete action per family: keep, improve, noindex, merge, redirect, or scale.
