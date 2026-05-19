---
name: blog-performance-monitor
description: Blog quality monitor for recurring SEO health checks and single-URL visibility incidents. Use when monitoring blog-only performance from Google Search Console, investigating a page whose impressions/clicks dried up, finding blog posts losing impressions, clicks, CTR, or rankings, correlating losses with recent markdown blog backlog/change-log items, preparing a recovery report, or handing off metadata/content fixes to blog-edit.
---

# Blog Performance Monitor

## Overview

Monitor blog-only GSC performance, explain drops, correlate them with recent blog backlog/change files, and hand off fixes to `blog-edit`. This skill is the monitoring and diagnosis layer, not the long-form editing layer.

For incident-style prompts like "this page got fewer impressions than usual" or "impressions dried up out of nowhere", treat the requested URL as the primary subject. First determine whether the URL was redirected, canonicalized, unpublished, noindexed, consolidated, or recently edited before recommending content changes.

Compose existing skills:

- `google-search-console-analysis`: impressions, clicks, CTR, position, page/query deltas, cannibalization.
- `seo-content-3-kings-technique`: title/H1/first paragraph refresh for pages ranking around positions 5-15.
- `seo-audit`: canonical, indexability, internal links, schema, and page quality checks.
- `pagespeed`: Core Web Vitals/Lighthouse checks when performance may explain losses.
- Project-local `blog-edit` at `.claude/skills/blog-edit/SKILL.md`: perform blog metadata/content updates after this skill produces the edit brief.

## Single-URL Incident Triage

Use this path before the recurring-monitor workflow when the user gives one URL.

1. **Normalize the URL**
   - Record the exact URL, slug, canonical destination, and whether production returns `200`, `301`, `302`, `307`, `308`, `404`, or `noindex`.
   - If the URL redirects, analyze the destination URL as the surviving page and mark the original URL's impression drop as expected unless GSC shows the destination also lost visibility.

2. **Fetch focused GSC evidence**
   - Use `.claude/skills/gsc-analysis` as the data source.
   - Compare the latest complete 14 or 28 days against the prior equal window.
   - Pull page, query, and query+page rows for both the original URL and any redirect/canonical destination.
   - Identify whether loss is from impressions, ranking position, CTR, or URL migration.

3. **Search change clues before editing**
   - Read the latest entries in:
     - `.claude/skills/blog-changelog.md`
     - `docs/SEO/maintenance/seo-changes-backlog.md`
     - `docs/SEO/maintenance/gsc-request-indexing-backlog.md`
     - relevant `docs/SEO/reports/*.md`
   - Search those files for the slug, old URL, destination URL, and top query terms.
   - Inspect recent git history for the slug and blog rendering/redirect code if the markdown backlogs do not explain the change.

4. **Classify the incident**
   - `intentional-migration`: old URL redirects or canonicalizes to a replacement.
   - `indexing-regression`: URL is noindexed, blocked, non-200, canonicalized incorrectly, or missing from sitemap unexpectedly.
   - `content-change-regression`: a recent edit changed title, H1, intro, body, schema, internal links, or target intent before the drop.
   - `serp-demand-shift`: impressions fell while position and destination health are stable.
   - `ctr-regression`: impressions are stable but clicks/CTR fell.

5. **Pick the next action**
   - For intentional migrations, request indexing for the destination if not done, monitor destination queries, and avoid rewriting the old URL.
   - For indexing regressions, fix the technical blocker before content work.
   - For content-change regressions, prepare a narrow `blog-edit` brief tied to the lost query cluster.
   - For SERP demand shifts, record the finding and avoid unnecessary edits unless the destination has an obvious stale-intent mismatch.

## Recurring Cadence

Run twice per week. Default windows:

- Current: latest complete GSC date minus 13 days through latest complete date.
- Previous: the immediately preceding 14 days.
- For explicit incidents, use the user's date, e.g. "after May 2", and normalize before/after windows by days.

Always note data freshness:

- GSC commonly lags 2-3 days.

## Inputs

Minimum:

- Site/domain.
- Blog URL pattern, usually `/blog/`.
- Date range or default twice-weekly comparison.

Optional:

- GSC export/API data.
- Recent deployment/change log.
- Blog backlog files.
- Known business events or publishing bursts.

## Workflow

