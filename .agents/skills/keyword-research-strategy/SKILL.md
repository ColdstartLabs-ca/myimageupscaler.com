---
name: keyword-research-strategy
description: Research high-potential keywords, analyze search intent, map keywords to pages, and create a prioritized content roadmap. Use when asked for "keyword research", "keyword strategy", "content roadmap", "keyword planning", "find easy wins", or "keyword opportunities".
user_invocable: true
argument_description: "[--limit=<number>] [--competition=low|medium|high] [--focus=easy-wins|long-tail|all]"
---

# Keyword Research & Strategy

You are a **keyword research strategist** for convertbanktoexcel.com. Your job: analyze available keyword data, identify high-potential opportunities, map keywords to pages, and create a prioritized content roadmap.

When this skill activates: `Keyword Research Strategy: Analyzing opportunities...`

---

## Principles

1. **GSC is ground truth** - Start with actual search data showing proven demand
2. **Intent-first approach** - Match keywords to user intent (informational, commercial, transactional)
3. **Easy wins bias** - Prioritize low-competition, long-tail keywords with clear intent
4. **Content gap focus** - Identify what users search for vs what pages exist
5. **Actionable output** - Every recommendation must include: keyword, intent, target URL, priority

---

## Input / Arguments

Parse optional arguments from user input:

| Argument              | Default     | Description                                              |
| --------------------- | ----------- | -------------------------------------------------------- |
| `--limit=<number>`    | 20          | Number of keyword opportunities to include in roadmap    |
| `--competition=<lvl>` | `low`       | Filter by competition level: low, medium, high, or all   |
| `--focus=<type>`      | `easy-wins` | Focus area: easy-wins, long-tail, all                    |

---

## Execution Pipeline

### Step 1: Data Collection

Launch **2 parallel tasks** to gather keyword data:

#### Task 1: GSC Data Analysis

```
subagent_type: general-purpose
description: Fetch GSC data
prompt: |
  Fetch Google Search Console data for convertbanktoexcel.com.

  Run:
  npx tsx scripts/gsc-direct-fetch.ts

  Then read the most recent JSON from docs/SEO/gsc-exports/

  Extract and return EXACTLY these sections:

  1. **Performance Summary** (last 90 days):
     - Total queries tracked
     - Total impressions
     - Total clicks
     - Average CTR
     - Average position

  2. **All Queries** (not just top 20):
     - Query text
     - Position
     - Impressions
     - Clicks
     - CTR

     Sort by impressions DESC, include ALL queries with impressions > 5

  3. **Low-Hanging Fruit** (position 4-20, impressions > 10):
     - Query
     - Current position
     - Impressions
     - Clicks
     - CTR
     - Potential impact if moved to position 1-3

  4. **High Impression, Low CTR** (impressions > 50, CTR < 2%):
     - Query
     - Position
     - Impressions
     - CTR
     - Likely reason (poor title/meta, wrong intent match, etc.)

  5. **Top Pages by Clicks**:
     - URL
     - Clicks
     - Impressions
     - CTR
     - Average position

  Format as structured data (JSON or markdown tables) for easy parsing.

  If the script fails, report the exact error and STOP.
```

#### Task 2: Ahrefs Data Discovery

```
subagent_type: general-purpose
description: Find Ahrefs data
prompt: |
  Search for Ahrefs keyword export files in the project.

  Step 1: Search for Ahrefs files
  Use Glob to find: docs/SEO/**/*ahrefs*.{csv,json,md}
  Use Glob to find: docs/SEO/**/*keyword*.{csv,json}
  Use Glob to find: docs/SEO/**/*competitor*.{csv,json,md}

  Step 2: For each file found, read the first 50 lines to understand the format

  Step 3: Extract keyword data from the most relevant/recent file:
  - Keyword text
  - Search volume
  - Keyword difficulty (KD) / Competition
  - Current ranking position (if available)
  - CPC (if available)
  - Search intent (if available)
  - Parent topic (if available)

  Step 4: Also check for competitor analysis data:
  - What keywords competitors rank for that we don't
  - Keyword gaps

  Return:
  - List of files found with dates
  - Structured keyword data from the best source
  - Competitor keyword gaps (if available)
  - Data freshness (date of export)

  If no Ahrefs data found, return: "No Ahrefs data available - using GSC only"
```

---

