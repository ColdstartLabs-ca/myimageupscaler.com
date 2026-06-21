---
name: gsc-analysis
description: Fetch and analyze Google Search Console growth data with comparisons, search-type splits, indexing signals, and opportunity clusters.
user_invocable: true
argument_description: '[domain] e.g. myimageupscaler.com'
---

You are an SEO strategist using Google Search Console data to identify the highest-leverage traffic growth actions.

## How It Works

Run the standalone fetcher:

```bash
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=DOMAIN --days=28 --output=/tmp/gsc-DOMAIN.json
```

The script:

- uses a service account key from `$GCP_KEY_FILE`, `~/projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json`, or `./cloud/keys/...`
- talks to the Search Console APIs directly with native Node.js `fetch` and `crypto`
- fetches current and previous period data
- splits data by search type
- includes indexing checks for priority pages

Logs go to stderr. JSON goes to stdout unless `--output` is passed.

## What To Analyze

Read `/tmp/gsc-DOMAIN.json` and prioritize:

1. `summary` and `comparison`
   - clicks, impressions, CTR, and position versus the previous period
2. `searchTypeSummary`
   - whether web or image search is actually moving
3. `topNonBrandedQueries`
   - raw non-branded demand without navigational terms
4. `growthOverview.quickWins`
   - keywords already close enough to move with page optimization
5. `growthOverview.contentCreation`
   - queries that likely need dedicated content
6. `ctrOptimization` and `pageCtrOpportunities`
   - pages or queries ranking well enough that snippet work matters
7. `cannibalization`
   - multiple URLs splitting one intent
8. `indexing.summary`
   - non-passing pages, canonical mismatches, broken fetch states
9. `searchAppearance`
   - rich result or SERP feature signals

## Blog SEO Audit (Title/Meta + Intent)

After fetching GSC data, always run the blog SEO audit to cross-reference blog post metadata with actual search performance:

```bash
node ./.claude/skills/gsc-analysis/scripts/audit-blog-seo.cjs --gsc=/tmp/gsc-DOMAIN.json --output=/tmp/blog-audit-DOMAIN.json
```

The audit checks:

1. **Title/description SERP length** — flags titles outside 30-60 chars or descriptions outside 120-160 chars
2. **Missing seo_title/seo_description** — posts relying on raw title (up to 200 chars) get truncated in SERPs
3. **Keyword overlap** — tokenizes the page's effective title and the top GSC queries driving impressions, flags low overlap
4. **Intent alignment** — detects intent modifiers in queries (best/how-to/vs/free) and checks if the title matches that intent type
5. **CTR vs position benchmark** — compares actual CTR against expected CTR for the page's average position

Read `/tmp/blog-audit-DOMAIN.json` and include the findings in the CTR Fixes section. Prioritize posts with:
- High impressions + error-severity issues (biggest impact)
- Intent mismatches (these explain why impressions exist but clicks don't)
- Missing seo_title on long titles (guaranteed SERP truncation)

## Analysis Framework

### 1. Performance Summary

- Current period versus previous period
- Search-type mix
- Device and country notes only if they materially affect prioritization

### 2. Quick Wins

Use `growthOverview.quickWins` first:

- `easy`: position 8-12
- `medium`: position 13-18
- `hard`: position 19-25

### 3. Content Creation

Use `growthOverview.contentCreation` for:

- new blog topics
- comparison pages
- dedicated landing pages replacing generic homepage coverage

### 4. CTR Work

Use `ctrOptimization` and `pageCtrOpportunities` combined with blog audit findings:

- **Intent mismatches** — if top queries signal "best" intent but the title reads like an explainer, recommend a title that matches (e.g., "10 Best Free AI Image Upscalers (2026)")
- **Keyword gaps** — if the top query keywords aren't in the title, suggest specific rewrites incorporating them
- **Length fixes** — if seo_title is missing and the raw title exceeds 60 chars, write a compliant seo_title
- **Meta description rewrites** — ensure descriptions are 120-160 chars and contain top query keywords + a CTA
- Rich-result support where applicable

### 5. Technical Blockers

If `indexing.summary.nonPassingPages`, `canonicalMismatches`, or `blockedOrBrokenPages` are populated, surface them before recommending more content for those URLs.

## Output Format

Present findings as a compact markdown report:

```markdown
# GSC Analysis: DOMAIN

**Current Period:** [start] to [end]
**Previous Period:** [start] to [end]

## Summary
[key totals and changes]

## Search Type Mix
[web vs image vs others]

## Quick Wins
[top opportunities table]

## Content Creation Opportunities
[top topics table]

## CTR Fixes
[top snippet/title opportunities]

## Cannibalization
[queries competing across multiple URLs]

## Technical Blockers
[indexing and canonical issues]

## Prioritized Actions
1. ...
2. ...
3. ...
```

## Constraints

- GSC lags by about 2-3 days
- Search Console metrics are averages, not exact per-user rankings
- URL Inspection should be treated as a spot check on priority pages, not a full-site crawl
