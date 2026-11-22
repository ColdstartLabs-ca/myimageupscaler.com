# Traffic Recovery & Growth PRD Suite (2026-11-21)

**Master Index & Complete Evidence Digest**  
**Created:** 2026-11-21 | **Execution Target:** Same-day (`2026-11-21`) local/code execution + João deploy & external gates  
**Source Report:** [2026-11-21 Traffic Recovery Report](../../../SEO/reports/2026-11-21-traffic-recovery-report.md)  
**Active Property:** `sc-domain:myimageupscaler.com` | **GA4 Property:** `519826120`

---

## Suite Map & Today's Execution Order

| PRD                                                              | Scope                                                                                                                                                                                                        | Priority | Status                                                                           | Complexity   | Depends On                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------- | ------------ | -------------------------- |
| [PRD-TR-2026-11-01](01-ship-recovery-and-tool-funnel.md)         | Squash & ship Nov 1/16 recovery fixes (`eaa2325f`), fix `/alternatives/*` + `/tools/*` CTR + `llms.txt`, wire `InteractiveTool.tsx` post-download 4× upsell + fix `Unassigned` GA4 attribution               | **P0**   | `CODE COMPLETE` (deploy pending)                                                 | 6 (`MEDIUM`) | None                       |
| [PRD-TR-2026-11-02](02-index-bloat-pruning-and-consolidation.md) | Index bloat audit (`939` crawled-not-indexed, `592/1,000` zero-click), measured consolidation of ~43 overlapping enhancer/upscaler posts, prune dead `platform-format`/translated pSEO, internal link funnel | **P1**   | `CODE COMPLETE` (deploy pending)                                                 | 7 (`HIGH`)   | None (runs parallel to 01) |
| [PRD-TR-2026-11-03](03-money-pages-cwv-and-authority.md)         | Mobile CWV/INP (`196/196` Poor) + Image SEO (`+32.3%`), money-page proof rebuild (`/` + flagship 5-image benchmark post-Nov-26), 1-image guest 2× trial spec, clean editorial links & Reddit/AI distribution | **P1**   | `CODE COMPLETE` except AC-4 (production-build homepage perf E2E; deploy pending) | 7 (`HIGH`)   | `PRD-TR-2026-11-01`        |

---

## 1. Executive Summary (Why We're Bleeding & What Moves the Needle)

1. **Severe, ongoing decline:** Monthly GSC clicks dropped **~65% from July's peak** (`10,192` in Jul 2026 → `~3,500–3,760/mo` November pace). Over the latest 28 days (`Oct 22–Nov 18` vs `Sep 24–Oct 21`), total Web clicks fell **−17.44%** (`4,260 → 3,517`). Strip out `+124` off-topic clicks from `/blog/4-k-youtube-to-mp-4` (`6 → 130`, 76% bounce, `0` key events), and **real on-topic clicks fell −20.24%** (`4,254 → 3,393`).
2. **Compounding root causes:**
   - **Site-wide footprint bloat & spam-update pressure (GSC UI + Ahrefs):** Google indexes only **753 pages** and excludes **3,640**, including **939 "Crawled - currently not indexed"** (more than double `446` on Oct 23; ~352 English blog posts, ~135 `/en/blog` parameter/pagination residue, and thin translated pSEO templates). **592 of the top 1,000 pages earned 0 clicks** over 3 months; ~43 overlapping `"best / enhancer / upscaler"` blog posts cannibalize each other; **196/196 mobile URLs fail CWV** (`LCP > 4s`, `INP > 200ms`); and **27 of the top 51 referring domains by DR in Ahrefs are flagged SPAM**. The steepest slide aligns with Google's **Sep 24–Oct 8, 2026 spam update** (`0` manual actions).
   - **Self-inflicted execution & funnel bottlenecks:** Tested recovery commits from **Nov 1** (`release/miu-recovery-20261101`, now squashed onto `master` as `eaa2325f`: `"AI image upscaler"` homepage hero copy, GA4 `sign_up` attribution, static pSEO caching) and **Nov 16** (`6f9e1a46`: homepage LCP `fetchPriority="high"` + 2× logo) were **undeployed**. Meanwhile, GA4 `sign_up` = `0`, Google OAuth (`accounts.google.com`) & Stripe (`checkout.stripe.com`) split sessions, and **235+/mo engaged organic users** on booming zero-signup `/tools/*` pages produce only `11` key events because `InteractiveTool.tsx` lacks a post-download AI Upscaler CTA and event tracking.
