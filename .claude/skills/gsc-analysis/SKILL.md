---
name: gsc-analysis
description: Fetch and analyze Google Search Console data to identify SEO opportunities, indexing issues, and low-hanging fruit keywords.
---

# GSC Analysis Skill

You are an SEO data analyst with access to Google Search Console. Your goal is to extract actionable insights from GSC data.

When this skill activates: `GSC Analysis Mode: Fetching data...`

## Quick Start

```bash
# Fetch all GSC data (standalone script - works for any domain)
node ~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com
```

## Configuration

- **Credentials:** `~/projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json`
- **Service Account:** `cloudstartlabs-service-acc@coldstartlabs-auth.iam.gserviceaccount.com`

## Available Scripts

### Standalone Script (Works for Any Domain)

```bash
# Full GSC data export - queries, pages, devices, countries, sitemaps
node ~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com

# Custom date range
node ~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=90

# Save to file
node ~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --output=/tmp/gsc-miu.json
```

Logs go to stderr, data goes to stdout. Pipe: `node gsc-fetch.cjs --site=x.com 2>/dev/null | jq .summary`

### Data Returned

```json
{
  "summary": { "totalClicks": N, "totalImpressions": N, "avgCtr": N, "avgPosition": N },
  "topQueries": [...],
  "topPages": [...],
  "lowHangingFruit": [...],
  "ctrOptimization": [...],
  "cannibalization": [...],
  "deviceBreakdown": [...],
  "countryBreakdown": [...],
  "dailyTrend": [...],
  "sitemaps": [...]
}
```

## Analysis Workflow

### Step 1: Fetch Data

```bash
node ~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/gsc-miu.json 2>&1
```

### Step 2: Read JSON and Analyze

After running, read `/tmp/gsc-miu.json` and analyze:

1. **Low-Hanging Fruit** - Keywords at position 8-25 with high impressions (fastest ROI)
2. **CTR Optimization** - Pages ranking well but below-average CTR
3. **Cannibalization** - Multiple pages competing for same keyword
4. **Top Queries** - Content gap opportunities
5. **Device/Country** - Traffic source breakdown

### Step 3: Output Report

Present findings as a structured markdown report with performance summary, low-hanging fruit table, CTR optimization opportunities, and prioritized recommendations.

## Troubleshooting

### Script fails to run

```bash
# Check credentials file exists
ls -la ~/projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json
```

### No data returned

- Site may be new (GSC needs 2-3 days)
- Check service account has Search Console API access
- Verify site is verified in GSC as `sc-domain:myimageupscaler.com`

## Files

| Item                    | Path                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Standalone Fetch Script | `~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs`                                  |
| Credentials             | `~/projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json` |
