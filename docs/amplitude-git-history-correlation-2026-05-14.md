# Amplitude Correlation Notes: Recent Git History

Generated: 2026-05-14
Branch: `master`
Range reviewed: latest 30 commits, with detailed notes for 2026-05-07 through 2026-05-13.

Use commit timestamps as implementation timestamps, not guaranteed production deploy timestamps. If Vercel/CI deploys lagged or failed, correlate against deployment records before treating these as exposure start times.

## High-Signal Timeline

| Date/time PT     | Commit     | Area                                       | What changed                                                                                                                                                                                               | Amplitude correlation ideas                                                                                                                                                 |
| ---------------- | ---------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-13 20:48 | `b2c61e25` | SEO / pSEO tool pages                      | Improved `/tools` routing, localized tool page metadata/content, related-page handling, sitemap behavior, and pSEO validation/test coverage.                                                               | Organic landing page sessions, tool-page entrances, locale-specific traffic, search landing page conversion, sitemap-indexing effects.                                      |
| 2026-05-13 12:49 | `868a0d74` | SEO operations / GA analysis tooling       | Added/updated SEO growth skills and a GA4 key-events script; updated SEO maintenance backlog and report docs.                                                                                              | Not product-facing unless these scripts changed downstream reporting. Useful when explaining SEO/analytics workflow changes.                                                |
| 2026-05-13 11:49 | `308f2ac2` | SEO growth tooling                         | Added project-specific SEO growth skills for cannibalization, attribution repair, pSEO scoring, CTA mapping, money-page lift, and SERP snippet rewrites.                                                   | Mostly internal. Correlate only if these skills triggered content/page changes shortly after.                                                                               |
| 2026-05-13 10:37 | `1946b1df` | Blog SEO docs                              | Added blog opportunity and performance recovery reports.                                                                                                                                                   | Internal planning marker for blog/content work.                                                                                                                             |
| 2026-05-13 09:31 | `eb9f8357` | Checkout / gallery / tests                 | Improved `PurchaseModal` accessibility, adjusted `useGallery`, and stabilized upgrade funnel E2E handling.                                                                                                 | Checkout modal open/close, purchase start, checkout completion, upgrade funnel dropoff, gallery-related errors.                                                             |
| 2026-05-13 09:20 | `1446a276` | Errors / refunds / upload validation       | Added idempotent processing refund migration, improved upscale error handling, API client/file validation, anti-freeloader checks, credit manager behavior, and image generation service interfaces/tests. | Failed upscale rate, refund/credit return events, duplicate charge/refund anomalies, upload validation failures, blocked abuse/freeloader attempts, support tickets.        |
| 2026-05-12 16:44 | `ce9ed35b` | Blog publishing / SEO skills               | Added blog opportunity publisher and performance monitor skills; changed blog post publish/read API routes; updated tracking docs and reports.                                                             | Blog publish activity, blog page traffic, organic content funnel if content was published after this.                                                                       |
| 2026-05-12 15:44 | `64daf675` | Search UX / analytics / sitemap validation | Updated `ModelGallerySearch` placeholder text; added GA4 provider/type changes; sitemap structure validation and tests; SEO backlog/report updates.                                                        | Gallery search usage, query rate, search exits, GA4 event shape/availability, sitemap health.                                                                               |
| 2026-05-11 17:56 | `e0befdf5` | Checkout modal                             | Follow-up refinement to `PurchaseModal`.                                                                                                                                                                   | Purchase modal conversion and checkout start rates around the late 2026-05-11 window.                                                                                       |
| 2026-05-11 17:48 | `e8ad726c` | Model gallery / checkout                   | Larger model gallery and checkout improvements, including `ModelGalleryModal`, `ModelGallerySearch`, `PurchaseModal`, bottom sheet behavior, and checkout coin asset.                                      | Model selection, upgrade CTA clicks, modal engagement, checkout start, checkout abandon, mobile bottom sheet interaction.                                                   |
| 2026-05-11 09:58 | `b91c7c73` | Model gallery upgrade flow                 | Restored model gallery upgrade flow, touched pricing/credit selectors, bottom sheet, analytics types, and upgrade prompt tests.                                                                            | Upgrade CTA impressions/clicks, plan/credit-pack selection, paywall conversion, upgrade funnel analytics events.                                                            |
| 2026-05-09 02:11 | `f37b6a79` | Upscaling models / pricing / credits       | Added Clarity Pro and Recraft Crisp models, updated checkout and credit estimate APIs, model registry, Replicate builders, credit/cost config, validation, and before/after assets.                        | Model selection mix, upscale completion/failure by model, credit estimate views, checkout conversion by selected model, average credits consumed, high-quality model usage. |
| 2026-05-08 09:33 | `13ba8848` | Gallery analytics                          | Enhanced gallery analytics tracking and added telemetry events across dashboard gallery, image cards, workspace, and `useGallery`.                                                                         | Expect event volume/schema changes for gallery views, image card actions, workspace save/gallery actions. Watch for step changes caused by instrumentation, not behavior.   |
| 2026-05-07 23:53 | `5b39dc18` | Feature flags / onboarding                 | Added local constant feature flags and disabled onboarding.                                                                                                                                                | Onboarding starts/completions may drop by design; first-session behavior, activation, first upscale conversion may shift.                                                   |
| 2026-05-07 23:39 | `39affde5` | Cron / gallery cleanup / sitemap refresh   | Added cron worker setup checks, gallery cleanup jobs, sitemap refresh jobs, deploy preflight/verify checks.                                                                                                | Saved gallery item retention/counts, deleted/expired image behavior, sitemap freshness, organic discovery timing.                                                           |

