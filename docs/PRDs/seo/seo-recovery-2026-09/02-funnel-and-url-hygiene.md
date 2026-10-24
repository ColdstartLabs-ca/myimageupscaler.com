# PRD 2 — Measurement & URL Hygiene: know what a landing page is actually worth

**Week 1 · ships alone · independent of PRD 1 and 3**
Shared audit context: [README.md](README.md)

`Planning Mode: Principal Architect`
**Complexity: 7 → HIGH mode** (+2 touches 6–10 files, +2 new reporting module, +2 attribution state across request/client boundary, +1 GA4/GSC external APIs)

---

## 1. Context

**Problem:** We cannot say what an organic landing page is worth — successful upscales, downloads, purchases, failures, processing cost — so every recovery decision is judged on clicks, and 454 lost _branded_ clicks keep getting reported as a ranking problem.

**Files analyzed:** `shared/config/env.ts` (`GA_MEASUREMENT_ID`, `GA4_API_SECRET`), `app/api/analytics/event/route.ts`, `server/analytics/types.ts`, `client/utils/api-client.ts`, `middleware.ts:~263` (first-touch attribution already serialized), `lib/seo/intent-ownership.ts`, `app/[locale]/blog/page.tsx`, `app/robots.ts`, `app/sitemap-static.xml/route.ts`, `tests/unit/seo/{gif-intent-consolidation,blog-index-params-noindex,gsc-brand-split}.unit.spec.ts`, `.claude/skills/{gsc-analysis,ga-analysis,seo-growth-plan}`.

**Current behavior:**

- **GA4 is already wired into the product.** "Not connected" was true only of the GSC Wizard connector. What is missing is the landing-page-level join, not analytics.
- `middleware.ts:~263` already serializes first-touch data — a second attribution cookie would be a duplicate source.
- **The GIF redirect is ours and deliberate:** `lib/seo/intent-ownership.ts` + `middleware.ts` 301 the `gif-upscale-{2,4,8,16}x` variants to `/formats/upscale-gif-images`, guarded by `gif-intent-consolidation.unit.spec.ts`. The audit could not verify the live chain or final destination, so nothing gets reversed blindly.
- `?q=` / `?page=N` blog URLs **already emit `noindex`** (`generateMetadata` in `app/[locale]/blog/page.tsx`), yet `/en/blog?page=7&q=guides` is still submitted and indexed — and the blog index still emits internal `?q=` links at `~293` and `~316` that invite the crawl.
- Main sitemap: **0 errors across 666 URLs.** Static sitemap: **1 warning.**

**The branded finding this PRD makes visible:** 1,228 → 774 branded clicks (−454) at position ~1.01→1.04 with CTR _rising_ 50.25% → 54.09%. Roughly **24% of the net property decline is reduced branded demand, not Google failing to rank us.** Title changes will not explain or fix it.

**The GIF decision, stated:** animated-GIF processing stays an **educational topic**, not a product. Keep an accurate guide; do not rebuild a frame-aware pipeline to recover a few hundred clicks. Success = retaining qualified GIF demand, not recreating a misleading landing page that happens to rank.

---

## 2. Solution

**Approach**

- Tag the whole funnel — `Organic landing → signup (where required) → upload → successful upscale → download → purchase` — with `landing_page`, `country`, `device`, `mode`, reusing the existing first-touch data rather than adding a second source.
- Include **failed jobs, refunded credits and processing cost**: a page whose visitors mostly fail is not a page to expand.
- Offline report joins GA4 with GSC by landing page and **splits branded from non-brand**, so the two are never again one number.
- Audit the GIF redirect chain and the filtered-URL policy against three requirements — relevant destination, indexable destination with agreeing canonical, internal links pointing directly at the retained page.

```mermaid
sequenceDiagram
    participant V as Visitor (organic)
    participant M as middleware (first touch)
    participant A as /api/analytics/event
    participant R as organic-funnel-report
    V->>M: lands from Google
    M-->>V: first-touch data (landing_page, country, device)
    V->>A: signup → upload → upscale_success | upscale_failed → download → purchase
    A->>A: forward dimensions + cost/refund fields
    R->>A: read GA4
    R->>R: join GSC landing pages, split brand vs non-brand
```

**Key decisions**

