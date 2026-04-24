# GSC Click Drop — Action Plan (Revised)

**Date:** 2026-04-19
**Period analyzed:** Jan 17 – Apr 16, 2026 (90 days, web + image search)
**Status:** Actionable. Owner: SEO + Content.

---

## TL;DR

Clicks are **not** down versus the full 90-day baseline. The real change is that a large batch of blog URLs started ranking at positions 3–10 for informational queries where **AI Overviews and other SERP features likely satisfy intent without a click**. That inflated impressions, crushed blended CTR, and made the site-wide chart look worse than the business likely is.

The goal is **not** to improve CTR by removing URLs. The goal is to increase **total clicks, qualified visits, and signups** while protecting useful top-of-funnel coverage.

**Three things will move the needle fastest:**

1. **Pause net-new roundup / "best of" / generic "X vs Y" posts** unless they include a real tool-first experience or firsthand testing.
2. **Turn the highest-impression blog posts into better landing pages** with an upload widget, clearer titles, stronger internal links, and more obvious CTAs.
3. **Expand `/scale/` and `/formats/` pages** because they align with transactional intent and already show stronger CTR.

---

## Important Implementation Note

This codebase does **not** manage blog indexing via per-post frontmatter alone.

- Blog post metadata is generated centrally in `app/[locale]/blog/[slug]/page.tsx`
- Published blog posts come from a **hybrid source**: static JSON + Supabase via `server/services/blog.service.ts`
- The local repo currently contains 18 static MDX posts, but the live blog inventory may be larger because DB-backed posts are also included

If we later test `noindex`, it should be implemented with an explicit per-post field supported by both data sources and read by centralized metadata generation. Do **not** assume a frontmatter-only change will cover all published blog posts.

---

## Root Cause (60 seconds)

| Symptom                                        | Most likely cause                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Site-wide CTR collapsed 5.8% -> 2.0% on Mar 28 | Many newly indexed blog URLs diluted the blended impression pool                               |
| Blog posts at pos 3–8 with little or no clicks | AI Overview and/or other SERP features likely answered the query directly                      |
| Homepage still at 34.4% CTR                    | Branded and transactional intent remain less exposed                                           |
| Apr 11–16 click dip                            | `/formats/` and `/use-cases/` volatility may be real, but the window is too short to overreact |

**Working example:** `/blog/ai-image-upscaling-vs-sharpening-explained` ranks around position **3.6** with **0 clicks** from 2,769 impressions. That strongly suggests SERP click suppression for this query, but we should treat AI Overview as the **leading hypothesis**, not a certainty without a SERP check.

---

## Priority 1 — Immediate (This Week)

### P1.1 — Do not bulk-noindex blog posts; salvage first

The low-CTR pages are **intervention candidates**, not automatic removal candidates. A site-wide CTR recovery that comes only from hiding impressions is not a real win.

**Pages to work first:**

| Path                                               | Impressions | Clicks | Position | First action                                       |
| -------------------------------------------------- | ----------- | ------ | -------- | -------------------------------------------------- |
| `/blog/ai-image-upscaling-vs-sharpening-explained` | 2,769       | 0      | 3.6      | Reposition for action intent + add tool CTA/widget |
| `/blog/best-image-upscaling-tools-2026`            | 2,472       | 0      | 8.1      | Convert to tool-first comparison or retire later   |
| `/blog/best-image-upscaler`                        | 1,113       | 0      | 9.1      | Sharpen intent + link into tool pages              |
| `/blog/photo-enhancement-upscaling-vs-quality`     | 3,928       | 2      | 7.2      | Improve title/meta + CTA + internal links          |
| `/blog/best-ai-upscaler`                           | 3,664       | 2      | 9.8      | Improve title/meta + tool-first layout             |

**Default intervention sequence:**

