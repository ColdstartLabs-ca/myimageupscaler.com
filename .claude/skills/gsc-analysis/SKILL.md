---
name: gsc-analysis
description: Fetch and analyze Google Search Console growth data, including search-type splits, comparisons, indexing signals, opportunity clusters, and focused URL visibility-drop investigations.
---

# GSC Analysis Skill

You are an SEO growth analyst working from Google Search Console data. Your goal is to pull enough data to decide what will actually grow traffic, not just report headline metrics.

When this skill activates: `GSC Analysis Mode: Fetching growth dataset...`

## Quick Start

```bash
# Full growth export for this repo
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --output=/tmp/gsc-miu.json
```

## Configuration

- **Credentials:** `$GCP_KEY_FILE` or `~/projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json`
- **Service Account:** `cloudstartlabs-service-acc@coldstartlabs-auth.iam.gserviceaccount.com`
- **Property Format:** `sc-domain:DOMAIN`

## What The Fetcher Pulls

- Search-type summaries for `web`, `image`, `video`, `news`, `discover`, and `googleNews`
- Current vs previous period comparisons
- Query, page, and query+page exports for growth analysis
- Device and country breakdowns
- Search appearance buckets
- Sitemap metadata, plus sitemap URLs reconciled with traffic
- URL Inspection for losers, opportunities, silent URLs and top pages, or every sitemap URL
- Section, locale, host, position, device and country splits with comparisons
- Click-change decomposition, 16-month trend, partial fresh data
- A completeness report that names failed requests and API blind spots

The script uses native Node.js `fetch` + `crypto`. It does **not** depend on `googleapis`.
Requests that return 429 or 5xx retry with backoff.

## What The API Cannot See

