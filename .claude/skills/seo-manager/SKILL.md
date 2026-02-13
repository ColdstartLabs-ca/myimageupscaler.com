---
name: seo-manager
description: Orchestrate all SEO audit skills in parallel waves and produce a unified health report. Use when asked for "full SEO audit", "SEO health check", "comprehensive SEO report", "SEO manager", "run all SEO checks", or "SEO status".
user_invocable: true
argument_description: "[--competitor=<domain>] [--url=<url>] [--skip=<skill1,skill2>]"
---

# SEO Manager Orchestrator

You are the **SEO Manager** for convertbanktoexcel.com. Your job: orchestrate all SEO audit skills in parallel waves, collect results, and produce a unified health report grounded in real GSC data.

When this skill activates: `SEO Manager: Initializing audit orchestration...`

---

## Principles

1. **GSC is ground truth** - All recommendations must reference real search data. If GSC fetch fails, STOP.
2. **Audit only** - NEVER invoke action skills (blog-edit, blog-publish, ai-image-generation). Report findings, don't fix them.
3. **Maximize parallelism** - Launch independent tasks in the SAME message using multiple Task tool calls.
4. **Each skill = unique angle** - No redundant re-checks across skills.
5. **Graceful degradation** - If a non-GSC skill fails, mark as "N/A" and continue. Only GSC failure is a hard stop.

---

## Input / Arguments

Parse optional arguments from user input:

| Argument                | Default                          | Description                                                           |
| ----------------------- | -------------------------------- | --------------------------------------------------------------------- |
| `--competitor=<domain>` | _(not run)_                      | Enable competitor sitemap analysis for this domain                    |
| `--url=<url>`           | `https://convertbanktoexcel.com` | URL for PageSpeed and SquirrelScan audits                             |
| `--skip=<skills>`       | _(none)_                         | Comma-separated skills to skip (e.g., `blog-audit,backlink-analyzer`) |
| `--include-strategy`    | _(not run)_                      | Include keyword research & content strategy analysis                  |

---

## Execution Pipeline

### Step 1: Initialize

1. Parse arguments
2. Check for prior reports: `ls docs/SEO/reports/seo-report-*.md` - read the most recent one for trend comparison
3. Create the output directory if needed: `mkdir -p docs/SEO/reports`
4. Display the execution plan to the user:

```
SEO Manager: Audit Plan
========================
Target: <url>
Competitor: <domain or "skipped">
Skipping: <skills or "none">
Strategy: <"included" if --include-strategy, otherwise "skipped">

Wave 1 (Data Collection):  GSC fetch, PageSpeed, SquirrelScan
Wave 2 (Analysis):         SEO review, Blog audit, Schema, AI Search, Internal Linking, Backlinks [, Competitor] [, Keyword Strategy]
Wave 3 (Synthesis):        Score, merge, write report

Estimated time: 10-20 minutes (add +5min if --include-strategy)
```

5. Use TaskCreate to create tracking tasks for each wave.

---

### Step 2: Wave 1 - Data Collection

Launch **3 parallel Task tool calls in a single message** (skip any in `--skip` list):

#### Task 1: GSC Data Fetch

```
subagent_type: general-purpose
prompt: |
  Fetch Google Search Console data for convertbanktoexcel.com.

  Run this command:
  npx tsx scripts/gsc-direct-fetch.ts

  Then read the output JSON from docs/SEO/gsc-exports/ (most recent file).

  Return a structured summary with EXACTLY these sections:
  - Indexing: submitted count, indexed count, index rate percentage
  - Performance (90d): total clicks, total impressions, avg CTR, avg position
  - Top 20 queries: query, position, impressions, clicks, CTR (as a table)
  - Low-hanging fruit: keywords with position 4-20 and impressions > 10
  - Top 10 pages by clicks
  - Device breakdown
  - Country breakdown (top 5)

  If the script fails, report the exact error message.
```

