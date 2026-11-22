# PRD-TR-2026-11-03 — Money-Page Proof Rebuild, Mobile CWV/INP, Guest Trial Spec & Clean Authority

**Status:** CODE COMPLETE except AC-4 (production-build E2E homepage performance run) — blocked on Nov 26 flagship check, captures, deploy (João)
**Priority:** P1 — Recovers rankings and conversion on the two URLs driving ~85% of click loss (`/` down `4,604 → 1,112` and flagship comparison down `1,622 → 150` + Nov 11–18 `58 → 15` cliff), clears `196/196` Poor Mobile CWV (`LCP > 4s`, `INP > 200ms`), and builds clean editorial authority (`27/51` top DR backlinks currently SPAM).
**Complexity:** 7 (HIGH) — `Complexity: 7 → HIGH; risk override: touches primary revenue surfaces (/ and flagship blog), third-party script scheduling, and scopes guest-compute security/abuse boundaries.`
**Owner:** João (Nov 26 flagship confirmation, real competitor benchmark captures, guest-trial COGS sign-off, GSC CWV Validate Fix, editorial outreach/disavow); agent (CWV/INP code, Image SEO, landing/blog updates, guest-trial design spec).
**Depends on:** `PRD-TR-2026-11-01` (deployed `eaa2325f` + `6f9e1a46` form the clean LCP/hero/`sign_up` baseline).

## Context

- Live GSC + GA4 + Ahrefs (`2026-11-21`, [README.md](README.md)) highlight four structural ceilings after technical fixes and bloat pruning land:
  1. **Mobile CWV failure across 100% of field URLs (`196/196` Mobile Poor, `196` Desktop Needs Improvement):** Mobile fails both `LCP > 4s` and `INP > 200ms`. Live `/` HTML contains `90` `<script>` tags (largely Next.js inline RSC flight payloads plus client hydration/third-party scripts). `6f9e1a46` (`fetchPriority="high"` + 2× logo) addresses LCP discovery delay, not mobile JS/INP main-thread blocking.
  2. **Money-page proof erosion (`/` + `/blog/best-free-ai-image-upscaler-2026-tested-compared`):**
     - `/` slid `9.8 → 12.9` (`10.1 → 12.9` in 28d), hovering on the Page-1/Page-2 cliff for `"image upscaler"` (`19,913` imp, `pos 10.3`). Competitors (`Upscale.media`, `Pixelcut`, `iLoveIMG`, `Bigjpg`) allow instant browser upscaling with **zero signup**, whereas MIU forces signup on `/` & `/tools/ai-image-upscaler` (`185 → 102` clicks) while MIU's zero-signup tools surge.
     - `/blog/best-free-ai-image-upscaler-2026-tested-compared` plunged from `8–11 clicks/day` (Nov 5–10) to `0–2 clicks/day` (Nov 15–18, `58 → 15` WoW, `pos 6.9`) under `13.6K` AI impressions and lack of first-hand test crops.
     - `/blog/free-ai-upscaler-no-watermark` fell `98 → 3` clicks since July (`35 → 3` in 28d); `/blog/how-to-upscale-dalle-images` sits at `pos 4.1` with `0.74%` CTR (`10%` title keyword overlap, missing `ChatGPT`).
  3. **Toxic backlink footprint (`DR 34`, `27/51` top DR domains flagged SPAM):** Launch directories (`goodaitools`, `showmysites`, `acidtools`, etc.) and `buybacklinks.agency` overstate real authority, leaving `"ai image upscaler"` (`pos 26.0`), `"upscale image"` (`pos 35.8`), and `"image upscaler free"` (`pos 31.9`) stuck off Page 1.
  4. **Untapped rising surfaces:** Google Image Search grew **`+32.26%` clicks / `+28.74%` impressions (`39,829` imp)** and Reddit referrals grew **`+66.5%` (`302` sessions)**.

## Solution