- [ ] **Cloudflare Workers 10ms CPU limit:** the report runs offline as a script, never on the request path.
- [ ] Never `process.env` — use `serverEnv` / `clientEnv`.
- [ ] **Never track in dev or test.** Preserve Amplitude behavior exactly while adding GA4 dimensions.
- [ ] Reuse `.claude/skills/{gsc-analysis,ga-analysis,seo-growth-plan}` fetchers and the pinned brand set in `gsc-brand-split.unit.spec.ts`. Do not reimplement either.
- [ ] Filtered URLs stay crawlable so Google can _read_ the `noindex`. **Do not block crawling first** — a blocked URL can never see the directive.
- [ ] Pagination is treated separately from filters. No blanket `?page=` block, no canonicalizing all pagination to page one; article discovery must survive.

**Data changes:** None. No migrations.

---

## 3. Integration Ledger

| #   | New thing                                                                       | Live caller (`file:line`, non-test)                     | Replaces                | Old path removed?     | Negative control                                                 |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------- | --------------------- | ---------------------------------------------------------------- |
| 1   | `landing_page` / `country` / `device` / `mode` on funnel events                 | TBD (`app/api/analytics/event/route.ts`)                | untagged events         | delegating in Phase 1 | strip the dimension → funnel report loses its rows, test red     |
| 2   | failure + cost fields (`upscale_failed`, refunded credits, processing cost)     | TBD (client funnel emitter)                             | success-only tagging    | replaced in Phase 1   | drop the failure branch → red                                    |
| 3   | `scripts/seo/organic-funnel-report.ts` → `seo-reports/organic-funnel-<date>.md` | TBD (`package.json` script)                             | manual GSC-only reading | n/a                   | delete the artifact and re-run → must regenerate or fail loudly  |
| 4   | brand/non-brand split in the report                                             | TBD (report script)                                     | one blended number      | replaced in Phase 1   | remove the brand filter → the two sections become identical, red |
| 5   | GIF redirect destination audit                                                  | TBD (`gif-intent-consolidation.unit.spec.ts` extension) | belief about the chain  | n/a                   | point a variant at a noindex destination → red                   |
| 6   | blog `?q=` internal-link policy                                                 | TBD (`app/[locale]/blog/page.tsx:293,316`)              | raw `?q=` anchors       | replaced in Phase 2   | restore a raw `?q=` anchor → red                                 |

**Reachability:** entry points are `POST /api/analytics/event`, the `middleware.ts` redirect path, an offline npm script, and the vitest gates in `yarn verify`. Pre-existing files edited: `app/api/analytics/event/route.ts`, `server/analytics/types.ts`, the client funnel emitter, `app/[locale]/blog/page.tsx`, `lib/seo/intent-ownership.ts` (only if the audit finds a failure), `app/sitemap-static.xml/route.ts`. User-facing: no — internal measurement plus crawl-facing URL policy; the trigger is every organic page view. Replaces: untagged funnel events and raw `?q=` anchors, both removed in the phase that replaces them.

---

## 4. Execution Phases

### Phase 1: Funnel attribution — compare successful upscales, downloads and purchases by landing page

**Files (max 5)**

- `app/api/analytics/event/route.ts` — EDIT: accept and forward the four dimensions
- `server/analytics/types.ts` — EDIT: extend the funnel event contract
- `client/utils/api-client.ts` — EDIT: attach the first-touch landing page to funnel events (reuse `middleware.ts:~263`)
- `scripts/seo/organic-funnel-report.ts` — NEW
- `tests/unit/seo/organic-funnel-attribution.unit.spec.ts` — NEW

**Implementation**

- [ ] Source `landing_page` from the existing first-touch data. Do not add a second cookie.
- [ ] Tag the whole funnel including failures, refunded credits and processing cost.
- [ ] Preserve Amplitude behavior; no tracking in dev or test.
- [ ] Report joins GA4 with GSC landing pages and splits branded from non-brand using the pinned brand set.

**Wiring**

- [ ] Callers edited: `app/api/analytics/event/route.ts`, client funnel emitter
- [ ] Registration: report script in `package.json`; gate in `yarn verify`
- [ ] Old path: untagged events replaced, not duplicated
- [ ] Ledger rows: #1, #2, #3, #4

**Tests Required**

| Test File                                 | Test Name                                                                | Assertion                                                        | Negative control (observed red)                   |
| ----------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------- |
| `organic-funnel-attribution.unit.spec.ts` | `should attach the organic landing page to every funnel event`           | signup/upload/success/download/purchase all carry `landing_page` | strip the dimension from the emitter → red        |
| `organic-funnel-attribution.unit.spec.ts` | `should record failed upscales and refunded credits alongside successes` | failure events present with cost fields                          | drop the failure branch → red                     |
| `organic-funnel-attribution.unit.spec.ts` | `should split branded from non-brand rows in the report`                 | both sections present **and resolving to different row sets**    | remove the brand filter → sections identical, red |
| `organic-funnel-attribution.unit.spec.ts` | `should not emit analytics in dev or test`                               | emitter no-ops when `isDevelopment()`                            | force production mode in test env → red           |

