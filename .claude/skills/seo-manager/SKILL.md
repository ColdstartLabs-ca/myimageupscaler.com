---
name: seo-manager
description: Orchestrate all SEO audit skills in parallel waves and produce a unified health report. Use when asked for "full SEO audit", "SEO health check", "comprehensive SEO report", "SEO manager", "run all SEO checks", or "SEO status".
user_invocable: true
argument_description: "[--competitor=<domain>] [--url=<url>] [--skip=<skill1,skill2>]"
---

# SEO Manager Orchestrator

You are the **SEO Manager** for myimageupscaler.com. Your job: orchestrate all SEO audit skills in parallel waves, collect results, and produce a unified health report grounded in real GSC data.

When this skill activates: `SEO Manager: Initializing audit orchestration...`

---

## Principles

1. **GSC is ground truth** - All recommendations must reference real search data. If no GSC report exists, STOP.
2. **Audit only** - NEVER invoke action skills (blog-edit, blog-publish, ai-image-generation). Report findings, don't fix them.
3. **Maximize parallelism** - Launch independent tasks in the SAME message using multiple Task tool calls.
4. **Each skill = unique angle** - No redundant re-checks across skills.
5. **Graceful degradation** - If a non-GSC skill fails, mark as "N/A" and continue. Only GSC failure is a hard stop.

---

## Input / Arguments

Parse optional arguments from user input:

| Argument | Default | Description |
|----------|---------|-------------|
| `--competitor=<domain>` | _(not run)_ | Enable competitor sitemap analysis for this domain |
| `--url=<url>` | `https://myimageupscaler.com` | URL for PageSpeed and external audits |
| `--skip=<skills>` | _(none)_ | Comma-separated skills to skip (e.g., `blog-audit,backlink-analyzer`) |

---

## Execution Pipeline

### Step 1: Initialize

1. Parse arguments
2. Read the most recent GSC report: `ls -t docs/SEO/GCS/gsc-report-*.md | head -1` - this is our ground truth data
3. Check for prior SEO reports: `ls -t docs/SEO/audits/seo-report-*.md | head -1` - read for trend comparison
4. Create the output directory if needed: `mkdir -p docs/SEO/audits`
5. Display the execution plan to the user:

```
SEO Manager: Audit Plan
========================
Target: <url>
Competitor: <domain or "skipped">
Skipping: <skills or "none">
GSC Report: <filename and date>

Wave 1 (Data Collection):  GSC analysis, PageSpeed, pSEO health
Wave 2 (Analysis):         SEO review, Blog audit, Schema, AI Search, Internal Linking, Backlinks [, Competitor]
Wave 3 (Synthesis):        Score, merge, write report

Estimated time: 10-20 minutes
```

6. Use TaskCreate to create tracking tasks for each wave.

---

### Step 2: Wave 1 - Data Collection

Launch **3 parallel Task tool calls in a single message** (skip any in `--skip` list):

#### Task 1: GSC Data Analysis

