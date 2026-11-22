# PRD-TR-2026-11-02 — Index Bloat Pruning, Overlapping Blog Consolidation & Internal Link Funnels

**Status:** CODE COMPLETE — blocked on deploy and 30–60d GSC readback
**Priority:** P1 — Attacks the primary algorithmic drag correlated with the Sep 24–Oct 8 spam update: `939` "Crawled - currently not indexed" pages (more than double `446` on Oct 23), `592/1,000` zero-click pages, ~43 overlapping `"best / photo enhancer / upscaler"` blog posts, and `753` indexed vs `3,640` excluded URLs.
**Complexity:** 7 (HIGH) — `Complexity: 7 → HIGH; risk override: URL noindex, 301 consolidation, and Supabase blog pruning carry traffic-loss risk if mis-scoped against active click earners or open Three Kings windows.`
**Owner:** João (production DB backup / blog-API write sign-off, GSC Page Indexing monitoring); agent (audit manifest, code/redirect/sitemap/internal-link PRs, SEO unit tests).
**Depends on:** None (runs concurrently with `PRD-TR-2026-11-01`; post-cleanup `"image upscaler"` anchor reinforcement to `/` executes after Phase 2–3 pruning).

## Context

- GSC UI + Ahrefs (`2026-11-21`, [README.md](README.md)) and live GSC 90d/28d exports expose severe footprint bloat:
  1. **Indexation collapse (`753` indexed / `3,640` not indexed):** `939` pages are _Crawled - currently not indexed_ (~352 English blog posts, ~135 `/en/blog?page=` / `?q=` residue, and translated pSEO templates across `platform-format`, `format-scale`, `device-use`, and localized blog/tools). `~25%` of `767` sitemap URLs get `0` impressions; `592/1,000` top pages got `0` clicks in 3 months.
  2. **~43 overlapping `"best / photo enhancer / upscaler"` blog posts:** At least 10 URLs split `"photo enhancer"` queries at positions `20–76` (`best-free-ai-photo-enhancer-online` pos `42.9`, `best-ai-image-quality-enhancer-free` `20.8`, `best-ai-photo-enhancer` `25.4`, `best-ai-image-enhancer` `12.4`, `best-ai-photo-enhancer-reddit` `7.1`, `free-photo-enhancer-no-signup` `28.3`, `/free/free-photo-enhancer` `45.6`), dragging `"image upscaler free"` (`30`), `"free image upscaler"` (`33`), and `"ai image upscaler"` (`26`).
  3. **Off-topic topical-authority drag & dead pSEO categories:** `/blog/4-k-youtube-to-mp-4` jumped `+124` clicks (`6 → 130`) at `76.1%` GA bounce (`24.4%` eng) and **`0` key events** alongside `animation-maker-for-minecraft`, `windows-11-snap-layouts`, and `convert-video-to-hd-1080-p-online-free`; `platform-format` has `45` pages yielding `13` clicks in 3 months; `alternatives` has `50` pages yielding `115` clicks.
  4. **Existing protections verified live:** `/en/blog?page=2` already `301 → /blog?page=2` with `noindex, follow` and canonical `/blog` (`9ec164ea`). Do NOT block `/blog?page=` in `robots.txt` yet or Google cannot recrawl the `noindex` directive.
  5. **Active guardrails:** Do NOT 301 `/tools/ai-image-upscaler` (`102` clicks/28d, owns `"image upscaler 8x"`), `/scale/upscale-8x`, or open Three Kings windows (`/blog/tiktok-profile-picture-ideas` Nov 27, `/blog/topaz-labs-free-trial` Dec 7, `/blog/poster-size-dimensions-pixels` exhausted).

## Solution