#### Task 2: PageSpeed Audit

```
subagent_type: general-purpose
prompt: |
  Run a Lighthouse PageSpeed audit on <URL>.

  Invoke the /pagespeed skill with URL: <URL>

  Return a structured summary with:
  - Scores table: Performance, SEO, Accessibility, Best Practices (mobile + desktop)
  - Lab data: FCP, LCP, TBT, CLS, Speed Index, TTI, TTFB (mobile + desktop)
  - Top 5 performance opportunities with estimated savings
  - Any SEO-specific failures
  - Any accessibility failures

  Save the full report to docs/SEO/audits/pagespeed-report-YYYY-MM-DD.md
```

#### Task 3: SquirrelScan Audit

```
subagent_type: general-purpose
prompt: |
  Run a SquirrelScan website audit on <URL>.

  Execute:
  squirrel audit <URL> --format llm -C surface

  Return a structured summary with:
  - Overall health score (0-100)
  - Issues by severity: critical count, high count, medium count, low count
  - Top issues by category (SEO, technical, content, security, schema, links)
  - Broken links found (if any)
  - Schema markup findings

  If squirrel is not installed, report this and skip.
```

---

### Step 3: Wave 1 Checkpoint

After all Wave 1 tasks return:

1. **Check GSC result** - If GSC failed, STOP and display the error. Help the user troubleshoot:
   - Check credentials: `ls -la ./cloud/keys/coldstart-labs-service-account-key.json`
   - Check script: `npx tsx scripts/gsc-direct-fetch.ts --help`
   - Do NOT proceed without GSC data.

2. **Parse GSC data** - Extract the key metrics to inject into Wave 2 prompts:
   - `GSC_SUMMARY`: indexing status + performance summary (5-8 lines)
   - `GSC_TOP_QUERIES`: top 20 queries table
   - `GSC_LOW_HANGING_FRUIT`: low-hanging fruit keywords
   - `GSC_TOP_PAGES`: top 10 pages by clicks

3. **Note PageSpeed/SquirrelScan status** - If either failed, mark as "N/A" but continue.

4. Update task statuses.

---

### Step 4: Wave 2 - Domain Analysis

Launch **5-7 parallel Task tool calls in a single message** (skip any in `--skip` list).

Every Wave 2 prompt MUST include the GSC context block:

```
## GSC Ground Truth (use this to ground your analysis)
<paste GSC_SUMMARY>
<paste GSC_TOP_QUERIES>
<paste GSC_LOW_HANGING_FRUIT>
<paste GSC_TOP_PAGES>
```

#### Task A: SEO Expert Review

```
subagent_type: seo-auditor
prompt: |
  You are an SEO expert reviewing convertbanktoexcel.com (SaaS tool for converting bank statements to Excel/CSV).

  <GSC context block>

  <SquirrelScan summary if available, otherwise "SquirrelScan: N/A">

  Your job: Review on-page SEO and content quality for the TOP 10 PAGES from GSC data.
  Focus ONLY on what SquirrelScan does NOT cover:
  - Content depth and search intent match
  - E-E-A-T signals (expertise, experience, authority, trust)
  - Keyword targeting effectiveness (are titles/H1s aligned with GSC queries?)
  - Content gaps (GSC shows impressions but poor CTR - why?)
  - User experience signals

  For each page reviewed, reference its GSC metrics (position, impressions, CTR).

  Return a structured summary:
  - Pages reviewed (count)
  - Key on-page findings (table: page, issue, severity, GSC context)
  - E-E-A-T assessment (1 paragraph)
  - Content gap opportunities (list with GSC data citations)
  - Score: 0-100 for on-page SEO quality
```

#### Task B: Blog Audit

