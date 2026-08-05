# GSC Homepage and GIF Recovery Check — 2026-08-04

## Verdict

- **Homepage:** not recovering overall. The non-branded `image upscaler` query is improving, but branded demand fell while the homepage stayed around position 1 for branded queries.
- **`/formats/upscale-gif-images`:** not recovering in the measured GSC window. Its visibility collapsed while the legacy `/format-scale/gif-upscale-16x` URL captured the same GIF intent.
- **Technical state:** the GIF consolidation is now live. The legacy 16x URL returns `301 → /formats/upscale-gif-images`; the owner returns `200`.
- **Measurement limit:** the fresh performance window ends 2026-08-01. The GIF code commit is timestamped 2026-08-03, so GSC performance cannot yet measure post-deploy recovery.

## Data window

GSC data uses complete Pacific-time days and a three-day lag.

| Dataset      | Window                        |
| ------------ | ----------------------------- |
| Current      | 2026-07-19 through 2026-08-01 |
| Previous     | 2026-07-05 through 2026-07-18 |
| Search types | Web and image                 |

The site produced 3,882 web clicks and 10 image clicks in the current window. The result is driven by web search.

## Page performance

Lower average position is better.

| Page                            | Current clicks / impressions / CTR / position | Previous clicks / impressions / CTR / position | Change                                                                  |
| ------------------------------- | --------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `/`                             | 1,705 / 33,300 / 5.12% / 10.39                | 2,634 / 35,276 / 7.47% / 9.52                  | Clicks **-35.3%**; impressions **-5.6%**; position worsened **0.86**    |
| `/formats/upscale-gif-images`   | 28 / 811 / 3.45% / 19.11                      | 372 / 5,165 / 7.20% / 6.95                     | Clicks **-92.5%**; impressions **-84.3%**; position worsened **12.16**  |
| `/format-scale/gif-upscale-16x` | 131 / 2,154 / 6.08% / 7.26                    | 38 / 571 / 6.65% / 7.75                        | Clicks **+244.7%**; impressions **+277.2%**; position improved **0.49** |

The GIF owner and legacy 16x URL together fell from 410 to 159 clicks. The legacy page gained visibility, but it did not offset the owner's loss.

## Homepage diagnosis

| Query               | Current                                         | Previous            | Interpretation                                                                                        |
| ------------------- | ----------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `image upscaler`    | 207 clicks / 9,105 impressions / position 10.83 | 152 / 7,852 / 10.74 | Clicks **+36%** and impressions **+16%**; generic visibility is improving, with essentially flat rank |
| `myimageupscaler`   | 439 / 865 / position 1.01                       | 902 / 1,770 / 1.00  | Clicks **-51%** with stable top ranking; demand loss, not indexing loss                               |
| `my image upscaler` | 148 / 305 / position 1.03                       | 506 / 891 / 1.01    | Clicks **-71%** with stable top ranking; demand loss, not snippet/rank loss                           |

Do not rewrite homepage metadata based on this dataset. The generic query is moving in the right direction, and the largest loss is branded demand at unchanged top positions.

## GIF ownership diagnosis

GSC still shows the old ownership split during the pre-deploy measurement window:

- `gif upscaler`: 58 clicks to `/format-scale/gif-upscale-16x` at position 5.87, versus 3 clicks to the owner at position 13.19.
- `upscale gif`: 21 clicks to the legacy page at position 6.78, versus 0 clicks to the owner at position 28.90.
- The legacy page is now a live 301, so these competing impressions should consolidate only after Google recrawls the redirect and updates its index.

## Indexing and live-state checks

| URL                             | Live response  | Latest inspection evidence                                                                        |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `/`                             | `200`          | PASS; submitted and indexed; canonical matches; crawled 2026-08-04; sitemap references present    |
| `/formats/upscale-gif-images`   | `200`          | PASS; submitted and indexed; canonical matches; successful fetch; last crawl 2026-08-03 17:03 UTC |
| `/format-scale/gif-upscale-16x` | `301` to owner | Previously indexed with its own canonical; no sitemap entry                                       |

The GIF owner inspection predates commit `aef53d64` by about 34 minutes, so it proves indexability but not post-change recrawl. The owner remains unchecked in the request-indexing backlog for this reason.

## Backlog correlation

The backlogs show real work toward recovery, but their deploy labels are stale relative to the live site:

1. The 2026-07-30 entry records GIF ownership consolidation, localized URL removal, homepage performance work, and metadata hold decisions.
2. The 2026-08-03 entry records the GIF `lastUpdated` sitemap signal and orphan-sitemap retirement; focused SEO tests passed.
3. A live probe now confirms the GIF redirect and owner response, even though the change log still says deployment is pending.
4. The homepage request-indexing row is checked off. The GIF owner row remains unchecked and still needs a post-deploy GSC request or a later post-deploy crawl before it can be resolved.

Sources: [SEO changes backlog](../maintenance/seo-changes-backlog.md), [GSC request-indexing backlog](../maintenance/gsc-request-indexing-backlog.md), [2026-07-30 diagnosis](gsc-performance-diagnosis-2026-07-30.md), and fresh exports `/tmp/gsc-miu-home-gif-14-2026-08-04.json`, `/tmp/gsc-miu-home-gif-28-2026-08-04.json`, and `/tmp/gsc-miu-home-gif-2026-08-04.json` (56-day window).

## Next actions

1. Request indexing for `https://myimageupscaler.com/formats/upscale-gif-images` in GSC URL Inspection.
2. Recheck the GIF owner after one complete 14-day post-recrawl window; judge recovery by owner impressions, clicks, position, and whether legacy URLs disappear from `gif upscaler` and `upscale gif` rows.
3. Leave homepage metadata unchanged; reassess the branded and `image upscaler` split in the same next window.
