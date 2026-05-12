---
name: blog-opportunities-publisher
description: Find new blog topic opportunities from Google Search Console and SEO backlog data, run an anti-cannibalization gate, decide whether publishing is warranted, and hand off creation/publishing to the repo-local blog-publish skill. Use when asked to find new blog topics, publish SEO blog opportunities, expand blog coverage, use GSC to discover content gaps, or run a recurring blog opportunity publisher. May decide to publish nothing when no qualified opportunity exists.
---

# Blog Opportunities Publisher

## Overview

Find new blog topics that can realistically win organic traffic, validate them against existing coverage and backlog files, run an anti-cannibalization gate, then use `.claude/skills/blog-publish/SKILL.md` only when a candidate is worth publishing. This skill is the opportunity discovery and selection layer; `blog-publish` is the writing and publishing layer.

Compose existing project/local skills:

- `google-search-console-analysis`: discover query gaps, rising queries, pages ranking for terms they do not fully satisfy, and low-hanging fruit.
- Project-local `blog-publish` at `.claude/skills/blog-publish/SKILL.md`: create draft, use/reuse images, publish, verify, update tracking, and append changelog.
- `seo-audit` when a topic may be better handled by fixing an existing page instead of publishing a new post.
- `ai-search-optimization` only when the user asks for AI-search/AEO topic coverage, not for normal blog expansion.

## Inputs

Minimum:

- Site/domain, usually `myimageupscaler.com`.
- Blog URL pattern, usually `/blog/`.
- Desired cadence or count, e.g. "publish 2 opportunities" or "weekly run".

Optional:

- GSC export/API data.
- SEO roadmap/backlog files.
- A theme constraint, such as "image enhancement", "photo restoration", or "formats".
- A publish limit.

## Workflow

1. **Read publishing context**
   - Read `.claude/skills/blog-publish/SKILL.md` before publishing.
   - Read `.claude/skills/blog-changelog.md` if present.
   - Read topic tracking and roadmap files before selecting topics:
     - `docs/SEO/long-tail-keyword-roadmap.md`
     - `docs/SEO/blog-content-tracking/topics-covered.md`
     - `docs/seo/blog-content-gaps-*.md`
     - `docs/SEO/maintenance/seo-changes-backlog.md`
     - `docs/SEO/reports/*.md`

2. **Gather GSC opportunity data**
   - Fetch query+page data using the existing GSC fetcher or user-provided export.
   - Include page and query dimensions.
   - Prefer 28-90 days for discovery. Use 28 days for fresh opportunities, 90 days for stable backlog planning.
   - Segment by whether the ranking page is a blog URL.

3. **Generate candidate topics**
   - Find high-impression queries with no strong matching blog post.
   - Find queries landing on homepage/tool/pSEO pages that deserve a supporting blog post.
   - Find queries where multiple unrelated pages rank weakly, suggesting unclear topical ownership.
   - Find queries with positions 8-25 and enough impressions to justify a focused post.
   - Pull planned-but-unpublished topics from roadmap/backlog files.

4. **De-duplicate and avoid cannibalization**
   - Search existing published posts, topic tracking, and changelog for the target query and close variants.
   - If a strong matching post exists, do not publish a new post; create an edit brief for `blog-edit` instead.
   - If an existing page is close but weak, prefer refreshing it over publishing a near-duplicate.
   - Only create a new post when the search intent is meaningfully distinct.
   - Treat this as a hard gate: a candidate that fails anti-cannibalization cannot be published in this run.

5. **Decide whether to publish**
   - Publish nothing if no candidate passes the anti-cannibalization gate and scoring threshold.
   - Publish nothing if the best action is to refresh an existing blog post, tool page, or pSEO page.
   - Publish nothing if the evidence is too weak, e.g. low impressions, unclear intent, volatile/trivial query, or no business fit.
   - When publishing nothing, still produce a report explaining candidates reviewed, rejection reasons, and recommended non-publishing actions.

6. **Score candidates**
   - Score each candidate with:
     - GSC evidence: impressions, trend, position, clicks, page mismatch.
     - Rankability: long-tail or mid-tail, low competition, realistic for current domain authority.
     - Business fit: routes users toward upscaling, enhancement, restoration, conversion, or related tools.
     - Coverage gap: no existing page fully satisfies the intent.
     - Internal link fit: can support existing pSEO/tool pages.
   - Prefer topics in the 300-5,000 monthly-volume long-tail range when using roadmap data.
   - Avoid head terms unless the goal is support content, not direct ranking.

7. **Select publish batch**
   - Default to 1-3 topics per run unless the user requests more.
   - Select zero topics when none qualify.
   - For each selected topic, prepare a publish brief:
     - primary keyword
     - slug
     - search intent
     - why this is not duplicate coverage
     - target internal links
     - CTA/tool route
     - expected category/tags
     - evidence from GSC/backlog

8. **Publish through `blog-publish`**
   - Load `.claude/skills/blog-publish/SKILL.md`.
   - Follow its workflow exactly: changelog, roadmap check, tracking check, images, create post, internal links, publish, verify, update tracking, changelog.
   - Use `BLOG_API_KEY` from `.env.api` and the blog API endpoints as documented by `blog-publish`.
   - Do not invoke `blog-publish` when the selected publish batch is empty.

9. **Report**
   - Save a dated report in `docs/SEO/reports/` when available.

- Include candidates considered, selected topics, topics rejected as duplicates, posts published, and follow-up checks.
  - If nothing was published, make that the headline outcome and list the better actions.

## GSC Pattern

Use the existing fetcher for broad data:

```bash
node ~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=90 --row-limit=25000 --output=/tmp/gsc-opportunities.json
```

For direct API queries, request dimensions:

```js
dimensions: ['query', 'page'];
```

Candidate filters:

- impressions >= 30 for recent 28-day checks
- impressions >= 100 for 90-day planning
- average position 8-25 for low-hanging opportunities
- landing page is not a blog post, or landing blog post does not match intent
- query contains concrete modifiers such as platform, format, use case, scale, "free", "online", "no watermark", "without losing quality", "for print", "for Etsy", or "for Midjourney"

## Candidate Brief Format

```markdown
## Candidate: [primary keyword]

Evidence:

- GSC: [impressions/clicks/position/current landing page]
- Backlog/roadmap: [source file or none]
- Existing coverage check: [no duplicate / refresh existing page instead]

Decision:

- [Publish / Reject / Refresh existing / Publish nothing]

Anti-cannibalization:

- Existing matching URLs: [URLs]
- Verdict: [passes / fails]
- Reason: [distinct intent or duplicate/overlap]

Publish brief:

- Slug: [slug]
- Title angle: [angle]
- Search intent: [intent]
- Internal links: [target pages]
- Category/tags: [category and tags]
- CTA route: [tool/homepage route]
```

## Report Format

```markdown
# Blog Opportunities Publisher - [date]

Data:

- GSC: [range/source]
- Files checked: [roadmap/tracking/changelog/backlog]

## Selected Topics

| Keyword | Evidence | Slug | Why publish |
| ------- | -------- | ---- | ----------- |

## No-Publish Decision

[Use when no candidate qualifies. Explain why publishing nothing is the right action.]

## Rejected or Deferred

| Keyword | Reason | Better action |
| ------- | ------ | ------------- |

## Published

| Slug | Target keyword | Verification |
| ---- | -------------- | ------------ |

## Next Run

[date and what to recheck]
```