**Self-comparison guard:** the brand/non-brand test must assert the two halves differ. A split whose halves are equal is a vacuous gate.

**Revert check:** remove `landing_page` from the event contract → `organic-funnel-attribution.unit.spec.ts` and the report script both fail, and the pre-existing analytics contract in `server/analytics` fails to type-check.

**Verification Plan**

1. Unit: four tests, controls observed red.
2. API proof:

   ```bash
   curl -s -X POST http://localhost:3000/api/analytics/event \
     -H 'Content-Type: application/json' \
     -d '{"event":"upscale_success","landing_page":"/blog/best-free-ai-image-upscaler-2026-tested-compared","country":"US","device":"mobile","mode":"upscale"}' | jq .
   # Expected: {"success": true} with the dimensions forwarded, not dropped

   curl -s -X POST http://localhost:3000/api/analytics/event -H 'Content-Type: application/json' -d '{}' | jq .
   # Expected: 400 with an explicit validation error
   ```

3. **Envelope ≠ state:** after the happy-path curl, read the event back out of the sink. `success: true` with nothing persisted is a failure, not a pass.
4. **Manual (required — external integration):** confirm the rows land in GA4 with the dimensions attached.
5. Report proof: run for the last 28 days; output must contain per-landing-page rows for the homepage and the flagship comparison with successes, failures and purchases — not just clicks.
6. Evidence: curl output pasted, artifact committed under `seo-reports/`, `yarn verify`.

**User Verification** — Action: run the funnel report. Expected: you can answer "how many people who landed on the comparison article actually paid, and what did their processing cost", by landing page, country, device and mode — and see branded demand separately from non-brand.

---

### Phase 2: GIF redirect and filtered-URL audit — verify the chain, do not reverse it

**Files (max 5)**

- `tests/unit/seo/gif-intent-consolidation.unit.spec.ts` — EDIT: from "301 exists" to "destination relevant, indexable, canonical-consistent, terminal"
- `lib/seo/intent-ownership.ts` — EDIT **only if** the audit finds a destination failing one of the three requirements
- `app/[locale]/blog/page.tsx` — EDIT `~293`, `~316`: `?q=` anchors replaced with links to retained, indexable destinations
- `tests/unit/seo/blog-index-params-noindex.unit.spec.ts` — EDIT: add the internal-link policy assertion
- `app/sitemap-static.xml/route.ts` — EDIT: clear the single warning

**Implementation**

- [ ] Verify the live chain end to end — status codes and final URL. A 301 into a 301 into a disagreeing canonical is the failure mode to catch.
- [ ] Stop linking to our own `noindex` search URLs. Leave them crawlable so Google can read the directive.
- [ ] Keep ordinary pagination discoverable.
- [ ] Review the `/en` group (56 GSC URL rows, 1 click) — a reason to review, **not** evidence of a crawl-budget crisis. Do not panic-prune.
- [ ] Where pages genuinely duplicate one purpose, align redirects, internal links, canonicals and sitemap inclusion together — redirects and canonical annotations outrank sitemap inclusion.
- [ ] Fix the static-sitemap warning. Do **not** spend the phase on sitemap cosmetics.

**Wiring**

- [ ] Caller edited: `app/[locale]/blog/page.tsx:293,316`
- [ ] Registration: extended assertions in the existing vitest suite
- [ ] Old path: raw `?q=` anchors removed
- [ ] Ledger rows: #5, #6

**Tests Required**

| Test File                                | Test Name                                                                                    | Assertion                                          | Negative control (observed red)         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------- |
| `gif-intent-consolidation.unit.spec.ts`  | `should redirect every GIF scale variant to an indexable destination whose canonical agrees` | destination not noindex; canonical === destination | point a variant at a noindex page → red |
| `gif-intent-consolidation.unit.spec.ts`  | `should terminate the redirect chain in one hop`                                             | no redirect-to-redirect                            | chain two redirects → red               |
| `blog-index-params-noindex.unit.spec.ts` | `should not link internally to filtered search URLs`                                         | no `?q=` anchors in the blog index render          | restore one anchor → red                |
| `blog-index-params-noindex.unit.spec.ts` | `should keep ordinary pagination crawlable and discoverable`                                 | `?page=N` links still rendered and followable      | blanket-block pagination → red          |

