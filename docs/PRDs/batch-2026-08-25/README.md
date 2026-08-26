# PRD Batch — 2026-08-25

Six PRDs from two investigations into the GSC decline.

**PRDs 1-3** came from the 28-day GSC/GA4 export analysis (morning of 2026-08-25).
**PRDs 4-6** came from `The August 12 Cliff` triage (data through 2026-08-23), re-verified
against production on the afternoon of 2026-08-25.

The two investigations disagree, and the disagreement is informative rather than a conflict —
see [Reconciling the two readings](#reconciling-the-two-readings) below. Read that section before
picking up any PRD.

**Data sources:** GSC exports 2026-08-25 (90-day weekly series, 28-day comparison, per-query
device/country/page dimensions); the `myimageupscaler.com-core-web-vitals-Issue-2026-08-25.zip`
CWV export; `The August 12 Cliff` GSC triage; and live production probes run 2026-08-25 22:00-22:25 UTC.

---

## Execution status — 2026-08-25

| PRD                        | Implemented now                                                                                                                                                                                                             | Open gate                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge HTML caching          | Anonymous referral attribution moved into the browser; R2 bucket and guarded Cache Rule are active; the Webpack OpenNext build is 7.89 MiB compressed; isolated preview deployment and repeat R2 `HIT` responses are proven | Production deploy, live edge-cache proof, authenticated isolation check, and 28-day CWV reading remain open                                                                                                |
| GIF defragmentation        | Phases 0-2: incumbent verdicts, red cluster gate, and exact localized membership                                                                                                                                            | Phase 3 is an irreversible owner migration requiring the manual checkpoint and a verified production backup; Phases 4-5 follow its deploy date                                                             |
| Reporting hygiene          | Brand/unclassified split, phantom quarantine, stable cohort, skill workflow, and report replay are complete                                                                                                                 | None locally; use the new output on the next analysis run                                                                                                                                                  |
| Redirect and 404 integrity | Routed-path fix, generated redirect table, loop protection, 404 metadata, and strict source/destination resolution guards are implemented                                                                                   | A fresh GSC Pages 404 export is required before retiring the frozen fixture; the live destination gate also remains red while `/guides` and one localized bulk-tool route intermittently return Worker 503 |
| Locale retraction          | Rendered coverage audit, measured pair policy, metadata/hreflang/sitemap retraction, explicit-navigation behavior, and `/en/*` 301 are complete                                                                             | Deploy and post-deploy GSC observation                                                                                                                                                                     |
| pSEO soft-404 repair       | Locale metadata fallback, locale-strict eligibility, live reason logging, production audit, and head-term gate are complete                                                                                                 | Pruning waits for 14 complete post-deploy GSC days; first head-term decision is 2026-09-22                                                                                                                 |

---

## Finding A — the 28-day decomposition (PRDs 1-3)

The reported **-21.86% clicks** over the last 28 days decomposes as:

| Segment                                                  |            Change | Is it SEO?                                                                             |
| -------------------------------------------------------- | ----------------: | -------------------------------------------------------------------------------------- |
| Branded queries (`myimageupscaler`, `my image upscaler`) | **-1,451 clicks** | **No.** Position held at **1.0**. Impressions fell 3,053 → 1,280. Demand, not ranking. |
| GIF cluster                                              |   **-511 clicks** | **Yes** — self-inflicted by the July consolidation.                                    |
| Everything else                                          |  ≈ **-90 clicks** | Flat.                                                                                  |

Core organic — excluding brand, GIF, and one phantom query — is **growing**:

| Week of    | Clicks | Impressions |
| ---------- | -----: | ----------: |
| 2026-06-14 |    373 |      20,562 |
| 2026-07-12 |    729 |      33,388 |
| 2026-08-02 |    782 |      42,267 |
| 2026-08-16 |    586 |      36,623 |

+57% clicks and +78% impressions across the window. **The SEO work is producing traffic.** The headline number has been hiding it for four consecutive reports.

The residual ~12% branded erosion tracks the July 17 signup regression already documented in `docs/SEO/reports/2026-08-17-gsc-decline-root-cause.md` — a product problem with a product fix, not an SEO problem. No PRD here addresses it.

---

## Finding B — the August 12 step change (PRDs 4-6)

Average position went from **14.1 on Aug 11 to 18.5 on Aug 12** and stayed there for twelve days.
Not a drift — a step, on the exact day a URL restructure shipped. Impressions barely moved
(12.4K/day mid-July against 11.8K/day now) while clicks fell a third: the site still appears,
it appears further down.

| Signal                             |        Jul 31-Aug 11 |                                  Aug 12-23 |
| ---------------------------------- | -------------------: | -----------------------------------------: |
| Clicks/day                         |   385 (Jul 8-14 avg) |                                        251 |
| Average position                   |                 14.1 |                                       18.5 |
| `image upscaler`                   | 282 clicks · pos 9.5 |                   **75 clicks · pos 14.4** |
| `myimageupscaler` (brand, control) | 281 clicks · pos 1.0 |                       263 clicks · pos 1.0 |
| Pages indexed                      |                    — | **27%** (1,133 of 4,227 URLs Google knows) |

Brand held at position 1.0 throughout, so demand is intact. What broke is the site's own URL layer,
sitting on top of a programmatic page matrix Google was already refusing to index.

`/blog/best-free-ai-image-upscaler-2026-tested-compared` barely moved (565 → 490 clicks,
pos 5.2 → 5.7). **Real editorial content survived. The templated matrix did not.**

---

## Reconciling the two readings

Finding A says core organic is growing +57%. Finding B says position stepped down 4.4 places
overnight. Both are measured, and both are true — they are measuring different things:

- **Finding A excludes brand, GIF, and one phantom query**, and reads a 90-day weekly series.
  Its last data point (week of 2026-08-16) already shows the drop: 782 → 586 clicks.
- **Finding B reads a daily series across a single date boundary**, which is the only view in which
  a step change is visible at all. A weekly series straddling Aug 12 averages the step away.

The honest synthesis: **the SEO work was producing traffic, and then an Aug 11-13 deploy gave a
chunk of it back.** Neither reading cancels the other, and neither is a reason to stop the work.

**PRD 3 (Reporting Signal Hygiene) is what makes this reconcilable at all** — and it should be
extended with a daily-granularity step-change detector, because the blended weekly headline hid a
4.4-position break for twelve days. That is the same class of failure it already exists to fix.

**One caution on Finding B's dating.** The PDF attributes the step to an "Aug 11-12 URL restructure",
but the repository's restructure commits are `a8c0514d` and `63bb04f9`, both dated **2026-08-13**,
with the deploy recorded that day in the SEO changes backlog. Either the deploy preceded the commit
timestamps or the step has another cause. **Pull the actual deploy log before treating Aug 12 as
established** — every PRD below stands on its own live-verified evidence and does not depend on the date.

---

## The PRDs 1-3

### 1. [Edge HTML Caching & LCP Recovery](./edge-html-caching-lcp-recovery.md)

`MEDIUM` · sitewide · biggest single win

Every HTML response is rendered on-demand in the Worker and cached by nothing. TTFB is 1.1-2.3s on every page. Three stacked defects:

- `middleware.ts:921` sets a `Set-Cookie` on every cookie-less visit — which is every first-time organic visitor — making Cloudflare treat all HTML as uncacheable. Static assets return `cf-cache-status: HIT`; HTML returns no cache header at all.
- `open-next.config.ts` is `defineCloudflareConfig({})` and `wrangler.json` declares no cache binding, so `x-nextjs-cache: MISS` on 100% of samples despite `force-static` + `revalidate = 86400`.
- **The cookie costing the entire site its edge cache has zero non-test consumers.** A repo-wide grep for `miu_referral_source` / `x-referral-source` / `referralSource` hits only `middleware.ts` and its own test file.

GSC reports mobile LCP > 4s on **113 URLs**, up from 57 in May — tracking page count, the signature of a sitewide cause. The named example, `/blog/fixing-pixelated-photos`, has a **5.4s group LCP over 102 real users**; its LCP image already preloads correctly and downloads in 0.65s. The image is not the problem.

### 2. [GIF Intent Defragmentation](./gif-intent-defragmentation.md)

`MEDIUM` · **executes the fail branch of an existing PRD**

Not a new plan. `docs/PRDs/gif-intent-recovery-live-signal-verification.md` (2026-08-04) locked a Phase 5 recovery gate; enough GSC days now exist to run it. **Four of its five thresholds fail.**

The fifth — owner position 7.90 against a ≤8.0 target — is a **false pass**. The page's query footprint collapsed from 115 queries / 3,564 impressions to 65 / 426, and every head query got worse (`gif upscaler` 5.6 → 13.9). The average survives only because the head queries lost the impression weight that used to dominate it.

Named cause: **index-level fragmentation.** Seven URLs still compete for `gif upscaler` three weeks after the redirects shipped — including two 301s Google has not honored, two localized variants never listed in `memberPaths`, and `/blog/gif-upscaler`, which now holds pos 5.4 and out-earns the designated owner.

This PRD also closes the incumbent's Phase 5b P1 gate, whose own escalation text already prescribes the verdict for `how to fix pixelated photos`.

### 3. [SEO Reporting Signal Hygiene](./seo-reporting-signal-hygiene.md)

`MEDIUM` · tooling · prevents the next three months of misdiagnosis

`gsc-fetch.cjs:925-927` already computes `nonBrandedQueries`. The `summary` and `comparison` fields — the ones the skill's own workflow says to read first — ignore it. The correct data is present and the headline discards it.

Also quarantines phantom impression clusters. `how to fix pixelated photos`: **168,153 impressions, 3 clicks, 0.0018% CTR** over 90 days, 89% desktop, 27% Brazil. It is 12.4% of all site impressions and produces most of the reported CTR and average-position movement.

---

---

## The PRDs 4-6

Every claim in these three was re-verified against production before the PRD was written.
Where the source PDF turned out to be wrong, the correction is recorded inline in the PRD —
**implement against the PRD, not against the PDF.**

### 4. [Redirect & 404 Integrity](./redirect-and-404-integrity.md)

`CRITICAL` · MEDIUM effort · PDF items 01, 02, 08

The Aug-13 deploy shipped 310 redirects **and a unit gate asserting full GSC-404 coverage**.
The gate is green. Production still 404s on URLs inside the gate's own fixture.

Two independent false-pass mechanisms, both verified:

- **Wrong key.** `legacy-redirects.unit.spec.ts:11-22` builds an exemption set from `page.slug` and
  compares it against a _path_. `social-media-resize.json:2433` has slug `resize-image-for-discord`,
  so `/tools/resize-image-for-discord` is declared "routed" — while the live URL 404s and the real
  route is `/tools/resize/resize-image-for-discord`.
- **Frozen fixture.** The gate reads a CSV exported 2026-08-08. Every 404 Google has found since
  cannot fail a gate that never sees it.

Also: `app/not-found.tsx` exports no `metadata`, so the 404 page ships an empty `<title>` — confirmed live.

**Three PDF claims did not survive verification and are marked out of scope with evidence:** the six
5xx responses are already fixed (`gsc-verify-5xx-2026-08-13.json`, 0 violations), `/blog?page=999`
returns 200 rather than 500, and the GIF evidence in item 01 belongs to PRD 2.

### 5. [Locale Surface Retraction](./locale-surface-retraction.md)

`HIGH` · MEDIUM effort · PDF items 03, 07, 09

Item 09 reproduces worse than reported and is now the lead phase. With a `locale=es` cookie:

```
/          307 -> /es          <- the root itself
/pricing   307 -> /es/pricing
```

`middleware.ts:566` issues an unspecified-status **307** and `:574` pins a one-year cookie, so one
geo-detected visit rewrites every later request including shared links. This is the process that
manufactures the duplication in items 03 and 07.

`app/seo/data/scale.json` has **no translations field at all**, yet `scale` is listed in
`LOCALIZED_CATEGORIES` and `/es/scale/2k-upscaler` emits eight hreflang alternates over English copy.

**But coverage is uneven and a blanket retraction would delete real work:**
`/fr/device-use/mobile-ecommerce-upscaler` is genuinely French. Phase 1 therefore replaces the
declared category list with a measurement of the rendered page.

### 6. [pSEO Matrix Soft-404 Repair & Head-Term Recovery Gate](./pseo-matrix-soft-404-repair.md)

`HIGH` · MEDIUM effort · PDF items 04, 05 · **reorders the PDF's prescription**

The PDF says prune the 772 crawled-not-indexed pages down to 100-150. Probing found a line-level
defect that makes them unindexable regardless of demand — so pruning first would delete demand
rather than measure it.

`app/[locale]/(pseo)/platform-format/[slug]/page.tsx`: the **component** falls back to English
(`:41-43`); **`generateMetadata` does not** (`:26`, `if (!result.data) return {};`). The result is a
200 response with full correct English body content under the site-wide default `<title>`, the
site-wide default description, and **no `robots` meta at all** — so the `shouldNoindex` logic at
`metadata-factory.ts:69` never runs.

All three of the PDF's named crawled-not-indexed examples are in this broken set. **17 route files
carry the bail; 10 have the asymmetry.** Times six non-English locales, that is the order of
magnitude of the 772.

Two more findings that explain why the existing pruning machinery never reached these pages:

- `shouldSubmit` inherits the **English** row for a locale variant (`page-eligibility.ts:70`), so
  `en impressions: 1` keeps all seven locales of `dalle-upscaler-png` submitted — including the `ja`
  variant, which has no snapshot row at all.
- `getEligibilityReason`, which computes the `'pruned'` verdict, has **zero non-test consumers**.
  The reasoning exists; nothing reads it.

Phase 5 wires PDF item 05 (`image upscaler`, 282 → 75 clicks, pos 9.5 → 14.4) into a dated gate with
a first reading on **2026-09-22**.

---

## Suggested order

Two tracks. They touch different files and can run in parallel.

**Track 1 — stop the bleeding (do this first).**

1. **PRD 4 (Redirect & 404 Integrity).** Highest impact per unit of effort, and the coverage gate
   must be fixed before any other redirect work inherits its hole.
2. **PRD 6 Phases 1-3 (soft-404 repair).** The metadata fix is mechanical, affects ~772 URLs, and is
   a precondition for judging the matrix at all. **Do not start PRD 6 Phase 4 (pruning) until Phase 2
   has been live 14 complete GSC days + the 3-day lag.**
3. **PRD 5 (Locale Surface Retraction).** Phase 3 removes the redirect that manufactures the
   duplication; it must ship with the language switcher in the same phase.

**Track 2 — the original three.**

4. **PRD 1 (Edge HTML Caching).** Sitewide, root cause proven, Phase 1 deletes dead code.
5. **PRD 3 (Reporting Signal Hygiene).** Cheap, and it is what let a 4.4-position step hide for
   twelve days. Extend it with the daily step-change detector named above.
6. **PRD 2 (GIF Intent Defragmentation).** Its Phase 3 needs a fresh measurement at execution time.
   **One new input from the Aug-25 probing:** `/es/format-scale/gif-upscale-2x` 301s to the English
   `/formats/upscale-gif-images`, losing the locale — a cross-locale redirect its Phase 2 should absorb.

### Ownership map — no two PRDs touch the same surface

| Surface                                                                           | Owner |
| --------------------------------------------------------------------------------- | ----- |
| `lib/seo/legacy-redirects.ts`, `app/not-found.tsx`                                | PRD 4 |
| `middleware.ts` locale routing, `/en/` mirror, hreflang, `localization-config.ts` | PRD 5 |
| `app/[locale]/(pseo)/**` metadata, `page-eligibility.ts`, matrix pruning          | PRD 6 |
| `middleware.ts` referral cookie, OpenNext cache, CWV                              | PRD 1 |
| `lib/seo/intent-ownership.ts`, the GIF cluster                                    | PRD 2 |
| `gsc-fetch.cjs`, reporting skills                                                 | PRD 3 |

PRD 5 and PRD 6 both touch locale pSEO pages. **PRD 5 makes untranslated pairs `noindex`; PRD 6 fixes
why their head was empty in the first place.** PRD 5's noindex would mask PRD 6's defect — run
PRD 6 Phase 2 first, or the masking will read as a fix.

## Shared conventions

Every PRD follows `.claude/skills/prd-creator/`: an Integration Ledger with real `file:line` callers, a negative control observed **red** for every gate, and consumer-scoped acceptance criteria.

Three rules matter more than usual here:

- **Every measurement gate must be observed failing on production data before its fix ships.** The GIF `baselineContract` (847 clicks) has existed in `lib/seo/intent-ownership.ts` since July and was never once compared against live data. That is how a cluster lost 86% of its clicks unnoticed for six weeks.
- **No judgment before 28 complete GSC days plus the 3-day lag.** Judging early measures the pre-change index and reads as failure regardless of truth.
- **Verify the source before implementing from it.** Of the ten issues in `The August 12 Cliff`,
  three did not reproduce on production and one had a different root cause than reported. Each PRD
  above records what it re-checked and what it corrected. Do the same for the next report.