1. Add a **live upload widget** or stronger "Try it now" module above the fold where appropriate.
2. Rewrite title and meta description for **task intent and click intent**, not keyword density.
3. Add clearer internal links to the best matching `/scale/`, `/formats/`, and core tool pages.
4. Measure after **28 days from the last substantive edit**, not 7 days.

**Only consider a small `noindex` test if all of these are true after the test window:**

- The page still has **0 clicks**
- The page drove **0 assisted signups / try-tool visits**
- The page has **no meaningful backlinks or internal hub value**
- The query intent is clearly not one we want to own

If a page reaches that threshold, test `noindex, follow` on a **small batch only** (3–5 pages max). Do **not** delete posts outright.

### P1.2 — Pause the risky content template

Do not publish new posts matching these patterns **unless** the page includes firsthand testing, original screenshots/data, or a tool-first experience:

- `best free ai image upscaler [YEAR]`
- `best [tool] 2026`
- `top N ai upscalers`
- generic `X vs Y explained`

These queries are highly exposed to AI Overview summarization. If we publish them, they need a stronger reason to click than a generic informational article.

### P1.3 — Investigate `/tools/ai-image-upscaler` anomaly

The page ranks around **position 2.3** with **0.6% CTR** (1,979 impressions, 12 clicks). That is weak, but it does **not** automatically mean the page is bad. Broad head terms often have suppressed CTR when the SERP is crowded.

**Action:**

1. Manually Google `ai image upscaler` from an incognito US IP and capture the SERP.
2. Check for: AI Overview, ads, product carousel, dominant competitor sitelinks, People Also Ask, and rich-result cards.
3. If the SERP is feature-heavy, decide whether to:
   - keep targeting the head term,
   - strengthen the page with a more immediate tool experience,
   - or build/support narrower long-tail pages around it.

Do **not** change canonicals or redirects until the intent decision is clear.

---

## Priority 2 — Short Term (Next 2 Weeks)

### P2.1 — Rescue the biggest high-impression blog target

`/blog/best-free-ai-image-upscaler-2026-tested-compared` has **30,147 impressions and 9 clicks**. That is a good candidate for a salvage test because the impression base is large.

**Tactics:**

**A. Put the product above the article**

- Add a live upload widget above the fold.
- Show "drag & drop your image here" before the comparison content.
- Keep the article below as support, not as the primary experience.

**B. Rewrite title and meta for action intent**

- Current pattern: `"Best Free AI Image Upscaler 2026: Tested & Compared"`
- Safer direction: lead with the user task and immediate value, then support with comparison language if needed

**C. Tighten conversion flow**

- Add stronger internal links to the core tool and the best matching `/scale/` or `/formats/` pages.
- Track visits from this post into the signup / try flow.

Re-test after **28 days from recrawl**. If the page is still flat, either split the intent more cleanly or lower its priority. Only consider `noindex` if it also fails the stricter guardrails from P1.1.

### P2.2 — Expand high-CTR `/scale/` and `/formats/` pages

These templates align with transactional intent and are more resilient to SERP summarization because the user wants to **do** something.

**Existing winners:**

- `/scale/upscale-16x` (11.2% CTR)
- `/scale/image-upscaler-8k` (8.8% CTR)
- `/scale/2k-upscaler` (10.5% CTR)
- `/formats/upscale-avif-images` (11.2% CTR)

**Expansion candidates to generate next:**

| New page                       | Target keyword      | Est. monthly searches |
| ------------------------------ | ------------------- | --------------------- |
| `/scale/upscale-4x`            | 4x image upscaler   | high                  |
| `/scale/upscale-8x`            | 8x image upscaler   | medium                |
| `/scale/upscale-32x`           | 32x image upscaler  | low but high-intent   |
| `/scale/upscale-1080p`         | upscale to 1080p    | medium                |
| `/scale/upscale-4k`            | upscale image to 4k | high                  |
| `/formats/upscale-webp-images` | upscale webp        | medium                |
| `/formats/upscale-png-images`  | upscale png         | high                  |
| `/formats/upscale-jpg-images`  | upscale jpg         | high                  |
| `/formats/upscale-heic-images` | upscale heic        | medium                |
| `/formats/upscale-tiff-images` | upscale tiff        | low-medium            |
| `/formats/upscale-bmp-images`  | upscale bmp         | low                   |
| `/formats/upscale-gif-images`  | upscale gif         | medium                |
| `/formats/upscale-raw-images`  | upscale raw photo   | medium                |