```
subagent_type: general-purpose
prompt: |
  Audit all published blog posts on convertbanktoexcel.com for quality and SEO compliance.
  This is REPORT-ONLY mode - do NOT fix anything, do NOT invoke blog-edit.

  <GSC context block>

  Step 1: Authenticate
  PASSWORD=$(gcloud secrets versions access latest --secret=convertbanktoexcel-blog-admin-password --project=coldstartlabs-auth)
  TOKEN=$(curl -s -X POST "https://api.convertbanktoexcel.com/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"motherai@opus.com\",\"password\":\"$PASSWORD\"}" \
    | jq -r '.session.access_token')

  Step 2: Fetch all posts
  ALL_POSTS=$(curl -s "https://api.convertbanktoexcel.com/blog/admin/posts?limit=200" \
    -H "Authorization: Bearer $TOKEN")

  Step 3: For each post, check:
  - Thin content (< 300 words = CRITICAL)
  - Title length (30-60 chars required)
  - Excerpt length (100-160 chars required)
  - H1 count (exactly 1 required)
  - CTA presence (must have hyperlinked CTAs to https://convertbanktoexcel.com)
  - AI vocabulary (delve, tapestry, nuanced, multifaceted, pivotal, landscape, testament, myriad)
  - Keyword cannibalization across posts

  Step 4: Cross-reference with GSC low-hanging fruit - are blog posts targeting these keywords?

  Return a structured summary:
  - Total posts audited
  - Issues by severity: critical, high, medium, low (counts)
  - Top 10 worst posts (table: slug, word count, issues found, severity)
  - Cannibalization pairs (if any)
  - AI writing detection results
  - Blog posts targeting GSC low-hanging fruit keywords (or gaps)
  - Score: 0-100 for blog health

  If authentication fails, report the error and return score as "N/A".
```

#### Task C: Schema Markup Review

```
subagent_type: general-purpose
prompt: |
  Review structured data / schema markup on convertbanktoexcel.com.

  <GSC context block>

  <SquirrelScan schema findings if available>

  Check the following pages for JSON-LD schema:
  1. Homepage (https://convertbanktoexcel.com) - expect: Organization, SoftwareApplication, WebSite
  2. Pricing page (/pricing) - expect: Product or Offer
  3. Blog posts (check 3 posts) - expect: Article, BreadcrumbList
  4. Bank-specific pages (check 2 from GSC top pages) - expect: FAQPage, BreadcrumbList, SoftwareApplication
  5. Format pages (check 2) - expect: HowTo or FAQPage

  For each page, use WebFetch to check the HTML source for JSON-LD scripts.

  Return a structured summary:
  - Pages checked (count)
  - Schema types found (table: page, schemas present, schemas missing)
  - Validation issues (malformed JSON-LD, missing required fields)
  - Rich result eligibility (which pages qualify for which rich results)
  - Priority additions (which schemas would have highest impact)
  - Score: 0-100 for structured data coverage
```

#### Task D: AI Search Optimization Review

```
subagent_type: general-purpose
prompt: |
  Review convertbanktoexcel.com for AI search engine visibility (AEO/GEO).

  <GSC context block>

  Check the following:

  1. robots.txt AI bot access - fetch https://convertbanktoexcel.com/robots.txt
     - Is GPTBot blocked or allowed?
     - Is ClaudeBot blocked or allowed?
     - Is PerplexityBot blocked or allowed?
     - Is Google-Extended blocked or allowed?

  2. llms.txt presence - check https://convertbanktoexcel.com/llms.txt and /llms-full.txt
     - Does it exist?
     - Is it well-structured?

  3. Content citability - check 3 key pages from GSC top queries:
     - Does content use inverted pyramid (answer first)?
     - Are there clear definitions/explanations AI can extract?
     - Is content structured with semantic HTML (lists, tables, headings)?
     - Are there FAQ sections?

  4. E-E-A-T signals for AI
     - Author credentials visible?
     - Dates and freshness signals?
     - Authoritative sources cited?

  Return a structured summary:
  - AI bot access status (table: bot, status)
  - llms.txt status
  - Content citability score per page checked
  - AEO readiness checklist (items checked vs passed)
  - Priority recommendations
  - Score: 0-100 for AI search readiness
```

