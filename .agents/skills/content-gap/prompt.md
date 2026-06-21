---
name: content-gap-analysis
description: LLM prompt for turning content-gap.cjs output into specific integration recommendations. Feed this + the gap JSON to Claude for actionable suggestions.
---

# Content Gap Analysis Prompt

Use this prompt when you have the output of `content-gap.cjs` and want Claude to generate integration recommendations.

---

## Prompt Template

```
You are an SEO content editor. I have Google Search Console data showing queries where users searched for something, Google showed my page in results (impressions), but my page content doesn't adequately mention or cover that query.

**Page URL:** {{page}}
**Date Range:** {{dateRange.startDate}} → {{dateRange.endDate}} ({{dateRange.days}} days)
**Gap Score:** {{analysis.gapScore}} ({{pct}}% of impressions are in gap queries)
**Estimated click uplift from fixing gaps:** ~{{analysis.totalPotentialClicks}} clicks

**Page Content Sample:**
{{pageContentSnippet}}

**Gap Queries to Address** (sorted by impressions × gap severity):
{{gaps_table}}

---

For each query above, provide:

1. **Why it's a gap** — which specific words are missing from the page content (check tokenResults)
2. **Where to add it** — heading, intro paragraph, body section, FAQ item, image alt text, or meta description
3. **How to add it naturally** — 1-2 example sentences or phrases that integrate the keyword without stuffing
4. **Expected impact** — high/medium/low based on impressions and position

Format as a markdown table followed by a brief rationale per critical/high-priority item.

Rules:
- Never suggest keyword stuffing — every suggestion must add genuine value to the reader
- Prefer FAQ additions for long-tail question queries ("how to", "what is", "can I")
- Prefer heading/intro changes for high-volume short queries that define the page topic
- Prefer body paragraph additions for modifier queries ("free", "without watermark", "for print")
- Flag any query where the intent doesn't match the page — those are NOT content gaps, they're wrong-page problems
- If multiple gap queries share the same missing word, suggest a single fix that covers all of them
```

---

## How to Fill the Template

When running this analysis in conversation:

1. Run the script:

```bash
node ./.claude/skills/content-gap/scripts/content-gap.cjs \
  --site=myimageupscaler.com \
  --page=URL \
  --output=/tmp/gap.json 2>&1
```

2. Read the JSON: `cat /tmp/gap.json | jq '.analysis | {gapScore, totalPotentialClicks, counts, priorityCounts}'`

3. Build the gaps table from `analysis.gaps` (filter to critical + high priority, limit to 25 rows):

```
| Query | Impressions | Position | CTR | Gap Type | Missing Tokens |
|-------|-------------|----------|-----|----------|----------------|
| free ai upscaler | 5200 | 6.2 | 2.3% | missing | free |
```

4. Fill in `pageContentSnippet` from the JSON field (first 600 chars)

5. Feed the filled prompt to Claude for recommendations

---

## Example Gaps Table Format

```markdown
| Query                           | Impressions | Pos  | CTR  | Type    | Missing Tokens      | Potential Clicks |
| ------------------------------- | ----------- | ---- | ---- | ------- | ------------------- | ---------------- |
| free ai image upscaler          | 5,200       | 6.2  | 2.3% | missing | "free"              | +95              |
| upscale image without watermark | 3,100       | 8.4  | 1.8% | partial | "watermark"         | +48              |
| ai photo enhancer for printing  | 1,800       | 11.2 | 1.1% | missing | "print", "printing" | +32              |
| how to upscale old photos       | 1,400       | 9.8  | 1.4% | partial | "old photos"        | +21              |
```

---

## Output Format to Expect from Claude

```markdown
## Integration Recommendations

### Critical Priority

**"free ai image upscaler"** (5,200 impressions, position 6.2)

- **Gap:** Word "free" never appears on page. Users searching this expect clarity on pricing/free tier.
- **Fix:** Add to intro paragraph: "Our AI image upscaler is free to use — no account required for standard resolution."
- **Impact:** High. Position 6.2 with 5k+ impressions; "free" mention alone could lift CTR from 2.3% to 4%+.

### High Priority

**"upscale image without watermark"** (3,100 impressions, position 8.4)

- **Gap:** "Watermark" appears 0 times. Users want to know output files are clean.
- **Fix:** Add FAQ item: "Does AI upscaling add a watermark? No — all processed images are watermark-free."
- **Impact:** Medium-high. Clear FAQ addition, no page restructuring needed.

...

## Combined Fixes (queries sharing missing words)

These 4 queries all miss the word "free": [list]. One sentence in the intro covers all of them.
```
