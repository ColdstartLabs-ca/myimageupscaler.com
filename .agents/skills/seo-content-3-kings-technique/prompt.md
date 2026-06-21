---
name: seo-content-3-kings-technique
description: Low-Hanging Fruit Content Refresh — identify high-impression query/page pairs ranking positions 5–15 in GSC, validate intent fit, optimize the Three Kings, analyze competitive gaps, and recheck after indexing.
user_invocable: true
argument_description: '[domain or page URL] — e.g. myimageupscaler.com or a specific page path'
---

You are an SEO content strategist executing the **Low-Hanging Fruit Content Refresh** technique. Your goal: find pages Google already likes (positions 5–15) and push them higher with surgical on-page improvements, not broad rewrites by default.

## Preflight

1. Read recent changes to avoid duplicate work:

```bash
tail -60 .claude/skills/blog-changelog.md
sed -n '1,220p' docs/SEO/maintenance/seo-changes-backlog.md
```

2. If a target page was refreshed recently, do not rewrite again unless there are at least 14 complete GSC days after indexing or clear evidence the previous change missed the query intent.

## Workflow

### Phase 1 — Discovery: Find Low-Hanging Fruit

Fetch GSC data for the domain:

```bash
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=DOMAIN --days=28 --output=/tmp/gsc-DOMAIN.json 2>&1
```

Read `/tmp/gsc-DOMAIN.json` and use query+page rows where available. Do not rely only on query-level rows because each keyword must map to the URL Google is already ranking.

**Target criteria:**

- Average position: **5.0–15.0**
- Impressions: **highest first**
- CTR: below what the position suggests
- Intent: non-branded/non-navigational unless the page is intended for that branded query

Sort by: `impressions DESC, CTR gap DESC, position ASC` within the 5–15 range.

Output a ranked table:

| Query | Page | Position | Impressions | Clicks | CTR | Priority |
| ----- | ---- | -------- | ----------- | ------ | --- | -------- |
| ...   | ...  | ...      | ...         | ...    | ... | ...      |

#### Zero-CTR Blog Discovery Lane

When the request is specifically about blog pages with high impressions and zero or near-zero CTR, run the CTR tracker before choosing an edit path:

```bash
node ./.agents/skills/gsc-analysis/scripts/ctr-tracker.cjs \
  --site=DOMAIN \
  --all-ctr-deficit \
  --min-impressions=1000 \
  --output=/tmp/ctr-DOMAIN.json
```

Filter candidates to `/blog/` URLs with:

- `impressions >= 1000`
- strict zero CTR: `ctr === 0`
- near-zero CTR recovery: `ctr <= 0.0025`
- average position 4-15 unless the user asks to include all positions

Route each page by diagnosis:

- Three Kings weakness: continue with this workflow.
- SERP/title/meta click-promise weakness: use `serp-ctr-snippet-rewrite-technique`.
- Article has acceptable SERP fit but lacks a useful in-body tool path or CTA: use `seo-blog-ctr-body-cta`.
- Intent mismatch, content gap, or cannibalization: use the appropriate specialist skill before editing.

Do not classify body CTA insertion as a Three Kings edit. This workflow can discover and triage those pages, but the CTA skill performs that fix.

### Phase 2 — Keyword-to-Page Validation

For each high-impression query/page pair:

1. **Identify the target keyword** — highest impressions plus strong intent fit.
2. **Confirm the ranking URL** — the page currently receiving impressions for that keyword.
3. **Validate page fit** — the keyword must accurately represent the page content.
   - If the query is "how to write a good song" but the page is only a product list, flag a content pivot/support page instead of forcing the phrase into Three Kings.
   - If the SERP is mostly comparison content and the page is a tool page, flag the mismatch.
4. **Check recent changes** — skip or defer pages already refreshed recently unless post-indexing data proves failure.

### Phase 3 — Three Kings Audit

Scrape or inspect the target URL and check the exact target keyword or close natural phrase in:

1. **Title tag** — front-loaded if possible, natural, ideally <= 60 chars.
2. **H1 tag** — matches or closely mirrors the title/query intent.
3. **First paragraph** — appears in sentence 1–2; avoid flowery intros that delay the answer.

If any king is missing or weak, recommend exact copy for:

1. **King 1 — Title Tag**
2. **King 2 — H1 Tag**
3. **King 3 — First Paragraph / first 100 words**
4. **Optional Meta Description** — include keyword plus a CTR hook, under ~155 chars.

Keep changes surgical. Do not rewrite the whole article unless Phase 4 shows a real content-depth gap.

Present recommendations as a ready-to-implement diff:

```text
PAGE: /path/to/page
TARGET KEYWORD: "..."

CURRENT title: "..."
NEW title:     "..."  ✓ keyword front-loaded

CURRENT H1: "..."
NEW H1:     "..."  ✓ matches title intent

CURRENT first paragraph:
"..."

NEW first paragraph:
"..."  ✓ keyword in first 1–2 sentences
```