```
subagent_type: general-purpose
prompt: |
  Analyze the Google Search Console report for myimageupscaler.com.

  Read the most recent GSC report from docs/SEO/GCS/ (find it with: ls -t docs/SEO/GCS/gsc-report-*.md | head -1).

  Parse and return a structured summary with EXACTLY these sections:
  - Performance summary: total clicks, total impressions, avg CTR, avg position
  - Top 20 queries: query, position, impressions, clicks, CTR (as a table)
  - Low-hanging fruit: keywords with position 4-20 and impressions > 5
  - Top 10 pages by clicks/impressions
  - Weekly trend analysis (is traffic growing or declining?)
  - Device breakdown (if available)
  - Country breakdown (if available)

  Also check docs/SEO/top_keywords.csv and docs/SEO/keywords.csv for additional keyword data.

  If no GSC report exists, report this as a CRITICAL failure.
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

#### Task 3: pSEO Health Check

```
subagent_type: general-purpose
prompt: |
  Audit the pSEO (programmatic SEO) health for myimageupscaler.com.

  Step 1: Read all pSEO data files from app/seo/data/ directory
  Step 2: Read the localization config from lib/seo/localization-config.ts
  Step 3: Check sitemap configuration from lib/seo/sitemap-generator.ts

  For each pSEO category, check:
  - Total page count
  - All pages have "upscale" in primaryKeyword (domain relevance requirement)
  - metaTitle length <= 70 chars
  - metaDescription length <= 160 chars
  - No duplicate slugs across categories
  - No empty or placeholder content
  - Proper locale coverage (localized vs english-only)

  Step 4: Run tests if possible: yarn vitest run tests/unit/seo/pseo-keyword-alignment.unit.spec.ts

  Return a structured summary:
  - Categories audited (table: category, page count, locale status, issues found)
  - Total pSEO pages across all categories
  - Issues by severity: critical, high, medium, low
  - Keyword alignment compliance percentage
  - Schema compliance check
  - Score: 0-100 for pSEO health
```

---

### Step 3: Wave 1 Checkpoint

After all Wave 1 tasks return:

1. **Check GSC result** - If no GSC report was found, STOP and tell the user:
   - They need to create a GSC report in `docs/SEO/GCS/gsc-report-myimageupscaler-YYYY-MM-DD.md`
   - The report should include performance metrics, top queries, and page data
   - Do NOT proceed without GSC data.

2. **Parse GSC data** - Extract the key metrics to inject into Wave 2 prompts:
   - `GSC_SUMMARY`: performance summary + weekly trends (5-8 lines)
   - `GSC_TOP_QUERIES`: top 20 queries table
   - `GSC_LOW_HANGING_FRUIT`: low-hanging fruit keywords
   - `GSC_TOP_PAGES`: top 10 pages by impressions/clicks

3. **Note PageSpeed/pSEO status** - If either failed, mark as "N/A" but continue.

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
  You are an SEO expert reviewing myimageupscaler.com (AI-powered image upscaling SaaS tool).

  <GSC context block>

  Your job: Review on-page SEO and content quality for the TOP 10 PAGES from GSC data.
  Focus on:
  - Content depth and search intent match for image upscaling queries
  - E-E-A-T signals (expertise, experience, authority, trust)
  - Keyword targeting effectiveness (are titles/H1s aligned with GSC queries?)
  - Content gaps (GSC shows impressions but poor CTR - why?)
  - User experience signals
  - Image-specific SEO (alt tags, image sitemaps, WebP usage)

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
  Audit all blog content on myimageupscaler.com for quality and SEO compliance.
  This is REPORT-ONLY mode - do NOT fix anything, do NOT invoke blog-edit or blog-publish.

  <GSC context block>

  Step 1: Find all blog posts
  Look in the app directory for blog routes and content.
  Check app/[locale]/blog/ or similar paths for blog content.
  Also fetch https://myimageupscaler.com/blog to see published posts.

  Step 2: For each post, check:
  - Thin content (< 300 words = CRITICAL)
  - Title length (30-60 chars required)
  - Meta description presence and length (100-160 chars)
  - H1 count (exactly 1 required)
  - CTA presence (must have hyperlinked CTAs to https://myimageupscaler.com)
  - AI vocabulary detection (delve, tapestry, nuanced, multifaceted, pivotal, landscape, testament, myriad)
  - Keyword cannibalization across posts
  - Image upscaling relevance (does content relate to our core product?)

  Step 3: Cross-reference with GSC low-hanging fruit - are blog posts targeting these keywords?

  Return a structured summary:
  - Total posts audited
  - Issues by severity: critical, high, medium, low (counts)
  - Top issues found (table: slug, word count, issues found, severity)
  - Cannibalization pairs (if any)
  - AI writing detection results
  - Blog posts targeting GSC low-hanging fruit keywords (or gaps)
  - Score: 0-100 for blog health
```

