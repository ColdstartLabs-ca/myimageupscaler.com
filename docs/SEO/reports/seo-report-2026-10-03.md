# Traffic & Signup Decline — Root Cause Report (2026-10-03)

**Window:** GSC Sep 3–30 vs Aug 6–Sep 2 (28d), plus GSC daily Jun 1–Oct 2, GA4 daily by source, prod DB signups (read-only), GSC UI (CWV, indexing, manual actions), live-site crawl, git history, Outrank planner.
**Raw data:** session scratchpad (`gsc-miu.json`, `ga-miu.json`, `ga-src.json`, `db-daily.json`, `agent-*.md`).

---

## TL;DR

1. **This is not an SEO/ranking problem.** Non-brand Google clicks are **up** (+5.5% to +9%). Indexing is flat (980 indexed). No manual action, no security issue, no core update. The live pages are clean for Googlebot.
2. **Everything stepped down on one day: 2026-09-12.** On that day, compared with the days before:

   | Metric                  | Before  | After   |
   | ----------------------- | ------- | ------- |
   | Signups/day             | 107–117 | 52–74   |
   | GA4 Google sessions/day | 246–304 | 169–205 |
   | Branded GSC clicks/day  | ~25     | ~5      |
   | Gemini referrals/day    | 12–17   | 3–6     |
   | ChatGPT referrals/day   | 2–4     | 0–1     |

   Branded clicks dropped at **position 1.0 with CTR flat (~52%)**, so fewer people searched for the brand. Rankings didn't change.

3. **Sep 12 is when the Sep 10 "Product Truth" deploy reached users.** It shipped Sep 10 19:00 PDT. The homepage is `force-static` with 24h ISR, so the new copy replaced the cached page about a day later. It removed "free / 5 free credits / no credit card needed" from the homepage meta description, hero, CTAs, and pSEO metas.
   - **Most likely mechanism:** AI assistants and Google's AI surfaces stopped recommending MIU as a _free_ upscaler. These assistants ground on titles and meta descriptions. People who used to hear "use MyImageUpscaler" and then Google the name stopped doing so. That one cause explains why brand search, Gemini/ChatGPT referrals, and signups all fell on the same day, evenly across every country and device.
4. **The Sep 25 restore was incomplete.** The homepage meta description, the snippet Google and Gemini show, still reads: _"Create an account to see the free credit grant available in your region."_ The old version said _"free online. Get 5 free credits, no credit card needed."_ Branded clicks and signups haven't recovered: 50/day in Sep 26–Oct 2, down from 61.6.
5. **Second real loss: the best-free flagship post's CTR collapsed** from ~7% to 2.2% at an unchanged position (5.6–5.8). The cause is the Sep 10 title and description rewrite, which is still live. That's −482 clicks over 28d.
6. **LCP (your "wtf"):** mobile has been 100% "Poor" since **July**. Non-brand clicks grew 10× over the same period, so LCP did not cause this decline. It still isn't fixed, though, and the reasons are below.

---

## 1. Where the −933 clicks went (28d vs prior 28d)

| Bucket                             | Prior | Now   | Δ        | Cause                                                        |
| ---------------------------------- | ----- | ----- | -------- | ------------------------------------------------------------ |
| Branded queries                    | 839   | 316   | **−523** | Fewer brand searches; position 1.0, CTR flat                 |
| Anonymized (homepage share)        | —     | —     | ~−330    | Same brand drop (rare brand variants), starting the same day |
| Anonymized + named, best-free post | 851   | 369   | **−482** | CTR collapse after the Sep 10 title rewrite                  |
| Non-brand                          | 2,358 | 2,576 | **+218** | Healthy                                                      |

The decline is spread evenly across countries (US −48, IN −35, FR −25, DE −23…) and devices. It's all web search; Image, Discover, and News show nothing.

### Day-by-day step (GA4 sessions/day, property TZ)

| Window       | google | gemini | chatgpt | signups/day (DB) |
| ------------ | ------ | ------ | ------- | ---------------- |
| Sep 1–11     | 249    | 10.3   | 3.1     | ~100             |
| Sep 12–24    | 208    | 4.9    | 1.5     | 61.6             |
| Sep 26–Oct 2 | 175    | 3.4    | 1.3     | **50.1**         |

Signups fell ~35–45% **in every region tier** (standard 41.6→25.3, restricted 25.2→11.1, paywalled 24.6→13.1) and every top country. No `free_credit_grants` reason or `is_flagged_freeloader` change shows up, so abuse gating is not the cause. Hourly signups were normal through Sep 11 UTC and dropped from Sep 12 00:00 UTC.

## 2. Git ↔ downtrend correlation