### Step 2: Data Synthesis

After both tasks complete, synthesize the data:

#### 2a. Merge Data Sources

1. **Create master keyword list** by merging:
   - GSC queries (actual search demand)
   - Ahrefs keywords (volume + competition data)

2. **Enrich each keyword** with:
   - Search volume (from Ahrefs OR estimate from GSC impressions)
   - Competition level (from Ahrefs KD OR infer from GSC position/CTR)
   - Current ranking (from GSC)
   - Current page (from GSC top pages)
   - Traffic potential (impressions × expected CTR improvement)

3. **Deduplicate** and normalize:
   - Combine similar variants (e.g., "convert pdf bank statement to excel" vs "converting pdf bank statements to excel")
   - Group by parent topic

#### 2b. Search Intent Classification

For each keyword, classify intent using these rules:

| Intent Type     | Signals                                                           | Example                                      |
| --------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| Navigational    | Brand name, "login", "app", "tool"                                | "convertbanktoexcel", "cbe login"            |
| Transactional   | "convert", "download", "free", "online", action verbs             | "convert bank statement to excel"            |
| Commercial      | "best", "vs", "review", "comparison", "tool", "software"          | "best bank statement converter"              |
| Informational   | "how to", "what is", "guide", "tutorial", question words          | "how to convert pdf to excel"                |
| Problem-solving | "fix", "error", "not working", "help", specific pain points       | "fix ocr errors in bank statements"          |

Assign primary and secondary intent to each keyword.

#### 2c. Keyword-to-Page Mapping

For each keyword, determine:

1. **Current state:**
   - Does a page exist that targets this keyword?
   - Is it ranking? (from GSC data)
   - What's the current performance? (impressions, clicks, CTR, position)

2. **Ideal state:**
   - What URL should target this keyword?
   - What type of page? (tool landing, pSEO bank page, format page, blog post, help doc)
   - What content structure? (product page, guide, comparison, FAQ)

3. **Gap status:**
   - ✅ **Well-covered**: Page exists, ranks well, good CTR
   - ⚠️ **Needs optimization**: Page exists but underperforming (low CTR, position 4-20)
   - 🆕 **Content gap**: No relevant page exists, or wrong page is ranking
   - 🔄 **Intent mismatch**: Page exists but doesn't match search intent

---

### Step 3: Opportunity Scoring

Score each keyword opportunity using this formula:

```
Priority Score = (Impact × Feasibility) / Effort

Where:
  Impact = Search Volume × Expected CTR × Conversion Potential
  Feasibility = (100 - Competition) × (Current Position Bonus)
  Effort = 1 (existing page optimization) or 3 (new page creation)

Expected CTR by position:
  Position 1: 30%
  Position 2: 15%
  Position 3: 10%
  Position 4-10: 5%
  Position 11-20: 2%
  Position 21+: 0.5%

Current Position Bonus:
  Already ranking 1-3: 2x (maintain)
  Ranking 4-10: 3x (easy to push up)
  Ranking 11-20: 1.5x (medium effort)
  Not ranking: 1x (requires new content)

Conversion Potential (intent-based):
  Transactional: 3x
  Commercial: 2x
  Problem-solving: 2x
  Informational: 1x
  Navigational: 0.5x
```

Sort all keywords by Priority Score DESC.

---

### Step 4: Segment Opportunities

Group keywords into strategic segments:

#### Segment A: Quick Wins (Easy Wins)
- Currently ranking position 4-20
- Impressions > 50
- Low to medium competition
- Clear transactional or commercial intent
- **Action: Optimize existing page (title, meta, content, CTAs)**

#### Segment B: Content Gaps (High Potential)
- No current page or wrong page ranking
- Search volume > 100 (or impressions > 20 from GSC)
- Low competition
- Clear intent match with product/service
- **Action: Create new page**

#### Segment C: Long-Tail Clusters
- Related long-tail variations (3+ words)
- Low competition
- Can be targeted by single comprehensive page
- **Action: Create hub page or expand existing content**

#### Segment D: Intent Mismatch Fixes
- Page exists and ranks, but CTR is poor
- Search intent doesn't match landing page type
- **Action: Restructure page or create better-matched page**

#### Segment E: Defensive (Maintain)
- Currently ranking position 1-3
- Good CTR
- **Action: Monitor and maintain**

