# SEO Action Checklist

**Created:** 2026-02-12
**Based on:** SEO Audit Report (seo-report-2026-02-11.md)
**Status:** Excluding DR/Backlink items (already being handled separately)

---

## Legend

- ✅ Completed
- 🟡 In Progress
- ⬜ Not Started
- 📋 Planned

---

## Critical Priority (This Week)

| # | Task | Est. Time | Status | Notes |
|---|-------|-----------|--------|-------|
| 1 | Execute SaaS directory submissions | 4 hours | ⬜ | Materials ready in `docs/SEO/saas-directory-submission/` |
| 2 | Fix ai-features zombie category | 2 hours | ⬜ | 12 pages in sitemap that 404 - either create route or remove |

---

## High Priority (This Month)

### Content & Indexing

| # | Task | Est. Time | Status | Notes |
|---|-------|-----------|--------|-------|
| 5 | Rewrite pSEO intro/description content for uniqueness [IX-2, IX-5] | 3-5 days | ⬜ | Start with 43 tools + 20 scale pages (highest value). Target: 1,000+ unique words/page from current ~200-300 |
| 6 | Replace shared before/after images with page-specific visuals [IX-3] | 1-2 days | ⬜ | Every pSEO page uses same bird-before.webp/bird-after.webp. Create unique examples per tool/format/use-case |
| 7 | Rewrite "How It Works" sections per category [IX-4] | 1 day | ⬜ | ScalePageTemplate.tsx lines 220-400 have identical boilerplate. Make category-specific, not page-generic |

### Performance

| # | Task | Est. Time | Status | Notes |
|---|-------|-----------|--------|-------|
| 9 | Code-split unused JS chunk `ed9f2dc4` (223KB) | 4-8 hours | ⬜ | Largest unused JS on load. Could cut mobile LCP from 7.8s to ~5s. Mobile perf +15-20 points |

---

## Medium Priority (This Quarter)

### Technical SEO

| # | Task | Est. Time | Status | Notes |
|---|-------|-----------|--------|-------|
| 14 | Customize comparison tables per page with real data [IX-6] | 2 days | ⬜ | Replace generic resolution comparison tables with page-specific benchmarks |
| 16 | Fix 4 orphaned pSEO data categories | 4 hours | ⬜ | Register comparisons-expanded, personas-expanded, technical-guides, use-cases-expanded or merge into existing categories |
| 17 | Resolve 9 duplicate slugs across data files | 2 hours | ⬜ | Deduplicate interactive-tools.json overlaps with bulk-tools, free, social-media-resize |

### Schema & Structured Data

| # | Task | Est. Time | Status | Notes |
|---|-------|-----------|--------|-------|
| 23 | Add SearchAction schema to WebSite | 1 hour | ⬜ | Enable sitelinks search box in SERPs |

### Blog & Content

| # | Task | Est. Time | Status | Notes |
|---|-------|-----------|--------|-------|
| 18 | Complete blog content strategy | Ongoing | 📋 | 12 remaining topics from 24-post plan. Prioritize comparison posts ("Best AI Upscalers 2025") |
| 19 | Add "Related Posts" and cross-linking to blog | 4 hours | ⬜ | Improve engagement and internal link distribution |

### On-Page SEO

| # | Task | Est. Time | Status | Notes |
|---|-------|-----------|--------|-------|
| 20 | Add extractable definition section to homepage | 1 hour | ⬜ | "What is AI Image Upscaling?" above the fold. Improves AI citability |
| 21 | Fix footer/nav color contrast (WCAG AA) | 1-2 hours | ⬜ | Update footer text and header nav link colors for accessibility |

### Accessibility

| # | Task | Est. Time | Status | Notes |
|---|-------|-----------|--------|-------|
| 22 | Fix footer/nav color contrast | 1-2 hours | ⬜ | WCAG AA compliance. Update footer text and header nav link colors |

---

## Ongoing Maintenance

| # | Task | Frequency | Status | Notes |
|---|-------|-----------|--------|-------|
| 19 | Monthly GSC report | Monthly | 📋 | Track position changes, new queries, indexing progress |
| 20 | Backlink acquisition | Monthly | 📋 | Being handled separately via DR initiative |
| 21 | AI citation monitoring | Monthly | 📋 | Check ChatGPT, Perplexity, Google SGE for citations |
| 22 | Content freshness | Ongoing | 📋 | Update blog post dates after substantive edits, stagger new publications |

---

## Already Completed ✅

| # | Task | Date Completed |
|---|-------|---------------|
| 1 | Deploy latest robots.ts | 2026-02-12 |
| 2 | Fix trailing slash canonicalization | 2026-02-12 |
| 3 | Add `force-static` to all pSEO pages | 2026-02-12 |
| 4 | Optimize French homepage metadata | 2026-02-12 (verified correct) |
| 5 | Defer Google Tag Manager loading | 2026-02-12 |
| 6 | Create llms.txt and llms-full.txt | 2026-02-12 |
| 7 | Add internal links to pSEO hub pages | 2026-02-12 |
| 8 | Fix favicon.ico | 2026-02-12 |

---

## Quick Reference

### Files to Modify

**pSEO Templates:**
- `app/(pseo)/_components/pseo/templates/ScalePageTemplate.tsx` - lines 220-400 ("How It Works")
- `app/(pseo)/_components/pseo/templates/ToolPageTemplate.tsx` - similar templates

**pSEO Data Files:**
- `app/seo/data/tools.json` - 43 tools pages (start here for uniqueness)
- `app/seo/data/scale.json` - 20 scale pages (start here for uniqueness)
- `app/seo/data/ai-features.json` - 12 zombie pages (fix or remove)
- `app/seo/data/interactive-tools.json` - check duplicates vs bulk-tools, free, social-media-resize

**Schema:**
- `lib/seo/schema-generators.ts` or appropriate schema file - add SearchAction to WebSite schema

**Navigation:**
- `client/components/navigation/NavBar.tsx` - add /compare links
- `client/components/layout/Footer.tsx` - add /compare links

**Homepage:**
- `client/components/pages/HomePageClient.tsx` or similar - add "What is AI Image Upscaling?" section

**Styling:**
- Footer and nav link colors - ensure WCAG AA contrast (4.5:1 contrast ratio)

---

## Total Estimated Time

| Priority | Items | Hours |
|----------|-------|-------|
| Critical | 2 | 6 |
| High | 4 | 12-20 hours |
| Medium | 10 | 14 hours |
| Ongoing | N/A | Continuous |
| **Total** | **16** | **32-40 hours** |