## Earlier Related Commits

| Date/time PT     | Commit     | Area                         | What changed                                           | Amplitude correlation ideas                                                         |
| ---------------- | ---------- | ---------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 2026-05-07 23:01 | `22965ae1` | Tests                        | Test fixes.                                            | No direct user-facing correlation expected.                                         |
| 2026-05-07 23:00 | `09a4fab3` | Gallery storage / thumbnails | Optimized gallery storage and thumbnails.              | Gallery load speed, thumbnail views/errors, saved image engagement.                 |
| 2026-05-07 22:43 | `34dccbc1` | Gallery runtime / save CTA   | Fixed gallery runtime and restored save CTA.           | Save image CTA impressions/clicks, saved image count, gallery errors.               |
| 2026-05-07 22:14 | `eef63e64` | Gallery auth / mobile nav    | Fixed gallery auth and mobile navigation.              | Authenticated gallery access, mobile nav clicks, mobile conversion path.            |
| 2026-05-07 22:07 | `b21ca7ed` | Checkout tests               | Used production price id in checkout smoke test.       | Mostly test-only; verify no production config drift if checkout anomalies occurred. |
| 2026-05-07 21:49 | `ce4290d4` | Gallery tests                | Merge to stabilize MIU gallery tests.                  | No direct user-facing correlation expected.                                         |
| 2026-05-07 21:49 | `397f4a7e` | Gallery / upgrade tests      | Stabilized gallery and upgrade funnel tests.           | Mostly test-only.                                                                   |
| 2026-05-07 18:28 | `60eeb1b6` | API test harness             | Fixed API test environment harness.                    | No direct user-facing correlation expected.                                         |
| 2026-05-07 12:03 | `9189d67f` | Lint                         | Formatting updates.                                    | No direct user-facing correlation expected.                                         |
| 2026-05-06 13:41 | `3546b268` | Bulk compressor test         | Scoped selectors in `BulkImageCompressorPage` test.    | Test-only.                                                                          |
| 2026-05-06 12:06 | `78901498` | Blog test                    | Updated blog post H1 expected text.                    | Test-only unless paired with content changes.                                       |
| 2026-05-06 11:51 | `c89765e5` | Auth tests                   | Added `authSupabase` client for user auth handling.    | Mostly test/backend support; check auth anomalies only if deployed code changed.    |
| 2026-05-06 11:10 | `2b7bef19` | SEO                          | SEO fixes.                                             | Organic landing traffic, indexing, SEO page engagement.                             |
| 2026-05-02 18:53 | `cc51b525` | Test compatibility           | Downgraded `jsdom` and cleaned worker lint directives. | No direct user-facing correlation expected.                                         |

## Main Correlation Windows

### Gallery and Upgrade Funnel

Most relevant commits:

- `13ba8848` on 2026-05-08 09:33: added/changed gallery telemetry.
- `b91c7c73` on 2026-05-11 09:58: restored model gallery upgrade flow.
- `e8ad726c` and `e0befdf5` on 2026-05-11 17:48-17:56: checkout/modal improvements.
- `eb9f8357` on 2026-05-13 09:31: accessibility and E2E handling around purchase modal/gallery.

Watch for:

- Step changes in event counts caused by new instrumentation.
- Upgrade CTA impression-to-click changes.
- Checkout modal open-to-start and start-to-complete changes.
- Mobile-specific changes from bottom sheet/modal work.

### Upscale Model Mix, Credits, and Revenue

Most relevant commits:

- `f37b6a79` on 2026-05-09 02:11: added Clarity Pro and Recraft Crisp models; changed checkout, credit estimates, model registry, and credit/cost config.
- `1446a276` on 2026-05-13 09:20: improved error/refund/idempotency handling.

Watch for:

- Model selection distribution before/after 2026-05-09.
- Credit estimate views and credit consumption per successful upscale.
- Upscale failure rate by model/provider.
- Refund or credit return events after failures.
- Checkout conversion when higher-cost models are selected.

### Onboarding and First-Session Activation

Most relevant commit:

- `5b39dc18` on 2026-05-07 23:53: disabled onboarding behind local constant feature flags.

Watch for:

- Onboarding event volume dropping by design.
- First upscale completion rate.
- First-session save/gallery usage.
- Activation changes for new users who no longer see onboarding.

### SEO, pSEO, Blog, and Organic Traffic

Most relevant commits:

- `2b7bef19` on 2026-05-06 11:10: SEO fixes.
- `ce9ed35b` and `64daf675` on 2026-05-12: blog/SEO tooling, sitemap validation, GA4 provider/type changes.
- `b2c61e25` on 2026-05-13 20:48: tool page SEO routing, metadata, related pages, sitemap behavior.

Watch for:

- Organic sessions and landing pages by URL.
- Locale-specific `/tools` traffic.
- Search entrances to tool pages.
- CTA clicks from tool/blog pages into workspace or upload flow.
- GA4/Amplitude discrepancies if event provider changes affected tracking shape.

## Notes From Current Worktree

At generation time, the repo had uncommitted changes in SEO skill/docs files and one untracked report:

- `.claude/skills/seo-content-3-kings-technique/SKILL.md`
- `.claude/skills/seo-content-3-kings-technique/prompt.md`
- `docs/SEO/maintenance/gsc-request-indexing-backlog.md`
- `docs/SEO/maintenance/seo-changes-backlog.md`
- `docs/SEO/reports/3-kings-skill-run-2026-05-14.md`

These were not included as committed history. If they are deployed or committed later, add a separate Amplitude note for 2026-05-14 SEO/content indexing work.
