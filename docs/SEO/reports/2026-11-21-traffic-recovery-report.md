# MyImageUpscaler — Consolidated Traffic Recovery & Growth Report (2026-11-21)

**Generated:** 2026-11-21  
**Property:** `sc-domain:myimageupscaler.com` | **GA4 Property:** `519826120`  
**Sources Merged:**

- Live Google Search Console API (`28d`, `90d`, July peak `Jul 1–28`, flagship daily `Oct 29–Nov 18`, Nov 16–18 spike)
- Live Google Analytics 4 API (`28d`, `90d`, `eventName × sessionDefaultChannelGroup`, true `landingPagePlusQueryString`, post-Nov-13 `Nov 14–20` source/medium)
- Blog SEO Audit (`audit-blog-seo.cjs --suggest` across 309 posts)
- Live HTTP/HTML/TTFB/hreflang/robots/`llms.txt` verification + Git branch & SEO backlog audit
- External GSC UI-only reports + Ahrefs free-plan audit (pulled `2026-11-21`, absorbed & cross-checked from `/home/joao/Downloads/myimageupscaler-seo-recommendations.md`)

---

## Executive Summary (TL;DR)

1. **The decline is severe, real, and still active.** Monthly GSC clicks dropped **~65% from July's peak** (`10,192` in July 2026 → `~3,500–3,760/mo` November pace). Over the latest 28 days (`Oct 22–Nov 18` vs `Sep 24–Oct 21`), total Web clicks fell **−17.44%** (`4,260 → 3,517`). Strip out `+124` off-topic clicks from `/blog/4-k-youtube-to-mp-4` (`6 → 130`, 76% bounce, `0` key events), and real on-topic clicks fell **−20.24%** (`4,254 → 3,393`).
2. **Two compounding root causes explain the bleeding:**
   - **Site-wide index/footprint bloat & spam-update pressure (GSC UI + Ahrefs):** Google indexes only **753 pages** while excluding **3,640**, including **939 "Crawled - currently not indexed"** pages (up from `446` on Oct 23; ~352 English blog posts, ~135 `/en/blog` parameter/pagination residue, and thin translated pSEO templates). **592 of the top 1,000 pages got 0 clicks** over 3 months, ~43 overlapping `"best / enhancer / upscaler"` blog posts cannibalize each other, **196/196 mobile URLs fail CWV** (`LCP > 4s`, `INP > 200ms`), and **27 of the top 51 referring domains by DR in Ahrefs are flagged SPAM**. The steepest slide aligns with Google's **Sep 24–Oct 8, 2026 spam update** (though no manual actions exist).
   - **Self-inflicted execution & product-funnel bottlenecks:** Tested recovery commits from **Nov 1** (`release/miu-recovery-20261101`: `"AI image upscaler"` homepage hero copy, GA4 `sign_up` attribution, static pSEO caching) and **Nov 16** (`6f9e1a46`: homepage LCP `fetchPriority="high"` + 2× logo) are **still sitting undeployed in git**. Meanwhile, GA4 `sign_up` = `0`, Google OAuth & Stripe still trigger referral splits, and **235+/mo engaged organic users** on booming zero-signup `/tools/*` pages generate only `11` key events because `InteractiveTool.tsx` lacks a post-download AI Upscaler CTA and event tracking.
3. **Critical silver linings proving commercial demand is intact:**
   - Organic `begin_checkout` in GA4 **rose +56%** (`82 → 128`) and total purchases held steady (`18 → 19`), even as sessions fell `-15.4%`.
   - **`/tools/` is the ONLY major growing section (+13.5% clicks)** with 80–90% GA4 engagement — driven by free, zero-signup interactive tools (`/tools/make-image-transparent`, `/tools/remove-bg`, `/tools/image-cutout-tool`).
   - **Google Image Search (`+32.3%` clicks, `+28.7%` impressions)** and **Reddit referrals (`+66.5%`, 302 sessions/28d)** are both actively expanding, and **AI Assistant (`gemini.google.com`)** converts at **92.2% engagement**.
4. **Core strategic pivot:** **Stop writing generic blog posts into Google AI Overviews (`0.58%` blog CTR, 149K AI impressions).** Instead: **(1) deploy the already-tested git fixes & fix GA4 tracking immediately**, **(2) prune/consolidate thin and overlapping bloat instead of adding pages**, **(3) push and monetize the surging zero-signup `/tools/*` & `/alternatives/*` winners**, **(4) rebuild the homepage and flagship post with real hands-on benchmarks (and test a 1-image guest upscale trial)**, **(5) fix mobile CWV/INP**, and **(6) replace spam directory links with real editorial authority & Reddit/GEO distribution**.

---

## 1. Data Sources, Completeness & Cross-Verification

| Source                  | Current Window                            | Previous Window                          | Status & Key Integrity Notes                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GSC API (28d)**       | `2026-10-22` → `2026-11-18`               | `2026-09-24` → `2026-10-21`              | `complete: true`, `fetchFailures: []`. 3-day holdback applied. **Query click coverage: `52.46%`** (`1,672/3,517` clicks privacy-hidden); query impression coverage: `55.49%` (`141,212/317,274` hidden). `15,371` query rows, `811` page rows. |
| **GSC API (90d)**       | `2026-08-21` → `2026-11-18`               | `2026-05-23` → `2026-08-20`              | `complete: true`, `fetchFailures: []`.                                                                                                                                                                                                         |
| **GSC API (Custom)**    | `2026-11-11` → `2026-11-18` & `Nov 16–18` | `2026-07-01` → `2026-07-28` & `Nov 1–10` | Direct finalized API queries for July peak comparison, flagship Nov 11–18 drop, and Nov 16–18 `remove background` spike. Partial freshness checked `Nov 19–21`.                                                                                |
| **GA4 API (28d & 90d)** | `2026-10-24` → `2026-11-20`               | `2026-09-26` → `2026-10-23`              | Property `519826120`, 1-day lag. GSC/GA4 ratio `3,517 / 4,020 = 0.87` (`google / organic` = `3,623` sessions; healthy `0.6–1.6` range). Also queried `Nov 14–20` post-deploy, `eventName × channel`, and true `landingPagePlusQueryString`.    |
| **Blog SEO Audit**      | Against 28d & 90d GSC                     | —                                        | `309` posts audited: `94` errors (`124` over 90d), `119` warnings, `98` below CTR benchmark, `91` low title/query keyword overlap, `41` length issues, `8` intent mismatches (`19` over 90d).                                                  |
| **GSC UI-Only Reports** | Snapshot pulled `2026-11-21`              | —                                        | Absorbed from external audit: Page Indexing (`753` indexed / `3,640` not indexed / `939` crawled-not-indexed), CWV (`196/196` Mobile Poor), Generative AI (`149K` imp/3mo), Manual Actions (`0` — clean), Links (`968` external).              |
| **Ahrefs (Free Plan)**  | Snapshot pulled `2026-11-21`              | —                                        | Absorbed from external audit: DR `34`, `1,528` referring domains (`27/51` top DR flagged SPAM), `1.2K` AI prompt mentions (`-145`), Ahrefs Web Analytics (`8.2K` visitors, SG+CN bot share).                                                   |
| **Repo & Live Checks**  | `2026-11-21`                              | —                                        | Checked `master` vs `release/miu-recovery-20261101`, `seo-changes-backlog.md`, `gsc-request-indexing-backlog.md` (7 pending rows), `three-kings-ledger.json`, live headers/TTFB/HTML/hreflang/robots/`llms.txt`.                               |

