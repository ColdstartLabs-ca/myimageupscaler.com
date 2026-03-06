---
name: seo-content-3-kings-technique
description: Low-Hanging Fruit Content Refresh — identify pages ranking positions 5–15 in GSC, select the best target keyword, and optimize the Three Kings (title, H1, first paragraph) to push them into the top 3.
user_invocable: true
argument_description: '[domain or page URL] — e.g. myimageupscaler.com or a specific page path'
---

You are an SEO content strategist executing the **Low-Hanging Fruit Content Refresh** technique. Your goal: find pages Google already likes (positions 5–15) and push them higher with targeted keyword injection into the Three Kings.

## Workflow

### Phase 1 — Discovery: Find Low-Hanging Fruit

Fetch GSC data for the domain:

```bash
node ~/.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=DOMAIN --days=28 --output=/tmp/gsc-DOMAIN.json 2>&1
```

Read `/tmp/gsc-DOMAIN.json` and filter to find opportunities:

**Target criteria:**
- Average position: **5.0 – 15.0** (sweet spot for quick wins)
- Impressions: **as high as possible** (more upside)
- Clicks: **below what position suggests** (CTR gap = opportunity)

Sort by: `impressions DESC, position ASC` within the 5–15 range.

Output a ranked table:

| Query | Page | Position | Impressions | Clicks | CTR | Priority |
|-------|------|----------|-------------|--------|-----|----------|
| ...   | ...  | ...      | ...         | ...    | ... | ...      |

### Phase 2 — Analysis: Select Target Keyword

For each candidate page:

1. **Identify the primary keyword** — the query with the highest impressions + clicks that accurately describes the page.
2. **Verify search intent** — look up what the top 3 Google results look like for that keyword. If they are all informational guides and the page is a tool/product page (or vice versa), note the mismatch and flag it.
3. **Check current optimization** — read the page source (if accessible) and check whether the target keyword already appears in:
   - `<title>` tag
   - `<h1>` tag
   - First `<p>` or first visible paragraph

### Phase 3 — Execution: Optimize the Three Kings

For each selected keyword, recommend exact copy for:

1. **King 1 — Title Tag**: Include exact keyword. Keep under 60 characters. Front-load the keyword.
2. **King 2 — H1 Tag**: Match or closely mirror the title. Natural, not robotic.
3. **King 3 — First Paragraph**: Include the keyword in the first sentence naturally. Don't keyword-stuff.

**Optional (if slug/meta need updating):**
- URL slug: Only change if current slug doesn't reflect the keyword AND you can set up a redirect.
- Meta description: Include keyword + a clear CTA. Under 155 characters.

Present recommendations as a ready-to-implement diff:

```
PAGE: /path/to/page

CURRENT title: "..."
NEW title:     "..."  ✓ keyword added

CURRENT H1: "..."
NEW H1:     "..."  ✓ keyword added

CURRENT first paragraph:
"..."

NEW first paragraph:
"..."  ✓ keyword in first sentence
```

### Phase 4 — Indexing: Accelerate Results

After implementing changes, instruct the user to:

1. Go to **Google Search Console → URL Inspection**
2. Paste the updated page URL
3. Click **"Request Indexing"**

This signals Google to recrawl immediately instead of waiting days/weeks.

Expected timeline: ranking movement visible within **3–14 days**.

## Prioritization

Score each opportunity (1–10):

| Factor | Weight | Scoring |
|--------|--------|---------|
| Impressions | 30% | >5000=10, >1000=7, >500=5, >100=3 |
| Position gap from top 3 | 25% | pos 5-7=10, pos 8-11=7, pos 12-15=4 |
| Optimization gap (missing from kings) | 25% | 3 missing=10, 2 missing=7, 1 missing=4, 0=1 |
| Commercial intent | 20% | High=10, Medium=6, Low=3 |

Focus on **score ≥ 7** first.

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

[Three Kings diff]

**Action**: Request indexing after update.

---

### 2. ...

## Search Intent Warnings

[any pages where intent mismatch was detected]

## Implementation Checklist

- [ ] Update title tag
- [ ] Update H1
- [ ] Update first paragraph
- [ ] (Optional) Update meta description
- [ ] Request indexing in GSC
- [ ] Set a 14-day reminder to check position change
```

## Notes

- Position data in GSC is an **average** — actual rankings vary by user/location/device.
- GSC data has a **2–3 day lag** — account for recent changes not yet showing.
- Don't change more than 3–5 pages at once — isolate changes to measure impact.
- If a page already has the keyword in all three kings, move to the next candidate.
- Avoid changing URLs unless the slug is severely off-topic — redirects cost crawl budget.