3. **Commercial silver linings:** Organic `begin_checkout` in GA4 **rose +56%** (`82 → 128`) and total `purchase` held flat (`18 → 19`). **`/tools/` is the ONLY major growing section (+13.54% clicks, 80–90% GA4 engagement)**, **Google Image Search grew +32.26% clicks (`+28.74%` imp)**, **Reddit referrals grew +66.5% (`302` sessions)**, and **AI Assistant (`gemini.google.com`) converts at 92.2% engagement**.
4. **Core directive:** **Stop writing generic blog posts into Google AI Overviews (`0.58%` blog CTR, 149K AI impressions).** Deploy `master` (`eaa2325f` + `6f9e1a46`), fix GA4 attribution/exclusions, prune/consolidate thin bloat instead of adding pages, push & monetize surging zero-signup `/tools/*` & `/alternatives/*` winners, rebuild money pages with real hands-on benchmarks, fix mobile CWV/INP, and earn clean editorial links.

---

## 2. Data Sources, Completeness & Cross-Verification

| Source                  | Current Window              | Previous Window             | Completeness & Integrity Notes                                                                                                                                                                                                   |
| ----------------------- | --------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GSC API (28d)**       | `2026-10-22` → `2026-11-18` | `2026-09-24` → `2026-10-21` | `complete: true`, `fetchFailures: []`. 3-day holdback applied. **Query click coverage: `52.46%`** (`1,672/3,517` privacy-hidden); impression coverage `55.49%` (`141,212/317,274` hidden). `15,371` query rows, `811` page rows. |
| **GSC API (90d)**       | `2026-08-21` → `2026-11-18` | `2026-05-23` → `2026-08-20` | `complete: true`, `fetchFailures: []`.                                                                                                                                                                                           |
| **GSC API (Custom)**    | `Nov 11–18` & `Nov 16–18`   | `Jul 1–28` & `Nov 1–10`     | Finalized queries for July peak, flagship cliff, and Nov 16–18 `remove background` spike. Partial freshness checked `Nov 19–21`.                                                                                                 |
| **GA4 API (28d & 90d)** | `2026-10-24` → `2026-11-20` | `2026-09-26` → `2026-10-23` | Property `519826120`, 1-day lag. GSC/GA4 ratio `3,517 / 4,020 = 0.87` (`google / organic` = `3,623`). Also queried `Nov 14–20` post-deploy, `eventName × channel`, and `landingPagePlusQueryString`.                             |
| **Blog SEO Audit**      | Against 28d & 90d GSC       | —                           | `309` posts audited: `94` errors (`124` in 90d), `119` warnings, `98` below CTR benchmark, `91` low title/query overlap, `41` length issues, `8` intent mismatches (`19` in 90d).                                                |
| **GSC UI-Only Reports** | Snapshot `2026-11-21`       | —                           | Absorbed from external audit: Page Indexing (`753` indexed / `3,640` not indexed / `939` crawled-not-indexed), CWV (`196/196` Mobile Poor), Generative AI (`149K` imp/3mo), Manual Actions (`0`), Links (`968` external).        |
| **Ahrefs (Free Plan)**  | Snapshot `2026-11-21`       | —                           | Absorbed from external audit: DR `34` (`-1`), `1,528` RDs (`-24`), `27/51` top DR domains flagged SPAM, `1.2K` AI mentions (`-145`), Web Analytics (`8.2K` visitors, 26% SG+CN).                                                 |

### External AI Audit Cross-Check (Absorbed vs. Corrected)

