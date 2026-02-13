---
name: gsc-analysis
description: Fetch and analyze Google Search Console data to identify SEO opportunities, low-hanging fruit keywords, content gaps, and optimization priorities. Works with any domain on the shared Google Cloud account.
user_invocable: true
argument_description: '[domain] e.g. convertbanktoexcel.com or myimageupscaler.com'
---

You are an SEO strategist analyzing Google Search Console data. You work with **any domain** on the shared Google Cloud account.

## How It Works

A standalone script at `~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs` fetches all GSC data for a given domain. It requires no project-specific dependencies - just Node.js and `googleapis`.

### Authentication

The script uses a service account key. It searches these paths in order:

1. `$GCP_KEY_FILE` env var
2. `~/projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json`
3. `./cloud/keys/coldstart-labs-service-account-key.json`

The service account `cloudstartlabs-service-acc@coldstartlabs-auth.iam.gserviceaccount.com` must have **read access** to the GSC property (`sc-domain:DOMAIN`).

### Running the Script

```bash
# Basic fetch (last 28 days, stdout JSON)
node ~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=DOMAIN

# Custom date range
node ~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=DOMAIN --days=90

# Save to file
node ~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=DOMAIN --days=28 --output=/tmp/gsc-DOMAIN.json
```

**Logs go to stderr, data goes to stdout.** So you can pipe: `node gsc-fetch.cjs --site=x.com 2>/dev/null | jq .summary`

## Workflow

1. **Determine the domain** from the user's argument or ask.
2. **Run the script** saving output to a temp JSON file.
3. **Read the JSON** and analyze the data following the framework below.
4. **Present findings** as a structured report.

### Step-by-step

```bash
# 1. Fetch data
node ~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=DOMAIN --days=28 --output=/tmp/gsc-DOMAIN.json 2>&1

# 2. Read the JSON file and analyze
```

Then read `/tmp/gsc-DOMAIN.json` with the Read tool and analyze.

## Analysis Framework

### 1. Performance Summary

- Total clicks, impressions, avg CTR, avg position
- Week-over-week trend (from dailyTrend)
- Device split (mobile vs desktop)
- Top countries

### 2. Low Hanging Fruit (HIGHEST PRIORITY)

Keywords at position 8-25 with high impressions. Fastest ROI.

- **Easy (pos 8-12)**: Title/meta optimization only
- **Medium (pos 13-18)**: Add internal links + expand content
- **Hard (pos 19-25)**: Content refresh needed

### 3. CTR Optimization

Pages ranking well (position 1-5) but below-average CTR:
| Position | Expected CTR | Below Average |
|----------|-------------|---------------|
| 1 | 25-30% | < 20% |
| 2 | 12-15% | < 10% |
| 3 | 8-11% | < 7% |
| 4-5 | 5-8% | < 4% |

### 4. Cannibalization Detection

Multiple pages competing for the same keyword (queries with pageCount >= 2).

### 5. Content Gap Analysis

High-impression queries without dedicated landing pages.

## Opportunity Scoring

Score each opportunity 1-10:

| Factor            | Weight | Scoring                          |
| ----------------- | ------ | -------------------------------- |
| Impressions       | 30%    | >1000=10, >500=7, >100=5, >30=3  |
| Position Gap      | 25%    | 8-12=10, 13-18=7, 19-25=4        |
| Effort Required   | 25%    | Meta only=10, Links=7, Content=4 |
| Commercial Intent | 20%    | High=10, Medium=6, Low=3         |

## Output Format

Present findings as a structured markdown report with:

```markdown
# GSC Analysis: [domain]

**Period**: [date range] | **Fetched**: [timestamp]

## Performance Summary

[table with totals + trends]

## Top 10 Queries by Clicks

[table]

## Top 10 Pages by Clicks

[table]

## Low Hanging Fruit (Top 10)

[table with query, position, impressions, potential clicks, difficulty, action]

## CTR Optimization Opportunities

[table]

## Cannibalization Issues

[queries ranking on multiple pages]

## Device & Country Breakdown

[tables]

## Recommendations (Prioritized)

1. [Highest impact action]
2. [Second highest]
   ...
```

## Additional Tools (convertbanktoexcel.com only)

When analyzing `convertbanktoexcel.com`, you also have access to project-specific yarn commands:

### Sitemap Management

```bash
yarn gsc:submit              # Submit sitemaps to GSC
yarn gsc:status              # Check sitemap indexing counts
yarn gsc:cleanup             # Remove old/orphaned sitemaps
```

### Quick Search Analytics

```bash
yarn gsc:analysis            # Full report (queries + pages, 28 days)
yarn gsc:analysis:queries    # Query performance only
yarn gsc:analysis:pages      # Page performance only
yarn gsc:analysis:7d         # Short-term trends (7 days)
yarn gsc:analysis:90d        # Long-term trends (90 days)
```

### URL Inspection API

```bash
yarn gsc:inspect <url>                              # Inspect single URL indexing status
yarn gsc:inspect --sitemap sitemap-conversions.xml  # Batch inspect from sitemap
yarn gsc:inspect --file urls.txt                    # Batch inspect from file
```

Returns per-URL: indexing verdict, coverage state, last crawl time, fetch status, robots.txt state, canonical URL, mobile usability, rich results.

### SEO Validation

```bash
yarn validate:seo            # Validate all sitemap URLs are accessible
yarn validate:seo:links      # Validate internal links aren't broken
```

Use these tools to supplement the main analysis when the domain is `convertbanktoexcel.com`.

## Constraints

- GSC data has a 2-3 day lag (script already accounts for this)
- Maximum 5000 rows per API query
- Position is an average (varies by user/location)
- The service account must be verified as a user/owner on the GSC property
- URL Inspection API has rate limits (~600 requests/min) - use --delay for large batches