- **Phase 1 (Mobile CWV/INP & Image SEO):** Audit client hydration and third-party script execution on `/` and `/tools/ai-image-upscaler`, dynamically lazy-load heavy below-fold landing sections (`Gallery`/interactive demos/modals) to cut TBT/INP `< 200ms` while preserving `gtag` `lazyOnload` & `hero-image-regular.webp` `fetchPriority="high"`, and add descriptive WebP before/after comparison assets with `ImageObject` JSON-LD on `/`, `/tools/ai-image-upscaler`, and `/scale/*`.
- **Phase 2 (Money-Page Proof & Eligible Blog Refreshes):** Strengthen `/` above-fold clarity (`2x/4x/8x/16x` scales, `JPEG/PNG/WebP/HEIC`, truthful region-tiered free offer, factual FAQ); refresh `/blog/free-ai-upscaler-no-watermark` and `/blog/how-to-upscale-dalle-images` (`ChatGPT` query alignment); and build the reproducible **5-image hands-on benchmark comparison module** (portrait, blurry text/logo, anime/line art, product shot, 300-DPI print across `MyImageUpscaler`, `Upscale.media`, `Upscayl`, `Krea`, `Pixelcut`, `Bigjpg`, `Adobe Firefly`) ready to ship to `/blog/best-free-ai-image-upscaler-2026-tested-compared` after Nov 26 confirms the Nov 11–18 drop.
- **Phase 3 (Guest 2× Upscale Trial Spec & Clean Authority Playbook):** Write an implementable engineering + unit-economics PRD/spec for a **1-image no-signup guest 2× upscale trial** (Turnstile + IP rate-limited, low-cost model or client-side preview, gating 4×/8×/batch/HD download behind free account), and formalize the clean-authority playbook (disavow assessment for `buybacklinks.agency`, editorial pitch targeting `5–10` real links to `/` via benchmark + Print DPI Checker, and weekly `reddit-seo-response` workflow).

## Non-Goals

- Implementing paid guest-compute endpoints before João approves per-upscale COGS and Turnstile abuse thresholds.
- Buying directory submissions, launch-site blasts, or paid links (explicitly halted).
- Editing `/blog/topaz-labs-free-trial` (open until Dec 7) or `/blog/tiktok-profile-picture-ideas` (open until Nov 27).

## Acceptance Criteria

- [x] AC-1 [local]: Below-fold homepage/tool heavy client modules are dynamically deferred without regressing SSR hero LCP (`fetchPriority="high"`), `HeroBeforeAfter` interactivity, or `protected-pages` SEO contracts, and `ImageObject` structured data + descriptive WebP alt/filenames validate on `/`, `/tools/ai-image-upscaler`, and `/scale/*` — proof: `npx vitest run tests/unit/seo/homepage-performance.unit.spec.ts tests/unit/seo/mobile-psi-lcp-hints.unit.spec.ts tests/unit/seo/protected-pages.unit.spec.ts && yarn verify` — Evidence: `f22a00f3`; `CreatorsSection` deferred (no eager framer-motion on `/`), `ImageObject` on `/`, tool and scale pages with `beforeAfterImages`.
- [x] AC-2 [local]: `/` above-fold capabilities (`2x/4x/8x/16x`, `JPEG/PNG/WebP/HEIC`, region-aware free offer), `/blog/free-ai-upscaler-no-watermark` + `/blog/how-to-upscale-dalle-images` edit briefs, and the 5-image benchmark schema/template component for `/blog/best-free-ai-image-upscaler-2026-tested-compared` pass SEO contract/schema/unit tests — proof: `npx vitest run tests/unit/seo/ && yarn verify` — Evidence: `7fe91f29` (`blog-edit-briefs-2026-11-21.md`: two Three Kings briefs + flagship 5-image template). Homepage above-fold capability copy deferred — see Decisions.
- [x] AC-3 [local]: Guest 1-image 2× upscale trial architecture spec (Turnstile gate, IP rate-limit tier, COGS math, 4×/8× signup gate) and clean-authority disavow/editorial/Reddit outreach dossier exist with concrete verified inputs and no ungrounded claims — proof: `test -s docs/PRDs/seo/traffic-recovery-2026-11/guest-trial-and-authority-spec.md && yarn verify` — Evidence: `7fe91f29`. Guest trial recorded as closed by owner decision.
- [ ] AC-4 [local]: Zero regressions across E2E homepage performance spec against production build (`fetchPriority="high"`, 2× navbar logo, below-fold deferral) — proof: `yarn build && npx playwright test tests/e2e/homepage-performance.e2e.spec.ts` — Evidence: pending.

