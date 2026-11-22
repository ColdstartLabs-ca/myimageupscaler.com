# PRD-TR-2026-11-01 — Ship Unmerged Recovery Fixes, High-CTR Tool/Alternative Snippets, GEO & Interactive Tool Upsell

**Status:** CODE COMPLETE — blocked on deploy and GA4 Admin (João)
**Progress:** Phases 1–3 DONE locally (`eaa2325f`, `92988632`, `0868a6a5`, `9cf5977f`; PR #135). Remaining items are in "Blocked on".
**Priority:** P0 — Unblocks organic `sign_up` attribution (currently `0` in GA4), homepage `"AI image upscaler"` hero recovery (`pos 10.3`, `19,913` imp), `1.50s` stale pSEO TTFB (`/tools/ai-image-upscaler`), and monetization of `235+/mo` engaged zero-signup interactive-tool sessions.
**Complexity:** 6 (MEDIUM) — `Complexity: 6 → MEDIUM; risk override: none` (`11+` files across Phase 1+2+3 = `+3`, client-to-workspace handoff/funnel state = `+2`, external GA4 Measurement Protocol attribution = `+1`).
**Owner:** João (production deploy, GA4 Admin referral exclusions & bot filter, manual GSC indexing); agent (Phases 1–3 code, metadata, tests, `yarn verify`).
**Depends on:** None

## Context

- Live GSC + GA4 evidence (`2026-11-21`, [README.md](README.md)) shows three immediate leaks solvable without creating new pages:
  1. **Tested fixes were stranded in git:** `release/miu-recovery-20261101` held `d12d6d1c` (King-3 `"AI image upscaler"` homepage hero copy), `d2499483`..`c5fda657` (`sign_up` / `signup_completed` attribution + `sanitizeGa4Params` null-stripping + auth race fixes), `1df70e5a` (`revalidate = false` on 29 static pSEO/homepage routes + `defaultLongLivedTtlSec: 2592000` + `public/_headers`), and `a751c309` (E2E HTTP hub check). Live `/` still serves `"AI photo enhancer that"`, lacks `6f9e1a46` (`fetchPriority="high"`), and `/tools/ai-image-upscaler` hits `1.50s` TTFB while `/tools/make-image-transparent` returns `x-opennext-cache: STALE`.
  2. **Surging zero-signup tools & alternatives lose clicks to broken snippets and outdated GEO:** `/tools/` is the **only major growing section (`+13.54%` clicks)** and `/alternatives/` grew **`+77.7%` impressions** at pos `8.09`, yet:
     - `/alternatives/vs-iloveimg` (`856` imp, `0.70%` CTR, pos `9.2`) serves broken English `<title>`: `"MyImageUpscaler vs iLoveIMG - Better & Specialization"` ([app/seo/data/alternatives.json](../../../app/seo/data/alternatives.json#L1309-L1314)).
     - `/alternatives/vs-adobe-express` (`1,114` imp, `0.36%` CTR, pos `9.0`) lacks an immediate above-fold limits comparison summary ([app/seo/data/alternatives.json](../../../app/seo/data/alternatives.json#L1725)).
     - `/tools/make-image-transparent` (`11.3K` imp, `0.88%` CTR, pos `9.1`), `/tools/image-cutout-tool` (`1,405` imp, `0.85%` CTR, pos `5.3`), and `/tools/remove-bg` (`+589%` GA sessions on real queries; ignore the Nov 16–18 `13,530`-impression phantom spike) under-promise `"No signup, No watermark, Browser-processed"` in SERP snippets and FAQs ([app/seo/data/interactive-tools.json](../../../app/seo/data/interactive-tools.json#L1951), [app/seo/data/tools.json](../../../app/seo/data/tools.json#L554)).
     - [app/llms.txt/route.ts](../../../app/llms.txt/route.ts) still states `"up to 4x resolution"` (actual max is `8x`/`16x`), omits all zero-signup tools, and hardcodes `?utm_source=chatgpt` on every URL (misattributing Gemini/Perplexity/Claude; Ahrefs AI mentions fell `-145` to `1.2K`).
  3. **235+/mo engaged interactive-tool sessions leak into 11 key events & `purchase` is 100% `Unassigned`:**
     - Using true `landingPagePlusQueryString` in GA4: `/tools/make-image-transparent` (`84` sess, `83.3%` eng → `6` keyEv), `/tools/remove-bg` (`62` sess, `83.9%` eng → `2`), `/tools/image-cutout-tool` (`50` sess, `80.0%` eng → `2`), `/tools/remove-gps-from-photo` (`39` sess, `89.7%` eng → `1`). [InteractiveTool.tsx](<../../../app/(pseo)/_components/tools/InteractiveTool.tsx#L191-L200>) emits **zero** analytics events and shows **no** upsell next to `"Download Result"`. [InteractiveToolPageTemplate.tsx](<../../../app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate.tsx#L112-L133>)'s static `PostToolCTA` sits disconnected below the widget linking cold to `/?signup=1`.
     - Server-side `trackGA4ServerEvent` ([server/analytics/analyticsService.ts](../../../server/analytics/analyticsService.ts#L332-L374)) still lands **19/19 `purchase`** and **3,695/3,697 `generate_lead`** in `Unassigned` (`Nov 14–20` also shows `accounts.google.com / referral` `85` sess & `checkout.stripe.com / referral` `11` sess).

## Solution

- **Phase 1 (Complete):** Squashed `release/miu-recovery-20261101` onto `master` (`eaa2325f`), reconciling `1df70e5a` cleanly with Nov 13/16 cache & LCP commits (`open-next.config.ts`, `HeroSection.tsx`, `BlogFeaturedImage.tsx`, `NavBar.tsx`).
- **Phase 2:** Rewrite metadata, above-fold comparison tables, and FAQs on `vs-iloveimg`, `vs-adobe-express`, `make-image-transparent`, `image-cutout-tool`, and `remove-bg` (never citing the Nov 16–18 phantom `remove background` spike or adding new pSEO pages), and update [app/llms.txt/route.ts](../../../app/llms.txt/route.ts) to `8x/16x` + free tools + clean UTM/AI-Mode capability summaries.
- **Phase 3:** Add an inline post-download `"Upscale This Image 4× with AI →"` CTA in `InteractiveTool.tsx` (handing off the `processedBlob` via `sessionStorage`/`IndexedDB` into the workspace upload flow so users don't re-pick their file) + sanitized `interactive_tool_processed`, `interactive_tool_downloaded`, and `post_tool_upsell_clicked` telemetry, AND preserve original GA4 `client_id`/`session_id` across Stripe checkout/webhook server events (`trackGA4ServerEvent` / checkout metadata).

## Non-Goals

- Creating new head-term or tool pSEO pages (existing `/` and `/tools/*` URLs already rank; adding URLs triggers `indexation-gate` and bloat).
- Editing protected Three Kings pages (`/blog/tiktok-profile-picture-ideas` until Nov 27; `/blog/topaz-labs-free-trial` until Dec 7; `/blog/poster-size-dimensions-pixels` exhausted).
- Deleting local historical git branches (`seo/lock-activation-20261101`, etc.) or mutating production DB/deploying without João's sign-off.

## Acceptance Criteria

- [x] AC-1 [local]: `release/miu-recovery-20261101` attribution (`sign_up`), King-3 homepage subhead, static `revalidate = false` + `defaultLongLivedTtlSec: 2592000`, `public/_headers`, and E2E hub fix are squashed cleanly onto `master` alongside Nov 13/16 work without regressions — proof: `npx vitest run tests/unit/analytics/analytics-provider-signup.unit.spec.tsx tests/unit/analytics/signup-conversion.unit.spec.ts tests/unit/analytics/signup-identity-race.unit.spec.ts tests/unit/anti-freeloader/users-setup.unit.spec.ts tests/unit/client/utils/account-setup.unit.spec.ts tests/unit/seo/protected-pages.unit.spec.ts tests/unit/seo/blog-core-web-vitals.unit.spec.ts tests/unit/seo/force-static-config.unit.spec.ts tests/unit/seo/homepage-performance.unit.spec.ts tests/unit/seo/opennext-cache-config.unit.spec.ts tests/unit/seo/mobile-psi-lcp-hints.unit.spec.ts && yarn verify` — Evidence: `11/11` files (`187/187` tests) passed, `yarn verify` passed (0 errors), committed as `eaa2325f` on `master`.
- [x] AC-2 [local]: `/alternatives/vs-iloveimg`, `/alternatives/vs-adobe-express`, `/tools/make-image-transparent`, `/tools/image-cutout-tool`, `/tools/remove-bg`, and `/llms.txt` expose corrected SERP titles (`≤60` chars, no `"Better & Specialization"`), intent-matched meta/FAQs, and accurate `8x/16x` + free-tool capability copy without adding new pSEO slugs — proof: `npx vitest run tests/unit/seo/ && yarn verify` — Evidence: `92988632`; `tests/unit/seo/` 1,663/1,663 at commit time. Max scale is `8x` (`MAX_SCALE_PREMIUM`), not `16x`.
- [x] AC-3 [local]: Downloading/processing an image in `InteractiveTool.tsx` renders an inline `"Upscale This Image 4× with AI →"` CTA that hands off the processed image to the workspace, and emits `interactive_tool_processed`, `interactive_tool_downloaded`, and `post_tool_upsell_clicked` through `analytics.track` — proof: `npx vitest run tests/unit/seo/interactive-tool-upsell.unit.spec.tsx` — Evidence: `9cf5977f`; 6/6 pass, red first. Free users can pick 4× (`quick` tier scales `[2, 4]`).
- [x] AC-4 [local]: Server-side GA4 `purchase` and `upscale_completed` (`generate_lead`) Measurement Protocol payloads carry the originating browser GA4 `client_id` / `session_id` captured at checkout/session start instead of falling back to `server-${Date.now()}` when browser context exists — proof: `npx vitest run tests/unit/analytics/ga4-cookie-context.unit.spec.ts tests/unit/analyticsService.unit.spec.ts` — Evidence: `0868a6a5`; 134/134 related tests pass. Server reads the first-party `_ga` / `_ga_<stream>` cookies; no client change.

## Blocked on

- **Production deploy (`yarn deploy`)** to ship `eaa2325f`, `6f9e1a46`, and Phases 2–3 live — unblocked by João.
- **GA4 Admin configuration:** Add `accounts.google.com`, `accounts.google.com.*`, and `checkout.stripe.com` under _Admin → Data Streams → List unwanted referrals_, plus filter Singapore/China bot traffic in reporting views — unblocked by João.
- **Manual GSC Request indexing** for `/` (post-deploy) and `/blog/topaz-labs-free-trial` (post-Nov-23 crawl check) — unblocked by João.
- **Post-deploy live checks:** Run `node scripts/perf/psi-profile.mjs https://myimageupscaler.com/` (`LCP ≤ 2.5s`), confirm GA4 `sign_up` & `Unassigned` purchase drop within 48h, and evaluate 14–21d GSC readbacks (`Dec 7–22`: `/` `image upscaler < 9.2`, `/tools/make-image-transparent` `0.88% → ≥2.5%`, `vs-iloveimg` `0.70% → ≥3.0%`, post-tool upsell CTR `≥8–12%`) — unblocked by João & GSC/GA4 lag.

## Integration Ledger

| Capability                             | Reachable consumer/trigger                                                                                                                                                | Replaces / disposition                                                                             | Evidence          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------- |
| Organic `sign_up` & King-3 hero        | `app/api/users/setup/route.ts:87` → `client/utils/account-setup.ts` → `client/analytics/signup-conversion.ts:86` → `client/components/analytics/AnalyticsProvider.tsx:29` | Missing browser `sign_up`, null-dropped GA4 params, `"AI photo enhancer"` hero copy                | AC-1 (`eaa2325f`) |
| Static pSEO & immutable assets         | `app/[locale]/page.tsx`, `app/(pseo)/**`, `open-next.config.ts:25`, `public/_headers`                                                                                     | `revalidate = 86400` causing `1.50s` TTFB / `STALE` pSEO hits                                      | AC-1 (`eaa2325f`) |
| Tool/Alternative snippets & `llms.txt` | `app/(pseo)/alternatives/[slug]/page.tsx`, `app/(pseo)/tools/[slug]/page.tsx`, `app/llms.txt/route.ts`                                                                    | Broken `vs-iloveimg` title, generic tool snippets, outdated `4x` + hardcoded `?utm_source=chatgpt` | AC-2 (`92988632`) |
| Post-download 4× upsell & telemetry    | `app/(pseo)/_components/tools/InteractiveTool.tsx:191` → handoff storage → workspace upload                                                                               | Disconnected `PostToolCTA` (`InteractiveToolPageTemplate.tsx:112`) with zero tool telemetry        | AC-3 (`9cf5977f`) |
| GA4 MP session stitching               | `app/api/checkout/route` + `server/analytics/analyticsService.ts:332`                                                                                                     | Synthetic `server-${Date.now()}` client ID causing `19/19` `Unassigned` purchases                  | AC-4 (`0868a6a5`) |

## Decisions

- 2026-11-21 (agent/plan): Squashed `release/miu-recovery-20261101` onto `master` while preserving Nov 13 `open-next.config.ts` (`bypassTagCacheOnCacheHit`, `cachePurge`, `nonBlockingDoQueue`) and Nov 16 `6f9e1a46` (`fetchPriority="high"`, 2× logo), and excluded `seo/lock-activation-20261101` (which deletes 10 active SEO specs).
- 2026-11-21 (agent/plan): Excluded `remove background` Nov 16–18 (`13,530 imp / 8 clicks`) from growth forecasts as a phantom spike; `/tools/remove-bg` edits target verified human queries (`background remover`, `background remover free`).

- 2026-11-21 (agent): GA4 `session_id` rides only on near-time events (checkout purchase, subscription created, upscale). Renewals, plan changes and cancellations send `client_id` only, so late events do not graft onto a dead session.
- 2026-11-21 (agent): `vs-adobe-express` keeps its primary keyword and states limits without third-party prices.

## Execution Phases

#### Phase 1: Squash `release/miu-recovery-20261101` onto `master`

**Status:** DONE
**Files:** 52 files in commit `eaa2325f` (`app/api/users/setup/route.ts`, `client/analytics/signup-conversion.ts`, `client/components/analytics/AnalyticsProvider.tsx`, `client/utils/account-setup.ts`, `locales/en/common.json`, `shared/analytics/types.ts`, 29 static `app/(pseo)/**` & `app/[locale]/page.tsx` routes, `app/[locale]/blog/[slug]/page.tsx`, `open-next.config.ts`, `public/_headers`, `docs/SEO/maintenance/seo-changes-backlog.md`, and unit/E2E specs).
**Implementation:** Checked out non-conflicting recovery commits (`c5fda657`, `1df70e5a`, `a751c309`), merged `revalidate = 604800` + `defaultLongLivedTtlSec: 2592000` cleanly atop Nov 13/16 cache/LCP code, recorded backlog entry, verified `187/187` unit tests + `yarn verify`, committed `eaa2325f`.

- [x] Squashed recovery fixes pass targeted unit suites and repository verify gate on `master` (`eaa2325f`) — proof: `npx vitest run ... && yarn verify` (`11/11` files, `187/187` tests passed; `yarn verify` exit 0) — covers AC-1.

#### Phase 2: Fix high-CTR alternative/tool snippets and `app/llms.txt/route.ts`

**Status:** DONE
**Files:** `app/seo/data/alternatives.json` (`vs-iloveimg`, `vs-adobe-express`), `app/seo/data/interactive-tools.json` (`make-image-transparent`), `app/seo/data/tools.json` (`remove-bg`, `image-cutout-tool`), `app/llms.txt/route.ts`, `tests/unit/seo/tools-metadata.unit.spec.ts`, `tests/unit/seo/llms-txt.unit.spec.ts`, `docs/SEO/maintenance/seo-changes-backlog.md`.
**Implementation:** Update existing slug metadata/FAQs/above-fold comparison tables (keeping exact slug count unchanged so `seo:indexation:gate` stays green); replace `4x` with `8x/16x`, add free interactive tools, remove forced `?utm_source=chatgpt`, and add plain capability summaries in `app/llms.txt/route.ts` for AI Mode citations.

- [x] Updated `alternatives`/`tools` metadata and `llms.txt` pass all SEO metadata/schema/indexation gates without adding new URLs — proof: `npx vitest run tests/unit/seo/ && yarn verify` — covers AC-2.

#### Phase 3: Wire `InteractiveTool.tsx` post-download 4× AI Upscaler funnel & GA4 session stitching

**Status:** DONE
**Files:** `app/(pseo)/_components/tools/InteractiveTool.tsx`, workspace handoff helper (`client/utils/` or workspace mount hook), `shared/analytics/types.ts`, `server/analytics/analyticsService.ts`, checkout metadata caller, `tests/unit/seo/interactive-tool-upsell.unit.spec.tsx`, `tests/unit/server/analytics/`.
**Implementation:** Add inline `"Upscale This Image 4× with AI →"` CTA beside `"Download Result"` in `InteractiveTool.tsx` storing `processedBlob` metadata for one-click preload in workspace, emit `interactive_tool_processed`, `interactive_tool_downloaded`, `post_tool_upsell_clicked` (using `sanitizeGa4Params` so no `source`/`medium` override occurs), and persist GA4 `client_id` / `session_id` through checkout so server-side `purchase` and `upscale_completed` events attribute back to Organic Search.

- [x] Post-download upsell handoff, interactive tool events, and server-side GA4 client/session stitching pass unit and verify checks — proof: `npx vitest run tests/unit/seo/interactive-tool-upsell.unit.spec.tsx tests/unit/server/analytics/ && yarn verify` — covers AC-3, AC-4.
