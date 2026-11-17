# PRD — Homepage mobile PageSpeed fixes

**Status:** IN PROGRESS — local work complete (`yarn verify` green, committed); AC-5 is post-deploy
**Progress:** Phases 1–2 DONE, verified on the dev server and in the production build (`yarn build`). Remaining: deploy + AC-5 (João).
**Priority:** P1 — AC-1 removes a 2.4 s LCP load delay on the homepage, the page with the most organic traffic.
**Complexity:** 1 (LOW)
**Owner:** João (deploy and AC-5); any model for Phases 1–2
**Depends on:** None

## Context

PSI mobile run on 2026-11-16 for `https://myimageupscaler.com/` (report `pd3y80nm01`, re-run through the API with `PAGESPEED_API_KEY`):

| Metric                               | Value                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| Performance                          | 84                                                                                    |
| LCP                                  | 3.8 s (TTFB 7 ms, **resource load delay 2,403 ms**, load 133 ms, render delay 269 ms) |
| FCP / SI / TBT / CLS                 | 1.2 s / 4.9 s / 150 ms / 0.018                                                        |
| Accessibility / Best Practices / SEO | 100 / 96 / 100                                                                        |

Failing audits and their root causes (verified in code and in the live HTML):

1. **`lcp-discovery-insight`: "fetchpriority=high should be applied".** The LCP element is the hero "after" image in `client/components/landing/HeroSection.tsx:29`. It uses `priority`. In **Next 16.0.11**, `priority` only adds a `<link rel="preload">`. It does **not** set `fetchpriority="high"` (see `node_modules/next/dist/shared/lib/get-img-props.js:548` — `fetchPriority` passes through only when you set it). The live `<img>` and its preload link have no `fetchpriority`. So the image loads at Low priority behind CSS, fonts and scripts. This is the 2.4 s load delay.
   - The same Next 16 change affects `client/components/blog/BlogFeaturedImage.tsx:36` (the blog-post LCP image).