| Date                 | Change                                                                                                   | Effect on data                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Jul 17               | `229b6b87` free-tier abuse prevention                                                                    | Signups halved; brand demand reverted (already documented)                                                                              |
| Aug 17               | best-free meta-description edit                                                                          | Best-free CTR 11.5% → 5% from Aug 21 (overlaps the Aug 18–21 spam update)                                                               |
| Aug 25               | `d08a19da` sitemap only lists groups with ≥1 translation                                                 | 35 English `/scale`, `/free`, `/guides` URLs dropped from the sitemap (still indexed; medium risk)                                      |
| Sep 8                | `dd1791c5` mobile LCP remediation                                                                        | No field effect visible yet (see §5)                                                                                                    |
| **Sep 10 19:00 PDT** | **`b90c56da` Product Truth + `d4781071` "free"→"welcome" credits + best-free title/description rewrite** | **Sep 12: brand −80%, signups −40%, Gemini −60%, best-free CTR 7%→2.2%**                                                                |
| Sep 10–16            | Raw i18n keys (`homepage.finalCtaSubtext`, DE `homepage.ctaSubtext`) rendered on the live homepage       | Visible to users and crawlers for 6 days; fixed in `0fff2b59`                                                                           |
| Sep 10               | `315623bb` 11 missing Worker secrets uploaded                                                            | Server-side GA4 now fires, inflating Unassigned/(direct) (direct 137→276/day, 0.25 engagement). Not a traffic loss, but it distorts GA4 |
| Sep 16               | `e364d0aa` serve prerendered pages through the cache                                                     | Working; "image upscaler" briefly reached page 1 (Sep 18–26)                                                                            |
| Sep 24–              | Google September spam update (ongoing to ~Oct 8)                                                         | "image upscaler" fell back to positions 9–10                                                                                            |
| Sep 25               | `3143e88e` free-copy restore                                                                             | **Partial**: the homepage meta description and the tool-page "5 free credits" were not restored. No recovery after 7 days               |

