# GSC validation diagnosis and suggested fixes — September 8, 2026

## Finding

The evidence points to three different situations: incomplete coverage of legacy paths, Google reporting older crawls, and exclusions intentionally introduced by previous SEO changes. A failed validation does not establish that every previous fix failed.

The strongest confirmed defect is the 404 coverage gap: 13 paths in the new 404 export were absent from the old input dataset. Of the 10 examples supplied by the user, five still return 404 and five already redirect successfully.

The confirmed 404 repair is now implemented in local source. It does not change indexing policy, deploy production, or submit validation requests.

## Implementation status — September 8, 2026

The first delivery item is complete locally:

- The 13 newly uncovered paths were merged into the maintained 404 inventory without removing historical rows.
- The generator now maps the five confirmed missing paths: the two device articles, `jpg-en-png`, the architecture article, and the bare `/use-cases-expanded` hub. The hub mapping is exact-path only, so `/use-cases-expanded/[slug]` remains a detail route.
- The generated redirect table and regression tests cover 301 status, destination ownership, single-hop behavior, and case-only loop avoidance.
- The refreshed production audit checked 316 inventory rows and 285 redirect destinations. All destinations ended at 200. The seven newly added source URLs still returned 404 because the source change has not been deployed.

The redirect repair must be deployed and rechecked before GSC validation begins. The report's indexing-policy, reliability, and Google-selected-canonical sections remain evidence-gathering work; no blanket noindex, canonical, or redirect policy was changed.

## Evidence and limits

Source: all seven ZIP exports in `GSC-tmp`, dated September 8, 2026. Each contains `Metadata.csv`, `Table.csv`, and `Chart.csv`. Scope is **All known pages**, not just submitted sitemap URLs.

The charts end September 3. Some table rows record crawls through September 5. These exports do not contain validation attempt dates, failed-instance history, or Google-selected canonical URLs. Therefore, the exact trigger for each failed attempt cannot be established from these files alone.

Live checks used public HTTP GET requests on September 8, following and recording redirects. They are point-in-time checks, not proof of sustained availability or Googlebot-specific behavior. Most categories were sampled; all five exported 5xx URLs and all 10 user-supplied 404 examples were checked.

| Export suffix | Issue                                                 | Exported URLs |
| ------------- | ----------------------------------------------------- | ------------: |
| No suffix     | Alternate page with proper canonical tag              |           952 |
| `(1)`         | Page with redirect                                    |           831 |
| `(2)`         | Excluded by noindex tag                               |           316 |
| `(3)`         | Not found (404)                                       |           276 |
| `(4)`         | Server error (5xx)                                    |             5 |
| `(5)`         | Crawled — currently not indexed                       |           673 |
| `(6)`         | Duplicate, Google chose different canonical than user |           198 |

## Relevant Git history

| Commit     | Date        | Change and implication                                                                                                                           |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `63bb04f9` | August 13   | Added legacy 404 repair machinery. Its coverage depends on the input paths.                                                                      |
| `a8c0514d` | August 13   | Introduced performance-based sitemap eligibility and intentional noindex pruning. Some exclusions are expected outcomes.                         |
| `7baee1cb` | August 17   | Removed case-only legacy redirects that looped in development. Avoid reintroducing case-insensitive self-redirects.                              |
| `d08a19da` | August 25   | Expanded legacy redirects, locale eligibility and metadata repairs, English mirror retraction, and query-preserving `/en/*` canonical redirects. |
| `d005e86b` | August 26   | Refreshed redirect liveness evidence; refreshing results does not expand the underlying URL inventory.                                           |
| `dd78b04c` | August 31   | Revalidation queue outage repair, relevant to historical availability failures; not proof of the cause of every exported 5xx.                    |
| `e4819767` | September 7 | Added noindex to filtered/paginated blog index variants. Exported crawls predate this change.                                                    |