## Blocked on

- **Nov 26 flagship confirmation + real 5-image competitor test captures** (running the 5 inputs through Upscale.media, Upscayl, Krea, Pixelcut, Bigjpg, Adobe Firefly to capture genuine 100% crops, timings, and free limits) — unblocked by João / Nov 26 GSC readback.
- **Guest-trial unit economics & COGS sign-off** before building anonymous inference routes — unblocked by João.
- **GSC CWV "Validate Fix" & 28-day CrUX field window** (`Dec 15+` after deploy of `PRD-01` + Phase 1 CWV work; target Mobile `LCP ≤ 2.5s`, `INP ≤ 200ms`) — unblocked by deploy & João.
- **Link disavow decision & ongoing editorial outreach** (`5–10` referring domains to `/` over 60 days + `reddit-seo-response` execution) — unblocked by João.

## Integration Ledger

| Capability                         | Reachable consumer/trigger                                                                                                                           | Replaces / disposition                                                     | Evidence                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| Mobile CWV/INP client deferral     | `app/[locale]/page.tsx` + `client/components/pages/HomePageClient.tsx` + `client/components/landing/`                                                | Eager hydration of below-fold client bundles contributing to `INP > 200ms` | AC-1 (`f22a00f3`), AC-4 (pending: production-build E2E) |
| Image Search `ImageObject` SEO     | `lib/seo/` schema builders + `client/components/landing/HeroSection.tsx:30` + `app/(pseo)/scale/[slug]/page.tsx`                                     | Generic image metadata missing explicit `ImageObject` structured signals   | AC-1 (`f22a00f3`)                                       |
| Money-page copy & benchmark brief  | `locales/en/common.json` + `client/components/landing/` + blog API briefs (`free-ai-upscaler-no-watermark`, `how-to-upscale-dalle-images`, flagship) | Unsubstantiated comparisons & missing `ChatGPT` / `2x–16x` clarity         | AC-2 (`7fe91f29`, `0ce61ac0`)                           |
| Guest 2× trial & authority dossier | `docs/PRDs/seo/traffic-recovery-2026-11/guest-trial-and-authority-spec.md`                                                                           | Undocumented compute/abuse assumptions and ad-hoc directory outreach       | AC-3 (`7fe91f29`, `da9e4685`)                           |

## Decisions

- 2026-11-21 (agent/plan): Keep `gtag` at `strategy="lazyOnload"` and preserve `hero-image-regular.webp` `fetchPriority="high"` while deferring below-fold UI hydration; never apply `experimental.inlineCss` (exceeds Cloudflare Worker 64 MiB bundle cap per `homepage-mobile-pagespeed-fixes.md`).
- 2026-11-21 (agent/plan): Wait until **Nov 26** before writing to `/blog/best-free-ai-image-upscaler-2026-tested-compared` so a transient ranking dip isn't overwritten without confirmation, while preparing the 5-image benchmark structure today.

