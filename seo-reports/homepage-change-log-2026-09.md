# Homepage recovery change log — September 2026

**Baseline date:** 2026-09-10  
**Settled GSC data through:** 2026-09-08  
**Canonical URL:** `https://myimageupscaler.com/` — unchanged

## Current live title before this recovery pass

`AI Image Upscaler — Free Photo Enhancer Online | MyImageUpscaler`

No homepage title change is made in this PR before the baseline is recorded. Any later title experiment must append the previous title, new title, deploy date, and recrawl date here.

## Exact page baseline

| Window | Clicks | Impressions | CTR | Avg position |
| --- | ---: | ---: | ---: | ---: |
| 2026-07-15 → 2026-08-11 | 3,705 | 77,028 | 4.81% | 9.95 |
| 2026-08-12 → 2026-09-08 | 2,327 | 56,226 | 4.14% | 12.89 |

This is not only a branded-demand problem. Impressions declined and average position weakened materially on the homepage.

## Device baseline

| Device | Previous clicks | Latest clicks | Previous position | Latest position |
| --- | ---: | ---: | ---: | ---: |
| Desktop | 1,439 | 860 | 11.18 | 15.74 |
| Mobile | 1,291 | 808 | 9.12 | 10.93 |
| Tablet | 53 | 35 | 9.96 | 10.93 |

GSC query rows are privacy-filtered, so device rows do not sum to the page aggregate. Do not use the difference as an inferred query cohort.

## Fixed non-brand query set

Track these exact queries after recrawl rather than reporting only site-wide average position:

- `image upscaler`
- `upscaler`
- `image upscaler 4k`
- `ai image upscaler`
- `upscale image`

Latest visible baseline (2026-08-12 → 2026-09-08):

| Query | Clicks | Impressions | CTR | Position |
| --- | ---: | ---: | ---: | ---: |
| image upscaler | 182 | 9,954 | 1.83% | 13.56 |
| upscaler | 46 | 4,263 | 1.08% | 9.28 |
| image upscaler 4k | 15 | 482 | 3.11% | 12.11 |
| ai image upscaler | 14 | 1,322 | 1.06% | 28.94 |
| upscale image | 18 | 304 | 5.92% | 33.74 |

## Branded control

The exact branded set remains separate: `myimageupscaler`, `my image upscaler`, `myimageupscaler.com`, `https myimageupscaler com`. The latest two largest terms still rank essentially #1 (`myimageupscaler` position 1.01; `my image upscaler` position 1.01), so branded demand must not be mixed into the non-brand recovery metric.

## Recovery hypothesis

The homepage needs a clearer, truthful first-screen product offer and stronger relevance for broad image-upscaler intent without changing the URL or regressing mobile LCP. Measure the fixed non-brand cohort by device and country after recrawl, then measure successful upscales and paid conversion with PRD 2's funnel dimensions.