#### Task E: Internal Linking Analysis

```
subagent_type: general-purpose
prompt: |
  Analyze internal linking structure of convertbanktoexcel.com.

  <GSC context block>

  Step 1: Fetch the sitemap
  Use WebFetch to get https://convertbanktoexcel.com/sitemap.xml
  Parse the URL list.

  Step 2: Categorize pages by type:
  - Homepage, Tool/App pages, Bank-specific pSEO pages, Format pSEO pages, Blog posts, Static pages

  Step 3: Check 5 high-value pages from GSC top pages:
  - How many internal links point TO this page? (check from homepage, nav, footer, blog posts)
  - How many internal links does this page have going OUT?
  - Is the anchor text descriptive and keyword-relevant?

  Step 4: Check for orphan pages:
  - Are there sitemap URLs that might have zero or minimal internal links?

  Step 5: Topic cluster assessment:
  - Do bank pages link to related format pages and vice versa?
  - Do blog posts link to relevant tool/pSEO pages?
  - Is there a hub-and-spoke linking pattern?

  Return a structured summary:
  - Total pages in sitemap
  - Pages checked in detail (count)
  - Internal link distribution (table: page, inbound links, outbound links)
  - Orphan page candidates
  - Topic cluster gaps
  - Anchor text quality assessment
  - Priority linking opportunities (with GSC data: "Link to /banks/chase from blog - it has 450 impressions at position 12")
  - Score: 0-100 for internal linking health
```

#### Task F: Backlink Analysis

```
subagent_type: general-purpose
prompt: |
  Analyze the backlink profile of convertbanktoexcel.com.

  <GSC context block>

  Since we may not have Ahrefs/Semrush API access, use available data:

  1. Check if docs/SEO/ contains any Ahrefs or backlink export files (CSV/JSON)
  2. Use WebFetch to check common backlink checker tools if available
  3. Reference any domain authority metrics from prior reports in docs/SEO/audits/

  Based on available data, assess:
  - Total known backlinks and referring domains
  - Domain authority / Domain Rating
  - Link quality distribution (editorial vs directory vs social vs spam)
  - Anchor text distribution
  - Top referring domains

  Cross-reference with GSC data:
  - Pages with high impressions but low CTR might benefit from backlink authority boost
  - Pages ranking 4-20 that need link equity to push into top 3

  Return a structured summary:
  - Profile overview (backlinks, referring domains, DR/DA)
  - Link quality assessment
  - Competitor link gap (if prior competitor reports exist in docs/SEO/)
  - High-priority pages needing backlinks (from GSC low-hanging fruit)
  - Link building opportunity types
  - Score: 0-100 for backlink profile health (or "N/A - Limited data" if no backlink data found)
```

#### Task G: Competitor Sitemap Spy (ONLY if --competitor provided)

```
subagent_type: seo-competitor-analyzer
prompt: |
  Analyze competitor <COMPETITOR_DOMAIN> SEO strategy via their sitemap.

  <GSC context block>

  Invoke the /competitor-sitemap-spy skill for domain: <COMPETITOR_DOMAIN>

  Return a structured summary:
  - Total pages found
  - Page categories (table: category, count, percentage)
  - pSEO patterns identified
  - Content gaps (they have, we don't)
  - Our advantages (we have, they don't)
  - Top 5 quick-win opportunities
  - Score: 0-100 for competitive position
```

#### Task H: Keyword Research & Strategy (ONLY if --include-strategy provided)

