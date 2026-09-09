# Mobile LCP fix plan — September 8, 2026

Fix the homepage’s above-the-fold image loading first, then investigate slow cached HTML responses. Current production mobile audits still measure **6.37 seconds and 5.27 seconds**. Waiting for Search Console validation alone will not resolve the current loading problem.

This is a diagnosis and implementation plan; application code and production configuration were not changed.

## What the export actually says

Source: `/home/joao/Downloads/LCP.zip`, containing `Chart.csv`, `Table.csv`, and `Metadata.csv`.

| Evidence                                                              | Meaning                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Example URL `/`, group population 198, group LCP 5.3s                 | A group-level measurement, not 198 separately measured homepage copies       |
| Chart spans June 9–September 6                                        | The September 8 download does not contain September 8 performance data       |
| 55 affected URLs on June 9; 112 on August 31; peak 223 on September 4 | The affected population grew; the export does not establish why              |
| Validation started September 8, per supplied GSC screenshot text      | Tracking started that day; this is not evidence the problem started that day |

GSC uses real-user data aggregated over 28 days; group LCP is the 75th percentile. Starting validation does not trigger a fix or reindexing. The CSV does not include the 198 member URLs, device traces, or country breakdown. Obtain the member examples from the GSC group before applying homepage-specific changes across the whole group. [Google’s Core Web Vitals report documentation](https://support.google.com/webmasters/answer/9205520?hl=en).

The repository’s [cache setup guide](../../guides/cloudflare-cache-setup.md) records activation on August 25. If that date matches the production rollout, September 6 still includes substantial pre-change traffic; approximately September 22 is the first complete 28-day window after that activation, plus reporting delay. The September 8 validation window runs approximately to October 6. Neither date guarantees a pass.

## Current production evidence

Tested `https://myimageupscaler.com/` on September 8 with Lighthouse 12.8.2 and Chromium 151. Mobile settings: 412 × 823, DPR 1.75, simulated 150 ms RTT / 1.6 Mbps network, 4× CPU slowdown. These are lab runs, not replacement CrUX measurements.

| Metric                 | Mobile run 1 | Mobile repeat       |
| ---------------------- | ------------ | ------------------- |
| Performance score      | 59           | 76                  |
| LCP                    | 6.37s        | 5.27s               |
| First contentful paint | 1.89s        | 1.89s               |
| Total blocking time    | 515ms        | approximately 200ms |
| Layout shift           | 0.003        | 0.003               |

The first run scored 100 for accessibility, 100 for SEO, and 61 for best practices. Those scores do not override the failed LCP measurement. A supplementary desktop-form-factor run measured 5.43s LCP and selected the full logo. Its configuration retained simulated mobile network settings and disabled screen emulation, so it is **not a standard desktop benchmark** and should not be used for desktop acceptance.

### The LCP candidate changes between runs

| LCP phase            | Run 1: slider “Before” image | Repeat: compact navigation logo |
| -------------------- | ---------------------------- | ------------------------------- |
| TTFB contribution    | 2,337ms                      | 623ms                           |
| Resource load delay  | 3,106ms                      | 2,976ms                         |
| Resource transfer    | 404ms                        | 208ms                           |
| Element render delay | 527ms                        | 1,467ms                         |

These phase numbers come from Lighthouse’s LCP breakdown. They should not be combined with independent curl timings or treated as guaranteed savings. The candidate switching means a single hardcoded “the logo is always LCP” assumption is unsafe. Both runs show resource discovery/scheduling and rendering costs beyond HTML delivery. [Google’s LCP optimization guide](https://web.dev/articles/optimize-lcp?hl=en).

### Cache hits exist, but latency varies

A cookie-free curl request returned HTTP 200, `x-nextjs-cache: HIT`, shared `s-maxage`, and 189ms TTFB through Cloudflare’s YVR location. Additional sequential fetch probes returned:

| URL                             | Response headers received, sample 1 / 2 | Cache evidence |
| ------------------------------- | --------------------------------------- | -------------- |
| `/`                             | 1,400ms / 159ms                         | HIT / HIT      |
| `/blog/fixing-pixelated-photos` | 253ms / 1,171ms                         | HIT / HIT      |
| `/formats/upscale-gif-images`   | 364ms / 1,395ms                         | HIT / HIT      |
| `/tools/ai-image-upscaler`      | 210ms / 341ms                           | HIT / HIT      |

These fetch timings include connection setup where applicable and are not a statistical p75. The three non-homepage paths are diagnostic samples from the cache guide, **not confirmed members of the 198-URL group**. `cf-cache-status` was absent; OpenNext/Next incremental-cache hits do not establish an outer CDN HTML hit. The first Lighthouse run separately recorded a 2,329ms document response; the repeat recorded 410ms. Investigate this variability rather than assuming every hit is fast or declaring Cloudflare caching broken.

## Implementation order

### 1. Make both visible hero images load immediately

Estimated implementation and focused checks: **1–2 hours**.

Files: `client/components/landing/HeroBeforeAfter.tsx`, `client/components/ui/BeforeAfterSlider.tsx`, `client/components/landing/HeroSection.tsx`.

`HeroBeforeAfter` passes `imagePriority={false}`. The slider forwards that value into Next Image’s `priority`, and production HTML consequently contains `loading="lazy"` on the visible “Before” image. Run 1 selected that exact image as LCP and explicitly failed `lcp-lazy-loaded`. Its transformed response was only about 11.7 KB; delayed loading matters more than further compressing that small image.

The minimal first experiment is to change the **homepage instance** to `imagePriority={true}` while retaining `renderAfterImage={false}`. Verify the installed Next version emits eager loading and an appropriate responsive preload; if necessary expose explicit loading/fetch-priority props. Preserve lazy loading for unrelated below-fold sliders. Avoid adding a preload for a raw image URL when the displayed image uses `/cdn-cgi/image/...`.

Keep the existing server-rendered after image, aspect-ratio container, and working comparison interaction. Confirm both visible images are in initial HTML and neither waits for hydration or scrolling. Rerun mobile Lighthouse to see whether the logo becomes the remaining limiting element.

### 2. Remove redundant logo downloads and resize the after image

Estimated implementation and focused checks: **2–3 hours**.

Files: `app/[locale]/layout.tsx`, `client/components/navigation/NavBar.tsx`, `client/components/landing/HeroSection.tsx`, `client/utils/image-loader.ts`.

The layout preloads raw PNG logo URLs, but the navigation displays transformed URLs. In the first mobile audit, the browser fetched the raw compact logo (~20 KB), transformed compact logo (~4.4 KB), and transformed full logo (~11.6 KB). Both navigation `<Image>` elements have `priority`, even though CSS hides one at each breakpoint.

Use one responsive `<picture>`/image selection path, or equivalent breakpoint-aware loading, so only the appropriate logo is requested. Remove unmatched raw preloads; any retained preload must match the selected transformed URL/srcset and breakpoint. Confirm actual browser requests at 375px, 412px, and desktop widths. Update the tests that currently require both raw preloads.

The after hero image is a plain `<img>` without `srcset` and bypasses the existing Cloudflare loader. Production transferred ~193.9 KB; Lighthouse estimated ~157.5 KB of its image payload could be saved by appropriate sizing. Use the existing image loader through Next Image or generate a responsive srcset with correct `sizes`, eager loading, and preserved geometry. Verify transformed image responses are successful before relying on them. Perform resizing at the CDN or build stage, not in request-time Worker computation.

Acceptance: no redundant raw logo preload request, no hidden desktop logo request on mobile, and a correctly sized hero image without a layout jump. Treat Lighthouse’s byte savings as an estimate, not a promise of equal LCP time savings.

### 3. Reduce initial rendering and checkout work

Estimated investigation, implementation, and checks: **3–5 hours**.

Files: `client/components/pages/HomePageClient.tsx`, `client/components/ClientProviders.tsx`, `client/hooks/useCheckoutSession.ts`, `client/components/analytics/AnalyticsProvider.tsx`, `client/styles/index.css`.

The first audit transferred approximately 1,962 KiB in total, reported 391 KiB of unused JavaScript, and spent 3.3 seconds on main-thread work. Stripe accounted for approximately 821 KB of transfer and 132ms of blocking time during an untouched homepage visit. `useCheckoutSession.ts` calls `getStripePromise()` at module scope. Trace the production import initiator and defer checkout module/SDK initialization until checkout intent, using the pure Stripe loader if needed. Keep initialization memoized. Test opening checkout and completing the supported flow; do not change payment behavior as a side effect of performance work.

`React.lazy()` plus `<Suspense>` does not defer work until scroll: the current below-fold components are still rendered immediately. Keep crawlable text server-rendered and defer expensive interactive modules until visibility or user intent. Likewise, dynamically imported modals rendered unconditionally can load before they open.

The hero ancestor animates from `opacity: 0` over 600ms. Test removing that animation from critical content and keep decorative animation separate. This is a plausible rendering contributor, not a proven 600ms saving. Google Analytics and Ahrefs already use `lazyOnload`; recommending that same change again would not fix anything. Check actual script timing if analytics still competes with first paint. Cloudflare challenge JavaScript also consumed CPU in run 1; examine its applicability to ordinary mobile visitors before considering any rule adjustment.

Acceptance: no checkout SDK requests before checkout intent; preserved page-view attribution and checkout behavior; reduced blocking/render delay in repeat mobile traces.

### 4. Find why some cached documents still respond slowly

Estimated diagnosis: **2–4 hours**; implementation depends on the measured cause.

Relevant files: `open-next.config.ts`, `middleware.ts`, `docs/guides/cloudflare-cache-setup.md`, and the HTML cache smoke tests.

Measure at least five cookie-free requests per representative template from the main visitor regions. Record full URL, connection reuse, redirect time, document TTFB, `cf-ray`, `cf-cache-status`, `x-nextjs-cache`/`x-opennext-cache`, and `Cache-Control`. Separate CDN hits, incremental-cache hits, misses, and revalidation. Use request timing/traces to distinguish network setup, Worker startup/middleware, and R2 retrieval. A `HIT` header alone cannot identify which layer spent a second responding.

Preserve the homepage’s existing `force-static` and 86,400-second revalidation behavior unless evidence requires changing it. If changing shared cache rules, preserve private-route/auth bypasses and Next RSC variants. Never apply an indiscriminate cache-everything override. Aim for consistent warm responses under the repository’s 400ms diagnostic target, with a separate regional latency budget.

### 5. Add tests that detect the failure, then validate the whole group

Estimated implementation and verification: **2–3 hours**, followed by **28 days of field monitoring** after the final production fix.

Update `tests/unit/seo/homepage-performance.unit.spec.ts` and add a focused browser performance test. Current tests assume logo priority and explicitly require the hero fade-in; they passed while production mobile LCP failed.

1. Prove red, then green: homepage before-image is eager, responsive preload matches its request, and no duplicate after image is rendered.
2. Prove browser behavior: initial viewport has visible content before hydration, only the selected logo downloads, and no checkout SDK loads before intent. Keep hero geometry and interactions intact.
3. Run affected unit/browser tests and `yarn verify`; rerun three mobile Lighthouse samples per representative template. Target median lab LCP ≤2.5s and inspect any sample >4s; also check CLS ≤0.1 and TBT ≤200ms as supporting lab budgets.
4. Obtain GSC group examples, then sample homepage/locales, tools, formats, and blog templates only where present. Identify each template’s actual LCP element instead of copying the homepage fix everywhere.
5. After deployment, monitor mobile field p75 LCP toward ≤2.5s over a complete 28-day window. A drop below 4s clears the poor threshold but may still mean “needs improvement.” Use existing field telemetry or add sampled attribution by template/device/region, without personal data or query strings. Record the deployment and follow-up in the SEO changes backlog when implementation ships.

## Verification performed for this report

`yarn verify` passed, including its 11 OpenNext cache-configuration tests. ESLint reported 1,668 warnings and zero errors. Separately, 62 tests passed across homepage performance, HTML cache checking, and HTML cacheability. No new application tests were added because this task creates a plan, not a behavior change. The complete API/E2E suite was not run.

Raw local evidence remains in `/tmp/miu-lcp-20260908-ifZJbO/`: `lh-mobile.json`, `lh-mobile-repeat.json`, `lh-desktop.json`, `home.html`, and `home-headers.txt`. These temporary files may be cleared by the OS; the actionable measurements are recorded above.

**Next action (under 2 minutes):** open `client/components/landing/HeroBeforeAfter.tsx` and start implementation item 1 with a failing test for the current lazy-loaded before image.