| External Finding (`myimageupscaler-seo-recommendations.md`)                                                                                                                            | Disposition in This PRD Suite                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `753` indexed / `3,640` not indexed / `939` crawled-not-indexed (~352 EN blog posts); `592/1,000` zero-click pages; ~43 overlapping `"best/enhancer/upscaler"` posts                   | **Absorbed → PRD-02:** Core evidence driving P1 bloat audit, blog consolidation, and dead template pruning.                                                                                                                                                            |
| `196/196` Poor Mobile CWV (`LCP > 4s`, `INP > 200ms`) & `196` Desktop Needs Improvement (`LCP > 2.5s`)                                                                                 | **Absorbed → PRD-03:** Combined with `6f9e1a46` + `1df70e5a` and mobile JS/hydration deferral.                                                                                                                                                                         |
| `149K` GSC AI impressions (`poster` `28.4K`, `best-free` `13.6K`, `topaz` `13.0K`, `photoshop` `8.7K`); Ahrefs `1.2K` AI mentions (`-145`) + long AI Mode prompts (`2.5K` imp @ `4.7`) | **Absorbed → PRD-01 & PRD-03:** Stops investing in AI-Overview-capped informational blog posts; updates `app/llms.txt/route.ts` and tool capability copy.                                                                                                              |
| DR `34`, `1,528` RDs, `27/51` top DR domains flagged SPAM (`buybacklinks.agency` + directories); `968` GSC links (`503` to `/`); `26%` SG (`1,430`) + CN (`705`) bot share             | **Absorbed → PRD-01 & PRD-03:** Bot filter in GA4 (`PRD-01`); immediate halt to directory links, disavow check, and editorial outreach (`PRD-03`).                                                                                                                     |
| "Merge/301 `/tools/ai-image-upscaler` into `/` if intent overlaps"                                                                                                                     | **Corrected (`PRD-02`):** Do NOT 301 it — it earns `102` clicks/28d (`4.33%` CTR) and owns `"image upscaler 8x"` (`35` clicks, pos `8.1`); Aug GIF 301 lost ~600 clicks/mo.                                                                                            |
| "Add conversion tracking in GA4 (P0)"                                                                                                                                                  | **Corrected (`PRD-01`):** All 15 key events are already configured and organic `begin_checkout` is `82 → 128`; the real gaps were unshipped `d2499483` (`sign_up`), `Unassigned` `purchase` (`19/19`), and missing Admin referral exclusions.                          |
| "Stop `/en/blog?page=` & `?q=` crawling / add noindex"                                                                                                                                 | **Corrected (`PRD-02`):** Verified live — `/en/blog?page=2` already `301 → /blog?page=2` with `noindex, follow` + canonical `/blog` (Nov 13 `9ec164ea`). Do not block via `robots.txt` while Google drains residue.                                                    |
| "`remove background` jumped to page 1 (4K–8K imp/day); 2% CTR = 120 clicks/day"                                                                                                        | **Corrected (`PRD-01`):** `13,530` of `13,747` impressions happened Nov 16–18 with `8` clicks (`0.058%` CTR), repeating Sep 24–26's phantom burst. Don't forecast 120/day from it; capture `/tools/remove-bg`'s real converting queries (`9 → 62` GA sessions, +589%). |
| "Update Topaz title now" & "State '5 free credits' on homepage"                                                                                                                        | **Corrected (`PRD-02` & `PRD-03`):** Topaz is in an active rung-3 window through **Dec 7** (crawl check **Nov 23**); free credits are region-tiered (`5 / 3 / 0`) per Product Truth (`b90c56da`).                                                                      |
| "Homepage loads 94 scripts" & "Fix hreflang for `/fr`, `/de`, `/ja` English leakage"                                                                                                   | **Refined (`PRD-02` & `PRD-03`):** Live `/` has `90` `<script>` tags, mostly Next.js inline RSC payloads (`self.__next_f.push`); target hydration/3rd-party JS for INP. Root `/` and `/fr` hreflang tags are already valid and symmetric; audit inner pSEO hreflang.   |

---

## 3. Complete Performance Baseline (GSC + GA4 + Ahrefs)

### 3.1 Non-Brand First — 28d & 90d Web Search Summary