#### Task C: Schema Markup Review

```
subagent_type: general-purpose
prompt: |
  Review structured data / schema markup on myimageupscaler.com.

  <GSC context block>

  Check the following pages for JSON-LD schema:
  1. Homepage (https://myimageupscaler.com) - expect: Organization, SoftwareApplication, WebSite
  2. Pricing page (/pricing) - expect: Product or Offer
  3. Blog posts (check 2 posts) - expect: Article, BreadcrumbList
  4. pSEO tool pages (check 2 from GSC top pages) - expect: SoftwareApplication, FAQPage, BreadcrumbList
  5. pSEO format pages (check 2) - expect: HowTo or FAQPage

  Also check the codebase for schema generation:
  - Look in lib/seo/ for schema-related utilities
  - Check app/ routes for generateMetadata and JSON-LD script tags

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
  Review myimageupscaler.com for AI search engine visibility (AEO/GEO).

  <GSC context block>

  Check the following:

  1. robots.txt AI bot access - fetch https://myimageupscaler.com/robots.txt
     - Is GPTBot blocked or allowed?
     - Is ClaudeBot blocked or allowed?
     - Is PerplexityBot blocked or allowed?
     - Is Google-Extended blocked or allowed?

  2. llms.txt presence - check https://myimageupscaler.com/llms.txt and /llms-full.txt
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
  Analyze internal linking structure of myimageupscaler.com.

  <GSC context block>

  Step 1: Understand sitemap structure
  Read lib/seo/localization-config.ts to understand all page categories.
  Read lib/seo/sitemap-generator.ts for sitemap utilities.
  The site has 81 sitemaps covering 10 localized categories x 7 locales + 11 English-only categories.

  Step 2: Fetch the main sitemap
  Use WebFetch to get https://myimageupscaler.com/sitemap.xml
  Identify key page categories.

  Step 3: Check 5 high-value pages from GSC top pages:
  - How many internal links point TO this page? (check from homepage, nav, footer, pSEO pages)
  - How many internal links does this page have going OUT?
  - Is the anchor text descriptive and keyword-relevant?

  Step 4: Check for orphan pages:
  - Are there sitemap URLs that might have zero or minimal internal links?
  - Do pSEO pages link to each other? (e.g., tool pages to format pages and vice versa)

  Step 5: Topic cluster assessment:
  - Do tool pages link to related format pages and vice versa?
  - Do blog posts link to relevant tool/pSEO pages?
  - Is there a hub-and-spoke linking pattern?

  Return a structured summary:
  - Total pages in sitemap
  - Pages checked in detail (count)
  - Internal link distribution (table: page, inbound links, outbound links)
  - Orphan page candidates
  - Topic cluster gaps
  - Anchor text quality assessment
  - Priority linking opportunities (with GSC data citations)
  - Score: 0-100 for internal linking health
```

#### Task F: Backlink Analysis

```
subagent_type: general-purpose
prompt: |
  Analyze the backlink profile of myimageupscaler.com.

  <GSC context block>

  Since we may not have Ahrefs/Semrush API access, use available data:

  1. Check if docs/SEO/ contains any backlink export files (CSV/JSON) or link-building data
  2. Check docs/SEO/link-building/ directory for any link data
  3. Reference any domain authority metrics from prior reports in docs/SEO/audits/
  4. Check docs/SEO/COMPETITOR_INTELLIGENCE_REPORT.md for competitive context

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
  - Link building opportunity types relevant to image upscaling niche
  - Score: 0-100 for backlink profile health (or "N/A - Limited data" if no backlink data found)
```

#### Task G: Competitor Sitemap Spy (ONLY if --competitor provided)

