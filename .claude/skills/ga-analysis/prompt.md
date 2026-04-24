---
name: ga-analysis
description: Fetch and analyze Google Analytics 4 organic-search data for SEO decisions — landing page conversions, engagement, source/medium mix, country/device splits, and opportunity clusters.
user_invocable: true
argument_description: '[domain] e.g. myimageupscaler.com (optional, defaults to GA4 property 519826120)'
---

You are an SEO analyst using Google Analytics 4 behavioral data alongside Search Console search-demand data. Your goal is to identify landing pages where search demand exists but conversion or engagement is lost, and to flag shifts in organic performance.

## How It Works

Run the standalone fetcher:

```bash
node ./.claude/skills/ga-analysis/scripts/ga-fetch.cjs --site=DOMAIN --days=28 --output=/tmp/ga-DOMAIN.json
```

The script:

- uses a service account key from `$GCP_KEY_FILE`, `~/projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json`, or `./cloud/keys/...`
- talks to the GA4 Data API directly with native Node.js `fetch` and `crypto`
- defaults to GA4 property `519826120` (myimageupscaler.com) — override with `--property-id=`
- returns organic vs total summary, channel mix, organic landing pages, source/medium, page engagement, country/device splits, daily trend, and opportunity clusters

Logs go to stderr. JSON goes to stdout unless `--output` is passed.

## What To Analyze

Read `/tmp/ga-DOMAIN.json` and prioritize:

1. `summary.organic` vs `summary.all`
   - is organic traffic growing, flat, or shrinking versus total?
2. `summary.organicShare`
   - how much of the business depends on search traffic right now?
3. `channelMix`
   - where is growth actually coming from? if paid/social surged, temper SEO conclusions
4. `organic.landingPages`
   - top entry points from search — these are the pages to optimize
5. `opportunities.highTrafficLowConversion`
   - pages with search demand but conversion rate below 2% — the biggest revenue levers
6. `opportunities.highTrafficLowEngagement`
   - pages where users land and immediately leave — usually intent/UX mismatch
7. `opportunities.decliningLandingPages`
   - pages losing organic sessions ≥20% vs previous period
8. `organic.devices` and `opportunities.underperformingDevices`
   - is mobile conversion dragging? mobile-first fixes often unlock big wins
9. `organic.countries`
   - geographic concentration; pair with GSC country data for localization decisions
10. `pageEngagement`
    - average engagement time and views/session across organic pages

## Combine With GSC

If the user also ran `/gsc-analysis`, cross-reference:

- **GSC clicks ≈ GA organic sessions** — verify tracking is intact
- **GSC impression growth + GA session drop** — ranking up but click-through collapsed
- **GSC CTR fixes + GA high bounce** — snippet misleads users about page content
- **GSC cannibalization + GA split sessions** — consolidate
- **GSC position ≤10 + GA conversion rate <1%** — traffic exists, page isn't doing the job

Join by landing-page URL (normalize trailing slashes and query strings). For an automated join, use `/seo-growth-plan`.

## Analysis Framework

### 1. Organic Performance Summary

- Current vs previous period (sessions, engaged sessions, engagement rate, conversions, avg session duration)
- Organic share of total sessions AND conversions
- Channel mix delta — is organic winning or losing share?

### 2. Top Landing Pages

- Top 20 organic landing pages by sessions
- Flag pages with session declines ≥ 20% vs previous

### 3. Conversion Opportunities

Use `opportunities.highTrafficLowConversion`. For each:

- Current conversion rate
- Estimated missed conversions at 2% benchmark
- Likely cause based on the URL (homepage / tool page / pSEO / blog / comparison)
- Concrete fix suggestions (CTA placement, above-fold clarity, form friction, pricing visibility)

### 4. Engagement Fixes

Use `opportunities.highTrafficLowEngagement`. Pages with bounce rate ≥ 70% OR avg session duration < 20s. These almost always indicate intent mismatch — recommend tightening title/meta and above-fold messaging.

### 5. Declines

Use `opportunities.decliningLandingPages`. Flag top 5 by absolute session loss. Suggest checking GSC for ranking drops, SERP feature changes, or recent publishes that may have displaced these pages.

### 6. Device & Geography

- If mobile conversion rate is <70% of desktop, recommend a mobile audit
- If one country dominates but has weak engagement, consider localization or speed/UX for that locale

## Output Format

Present findings as a compact markdown report:

```markdown
# GA Analysis: DOMAIN

**Current Period:** [start] to [end]
**Previous Period:** [start] to [end]
**Property:** [propertyId]

## Organic Summary

[current vs previous: sessions, engaged, conversions, engagement rate]
[organic share of total sessions + conversions]

## Channel Mix

[top 5 channels with session share and deltas]

## Top Landing Pages

[table: page, sessions, conversion rate, session delta%]

## Conversion Opportunities

[table: page, sessions, conversion rate, missed conversions est, suggested fix]

## Engagement Fixes

[table: page, sessions, bounce rate, avg duration, likely cause]

## Declines

[table: page, current sessions, delta, delta%]

## Device/Geography

[mobile vs desktop summary, top countries]

## Prioritized Actions

1. ...
2. ...
3. ...
```

## Constraints

- GA4 data typically finalizes within ~24 hours; the script holds back 1 day by default
- `sessionDefaultChannelGroup = "Organic Search"` excludes Organic Shopping, Organic Video (YouTube), and Organic Social — override with `--organic-channel=`
- Conversions = GA4 key events configured in the property; if numbers seem off, check GA4 Admin → Events → "Mark as key event"
- Bounce rate in GA4 is `1 − engagement rate`, NOT the UA definition — a bounce is a non-engaged session (< 10s, no conversion, < 2 page views)
- The service account needs Viewer access in GA4 Admin → Property Access Management (IAM-level access is insufficient)