| Segment                                        | Prev 28d (`Sep 24–Oct 21`) |  Cur 28d (`Oct 22–Nov 18`) |                   28d Change | 90d (`May 23–Aug 20` → `Aug 21–Nov 18`)        |
| ---------------------------------------------- | -------------------------: | -------------------------: | ---------------------------: | ---------------------------------------------- |
| Non-brand clicks (classified)                  |                      2,049 |                      1,713 |           **−16.40% (−336)** | `6,857 → 6,710` (−2.14%)                       |
| Non-brand impressions / avg pos                |        `170,488` / `12.12` |        `171,909` / `18.07` |   `+0.83%` / **+5.95 worse** | `526,895 → 534,821` / `14.12 → 15.82`          |
| Unclassified clicks (privacy-hidden)           |                      2,034 |                      1,672 |           **−17.80% (−362)** | `9,591 → 7,039` (−26.61%)                      |
| Branded clicks (classified)                    |                        177 |                        132 |            **−25.42% (−45)** | `5,516 → 1,060` (−80.78%)                      |
| **Total Web clicks**                           |                  **4,260** |                  **3,517** |           **−17.44% (−743)** | **`21,964 → 14,809` (−32.58%)**                |
| **On-topic clicks (ex `4-k-youtube-to-mp-4`)** |                      4,254 |                      3,393 |           **−20.24% (−861)** | —                                              |
| Impressions (raw / ex Nov 16–18 spike)         |     `311,405` / `~311,405` |     `317,274` / `~303,744` |        `+1.88%` / **−2.46%** | `998,992 → 1,017,960` (+1.90%)                 |
| Web CTR / Stable-cohort pos (647p)             |           `1.37%` / `9.88` |          `1.11%` / `13.14` | `−0.26 pt` / **+3.26 worse** | `2.20% → 1.45%` / `12.01 → 12.38`              |
| Image Search (28d)                             | `31` clicks / `30,938` imp | `41` clicks / `39,829` imp |        **+32.26% / +28.74%** | 90d: `85` clicks / `101,859` imp (pos `40.76`) |

### 3.2 Monthly Trajectory (`2026-01` → `2026-11`) & Weekly Trend

- **Monthly (`clicks / imp / CTR / pos`):** `2026-06`: `5,586 / 297,011 / 1.88% / 11.09` → **`2026-07` Peak**: **`10,192 / 394,106 / 2.59% / 11.61`** → `2026-08`: `7,589 / 380,227 / 2.00% / 17.12` → `2026-09`: `5,942 / 363,626 / 1.63% / 10.51` → `2026-10`: `4,334 / 310,570 / 1.40% / 11.69` → `2026-11` (18d): `2,256 / 217,848 / 1.04% / 13.56` (`~3,760/30d` pace).
- **Latest 4 complete weeks:** `Oct 22–28`: **909** (426 non-brand / 35 brand / 448 unclass, `68,275` imp) → `Oct 29–Nov 4`: **900** (`75,054` imp) → `Nov 5–11`: **899** (`78,917` imp) → `Nov 12–18`: **809** (**−10.0% WoW**, `95,028` imp spike). Partial `Nov 19–21`: `112`, `108`, `64` (no rebound).

### 3.3 Two Eras of Loss & Key Page/Query Tables