Use the existing pSEO category pattern in `lib/seo/localization-config.ts` and `app/sitemap-formats.xml/route.ts`. Add ~10 pages per week.

### P2.3 — Rewrite titles and descriptions on salvageable blog posts

For posts already getting some clicks, title and meta are still the fastest lever. Focus on the middle tier first.

**Pattern to use:** concrete task + clear benefit + action language

- Weak: `"How to Fix Pixelated Photos: An Educational Guide to AI Upscaling"`
- Better direction: `"Fix Pixelated Photos in 30 Seconds (Free Tool + Steps)"`

**Posts to prioritize:**

| Path                                           | Impr  | Clicks | Pos  | CTR   |
| ---------------------------------------------- | ----- | ------ | ---- | ----- |
| `/blog/upscale-image-online-free`              | 1,115 | 7      | 6.5  | 0.63% |
| `/blog/best-free-ai-image-upscaler-tools-2026` | 1,965 | 8      | 8.7  | 0.41% |
| `/blog/upscale-image-for-print-300-dpi-guide`  | 4,110 | 5      | 10.3 | 0.12% |
| `/blog/best-ai-image-quality-enhancer-free`    | 4,707 | 9      | 10.2 | 0.19% |

### P2.4 — Upgrade CTA placement on every blog post

Blog posts already have register CTAs in the current template. The improvement here is **placement and persistence**, not basic presence.

- On desktop: test a floating bottom-right "Try It Now" CTA
- On mobile: test a sticky bottom bar
- Keep existing inline and bottom CTAs; do not replace them

Rationale: the users who do click through are already partway down the funnel. We should reduce friction from article -> tool.

---

## Priority 3 — Medium Term (Next Month)

### P3.1 — Shift blog strategy toward BOFU and proof-heavy content

AI Overview targets generic informational queries. Favor content types that need experience, visuals, or an interactive tool:

| Content type                                  | Why it is safer                              |
| --------------------------------------------- | -------------------------------------------- |
| Tutorials with screenshots                    | Requires a real workflow, not just a summary |
| Specific tool comparisons you actually tested | Harder to replace with a generic answer      |
| Troubleshooting guides                        | Long-tail, high intent, lower AIO coverage   |
| Format-specific deep dives                    | Stronger task intent                         |
| Tool-first pages                              | The page itself solves the problem           |
| Vertical guides                               | More specific commercial intent              |

### P3.2 — Consolidate duplicate intent pages only with evidence

The likely overlap cluster includes:

- `/blog/best-free-ai-image-upscaler-2026-tested-compared`
- `/blog/best-free-ai-image-upscaler-tools-2026`
- `/blog/best-ai-upscaler`
- `/blog/best-image-upscaler`

Do **not** merge these based on titles alone.

Before any 301 decision, confirm:

- The same primary queries are driving each page
- One page is clearly stronger on clicks, links, or conversions
- The losing pages do not own meaningful long-tail variants

If that evidence is present, pick a winner and 301 the rest into it.

### P3.3 — Monitor image search separately

Image search shows 2 clicks from 13,345 impressions. That likely means images are surfacing without sending traffic back.

Audit:

- image/page context alignment
- alt text quality
- whether branded overlays or watermarks help recall

### P3.4 — Build pages for queries AI Overview cannot satisfy well

**Brand queries are strong** and should keep compounding through off-site visibility, demos, and brand mentions.

