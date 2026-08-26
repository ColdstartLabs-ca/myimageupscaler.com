# GIF intent gate — 2026-08-25

Window: 2026-08-09 through 2026-08-22 (14 complete GSC days).

| Threshold                                           | Target |      Measured | Verdict    |
| --------------------------------------------------- | -----: | ------------: | ---------- |
| Legacy rows absent from both head-query page splits | absent |       present | fail       |
| Owner share of combined GIF-intent clicks           |   ≥80% | 66.7% (30/45) | fail       |
| Combined GIF-intent clicks                          |   ≥300 |            45 | fail       |
| Owner average position                              |   ≤8.0 |          7.90 | false pass |
| `gif upscaler` page count                           |     ≤3 |             6 | fail       |

The position pass is not recovery. The owner fell from 115 queries / 215 clicks / 3,564
impressions to 65 / 10 / 426. `gif upscaler` moved from position 5.6 to 13.9, `upscale gif`
from 6.9 to 16.1, and `enhance gif` from 7.8 to 32.3.

Fresh decision measurement reproduced the owner conflict:

| Query          | Blog                                     | pSEO owner            |
| -------------- | ---------------------------------------- | --------------------- |
| `gif upscaler` | 232 impressions, 6 clicks, position 5.44 | 48, 2, position 13.88 |
| `upscale gif`  | 138 impressions, 2 clicks, position 7.36 | 40, 0, position 16.08 |

Named cause: index-level fragmentation across still-ranking redirects, localized variants, and
`/blog/gif-upscaler`. The executable 28-day stop-loss gate measured 197 whole-cluster clicks
against the locked 847-click floor and exited non-zero. Its detailed output is
`seo-reports/cluster-gif-2026-08-22.md`.
