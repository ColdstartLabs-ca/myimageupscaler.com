# Collapse Diagnosis: `/free`

Date: 2026-08-13
Source: Google Search Console Search Analytics and URL Inspection APIs, live HTML, and git history
Decision: **recorded decision not to edit this page in this lane**

## Finding

The `/free` drop is a loss of branded demand and average position, not a current indexability,
robots, or canonical failure. The remaining query mix is overwhelmingly branded, and no evidence
shows the hub being displaced by `/free/free-ai-upscaler` for a non-branded primary query.

## GSC evidence

| Window                  | Clicks | Impressions |   CTR | Weighted position | Query rows |
| ----------------------- | -----: | ----------: | ----: | ----------------: | ---------: |
| 2026-06-16 → 2026-07-13 |      1 |         693 | 0.14% |              1.06 |          6 |
| 2026-07-14 → 2026-08-10 |      0 |         168 | 0.00% |              6.83 |          8 |

Pre-drop top query: `myimageupscaler` — 647 impressions, 1 click, position 1.04.
Post-drop top query: `myimageupscaler` — 112 impressions, 0 clicks, position 1.07.

URL Inspection on 2026-08-13:

```text
verdict=PASS
coverageState=Submitted and indexed
pageFetchState=SUCCESSFUL
robotsTxtState=ALLOWED
googleCanonical=https://myimageupscaler.com/free
userCanonical=https://myimageupscaler.com/free
sitemap=https://myimageupscaler.com/sitemap.xml
```

Live curl on 2026-08-13:

```text
HTTP/2 200
<title>Free AI Image Upscaler — 5 Free Credits | MyImageUpscaler | MyImageUpscaler</title>
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"/>
<link rel="canonical" href="https://myimageupscaler.com/free"/>
<h1>Free AI Image Tools</h1>
```

## Git evidence

```text
4fa31e97 2026-08-13 fix(seo): repair locale cache verification
25b1294a 2026-08-13 fix(seo): preserve locale page indexation integrity
50004e5b 2026-08-13 fix(seo): eliminate GSC 404 routes
b9ee2eaf 2026-07-18 fixes
bf46637b 2026-07-17 docs: simplify free credit abuse policy
```

No single mid-July → August content change was found with `git log -S'free'` on the hub/data
surfaces that explains the branded impression loss.

## Decision and follow-up

No copy expansion or retargeting is shipped: the page is currently indexed with matching canonical
signals, and the observed loss is mostly reduced branded demand rather than a proven cannibalizing
query. Re-measure after the next complete 14-day window and compare `/free` against its child pages
before changing the hub. Manual incognito SERP verification remains pending and was not represented
as completed here.