2. **`image-size-responsive` (the Best Practices 96).** The mobile navbar logo in `client/components/navigation/NavBar.tsx:80-83` uses `getCdnImageUrl('/logo/horizontal-logo-compact.png', 100)`. It displays at 91×32 CSS px. At the PSI device DPR of 1.75 it needs about 160 px. The source PNG is 306×109, so a 2x variant is available.
3. **`legacy-javascript-insight` (30 KiB).** Chunk `3794-*.js` contains `@babel/plugin-transform-classes`, `transform-spread` and polyfills for `Array.prototype.at/flat/flatMap`, `Object.fromEntries`, `Object.hasOwn`, `String.prototype.trimStart/trimEnd`. `package.json` `browserslist` already targets modern browsers. The source of the chunk is unknown (resolved 2026-11-16 — Next's own polyfills and prebuilt helpers, see `## Decisions`).
4. **`render-blocking-insight` / `unused-css-rules`.** `_next/static/css/18fa65dd*.css` (24 KiB, 87% unused on this page). See Non-Goals.
5. **`unused-javascript` / `cache-insight`.** Mostly third-party (gtag 75 KiB, Cloudflare beacon, Ahrefs). See Non-Goals.

## Solution

- Add `fetchPriority="high"` to the hero "after" `<Image>` and to `BlogFeaturedImage`. Keep `priority` (it still creates the preload). Next copies `fetchPriority` to the `<img>` and to the preload link (`client/image-component.js:216`).
- Keep the hero "before" image (`BeforeAfterSlider`, `imagePriority`) as it is. `tests/e2e/homepage-performance.e2e.spec.ts` requires its preload. Without `fetchPriority` it stays at Low priority, so the LCP image wins.
- In `NavBar.tsx`, change the compact `<source>` `srcSet` to `` `${getCdnImageUrl(compact, 100)} 1x, ${getCdnImageUrl(compact, 200)} 2x` ``. Apply the same 1x/2x pattern to the full-logo `<img>` (200 / 400) with a `srcSet` attribute. Keep `src` at 200.
- Legacy JS: find the module that ships the transforms. If it is Next's own polyfill module or a prebuilt dependency, record a won't-fix decision. Do not add a new dependency or a webpack hack for 30 KiB.

## Non-Goals

- Render-blocking CSS: `experimental.inlineCss` is infeasible. The worker bundle is ~51.8 MiB of the 64 MiB limit, and inlining CSS into ~2,500 prerendered pages exceeds it (error 10027, proven 2026-10-08).
- Unused CSS 20 KiB: it is the single global Tailwind sheet. Splitting it per route is not worth the risk for 150 ms estimated savings.
- gtag unused JS: it already loads with `strategy="lazyOnload"` (`client/components/analytics/GoogleAnalytics.tsx:92`). Do not delay it more. GA4 signup attribution depends on it.
- `cache-insight`: the TTLs of `static.cloudflareinsights.com` and `analytics.ahrefs.com` are set by those vendors.
- Speed Index and TTI: downstream of LCP and JS. Re-measure after AC-5.

## Acceptance Criteria

- [x] AC-1 [local]: SSR HTML of `/` serves the `hero-image-regular.webp` preload link with `fetchpriority="high"` (Next copies it to the `<img>`; the blurred preload stays Low) — proof: `tests/e2e/homepage-performance.e2e.spec.ts` (extend it) — Evidence: 2026-11-16, e2e 3/3 passed, including the new `fetchPriority` assertions on the preload link and on the eager `<img>`; production build (see `## Pre-deploy verification`) emits the same on the prerendered page.
- [x] AC-2 [local]: `BlogFeaturedImage` renders `fetchpriority="high"` — proof: `tests/unit/blog/blog-featured-image.unit.spec.ts` (extend it) — Evidence: 2026-11-16, assertion added to that spec; `tests/unit/seo/mobile-psi-lcp-hints.unit.spec.ts` also covers both LCP components. 4/4 and 3/3 pass. Production build: 133/133 prerendered blog pages carry the hint on the featured image.
- [x] AC-3 [local]: the navbar logo serves a `2x` CDN candidate (compact 200 px, full 400 px) — proof: `tests/e2e/homepage-performance.e2e.spec.ts` (update `NAVBAR_COMPACT_LOGO` / `NAVBAR_FULL_LOGO` and the URL checks at line ~108) — Evidence: 2026-11-16, new DPR-2 test asserts `currentSrc` is the compact 200px / full 400px candidate; RED without the `NavBar.tsx` `srcSet` (1 failed), GREEN with it (3/3 passed). Production build serves `100 1x, 200 2x` (compact) and `200 1x, 400 2x` (full).
- [x] AC-4 [local]: the source of chunk `3794` legacy transforms is named in `## Decisions`, with a fix or a won't-fix reason — proof: build output inspection — Evidence: 2026-11-16, the polyfills are `next/dist/build/polyfills/polyfill-module.js` (unconditional `require` at `next/dist/client/app-globals.js:6`); the Babel transform signals are Next's own prebuilt helper modules in the same chunk (cols 61286/137340). Won't-fix, with the forensic detail in `## Decisions`.
- [ ] AC-5 [post-deploy, João]: PSI mobile LCP for `/` is ≤ 2.5 s (target Performance ≥ 90; `lcp-discovery-insight` and `image-size-responsive` expected to pass) — proof: `node scripts/perf/psi-profile.mjs https://myimageupscaler.com/` with `PAGESPEED_API_KEY` from `.env.api` — Evidence: pre-deploy baseline and pass conditions in `## Post-deploy verification runbook (AC-5)`; post-deploy run pending.

## Blocked on

- AC-5 needs a production deploy, and `scripts/deploy/deploy.sh` is a human release action, not part of this PRD's code work (`Owner: João`). Three concrete gates, in pipeline order:
  1. Clean worktree: `docs/seo/reddit-post-log.md` has unrelated uncommitted edits from the Reddit monitor. Commit or stash it first; do not fold it into this change.
  2. **Migrations run before the broad test suite** (`00-database-migrations.sh`, then `yarn test`). A deploy therefore mutates production schema before it can abort on a failing test, and this repo's recent history records the broad suite hitting its 300 s cap rather than going green. Deploying that path for a CSS/image-attribute fix is not a safe trade.
  3. `yarn test` + `test:seo-guard` + the mandatory upscale release check all run against production-adjacent services and GCloud secrets; on failure the tree is left migrated-but-not-deployed.
- Everything the deploy would ship for this PRD is verified locally, including the production build artifact (see `## Pre-deploy verification`). The remaining work is the release itself plus the PSI re-measure.

## Decisions

- 2026-11-16 (Claude): keep `priority` and add `fetchPriority="high"`. Do not switch to Next 16 `preload`. Both produce the preload link. `priority` is the smaller diff and keeps the existing tests valid.
- 2026-11-16 (Claude): keep the hero "before" image preload. The e2e contract asserts it, and it covers the left half of the visible hero.

- 2026-11-16 (Claude): the agent stops at a verified, committed change and does not run `yarn deploy`. The pipeline applies production migrations before the broad test suite, so an abort there leaves production schema-changed but app-unchanged; that is a release decision with a rollback owner, not a code-fix step.
- 2026-11-16 (Claude): AC-4 won't-fix. The polyfills are `next/dist/build/polyfills/polyfill-module.js`, `require`d unconditionally at `next/dist/client/app-globals.js:6`, so `browserslist` cannot remove them. Re-confirmed on 2026-11-16 by reading the reported columns in `.next/static/chunks/3794-*.js`: the polyfill signals (`Array.prototype.at/flat/flatMap`, `Object.fromEntries`, `Object.hasOwn`, `String.prototype.trimStart/trimEnd`) sit in one contiguous block at col 65782–66550, while `@babel/plugin-transform-classes` (col 137340, webpack module `86110`: `function n(e,t){if(!(e instanceof t))throw TypeError("Cannot call a class as a function")}`) and `@babel/plugin-transform-spread` (col 61286, module `22120`) are Babel-compiled helper modules inside Next's own prebuilt dist — not app code. Patching `node_modules` or aliasing the polyfill away is not acceptable for 30 KiB.

## Done (2026-11-16, commit `perf(homepage): give the LCP image high fetch priority, serve a 2x navbar logo`)

- `HeroSection.tsx` and `BlogFeaturedImage.tsx`: added `fetchPriority="high"` next to `priority`.
- `NavBar.tsx`: compact logo `srcSet` is `100 1x, 200 2x`; full logo `<img>` has `srcSet` `200 1x, 400 2x`.
- New `tests/unit/seo/mobile-psi-lcp-hints.unit.spec.ts` (red 3/3 before, green after); `tests/unit/blog/blog-featured-image.unit.spec.ts` extended. 7/7 pass.
- `tests/e2e/homepage-performance.e2e.spec.ts`: fetchpriority assertions plus a DPR-2 logo test (RED without the `NavBar.tsx` `srcSet`, GREEN with it). 3/3 pass.
- `yarn verify` passes (tsc, lint 0 errors / 1,832 pre-existing warnings, ICU, schema, indexation gate, cache config).
- SEO changes backlog entry added (`docs/SEO/maintenance/seo-changes-backlog.md`).
- Full unit suite green: 7,325 passed / 556 files (12 skipped), so the component edits broke nothing outside the touched specs.
- Production build + browser priority probe + PSI baseline recorded below; `scripts/perf/psi-profile.mjs` gained the best-practices category so AC-5's second insight is observable.

## Pre-deploy verification (production build, 2026-11-16)

`yarn build` (`next build --webpack`) succeeded locally; the prerendered output was inspected directly, because the homepage is `force-static` and its shipped HTML is the build artifact, not the dev-server render the e2e suite exercises.

- `.next/server/app/en.html` (homepage): the `hero-image-regular.webp` preload link carries `fetchPriority="high"`, the hero "after" `<img>` carries `fetchPriority="high"`, the `hero-image-blurred.webp` preload and "before" `<img>` carry none, and the navbar `<picture>` ships `width=100 … 1x, width=200 … 2x` (compact) / `width=200 … 1x, width=400 … 2x` (full). Before the change the same file had zero `fetchPriority` occurrences.
- 133/133 prerendered blog pages contain the hint, and each featured image `<img>` carries `fetchPriority="high"`.
- The only `fetchPriority="low"` in the DOM is Next's own webpack chunk preload — pre-existing, unrelated.
- Attribute case: the HTML serializes `fetchPriority="high"`. HTML attribute names are case-insensitive, so the browser and Lighthouse read `fetchpriority`. Do not "fix" the casing.

Browser-level check on that same production build (`next start`, Chrome via Playwright, 412×823 at DPR 1.75, 4× CPU, 1.6 Mbps / 150 ms throttling):

| Request                                                        | Priority | Started → finished |
| -------------------------------------------------------------- | -------- | ------------------ |
| `hero-image-regular.webp` (**LCP**)                            | **High** | 208 ms → 478 ms    |
| `hero-image-blurred.webp` (“before”, preload without the hint) | **Low**  | 209 ms → 749 ms    |
| `horizontal-logo-compact.png`                                  | High     | pre-existing       |

The blurred image is the built-in control: same `priority` preload, no `fetchPriority`, so it keeps the pre-change Low priority the LCP image used to have. The hint flips the LCP image from Low to High with no test-only assumptions. LCP observed at 1,532 ms under throttling; local, single-host, not a production field number.

## Post-deploy verification runbook (AC-5)

Baseline measured 2026-11-16 against production, before any of this shipped (`node scripts/perf/psi-profile.mjs https://myimageupscaler.com/`, two runs, `PAGESPEED_API_KEY` from `.env.api`):

| Run | Perf | Best Practices | LCP   | TBT    | CLS   |
| --- | ---- | -------------- | ----- | ------ | ----- |
| 1   | 86   | —              | 3.8 s | 50 ms  | 0.018 |
| 2   | 84   | 96             | 4.2 s | 130 ms | 0.021 |

Both runs fail `lcp-discovery-insight` (the LCP node is the hero "after" `<img>`) and `image-size-responsive`, which names `/cdn-cgi/image/width=100,quality=75,format=auto/logo/horizontal-logo-compact.png` — the exact asset AC-3 changed. CrUX field data for the same origin is still `LCP 4098 ms SLOW` / `TTFB 2538 ms SLOW`, so field CWV will not move on the lab fix alone; AC-5 is a lab measurement from this tool.

`scripts/perf/psi-profile.mjs` now requests the `best-practices` category as well, so the runbook can see `image-size-responsive`; it previously only fetched `performance`, which meant one of AC-5's two named insights was unobservable.

Run after deploy:

```bash
PAGESPEED_API_KEY=$(grep -m1 '^PAGESPEED_API_KEY=' .env.api | cut -d= -f2-) \
  node scripts/perf/psi-profile.mjs https://myimageupscaler.com/   # run 3×, take the median LCP
```

Pass conditions, in order of reliability:

1. `lcp-discovery-insight` and `image-size-responsive` no longer appear in the `issues` list. That list only contains audits scoring below 0.9, so absence is the pass signal — this is deterministic and is the real AC-5 evidence.
2. Median mobile LCP ≤ 2.5 s across three runs. Lab LCP varies ~±0.4 s run to run (3.8 s vs 4.2 s above), which is why one run is not enough to accept or reject.
3. Performance ≥ 90 as a soft target; `unused-javascript` (gtag + chunk `3794`) and `render-blocking-insight` stay failing by design (see Non-Goals) and cap the score.

If `image-size-responsive` survives the deploy, read its item URL before touching code: it reports the delivered candidate, and the logo now delivers `width=200` for a 91×32 CSS box at DPR 1.75 (159 px needed). A 200 px candidate is what the browser must pick; a surviving report means the audit is objecting to a different asset.

## Execution Phases

#### Phase 1: LCP image gets high fetch priority

**Status:** DONE
**Files:** `client/components/landing/HeroSection.tsx`, `client/components/blog/BlogFeaturedImage.tsx`, the two test files in AC-1/AC-2.
**Implementation:**

1. Write the failing assertions first (red): AC-1 regex on `initialHtml` for `fetchPriority="high"` (React serializes the attribute as `fetchPriority` in SSR HTML — match case-insensitively), AC-2 in the unit spec.
2. Add `fetchPriority="high"` to both `<Image>` elements. Run the two specs (green).

- [x] Hero plus blog LCP images render with high fetch priority — proof: `yarn test tests/unit/blog/blog-featured-image.unit.spec.ts`, `yarn playwright test tests/e2e/homepage-performance.e2e.spec.ts` — covers AC-1, AC-2.

#### Phase 2: Logo resolution and legacy JS triage

**Status:** DONE
**Files:** `client/components/navigation/NavBar.tsx`, `tests/e2e/homepage-performance.e2e.spec.ts`, `tests/unit/seo/mobile-psi-lcp-hints.unit.spec.ts`.
**Implementation:**

1. Added a DPR-2 e2e test (`test.use({ deviceScaleFactor: 2 })`) that asserts the browser picks the 2x candidate; it failed against the old markup. Then changed `NavBar.tsx` as in `## Solution` (green).
2. Chunk `3794` triage: the polyfill signals live in one contiguous block (cols 65782–66550) that matches Next's `polyfill-module.js`, `require`d unconditionally by `app-globals.js`; the `@babel/plugin-transform-*` signals resolve to Babel-compiled helper modules inside Next's own dist (modules `86110`, `22120`), not app code. Won't-fix recorded in `## Decisions`.

- [x] Logo serves a 2x candidate on mobile plus desktop — proof: `yarn playwright test tests/e2e/homepage-performance.e2e.spec.ts` (3/3), `yarn verify` green — covers AC-3.
- [x] Legacy JS source is named and decided — proof: decision entry with the module name — covers AC-4.