```
subagent_type: general-purpose
prompt: |
  Generate a keyword research strategy and content roadmap for convertbanktoexcel.com.

  <GSC context block>

  Invoke the /keyword-research-strategy skill with focus on easy wins:
  /keyword-research-strategy --focus=easy-wins --competition=low --limit=15

  The skill will:
  1. Analyze GSC data + Ahrefs snapshots (if available)
  2. Classify search intent for all keywords
  3. Map keywords to existing/proposed pages
  4. Identify content gaps and intent mismatches
  5. Generate prioritized content roadmap

  Return a structured summary with EXACTLY these sections:
  - Total keywords analyzed
  - Opportunity breakdown by segment:
    - Quick Wins (position 4-20, easy push)
    - Content Gaps (high potential, no page)
    - Long-Tail Clusters (group related keywords)
    - Intent Mismatches (wrong page ranks)
  - Top 5 immediate priorities (keyword, segment, impact, effort)
  - Total potential monthly clicks if roadmap implemented
  - Link to full roadmap file in docs/SEO/keyword-strategy-roadmap-YYYY-MM-DD.md

  Cross-reference with GSC low-hanging fruit to ensure alignment.

  If the skill fails or no Ahrefs data found, note limitation but include GSC-only analysis.
```

---

### Step 5: Wave 2 Checkpoint

After all Wave 2 tasks return:

1. Collect all structured summaries
2. Note which skills succeeded and which returned "N/A"
3. Update task statuses

---

### Step 6: Wave 3 - Synthesis

This runs in the main thread (no subagents).

#### 6a: Compute Health Scores

Extract the score from each skill's summary. Calculate weighted overall score:

| Dimension                | Weight | Source                                                                                |
| ------------------------ | ------ | ------------------------------------------------------------------------------------- |
| Technical SEO            | 20%    | SquirrelScan health score                                                             |
| Core Web Vitals          | 15%    | PageSpeed performance score (mobile 60% + desktop 40%)                                |
| On-Page SEO              | 15%    | SEO expert review score                                                               |
| Content / Blog           | 10%    | Blog audit score                                                                      |
| Schema / Structured Data | 5%     | Schema markup review score                                                            |
| Internal Linking         | 10%    | Internal linking analysis score                                                       |
| Backlinks                | 10%    | Backlink analysis score                                                               |
| AI Search Readiness      | 5%     | AI search optimization score                                                          |
| GSC Performance          | 10%    | Composite: (index_rate _ 0.3) + (normalized_position _ 0.4) + (normalized_ctr \* 0.3) |

For N/A dimensions: redistribute their weight proportionally across available dimensions.

Position normalization: `score = max(0, 100 - (avg_position - 1) * 1.5)`
CTR normalization: `score = min(100, avg_ctr * 1000)`

#### 6b: Trend Comparison

If a prior report exists in `docs/SEO/reports/`:

- Compare overall score: up/down/stable
- Compare each dimension score
- Note significant changes (> 5 point swing)

Use arrows: `[+5]` for improvement, `[-3]` for decline, `[=]` for stable

#### 6c: Assemble Report

Write the unified report to `docs/SEO/reports/seo-report-YYYY-MM-DD.md` using this template:

