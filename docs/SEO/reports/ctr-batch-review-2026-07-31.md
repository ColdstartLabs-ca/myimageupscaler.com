# CTR Batch Review — 2026-07-31

Review of the six commits shipped 2026-07-30 against the stated goal of **increasing SERP CTR**.

**Headline:** this batch contains **no changes to any `<title>`, `metaTitle`, or `metaDescription`** — nothing that
alters what Google renders in a search result. That was a deliberate call recorded in
`docs/SEO/reports/gsc-performance-diagnosis-2026-07-30.md` ("Hold active snippet tests… avoid stacking another edit
inside the test windows"), and it is methodologically correct. But it means the batch does not serve a CTR goal. The
actual CTR program is the **Jul 20 / 22 / 27 snippet tests, reading out Aug 4 / 5 / 10**.

What shipped instead: indexing consolidation, 5xx recovery, Core Web Vitals, sitemap hygiene, funnel analytics.

---

## Verdict per change

| Change                                             | Commit                 | Verdict                                                                 |
| -------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| GIF intent consolidation (4 pages → 1 via 301)     | `a673f164`             | **Risky** — recovers indexing coherence, likely loses clicks            |
| Legacy social-resize 301s (5 × 2 locales)          | `a673f164`             | No CTR effect — real 5xx recovery, moves impressions not CTR            |
| `use-cases-expanded` removed from sitemap index    | `a673f164`             | No CTR effect — hygiene, and **incomplete** (see C3)                    |
| Homepage LCP / Stripe deferral                     | `a673f164`             | No CTR effect — real CWV win, ranking-adjacent at best                  |
| Nested canonical path in tool schema + breadcrumbs | `a673f164`             | Weak — breadcrumb display, marginal. Fixed a real `/en/` breadcrumb bug |
| Product `image`/`url`/`@id` on homepage plans      | `026c66ee`             | **Won't fire** — clears a GSC warning, produces no SERP change (see C2) |
| `og-image-pricing.png` → `og-image.png`            | `026c66ee`             | Genuine bug fix — old path 404s. No CTR effect                          |
| Deploy guard sitemap count 86 → 85                 | `726ada86`             | No CTR effect — test constant                                           |
| GSC indexing checkboxes                            | `83c8156c`             | No CTR effect — doc only                                                |
| Purchase funnel attribution                        | `089d33ba`, `97d00fa9` | No CTR effect — post-click conversion                                   |

Test coverage is good: 89 tests across 6 SEO suites, all green. Project convention (`tests/unit/seo/`) satisfied.
No deindexing risk, no manual-action risk, redirect ordering is safe.

---

## Corrections

### C1 — GIF consolidation redirects into a page that says "not supported"

**Files:** `lib/seo/gif-intent.ts:1-15`, `middleware.ts:637-648`, `app/seo/data/formats.json:824` (slug
`upscale-gif-images`)

All four `/format-scale/gif-upscale-{2x,4x,8x,16x}` now 301 into `/formats/upscale-gif-images`, whose body opens with:

> "Animated GIF processing is not currently supported by our AI workspace."

Google demoted that page (position 7.11 → 20.97, 158 clicks → 11) **after** the Jul 10 honesty edit. Consolidating
four URLs into a page already scored down for exactly this intent transfers signals to a destination whose relevance
Google has rejected. Realistic outcome: you lose the ~19 clicks `gif-upscale-16x` was earning; you do not recover
the 158.

**This is still defensible** — the 16x page advertised "free, no registration, 16x GIF output" for a capability that
does not exist, which is real Google policy exposure. But it should be recorded as _taking a click loss to remove a
false claim_, not as a recovery play. The backlog currently frames it as recovery.

- [ ] Reframe the backlog entry as a correctness fix with an expected click loss, not a recovery
- [ ] Bump `lastUpdated` at `app/seo/data/formats.json:837` (still `2025-12-19T00:00:00Z`) so sitemap `lastmod`
      actually signals the change to Google
- [ ] Decide explicitly: if GIF is never coming, consider whether owning the intent at all is worth it

**Permanence warning:** `middleware.ts:644-648` 301s `/{locale}/formats/upscale-gif-images` → `/formats/...`, a
cross-language redirect. Combined with `lib/seo/hreflang-generator.ts:66` returning only `en` + `x-default`, this is
internally consistent, but **6 localized URLs are permanently dropped** from an otherwise localized category. Not
recoverable without another migration.

### C2 — Homepage Product schema will not produce a rich result

**Files:** `client/components/features/landing/Pricing.tsx:23-49`, `lib/seo/schema-generator.ts:928`

Four problems, any one of which is disqualifying:

1. **The image is not a product image.** `public/og-image.png` is **615 × 124** (verified) — a 5:1 banner strip.
   Merchant listing guidance wants 1:1 / 4:3 / 16:9 at high resolution. This clears the GSC "missing image" error
   and immediately fails the quality bar. No thumbnail renders.
2. **Wrong page.** `HomePageClient.tsx:34` lazy-imports `Pricing`, which emits four `Product` blocks with
   `url: /pricing` and `@id: /pricing#{key}` — _from `/`_. Structured data must describe the main content of the
   page it sits on.
3. **Contradicts existing homepage schema.** `lib/seo/schema-generator.ts:849-859` emits `WebApplication` with
   `offers.price: 0`. The homepage now asserts both "this is free" and "these four Products cost $X". That
   incoherence makes Google _more_ likely to ignore the graph.
4. **No `aggregateRating`, no `review`.** Product snippets in blue-link results render almost entirely off review
   stars. A software subscription with no ratings and no shipping/return data is not a merchant-listing candidate.

- [ ] Produce a real ≥1200px plan/product image (1:1 or 4:3), not the OG banner
- [ ] Move the `Product` markup to `/pricing` and remove it from `/`
- [ ] Reconcile the `price: 0` `WebApplication` offer with the paid `Product` offers
- [ ] Drop the "confirm the 4 merchant listings no longer show missing-image" follow-up as a _success_ metric — it
      measures GSC error count, not CTR. It will pass while the goal fails

### C3 — Orphaned `use-cases-expanded` sitemap is still live

**Files:** `app/sitemap-use-cases-expanded.xml/route.ts`, `lib/seo/localization-config.ts:45,262`,
`middleware.ts:509`

Only the _reference_ was removed from `app/sitemap.xml/route.ts`. The child sitemap route still exists and still
serves 10 URLs. `app/(pseo)/use-cases-expanded/` **does not exist**, so every one of those URLs 404s. If Google
previously discovered that child sitemap it will keep crawling it into 404s.

- [ ] Either delete the sitemap route + data file + the `localization-config.ts` and `middleware.ts` entries, or
      build the missing route. Currently half-done
- [ ] If deleting, update the deploy guard sitemap count again

### C4 — Locale sitemap gap on social-media-resize (pre-existing, not a regression)

**Files:** `lib/seo/locale-sitemap-handler.ts:61-68`, `app/sitemap-tools.xml/route.ts:60-65`

`buildToolsSitemapPages` only admits `additionalTools` whose slug is in `TOOLS_INTERACTIVE_PATHS` — 5 of the 10
pages in `social-media-resize.json`. Pinterest, TikTok, Discord, Reddit and Telegram appear in the English tools
sitemap but are absent from all 6 locale sitemaps.

- [ ] Decide whether these 5 should be localized; if yes, add them to `TOOLS_INTERACTIVE_PATHS`

---

## Measurement gaps

The baselines in `docs/SEO/reports/gsc-performance-diagnosis-2026-07-30.md` are genuinely strong (7/28/90-day GSC
windows, per-URL click deltas, mobile PageSpeed, 1,927-URL production crawl, dated readouts Aug 4/5/10/19). Two gaps
specific to CTR:

- [ ] **No CTR baseline captured for the GIF owner page.** Without splitting rank movement from CTR movement you
      cannot distinguish "consolidation restored rank" from "the honesty edit permanently killed the intent." Capture
      position + CTR separately before Aug 4
- [ ] **Nothing verifies a rich result ever renders** for the Product schema — only that the GSC error clears

Everything above is still **undeployed** as of this review; HEAD is the 07-30 batch.

---

## Suggestions — where CTR effort actually pays

1. **The 27-post backlog in `docs/SEO/ctr-improvement-plan.md`** (audited 2026-04-25) — posts where the SEO title is
   identical to the page title _and_ the description has no CTA. Evidence-backed, queued, untouched. The Jul 30
   diagnosis independently found **74 of 212 posts below their position-based CTR benchmark**. This is the CTR bet.
2. **`how to fix pixelated photos` — 78,120 impressions, 1 click, position 9.06.** Check the live SERP _before_
   rewriting. One click in 78k at position 9 is not a snippet problem; that pattern means Google is almost certainly
   satisfying the intent in-SERP (featured snippet / image pack), which no title rewrite fixes.
3. **`/blog/poster-size-dimensions-pixels` — 18,299 impressions, 0.25% CTR, position 6.63.** Better candidate than #2:
   position 6 with sub-1% CTR is a genuine snippet failure.
4. **Sequence the work.** Do not ship new snippet edits before the Aug 4/5/10 readouts land, or the Jul 20/22/27
   tests become unmeasurable. Queue the 27-post batch to start Aug 11.

---

## Unrelated cleanup done 2026-07-31

The 5s "Continue with the free plan?" confirmation gate was removed from `PurchaseModal` (P2 of
`docs/PRDs/done/free-tier-abuse-prevention.md`). It gated on a localStorage counter, so the session-resetting
abusers it targeted were unaffected while long-tenured free users were permanently penalized. `dismissCount`
analytics retained. Not an SEO change; noted here only because it shipped in the same window.