**New page ideas from high-impression queries:**

| Query                                                   | Impressions  | Suggested landing page                        |
| ------------------------------------------------------- | ------------ | --------------------------------------------- |
| `easiest way to make image background transparent 2026` | 458          | `/tools/background-remover` (if strategic)    |
| `jpg to pdf`                                            | 223 (pos 62) | Ignore; wrong product intent                  |
| `free photo restoration services`                       | 186          | `/photo-restoration` (audit conversion first) |

---

## Blog URL Triage Matrix

Use this against the **current GSC export of indexed blog URLs**, not against a fixed post-count assumption.

| Pos             | Clicks                       | Extra signals                                                            | Action                                                   |
| --------------- | ---------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| <= 10           | 0                            | unknown / mixed                                                          | Improve title, CTA, widget, internal links; wait 28 days |
| <= 10           | 0                            | no clicks, no assisted signups, no backlinks, no hub value after 28 days | Small `noindex` test only                                |
| <= 10           | 1–5                          | any engagement                                                           | Keep; improve intent and conversion path                 |
| <= 10           | 6+                           | any                                                                      | Keep; strengthen links into tool pages                   |
| > 10            | 0                            | any                                                                      | Leave alone, retarget, or consolidate later              |
| overlap cluster | same query set + same intent | winner clearly identified                                                | 301 weaker pages to the winner                           |

---

## Monitoring Plan

**Weekly (automated):**

- Re-run `node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28`
- Track:
  - total clicks
  - non-branded clicks
  - `/scale/` and `/formats/` clicks
  - top landing pages by clicks
  - blog-assisted tool visits / signup-path visits
- Alert if total clicks drop >15% WoW or if blog-assisted conversions trend down for 2 consecutive weeks

**Biweekly (manual):**

- Check whether the Apr 11–16 dip recovered in the next clean window
- Review SERP features for the top suppressed queries
- Verify edited pages were re-crawled before judging them
- Check whether sticky CTA / widget tests improved downstream behavior

**30- to 42-day checkpoint:**

- Did total weekly clicks improve?
- Did blog landings drive more try-tool visits or signups?
- Are new `/scale/` and `/formats/` pages indexing and ranking?
- Which salvage pages improved enough to keep?
- Only then decide whether a small `noindex` test is warranted

---

## What NOT To Do

- **Do not bulk-noindex pages just to improve blended CTR.** That can make GSC prettier without improving the business.
- **Do not delete blog posts outright.** If a page truly fails the stricter test, use `noindex, follow` first.
- **Do not assume every low-CTR page is worthless.** Some pages still help discovery, internal linking, and assisted conversion.
- **Do not consolidate or redirect pages before validating same-intent overlap.**
- **Do not use 7-day windows to judge indexing or SERP changes.** The cycle is too short.
- **Do not implement per-post `noindex` via frontmatter alone in this app.** The metadata layer is centralized and the blog source is hybrid.
- **Do not panic about short-term volatility on small samples.**

---

## Expected Outcome

If P1 + P2.1 + P2.2 are executed cleanly:

| Metric                              | Current         | 30- to 45-day target                               |
| ----------------------------------- | --------------- | -------------------------------------------------- |
| Weekly clicks                       | 587             | 700–900                                            |
| `/scale/` + `/formats/` clicks      | ~70/week        | 150–250/week                                       |
| Site-wide CTR                       | 3.0%            | stabilize or improve as a side effect              |
| Blog CTR                            | 0.11%           | improve where possible, but not as the primary KPI |
| Blog-assisted tool visits / signups | baseline needed | clear upward trend                                 |
| Homepage CTR                        | 34.4%           | roughly unchanged                                  |

The main lever is **better intent alignment and better conversion paths**, not hiding low-CTR impressions. If CTR improves because the pages are genuinely better, that is useful. If CTR improves only because we removed impressions, it is not.