The [SEO backlog](../maintenance/seo-changes-backlog.md) explicitly states that the August recovery work retained a frozen August 8 GSC source. Both the redirect generator and resolution verifier refer to `docs/PRDs/gsc-recovery-2026-08/data/gsc-404.csv`.

The September 7 backlog entry says the blog change was not yet deployed at the time of that entry. Live checks now show its intended metadata in production; that historical deployment note is no longer a reliable description of current behavior.

## 1. Not found (404): confirmed incomplete path coverage

### Current behavior and suggested mapping

All paths below are relative to `https://myimageupscaler.com`.

| Source                                            | Live result | Suggested destination or disposition                                             |
| ------------------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| `/article/mobile-device-image-optimization`       | 404         | 301 to `/device-optimization/mobile-device-image-optimization`                   |
| `/article/desktop-image-optimization`             | 404         | 301 to `/device-optimization/desktop-image-optimization`                         |
| `/tools/convert/jpg-en-png`                       | 404         | 301 to `/tools/convert/jpg-to-png`                                               |
| `/article/architecture-visualization-enhancement` | 404         | 301 to `/industry-insights/architecture-visualization-enhancement`               |
| `/use-cases-expanded`                             | 404         | Exact-path 301 to `/use-cases`; preserve all `/use-cases-expanded/[slug]` routes |
| `/tools/Imagem-cutout-tool`                       | 301 → 200   | Already resolves to `/tools/image-cutout-tool`                                   |
| `/article/upscale-product-photos`                 | 301 → 200   | Already resolves to `/content/upscale-product-photos`                            |
| `/article/vintage-photo-colorization`             | 301 → 200   | Already resolves to `/photo-restoration/vintage-photo-colorization`              |
| `/tools/resize-image-for-discord`                 | 301 → 200   | Already resolves to `/tools/resize/resize-image-for-discord`                     |
| `/tools/resize-image-for-telegram`                | 301 → 200   | Already resolves to `/tools/resize/resize-image-for-telegram`                    |

The four proposed detail/tool destinations exist in route data and returned direct 200 responses with self-canonicals during live checks.

**Hub decision: add an exact-path 301 from `/use-cases-expanded` to `/use-cases`.** The expanded category has a `[slug]` route but no category index page. Its data describes professional image-enhancement use cases; the existing `/use-cases` index is titled “Image Upscaling Use Cases” and offers industry-oriented browsing. It is the appropriate existing destination for this broad hub intent and returned a direct 200 with a self-canonical. Creating a second overlapping hub adds no demonstrated value. This is an intent-based implementation decision, not a claim about historical ranking performance; a GSC performance pull is not required to select this destination.

Implement only the bare hub redirect, with normal trailing-slash handling. Do not add a wildcard redirect: existing `/use-cases-expanded/[slug]` detail pages must keep their current behavior. Keep `/use-cases` as the canonical hub in navigation and any hub sitemap references. Do not redirect unrelated missing URLs to the homepage merely to clear a report.

### Suggested implementation

1. Import the fresh 276-row export into the maintained input, preserving historical legacy coverage rather than replacing the old inventory destructively. Classify every new path, including the three outside the user's 10 examples.
2. Update `scripts/seo/build-legacy-redirects.ts`: add the missing `jpg-en-png` alias to `TOOL_SLUG_ALIASES`, and ensure the three `/article/*` paths resolve through their existing data owners. Add the exact `/use-cases-expanded` → `/use-cases` mapping to the generator’s explicit redirect source map. Regenerate `lib/seo/legacy-redirects.ts`; do not hand-edit the generated output.
3. Add regression cases in `tests/unit/seo/` for each new mapping, destination validity, single-hop behavior, and case-only loop avoidance. Assert that the bare expanded hub redirects to `/use-cases` and that no catch-all rule captures its detail routes.
4. Run the refreshed resolution audit against every source and every destination. Record intentional 404s separately from unresolved defects. Update internal links and sitemap entries that still reference aliases, if any are found.
5. After deployment, repeat the source-to-destination checks on production before starting GSC validation. Expect repaired source URLs to appear as redirects rather than indexed pages.

