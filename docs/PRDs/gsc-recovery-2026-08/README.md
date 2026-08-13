# GSC Recovery — August 2026

Six PRDs sliced from the 13 Aug 2026 Search Console audit (`report.html`) and the
12 Aug 2026 GSC coverage exports (`data/*.csv`).

**Property:** `sc-domain:myimageupscaler.com` · **Data through:** 10 Aug 2026 (coverage: 12 Aug, CWV: 10 Aug)

---

## The diagnosis in one screen

| Signal | Value | Meaning |
| --- | --- | --- |
| Clicks 28d | 8,330 (+3.5%) | Traffic did not break |
| Non-brand clicks | 2,335 → 3,054 (+31%) | SEO engine works |
| Brand clicks | 2,447 → 1,490 (−39%) | The dip is brand-demand decay, not rankings (brand position held 1.0–1.4) |
| Indexed / not indexed | 1,130 / 2,840 | 59% sitemap indexation — publishing 3.5× what Google keeps |
| Crawled, not indexed | 790 | Quality verdict on the pSEO matrix template |
| Duplicate, Google chose other canonical | 239 | **100% non-English** — locale fallback duplicates |
| Excluded by `noindex` | 107 | **106 non-English** — untranslated tool pages, still in sitemaps |
| Not found (404) | 303 | Retired sections + locale route/sitemap drift |
| Server error (5xx) | 5 | **100% `/ja/`** — 4 from stub locale data, 1 from the open Cloudflare Worker 1102 (63/1,927 URLs on the 2026-07-30 crawl) |
| Mobile LCP > 4s | 95 poor / 0 good | Getting worse: ~50 poor in mid-May → 100 on 8 Aug |

Brand demand is a distribution problem (Reddit / directories / launches decayed on a
~4-week lag). It is **out of scope for these PRDs** — no on-page work recovers it.

## The six slices

| # | PRD | Fixes | Size |
| --- | --- | --- | --- |
| 01 | [404 elimination](01-404-elimination.md) | 303 404s: locale route/sitemap slug drift, retired `/article/*` + `/personas/*` + `/comparisons/*`, casing, junk URLs | MEDIUM (6) |
| 02 | [Locale indexation integrity](02-locale-indexation-integrity.md) | 239 duplicate-canonical + 107 noindex-in-sitemap + 5 `/ja/` 5xx (stub locale data **and** the open Worker CPU 1102 503s) | HIGH (8) |
| 03 | [Index bloat pruning](03-index-bloat-pruning.md) | 790 crawled-not-indexed; sitemap gating; publish freeze until 85% indexation | MEDIUM (6) |
| 04 | [Taxonomy cannibalization](04-taxonomy-cannibalization.md) | `/formats/` ÷ `/format-scale/` ÷ `/scale/` overlap; `/tools/photo-quality-enhancer` and `/free` collapse | MEDIUM (6) |
| 05 | [LCP & page experience](05-lcp-page-experience.md) | `images.unoptimized: true`, unresized Unsplash heroes, no preconnect → 95 poor URL groups | MEDIUM (5) |
| 06 | [Blog indexation & zero-click](06-blog-indexation-zero-click.md) | 33–37 unindexed English posts; 156K impressions → 389 clicks; commercial-only CTR reporting | MEDIUM (5) |

**Order matters.** 01 and 02 stop crawl-budget waste; 03 is only measurable once 01/02
land; 05 runs in parallel (independent code paths); 04 and 06 are growth work.

## Execution order

```text
Week 1   01 (404s)  ────┐
Week 1–2 05 (LCP)   ────┼── independent, run in parallel
Week 2   02 (locale) ───┘
Week 3–4 03 (bloat)      ← needs 01+02 deployed and re-crawled
Week 4–6 04 (taxonomy), 06 (blog)
```

## Shared verification protocol

Every PRD in this folder verifies against **live URLs from the GSC exports in `data/`**,
not just unit tests. The shared harness is **built and running** (`lib/seo/gsc-verification.ts` +
`scripts/seo/verify-gsc-fixes.ts`, 31 unit tests):

```bash
yarn seo:verify:gsc --set=404      # 200, or one redirect hop to a 200 — a 301 to a 404 fails
yarn seo:verify:gsc --set=5xx      # any status >= 500 fails
yarn seo:verify:gsc --set=noindex  # noindex + still in a sitemap fails (walks /sitemap.xml)
yarn seo:verify:gsc --set=cni      # same rule — PRD 03's index-bloat gate
yarn seo:verify:gsc --set=dup      # locale URL still self-canonical fails

# options: --base-url=http://localhost:3000  --limit=20  --concurrency=4  --delay=250
#          --expect=404   (negative control: assert an exact status instead of the set rule)
```

**Baselines captured 2026-08-13** (`seo-reports/gsc-verify-*-2026-08-13.json`):

| Set | Result | Read |
| --- | --- | --- |
| `404` | **212 / 303 violating** | 206 still 404, 6 redirect to a 404 destination, 91 already fixed |
| `5xx` | 0 / 5 violating | the 4 `/ja/` social-resize URLs now 301; the 1102 URL answered 200 on that request (intermittent — recheck with 20 sequential) |

Three rules apply to every phase in this folder:

1. **Run the gate before the fix and watch it fail.** A gate that was never red is
   recorded as UNVERIFIED, not PASS. Each phase names its negative control.
2. **GSC "Not found" / "Excluded" is historical, not current.** Every URL list is
   re-checked live before any fix is written — some entries were last crawled in
   February and are already fixed.
3. **A PRD is not done at deploy.** Each carries a dated GSC re-check (14-day signal,
   28-day evaluation) with the exact numbers that must move.

## Post-deploy follow-ups (all PRDs)

- Append entries to [SEO changes backlog](../../SEO/maintenance/seo-changes-backlog.md).
- Add re-index requests to [GSC request indexing backlog](../../SEO/maintenance/gsc-request-indexing-backlog.md).
- Submit changed URLs via IndexNow (`yarn tsx scripts/submit-indexnow.ts`).
- In GSC, hit **Validate Fix** on each affected issue only after the live gate passes.

## Metrics that decide success (from the audit, §09)

| Metric | Today | Target | Owner PRD |
| --- | --- | --- | --- |
| Non-brand clicks / 28d | ~3,050 | +25% by 28 Sep | 03, 04, 06 |
| Sitemap indexation rate | 59% | ≥85% | 02, 03 |
| 404s in GSC | 303 reported / **212 live** | <25 | 01 |
| Duplicate-canonical | 239 | <40 | 02 |
| Mobile LCP p75 poor groups | 95 | 0 | 05 |
| Commercial-page CTR (tools + roundups) | 5–12% | tracked separately from informational | 06 |

## Data provenance

`data/` holds the raw GSC exports the PRDs assert against:

| File | Source | Rows |
| --- | --- | --- |
| `gsc-coverage-summary.csv` | Coverage → Critical issues | 10 |
| `gsc-404.csv` | Drilldown → Not found (404) | 302 |
| `gsc-noindex.csv` | Drilldown → Excluded by 'noindex' tag | 106 |
| `gsc-5xx.csv` | Drilldown → Server error (5xx) | 5 |
| `gsc-crawled-not-indexed.csv` | Drilldown → Crawled – currently not indexed | 789 |
| `gsc-duplicate-canonical.csv` | Drilldown → Duplicate, Google chose different canonical | 238 |
| `gsc-lcp-mobile-trend.csv` | Core Web Vitals → LCP > 4s (mobile) | 90 days |

(Row counts exclude the header line; GSC's own totals count the header page group.)