- **Era 1 (July `Jul 1–28` → `Oct 22–Nov 18`):** Branded `myimageupscaler` `1,490 → 47` & `my image upscaler` `764 → 58` (`−2,149` at pos `1.0–1.2`); GIF 301 `/formats/upscale-gif-images` `476 → 22` & `/format-scale/gif-upscale-16x` `135 → 0`; `/` `4,604 → 1,112` (`−3,492`, `66,283 → 46,729` imp, pos `9.8 → 12.9`); flagship `1,622 → 150` (`41,326 → 6,873` imp); `/tools/ai-image-upscaler` `490 → 102` (pos `5.6 → 11.7`); `/scale/upscale-16x` `285 → 92`; `/blog/topaz-labs-free-trial` `184 → 74`; `/blog/free-ai-upscaler-no-watermark` `98 → 3`.
- **Era 2 (28d `Sep 24–Oct 21` → `Oct 22–Nov 18`):**
  - `/` (`−370`, `1,482 → 1,112`): `upscaler` (`144 → 38`), `image upscaler` (`506 → 416`, weekly pos `8.9 → 10.3` sliding clicks `148–168/wk` down to `78–103/wk`), `image upscaler 4k` (`102 → 57`).
  - **Flagship Nov 11–18 cliff:** Steady `8–11 clicks/day` (`pos 4.8–5.4`) Nov 5–10 → crashed to `0–2 clicks/day` (`pos 6.8–6.9`) Nov 15–18 (`58 → 15` clicks WoW, **−74%**).
  - `/tools/ai-image-upscaler` (`185 → 102`, CTR `8.14% → 4.33%`), `/scale/upscale-8x` (`63 → 17`, pos `9.3 → 15.4`), `/blog/best-free-ai-photo-enhancer-online` (`58 → 17`), `/blog/free-ai-upscaler-no-watermark` (`35 → 3`).

### 3.4 Section, Device, Country & Locale Breakdown (28d)

| Section                          |  Prev → Cur Clicks |                Delta |                  Cur Imp |           Cur CTR |           Cur Pos |
| -------------------------------- | -----------------: | -------------------: | -----------------------: | ----------------: | ----------------: |
| `(home)`                         |      1,613 → 1,202 |   **−411 (−25.48%)** |                   51,799 |             2.32% |             13.86 |
| `blog`                           |      1,393 → 1,136 |   **−257 (−18.45%)** |         197,413 (+11.3%) |         **0.58%** |             12.59 |
| `scale`                          |          488 → 423 |        −65 (−13.32%) |                   10,018 |         **4.22%** |             14.62 |
| **`tools`**                      |      **347 → 394** |    **+47 (+13.54%)** |          52,899 (+13.7%) |             0.74% |             17.46 |
| `format-scale` / `formats`       | `125→85` / `96→70` |            −40 / −26 |        `2,234` / `1,225` | `3.80%` / `5.71%` | `12.15` / `11.63` |
| `ai-features` / `platforms`      |  `80→68` / `33→37` |             −12 / +4 |        `1,605` / `1,162` | `4.24%` / `3.18%` |  `11.75` / `8.44` |
| **`alternatives`** / `use-cases` |  `27→36` / `25→20` | **+9 (+33.3%)** / −5 | `3,334 (+77.7%)` / `302` | `1.08%` / `6.62%` |  `8.09` / `16.74` |

- **Devices:** Desktop `2,353 → 1,952` (`−17.0%`, pos `9.89 → 14.13`), Mobile `1,829 → 1,483` (`−18.9%`, pos `9.97 → 12.00`).
- **Countries:** Indonesia `−119`, India `−101`, Germany `−64`, Italy `−56`, Spain `−55`, Russia `−30`, Brazil `−27`; USA `667 → 644` (`−23`).
- **Locales:** EN `4,122 → 3,432`; ES `89 → 49`; FR `31 → 30`; PT `20 → 12`; DE `11 → 14`.

### 3.5 GA4 Channel Mix, Funnel & Landing Page Conversion Leaks (`Oct 24–Nov 20`)

