# Cluster Measurement: gif

Generated: 2026-08-13T14:04:17.757Z

## Decision gate

Owner clicks in the measured post-consolidation window: **5** (6 days)

**PENDING — 6-day window is provisional; do not use this result as the Phase 0 gate** (28-day PASS requires owner clicks ≥700 and strictly more than the 847-click pre-split baseline; the cluster total must also meet that baseline stop-loss. Both windows must be exactly 28 inclusive days.)

The PRD requires a fully post-consolidation 28-day window before this gate is used to add another cluster.

Fixed baseline contract: **2026-06-16 through 2026-07-13**, minimum **847 clicks**. Supplied baseline metrics cannot lower this gate.

## Windows

| Measure                               | Start      | End        | Matched GSC rows | Cluster totals                                            | Owner totals                                               |
| ------------------------------------- | ---------- | ---------- | ---------------: | --------------------------------------------------------- | ---------------------------------------------------------- |
| Post-consolidation                    | 2026-08-05 | 2026-08-10 |                5 | 71 clicks / 1,519 impressions / 4.67% CTR / 9.76 position | 5 clicks / 283 impressions / 1.77% CTR / 18.25 position    |
| Pre-split baseline (PRD 04 audit set) | 2026-06-16 | 2026-07-13 |                3 | 847 planning clicks                                       | 513 clicks / 7,123 impressions / 7.20% CTR / 7.31 position |

## Deferred candidates

| URL                  | Primary keyword | Status                                                |
| -------------------- | --------------- | ----------------------------------------------------- |
| `/scale/upscale-16x` | upscale 16x     | Deferred — measurement-only; not a current GIF member |

Ownership for this candidate is decided only after the exact 28-day Phase 0 gate; no redirect is implied by this measurement entry.

## URL breakdown

| URL                             | Current clicks | Current impressions | Current CTR | Current position | Baseline clicks |
| ------------------------------- | -------------: | ------------------: | ----------: | ---------------: | --------------: |
| `/formats/upscale-gif-images`   |              5 |                 283 |       1.77% |            18.25 |             513 |
| `/format-scale/gif-upscale-2x`  |              0 |                   8 |       0.00% |             7.38 |               — |
| `/format-scale/gif-upscale-4x`  |              0 |                  16 |       0.00% |            18.69 |               — |
| `/format-scale/gif-upscale-8x`  |              0 |                   0 |       0.00% |             0.00 |               — |
| `/format-scale/gif-upscale-16x` |             33 |                 546 |       6.04% |             7.17 |               5 |
| `/scale/upscale-16x`            |             33 |                 666 |       4.95% |             8.09 |             329 |

## Baseline path correction

The original report was generated before the post-consolidation and pre-split path sets were separated, so its recorded six-path baseline was 855 clicks. PRD 04 defines the acceptance baseline with exactly `/format-scale/gif-upscale-16x`, `/formats/upscale-gif-images`, and `/scale/upscale-16x`; the supplied planning total is 847 clicks (513 + 5 + 329). This repair made no new GSC query, so no new baseline impressions, CTR, or position result is claimed here. The corrected measurement script now selects those three paths and leaves the existing redirects unchanged.

Source: Google Search Console Search Analytics API, web search, page dimension. Redirect verification remains a separate live check.

The `/scale/upscale-16x` path targets `upscale 16x`. It is included in both measurements for comparison but is not a current GIF member and remains outside the redirect table until the exact 28-day Phase 0 gate decides ownership.

## Live redirect proof

```text
$ curl -sS -D - -o /dev/null https://myimageupscaler.com/format-scale/gif-upscale-16x
HTTP/2 301
location: /formats/upscale-gif-images

$ curl -sS -D - -o /dev/null https://myimageupscaler.com/formats/upscale-gif-images
HTTP/2 200
```

## Measurement negative control

The same read-only Search Console page query reproduced the PRD's known control for
`/blog/best-free-ai-image-upscaler-2026-tested-compared` over 2026-07-14 → 2026-08-10:

```text
matchedRows=3, clicks=1499, impressions=18074
```