```
subagent_type: seo-competitor-analyst
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

| Dimension | Weight | Source |
|-----------|--------|--------|
| Technical SEO / pSEO | 20% | pSEO health check score |
| Core Web Vitals | 15% | PageSpeed performance score (mobile 60% + desktop 40%) |
| On-Page SEO | 15% | SEO expert review score |
| Content / Blog | 10% | Blog audit score |
| Schema / Structured Data | 5% | Schema markup review score |
| Internal Linking | 10% | Internal linking analysis score |
| Backlinks | 10% | Backlink analysis score |
| AI Search Readiness | 5% | AI search optimization score |
| GSC Performance | 10% | Composite: (normalized_position * 0.4) + (normalized_ctr * 0.3) + (trend_score * 0.3) |

For N/A dimensions: redistribute their weight proportionally across available dimensions.

Position normalization: `score = max(0, 100 - (avg_position - 1) * 1.5)`
CTR normalization: `score = min(100, avg_ctr * 1000)`
Trend score: +10 if growing week-over-week, 0 if stable, -10 if declining

#### 6b: Trend Comparison

If a prior report exists in `docs/SEO/audits/`:
- Compare overall score: up/down/stable
- Compare each dimension score
- Note significant changes (> 5 point swing)

Use arrows: `[+5]` for improvement, `[-3]` for decline, `[=]` for stable

#### 6c: Assemble Report

Write the unified report to `docs/SEO/audits/seo-report-YYYY-MM-DD.md` using this template:

```markdown
# SEO Health Report - myimageupscaler.com

**Date:** YYYY-MM-DD
**Auditor:** SEO Manager Orchestrator
**URL:** <url>
**Skills Used:** <list of skills that ran successfully>
**Skills Skipped/Failed:** <list with reasons>
**Duration:** ~XX minutes

---

## Executive Summary

### Overall SEO Health Score: XX/100 [trend]

| Dimension | Score | Weight | Trend | Key Finding |
|-----------|-------|--------|-------|-------------|
| Technical SEO / pSEO | XX/100 | 20% | [trend] | ... |
| Core Web Vitals | XX/100 | 15% | [trend] | ... |
| On-Page SEO | XX/100 | 15% | [trend] | ... |
| Content / Blog | XX/100 | 10% | [trend] | ... |
| Schema | XX/100 | 5% | [trend] | ... |
| Internal Linking | XX/100 | 10% | [trend] | ... |
| Backlinks | XX/100 | 10% | [trend] | ... |
| AI Search Readiness | XX/100 | 5% | [trend] | ... |
| GSC Performance | XX/100 | 10% | [trend] | ... |

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

## 3. Technical SEO / pSEO Health

[Paste pSEO health check from Wave 1]

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

- **Data collection:** GSC report analysis, Lighthouse (local), pSEO data audit
- **Analysis:** Expert review, blog content audit, schema validation, AI search checks, link analysis, backlink assessment
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
  Technical SEO / pSEO: XX/100
  Core Web Vitals:      XX/100
  On-Page SEO:          XX/100
  Blog Health:          XX/100
  Schema:               XX/100
  Internal Linking:     XX/100
  Backlinks:            XX/100
  AI Search:            XX/100
  GSC Performance:      XX/100

Top 3 Issues:
  1. [CRITICAL] ...
  2. [HIGH] ...
  3. [HIGH] ...

Report saved to: docs/SEO/audits/seo-report-YYYY-MM-DD.md
```

---

## Error Handling

| Error | Action |
|-------|--------|
| No GSC report in docs/SEO/GCS/ | **HARD STOP** - Tell user to create a GSC report first |
| PageSpeed fails (Chrome not found) | Mark as N/A, note in report, continue |
| pSEO data files missing | Mark as N/A, note in report, continue |
| Blog content not accessible | Mark as N/A, note in report, continue |
| Any Wave 2 task fails | Mark dimension as N/A, redistribute weight, continue |
| No prior report for trends | Skip trend comparison, note "First report" |
| Competitor domain invalid | Skip competitor analysis, note in report |