`gsc-fetch.cjs` alone is not a complete analysis. A "super complete" or incident analysis also
needs the UI-only reports below. See [UI-Only Reports](#ui-only-reports).

| Report                          | API     | Decision it supports                               |
| ------------------------------- | ------- | -------------------------------------------------- |
| Page indexing: reasons, trends  | ❌ none | Is the indexed set shrinking? Which reason grew?   |
| Crawl stats                     | ❌ none | Crawl waste, response time, 4xx and 5xx share      |
| Core Web Vitals                 | ❌ none | Poor URL counts per device, LCP and INP status     |
| Generative AI                   | ❌ none | AI feature impressions per page, country and day   |
| Multimodal search type          | ❌ none | Web sub-type shown in the Search type filter       |
| Insights                        | ❌ none | Query groups, Google's own branded click share     |
| Links                           | ❌ none | Linking sites, anchors, internal link distribution |
| Shopping, enhancements          | ❌ none | Structured data validity and missing fields        |
| Manual actions, Security issues | ❌ none | Penalty check before any ranking claim             |

Tested 2026-11-01: `type` values `multimodal`, `ai`, `aiOverview`, `aiMode` and `searchAppearance`
values `AI_OVERVIEW`, `AI_MODE` return HTTP 400. Retest before you claim API support.

## Example Commands

```bash
# Default 28-day export
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com

# Longer comparison window
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=90

# Limit search types
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --search-types=web,image

# Skip URL inspection
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --inspect-top-pages=0

# Complete run: inspect every sitemap URL (about 800 calls of the 2,000/day quota, about 10 minutes)
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --inspect-sitemap
```

Logs go to stderr. JSON goes to stdout unless `--output` is set.

## Output Shape

```json
{
  "dataCompleteness": {},
  "longTrend": { "months": [], "weeks": [], "yearOverYear": null },
  "freshness": { "firstIncompleteDate": "", "days": [], "last24Hours": {} },
  "clickChangeDecomposition": {},
  "sectionBreakdown": { "rows": [], "excludedFragmentRows": {} },
  "localeBreakdown": { "rows": [] },
  "hostBreakdown": { "rows": [] },
  "positionBuckets": { "current": {}, "previous": {} },
  "deviceComparison": [],
  "countryComparison": [],
  "anonymizedTraffic": [],
  "sitemapCoverage": {},
  "summary": {},
  "comparison": {},
  "quarantinedQueries": [],
  "searchTypeSummary": {},
  "searchTypes": {
    "web": {
      "summary": {},
      "queries": [],
      "pages": [],
      "lowHangingFruit": [],
      "ctrOpportunities": [],
      "contentOpportunities": [],
      "cannibalization": [],
      "weeklyBreakdown": { "weeks": [], "latestWeekPageMovers": {}, "latestWeekQueryMovers": {} },
      "searchAppearance": []
    }
  },
  "growthOverview": {
    "quickWins": [],
    "contentCreation": [],
    "ctr": [],
    "cannibalization": []
  },
  "indexing": {
    "inspectedPages": [],
    "summary": {}
  },
  "sitemaps": []
}
```

Top-level compatibility fields like `topQueries`, `topPages`, `lowHangingFruit`, `ctrOptimization`, `deviceBreakdown`, `countryBreakdown`, and `dailyTrend` still map to the chosen primary type.
Use `topNonBrandedQueries` when you want raw opportunity discovery without branded navigational noise.

## Analysis Workflow

### Step 1: Fetch

```bash
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/gsc-miu.json 2>&1
```

### Step 2: Read The JSON

Check `dataCompleteness` first. If `complete` is false, name the failed requests in the report and
rerun them. State `queryClickCoverage`: privacy filtering hides about half of the clicks from the
query dimension, so a query table never explains the full total.

Focus on:

1. `comparison.brandSplit`, including its explicit `unclassified` privacy-suppressed segment,
   `quarantinedQueries`, and
   `comparison.stableCohortPosition` before any blended headline. Lead with non-brand clicks,
   state branded movement separately, never attribute `unclassified` rows to either segment, and
   use the stable cohort for ranking claims.
2. `summary` and `comparison` for the retained raw totals, including `ctrExQuarantine` and
   `positionExQuarantine` alongside the raw figures.
3. `searchTypeSummary` to see whether growth is coming from web or image search.
4. `weeklyBreakdown` when investigating a drop: 7-day buckets ending on the range end, each with
   branded / nonBranded / unclassified clicks, plus the last-week-vs-prior-week page and query
   movers. Use it to date the drop and name the segment that moved before blaming rankings.
5. `growthOverview.quickWins`, content creation, CTR, cannibalization, and indexing blockers.
6. `clickChangeDecomposition` to separate demand, ranking, CTR, new and lost pages. Its `cause`
   labels are triage heuristics. Confirm a page before you edit it.
7. `sectionBreakdown`, `localeBreakdown`, `hostBreakdown`, `countryComparison` and
   `deviceComparison` to find the segment that moved. Page sums exclude `#fragment` rows, so they
   can differ from the property total.
8. `positionBuckets` and `longTrend` to see distribution shifts and the trend past the window.
9. `sitemapCoverage` for submitted URLs with zero impressions and traffic outside the sitemap.
10. `indexing.summary`, including `staleCrawlPages`. Use `--inspect-sitemap` when the indexed set
    is moving.
11. `freshness` for the days the final dataset holds back. These rows are partial. Use them to
    check a recent deploy, and do not compare them with complete days.
12. `anonymizedTraffic` for pages whose clicks come mostly from hidden queries.

Quick wins with `suspectPhantom: true` have 250 or more impressions, position 10 or better and no
click. They rank last. Check country and device before you edit for one.

Queries with more than 5,000 impressions and CTR below 0.05% are named in
`quarantinedQueries`, remain flagged in the raw query array, and are excluded only from the clean
CTR/position siblings. Review the named rows before reinstating one; never silently delete them.

Read `comparison.previousQuarantine` before you report a drop in impressions or position. It applies
the same rule to the previous window. A phantom spike there inflates the baseline, so subtract it
from the impression delta and compare `positionExQuarantine` with
`previousQuarantine.positionExQuarantine`. Position buckets and section rows keep the spike.

A query holding position 1.0 while impressions fall is a demand change, not a ranking change. It
must not justify a title, metadata, or content rewrite.

## UI-Only Reports

Use the `claude-in-chrome` skill with the owner's signed-in browser. These steps are read-only.

1. Create a tab and open `https://search.google.com/search-console`. Only some signed-in accounts
   can access the property, so the extractor probes `/u/0` to `/u/4` and picks the first that can.
2. Read `scripts/gsc-ui-extract.cjs` and paste it into `javascript_tool`. Calls time out at 45
   seconds, and the extractor runs in the background.
3. Poll `window.__gscUi.status` until it is `done`, then read the output with `get_page_text`.
   `javascript_tool` output truncates near 1,000 characters.
4. Read these pages with `get_page_text`. Their rendered text has data the extractor does not parse:
   - `/search-console`: the Overview recommendations and enhancement totals
   - `/search-console/core-web-vitals/summary?device=2` and `device=1`: issue names per device
   - `/search-console/settings/crawl-stats`: labeled breakdowns and host status
   - `/search-console/video-index`: the reason videos are not indexed
   - `/search-console/manual-actions`, `/security-issues`, `/removals`: pass or fail
5. Close the tab when you finish. The extractor replaces the tab body with its output.

`issues[].urls` reads at most 1,000 URLs per reason, and its tally shows the top 12 groups.

Limits:

- The extractor reads a private format. It matches data shapes, and `gaps` records reports that it
  could not parse. A report with `daily: null` means no data shape matched, not zero data.
- Do not post to localhost from the GSC tab. Chrome holds the request behind a local network
  permission and the fetch hangs.
- Downloading the Export CSV needs the owner's approval. The extractor does not need it.

Read the results:

- **Indexed count falling.** Compare `pageIndexing.daily` with each `issues[].trend`, then check
  `issues[].urls.bySection`. Growth in `NO_INDEX_TAG` or `ALT_REDIRECT` can be planned cleanup, so
  correlate it with the SEO changes backlog before you call it a problem. Then compare
  `localeBreakdown` and `sectionBreakdown`: a removal that held no clicks did not cause a click loss.
- **Validation `failed`.** Google still found the reason on some URLs. This is normal for planned
  noindex and redirects. Do not request validation again for those reasons.
- **Generative AI.** Impressions have no clicks or queries. Join its pages with API page CTR to
  find pages with AI exposure and low CTR. The report window is 3 months, so run the fetcher with
  `--days=90` for that join.
- **Branded share.** `insights.brandedClickShare` is Google's own figure, against all clicks.
  Compare it with `brandSplit.current.branded.clicks / summary.totalClicks` as a classifier check.
- **Core Web Vitals.** Field data covers a 28-day window, so a fix takes weeks to appear.

### Single-URL Visibility Drop

When the user reports that a specific page's impressions or clicks dried up, use this skill as the GSC data source and pair it with `blog-performance-monitor` for diagnosis.

1. Fetch at least 28 days, or 56-90 days when the suspected change date is unclear:

```bash
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=56 --row-limit=25000 --output=/tmp/gsc-miu-url-incident.json
```

2. In the export, inspect both the original URL and any redirect/canonical destination:
   - `searchTypes.web.pages`
   - `searchTypes.web.queries`
   - `searchTypes.web.cannibalization`
   - top-level `comparison`
   - `indexing.inspectedPages` when the page was inspected

3. Separate causes before proposing edits:
   - impressions down on the old URL but present on a redirect destination = likely migration/consolidation
   - impressions down with worse position = ranking/content/indexing problem
   - impressions stable with clicks down = CTR/snippet problem
   - multiple URLs serving the same top query = cannibalization

4. Always correlate the metric change with the SEO maintenance backlog before editing:
   - `docs/SEO/maintenance/seo-changes-backlog.md`
   - `docs/SEO/maintenance/gsc-request-indexing-backlog.md`
   - `.claude/skills/blog-changelog.md`
   - relevant `docs/SEO/reports/*.md`

### Step 3: Output

Present findings as a markdown report with:

- Data completeness: failed requests, query click coverage, and the UI reports read or not read
- Non-brand click movement first, with branded demand and quarantined clusters stated separately
- Period and comparison window
- Search-type mix
- Click-change decomposition and the segments that moved
- Indexing trend by reason, crawl health, Core Web Vitals, AI feature exposure
- Quick wins
- Content creation opportunities
- CTR fixes
- Cannibalization issues
- Indexing/canonical blockers
- Prioritized actions

## Troubleshooting

### Credentials

```bash
ls -la ~/projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json
```

### Access

- Ensure the service account has access in Search Console
- Verify the property exists as `sc-domain:myimageupscaler.com`
- GSC data lags by roughly 2-3 days, so the script intentionally holds back recent days

## Blog SEO Audit

After fetching GSC data, run the blog audit to cross-reference blog post metadata with search performance:

```bash
node ./.claude/skills/gsc-analysis/scripts/audit-blog-seo.cjs --gsc=/tmp/gsc-miu.json --output=/tmp/blog-audit-miu.json
```

This checks title/meta SERP lengths, keyword overlap between titles and top GSC queries, intent alignment (listicle vs how-to vs comparison vs free-tool), and CTR vs position benchmarks. Include findings in the CTR Fixes section of the analysis report.

### Audit with Suggestions

Add `--suggest` to generate actionable title/meta rewrite candidates for each flagged post:

```bash
node ./.claude/skills/gsc-analysis/scripts/audit-blog-seo.cjs --gsc=/tmp/gsc-miu.json --suggest --output=/tmp/blog-audit-miu.json
```

Outputs a `suggestions` array per post ranked by missed clicks, containing:

- 3 `seo_title_options` (30-60 chars each) based on top GSC queries and intent
- 1 `seo_description` candidate (120-160 chars) with CTR hooks
- `rationale` explaining why the suggestion was generated

Suggestions are a starting point for human review, not final copy.

## CTR Tracker

Track before/after CTR changes for specific pages after applying title/meta fixes:

```bash
# Take a baseline snapshot
node ./.claude/skills/gsc-analysis/scripts/ctr-tracker.cjs \
  --site=myimageupscaler.com \
  --pages=slug1,slug2,slug3 \
  --output=/tmp/ctr-snapshot.json

# After changes, take another snapshot and compare
node ./.claude/skills/gsc-analysis/scripts/ctr-tracker.cjs \
  --site=myimageupscaler.com \
  --pages=slug1,slug2,slug3 \
  --snapshots=/tmp/ctr-snapshot.json \
  --output=/tmp/ctr-snapshot-v2.json

# Auto-track all CTR-deficit pages
node ./.claude/skills/gsc-analysis/scripts/ctr-tracker.cjs \
  --site=myimageupscaler.com \
  --all-ctr-deficit \
  --min-impressions=1000 \
  --output=/tmp/ctr-all.json
```

Output includes per-page CTR, expected CTR by position, missed clicks estimate, and delta comparison against previous snapshots.

## Files

| Item           | Path                                                       |
| -------------- | ---------------------------------------------------------- |
| Skill Doc      | `./.claude/skills/gsc-analysis/SKILL.md`                   |
| Prompt         | `./.claude/skills/gsc-analysis/prompt.md`                  |
| Fetch Script   | `./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs`      |
| Blog SEO Audit | `./.claude/skills/gsc-analysis/scripts/audit-blog-seo.cjs` |
| CTR Tracker    | `./.claude/skills/gsc-analysis/scripts/ctr-tracker.cjs`    |
| UI Extractor   | `./.claude/skills/gsc-analysis/scripts/gsc-ui-extract.cjs` |
