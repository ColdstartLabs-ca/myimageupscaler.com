---
name: seo-content-3-kings-technique
description: Low-Hanging Fruit Content Refresh — find high-impression query/page pairs at GSC positions 5–15, validate intent fit, optimize the Three Kings (title, H1, first paragraph), compare top-ranking content gaps, request indexing manually, and recheck after 14 days.
---

# SEO Content 3 Kings Technique

> **Before starting:** Read recent SEO/blog changes — `tail -60 .Codex/skills/blog-changelog.md` and skim `docs/SEO/maintenance/seo-changes-backlog.md` to avoid rewriting pages that were just refreshed.

Two modes:

1. **Refresh mode** — find existing query/page pairs at positions 5–15 in GSC and improve them only when there is a clear on-page gap.
2. **Write mode** — baked into `blog-publish` Step 3 to ensure new posts are optimized from day one.

## When to Activate (Refresh Mode)

- User says "content refresh", "three kings", "low-hanging fruit", "refresh pages", "boost rankings"
- User wants to improve existing pages that are "almost ranking"
- After a GSC analysis identifies high-impression query/page pairs at positions 5–15

## What It Does

1. **Fetches GSC data** using the `gsc-analysis` script.
2. **Filters** for query/page rows with average position **5–15**.
3. **Prioritizes** by impressions first, then position and CTR gap.
4. **Maps** each keyword to its currently ranking URL and validates that the keyword intent genuinely fits the page.
5. **Audits** the Three Kings: title tag, H1, and first paragraph.
6. **Compares** the top 3 competing results for content-depth gaps on high-priority candidates.
7. **Adds** missing semantic/NLP terms only where they naturally improve completeness.
8. **Requests indexing manually** after publishing and sets a 14-day performance loop.

## Zero-CTR Blog Discovery Lane

Use this as a sub-workflow when the goal is to find blog pages with strong impressions but no clicks.

Run the CTR tracker first:

```bash
node ./.agents/skills/gsc-analysis/scripts/ctr-tracker.cjs \
  --site=myimageupscaler.com \
  --all-ctr-deficit \
  --min-impressions=1000 \
  --output=/tmp/ctr-miu.json
```

Then filter for `/blog/` URLs with:

- `impressions >= 1000`
- `ctr === 0` for strict zero-CTR scans, or `ctr <= 0.0025` for near-zero CTR recovery
- average position 4-15 unless the user asks for all high-impression misses

Route each candidate by diagnosis:

- Weak title, H1, or first paragraph: continue with this Three Kings workflow.
- Weak SERP promise or meta/title click appeal: use `serp-ctr-snippet-rewrite-technique`.
- Good SERP fit but weak in-article tool path or no body CTA: use `seo-blog-ctr-body-cta`.
- Query/page intent mismatch: use `content-gap`, `blog-edit`, or `cannibalization-consolidation-technique` depending on the cause.

Do not treat body CTA insertion as a Three Kings edit. This skill owns discovery and diagnosis; specialized skills own the fix when the fix is outside title, H1, first paragraph, meta, or intent/content fit.

## The Three Kings

| King   | Element                 | Rule                                                              |
| ------ | ----------------------- | ----------------------------------------------------------------- |
| King 1 | Title tag (`seo_title`) | Exact or close keyword front-loaded, natural, ideally <= 60 chars |
| King 2 | H1 heading              | Matches or closely mirrors title intent                           |
| King 3 | First paragraph         | Keyword appears in the first 1–2 sentences, no flowery delay      |

## Refresh Workflow

### 1. Discovery

- Pull GSC for the last 28 days.
- Use query+page rows, not query-only rows, so the target URL is explicit.
- Keep rows where average position is **5.0–15.0**.
- Sort by `impressions DESC`, then by strongest CTR gap.
- Exclude branded/navigational queries unless the page is meant to capture them.

### 2. Keyword-to-page validation

For each high-impression row:

- Confirm the keyword accurately describes the currently ranking URL.
- Flag, do not blindly optimize, when the SERP intent and page type mismatch.
  - Example: a how-to query ranking a product-list page may need a content pivot or support article, not just keyword injection.
- Skip pages already refreshed recently unless post-indexing data shows the refresh failed.

### 3. Three Kings audit and rewrite

Scrape or inspect the target page and check:

1. **Title tag:** keyword at/near the beginning?
2. **H1:** matches or closely mirrors the title/query intent?
3. **First paragraph:** exact or close phrase in sentence 1–2, without a generic intro?

If one or more kings are weak, propose exact replacement copy. Keep the rewrite surgical: title, H1, meta description when useful, and first 100 words. Do not rewrite the whole article unless competitive-gap evidence justifies it.

### 4. Competitive gap analysis

Run this for priority candidates, especially score >= 7 or >1,000 impressions:

- Scrape or review the current top 3 Google results for the target keyword.
- Compare:
  - **Word count:** if competitors average ~2x the page depth, flag content expansion.
  - **Media:** if competitors use many helpful images/examples and the page has few, flag media additions.
  - **Subheadings:** extract recurring H2/H3 topics competitors cover that the page lacks.
- Treat this as evidence for expansion, not automatic bloat. If the Three Kings are the only clear gap, keep the change small.

### 5. Semantic enrichment

Identify secondary terms that recur across the top 3 results but are missing from the page. Add only terms that are natural and useful for the reader.

- Good: weave terms into existing sections or FAQs.
- Bad: append a keyword dump, add awkward synonyms, or dilute the main intent.

### 6. Indexing and performance loop

After changes are live:

- Request indexing in GSC URL Inspection manually for each updated URL.
- Do **not** claim the URL Inspection API can submit pages for indexing. Use the API for inspection/status only; manual request indexing remains the reliable workflow for normal content pages.
- Add/update `docs/SEO/maintenance/gsc-request-indexing-backlog.md` when URLs need manual submission.
- Recheck after **14 complete GSC days**.
  - If position/CTR improves: record the win and avoid further edits.
  - If no movement: check indexing/canonical status, cannibalization, SERP mismatch, and backlink/authority gap before doing another copy pass.

## Reference

Based on: https://www.youtube.com/watch?v=Zn3i5ac9ydw

## Dependencies

- Requires `gsc-analysis` skill for fetching GSC data.
- Use `serp-ctr-snippet-rewrite-technique` when the main issue is CTR/snippet promise, not ranking.
- Use `cannibalization-consolidation-technique` when multiple URLs split the same query intent.
- GSC service account must have access to the domain's Search Console property.

## Integration

- **blog-publish Step 3** — Three Kings checklist is embedded as a MANDATORY write-time rule.
- Run `/seo-content-3-kings-technique [domain]` to audit existing published pages.

## Common Pitfalls

1. **Using query-only GSC rows.** Always map the keyword to the exact ranking URL before editing.
2. **Optimizing mismatched pages.** If intent is wrong, flag a pivot/support page/consolidation instead of forcing the keyword into the page.
3. **Rewriting recently refreshed pages too soon.** Wait for indexing and 14 complete GSC days unless the current page is clearly broken.
4. **Over-expanding every candidate.** Competitive-gap analysis is for high-priority pages; the core Three Kings play is surgical.
5. **Claiming API indexing submission.** URL Inspection API checks status; normal request indexing is manual through GSC.

## Files

| Item       | Path                                                    |
| ---------- | ------------------------------------------------------- |
| Prompt     | `.Codex/skills/seo-content-3-kings-technique/prompt.md` |
| Skill info | `.Codex/skills/seo-content-3-kings-technique/SKILL.md`  |
