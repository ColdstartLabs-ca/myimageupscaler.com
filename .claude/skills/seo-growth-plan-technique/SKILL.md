---
name: seo-growth-plan-technique
description: Create a prioritized organic growth plan that combines GSC, GA4, pSEO, CTR, cannibalization, internal linking, CTA, attribution, and conversion evidence. Use when asked for traffic growth, SEO roadmap, conversion lift from organic traffic, what to work on next, or how to turn Search Console and Analytics data into revenue-focused actions.
---

# SEO Growth Plan Technique

Use this skill to turn scattered SEO and analytics findings into a ranked execution plan. Prefer real GSC and GA4 data, but use existing reports when fresh data is not available.

## Project Quick Run

For this repo, run the existing end-to-end SEO pipeline and base the plan on the synthesized JSON:

```bash
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/gsc-miu.json
node ./.claude/skills/ga-analysis/scripts/ga-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/ga-miu.json
node ./.claude/skills/seo-growth-plan/scripts/seo-synthesize.cjs \
  --gsc=/tmp/gsc-miu.json --ga=/tmp/ga-miu.json --site=myimageupscaler.com \
  --output=/tmp/seo-plan-miu.json
```

Read `summary.crosscheck` first. If the GSC clicks to GA organic sessions ratio is outside 0.6-1.6, put tracking repair above SEO/content actions.

## Project Backlog Context

Before recommending or executing SEO work in this repo, read the recent entries in:

- `docs/SEO/maintenance/seo-changes-backlog.md`
- `docs/SEO/maintenance/gsc-request-indexing-backlog.md`

Use these Markdown backlogs, plus recent git history when needed, to identify work that was already refreshed, redirected, indexed, or instrumented. Mark already-addressed items as skipped or validation-only instead of proposing duplicate rewrites, redirects, event mappings, or pSEO CTA work.

## Inputs

Collect the smallest useful set:

- GSC: clicks, impressions, CTR, average position, query, page, date range, device, country, sitemap/indexation when relevant.
- GA4: organic sessions, engagement rate, key events, signups, checkout starts, purchases, revenue, landing page, source/medium, device.
- Site context: product goal, primary CTA, pricing path, page templates, pSEO groups, recent content or redirect changes.
- Existing reports: SEO reports, blog monitors, attribution reports, pSEO audits, CTR/cannibalization reports.

If `.claude/product-marketing-context.md` exists, read it before asking for business context.

## Workflow

1. Establish the business goal: traffic, signups, paid conversions, activation, revenue, or recovery.
2. Check the SEO maintenance backlogs and recent git history for matching prior work.
3. Build a current baseline from GSC and GA4 for the same or clearly labeled periods.
4. Segment pages by type: homepage, tool, pricing, blog, pSEO, comparison, free-tool, account/dashboard, support.
5. Identify the bottleneck class for each major opportunity:
   - Discovery: low impressions or indexation.
   - Ranking: high impressions at positions 8-25.
   - CTR: strong positions with weak CTR or zero clicks.
   - Engagement: organic sessions with weak engagement.
   - CTA: engaged traffic without a direct intent-matched action.
   - Attribution: conversions lost to Unassigned, direct, auth callback, dashboard, or checkout return paths.
   - Cannibalization: multiple URLs splitting the same query intent.
6. Apply the relevant specialized technique:
   - `seo-content-3-kings-technique` for positions 5-15 title/H1/intro refreshes.
   - `serp-ctr-snippet-rewrite-technique` for weak CTR or zero-click rankings.
   - `search-intent-cta-mapping-technique` for page-level CTA and offer fit.
   - `cannibalization-consolidation-technique` for competing URLs.
   - `pseo-page-quality-scoring-technique` for generated page families.
   - `organic-funnel-attribution-repair-technique` when organic conversions are zero, missing, or misattributed.
   - `internal-linking-optimizer` when authority or user routing is the likely constraint.
   - `schema-markup` and `ai-search-optimization` for snippet, rich-result, and AI-answer extraction opportunities.
7. Rank actions by impact, confidence, effort, and time-to-signal.

## Project-Specific Priority Rules

- Treat `/auth/callback`, `/dashboard`, and localized dashboard/callback pages as funnel/attribution surfaces, not content SEO targets.
- If GA4 shows total conversions but Organic Search conversions are zero, invoke `organic-funnel-attribution-repair-technique` before judging SEO ROI.
- Do not recommend publishing new content for a query already in `opportunities.cannibalization`; consolidate or retarget first.
- Prefer CTR and snippet work when GSC impressions are growing but clicks are falling.

## Scoring

Use a 100-point priority score:

| Factor          | Weight | Signals                                                              |
| --------------- | -----: | -------------------------------------------------------------------- |
| Search demand   |     20 | Impressions, query count, trend                                      |
| Business value  |     25 | Signup, checkout, revenue, plan intent, commercial query             |
| Conversion leak |     20 | CTA mismatch, attribution loss, checkout/sign-up drop                |
| SEO leverage    |     20 | Position gap, CTR gap, cannibalization, internal links               |
| Effort inverse  |     15 | Metadata/CTA/link fixes beat full rewrites when impact is comparable |

Do not over-prioritize high-volume informational pages unless they can route users into a measurable next action.

## Output

Return a concise plan:

```markdown
# SEO Growth Plan: [site]

**Period**: [date range] | **Data sources**: [GSC/GA4/reports]

## Baseline

| Metric | Value | Note |
| ------ | ----: | ---- |

## Biggest Bottleneck

[One paragraph with evidence.]

## Priority Actions

| Priority | Page/Cluster | Evidence | Action | Owner/Skill | Success Metric |
| -------: | ------------ | -------- | ------ | ----------- | -------------- |

## Already Addressed / Skip For Now

| Item | Evidence From Backlog/Git | Remaining Validation |
| ---- | ------------------------- | -------------------- |

## 7-Day Plan

1. [highest-confidence quick win]
2. [second action]
3. [measurement/indexing action]

## 30-Day Plan

1. [larger consolidation/template/attribution work]
2. [monitoring cadence]

## Measurement

Track [specific GSC/GA4 metrics] and recheck on [date or after data lag].
```

## Guardrails

- Separate traffic work from conversion work when evidence points to different bottlenecks.
- Account for GSC's normal 2-3 day lag and GA4 attribution delays.
- Avoid rewriting recently refreshed pages before post-change data is available.
- Prefer consolidation over publishing another page for an already cannibalized intent.
- Tie every recommendation to a measurable next signal.