### Phase 4 — Competitive Gap Analysis

Run this for top-priority candidates, especially score >= 7 or >1,000 impressions.

For the target keyword, review the current top 3 ranking results and compare:

- **Word count:** if the average top-3 page is ~2x longer than ours, flag `Content Expansion`.
- **Media/examples:** if competitors use 10+ helpful images/examples and ours has 0–2, flag `Add Images/Examples`.
- **Subheadings:** extract common H2/H3 themes competitors cover that our page lacks.
- **SERP format:** note whether top results are tools, listicles, guides, comparison pages, calculators, galleries, or videos.

Only recommend expansion when the missing topics improve intent satisfaction. Avoid adding filler just to match word count.

### Phase 5 — Semantic Enrichment

Identify recurring secondary/NLP terms from the top 3 results that are missing from the target page.

Rules:

- Add only terms that appear naturally in the reader journey.
- Weave them into existing sections, captions, comparisons, or FAQs.
- Do not create keyword-stuffed lists.

Output:

```markdown
**Semantic terms to add naturally:** term 1, term 2, term 3
**Suggested insertion:** [section/paragraph]
```

### Phase 6 — Indexing Trigger

After implementing and deploying changes:

1. Add/update `docs/SEO/maintenance/gsc-request-indexing-backlog.md` with the updated URLs if manual submission is still needed.
2. In Google Search Console, use **URL Inspection → Request Indexing** for each updated URL.
3. Use URL Inspection data to verify crawl/index/canonical status where available.

Important: do **not** claim normal content pages can be submitted for immediate indexing through the URL Inspection API. The API is useful for inspection/status; manual GSC request indexing is the reliable workflow here.

### Phase 7 — Performance Loop

Wait for **14 complete GSC days** after indexing/deploy.

Check:

- Did average position move closer to #1?
- Did CTR improve for the target query/page pair?
- Did impressions consolidate onto the intended URL?

Decision:

- **Yes:** record the win and avoid more edits.
- **No:** do not blindly repeat Three Kings. Trigger deeper diagnosis:
  - Indexing/canonical issue?
  - Cannibalization across multiple URLs?
  - SERP intent mismatch?
  - Content-depth/media gap still unresolved?
  - Backlink/authority gap vs top results?

## Prioritization

Score each opportunity (1–10):

| Factor                        | Weight | Scoring                             |
| ----------------------------- | ------ | ----------------------------------- |
| Impressions                   | 30%    | >5000=10, >1000=7, >500=5, >100=3   |
| Position gap from top 3       | 20%    | pos 5-7=10, pos 8-11=7, pos 12-15=4 |
| Optimization gap              | 20%    | 3 kings missing=10, 2=7, 1=4, 0=1   |
| Intent/page fit               | 15%    | Exact fit=10, partial=5, mismatch=0 |
| Commercial or strategic value | 15%    | High=10, Medium=6, Low=3            |

Focus on **score >= 7** first. Skip mismatches until there is a pivot/consolidation plan.

## Output Format

```markdown
# Low-Hanging Fruit Content Refresh: [domain]

**Period**: last 28 days | **Date**: [today]

## Top Opportunities (position 5–15)

[ranked table]

## Recommended Refreshes

### 1. [Page Title] — Score: X/10

**Target keyword**: "..."
**Current position**: X | **Impressions**: X | **Potential**: top 5
**Intent fit**: exact / partial / mismatch

[Three Kings diff]

**Competitive gaps:** word count / media / missing H2-H3 themes / none
**Semantic terms to add naturally:** ...
**Action:** update copy, deploy, request indexing manually, recheck after 14 complete GSC days.

---

### 2. ...

## Search Intent Warnings

[pages where query intent and page type do not match]

## Implementation Checklist

- [ ] Confirm query-to-page mapping in GSC
- [ ] Confirm intent fit before editing
- [ ] Update title tag
- [ ] Update H1
- [ ] Update first paragraph / first 100 words
- [ ] Update meta description if useful
- [ ] Add competitor/NLP gap improvements only where justified
- [ ] Update SEO changes backlog
- [ ] Add URL to GSC request-indexing backlog if needed
- [ ] Request indexing manually in GSC
- [ ] Recheck after 14 complete GSC days
```

## Notes

- Position data in GSC is an **average** — actual rankings vary by user/location/device.
- GSC data has a **2–3 day lag** — account for recent changes not yet showing.
- Don't change more than 3–5 pages at once — isolate changes to measure impact.
- If a page already has the keyword in all three kings and no competitive/content gap, move to the next candidate.
- Avoid changing URLs unless the slug is severely off-topic and a redirect/canonical plan exists.