- **Phase 1 (Audit Manifest & Sitemap Hygiene):** Build a deterministic bloat audit script joining GSC 90d/180d + GA4 organic signups/sessions + Supabase blog slugs + `app/seo/data/*.json` to classify every candidate URL into `KEEP`, `MERGE_301`, `NOINDEX_UNPUBLISH`, or `DEFER_GUARDED`, inspect `sitemap-static.xml`'s `1` GSC warning, and lock a publishing freeze.
- **Phase 2 (Measured Blog Consolidation & Off-Topic Prune):** Fold overlapping zero/low-click enhancer/upscaler clones into `5–8` distinct canonical intent owners (_Best Free AI Image Upscaler_, _Best AI Photo Enhancer_, _Unblur/Sharpen Photos_, _Photo Restoration_, _GIF Upscaling_, _Topaz Free Trial & Alternatives_), adding `301` redirects in `next.config.js` + `BLOCKED_BLOG_SLUGS` ([shared/constants/blocked-blog-slugs.ts](../../../shared/constants/blocked-blog-slugs.ts)) + removing off-topic video/OS posts after confirming `0` signups.
- **Phase 3 (pSEO Template Pruning, Hreflang Audit & Internal Link Funnels):** `noindex` + sitemap-exclude zero-click `platform-format` (`45` pages / `13` clicks) and zero-click translated templates (`es`/`pt`/`de`/`fr`/`it`/`ja`), audit inner-page `hreflang` parity, and add contextual internal links from background/Adobe/8× blog posts to `/tools/remove-bg`, `/tools/make-image-transparent`, `/alternatives/vs-adobe-express`, `/tools/ai-image-upscaler` (`"8x AI image upscaler tool"`), and `"image upscaler"` anchors to `/`.

## Non-Goals

- Blindly 301-redirecting `/tools/ai-image-upscaler` into `/` or merging `8x` URLs (resolved via internal links & intent separation).
- Rewriting translated ES/PT pages natively today (deferred until English core indexation and `/` rankings recover).
- Editing active Three Kings experiment URLs (`tiktok-profile-picture-ideas`, `topaz-labs-free-trial`, `poster-size-dimensions-pixels`).

## Acceptance Criteria

- [x] AC-1 [local]: Bloat audit script produces a deterministic JSON/Markdown disposition manifest classifying `0`-click blog posts, off-topic viral posts (with GA4 conversion cross-check), `platform-format`, `alternatives`, and zero-click localized pSEO URLs while excluding active Three Kings guardrails and `/tools/ai-image-upscaler` — proof: `npx vitest run tests/unit/seo/bloat-audit-manifest.unit.spec.ts` — Evidence: `1c662268`; manifest `docs/SEO/reports/2026-11-21-index-bloat-manifest.json` from committed GSC 180d + live sitemap inputs. Blog: 198 KEEP, 66 MERGE_301, 16 NOINDEX_UNPUBLISH (2 off-topic with 0 GA4 conversions added in `f00ccb9f`), 30 DEFER_RECENT, 11 DEFER_GUARDED.
- [x] AC-2 [local]: Consolidated blog slugs and retired off-topic slugs have `301` redirects in `next.config.js`, matching entries in `BLOCKED_BLOG_SLUGS` (`shared/constants/blocked-blog-slugs.ts`), zero broken internal links, and pass redirect/sitemap parity tests — proof: `npx vitest run tests/unit/seo/blog-redirects-blocked-from-sitemap.unit.spec.ts tests/unit/seo/legacy-redirects.unit.spec.ts && yarn verify` — Evidence: `e35ba7f0`; 66 posts → 301 (plain + locale), 16 → `noindex, follow`, all out of sitemap/index/related lists. Code only, no DB writes.
- [x] AC-3 [local]: Zero-click `platform-format` and zero-click translated pSEO templates serve `noindex, follow`, are omitted from generated sitemaps, and inner-page `hreflang` tags match active indexable locales symmetrically — proof: `npx vitest run tests/unit/seo/sitemap-noindex-parity.unit.spec.ts tests/unit/seo/locale-retraction.unit.spec.ts tests/unit/seo/ && yarn verify` — Evidence: `1c662268` (35 zero-click `platform-format` pages `noindex`; `content/pseo-performance.json` refreshed to Aug 21–Nov 18, which retracts zero-impression locale twins) and `d90706a4` (hreflang alternates only list indexable twins; red showed `vs-topaz → fr`, `remove-bg → pt`).
- [x] AC-4 [local]: Contextual internal link graph updates (`background` posts → `/tools/remove-bg` & `/tools/make-image-transparent`; `Adobe/Photoshop` posts → `/alternatives/vs-adobe-express`; `/blog/image-upscaler-8x` → `/tools/ai-image-upscaler`; post-cleanup `"image upscaler"` links → `/`) validate clean targets and no orphan/404 destinations — proof: `npx vitest run tests/unit/seo/internal-links-funnel.unit.spec.ts && yarn verify` — Evidence: `5f366ecf`; code-level blog → tool link map, no Supabase content edits.

