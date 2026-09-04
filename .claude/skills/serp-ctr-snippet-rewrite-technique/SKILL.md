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

## Project Backlog Context

Before writing CTR rewrite briefs for this repo, read:

- `docs/SEO/maintenance/seo-changes-backlog.md`
- `docs/SEO/maintenance/gsc-request-indexing-backlog.md`

If a page was recently refreshed, revalidated, requested for indexing, or is waiting for GSC lag to clear, skip another rewrite and output a validation-only recommendation. Use recent git history or report links from the backlog when the current status is unclear.

## Inputs

Use real Google Search Console exports/API data when available. Related skills may supply context:

- `google-search-console-analysis` or `gsc-analysis` for fetching/filtering GSC data.
- `gsc-causation-correlation` for event-aligned pre/post windows and the recorded MIU evidence on which edit classes actually move clicks.
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

## Edit Eligibility Gates (pre-flight)

Run every candidate through these gates before writing a brief. All four are backed by MIU causation evidence recorded 2026-09-03 (final GSC data 2026-05-01→2026-08-31; see `gsc-causation-correlation` SKILL.md). Each failure case below consumed real edit cycles before it was understood — gating on them is the point of this skill:

- **Demand change, not a CTR problem**: impressions fell or rose while weighted position stayed roughly flat. Demand or SERP composition changed; no snippet edit applies. Example: `best free ai image upscaler 2026` impressions collapsed 986→26/week at unchanged position ~5-7 — the 07-20 title test was not the cause.
- **Phantom/SERP-feature cluster**: CTR below ~0.1% at positions 8-12 with very large impressions. Example: `how to fix pixelated photos` produced 0-6 clicks/week through 49K impressions/week across four separate edits (2026-06-07→08-10); the traffic is SERP-feature/phantom and editing cannot earn it. Inspect the SERP before recommending anything.
- **Junk-position bloat**: impressions growing while weighted position sits around 50-60. Example: `/blog/text-image-enhancer` after the 2026-07-22 pass grew impressions 6→60/day at position 50-60 for 6 clicks in 4 weeks. Impression growth at those positions is index bloat, not an optimization target.
- **Open verdict window**: the URL was edited within the last 14 days and the prior test's window has not closed. Output a validation-only recommendation and the date the window closes.

Gating a row out is a valid outcome: name the gate that fired and the check that would reopen the row.

## Snippet Test Ladder

When the gates pass, run edits as a ladder — one variable per rung, each with a closed 14-day verdict window before the next rung. This is the pattern that compounded `/blog/best-free-ai-image-upscaler-2026-tested-compared` from 5 to 493 clicks/week across five stacked 2026-05-24→06-29 edits:

1. **Rung 1 — SERP title only.** One field. Annotate the change date, request indexing, close a 14-day window.
2. **Rung 2 — meta description only** (or the other SERP-only field the diagnosis points to). Another 14-day window.
3. **Rung 3 — proof-led body pass** (direct answer + evidence module above the fold) only after two snippet rungs have closed and were judged. This is `seo-content-3-kings-technique` scope, not a snippet test.
4. **Stop rule**: position holds in the target band while clicks stay near zero after two closed rungs → the SERP itself absorbs the clicks. Stop editing; reclassify the row under the eligibility gates.

Two edits inside one window cannot be attributed separately; if they must land close together, measure and report the program effect, not per-edit causation.

## Rewrite Workflow

1. Identify the primary query cluster for each URL by impressions, rank, and intent fit.
2. Check the SEO maintenance backlogs for recent changes to that URL or query cluster.
3. Diagnose the likely CTR problem: vague title, missing benefit, wrong modifier, stale year, weak meta, no direct answer, no rich result eligibility, brand ambiguity, intent mismatch, or competing snippets out-promising the page.
4. Write a brief with precise replacements, not general advice.
5. Preserve rankings by keeping the core query and page intent aligned. Avoid clickbait that the page cannot satisfy.
6. Add internal-link recommendations from relevant pages using anchors that reinforce the target query cluster.
7. Define validation: annotate the change date, request indexing if appropriate, and compare CTR/clicks after GSC data has at least 14-28 days of post-change data.

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
**Backlog check**: [recent change found, skip reason, or none found]
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