## 2. Page with redirect: often an intended result

There are 831 exported URLs; 282 are blog index parameter URLs. The August 25 change intentionally canonicalized `/en/*` and retracted some locale mirrors.

Live example: `/it/ai-features/ai-noise-reduction-upscaler` returns one 301 to the English page, which returns 200. `/en/blog?page=3&q=upscale` returns one 301 to `/blog?page=3&q=upscale`, preserving the query.

**Suggestion:** audit for loops, chains, dead destinations, and redirects to unrelated pages. Keep valid permanent redirects. Remove redirecting URLs from submitted sitemaps and internal links where applicable, and verify the destination's indexability policy. Do not change a correct redirect into a duplicate 200 page to make the category disappear.

**Acceptance:** each retained redirect has an intentional owner, ideally one permanent hop, and a healthy destination. The source does not need to be indexed.

## 3. Excluded by noindex: distinguish policy from mistakes

There are 316 exported URLs. The previous pruning and locale retraction work deliberately made some pages ineligible for indexing.

Live example: `/ja/platform-format/lightroom-upscaler-raw` returns 200 with `noindex, follow`. That matches the exclusion label; this alone is not a defect.

**Suggestion:** compare every exported URL with `lib/seo/page-eligibility.ts`, locale translation evidence, and the actual sitemap output. Retain noindex for deliberate exclusions. If an intended search landing page is wrongly excluded, correct its eligibility or translation evidence before removing noindex, and ensure its metadata, internal links, and sitemap agree.

**Acceptance:** every noindex URL has an explicit reason; no intentionally excluded URL is submitted as an indexable canonical. Do not remove noindex across the whole category.

## 4. Alternate page with proper canonical tag: mostly duplicate discovery

There are 952 exported URLs; 760 contain `/blog?`. These variants account for about 80% of this export.

Commit `e4819767` changed non-empty blog searches and page values other than `1` to `noindex, follow`, while retaining canonical `/blog`. Live `/blog?page=2&q=4k` now returns exactly that policy with status 200. The export's crawls predate the commit.

**Suggestion:** verify the parameter policy across `/blog`, `/en/blog`, search filters, and pagination. Keep the clean blog index indexable. Audit crawlable links that generate large combinations of search and pagination parameters. Preserve useful navigation while avoiding unnecessary discovery of duplicate search-result combinations. Audit non-blog alternates separately against their intended owners.

**Acceptance:** clean owners remain reachable and indexable; variants expose their intended canonical/noindex signals and are absent from canonical sitemaps. A shift from alternate canonical to noindex is consistent with the implemented policy, not necessarily a regression.

## 5. Server error (5xx): currently recovered in spot checks

All five exported URLs now resolve through one 301 to a 200 destination:

| Exported source                        | Final destination                             |
| -------------------------------------- | --------------------------------------------- |
| `/en/blog?page=3&q=upscale`            | `/blog?page=3&q=upscale`                      |
| `/ja/tools/resize-image-for-linkedin`  | `/ja/tools/resize/resize-image-for-linkedin`  |
| `/ja/tools/resize-image-for-instagram` | `/ja/tools/resize/resize-image-for-instagram` |
| `/ja/tools/resize-image-for-facebook`  | `/ja/tools/resize/resize-image-for-facebook`  |
| `/ja/tools/resize-image-for-twitter`   | `/ja/tools/resize/resize-image-for-twitter`   |

The blog row was last crawled September 3; the other rows date from May or July. Prior cache/revalidation repairs are relevant history, but this export cannot attribute the old failures to a specific outage.

