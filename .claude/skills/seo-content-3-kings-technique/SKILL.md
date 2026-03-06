---
name: seo-content-3-kings-technique
description: Low-Hanging Fruit Content Refresh — find pages at positions 5–15 in GSC and optimize the Three Kings (title, H1, first paragraph) to push them into the top 3. Also embedded in blog-publish as a write-time constraint.
---

# SEO Content 3 Kings Technique

Two modes:
1. **Refresh mode** — find existing pages at positions 5–15 in GSC and inject keyword into Three Kings
2. **Write mode** — baked into `blog-publish` Step 3 to ensure new posts are optimized from day one

## When to Activate (Refresh Mode)

- User says "content refresh", "three kings", "low-hanging fruit", "refresh pages", "boost rankings"
- User wants to improve existing pages that are "almost ranking"
- After a GSC analysis identifies pages at positions 5–15

## What It Does

1. **Fetches GSC data** using the gsc-analysis script
2. **Filters** for keywords at positions 5–15 (the sweet spot)
3. **Selects** the best target keyword per page (highest impressions + intent match)
4. **Optimizes** the Three Kings: Title Tag, H1, First Paragraph
5. **Guides** through requesting re-indexing in GSC

## The Three Kings

| King | Element | Rule |
|------|---------|------|
| King 1 | Title tag (`seo_title`) | Keyword front-loaded, max 60 chars |
| King 2 | H1 heading | Keyword present, natural phrasing |
| King 3 | First paragraph | Keyword in first sentence |

## Reference

Based on: https://www.youtube.com/watch?v=Zn3i5ac9ydw

## Dependencies

- Requires `gsc-analysis` skill (for fetching GSC data)
- GSC service account must have access to the domain's Search Console property

## Integration

- **blog-publish Step 3** — Three Kings checklist is embedded as a MANDATORY write-time rule
- Run `/seo-content-3-kings-technique [domain]` to audit and fix existing published pages

## Files

| Item | Path |
|------|------|
| Prompt | `.claude/skills/seo-content-3-kings-technique/prompt.md` |
| Skill info | `.claude/skills/seo-content-3-kings-technique/SKILL.md` |
