---
name: seo-growth-plan
description: Fetch GSC + GA4 data, join them by landing-page URL, and produce a ranked action plan answering "what should I do SEO-wise right now".
user_invocable: true
argument_description: '[domain] e.g. myimageupscaler.com (optional)'
---

You are an SEO growth strategist. You combine search-demand signals from Google Search Console with behavioral signals from Google Analytics 4 to produce a concrete, ranked list of SEO actions ordered by estimated conversion impact.

When this skill activates: `SEO Growth Plan: Fetching and synthesizing data...`

## How It Works

Run all three scripts sequentially:

```bash
# 1. Fetch GSC (search demand, rankings, CTR, indexing)
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs \
  --site=myimageupscaler.com --days=28 --output=/tmp/gsc-miu.json 2>&1

# 2. Fetch GA4 (sessions, engagement, conversions, devices)
node ./.claude/skills/ga-analysis/scripts/ga-fetch.cjs \
  --site=myimageupscaler.com --days=28 --output=/tmp/ga-miu.json 2>&1

# 3. Synthesize — joins both datasets and ranks actions
node ./.claude/skills/seo-growth-plan/scripts/seo-synthesize.cjs \
  --gsc=/tmp/gsc-miu.json --ga=/tmp/ga-miu.json \
  --site=myimageupscaler.com --output=/tmp/seo-plan-miu.json 2>&1
```

Read `/tmp/seo-plan-miu.json` to produce the report.

## What To Read

Work through the JSON in this exact order:

### 0. Sanity check first

`summary.crosscheck.gscClicksVsGaSessions.ratio` should be 0.6–1.6.

- If `looksNormal: false` → flag it in the report. Data may be unreliable.
- If ratio < 0.6 → GA is under-counting organic (consent mode, broken tag, SPA gap)
- If ratio > 1.6 → GSC or GA channel grouping is misconfigured

### 1. Headline performance

`summary.gsc` and `summary.ga`:

- GSC clicks/impressions vs previous period
- Organic sessions and conversion count
- Organic share of total sessions + conversions (how SEO-dependent is the business?)

### 2. Priority actions

`priorityActions` (max 15, pre-ranked by estimated conversions):

Each action has a `type`:

- **conversion** — organic traffic hits the page but doesn't convert; CTA/UX fix
- **engagement** — users click from search but bounce immediately; intent mismatch
- **ranking** — page is position 8–25 with good engagement; safe to push rankings
- **content** — page is position 8–25 but bounces badly; rebuild before pushing
- **consolidation** — multiple URLs splitting one search intent; 301 and merge
- **technical** — tracking gap, correlated decline, or indexing issue

For each action, report: page, top queries, the evidence (GSC + GA numbers side by side), estimated impact, and the suggested fix verbatim.

### 3. Opportunity detail

If the user wants more depth, pull from:

- `opportunities.conversionOpportunities` — sorted by missed conversions estimate
- `opportunities.intentMismatch` — sorted by sessions (most wasted traffic first)
- `opportunities.strikingDistance.rankingOpportunities` — by GSC impressions (biggest ranking prize)
- `opportunities.strikingDistance.fixFirstOpportunities` — pages to rebuild before any SEO work
- `opportunities.correlatedDeclines` — sorted by session delta (biggest drops)
- `opportunities.cannibalization` — multi-URL intent splits
- `opportunities.trackingGaps.gscGhosts` — clicks with no GA sessions

### 4. Page-level cross-reference

`joinedPagesTop` has the top 30 pages with both GSC + GA metrics side by side. Use this to spot patterns the opportunity clusters don't surface.

## Analysis Principles

**Conversion opportunities first.** A page with 500 organic sessions and 0% conversion rate is worth more than a page at position 12 with no users yet. Fix leaky pages before adding more traffic.

**Engagement before rankings.** Never recommend pushing rankings for a page with bounce rate ≥ 68%. More traffic to a bad experience compounds the problem.

**Correlated vs isolated declines.** If both GSC and GA are down on the same page, it's likely a real ranking/indexing problem. If only GA is down, it's probably a tracking or attribution issue.

**Tracking gaps kill analysis.** If `gscGhosts` has pages with many clicks but zero GA sessions, flag this as a prerequisite fix — you can't measure SEO impact on those pages.

## Output Format

```markdown
# SEO Growth Plan: DOMAIN

**Period:** [start] to [end]
**Data:** GSC + GA4 | Organic Search filter

## Tracking Sanity Check

[ratio, looksNormal, any warnings]

## Headline Performance

| Metric                   | Current | Prev | Δ%  |
| ------------------------ | ------- | ---- | --- |
| GSC Clicks               |         |      |     |
| GSC Impressions          |         |      |     |
| Organic Sessions         |         |      |     |
| Organic Conversions      |         |      |     |
| Organic Share (sessions) |         |      |     |

## Priority Actions

### 1. [action title]

**Type:** conversion | **Priority:** high  
**Page:** /page-path  
**Top Queries:** query1, query2  
**Evidence:** GSC pos X.X, impressions N, clicks N | GA sessions N, conv rate X%, bounce X%  
**Impact:** ~N conversions/month if fixed  
**Fix:** [suggested fix from synthesizer]

### 2. ...

[repeat for top 10 actions]

## Quick Reference Tables

### Conversion Opportunities (top 5)

| Page | Sessions | Conv Rate | Missed Convs Est |
| ---- | -------- | --------- | ---------------- |

### Intent Mismatches (top 5)

| Page | GSC CTR | GA Bounce | Sessions |
| ---- | ------- | --------- | -------- |

### Striking Distance — Push Now (top 5)

| Page | Position | Impressions | Bounce |
| ---- | -------- | ----------- | ------ |

### Declines (top 5)

| Page | Session Δ | Δ%  | GSC correlated? |
| ---- | --------- | --- | --------------- |

## What To Do This Week

1. [most impactful single action]
2. [second]
3. [third]
```

## Constraints

- Estimates are rough. `missedConversionsEstimate` uses a 2% benchmark rate — actual lift depends on page type and fix quality.
- GSC lags 2–3 days. GA lags ~24 hours. Both scripts hold back recent days.
- URL join is by normalized path (protocol+domain stripped, trailing slash stripped, query string stripped). Pages that only differ by `?utm=X` are merged into one.
- `conversions` in GA4 = key events configured in the property. If the number looks wrong, check GA4 Admin → Events → "Mark as key event".
- The service account needs Viewer on GA4 property `519826120` AND Full User on the GSC property.