- **Channels:** Direct `4,680` (`17.9%` eng, `803` conv — ~26% SG+CN bot inflated); Organic Search `4,020` (`−15.4%`, `76.7%` eng, `3,025` conv); Referral `359` (`+54.7%`, `accounts.google.com` `300`, `checkout.stripe.com` `17`); Unassigned `328` (`6,391` conv — holds **19/19 `purchase`** & **3,695/3,697 `generate_lead`**); Organic Social `308` (**+66.5%**, `reddit.com` `302`); AI Assistant `77` (`92.2%` eng, `gemini.google.com` `74`).
- **Post-Nov-13 (`Nov 14–20`) referral leak check:** `accounts.google.com / referral` (`85` sessions, `56` key events) and `checkout.stripe.com / referral` (`11` sessions, `33` key events) are still active.
- **Funnel:** `sign_up` = `0`; Organic `begin_checkout` = **`82 → 128` (+56%)**; `purchase` = `18 → 19` (100% Unassigned).
- **True `landingPagePlusQueryString` conversion leaks:** `/scale/upscale-to-8k` (`99` sess → `97` keyEv) and `/scale/image-upscaler-8k` (`94` → `62`) convert cleanly; `/tools/make-image-transparent` (`84` sess, `+163%`, `83.3%` eng → `6` keyEv), `/tools/remove-bg` (`62`, `+589%`, `83.9%` eng → `2`), `/tools/image-cutout-tool` (`50`, `80.0%` eng → `2`), and `/tools/remove-gps-from-photo` (`39`, `89.7%` eng → `1`) leak `235+` engaged sessions into only `11` key events because [InteractiveTool.tsx](<../../../app/(pseo)/_components/tools/InteractiveTool.tsx>) has zero analytics events and no inline upsell beside `"Download Result"`.

---

## 4. Guardrails ("Do Not Touch Yet") & Scheduled Checkpoints

- ❌ **Do NOT edit `/blog/tiktok-profile-picture-ideas`** — active rung-2 window closes **Nov 27, 2026**.
- ❌ **Do NOT edit `/blog/topaz-labs-free-trial`** — rung-3 live exposed Nov 19; recrawl check **Nov 23**, verdict **Dec 7, 2026**.
- ❌ **Do NOT rewrite `/blog/poster-size-dimensions-pixels` titles again** — all 3 rungs exhausted; `28.4K` AI Overviews impressions cap CTR (`~0.22–0.26%`).
- ❌ **Do NOT 301 `/tools/ai-image-upscaler`, `/scale/upscale-8x`, or `/blog/image-upscaler-8x`** — resolve `image upscaler 8x` via internal links and intent separation.
- ❌ **Do NOT create new head-term pages** (`ai image upscaler`, `upscale image`, `image upscaler free`) or resume bulk publishing before `PRD-02` bloat cleanup.
- ❌ **Do NOT chase competitor misspellings** (`imageupscaler`, `imgupscaler`), **off-topic traffic** (`/blog/4-k-youtube-to-mp-4`), or **Nov 16–18 phantom `remove background` impressions** (`13,530 imp / 8 clicks`).
- ❌ **Do NOT hardcode `"5 free credits"` globally** — free credits are region-tiered (`5 / 3 / 0`) per Product Truth (`b90c56da`).

**Checkpoints:** `Nov 23` (Topaz recrawl) · `Nov 26` (confirm flagship Nov 11–18 drop) · `Nov 27` (TikTok verdict) · `Nov 30` (Nov 2 4-page pSEO prune readback) · `Dec 7` (Topaz verdict + `/` hero readback) · `Dec 15–22` (Mobile CWV field validation + `PRD-01`/`PRD-02` CTR readbacks).

### Weekly Scorecard (7 Core KPIs)

1. **GA4 Funnel by Landing Page & Channel:** `sign_up`, `upscale_completed`, `begin_checkout`, `purchase` (Organic Share vs `Unassigned`).
2. **GSC Indexation Ratio:** Indexed (`753` baseline) vs _Crawled - currently not indexed_ (`939` baseline).
3. **Homepage Head Terms:** Clicks, CTR, position for `"image upscaler"` (`pos 10.3`) and `"upscaler"` (`pos 9.9`).
4. **Flagship & Tool CTRs:** Flagship daily clicks; CTR on `/tools/make-image-transparent`, `/tools/image-cutout-tool`, `/alternatives/vs-iloveimg`, and real `/tools/remove-bg` queries.
5. **Post-Tool Upsell Funnel:** Click-through rate on `InteractiveTool.tsx` post-download 4× AI Upscaler CTA + downstream signups.
6. **Mobile CWV:** % Good mobile URLs in GSC CWV (`0/196` baseline; target `LCP ≤ 2.5s`, `INP ≤ 200ms`).
7. **Clean Authority & AI Mentions:** Net new non-spam editorial referring domains to `/`, Reddit referrals (`302` baseline), AI prompt mentions (`1.2K` baseline).
