---
name: cannibalization-consolidation-technique
description: Turn Google Search Console cannibalization findings into URL-level SEO consolidation decisions, including primary/support/merge/redirect/noindex/canonical/internal-link actions and concrete edit briefs. Use when analyzing competing URLs for the same query, overlapping intent, pSEO duplication, content pruning, consolidation planning, or post-GSC cannibalization cleanup.
---

# Cannibalization Consolidation Technique

Use this after `gsc-analysis` or `google-search-console-analysis` identifies queries where multiple URLs receive meaningful impressions, clicks, or rankings. Coordinate with `internal-linking-optimizer`, `programmatic-seo`, and `seo-content-3-kings-technique` when the fix needs link graph changes, pSEO quality gates, or title/H1/intro refreshes.

## Project Quick Run

Use the project GSC or synthesized SEO output:

```bash
node ./.Codex/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/gsc-miu.json
node ./.Codex/skills/ga-analysis/scripts/ga-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/ga-miu.json
node ./.Codex/skills/seo-growth-plan/scripts/seo-synthesize.cjs \
  --gsc=/tmp/gsc-miu.json --ga=/tmp/ga-miu.json --site=myimageupscaler.com \
  --output=/tmp/seo-plan-miu.json
```

Read `opportunities.cannibalization` from `/tmp/seo-plan-miu.json` first because it includes GA sessions for competing pages. Fall back to `growthOverview.cannibalization` in GSC when GA is unavailable.

## Project Backlog Context

Before recommending redirects, canonicals, noindex, or retargeting in this repo, read:

- `docs/SEO/maintenance/seo-changes-backlog.md`
- `docs/SEO/maintenance/gsc-request-indexing-backlog.md`

Then check recent git history for matching redirect/canonical/sitemap/test work when needed. If a consolidation already exists, do not propose it again; recommend production verification, GSC lag monitoring, or internal-link cleanup only.

## Required Inputs

- GSC query-page rows: query, page, clicks, impressions, CTR, average position, date range.
- URL context: current title, H1, canonical, indexability, status code, intent, page type, and target conversion path when available.
- Business context: which URL should win if rankings are equal.

If data is missing, proceed with a labeled confidence level and state what must be verified before implementation.

## Workflow

1. Group rows by query and normalize URLs.
2. Check SEO maintenance backlogs and git history for already-applied redirects, canonicals, sitemap exclusions, unpublishes, or internal-link changes.
3. Identify the intent behind each query: informational, commercial, transactional, navigational, local, support, comparison, or entity lookup.
4. Classify each competing URL:
   - `Primary`: best intent match and the URL that should rank.
   - `Support`: distinct sub-intent that should remain indexed and link to the primary.
   - `Merge`: overlapping content that should be folded into the primary.
   - `Redirect`: obsolete or weaker duplicate with no unique search job.
   - `Noindex`: useful to users but not search-worthy, thin, faceted, filtered, internal, or low-value at scale.
   - `Canonical`: near-duplicate that must stay accessible but should consolidate signals to the primary.
   - `Retarget`: valid page aimed at the wrong query; adjust title/H1/body/internal anchors toward a different keyword.
5. Choose one primary URL per query cluster unless intents are clearly different.
6. Convert decisions into edit briefs with exact on-page, technical, and linking actions.
7. Define validation: GSC query-page monitoring, crawl checks, indexation checks, and timing.

## Decision Rules

- Pick `Primary` by intent match first, then conversions, backlinks/internal links, freshness, content depth, engagement, and existing ranking strength.
- Use `Support` when the page answers a narrower or adjacent intent that deserves its own result.
- Use `Merge` when two pages answer the same intent and both contain useful unique sections.
- Use `Redirect` when the weaker URL has no independent value and a clean equivalent exists.
- Use `Canonical` when duplicate/near-duplicate URLs must remain live, such as variants, sort/filter URLs, syndicated copies, or tracking-safe alternates.
- Use `Noindex` for pages that are useful for navigation or users but dilute index quality, especially pSEO pages failing `programmatic-seo` uniqueness, data, or engagement gates.
- Use `Internal-link` actions whenever Google is ranking the wrong URL because anchors, hubs, breadcrumbs, nav, or related links point ambiguously.
- Use `seo-content-3-kings-technique` when the primary URL ranks position 5-15 and needs a title, H1, and first-paragraph refresh.

## MyImageUpscaler Cluster Rules

- "Best free AI image upscaler 2026" and no-signup/no-watermark variants should usually have one canonical comparison page plus support pages that link to it.
- `free-ai-upscaler-no-watermark` and `free-upscaler-no-sign-up` should stay indexed only if they serve distinct trust/friction objections; otherwise support, merge, or redirect.
- "AI upscaling vs sharpening" should have one primary explainer. Broader enhancement-quality pages should retarget to quality/workflow intent and link to the explainer.
- Do not count homepage or dashboard impressions as intentional winners for non-branded blog/listicle intents unless their content actually satisfies that query.

## Output Format

```markdown
# Cannibalization Consolidation Plan: [domain]

**Period**: [date range] | **Data source**: [GSC/API/export/manual] | **Confidence**: [High/Medium/Low]

## Query Clusters

| Priority | Query / Cluster | Primary URL | Competing URLs | Decision | Why |
| -------: | --------------- | ----------- | -------------- | -------- | --- |

## URL Actions

| URL | Role | Action | Target URL | Technical Notes |
| --- | ---- | ------ | ---------- | --------------- |

## Edit Briefs

### [Primary URL]

**Goal**: Own [query/intent].
**Keep**: [sections/data/modules].
**Add/Merge**: [specific content from competing URLs].
**Retarget/Remove**: [phrases, headings, duplicate sections].
**Three Kings**: Title: [draft]; H1: [draft]; First paragraph: [draft direction].
**Internal Links**: Add links from [source URLs] using anchors [anchors]. Update links away from [wrong URL].
**Technical**: [canonical/redirect/noindex/status/sitemap notes].

## Implementation Order

1. [highest-risk or highest-impact action]
2. [next action]
3. [validation step]

## Validation

- Re-crawl affected URLs after deploy.
- Confirm canonical, noindex, redirect, and sitemap states.
- Monitor GSC query-page distribution after the normal 2-3 day GSC lag, then compare after 14 and 28 days.
```

## Guardrails

- Do not redirect or noindex a URL with meaningful unique conversions, links, or intent without naming the tradeoff.
- Do not merge genuinely different intents into one bloated page.
- Preserve useful unique content before deleting or redirecting.
- For pSEO sets, make decisions at both template level and individual URL level; avoid one-off fixes when the template is the cause.