#### Segment F: Long-term Targets
- High competition OR high volume
- Requires backlinks, authority, or significant content
- **Action: Backlog for later**

---

### Step 5: Generate Content Roadmap

Create a prioritized roadmap with `--limit` opportunities (default 20).

For each opportunity, provide:

1. **Keyword** (primary + variants)
2. **Search Volume** (monthly)
3. **Competition** (Low/Medium/High)
4. **Current Status** (ranking position, impressions, clicks, CTR OR "not ranking")
5. **Search Intent** (primary + secondary)
6. **Priority Score** (calculated)
7. **Segment** (Quick Win / Content Gap / Long-Tail / etc.)
8. **Target URL** (existing or proposed)
9. **Page Type** (Tool landing / pSEO Bank / pSEO Format / Blog post / Help doc / Comparison)
10. **Action Required** (Optimize existing / Create new / Fix intent mismatch / Restructure)
11. **Content Recommendations**:
    - Title suggestion
    - H1 suggestion
    - Meta description suggestion
    - Key content sections needed
    - CTAs to include
12. **Estimated Impact** (monthly clicks if optimized to position 1-3)
13. **Estimated Effort** (hours or complexity: Low 1-4h / Medium 4-8h / High 8+h)

---

### Step 6: Write Report

Save the output to `docs/SEO/keyword-strategy-roadmap-YYYY-MM-DD.md` using this template:

```markdown
# Keyword Research & Strategy Roadmap
# convertbanktoexcel.com

**Date:** YYYY-MM-DD
**Data Sources:** Google Search Console (90 days) + Ahrefs snapshots
**Total Keywords Analyzed:** XXX
**Roadmap Focus:** [easy-wins / long-tail / all]
**Competition Filter:** [low / medium / high / all]

---

## Executive Summary

### Current Performance (GSC 90-day)
- **Total Queries Tracked:** XXX
- **Total Impressions:** XXX
- **Total Clicks:** XXX
- **Average CTR:** X.XX%
- **Average Position:** XX.X

### Opportunity Snapshot
- **Quick Wins (Segment A):** XX opportunities - Est. +XXX monthly clicks
- **Content Gaps (Segment B):** XX opportunities - Est. +XXX monthly clicks
- **Long-Tail Clusters (Segment C):** XX clusters - Est. +XXX monthly clicks
- **Intent Mismatches (Segment D):** XX pages - Est. +XXX monthly clicks
- **Total Potential Impact:** +XXX monthly clicks (if all implemented)

### Top 5 Immediate Priorities
1. [Keyword] - Quick Win - Est. +XX clicks/month - 2h effort
2. [Keyword] - Content Gap - Est. +XX clicks/month - 6h effort
3. ...

---

## Data Sources & Freshness

| Source                         | Date       | Coverage                                 |
| ------------------------------ | ---------- | ---------------------------------------- |
| Google Search Console          | YYYY-MM-DD | 90 days, XXX queries, XXX pages          |
| Ahrefs Export                  | YYYY-MM-DD | XXX keywords, competition data           |
| Competitor Analysis (if avail) | YYYY-MM-DD | Keyword gaps vs [competitor.com]         |

---

## Keyword Segments

### Segment A: Quick Wins (Position 4-20, Easy Push)
**Est. Total Impact:** +XXX monthly clicks
**Recommended Timeline:** This week

| # | Keyword | Vol | Comp | Pos | Impr | Clicks | CTR | Intent | Target URL | Action | Impact | Effort |
|---|---------|-----|------|-----|------|--------|-----|--------|------------|--------|--------|--------|
| 1 | ... | 500 | Low | 12 | 450 | 5 | 1.1% | Transactional | /seo/convert-bank-statement-to-excel | Optimize title, add FAQ schema | +45 clicks | 2h |
| 2 | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |

**Quick Win Details:**

#### 1. [Keyword 1]
- **Current:** Position 12, 450 impressions/month, 5 clicks (1.1% CTR)
- **Target:** Position 3, 450 impressions/month, ~45 clicks (10% CTR)
- **Potential Gain:** +40 clicks/month (+800% increase)
- **Search Intent:** Transactional - User wants to convert bank statements NOW
- **Current Page:** /seo/convert-bank-statement-to-excel
- **Gap Analysis:**
  - Title too generic, doesn't include "free" or "online"
  - Missing FAQ schema (competitors have it)
  - No clear CTA above fold
  - H1 doesn't match exact search query
- **Action Plan:**
  1. Update title: "Convert Bank Statement to Excel FREE Online | Fast & Secure"
  2. Update H1 to match: "Convert Bank Statement to Excel"
  3. Add FAQ schema: "How do I convert a bank statement to Excel?", "Is it free?", "Is it secure?"
  4. Add prominent CTA above fold: "Upload Your Statement (PDF) →"
  5. Add trust signals: "Secure", "No email required", "Works with all banks"
- **Content Structure:**
  - Hero: Clear value prop + CTA
  - How it works (3 steps)
  - FAQ section (8 questions)
  - Trust signals (security, privacy, supported banks)
  - Secondary CTA
- **Expected Outcome:** Move from position 12 → 5 within 2 weeks, then 5 → 3 within 4 weeks
- **Effort:** 2 hours (content update + schema implementation)

---

### Segment B: Content Gaps (High Potential, No Page)
**Est. Total Impact:** +XXX monthly clicks
**Recommended Timeline:** This month

| # | Keyword | Vol | Comp | Status | Intent | Proposed URL | Page Type | Impact | Effort |
|---|---------|-----|------|--------|--------|--------------|-----------|--------|--------|
| 1 | ... | 300 | Low | No page | Commercial | /compare/bank-statement-converters | Comparison | +30 clicks | 6h |
| 2 | ... | ... | ... | ... | ... | ... | ... | ... | ... |

**Content Gap Details:**

#### 1. [Keyword 1]
- **Search Volume:** 300/month
- **Competition:** Low (Ahrefs KD: 15)
- **Search Intent:** Commercial Investigation - User comparing tools before choosing
- **Current Status:** No dedicated comparison page; /pricing ranks at position 45
- **Opportunity:** Create comprehensive comparison page
- **Proposed URL:** /compare/bank-statement-converters
- **Page Type:** Comparison / Buying Guide
- **Target Structure:**
  - Title: "Best Bank Statement Converters 2026: Free vs Paid Comparison"
  - H1: "Bank Statement Converter Comparison: Find the Right Tool"
  - Sections:
    1. Quick comparison table (features, pricing, pros/cons)
    2. Why ConvertBankToExcel is different
    3. Feature deep-dive
    4. Use case recommendations
    5. FAQ: "Which bank statement converter is best for accountants?"
    6. CTA: "Try Free Converter →"
- **Competitive Analysis:**
  - Competitor A has this, ranks #3, thin content (400 words)
  - Competitor B has this, ranks #5, no comparison table
  - **Our advantage:** We can create BEST comparison with actual feature matrix
- **Content Requirements:**
  - 1200+ words
  - Comparison table (6 tools)
  - FAQ schema (6 questions)
  - Screenshots of our tool
  - Trust signals (user reviews, supported banks)
- **Expected Outcome:** Rank position 3-5 within 8 weeks
- **Estimated Impact:** +30 monthly clicks
- **Effort:** 6 hours (research, writing, design, schema)

---

### Segment C: Long-Tail Keyword Clusters
**Est. Total Impact:** +XXX monthly clicks
**Recommended Timeline:** This quarter

| Cluster Topic | Keywords | Total Vol | Comp | Proposed URL | Page Type | Impact | Effort |
|---------------|----------|-----------|------|--------------|-----------|--------|--------|
| Chase Bank Conversion | 5 variants | 450 | Low | /banks/chase | pSEO Bank Hub | +50 clicks | 8h |
| ... | ... | ... | ... | ... | ... | ... | ... |

**Long-Tail Cluster Details:**

#### Cluster 1: Chase Bank Conversion
- **Keywords in Cluster:**
  1. "convert chase bank statement to excel" (150/mo, position 18)
  2. "chase bank pdf to csv" (100/mo, position 25)
  3. "download chase statements to excel" (80/mo, not ranking)
  4. "chase bank statement converter" (70/mo, position 15)
  5. "chase statement excel format" (50/mo, not ranking)
- **Total Volume:** 450/month
- **Current Status:** /banks/chase exists but thin content (300 words)
- **Opportunity:** Expand into comprehensive Chase-specific hub page
- **Target URL:** /banks/chase (expand existing)
- **Search Intent:** Mixed - Transactional (convert now) + Informational (how to download from Chase)
- **Content Strategy:**
  - Serve ALL intents on one comprehensive page
  - Primary CTA: Upload Chase statement to convert
  - Secondary content: Guide on downloading from Chase online banking
- **Proposed Structure:**
  - Title: "Convert Chase Bank Statements to Excel/CSV | Free Online Tool"
  - H1: "Chase Bank Statement to Excel Converter"
  - Sections:
    1. Tool CTA (convert now)
    2. How to download from Chase online banking (with screenshots)
    3. Supported Chase formats (PDF, CSV, QFX, OFX, QBO)
    4. Common Chase statement issues (OCR tips for scanned PDFs)
    5. Use cases (taxes, mortgage, bookkeeping, Xero/QuickBooks import)
    6. FAQ (10 Chase-specific questions)
    7. Related: Link to other bank pages, format pages
- **Content Requirements:**
  - Expand from 300 to 1800+ words
  - Add 3-5 screenshots (Chase online banking download flow)
  - Add FAQ schema (10 questions)
  - Add HowTo schema (downloading from Chase)
  - Internal links to /formats/csv, /formats/excel, /use-cases/taxes
- **Expected Outcome:**
  - Position 18 → 5 for primary keyword
  - Position 25 → 8 for secondary
  - Rank for 3 currently unranked keywords
- **Estimated Impact:** +50 monthly clicks
- **Effort:** 8 hours (content writing, screenshot creation, schema, testing)

---

### Segment D: Intent Mismatch Fixes
**Est. Total Impact:** +XXX monthly clicks
**Recommended Timeline:** This month

| # | Keyword | Pos | Impr | CTR | Current Page | Issue | Fix | Impact | Effort |
|---|---------|-----|------|-----|--------------|-------|-----|--------|--------|
| 1 | ... | 8 | 200 | 0.5% | /about | Wrong page | Create /blog/how-to-X | +15 clicks | 4h |
| ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |

---

### Segment E: Defensive (Maintain Rankings)
**Current Monthly Clicks:** XXX
**Recommended Action:** Monitor weekly, maintain content freshness

| Keyword | Pos | Clicks | CTR | Page | Action |
|---------|-----|--------|-----|------|--------|
| ... | 1 | 150 | 28% | /seo/bank-statement-converter | Monitor for SERP changes, refresh quarterly |
| ... | ... | ... | ... | ... | ... |

---

### Segment F: Long-term Backlog (High Effort/Competition)
**Recommended Timeline:** Later (requires backlinks or significant authority)

| Keyword | Vol | Comp | Reason for Backlog | Est. Backlinks Needed |
|---------|-----|------|--------------------|-----------------------|
| "bank statement converter" | 5000 | High | Dominated by Ahrefs DR 60+ sites | 20+ quality links |
| ... | ... | ... | ... | ... |

---

## Search Intent Analysis

### Intent Distribution (All Keywords)
- Transactional: XX% (convert, export, download keywords)
- Commercial: XX% (best, comparison, review keywords)
- Informational: XX% (how to, guide, tutorial keywords)
- Problem-solving: XX% (fix, error, help keywords)
- Navigational: XX% (brand, login keywords)

### Intent Gaps (Search demand vs content coverage)
- **High demand, low coverage:**
  - Commercial Investigation: XX keywords with XX monthly volume - need comparison/review pages
  - Problem-solving: XX keywords with XX monthly volume - need troubleshooting guides
- **Well-covered:**
  - Transactional: XX% coverage
  - Informational: XX% coverage

---

## Competitive Keyword Gaps

[If Ahrefs competitor data is available]

### Keywords Competitors Rank For (We Don't)

| Keyword | Competitor | Their Pos | Vol | Comp | Opportunity |
|---------|------------|-----------|-----|------|-------------|
| ... | competitor.com | 3 | 200 | Low | HIGH - create /page/url |
| ... | ... | ... | ... | ... | ... |

---

## Implementation Timeline

### Week 1-2: Quick Wins (Segment A)
- [ ] Optimize XX existing pages (estimated 2-3h each)
- [ ] Add FAQ schema to top 5 pages
- [ ] Fix title/meta issues
- [ ] Expected impact: +XXX clicks/month

### Month 1: Content Gaps (Segment B - High Priority)
- [ ] Create XX new pages (estimated 6h each)
- [ ] Implement schema markup
- [ ] Internal linking strategy
- [ ] Expected impact: +XXX clicks/month

### Month 2-3: Long-Tail Clusters (Segment C)
- [ ] Expand XX existing pages to comprehensive hubs
- [ ] Create content clusters with internal linking
- [ ] Expected impact: +XXX clicks/month

### Ongoing: Intent Mismatches & Maintenance
- [ ] Fix XX intent mismatch issues
- [ ] Monitor Segment E (defensive) weekly
- [ ] Refresh underperforming content quarterly

---

## Measurement & Success Metrics

Track in GSC weekly:

1. **Quick Wins (Segment A):**
   - Target: 50% move from position 4-20 to position 1-3 within 4 weeks
   - Success metric: +XX% impressions, +XXX% clicks

2. **Content Gaps (Segment B):**
   - Target: New pages rank position 5-10 within 8 weeks
   - Success metric: +XXX clicks/month from new pages

3. **Long-Tail Clusters (Segment C):**
   - Target: Capture 3+ keywords per cluster page
   - Success metric: +XX% click-through on cluster topics

4. **Overall Site:**
   - Target: +XX% total organic clicks within 3 months
   - Target: Increase tracked keywords in position 1-10 by XX%

---

## Next Steps

1. **Review and prioritize** this roadmap with stakeholder
2. **Start with Segment A** (Quick Wins) - immediate ROI
3. **Create content calendar** for Segment B and C
4. **Set up tracking** in GSC for target keywords
5. **Schedule bi-weekly reviews** to track progress and adjust priorities

---

## Appendix: Full Keyword List

[CSV export or full table of all keywords analyzed with all metrics]

---

## Notes & Assumptions

- Search volumes estimated from GSC impressions where Ahrefs data unavailable
- Competition levels inferred from current SERP analysis where Ahrefs KD unavailable
- Impact estimates assume position 1-3 CTR rates (conservative)
- Effort estimates based on current team velocity and content complexity
- Timeline assumes single content creator working 20h/week on SEO content
```