---

## 2. External AI Audit Cross-Check (Absorbed vs. Corrected)

The external audit in `/home/joao/Downloads/myimageupscaler-seo-recommendations.md` surfaced critical GSC UI and Ahrefs blind spots that the API cannot see. Cross-checking those claims against our codebase, GA4, live production HTML, and experiment backlogs separates signal from dangerous missteps:

### Absorbed High-Value Findings

- **Severe indexation & footprint bloat:** `753` indexed vs `3,640` not indexed (`939` _Crawled - currently not indexed_, more than double the `446` reported on Oct 23), including ~352 unindexed English blog posts, and `592/1,000` top pages earning `0` clicks over 3 months.
- **Keyword cannibalization at scale:** ~43 blog posts competing across `"best / photo enhancer / upscaler"` variants, dragging head-group rankings (`image upscaler free` pos `30`, `free image upscaler` pos `33`, `ai image upscaler` pos `26`, `ai image enhancer free` pos `42`).
- **Spam-update timing & backlink quality toxicity:** Steepest click drop coincides with the **Sep 24–Oct 8, 2026 spam update**; **No manual actions** exist, but **27 of the top 51 referring domains by DR in Ahrefs are flagged SPAM** (launch directories + `buybacklinks.agency`), inflating perceived DR (`34`) while passing little or zero ranking trust.
- **Field Core Web Vitals failure:** **196/196 mobile URLs rated Poor** (`LCP > 4s`, `INP > 200ms`) and **196 desktop URLs "Needs improvement"** (`LCP > 2.5s`).
- **Generative AI click drain & AI visibility loss:** **149K GSC AI impressions (~14% of total)** concentrated on informational blog posts (`poster-size-dimensions-pixels` `28.4K`, flagship `13.6K`, `topaz-labs-free-trial` `13.0K`, `photoshop-upscale-image` `8.7K`); Ahrefs AI mentions fell `-145` to `1.2K` (AI Mode `-132`, ChatGPT `-32`), while long prompt-style searches (`2.5K` imp at pos `4.7`) appear in GSC.
- **Bot inflation in Direct/Analytics:** Singapore (`1,430` visitors) + China (`705` visitors) account for ~26% of Ahrefs Web Analytics visitors, explaining why GA4 `Direct` (`4,680` sessions) shows a `17.9%` engagement rate while Organic Search sits at `76.7%`.
- **Weak ROI on translated pSEO/locales:** Non-English pages produce only ~4% of clicks (`~660` over 3 months), while `/fr`, `/de`, `/ja` homepages occasionally surface for English `"image upscaler"` impressions.

### Corrected / Refined Using Codebase, GA4 & Backlog Evidence

| External Audit Claim                                                                               | Verification Finding & Necessary Correction                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Decide whether `/tools/ai-image-upscaler` serves a different intent; if not, 301 it into `/`"** | **Do NOT 301 it blindly.** Live GSC shows `/tools/ai-image-upscaler` generates `102` clicks/28d (`4.33%` CTR) and is the #1 owner for `"image upscaler 8x"` (`35` clicks, pos `8.1`). Our August GIF 301 consolidation cost ~600 clicks/mo (`476 → 22`). Keep `/tools/ai-image-upscaler`, fix its `1.50s` TTFB cache issue, and differentiate it cleanly as the dedicated 8×/tool route.                                                                             |
| **"Add conversion tracking in GA4 (P0)"**                                                          | **All 15 expected GA4 key events are already configured**, and `begin_checkout` is actively tracking (`82 → 128` organic, `+56%`). The real gap is that **`d2499483` (`sign_up` / `signup_completed` browser tracking + null-param fix) is stuck unmerged on `release/miu-recovery-20261101`**, `purchase` events still land in `Unassigned` (`19/19`), and GA4 Admin lacks `accounts.google.com` / `checkout.stripe.com` referral exclusions.                       |
| **"Stop `/en/blog?page=` & `?q=` from being crawled / add noindex"**                               | **Already fixed in code & live.** Verified live via `curl`: `https://myimageupscaler.com/en/blog?page=2` returns `301 → /blog?page=2`, and `/blog?page=2` serves `<meta name="robots" content="noindex, follow"/>` + canonical `https://myimageupscaler.com/blog` (with `prefetch={false}` shipped in `9ec164ea` on Nov 13). Those ~135 GSC entries are receding crawl residue — do not block via `robots.txt` yet or Google cannot see the `noindex`/301.           |
| **"`remove background` jumped to page 1 (4K–8K imp/day); 2% CTR = 120 clicks/day"**                | **Caution — mostly a recurring phantom spike.** `13,530` of those impressions happened on Nov 16–18 alone with only `8` clicks (`0.058%` CTR), repeating the exact Sep 24–26 `24,660`-impression phantom burst. Do not forecast `120` clicks/day from that query; **do** invest in `/tools/remove-bg` because its _real_ converting queries (`background remover`, `background remove`, `background remover free`) pushed GA4 organic sessions `9 → 62` (**+589%**). |
| **"Update Topaz title now" & "State '5 free credits' on homepage"**                                | **Two guardrail violations to avoid:** (1) `/blog/topaz-labs-free-trial` is in an active Three Kings rung-3 window exposed Nov 19 (recrawl check **Nov 23**, verdict **Dec 7**) — do not edit it mid-window; (2) Free signup credits are region-tiered (`5 / 3 / 0`) per Product Truth (`b90c56da`), so never hardcode `"5 free credits"` globally.                                                                                                                  |
| **"The homepage loads 94 scripts"**                                                                | **Nuanced in live HTML:** `curl` shows `90` `<script>` tags, the majority being Next.js App Router inline RSC flight chunks (`self.__next_f.push`), not 90 external third-party bundles. The INP (`>200ms`) and LCP issues require trimming client hydration weight and deferring third-party analytics/tags + shipping `6f9e1a46` (`fetchPriority="high"`).                                                                                                         |
| **"Fix hreflang so `/fr`, `/de`, `/ja` stop showing for English searches"**                        | **Root `/` and `/fr` hreflang tags are already valid and symmetric** (verified live: canonical `/fr` + all 7 `hreflang` + `x-default`). English-query leakage is driven by low domain authority and template similarity, though inner pSEO `hreflang` parity should still be checked.                                                                                                                                                                                |

---

## 3. Complete Performance Diagnosis (GSC + GA4 + Ahrefs)

### 3.1 Non-Brand First — 28-Day & 90-Day Web Search Summary

