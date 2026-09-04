---
name: gsc-causation-correlation
description: Prove which SEO changes actually moved GSC impressions/clicks — day-by-day time series per tracked page/query, event-aligned pre/post windows around seo-changes-backlog dates, weekly buckets, and a non-brand site trend. Use when asked "did that change work", "what works for MIU growth", or before repeating an edit class on a page.
---

# GSC Causation Correlation

Blended weekly or period-comparison GSC views hide step changes and stack confounders (brand spikes, phantom queries, deploys). This skill pulls day-by-day series per tracked page/query — one API request per surface using `dimensionFilterGroups`, so multi-URL variants can't truncate the pull — and aligns each `seo-changes-backlog` change date against its own 14-day pre/post window.

## Usage

```bash
# 1. Fetch 120 days of daily series (final data only, 3-day holdback)
node ./.claude/skills/gsc-causation-correlation/scripts/gsc-daily-correlate.cjs \
  --start=2026-05-01 --output=/tmp/gsc-daily.json

# 2. Re-analyze saved data with the default backlog event map (no refetch)
node ./.claude/skills/gsc-causation-correlation/scripts/gsc-daily-correlate.cjs \
  --no-fetch --input=/tmp/gsc-daily.json \
  --events=./.claude/skills/gsc-causation-correlation/scripts/default-events.json
```

- `--events=<file>`: JSON array of `{date, name, pages: [labels], queries: [labels]}`. Extend `scripts/default-events.json` as new backlog changes land.
- `--pages=`, `--queries=`: comma-separated label subsets (must match tracked labels).
- `--lag-days=3`, `--days=120`, `--site=`.

## Interpretation rules

1. **Only use `dataState: 'final'`** rows; the trailing week is partial — never a verdict.
2. Read event windows, not headline deltas: `pre14` vs `post14` vs `post7-20` per affected page. A verdict needs a rate change (clicks/d, imps/d), not a cumulative one.
3. Confounders to net out before attributing anything:
   - **Brand demand spikes** — use the `non-brand estimate` (site minus 2 brand queries) for program-level claims.
   - **Phantom/zero-CTR clusters** (e.g. `how to fix pixelated photos`) inflate site impressions and depress site position/CTR. Exclude them from headline reads.
   - **Google-side demand shifts** — impressions falling while weighted position holds ~flat is a demand/SERP change, not a ranking change; do not edit content over it.
   - **Deploys vs content edits** — content edits hit the DB/HTML immediately; code deploys land on their own date and affect the whole site at once.
4. Causation bar: the affected page must move relative to its own 14-day pre-window, in the direction the change targeted, with position behavior consistent with the claimed mechanism (CTR fix → position stable + CTR up; ranking fix → position up).
5. One edit per page per measurement window. If two edits land within 14 days, their windows overlap — report the program effect, not per-edit causation.

## Recorded MIU evidence (GSC final data 2026-05-01 → 2026-08-31)

Program level: non-brand clicks went ~150-210/wk (early May) → ~1,944/wk peak (week of Jul 6-13), ~10x, in lockstep with the Three Kings/snippet program. Non-brand plateaued ~1,250-1,800/wk through August.

**Proven winners:**

- **Three Kings refresh on a page already ranking (pos 5-11) with real impressions** — the one repeatable mover. `/tools/ai-image-upscaler` 06-05: 13→198 clicks/wk in 4 weeks. `/blog/topaz-labs-free-trial` 06-07: 10→43 clicks/wk. `/blog/best-free-ai-image-upscaler-2026-tested-compared`: 5→493 clicks/wk across five stacked 05-24→06-29 edits.
- **Stacked narrow snippet tests on a healthy page** — each ~14-day window on best-free-upscaler compounded (92→132→197→288→493). Editing one field at a time and re-measuring worked as a program.
- **07-03 CTR pass** on `/blog/best-ai-upscaler` (2→13-17 clicks/wk) and `/blog/topaz-video-upscaler` (2→6-8/wk).
- **07-14 refresh** on `/blog/best-image-upscaler`: delayed lift (8→28 clicks/wk by week 3). `/blog/how-to-upscale-youtube-thumbnails`: impressions +48%, clicks flat.

**Proven failures (do not repeat):**

- **Snippet edits on `/blog/fixing-pixelated-photos`** — 4 attempts (06-07, 07-03, 07-27, 08-10), clicks stuck at 0-6/wk through 33-49K impressions/wk at pos 9-11 (CTR ~0.02%). SERP-feature/phantom traffic; editing cannot fix it. The quarantine gate (2026-08-25) is correct.
- **GIF 301 consolidation** (live ~08-08) — retired `/format-scale/gif-upscale-*` members collapsed 67→2 clicks/wk, but the owner never recovered (pos 7→18→33; cluster 847→~100 clicks). Redirects did not transfer ranking signals here.
- **07-22 `/blog/text-image-enhancer`** — impressions grew 6→60/d but weighted position fell to 50-60; 6 clicks in 4 weeks. Impression growth at junk positions is bloat, not growth.
- **06-21 `/blog/best-free-ai-photo-enhancer-online`** — clicks fell post-edit (10→3), recovered later without another edit.
- **Impression collapse ≠ edit damage**: the exact `best free ai image upscaler 2026` demand collapsed 986→26/wk with position holding ~5-7 — demand/SERP change. The 07-20 title test was not the cause.

**Unproven (insufficient window as of 2026-09-03):** 08-13 big deploy (404/LCP/pruning — head term `image upscaler` pos decayed to 14.6 by 08-17; judge at the 2026-09-22 gate), 08-17 proof-led pass, 08-31 Topaz snippet.