```markdown
# SEO Health Report - convertbanktoexcel.com

**Date:** YYYY-MM-DD
**Auditor:** SEO Manager Orchestrator
**URL:** <url>
**Skills Used:** <list of skills that ran successfully>
**Skills Skipped/Failed:** <list with reasons>
**Duration:** ~XX minutes

---

## Executive Summary

### Overall SEO Health Score: XX/100 [trend]

| Dimension           | Score  | Weight | Trend   | Key Finding |
| ------------------- | ------ | ------ | ------- | ----------- |
| Technical SEO       | XX/100 | 20%    | [trend] | ...         |
| Core Web Vitals     | XX/100 | 15%    | [trend] | ...         |
| On-Page SEO         | XX/100 | 15%    | [trend] | ...         |
| Content / Blog      | XX/100 | 10%    | [trend] | ...         |
| Schema              | XX/100 | 5%     | [trend] | ...         |
| Internal Linking    | XX/100 | 10%    | [trend] | ...         |
| Backlinks           | XX/100 | 10%    | [trend] | ...         |
| AI Search Readiness | XX/100 | 5%     | [trend] | ...         |
| GSC Performance     | XX/100 | 10%    | [trend] | ...         |

### Top 5 Priority Issues

1. **[CRITICAL]** ... (GSC data: ...)
2. **[HIGH]** ... (GSC data: ...)
3. ...
4. ...
5. ...

### Quick Wins (Impact vs Effort)

1. ... (GSC: keyword X at position Y with Z impressions)
2. ...
3. ...

---

## 1. Google Search Console Performance

[Paste GSC summary from Wave 1]

---

## 2. Core Web Vitals & Performance

[Paste PageSpeed summary from Wave 1, or "N/A - PageSpeed audit was skipped/failed"]

---

## 3. Technical SEO

[Paste SquirrelScan summary from Wave 1, or "N/A"]

---

## 4. On-Page SEO & Content Quality

[Paste SEO expert review from Wave 2]

---

## 5. Blog Content Health

[Paste blog audit summary from Wave 2, or "N/A"]

---

## 6. Structured Data & Schema Markup

[Paste schema review from Wave 2, or "N/A"]

---

## 7. Internal Link Structure

[Paste internal linking analysis from Wave 2, or "N/A"]

---

## 8. Backlink Profile

[Paste backlink analysis from Wave 2, or "N/A"]

---

## 9. AI Search Readiness (AEO/GEO)

[Paste AI search review from Wave 2, or "N/A"]

---

## 10. Competitive Intelligence

[Paste competitor analysis from Wave 2, or "Skipped - run with --competitor=<domain> to include"]

---

## 11. Keyword Research & Content Strategy

[Paste keyword strategy summary from Wave 2, or "Skipped - run with --include-strategy to include"]

**Note:** For full keyword roadmap with detailed action plans, see: `docs/SEO/keyword-strategy-roadmap-YYYY-MM-DD.md`

---

## Prioritized Action Plan

### Critical - This Week

[Items referencing GSC data for each recommendation]

### High Impact - This Month

[Items referencing GSC data]

### Medium - This Quarter

[Items]

### Ongoing Maintenance

[Items]

---

## Methodology

- **Data collection:** GSC API, Lighthouse (local), SquirrelScan CLI
- **Analysis:** Expert review, blog API audit, schema validation, AI search checks, link analysis, backlink assessment
- **Scoring:** Weighted average across 9 dimensions (weights reflect impact on organic growth)
- **GSC grounding:** All recommendations cite specific keywords, pages, and metrics from Google Search Console
```

---

### Step 7: Output Summary

Display to the user:

```
SEO Manager: Audit Complete
============================
Overall Health Score: XX/100 [trend]

Dimension Scores:
  Technical SEO:      XX/100
  Core Web Vitals:    XX/100
  On-Page SEO:        XX/100
  Blog Health:        XX/100
  Schema:             XX/100
  Internal Linking:   XX/100
  Backlinks:          XX/100
  AI Search:          XX/100
  GSC Performance:    XX/100

Top 3 Issues:
  1. [CRITICAL] ...
  2. [HIGH] ...
  3. [HIGH] ...

Report saved to: docs/SEO/reports/seo-report-YYYY-MM-DD.md
```

---

## Error Handling

| Error                              | Action                                                              |
| ---------------------------------- | ------------------------------------------------------------------- |
| GSC script fails                   | **HARD STOP** - Display error, help troubleshoot credentials/script |
| PageSpeed fails (Chrome not found) | Mark as N/A, note in report, continue                               |
| SquirrelScan not installed         | Mark as N/A, note in report, continue                               |
| Blog audit auth fails              | Mark as N/A, note in report, continue                               |
| Any Wave 2 task fails              | Mark dimension as N/A, redistribute weight, continue                |
| No prior report for trends         | Skip trend comparison, note "First report"                          |
| Competitor domain invalid          | Skip competitor analysis, note in report                            |