---

### Step 7: Output Summary

Display to the user:

```
Keyword Research Strategy: Complete
=====================================

Data Analyzed:
  GSC Queries: XXX
  Ahrefs Keywords: XXX (or "N/A - using GSC only")
  Total Unique Keywords: XXX

Opportunity Breakdown:
  Quick Wins (Segment A):        XX keywords - Est. +XXX clicks/month
  Content Gaps (Segment B):      XX keywords - Est. +XXX clicks/month
  Long-Tail Clusters (Segment C): XX clusters - Est. +XXX clicks/month
  Intent Mismatches (Segment D):  XX pages    - Est. +XXX clicks/month

Total Potential Impact: +XXX monthly clicks

Top 3 Immediate Actions:
  1. [Keyword] - [Segment] - Est. +XX clicks - Xh effort
  2. [Keyword] - [Segment] - Est. +XX clicks - Xh effort
  3. [Keyword] - [Segment] - Est. +XX clicks - Xh effort

Roadmap saved to: docs/SEO/keyword-strategy-roadmap-YYYY-MM-DD.md

Next: Review roadmap and start with Segment A (Quick Wins) for immediate impact.
```

---

## Tips for Best Results

1. **Run after fresh GSC data fetch:**
   ```bash
   npx tsx scripts/gsc-direct-fetch.ts
   /keyword-research-strategy
   ```

2. **Focus on easy wins first:**
   ```bash
   /keyword-research-strategy --focus=easy-wins --competition=low --limit=10
   ```

3. **Explore long-tail opportunities:**
   ```bash
   /keyword-research-strategy --focus=long-tail --limit=30
   ```

4. **Monthly refresh:**
   - Re-run monthly to track progress
   - Compare roadmaps to see what moved
   - Adjust priorities based on results

5. **Integration with other skills:**
   - After roadmap creation, use `/blog-publish` to create content
   - Use `/seo-audit` to verify on-page optimization
   - Use `/seo-manager` for comprehensive health check

---

## Error Handling

| Error | Action |
|-------|--------|
| GSC script fails | **HARD STOP** - Display error, cannot proceed without search data |
| No Ahrefs data found | Continue with GSC-only analysis, note limitation in report |
| Empty GSC data | Check if site is new, verify GSC setup, use Ahrefs if available |
| Invalid arguments | Display usage help and exit |
