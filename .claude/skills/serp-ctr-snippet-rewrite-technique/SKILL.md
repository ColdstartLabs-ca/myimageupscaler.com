---
name: serp-ctr-snippet-rewrite-technique
description: Use when improving organic CTR from Google Search Console data by finding high-impression pages/queries ranking in positions 1-10 or 1-15 with weak CTR or zero clicks, then producing SERP snippet rewrite briefs covering title tags, meta descriptions, H1s, direct answers, FAQs, schema, and internal links.
---

# SERP CTR Snippet Rewrite Technique

Turn GSC page/query data into rewrite briefs that increase clicks without changing the target URL unless cannibalization or intent mismatch makes that necessary.

## Project Quick Run

Use project GSC output and, for blog pages, the blog SEO audit:

```bash
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/gsc-miu.json
node ./.claude/skills/gsc-analysis/scripts/audit-blog-seo.cjs \
  --gsc=/tmp/gsc-miu.json --suggest --output=/tmp/blog-audit-miu.json
```

Read `growthOverview.ctr`, `ctrOptimization`, `pageCtrOpportunities`, and `/tmp/blog-audit-miu.json`. A useful output must include exact title, meta, H1/direct-answer, FAQ, internal-link, and validation recommendations for each target URL.

## Inputs

Use real Google Search Console exports/API data when available. Related skills may supply context:

- `google-search-console-analysis` or `gsc-analysis` for fetching/filtering GSC data.
- `seo-content-3-kings-technique` for title/H1/intro refreshes.
- `schema-markup` for JSON-LD implementation details.
- `ai-search-optimization` when the rewrite should also improve answer-engine citation likelihood.

Minimum fields: page URL, query, impressions, clicks, CTR, average position. Helpful fields: device, country, current title, meta description, H1, top competing SERP snippets, current schema, and internal links.

## Target Selection

Prioritize rows or page/query clusters that meet all criteria:

- High impressions relative to the dataset.
- Average position 1-10 by default; expand to 1-15 when the user asks for broader low-hanging fruit.
- Weak CTR for the rank band, or zero clicks despite meaningful impressions.
- Search intent matches the current page, or can be satisfied with a focused rewrite.

Use these CTR flags unless the user provides site-specific baselines:

| Average position |         Weak CTR signal |
| ---------------: | ----------------------: |
|                1 |               below 20% |
|                2 |               below 10% |
|                3 |                below 7% |
|              4-5 |                below 4% |
|             6-10 |                below 2% |
|            11-15 | below 1% or zero clicks |

When many queries map to one URL, cluster by intent before writing. Do not optimize a page for unrelated intents; recommend a new page, consolidation, or retargeting instead.

## Rewrite Workflow

1. Identify the primary query cluster for each URL by impressions, rank, and intent fit.
2. Diagnose the likely CTR problem: vague title, missing benefit, wrong modifier, stale year, weak meta, no direct answer, no rich result eligibility, brand ambiguity, intent mismatch, or competing snippets out-promising the page.
3. Write a brief with precise replacements, not general advice.
4. Preserve rankings by keeping the core query and page intent aligned. Avoid clickbait that the page cannot satisfy.
5. Add internal-link recommendations from relevant pages using anchors that reinforce the target query cluster.
6. Define validation: annotate the change date, request indexing if appropriate, and compare CTR/clicks after GSC data has at least 14-28 days of post-change data.

## Brief Format

For each priority URL, output:

```markdown
## [Priority] [URL]

**GSC evidence**: [query cluster], [impressions], [clicks], [CTR], [avg position], [date range]
**CTR diagnosis**: [specific reason the snippet likely underperforms]
**Intent**: [informational/commercial/local/navigational] - [what the searcher wants]

**Title tag**: [<=60 chars, query front-loaded when natural]
**Meta description**: [<=155 chars, concrete value/answer, no empty hype]
**H1**: [clear page promise, query or close variant included]
**Direct answer block**: [2-4 sentence answer or definition to place near the top]
**FAQ additions**:

- [Question] - [short answer]
- [Question] - [short answer]

**Schema**: [Article/FAQPage/HowTo/Product/SoftwareApplication/BreadcrumbList/etc.] - [fields to add/update]
**Internal links**:

- From: [source URL/page type] | Anchor: [anchor text] | Reason: [relevance]

**Implementation notes**: [CMS fields/files/components if known]
**Validation**: [metric to watch and comparison window]
```

## Quality Bar

- Keep titles specific, non-duplicative, and aligned to the actual page.
- Meta descriptions should earn the click by clarifying outcome, freshness, comparison angle, or scope.
- Direct-answer blocks should make the page more useful immediately, not merely repeat the title.
- FAQ questions must come from real query variants or SERP intent, not generic filler.
- Schema must match visible page content.
- If current ranking is position 1-3, favor lower-risk snippet changes before heavy content rewrites.

## Project-Specific Filters

- Exclude branded navigational queries unless the page is not the homepage or the brand result has a clear trust/route problem.
- Prioritize non-branded zero-click queries with positions 1-10, especially best/free/no-signup/no-watermark/comparison/sharpener/upscaling-vs-sharpening terms.
- If the same query appears in `opportunities.cannibalization`, include consolidation notes in the rewrite brief.
