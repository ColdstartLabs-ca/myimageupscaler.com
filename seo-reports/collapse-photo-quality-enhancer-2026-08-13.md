# Collapse Diagnosis: `/tools/photo-quality-enhancer`

Date: 2026-08-13
Source: Google Search Console Search Analytics and URL Inspection APIs, live HTML, historical route checks, and git history
Decision: **recorded decision not to edit this page in this lane**

## Supported causal finding

The supported cause is loss of search visibility for the former `quality enhancer` demand, consistent
with query-intent or competitive ranking displacement, while technical indexability is ruled out by
the recorded checks below. In the pre-drop window, `quality enhancer` produced 16 clicks from 475
impressions at position 15.54. In the post-drop window, the page fell from 32 clicks / 1,755
impressions / weighted position 43.03 across 221 query rows to 0 clicks / 163 impressions / weighted
position 65.01 across 60 rows; the largest recorded remaining query was `image quality enhancer` at
26 impressions, 0 clicks, and position 76.88. These observations support a visibility and query-mix
loss, but they do not identify whether demand shifted, another result displaced the page, or the
page no longer matched the intent as well.

## What remains unproven

The recorded artifacts do not prove an algorithm update, a specific competitor, or a title, H1, or
body-content defect. Git history found no matching mid-July → August content edit with
`git log -S'photo-quality-enhancer'`, so there is no repository artifact tying the collapse to a
content change. The data also does not isolate demand change from ranking displacement; those remain
follow-up questions rather than asserted causes.

## GSC evidence

| Window                  | Clicks | Impressions |   CTR | Weighted position | Query rows |
| ----------------------- | -----: | ----------: | ----: | ----------------: | ---------: |
| 2026-06-16 → 2026-07-13 |     32 |       1,755 | 1.82% |             43.03 |        221 |
| 2026-07-14 → 2026-08-10 |      0 |         163 | 0.00% |             65.01 |         60 |

Largest pre-drop query: `quality enhancer` — 16 clicks, 475 impressions, position 15.54.
Largest post-drop query: `image quality enhancer` — 26 impressions, 0 clicks, position 76.88.

## Technical and route evidence

URL Inspection on 2026-08-13:

```text
verdict=PASS
coverageState=Submitted and indexed
pageFetchState=SUCCESSFUL
robotsTxtState=ALLOWED
googleCanonical=https://myimageupscaler.com/tools/photo-quality-enhancer
userCanonical=https://myimageupscaler.com/tools/photo-quality-enhancer
sitemap=[]
```

Live curl on 2026-08-13:

```text
HTTP/2 200
<link rel="canonical" href="https://myimageupscaler.com/tools/photo-quality-enhancer"/>
<meta name="robots" content="index, follow"/>
<h1>Free Photo Quality Enhancer</h1>
```

These checks rule out a current 404, blocked crawl, robots failure, or canonical mismatch as the
cause of the English-page collapse. The historical duplicate/404 export contained three locale
URLs, but current live checks returned `200` for `/ja/`, `/es/`, and `/it/` variants; that historical
route issue is therefore not the current English-page cause.

## Git evidence

```text
b2c61e25 2026-05-13 Improve tool page SEO routing
12950beb 2026-03-04 feat(tools): keyword-driven tools & resources expansion (#12)
```

No matching mid-July → August content edit was found with `git log -S'photo-quality-enhancer'`.

## Decision

No title/H1/intro rewrite is shipped. The evidence supports a ranking/query-visibility diagnosis and
rules out a current technical indexability failure, but it does not support attributing the loss to
an algorithm update or an unverified content defect. Keeping the page unchanged preserves a clean
measurement point while the visibility loss is investigated.

## Fix plan

Keep the no-edit decision until the first complete 14-day window after the locale/404 deployment is
available; then compare page-level and query-level GSC rows for the former `quality enhancer` demand,
check whether another page is receiving the displaced impressions, and complete the pending manual
incognito SERP check. If the demand remains visible but this page remains materially displaced, use
that evidence to select one narrowly targeted title/H1/body experiment; if technical checks regress,
repair the route or indexability issue first, and record the result before making any broader change.