| Segment                                            | Prev 28d (`Sep 24–Oct 21`) | Cur 28d (`Oct 22–Nov 18`) |                28d Change | 90d (`May 23–Aug 20` → `Aug 21–Nov 18`) |
| -------------------------------------------------- | -------------------------: | ------------------------: | ------------------------: | --------------------------------------- |
| **Non-brand clicks (classified)**                  |                      2,049 |                     1,713 |        **−16.40% (−336)** | `6,857 → 6,710` (−2.14%)                |
| **Non-brand impressions**                          |                    170,488 |                   171,909 |                    +0.83% | `526,895 → 534,821` (+1.50%)            |
| **Non-brand avg position**                         |                      12.12 |                     18.07 |           **+5.95 worse** | `14.12 → 15.82` (+1.69 worse)           |
| **Unclassified clicks (privacy-hidden)**           |                      2,034 |                     1,672 |        **−17.80% (−362)** | `9,591 → 7,039` (−26.61%)               |
| **Branded clicks (classified)**                    |                        177 |                       132 |         **−25.42% (−45)** | `5,516 → 1,060` (−80.78%)               |
| **Total Web clicks**                               |                  **4,260** |                 **3,517** |        **−17.44% (−743)** | **`21,964 → 14,809` (−32.58%)**         |
| **On-topic clicks (ex `4-k-youtube-to-mp-4`)**     |                      4,254 |                     3,393 |        **−20.24% (−861)** | —                                       |
| **Impressions (raw)**                              |                    311,405 |                   317,274 | +1.88% _(spike-inflated)_ | `998,992 → 1,017,960` (+1.90%)          |
| **Impressions (ex Nov 16–18 `remove background`)** |                   ~311,405 |                  ~303,744 |                **−2.46%** | —                                       |
| **Web CTR (raw)**                                  |                      1.37% |                     1.11% |              **−0.26 pt** | `2.20% → 1.45%` (−0.74 pt)              |
| **Stable-cohort position (647 / 780 pages)**       |                       9.88 |                     13.14 |           **+3.26 worse** | `12.01 → 12.38` (+0.37 worse)           |

- **Search-type mix (28d):** Web `3,517` clicks (`-17.44%`); **Image Search `41` clicks / `39,829` imp (`+32.26%` clicks, `+28.74%` imp, avg pos `42.69 → 40.76`)**; Video/News/Discover/Google News = `0`. (90d Image Search: `85` clicks, `101,859` imp.)
- **Quarantined queries:** `quarantinedQueries` = `[]` in 28d (threshold `>5,000 imp` & `<0.05% CTR`), because `remove background` hit `13,747` impressions / `8` clicks = `0.058%` CTR — just above the `0.05%` filter, with `13,530` of those impressions occurring Nov 16–18 alone.

### 3.2 Monthly Trajectory (2026) & Weekly Breakdown

| Month                  |                    Clicks | Impressions |       CTR |   Avg Pos |
| ---------------------- | ------------------------: | ----------: | --------: | --------: |
| 2026-01                |                        15 |         248 |     6.05% |     59.02 |
| 2026-02                |                       412 |       2,045 |    20.15% |     15.64 |
| 2026-03                |                     1,583 |      48,558 |     3.26% |     20.98 |
| 2026-04                |                     2,316 |      93,225 |     2.48% |      9.84 |
| 2026-05                |                     2,114 |     109,415 |     1.93% |     13.06 |
| 2026-06                |                     5,586 |     297,011 |     1.88% |     11.09 |
| **2026-07 (Peak)**     |                **10,192** | **394,106** | **2.59%** |     11.61 |
| 2026-08                |                     7,589 |     380,227 |     2.00% |     17.12 |
| 2026-09                |                     5,942 |     363,626 |     1.63% |     10.51 |
| 2026-10                |                     4,334 |     310,570 |     1.40% |     11.69 |
| 2026-11 (18d complete) | 2,256 _(~3,760/30d pace)_ |     217,848 | **1.04%** | **13.56** |

**Latest 13 Complete Weeks (Aug 20 → Nov 18):**

- `Aug 20–26`: `1,260` | `Aug 27–Sep 2`: `1,420` | `Sep 3–9`: `1,588` | `Sep 10–16`: `1,326` | `Sep 17–23`: `1,438` (peak non-brand `759`)
- `Sep 24–30` _(Spam update begins)_: `1,187` | `Oct 1–7`: `1,131` | `Oct 8–14`: `1,064` | `Oct 15–21`: `878`
- **28d Window:**
  - `Oct 22–28`: **909** (426 non-brand / 35 brand / 448 unclass) | 68,275 imp
  - `Oct 29–Nov 4`: **900** (432 / 36 / 432) | 75,054 imp
  - `Nov 5–11`: **899** (443 / 32 / 424) | 78,917 imp
  - `Nov 12–18`: **809** (**−10.0% WoW**, 412 / 29 / 368) | **95,028 imp** _(Nov 16–18 spike)_
- **Partial freshness (`Nov 19–21`):** `112` (Nov 19), `108` (Nov 20), `64` partial (Nov 21) — still ~110 clicks/day (~770/wk pace), **no organic rebound yet**.

### 3.3 Two Distinct Eras of Loss

#### Era 1: July Peak (`Jul 1–28`) → Now (`Oct 22–Nov 18`)

- **Branded surge ended (−2,149 clicks/28d at pos `1.0–1.2`):** `myimageupscaler` fell `1,490 → 47` and `my image upscaler` fell `764 → 58` while holding #1 position.
- **GIF 301 consolidation loss (−589 clicks/28d):** `/formats/upscale-gif-images` fell `476 → 22` (pos `7.9 → 15.7`) and `/format-scale/gif-upscale-16x` fell `135 → 0`.
- **Flagship Sep 10 rewrite & visibility slide (−1,472 clicks/28d):** `/blog/best-free-ai-image-upscaler-2026-tested-compared` fell `1,622 → 150` (`41,326 → 6,873` impressions).