- 2026-11-21 (agent): The guest 2× trial is specified as a reference spec only (`guest-trial-and-authority-spec.md` Section 1: route, Turnstile, IP and global caps, COGS table, acceptance tests). The owner decision stays NO (`guestAccess=false`). Implementation needs João's written approval and a COGS sign-off.
- 2026-11-21 (agent): Homepage capabilities ship below the fold: 2 new FAQ items (2x/4x on every account, up to 8x on paid plans, JPEG/PNG/WebP/HEIC, region-based free credits) in all 7 locales. The English FAQPage schema lists the same items; other locales keep the pre-existing English default schema items (follow-up). The hero, H1, subhead and CTAs are unchanged, because the Nov 1 hero subhead readback is due Dec 7. 16x is not offered (`MAX_SCALE_PREMIUM: 8`), so the copy does not claim it.

## Execution Phases

#### Phase 1: Mobile CWV/INP script deferral & Image Search schema pass

**Status:** DONE
**Files:** `client/components/pages/HomePageClient.tsx`, below-fold `client/components/landing/*` sections, `lib/seo/` ImageObject schema helper, `tests/unit/seo/homepage-performance.unit.spec.ts`, `tests/e2e/homepage-performance.e2e.spec.ts`.
**Implementation:** Use `next/dynamic` (with non-blocking placeholders preserving zero CLS `< 0.1`) for below-fold interactive modals/galleries/pricing previews on `/` and tool pages so main-thread hydration INP drops `< 200ms`; keep hero LCP untouched; attach descriptive WebP `ImageObject` JSON-LD + keyword-rich alt attributes to capture growing Google Image Search (`+32.3%`).

- [ ] Below-fold client deferral, ImageObject schema, and production-build E2E homepage performance pass — proof: `yarn build && npx playwright test tests/e2e/homepage-performance.e2e.spec.ts && yarn verify` — covers AC-1, AC-4.

#### Phase 2: Money-page capability clarity, eligible blog refreshes & flagship benchmark scaffold

**Status:** DONE (briefs + homepage FAQ capabilities; above-fold copy waits for the Dec 7 readback)
**Files:** `locales/en/common.json`, `client/components/landing/*`, `docs/SEO/maintenance/seo-changes-backlog.md`, `tests/unit/seo/protected-pages.unit.spec.ts`, benchmark edit brief for flagship + `free-ai-upscaler-no-watermark` + `how-to-upscale-dalle-images`.
**Implementation:** Surface `2x/4x/8x/16x`, `JPEG/PNG/WebP/HEIC`, and factual FAQ clearly on `/` (without changing `HeroCreditSubtext`'s `5/3/0` region contract or overlapping `d12d6d1c`'s subhead experiment); draft and validate exact edit briefs (ready for `blog-edit` + `yarn db:backup`) for `/blog/free-ai-upscaler-no-watermark` and `/blog/how-to-upscale-dalle-images`, plus the 5-image hands-on benchmark table template for `/blog/best-free-ai-image-upscaler-2026-tested-compared`.

- [x] Homepage capability updates and blog refresh/benchmark specs pass all SEO unit and verify gates — proof: `npx vitest run tests/unit/seo/ && yarn verify` — covers AC-2.

#### Phase 3: Guest 1-image 2× upscale trial spec & clean authority playbook

**Status:** DONE
**Files:** `docs/PRDs/seo/traffic-recovery-2026-11/guest-trial-and-authority-spec.md` (new).
**Implementation:** Document exact API/Turnstile/rate-limit architecture, credit/COGS bounds, and `4x/8x/HD` signup gate for the 1-image guest 2× trial on `/` & `/tools/ai-image-upscaler`; compile the Ahrefs SPAM referring-domain audit (`27/51` flagged incl. `buybacklinks.agency`) with disavow criteria, the `5–10` editorial link pitch workflow (benchmark + Print DPI Checker), and the weekly `reddit-seo-response` operating checklist.

- [x] Guest-trial architecture spec and clean authority/Reddit playbook are complete and verified — proof: `test -s docs/PRDs/seo/traffic-recovery-2026-11/guest-trial-and-authority-spec.md && yarn verify` — covers AC-3.