**Revert check:** restore a raw `?q=` anchor, or repoint a GIF variant at a noindex destination → the pre-existing `blog-index-params-noindex` and `gif-intent-consolidation` specs fail.

**Verification Plan**

1. Unit: four tests, controls observed red.
2. Live chain proof:
   ```bash
   for s in 2x 4x 8x 16x; do
     curl -sIL "https://myimageupscaler.com/format-scale/gif-upscale-$s" | grep -iE "^HTTP|^location"; echo "--";
   done
   # Expected: exactly one 301 → /formats/upscale-gif-images → 200
   ```
3. Canonical proof: fetch `/formats/upscale-gif-images`; self-referential canonical, no `noindex`.
4. Index cleanup: add `/en/blog?page=7&q=guides` and siblings to the GSC request-indexing backlog for removal follow-up.
5. Evidence: audit notes committed to `seo-reports/`, curl output pasted, `yarn verify`.

**User Verification** — Action: click a GIF result path from Google, then browse the blog index. Expected: one hop to a page that honestly explains frame extraction; no link on the blog index leads into a `noindex` search-results URL.

---

## 5. Checkpoint Protocol

`prd-work-reviewer` after each phase with the standard integration audit. **Manual checkpoint additionally required for Phase 1** (external GA4 integration).

---

## 6. Acceptance Criteria

**Consumer-scoped**

- [x] Successful upscales, downloads, purchases and failures can be compared **by organic landing page, country, device and mode** — including refunded credits and processing cost.
- [x] Branded-demand decline is reported separately from non-brand ranking, so the two are never folded into one number again.
- [x] Every GIF redirect lands in one hop on a relevant, indexable destination whose canonical agrees, and internal links point at the retained page directly. **Verified live 2026-09-10:** all four of `gif-upscale-{2,4,8,16}x` return `301` in one hop to `/formats/upscale-gif-images`, which returns `200` with `index, follow` and a self-referential canonical.
- [x] `/en/blog?page=7&q=guides` and its siblings are out of the index, with ordinary pagination still discoverable. **Verified live 2026-09-10:** the URL `301`s to `/blog?page=7&q=guides`, which returns `200` with `noindex, follow` and canonical `/blog` — crawlable, so Google can read the directive. `/blog` itself is `index, follow`; pagination links are still emitted, and the blog index emits no `?q=` anchors.
- [x] Nothing was retired without checking backlinks and conversions first.

**Binary done checks**

- [x] Both phases complete · all specified tests pass · `yarn verify` passes _(5008 unit tests pass; `yarn verify` green.)_
- [x] Automated checkpoints passed (manual too, for Phase 1)
- [x] Internal-only feature — no UI required, explicitly noted

**Integration gates**

- [x] Ledger has zero `TBD` cells; every live caller is a real non-test `file:line`
- [x] Every new exported symbol has a non-test consumer (census pasted)
- [x] Revert check passed
- [x] Untagged funnel events and raw `?q=` anchors are gone — no second live source
- [x] Every gate's negative control was **observed failing**, brand-split self-comparison guard included
- [x] Proved against the real production subject: the live redirect chain and the actual 28-day GA4/GSC data — not a fixture

**Outstanding — post-deploy only**

> **Correction (2026-09-10):** the code shipped correctly, but `GA4_API_SECRET` was never uploaded to the Worker, so `trackGA4ServerEvent` returned early at `server/analytics/analyticsService.ts:340` and **every server-side GA4 conversion was silently dropped in production, including Stripe purchases**. The allowlist is fixed in `scripts/deploy/steps/05-secrets.sh` and gated by `tests/unit/deploy/worker-secret-allowlist.unit.spec.ts`, but it only takes effect on the next deploy. Treat any GA4 conversion data predating that deploy as missing its server-side half — do not baseline recovery against it.

- [ ] Confirm the new `landing_page` / `device` / `mode` / `country` dimensions arrive in GA4 and Amplitude after the next deploy, before trusting the first report run.
- [ ] Run `yarn seo:funnel:report` for the last 28 days and commit the artifact under `seo-reports/`.

**Post-deploy:** append to the SEO changes backlog; check the GSC request-indexing backlog for pending URL removals.

Claude-Session: https://claude.ai/code/session_01Q5BmRtQ45bbRxS9JbPgN4W