1. **Fetch GSC blog-only data**
   - Use page+query+date dimensions where possible.
   - Filter to URLs matching `/blog/`.
   - Compute daily-normalized before/after metrics by URL and query.
   - Rank by impression loss, click loss, CTR loss, and position loss.

2. **Correlate with recent markdown changes/backlog**
   - Check recent markdown backlog/change files before recommending edits.
   - Always read `.claude/skills/blog-changelog.md` if present; it is the project-local blog edit changelog used by `blog-edit`.
   - Prefer these locations when present:
     - `.claude/skills/blog-changelog.md`
     - `docs/SEO/maintenance/seo-changes-backlog.md`
     - `docs/SEO/maintenance/gsc-request-indexing-backlog.md`
     - `docs/SEO/reports/*.md`
     - `docs/PRDs/*blog*.md`
     - `docs/PRDs/*seo*.md`
   - Compare publish/update dates, metadata refreshes, content rewrites, redirects, template changes, and indexing requests against the drop window.
   - If git history is available, inspect recent changes for affected blog slugs and blog rendering code.

3. **Classify each loser**
   - Impressions down, position stable: query volatility, SERP layout, seasonality, title/query mismatch, or stale indexing.
   - Impressions down, position worse: content quality, cannibalization, indexation, or intent mismatch.
   - Clicks down, impressions stable: CTR/snippet issue.
   - Multiple blog URLs share the same query: cannibalization or unclear target page.

4. **Prepare edit brief**
   - For each page, specify target query, new SEO title, new meta description, H1/title, first paragraph adjustment, internal links to add, and any content modules needed.
   - Keep SEO titles roughly 30-60 characters and descriptions 120-160 characters.
   - Use query modifiers only when supported by GSC: `free`, `online`, `2026`, `tested`, `no signup`, `no watermark`, `unblur`, `sharpener`, etc.

5. **Apply updates**
   - Load `.claude/skills/blog-edit/SKILL.md` and follow its workflow.
   - Use `blog-edit`'s API-based update path: read the blog changelog, fetch the current post, PATCH only changed fields, verify, then append a changelog entry.
   - Use `x-api-key` with `BLOG_API_KEY` from `.env.api`, as documented in `blog-edit`.
   - Ensure generated/static pages are revalidated or redeployed after updates.

6. **Report and follow-up**
   - Save a dated report in the repo's SEO reports directory when available.
   - Include applied fixes, open actions, and the next monitoring date.
   - Recommend Search Console indexing requests for important updated URLs.

## GSC Pattern

Use the existing fetcher for broad data:

```bash
node ~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28 --row-limit=25000 --output=/tmp/gsc.json
```

For incident comparisons, query dimensions:

```js
dimensions: ['date', 'page', 'query'];
```

Calculate:

- impressions/day before and after
- clicks/day before and after
- CTR before and after
- average position before and after
- top lost queries per URL
- competing URLs per query

## Edit Brief Format

```markdown
## Edit Brief: /blog/[slug]

Evidence:

- GSC: [metric change]
- Recent change correlation: [backlog/git/deploy evidence or none found]

Target query:

- [query]

Update:

- SEO title: [title]
- Meta description: [description]
- H1/title: [visible title]
- First paragraph: [one-sentence adjustment]
- Internal links: [source pages and anchor text]
- Content additions: [FAQ/table/section if needed]
```

## Report Format

```markdown
# Blog Quality Monitor - [date]

Data:

- GSC: [range]
- Backlog/change files checked: [files]

## Blog URLs Losing Visibility

| URL | GSC change | Recent change correlation | Likely cause | Action |
| --- | ---------: | ------------------------- | ------------ | ------ |

## Changes Correlated

[recent edits/publishes/template changes that line up with drops]

## Fixes Applied

[metadata/content/internal links/revalidation]

## Next Run

[date and checks]
```

## Single-URL Incident Report Format

```markdown
# Blog Visibility Incident - [date]

URL: [original URL]
Destination/canonical: [URL or none]
Production status: [status/canonical/noindex finding]
GSC freshness: [latest complete date]

## Finding

[one-paragraph answer: why impressions changed]

## Evidence

- GSC: [before/after metrics for original URL and destination]
- Backlog/changelog clues: [dated entries]
- Technical check: [status, canonical, sitemap, indexing if checked]

## Classification

[intentional-migration | indexing-regression | content-change-regression | serp-demand-shift | ctr-regression]

## Action

[request indexing, monitor destination, fix blocker, or blog-edit brief]
```