**Suggestion:** repeat checks over time and across cold/stale cache behavior, then correlate any recurrence with Worker logs. If production credentials are required, gather only the needed read-only evidence through the GCloud secrets workflow. Investigate reproducible failures before changing code.

**Acceptance:** repeated checks and production telemetry show no recurring failures for these routes; validation checks the repaired production version. A single 200 response is insufficient evidence of sustained recovery.

## 6. Crawled — currently not indexed: not solved by redirects alone

There are 673 exported URLs, including 57 blog parameter variants. The category mixes duplicate discovery, potentially pruned pages, and intended landing pages.

Live example: `/it/tools/convert/jpg-to-png` returns 200 with a self-canonical. This proves reachability and declared ownership, not that Google will index it.

**Suggestion:** divide the inventory into intended indexable pages, deliberate exclusions, and duplicate/legacy URLs. For intended pages, inspect Google's crawled HTML and indexing details, check rendering, language, content distinctiveness, canonical signals, internal links, and sitemap inclusion. Improve useful content or consolidate truly overlapping pages only after establishing intent and owner quality. Apply the existing noindex policy to excluded surfaces rather than requesting their indexing.

**Acceptance:** intended pages have consistent, crawlable indexing signals and useful distinct content. Track subsequent indexing and impressions over a recrawl window; passing unit tests or returning 200 does not guarantee indexing.

## 7. Google chose a different canonical: unresolved without inspection evidence

There are 198 exported URLs, with many localized examples. The export does not reveal which canonical Google selected.

Live `/it/tools` returns 200 and declares itself canonical; its HTML contains two identical canonical link tags. `/de/about` also returns 200 with a self-canonical. Identical duplicate tags are worth tracing to their renderers, but do not establish the cause of Google's choice. `/pt/guides/tiff-format-guide` now returns 200 with noindex, suggesting the historic duplicate classification may no longer describe its current policy.

**Suggestion:** use URL Inspection to compare declared and Google-selected canonicals for representative URL clusters. Check actual translated content, hreflang reciprocity, sitemap membership, internal links, and redirects. If the localized page is a useful translation, align those signals with its own canonical. If it is an English mirror or intentionally pruned, retain the documented exclusion/consolidation policy. Do not force self-canonicals or redirect all locale pages without that evidence.

**Acceptance:** each cluster has a justified intended owner and consistent signals; use subsequent Google-selected canonical evidence to assess whether the repair was accepted.

## Delivery order and verification

1. **Repair confirmed 404 gaps:** local source repair is complete for the four detail/tool mappings plus the exact hub redirect to `/use-cases`; deploy and repeat the seven source checks.
2. **Reconcile indexing policy:** audit noindex, canonical alternates, and redirects against actual sitemaps and internal links.
3. **Confirm reliability:** repeat all five historical 5xx checks and inspect telemetry if failures recur.
4. **Investigate indexing selection:** collect URL Inspection evidence for intended pages in the crawled-not-indexed and canonical-disagreement groups.
5. **Deploy and validate with current evidence:** run affected SEO tests and `yarn verify`, update the SEO backlog for implemented changes, verify production behavior, then use GSC validation details to track the exact failing instances.

`yarn verify` passed during this investigation, with existing lint warnings. It checks code contracts; it does not prove that all fresh GSC URLs are covered or that Google has recrawled production. No additional application changes were made for the evidence-only sections of this report.

## Google documentation

Google describes redirects, alternate canonical pages, and intentional exclusions separately from indexable owner pages, and explains that failed validation means a checked instance still exhibits the issue: [Page indexing report](https://support.google.com/webmasters/answer/7440203?hl=en).

Stored inspection results describe Google's previously indexed/crawled version; the live test has different capabilities and does not guarantee indexing: [URL Inspection tool](https://support.google.com/webmasters/answer/9012289?hl=en).

## Immediate next action

Deploy the local redirect repair, repeat the seven source checks on production, then open the 404 validation history and record its first failed URL and validation date before starting GSC validation.