## Blocked on

- **Production DB backup (`yarn db:backup` + `gzip -t`) & blog unpublish/redirect sign-off** before any live Supabase blog status/content PATCH — unblocked by João.
- **GSC UI inspection of `sitemap-static.xml` warning** (`1` warning in GSC Sitemaps API) and **Nov 30 readback** of the Nov 2 4-page pSEO prune (`ai-sharpness-enhancement-upscaler`, `tiff-upscale-4x`, `free-ai-photo-enhancer`, `free-background-remover`) — unblocked by João.
- **Post-deploy 30–60d GSC Page Indexing recovery check:** _Crawled - currently not indexed_ (`939` → `<300`) and English/blog CTR lift (`0.58%` baseline) — unblocked by deploy & Google recrawl cycle.

## Integration Ledger

| Capability                              | Reachable consumer/trigger                                                                                         | Replaces / disposition                                                     | Evidence                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------- |
| Bloat disposition manifest              | `scripts/seo/` audit CLI → GSC + GA4 + Supabase inventory                                                          | Ad-hoc manual URL checks                                                   | AC-1 (`1c662268`, `f00ccb9f`)             |
| Blog `301` & sitemap exclusion          | `next.config.js` redirects() + `shared/constants/blocked-blog-slugs.ts:5` → `app/sitemap-blog.xml/route.ts`        | ~43 cannibalizing clones & off-topic drag indexed in sitemap               | AC-2 (`e35ba7f0`)                         |
| Dead pSEO `noindex` & `hreflang` parity | `lib/seo/page-eligibility.ts` + `lib/seo/locale-sitemap-handler.ts` + `app/(pseo)/platform-format/[slug]/page.tsx` | Zero-click `platform-format` / translated templates leaking crawl budget   | AC-3 (`1c662268`, `d90706a4`, `b0c81fdc`) |
| Contextual internal link funnel         | `scripts/seo/` blog link updater + `app/seo/data/` related links                                                   | Ambiguous anchors splitting `image upscaler 8x`, background tools, and `/` | AC-4 (`5f366ecf`)                         |

## Decisions

- 2026-11-21 (agent/plan): Keep `/tools/ai-image-upscaler`, `/scale/upscale-8x`, and active Three Kings pages out of `301` consolidation; consolidate only zero/low-click overlapping clones in measured batches so Aug 2026 GIF-301 losses do not repeat.
- 2026-11-21 (agent/plan): Keep `/blog?page=` crawlable with `noindex, follow` + canonical `/blog` rather than adding `robots.txt` `Disallow` so the ~135 `/en/blog` URLs drain cleanly out of Google's index.

- 2026-11-21 (agent): Merge only posts with 0 clicks in 180 days and sitemap `lastmod` before 2026-10-07; owners must earn clicks. Newer zero-click posts are `DEFER_RECENT` for the next batch.
- 2026-11-21 (agent): Off-topic posts are judged on GA4 conversions (90d, `docs/SEO/reports/inputs/2026-11-21-index-bloat/ga4-blog-landing-90d.json`), not clicks. `4-k-youtube-to-mp-4` (95 sessions, 0 conversions) and `windows-11-snap-layouts` (0 conversions) are now `noindex`. `animation-maker-for-minecraft` (8 conversions) and `convert-video-to-hd-1080-p-online-free` (4) stay live because they convert.
- 2026-11-21 (agent): Translated pSEO twins (`es/pt/de/fr/it/ja`) now need clicks, not only impressions, to stay indexable (`lib/seo/page-eligibility.ts` `hasDemand`). This drops 30 zero-click `alternatives` twins (108 impressions total). English keeps the impressions rule. Test: `tests/unit/seo/translated-zero-click-noindex.unit.spec.ts`.
- 2026-11-21 (agent): 11 zero-click English `alternatives` pages are recorded as candidates only; the PRD keeps alternatives live.
- 2026-11-21 (agent, Gemini 4 Neon review): hreflang (HTML head and sitemap `xhtml:link`) now uses `isHreflangEligible`: snapshot demand only, no grace period. Follow-up: `/es/alternatives/vs-imgupscaler` has GSC clicks but no `es` translation, so it serves a noindex English mirror while hreflang still names it. The fix needs translation availability in the synchronous metadata factory. The parity test pins this 1 pair so the list cannot grow.
- 2026-11-21 (agent): Follow-up kept: the 2-hop chain `how-ai-image-upscaling-works-explained` → `-guide` → `best-image-upscaler`. Collapsing it breaks 3 frozen legacy-redirect pin tests, so it needs an owner decision on those pins.
- 2026-11-21 (agent): Publishing freeze lives in `.claude/skills/blog-opportunities-publisher/SKILL.md` (the weekly Hermes job reads it from local `master`).

