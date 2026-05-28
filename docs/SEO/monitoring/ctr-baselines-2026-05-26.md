# CTR Baselines: 2026-05-26 GSC Growth Report

Source: [GSC growth opportunity report](../reports/gsc-growth-opportunity-report-2026-05-26.md)

Purpose: preserve the pre-change GSC baseline for pages that should be measured after snippet/content changes mature. Do not judge the 2026-05-24 metadata batch until at least 14 complete GSC days are available after the change.

## 2026-05-24 Metadata Batch

Recheck after 2026-06-07.

| URL                                                      | Baseline impressions | Baseline clicks | Baseline CTR | Baseline position | Action                                 |
| -------------------------------------------------------- | -------------------: | --------------: | -----------: | ----------------: | -------------------------------------- |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` |               16,515 |              56 |        0.34% |               8.0 | Monitor only; do not rewrite again yet |
| `/blog/ai-image-upscaling-vs-sharpening-explained`       |                1,581 |               2 |        0.13% |               5.5 | Monitor only; do not rewrite again yet |
| `/blog/best-ai-upscaler`                                 |                3,864 |               4 |        0.10% |               9.4 | Monitor metadata pass and added links  |
| `/blog/how-to-upscale-anime-images-with-ai`              |                1,635 |               0 |        0.00% |               7.4 | Monitor only; do not rewrite again yet |
| `/blog/free-ai-upscaler-no-watermark`                    |                2,428 |               5 |        0.21% |               8.5 | Monitor as support page                |

## 2026-05-26 Follow-Up Edits

Recheck after 2026-06-10.

| URL                                           | Baseline impressions | Baseline clicks | Baseline CTR | Baseline position | Change                                                                     |
| --------------------------------------------- | -------------------: | --------------: | -----------: | ----------------: | -------------------------------------------------------------------------- |
| `/blog/topaz-video-upscaler`                  |                3,480 |               3 |        0.09% |               8.9 | Added current Topaz verdict, pricing/version context, and metadata         |
| `/blog/upscale-image-for-print-300-dpi-guide` |                2,684 |              13 |        0.48% |               7.7 | Added print calculator block, FAQ, and metadata                            |
| `/comparisons-expanded/ai-models-comparison`  |                1,573 |               1 |        0.06% |             10.93 | Fixed 2026 metadata, technical answer, comparison table, and rendering     |
| `/blog/topaz-denoise-ai`                      |                  956 |               2 |        0.21% |             10.85 | Added Topaz-specific verdict, comparison table, pricing note, and metadata |
| `/blog/photoshop-upscale-image`               |                  624 |               1 |        0.16% |             10.30 | Moved Photoshop steps and method table above the alternative pitch         |
| `/blog/best-ai-image-enhancer`                |                  331 |               1 |        0.30% |              9.36 | Clarified broad comparison role and added tool-type table                  |
| `/blog/sharpen-a-video`                       |                  180 |               1 |        0.56% |              8.82 | Added exact FFmpeg answer, parameter table, presets, and warning           |

## Reporting Notes

- Segment GA4 organic landing-page reporting by `acquisition_page_type` and `is_acquisition_landing_page` after the analytics update ships.
- Treat `/auth/callback` and `/dashboard` sessions as app-flow traffic, not acquisition landing-page performance.
- Compare GSC CTR by URL against these baselines before making another snippet pass.