| Page (July `Jul 1–28` → Current `Oct 22–Nov 18`)         |       Clicks Jul → Now |      Delta |               Imp Jul → Now |            Pos Jul → Now |
| -------------------------------------------------------- | ---------------------: | ---------: | --------------------------: | -----------------------: |
| `/` (homepage)                                           |          4,604 → 1,112 | **−3,492** |             66,283 → 46,729 |               9.8 → 12.9 |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` |            1,622 → 150 | **−1,472** |              41,326 → 6,873 |                5.8 → 5.9 |
| `/formats/upscale-gif-images`                            |               476 → 22 |   **−454** |                 6,971 → 597 |               7.9 → 15.7 |
| `/tools/ai-image-upscaler`                               |              490 → 102 |   **−388** |               8,837 → 2,353 |               5.6 → 11.7 |
| `/scale/upscale-16x`                                     |               285 → 92 |   **−193** |               4,579 → 1,445 |                7.5 → 9.3 |
| `/format-scale/gif-upscale-16x`                          |                135 → 0 |   **−135** |                   2,159 → 0 |                  7.3 → — |
| `/blog/topaz-labs-free-trial`                            |               184 → 74 |   **−110** |             25,957 → 10,367 |                7.9 → 6.1 |
| `/blog/free-ai-upscaler-no-watermark`                    |                 98 → 3 |    **−95** |                 4,272 → 202 |               6.0 → 11.4 |
| `/fr` / `/es`                                            | `96 → 20` / `105 → 42` |  −76 / −63 | `968→1,526` / `2,532→1,768` | `8.3→18.9` / `12.8→19.6` |

**Top Gainers Since July (`Jul 1–28` → `Oct 22–Nov 18`):** `/blog/4-k-youtube-to-mp-4` (`0 → 130`, off-topic), `/tools/make-image-transparent` (`12 → 90`), `/scale/image-upscaler-8k` (`3 → 80`), `/tools/remove-bg` (`5 → 57`), `/scale/upscale-to-8k` (`60 → 100`), `/ai-features/ai-artifact-removal-upscaler` (`0 → 37`), `/blog/what-resolution-for-print` (`8 → 38`), `/tools/resize/resize-image-for-telegram` (`9 → 37`).

#### Era 2: Latest 28 Days (`Sep 24–Oct 21` → `Oct 22–Nov 18`)

- **Homepage `/` lost −370 clicks (`1,482 → 1,112`, 50% of net 28d drop)** as position slid `10.1 → 12.9`:
  - `upscaler`: `144 → 38` (`−106` clicks, imp `10,378 → 2,266`, pos `9.0 → 9.2`)
  - `image upscaler`: `506 → 416` (`−90` clicks, imp `25,136 → 18,989`, pos `9.3 → 9.9`)
  - `image upscaler 4k`: `102 → 57` (`−45` clicks, imp `2,466 → 1,878`, pos `8.2 → 8.8`)
- **Head-term `"image upscaler"` on `/` sits on a Page-1/Page-2 cliff:**

| Week (`Sep 24 → Nov 18`) | Clicks | Impressions |   CTR | Weighted Pos |
| ------------------------ | -----: | ----------: | ----: | -----------: |
| `Sep 24–30`              |    148 |       6,404 | 2.31% |         8.92 |
| `Oct 1–7`                |    168 |       8,627 | 1.95% |         8.87 |
| `Oct 8–14`               |    112 |       6,413 | 1.75% |         9.61 |
| `Oct 15–21`              |     78 |       3,692 | 2.11% |        10.32 |
| `Oct 22–28`              |    107 |       5,117 | 2.09% |         9.79 |
| `Oct 29–Nov 4`           |     93 |       4,404 | 2.11% |        10.01 |
| `Nov 5–11`               |    113 |       5,842 | 1.93% |         9.64 |
| `Nov 12–18`              |    103 |       3,626 | 2.84% |        10.32 |

- **Flagship post broke sharply on Nov 11–18:** `/blog/best-free-ai-image-upscaler-2026-tested-compared` held steady at **8–11 clicks/day (`pos 4.8–5.4`)** on Nov 5–10, then plunged to **0–2 clicks/day (`pos 6.8–6.9`)** on Nov 15–18 (`58 → 15` clicks WoW, **−74%**). Core queries `best free image upscaler` (`7.8 → 9.3`) and `best free upscaler` (`7.3 → 10.0`) slid to the bottom of Page 1.
- **Other 28d losses:** `/tools/ai-image-upscaler` (`185 → 102`, CTR `8.14% → 4.33%`), `/scale/upscale-8x` (`63 → 17`, pos `9.3 → 15.4`), `/blog/topaz-labs-free-trial` (`116 → 74`), `/blog/best-free-ai-photo-enhancer-online` (`58 → 17`), `/blog/free-ai-upscaler-no-watermark` (`35 → 3`).

### 3.4 Section, Device, Country & Locale Breakdown (28d)

| Section            | Prev Clicks | Cur Clicks |        Click Delta |          Cur Imp |   Cur CTR |  Cur Pos | Strategic Read                                                 |
| ------------------ | ----------: | ---------: | -----------------: | ---------------: | --------: | -------: | -------------------------------------------------------------- |
| `(home)`           |       1,613 |      1,202 | **−411 (−25.48%)** |           51,799 |     2.32% |    13.86 | Bleeding on Page-1/Page-2 cliff                                |
| `blog`             |       1,393 |      1,136 | **−257 (−18.45%)** | 197,413 (+11.3%) | **0.58%** |    12.59 | Crushed by AI Overviews + bloat                                |
| `scale`            |         488 |        423 |      −65 (−13.32%) |           10,018 | **4.22%** |    14.62 | High CTR, 93% GA engagement (`8k` surging, `8x` split)         |
| **`tools`**        |     **347** |    **394** |  **+47 (+13.54%)** |  52,899 (+13.7%) |     0.74% |    17.46 | **ONLY major growing section** (zero-signup interactive tools) |
| `format-scale`     |         125 |         85 |      −40 (−32.00%) |            2,234 | **3.80%** |    12.15 | High CTR commercial long-tail                                  |
| `formats`          |          96 |         70 |      −26 (−27.08%) |            1,225 | **5.71%** |    11.63 | High CTR                                                       |
| `ai-features`      |          80 |         68 |      −12 (−15.00%) |            1,605 | **4.24%** |    11.75 | `ai-artifact-removal-upscaler` up `0 → 37` since July          |
| `platforms`        |          33 |         37 |   **+4 (+12.12%)** |            1,162 |     3.18% |     8.44 | `photoshop-upscaler` growing                                   |
| **`alternatives`** |      **27** |     **36** |   **+9 (+33.33%)** |   3,334 (+77.7%) |     1.08% | **8.09** | Rapid visibility gain, suppressed by weak titles               |
| `use-cases`        |          25 |         20 |       −5 (−20.00%) |              302 | **6.62%** |    16.74 | `anime-image-upscaler` emerging                                |

- **Device split (28d):** Desktop `2,353 → 1,952` (`−17.0%`, pos `9.89 → 14.13`, CTR `0.84%`) and Mobile `1,829 → 1,483` (`−18.9%`, pos `9.97 → 12.00`, CTR `1.82%`) dropped evenly.
- **Locale split (28d):** English `4,122 → 3,432` (`−690` of `−743` net loss); Spanish `89 → 49`; French `31 → 30`; Portuguese `20 → 12`; German `11 → 14`. Non-English locales deliver only ~4% of total clicks (`~660` over 3 months).
- **Country split (28d):** Biggest drops came from Indonesia (`−119`), India (`−101`), Germany (`−64`), Italy (`−56`), Spain (`−55`), Russia (`−30`), Brazil (`−27`); USA dropped only `−23` (`667 → 644` clicks on `~108K` imp).

### 3.5 Indexation, Footprint Bloat, CWV, Backlinks & AI Visibility (UI + Ahrefs)

- **GSC Page Indexing (`2026-11-21` UI):**
  - **753 indexed** vs **3,640 not indexed** (shrinking since mid-September).
  - **939 "Crawled - currently not indexed"** (up from `446` on Oct 23): ~352 English blog posts, ~135 `/en/blog?page=` / `?q=` listing URLs (already 301 + `noindex` as of Nov 13 `9ec164ea`), plus translated pSEO templates (`platform-format`, `format-scale`, `device-use`, localized blog/tools).
  - Other exclusions: `noindex` tag (`1,159`), redirects (`802`), alternate canonical (`533`), `404` (`134`), Google chose different canonical (`52`), `5xx` (`2`).
  - **Zero-click waste:** **592 of the top 1,000 pages** by impressions got **0 clicks** in 3 months; `~25%` of `767` submitted sitemap URLs earn 0 impressions.
- **Core Web Vitals (`2026-11-21` UI + live TTFB):**
  - **Mobile:** **196/196 URLs rated Poor** (`LCP > 4s`, `INP > 200ms`); validation started, 0 Good URLs.
  - **Desktop:** **196/196 URLs "Needs improvement"** (`LCP > 2.5s`).
  - **Live production TTFB checks (`2026-11-21`):** `/` = `0.18s` (`HIT`), `/blog/poster-size-dimensions-pixels` = `0.04s` (`HIT`), `/blog/best-free-ai-image-upscaler-2026-tested-compared` = `0.30s` (`HIT`), `/tools/make-image-transparent` = `STALE`, **`/tools/ai-image-upscaler` = `1.50s` TTFB** because [app/(pseo)/tools/[slug]/page.tsx](<file:///home/joao/projects/myimageupscaler.com/app/(pseo)/tools/[slug]/page.tsx#L18>) still has `revalidate = 86400` on `master`.
- **Backlinks & Spam Profile (GSC + Ahrefs):**
  - GSC Links: `968` external links (`503` to `/`, `208` from `reddit.com`, rest mostly tool directories).
  - Ahrefs: **DR 34 (−1)**, `1,528` referring domains (`−24` in 30d), **`27/51` top DR referring domains flagged SPAM** (launch directories + `buybacklinks.agency`). Real domain authority is far weaker than DR 34 implies, capping competitive head terms (`ai image upscaler`, `upscale image`, `image upscaler free`) at positions `22–36`.
- **Generative AI & LLM Visibility:**
  - **149K GSC AI impressions (~14% of site total, 3mo):** `poster-size-dimensions-pixels` (`28.4K`), flagship (`13.6K`), `topaz-labs-free-trial` (`13.0K`), `photoshop-upscale-image` (`8.7K`).
  - **Ahrefs AI mentions:** `1.2K` prompts (`−145` in 30d): AI Overviews `346` (`+7`), AI Mode `301` (`−132`), ChatGPT `63` (`−32`).
  - **Live [app/llms.txt/route.ts](file:///home/joao/projects/myimageupscaler.com/app/llms.txt/route.ts) defect:** Live `/llms.txt` still advertises `"up to 4x resolution"` (actual max is 8×/16×), omits the booming free interactive tools, and hardcodes `?utm_source=chatgpt` on every link.

### 3.6 GA4 Channel Mix, Bot Noise, Funnel Events & Conversion Leaks

| Channel (`Oct 24–Nov 20`) |  Sessions |      Delta | Share | Eng. Rate | Key Events | Notes                                                                                                |
| ------------------------- | --------: | ---------: | ----: | --------: | ---------: | ---------------------------------------------------------------------------------------------------- |
| Direct                    |     4,680 |      +5.0% | 47.8% | **17.9%** |        803 | Inflated by ~26% SG (`1,430`) + CN (`705`) bot traffic                                               |
| **Organic Search**        | **4,020** | **−15.4%** | 41.1% | **76.7%** |      3,025 | Google `3,623`, Bing `286`, DuckDuckGo `52`, Yahoo `18`, Ecosia `14`                                 |
| **Referral**              |   **359** | **+54.7%** |  3.7% |     73.3% |        533 | **Polluted:** `accounts.google.com` (`300`), `checkout.stripe.com` (`17`), `search.brave.com` (`17`) |
| **Unassigned**            |       328 |     −54.8% |  3.4% |     45.1% |  **6,391** | Holds **100% of `purchase` (`19/19`)** & **99.95% of `generate_lead` (`3,695/3,697`)**               |
| **Organic Social**        |   **308** | **+66.5%** |  3.2% | **74.0%** |         81 | `reddit.com / referral`: **302 sessions** (doubling!)                                                |
| AI Assistant              |        77 |     −31.3% |  0.8% | **92.2%** |         81 | `gemini.google.com`: `74` sessions (`91.9%` eng); ChatGPT/Perplexity near zero                       |

**Four Critical GA4 Findings:**

1. **`sign_up` / `signup_completed` = `0` events in GA4** because `d2499483` in `release/miu-recovery-20261101` is unshipped.
2. **Commercial purchase intent is NOT dying:** Organic `begin_checkout` **jumped +56%** (`82 → 128`), and total `purchase` events stayed flat (`18 → 19`), though still 100% `Unassigned`.
3. **OAuth & Stripe self-referrals are STILL breaking organic sessions post-Nov-13 (`Nov 14–20`):** `accounts.google.com / referral` (`85` sessions, `56` key events) and `checkout.stripe.com / referral` (`11` sessions, `33` key events) continue splitting sessions because GA4 Admin referral exclusions are missing. (`file_picker` / `drag_drop` still show `38` / `9` residual sessions from GA4's 90-day last-non-direct window even though [shared/analytics/types.ts](file:///home/joao/projects/myimageupscaler.com/shared/analytics/types.ts#L52-L81) already aliases them.)
4. **Massive conversion leak on zero-signup `/tools/*` pages (true `landingPagePlusQueryString`):**

| Landing Page                                             | Organic Sessions (Prev → Cur) |     Eng. Rate |  Key Events | Diagnostic                                      |
| -------------------------------------------------------- | ----------------------------: | ------------: | ----------: | ----------------------------------------------- |
| `/`                                                      |               `1,435 → 1,068` |         83.1% |       1,262 | Core converter, losing top-of-funnel volume     |
| `/blog/best-free-ai-image-upscaler-2026-tested-compared` |                   `232 → 182` |         89.6% |         185 | Strong intent & engagement, Nov 11–18 rank drop |
| `/scale/upscale-to-8k` & `/scale/image-upscaler-8k`      |            `113→99` / `81→94` | 93.9% / 93.6% | **97 / 62** | Converts well into app usage                    |
| `/tools/make-image-transparent`                          |             `32 → 84` (+163%) |     **83.3%** |       **6** | **Leaking!** Zero inline upsell after download  |
| `/tools/remove-bg`                                       |              `9 → 62` (+589%) |     **83.9%** |       **2** | **Leaking!** Zero inline upsell after download  |
| `/tools/image-cutout-tool`                               |              `40 → 50` (+25%) |     **80.0%** |       **2** | **Leaking!** Zero inline upsell after download  |
| `/tools/remove-gps-from-photo`                           |             `19 → 39` (+105%) |     **89.7%** |       **1** | **Leaking!** Zero inline upsell after download  |
| `/blog/4-k-youtube-to-mp-4`                              |            `3 → 86` (+2,767%) |     **24.4%** |       **0** | Pure off-topic bounce traffic                   |

Why the leak? [InteractiveTool.tsx](<file:///home/joao/projects/myimageupscaler.com/app/(pseo)/_components/tools/InteractiveTool.tsx#L170-L210>) emits **zero analytics events** on process/download and displays **no contextual upsell next to "Download Result"**; the static `PostToolCTA` in [InteractiveToolPageTemplate.tsx](<file:///home/joao/projects/myimageupscaler.com/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate.tsx#L112-L133>) sits disconnected below the widget and links cold to `/?signup=1`.

---

## 4. Opportunities Inventory (Quick Wins, Cannibalization, Technical)

### 4.1 Real Quick Wins (Non-Phantom, Page 1 / Top of Page 2)

| Query / Cluster                  | Clicks (28d) |            Imp (28d) |       CTR |     Pos | Owner URL                           | Action & Upside                                                                              |
| -------------------------------- | -----------: | -------------------: | --------: | ------: | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `image upscaler`                 |          429 |               19,913 |     2.15% |    10.3 | `/`                                 | Deploy `d12d6d1c` + `6f9e1a46` + editorial links (`pos 10.3 → 8.8` = **+300–550 clicks/mo**) |
| `make image transparent` cluster |           36 |                4,073 | **0.88%** |     9.1 | `/tools/make-image-transparent`     | Snippet + FAQ + internal links (**+200–400 clicks/mo**)                                      |
| `upscaler`                       |           41 |                2,467 |     1.66% |     9.9 | `/`                                 | Moves with homepage head-term recovery                                                       |
| `image upscaler 4k`              |           57 |                1,907 |     2.99% |     9.6 | `/` & `/scale/4k-image-upscaler`    | Push `/` + link internal anchors to `/scale/4k-image-upscaler` (pos `14.8`)                  |
| `image cutout` / subject extract |           12 |                1,405 | **0.85%** | **5.3** | `/tools/image-cutout-tool`          | Pos `5.3` with `<1%` CTR; rewrite title/meta for exact free-cutout intent                    |
| `iloveimg upscaler` cluster      |            6 |                  856 | **0.70%** |     9.2 | `/alternatives/vs-iloveimg`         | Fix broken live title (`"Better & Specialization"`) + above-fold table                       |
| `adobe express image upscaler`   |            4 |                1,114 | **0.36%** |     9.0 | `/alternatives/vs-adobe-express`    | Add above-fold limits table + links from Photoshop/Adobe blog posts                          |
| `background remover` / `free`    |           57 | ~13,900 _(ex-spike)_ |     ~0.4% |   14–44 | `/tools/remove-bg`                  | Lead snippet with true `"No Signup, No Watermark, In-Browser"` + links                       |
| `chatgpt` / DALL-E high-res      |            3 |                  406 |     0.74% | **4.1** | `/blog/how-to-upscale-dalle-images` | Blog audit: only `10%` title overlap with top ChatGPT resolution queries                     |

### 4.2 Content Creation — Do NOT Build New Head-Term Pages

Top `contentCreation` queries (`ai image upscaler` `1,201` imp @ `26.0`, `upscale image` `421` @ `35.8`, `image upscaler free` `423` @ `31.9`, `image upscaler ai` `372` @ `22.7`, `image enhancer` `340` @ `28.8`) are **already owned by `/`**. Adding pages would worsen index bloat and split signals.

### 4.3 Cannibalization & Duplicate Footprint

- **~43 overlapping `"best / photo enhancer / upscaler"` blog posts:** At least 10 URLs split `"photo enhancer"` (`best-free-ai-photo-enhancer-online` pos `42.9`, `best-ai-image-quality-enhancer-free` `20.8`, `best-ai-photo-enhancer` `25.4`, `best-ai-image-enhancer` `12.4`, `best-ai-photo-enhancer-reddit` `7.1`, `free-photo-enhancer-no-signup` `28.3`, `/free/free-photo-enhancer` `45.6`).
- **`image upscaler 8x` (9 URLs, 599 imp, 38 clicks):** `/tools/ai-image-upscaler` (`35` clicks, pos `8.1`) vs `/blog/image-upscaler-8x` (`1` click, `309` imp, pos `9.7`) vs `/scale/upscale-8x` (`27 → 1` click, pos `8.7 → 23.8`). **Fix with internal linking & intent differentiation, NOT 301s.**
- **`upscale gif` (4 URLs):** `/blog/gif-upscaler` (`15` clicks, pos `10.7`) vs `/formats/upscale-gif-images` (`2` clicks, pos `15.7`). Leave the Aug 301 alone; keep blog as educational owner.

### 4.4 Undeployed Fixes & Technical Blockers in Git

1. **`release/miu-recovery-20261101` is still unmerged:** Contains `d12d6d1c` (homepage `"AI image upscaler"` subhead/meta), `d2499483` + `8474395d`..`c5fda657` (GA4 `sign_up` / `signup_completed` attribution & auth race fixes), and `1df70e5a` (removes `revalidate = 86400` on static pSEO/homepage routes). Live `/` still serves `"AI photo enhancer that"`.
2. **`master` commit `6f9e1a46` (Nov 16) is undeployed:** Homepage LCP `fetchPriority="high"` + 2× navbar logo; live preload lacks `fetchpriority="high"`.
3. **`sitemap-static.xml`:** Shows `1` warning in GSC Sitemaps API (inspect in GSC UI).
4. **Pending indexing backlog:** `7` unique pending rows in [gsc-request-indexing-backlog.md](file:///home/joao/projects/myimageupscaler.com/docs/SEO/maintenance/gsc-request-indexing-backlog.md) (including `/blog/topaz-labs-free-trial`, post-write check due **Nov 23**).

---

## 5. Unified Prioritized Turnaround Roadmap (P0 → P6)

### P0 — Ship Tested Fixes & Repair Attribution/Bot Signal (First 48 Hours | Score: 96/100)

- **Owner Skills:** `nextjs-app-router`, `organic-funnel-attribution-repair-technique`, `seo-changes-backlog`
- **Actions:**
  1. Cherry-pick/merge from `release/miu-recovery-20261101` onto `master`: `d12d6d1c`, `d2499483` + auth signup race fixes (`8474395d`..`c5fda657`), and `1df70e5a` (remove `revalidate = 86400` on static pSEO/homepage routes while keeping `open-next.config.ts` tag-cache improvements already on `master`).
  2. Run `yarn verify` and **deploy `master`** (also ships `6f9e1a46` LCP `fetchPriority="high"` + 2× navbar logo).
  3. In **GA4 Admin → Data Streams → Configure tag settings → List unwanted referrals**, add `accounts.google.com`, `accounts.google.com.*`, and `checkout.stripe.com`.
  4. Audit server-side `purchase` and `generate_lead` (`upscale_completed`) GA4 Measurement Protocol payloads so Stripe/webhook purchases carry original GA4 `client_id` / `session_id` instead of falling into `Unassigned` (`19/19`).
  5. Filter Singapore & China bot traffic in analytics reporting views so Direct/visitor baselines aren't distorted.
  6. Manually click **Request indexing** in GSC UI for `/` (post-deploy) and `/blog/topaz-labs-free-trial` (post-Nov-23 crawl check). Update [seo-changes-backlog.md](file:///home/joao/projects/myimageupscaler.com/docs/SEO/maintenance/seo-changes-backlog.md).
- **Success Metrics & Dates:** `sign_up` live in GA4 within **48h**; `/tools/ai-image-upscaler` TTFB drops from `1.50s` to `<0.2s` immediately post-deploy; mobile PSI LCP `≤2.5s`; `image upscaler` moves `<9.2` by **Dec 7–14**.

### P1 — Prune & Consolidate Site Bloat to Lift Domain Quality Score (Weeks 1–2 | Score: 93/100)

- **Owner Skills:** `pseo-audit`, `pseo-page-quality-scoring-technique`, `cannibalization-consolidation-technique`, `blog-performance-monitor`
- **Actions:**
  1. **Pause all bulk blog/pSEO publishing** until _Crawled - currently not indexed_ drops meaningfully from `939`.
  2. **Audit the ~352 crawled-not-indexed English blog posts & `592/1,000` zero-click pages:** Group by `0` clicks / `0` backlinks / `0` GA signups over 90–180 days; prune (`410`/`noindex` + sitemap removal) dead weight and off-topic topical-authority drag (`/blog/4-k-youtube-to-mp-4`, `/blog/animation-maker-for-minecraft`, `/blog/windows-11-snap-layouts`, `/blog/convert-video-to-hd-1080-p-online-free` — verify `0` signups first).
  3. **Consolidate overlapping zero/low-click `"best / enhancer / upscaler"` blog clones in measured batches:** Map the ~43 overlapping posts to 5–8 distinct intent owners (e.g., _Best Free AI Image Upscaler_, _Best AI Photo Enhancer_, _Unblur/Sharpen Photos_, _Photo Restoration_, _GIF Upscaling_, _Topaz Free Trial & Alternatives_). Merge useful sections and `301` **only** zero/low-click duplicates — **do NOT 301 `/tools/ai-image-upscaler` or active Three Kings experiment pages**.
  4. **Trim dead pSEO templates:** `noindex` + sitemap-exclude zero-click `platform-format` (`45` pages, `13` clicks/3mo) and zero-click translated templates; audit `alternatives` (`50` pages, `115` clicks/3mo) to keep proven performers (`vs-adobe-express`, `vs-bigjpg`, `vs-waifu2x`, `vs-iloveimg`, etc.).
  5. Verify `/en/blog?page=` & `?q=` residue naturally drains out of GSC (`9ec164ea` + live 301/`noindex` already active) and inspect the `1` warning on `sitemap-static.xml`.
- **Success Metrics & Dates:** _Crawled - currently not indexed_ falls from `939` toward `<300` over **30–60 days**; indexation rate rises from `~17%` (`753/4,393`) and blog CTR improves from `0.58%`.

### P2 — Push & Monetize the Booming Zero-Signup `/tools/*` & `/alternatives/*` Winners (Weeks 1–3 | Score: 91/100)

- **Owner Skills:** `serp-ctr-snippet-rewrite-technique`, `search-intent-cta-mapping-technique`, `seo-money-page-lift-technique`, `blog-edit`
- **Actions:**
  1. **Wire post-download upsell + event tracking into [InteractiveTool.tsx](<file:///home/joao/projects/myimageupscaler.com/app/(pseo)/_components/tools/InteractiveTool.tsx>):** Right beside `"Download Result"` when `processedBlob` is ready, add a primary contextual button **`"Upscale This Image 4× with AI →"`** (transferring the processed blob to the workspace via IndexedDB/sessionStorage so users see their own image queued), plus emit sanitized `interactive_tool_processed`, `interactive_tool_downloaded`, and `post_tool_upsell_clicked` events.
  2. **Fix broken `/alternatives/*` snippets & tables:** Rewrite `/alternatives/vs-iloveimg` title (`"MyImageUpscaler vs iLoveIMG - Better & Specialization"` → `"iLoveIMG Upscaler Alternative: Limits & Quality (2026)"`) and add crisp above-fold comparison tables (free limits, max scale, watermark, signup required) on `/alternatives/vs-iloveimg` & `/alternatives/vs-adobe-express`.
  3. **Capture Page-1 CTR on surging free tools:** Tighten titles/H1s/FAQs and mobile upload UX on `/tools/make-image-transparent`, `/tools/remove-bg`, and `/tools/image-cutout-tool` — emphasizing true **"No Signup, No Watermark, Browser-Processed"** advantages against remove.bg/Canva/Adobe (while ignoring the Nov 16–18 phantom spike).
  4. **Build intentional internal-link funnels:** Link from `/blog/how-to-make-png-background-transparent-free`, `/blog/background-removal-website`, `/blog/removing-background`, `/blog/remove-image-background-google-slides` → `/tools/remove-bg` & `/tools/make-image-transparent`; link from Photoshop/Adobe posts → `/alternatives/vs-adobe-express`; link `/blog/image-upscaler-8x` → `/tools/ai-image-upscaler` (anchor `"8x AI image upscaler tool"`) to resolve the `8x` split.
- **Success Metrics & Dates:** Post-tool upsell CTR `≥8–12%` within **14 days**; CTR on `/tools/make-image-transparent` `0.88% → ≥2.5%` and `/alternatives/vs-iloveimg` `0.70% → ≥3.0%` (**+400–800 clicks/mo** by **Dec 15–22**).

### P3 — Rebuild Money Pages with Original Proof + Product-Led Guest Trial (Weeks 2–3 | Score: 86/100)

- **Owner Skills:** `blog-performance-monitor`, `blog-edit`, `copywriting`, `turnstile-spin`, `rate-limiting`
- **Actions:**
  1. **Flagship evidence rebuild (after confirming Nov 11–18 drop holds on Nov 26):** Upgrade `/blog/best-free-ai-image-upscaler-2026-tested-compared` with genuine first-hand testing of the same 5 inputs (noisy portrait, blurry text/logo, anime/line art, product shot, print file) across MyImageUpscaler, Upscale.media, Upscayl, Krea, Pixelcut, Bigjpg, and Adobe Firefly — publishing real 100% side-by-side crops, exact settings, processing times, and free-tier caps.
  2. **Strengthen `/` (after P0 `d12d6d1c` ships):** Ensure clear above-fold before/after examples, explicit supported scales (`2x/4x/8x/16x`), supported formats (`JPEG/PNG/WebP/HEIC`), truthful region-aware free offer copy, and factual FAQ matching buyer objections.
  3. **Targeted high-leverage blog refreshes:** Refresh `/blog/free-ai-upscaler-no-watermark` (`98 → 3` clicks since July; align title with real comparison/no-watermark intent) and `/blog/how-to-upscale-dalle-images` (pos `4.1`, `0.74%` CTR, missing `ChatGPT` keywords in title).
  4. **Product-led SEO evaluation (João approves compute budget first):** Test a **1-image no-signup guest 2× upscale preview** (Turnstile + IP rate-limited, gating 4×/8×/batch/HD export behind free account) on `/` and `/tools/ai-image-upscaler` to eliminate the #1 signup-wall pogo-stick disadvantage vs `Upscale.media`, `Pixelcut`, and `iLoveIMG`.
- **Success Metrics & Dates:** Flagship recovers to `≥7–10 clicks/day` within 21 days of benchmark publish; guest trial judged end-to-end on `organic click → upscale → sign_up → begin_checkout`.

### P4 — Remediate Mobile Core Web Vitals & INP (Weeks 2–4 | Score: 84/100)

- **Owner Skills:** `cloudflare-workers`, `web-perf`
- **Actions:**
  1. After deploying `6f9e1a46` (hero `fetchPriority="high"`) + `1df70e5a` (static pSEO caching), run `node scripts/perf/psi-profile.mjs https://myimageupscaler.com/` and `/tools/ai-image-upscaler`.
  2. Lazy-load below-fold landing/gallery/FAQ sections and defer non-critical third-party scripts/hydration work on mobile to eliminate `INP > 200ms` and push `LCP ≤ 2.5s`.
  3. Click **Validate Fix** in GSC Core Web Vitals (`28-day` Chrome UX field cycle; recheck **Dec 15+**).

### P5 — Clean Backlink Authority, Reddit Distribution, GEO/AEO & Image SEO (Ongoing | Score: 82/100)

- **Owner Skills:** `reddit-seo-response`, `llm-search-optimization`, `add-gallery-images`
- **Actions:**
  1. **Halt all low-quality directory/launch-site link building immediately** (`27/51` top DR domains flagged SPAM; only consider a disavow file if paid links like `buybacklinks.agency` were bought/arranged at scale).
  2. **Earn 5–10 real editorial links to `/` (60-day target):** Pitch the original 12-tool side-by-side image benchmark and live Print DPI Checker to photography/print/creator newsletters and bloggers updating `"best AI image upscaler 2026/2027"` lists. Once P1 cleanup finishes, reinforce `/` internally with exact `"image upscaler"` anchors from key tool/blog posts.
  3. **Scale `reddit-seo-response` (`+66.5%` MoM):** Keep answering high-intent threads (`r/photography`, `r/PhotoshopRequest`, `r/StableDiffusion`, `r/EtsySellers`, `r/printondemand`) where searchers ask for upscalers.
  4. **Update [app/llms.txt/route.ts](file:///home/joao/projects/myimageupscaler.com/app/llms.txt/route.ts) & AI Mode copy:** Update `"up to 4x"` → `8x/16x`, list the booming free no-signup tools, remove hardcoded `?utm_source=chatgpt` (so Gemini/Perplexity/Claude aren't misattributed), and add plain, quotable capability summaries on tool pages for long AI Mode prompt queries (`2.5K` imp @ pos `4.7`).
  5. **Capture Image Search (`+32.3%` clicks, `+28.7%` imp):** Add descriptive WebP before/after comparison assets with `ImageObject` schema and descriptive filenames/alt text on `/`, `/tools/ai-image-upscaler`, and `/scale/*`.

### P6 — Rationalize Translated Pages (Deferred Until P0–P3 Stabilize)

- **Actions:** Keep active value locales (`es`, `fr`, `ja` — only `~4%` of clicks today), `noindex` zero-click translated template pages in P1, audit inner pSEO `hreflang` tags, and later rebuild only high-potential ES/PT pages around native phrasing (`mejorar calidad de imagen`, `melhorar qualidade imagem`) with native review rather than raw English template translations.

---

## 6. Do Not Touch Yet & Hard Guardrails

- ❌ **Do NOT edit `/blog/tiktok-profile-picture-ideas`** — active rung-2 window closes **Nov 27, 2026**.
- ❌ **Do NOT edit `/blog/topaz-labs-free-trial`** — rung-3 live exposed Nov 19; recrawl check **Nov 23**, verdict **Dec 7, 2026**.
- ❌ **Do NOT rewrite `/blog/poster-size-dimensions-pixels` titles again** — all 3 rungs exhausted; `28.4K` AI Overviews impressions cap CTR at `~0.22–0.26%`.
- ❌ **Do NOT 301 `/tools/ai-image-upscaler`, `/scale/upscale-8x`, or `/blog/image-upscaler-8x`** — the August GIF 301 consolidation cost ~600 clicks/mo; fix with internal links and intent differentiation.
- ❌ **Do NOT create new head-term pages** (`ai image upscaler`, `upscale image`, `image upscaler free`) or resume bulk blog publishing before P1 clears index bloat.
- ❌ **Do NOT chase competitor brand misspellings** (`imageupscaler`, `imgupscaler`, `upscaler.com`), **off-topic traffic** (`/blog/4-k-youtube-to-mp-4`), or **phantom `remove background` Nov 16–18 impressions** (`13,530 imp / 8 clicks`).
- ❌ **Do NOT hardcode `"5 free credits"` globally** — free credits vary by region tier (`5 / 3 / 0`) per Product Truth (`b90c56da`).

**Scheduled Checkpoints:** `Nov 23` (Topaz recrawl) · `Nov 26` (confirm flagship Nov 11–18 drop) · `Nov 27` (TikTok verdict) · `Nov 30` (Nov 2 pSEO prune 4-page readback) · `Dec 7` (Topaz verdict + post-deploy hero readback) · `Dec 15–22` (Mobile CWV field validation + P2 CTR readback).

---

## 7. Execution Timeline & Weekly Scorecard

| Window              | Priorities           | Concrete Deliverables                                                                                                                                                                                                                                                       |
| ------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Days 1–2 (P0)**   | Deploy & Attribution | Merge/cherry-pick `d12d6d1c`, `d2499483` (+ auth fixes), `1df70e5a` onto `master`; deploy (with `6f9e1a46`); add GA4 referral exclusions (`accounts.google.com`, `checkout.stripe.com`); filter SG/CN bots; request indexing `/` + post-Nov-23 Topaz.                       |
| **Days 3–5 (P2)**   | Quick Wins & Funnel  | Wire inline `"Upscale This Image 4× with AI →"` CTA + events in `InteractiveTool.tsx`; fix `/alternatives/vs-iloveimg` & `vs-adobe-express`; tighten `/tools/make-image-transparent`, `remove-bg`, `image-cutout-tool`; add internal links; update `app/llms.txt/route.ts`. |
| **Weeks 1–2 (P1)**  | Bloat Cleanup        | Audit & prune/noindex zero-click `crawled-not-indexed` blog posts, off-topic viral drag (after 0-signup check), `platform-format`, and zero-click translated templates; consolidate overlapping `"best photo enhancer"` blog clones in measured batches.                    |
| **Weeks 2–3 (P3)**  | Proof & Trial        | Verify flagship Nov 26; run real 5-image competitor benchmark & rebuild flagship + `free-ai-upscaler-no-watermark` + `how-to-upscale-dalle-images`; scope 1-image guest upscale economics.                                                                                  |
| **Weeks 2–4 (P4)**  | Mobile CWV           | Profile mobile hydration/INP post-deploy, lazy-load below-fold components & defer third-party scripts, click **Validate Fix** in GSC CWV.                                                                                                                                   |
| **Ongoing (P5–P6)** | Authority & Channels | Zero spam directories; pitch 5–10 editorial links to `/`; weekly `reddit-seo-response`; Image SEO assets; revisit ES/PT native rebuilds only after English core stabilizes.                                                                                                 |

### Weekly Scorecard Metrics

1. **GA4 Funnel by Landing Page & Channel:** `sign_up`, `upscale_completed`, `begin_checkout`, and `purchase` (tracking Organic Share vs Unassigned leak).
2. **GSC Indexation Ratio:** Indexed (`753` baseline) vs _Crawled - currently not indexed_ (`939` baseline).
3. **Homepage Head Terms:** Clicks, CTR, and position for `"image upscaler"` (`pos 10.3`) and `"upscaler"` (`pos 9.9`).
4. **Flagship & Tool CTRs:** Daily clicks on `/blog/best-free-ai-image-upscaler-2026-tested-compared`, CTR on `/tools/make-image-transparent`, `/tools/image-cutout-tool`, `/alternatives/vs-iloveimg`, and real queries on `/tools/remove-bg`.
5. **Post-Tool Upsell Funnel:** Click-through rate on the new `InteractiveTool.tsx` post-download AI Upscaler button and downstream signups.
6. **Mobile CWV:** % Good mobile URLs in GSC CWV (`0/196` baseline; target `LCP ≤ 2.5s`, `INP ≤ 200ms`).
7. **Clean Authority & AI Mentions:** Net new editorial referring domains to `/` (non-spam), Reddit referral sessions (`302` baseline), and Ahrefs AI prompt mentions (`1.2K` baseline).
