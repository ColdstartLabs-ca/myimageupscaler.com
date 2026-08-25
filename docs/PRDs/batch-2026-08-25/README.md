# PRD Batch — 2026-08-25

Three PRDs from one investigation into the GSC decline. They are independent and can run in parallel, but the ordering below is by expected impact per unit of effort.

**Data sources:** GSC exports 2026-08-25 (90-day weekly series, 28-day comparison, per-query device/country/page dimensions), the `myimageupscaler.com-core-web-vitals-Issue-2026-08-25.zip` CWV export, and live production header probes.

---

## The finding these came from

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

## The PRDs

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

## Suggested order

1. **PRD 1 first.** It is sitewide, the root cause is proven, and Phase 1 is deleting dead code that has no consumers.
2. **PRD 3 second.** Cheap, and PRD 2's Phase 4 decision gate is easier to trust once the reporting is clean.
3. **PRD 2 third.** Its Phase 3 needs a fresh measurement at execution time anyway — the decision rule is fixed, the reading is not.

## Shared conventions

Every PRD follows `.claude/skills/prd-creator/`: an Integration Ledger with real `file:line` callers, a negative control observed **red** for every gate, and consumer-scoped acceptance criteria.

Two rules matter more than usual here:

- **Every measurement gate must be observed failing on production data before its fix ships.** The GIF `baselineContract` (847 clicks) has existed in `lib/seo/intent-ownership.ts` since July and was never once compared against live data. That is how a cluster lost 86% of its clicks unnoticed for six weeks.
- **No judgment before 28 complete GSC days plus the 3-day lag.** Judging early measures the pre-change index and reads as failure regardless of truth.