**Ruled out with data:** technical/indexing (200s, self-canonicals, Googlebot HTML matches the user HTML, URL Inspection passes), manual action, security issue, core update (none in September per Google's dashboard), Outrank (one post a day continuously since before Sep 10; nothing new on Sep 11–12), the GuestUpscaler removal (dead code, never rendered), CWV (poor since July), country/device concentration, non-brand ranking loss.

## 3. Fixes, in order (ship one at a time; each needs a backlog entry and a 7-day readback, per CLAUDE.md)

### Fix 1 — Restore the homepage meta description (highest leverage, ~15 min)

- **File:** `locales/en/common.json:173` (`meta.homepage.description`).
- **Now:** `Enhance, upscale, and restore supported JPEG, PNG, WebP, and HEIC images with AI. Create an account to see the free credit grant available in your region.`
- **Set to:** `Enhance, upscale, and restore photos with AI — free online. Start with free credits, no credit card needed. Works with JPEG, PNG, WebP, and HEIC.` (152 chars, tier-safe: no hardcoded number)
- **Test:** add an assertion to `tests/unit/seo/free-offer-conversion-copy.unit.spec.ts` that `meta.homepage.description` contains `free` and `no credit card`. See it red first, then green.
- **Also restore** the "free credits" wording in the `/tools/ai-image-upscaler` metaDescription (`app/seo/data/tools.json`). It currently reads "Create a free account with free credits", which is fine. Recheck the live snippet after deploy.
- **After deploy:** request indexing for `/` in GSC. The homepage is 24h ISR, so confirm the live `<meta name="description">` changed before counting days.
- **Readback (Oct 10–12):** branded clicks/wk (baseline 41–43), gemini sessions/day (baseline 3–4), signups/day (baseline 50).

### Fix 2 — Fix the best-free flagship title and description (DB edit, ~20 min, ship ≥7 days after Fix 1 or measure separately)

- **Page:** `/blog/best-free-ai-image-upscaler-2026-tested-compared`. CTR went from ~7% to 2.2% at position 5.8; ~−480 clicks/28d.
- **Now:** title `Best Free AI Image Upscalers 2026: Limits Compared`; description ends `…Published by MyImageUpscaler.`
- **Change:** drop "Published by MyImageUpscaler", which reads as self-promotion. Bring back a concrete hook without the unsupported "Only 3 Worked" benchmark claim (per the backlog note). For example:
  - Title: `Best Free AI Image Upscaler 2026: 12 Tools, Real Limits`
  - Description: `12 free AI image upscalers compared for 2026: which need an account, which add watermarks, max scale (4K/8K), and daily limits. No credit card options flagged.`
- **How:** via the `blog-edit` skill (backup gate first: `yarn db:backup` → `yarn db:backups` → `gzip -t`). Record the change in `three-kings-ledger.json` and the backlog.

### Fix 3 — Make AI assistants see the free offer again (~30 min)

- `https://myimageupscaler.com/llms.txt` line 35 says **"No signup required for basic use"**. That is false (an account is required) and contradicts the site. Replace it with the true offer: "Free account with free credits, no credit card required."
- Verify the effect by asking Gemini and ChatGPT "best free AI image upscaler no watermark" before and after, and note whether MIU appears.

### Fix 4 — Re-add the 35 English pages to the sitemap (~1 h incl. tests)

- `d08a19da` (Aug 25) dropped `/scale/*`, `/free/*`, `/guides/*` English URLs because those groups have no translations. `/scale` alone earns ~540 clicks/28d.
- English-only groups must always be emitted. Add a test in `tests/unit/seo/` asserting `/scale/upscale-16x` and `/free/free-image-upscaler` appear in the sitemap index.

### Fix 5 — GA4 hygiene (so the next readback isn't lied to)

- Internal links tagged with `utm_source=file_picker|upload|drag_drop|purchase_modal|preflight_action_panel` create self-referral sessions (~45/day) and break attribution. Use event params instead of UTMs on internal links.
- Server-side GA4 (on since Sep 10) inflates (direct)/Unassigned. Judge readbacks on `source=google` and DB signups, not all-channel sessions.

### Lower priority

- `/tools/ai-image-upscaler` lost "image upscaler 8x" to `/scale/upscale-8x` (Sep 18). No net site loss, so leave it.
- `/scale/2k-upscaler` has a double canonical tag. `/` and `/es` list their hreflang alternates twice. `/de/tools/ai-image-upscaler` has a generic title.
- `robots.txt` blocks `/_next/` (JS/CSS) for all crawlers. This dates from Dec 2025 and isn't the cause, but Googlebot needs it to render. Remove the disallow.

## 4. Why LCP is still 100% Poor on mobile despite the fixes

- **What GSC shows:** mobile 209 Poor / 0 Good (`LCP > 4s`, validation **Failed**), plus INP > 200ms on all 209. Desktop: 209 "Needs improvement". Source: CrUX, last updated Oct 1. The Poor count **rose** after Sep 16 (from ~110 to 209), so the fixes have not moved field p75 below 4s.
- **Why the work didn't register:**
  1. **There is no real-user LCP data.** The codebase has no `web-vitals`/`onLCP` collection, so every fix was judged on Lighthouse lab runs while Google judges field p75. You are flying blind.
  2. **The audience is mostly slow-network mobile:** IN, ID, BR, EG, BD, PH, plus the paywalled and restricted tiers, ~50% of signups. p75 for that audience is far worse than any lab run from Canada. CrUX groups similar URLs, so one slow template drags all 209 URLs into Poor.
  3. **The Cloudflare cache fixed TTFB on hits only.** The live probe shows cached pages at 30–60 ms, but `/` averages 0.48 s with ~0.9 s spikes even on HIT, and `/pricing` is uncached at 1.4–2.0 s. The Sep 8 lab trace showed **render delay and resource-load delay of ~3 s**, not TTFB. The remaining cost is client-side: ~1.9 MB transfer, ~390 KB unused JS, Stripe ~820 KB, 3.3 s main-thread, and the Cloudflare challenge JS.
  4. **The 28-day window plus reporting lag** means a fix shipped Sep 16 is only fully reflected around Oct 14–18. GSC "validation" does not re-measure; it waits for CrUX.
- **Exact next steps:**
  1. **Measure first (1–2 h):** add `web-vitals` (`onLCP`, `onINP` with attribution) and send p75 by template, country, and device to Amplitude or GA4. No PII, no query strings.
  2. **Find each template's real LCP element.** Get the GSC group example URLs: CWV → Mobile → LCP issue → the example URL list. Check the blog template (hero image from Supabase storage, not the CDN loader) and pSEO templates, not just the homepage.
  3. **Finish the unshipped Sep 8 plan items:**
     - Verify that no Stripe JS loads before checkout intent on _every_ public template.
     - Remove the 600 ms `opacity:0` hero fade-in from critical content.
     - Serve Supabase-hosted blog hero images through `/cdn-cgi/image/` with `srcset`, eager loading, and `fetchpriority=high`.
     - Check whether the Cloudflare challenge script runs for normal mobile visitors.
  4. **Cache `/pricing`,** and find the 0.9 s spikes on `/`. These are Worker CPU/OOM (0.3–1.5% of requests) or R2 retrieval. Log `cf-cache-status` alongside `x-opennext-cache`.
  5. **Re-check the GSC CWV chart** about 28 days after the last fix ships. Use RUM p75 to know earlier.
- **Expectation:** CWV is a weak ranking signal. Fixing LCP will help conversion on slow mobile more than it helps rankings. It will not bring back the brand clicks.

## 5. Amplitude funnel + auth DB check

Windows: A = Sep 1–11, B = Sep 12–22, C = Sep 26–Oct 2. "Real sessions" excludes SG/CN bots and the Sep 17 bot spike. "Intent" = homepage-hero register clicks plus `/?signup=1` visits.

| Metric/day             | A        | B        | C        |
| ---------------------- | -------- | -------- | -------- |
| Real sessions          | 318      | 264      | 231      |
| Intent                 | 123      | 113      | 97       |
| Intent per session     | 0.386    | 0.427    | 0.420    |
| **Signups per intent** | **0.75** | **0.55** | **0.52** |
| Upscalers per signup   | 0.78     | 0.79     | 0.86     |
| Purchases              | 1.91     | 1.30     | 0.71     |

- **A→B decomposes as** 0.83 (traffic) × 1.11 (intent rate) × **0.73 (completion)**. Most of the Sep 12 step is people who open signup but don't finish. That held even when hero clicks recovered on Sep 19–22, and the Sep 25 copy restore did not move it.
- **Prod `auth.users` shows nothing broken server-side.** Every created user is confirmed and has a profile, and ~88% are Google OAuth (94/day on Sep 11 → 65 → ~45). The abandonment happens **before** an auth user is created: in the modal, or on Google's consent screen.
- **Code check:** the auth store and `useRegionTier` changes between Sep 8 and 25 are analytics-only (lazy `loadAnalytics`) and can't block signup. The copy around the modal lost the concrete "5 free credits" (now "Free credits", a deliberate tier-safe choice in `3143e88e`). The homepage FAQ "How to upscale images for free?" was **deleted** on Sep 10, and its answer now reads "Create an account to see the free credit grant available in your region".
- **Tracking break:** Amplitude `account_created` = **0/day since Sep 23** while real signups continue. It is emitted fire-and-forget in `app/api/users/setup/route.ts`, which on Workers can be cancelled after the response. Fixed in lane D (see the execution log).
- **Returning users are flat** (42 → 39 → 33/day). The brand-search drop is new-user discovery, not churn.
- **Open (needs João):** check the Google OAuth consent screen. Look at its publishing/verification status, any "unverified app" warning, and whether the app name or logo changed around Sep 11–12. 88% of signups pass through it, and the completion drop is the same across every country. This is not visible from code.

## 6. Outrank (scheduler)

- One AI article a day publishes at 07–09 UTC, continuously through Sep (DB: `blog_posts` created Sep 4, 5, 6, 10, 11, 12…). Nothing changed around Sep 12.
- "Improvements" queue: Outrank is scheduled to **rewrite your ranked pages**: `best image upscaler` (Oct 4), `best ai upscaler` (Oct 11), `photoshop upscale image` (Oct 15), `free online image enlarger`, `what resolution for print`, `best ai image enhancer`, `video upscaling software`, and more. **Unschedule these.** Uncontrolled rewrites of pages you are running Three Kings tests on will contaminate every readback, and the 2026-09 history already shows snippet edits on ranked pages can cut CTR in half.
- Daily generic posts ("star photography settings", "landscape photography editing", "background removal ai") during an active spam update add thin-intent URLs. Consider pausing new-article generation until the Oct readback.
- The account shows "Article Addon payment overdue".

## 7. Readback checklist (2026-10-12)

- [ ] Branded clicks/wk > 43 (GSC, query contains `myimage`)
- [ ] Gemini sessions/day > 4 (GA4 `sessionSource=gemini.google.com`)
- [ ] Signups/day > 50 (DB `profiles.created_at`, UTC)
- [ ] Best-free CTR > 4% at position ≤ 6
- [ ] Mobile CWV: RUM p75 LCP by template recorded

## 8. Execution log (2026-10-03, local master, not deployed)

| Commit                                                                         | Change                                                                                            | Report item       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------- |
| `fix(seo): restore the free offer in the homepage snippet, FAQ and llms.txt`   | Homepage meta description, restored FAQ "How to upscale images for free?", llms.txt/llms-full.txt | Fix 1, Fix 3      |
| `fix(seo): list English-only pSEO sitemaps and unblock /_next/ for crawlers`   | Sitemap index 43→46 (scale/free/guides back), robots `/_next/` allowed                            | Fix 4, robots     |
| `feat(analytics): real-user Core Web Vitals + stop GA4 self-referral sessions` | `web_vitals` event (LCP/INP/CLS/FCP/TTFB by template); GA4 `source`→`ui_source` param rename      | §4 step 1, Fix 5  |
| `fix(analytics): keep account_created alive past the Worker response`          | `waitUntil` for `account_created` / `free_credits_reduced`                                        | §5 tracking break |

**Not shipped:**

- The single canonical/hreflang emitter is on branch `seo/canonical-single-emitter`. It has a high blast radius and needs review.
- Fix 2, the best-free title, is a production DB edit and needs the owner.
- Outrank unscheduling is an external service change and needs the owner.
- The Google OAuth consent screen check needs the owner.