## Execution Phases

#### Phase 1: Deterministic bloat manifest & `sitemap-static.xml` check

**Status:** DONE
**Files:** `scripts/seo/audit-index-bloat.cjs` (new), `tests/unit/seo/bloat-audit-manifest.unit.spec.ts` (new), `content/pseo-performance.json` (read-only input).
**Implementation:** Correlate GSC 90d/180d pages, GA4 organic signups/sessions, Supabase blog posts, and `app/seo/data/*.json` to output exact `KEEP` / `MERGE_301` / `NOINDEX_UNPUBLISH` / `DEFER_GUARDED` lists for the ~352 unindexed English blog posts, ~43 overlapping enhancer posts, off-topic posts (`4-k-youtube-to-mp-4`, `animation-maker-for-minecraft`, `windows-11-snap-layouts`, `convert-video-to-hd-1080-p-online-free`), `platform-format`, `alternatives`, and localized pSEO pages. Inspect `app/sitemap-static.xml/route.ts` locally for causes of the `1` GSC warning.

- [x] Bloat manifest script classifies all candidate blog and pSEO URLs with guardrail exclusions and passes unit checks — proof: `npx vitest run tests/unit/seo/bloat-audit-manifest.unit.spec.ts` — covers AC-1.

#### Phase 2: Consolidate overlapping blog clones & retire off-topic drag

**Status:** DONE
**Files:** `next.config.js`, `shared/constants/blocked-blog-slugs.ts`, `tests/unit/seo/blog-redirects-blocked-from-sitemap.unit.spec.ts`, `tests/unit/seo/legacy-redirects.unit.spec.ts`, `docs/SEO/maintenance/seo-changes-backlog.md`.
**Implementation:** Using the Phase 1 manifest (after João's `yarn db:backup` / unpublish approval for any Supabase row), map zero/low-click enhancer/upscaler duplicates into the `5–8` intent owners and add `301` redirects + `BLOCKED_BLOG_SLUGS` entries; prepare unpublish/redirect specs for zero-conversion off-topic posts. Enforce `blog-redirects-blocked-from-sitemap.unit.spec.ts`.

- [x] Consolidated and retired blog slugs pass redirect, sitemap exclusion, and full SEO verification — proof: `npx vitest run tests/unit/seo/blog-redirects-blocked-from-sitemap.unit.spec.ts tests/unit/seo/legacy-redirects.unit.spec.ts && yarn verify` — covers AC-2.

#### Phase 3: Prune zero-click pSEO templates, audit `hreflang`, & rewire internal links

**Status:** DONE
**Files:** `lib/seo/page-eligibility.ts`, `lib/seo/locale-sitemap-handler.ts`, `content/pseo-performance.json`, `app/seo/data/platform-format.json` (or eligibility rules), `lib/seo/related-pages.ts`, `tests/unit/seo/sitemap-noindex-parity.unit.spec.ts`, `tests/unit/seo/internal-links-funnel.unit.spec.ts`.
**Implementation:** `noindex` + sitemap-exclude zero-click `platform-format` and zero-click translated template pages (`es/pt/de/fr/it/ja`) while retaining active `alternatives` (`vs-adobe-express`, `vs-bigjpg`, `vs-waifu2x`, `vs-iloveimg`); verify inner-page `hreflang` points only to indexable locales; prepare/apply contextual internal-link brief routing background posts → `/tools/remove-bg` & `/tools/make-image-transparent`, Adobe/Photoshop posts → `/alternatives/vs-adobe-express`, `/blog/image-upscaler-8x` → `/tools/ai-image-upscaler`, and `"image upscaler"` anchors → `/`.

- [x] Pruned pSEO templates, inner `hreflang` parity, and contextual internal-link targets pass unit and verify checks — proof: `npx vitest run tests/unit/seo/ && yarn verify` — covers AC-3, AC-4.
