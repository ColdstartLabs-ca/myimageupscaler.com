# GSC Drop Diagnosis + Open Work Handoff — 2026-08-08

Audience: an engineer or agent picking this up cold. Everything below is verified against fresh data, not inferred.

## How this data was produced

```bash
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/gsc-28.json
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=14 --inspect-top-pages=0 --output=/tmp/gsc-14.json
node ./.claude/skills/ga-analysis/scripts/ga-fetch.cjs  --site=myimageupscaler.com --days=28 --output=/tmp/ga-28.json
```

Amplitude needs prod keys, which are not in the repo:

```bash
gcloud auth activate-service-account --key-file=./cloud/keys/myimageupscaler-auth-6348371fe8c6.json
gcloud secrets versions access latest --secret=myimageupscaler-api-prod --project=myimageupscaler-auth \
  | grep -E '^AMPLITUDE_(API|SECRET)_KEY=' > /tmp/amp.env
set -a; . /tmp/amp.env; set +a
npx tsx scripts/check-amplitude-events.ts --start 20260620 --end 20260807 --metric uniques purchase_confirmed
rm -f /tmp/amp.env
```

Note: `yarn amplitude:check:prod` fails locally because it expects a generated `.env.client.prod`. The manual path above works. `signup_completed` returns 0 and `signup_started` is rejected as an invalid chart definition — the Amplitude-side signup event naming does not match the constants in the code and is itself worth a look.

## Baseline: the site is not in general decline

| Window | Clicks | Change |
| --- | --- | --- |
| GSC 28d (2026-07-09 → 2026-08-05) vs prior 28d | 8,928 vs 7,002 | **+27.5%** |
| GSC last 14d (2026-07-23 → 2026-08-05) vs prior 14d | 3,924 vs 5,004 | **−21.6%**, CTR −31% |
| GA4 organic sessions 28d | 9,893 | +6.0% |
| Amplitude `purchase_confirmed` (Jun 20 → Aug 7) | ~2/day | flat, no revenue impact |

Indexing is healthy: 10/10 inspected URLs `Submitted and indexed`, correct canonicals, no `blockedOrBrokenPages`, no canonical mismatches.

The GSC "trending down" panel that triggered this investigation is showing real per-page losses that coexist with month-over-month growth. The genuine problem is the last two weeks.

## Root causes, ranked

### 1. GIF cluster self-cannibalization — largest real loss — FIX DEPLOYED, MEASUREMENT OPEN

Daily GSC for `/formats/upscale-gif-images`:

```
Jul 18: 35 clicks, pos 6.4
Jul 19:  9 clicks, pos 8.5
Jul 20:  2 clicks, pos 14.8
Jul 22:  0 clicks, pos 21.4   ← flat there since
```

`/format-scale/gif-upscale-16x` began ranking 2026-07-13 (0 → 183 clicks over the 28d window) and Google swapped which URL it serves. The owner was duplicate-demoted. Queries that went with it: `gif enhancer` 8.0 → 34.7, `gif quality enhancer` 7.6 → 22.8, `enhance gif` 7.9 → 28.3.

Cluster damage: ~33 clicks/day → ~6/day, roughly **800 clicks/month**.

Verified in production on 2026-08-08: all four `/format-scale/gif-upscale-{2x,4x,8x,16x}` return a direct `301` to the owner; owner returns `200` with self-canonical, last crawled 2026-08-07; `sitemap-formats.xml` carries `lastmod 2026-08-03`; retired `sitemap-use-cases-expanded.xml` returns `410`. Manual indexing requested 2026-08-08.

**Open:** the 2026-08-22 recovery checkpoint (below).

### 2. Brand search demand halved — no SEO fix exists

`myimageupscaler`: 794 → 402 clicks over 14d **at position 1.0 throughout**; impressions 1,563 → 772. `my image upscaler`: 386 → 140. GA4 Direct channel −18.2%.

Position 1 with half the impressions means fewer people are searching the brand, not worse ranking. This is the −398 in the grouped-query panel. It matches the open signup regression (−41% since 2026-07-18). Route this to acquisition/retention, not SEO.

### 3. One query is destroying sitewide CTR

`how to fix pixelated photos`: **45,763 impressions / 1 click / position 8.8** over 14 days — roughly 23% of all site impressions, converting nothing. This single query accounts for the −31% sitewide CTR.

The 2026-07-27 title-only test on `/blog/fixing-pixelated-photos` failed its bar. Its own scheduled trigger is **2026-08-10**.

### 4. `/tools/ai-image-upscaler` lost ~2 positions

Step change 2026-07-22 → 07-24: position 4.7 → 7.0, impressions 350–450/day → 200–260/day, −169 clicks over 28d. No SEO-surface deploy landed on those dates (checked `git log` over `app/seo`, `app/formats`, `app/format-scale`, `app/tools`, `lib/seo`, `middleware.ts`), so this reads as external — competitor or algorithm.

### 5. Enhancer tool pages collapsed, blogs absorbed the cluster

`/tools/photo-quality-enhancer`: position 40.5 → 61.6, clicks 35 → 1, impressions 1,841 → 342. `/tools/ai-photo-enhancer`: position 2.8 → 10.0, impressions 766 → 40. Meanwhile `/blog/best-ai-photo-enhancer-reddit` went 251 → 2,888 impressions. Google reassigned the enhancer cluster from tool pages to blog pages.

## False alarms — do not act on these

- **`/scale/upscale-16x` (−115 clicks)** is partly cause #1 spilling over: `gif-upscale-16x` was competing for 16x queries. Separately `image upscaler 16x free` lost CTR at a stable position (11.0% → 8.4%).
- **`/es`, `/pt`, `/de/blog/best-free-ai-image-upscaler-2026-tested-compared` dropping to zero sessions** is deliberate. They `301` to the English canonical. Combined they lost 269 sessions; the English page gained 646. Net **+377**. Working as intended.

## Completed during this execution

### P3 — enhancer cluster — COMPLETE 2026-08-08

The recommended low-risk option was already satisfied in production. Live HTML verification found these internal links:

- `/blog/best-ai-photo-enhancer-reddit` → `https://myimageupscaler.com/tools/ai-photo-enhancer`
- `/blog/best-free-ai-photo-enhancer-online` → `/tools/ai-photo-enhancer`

No production content edit or database write was needed. The SEO changes backlog records the verification and preserves the remaining scheduled checkpoints.

## Open work

### P1 — 2026-08-10: escalate the pixelated-photos snippet

The title-only test produced 1 click on 45,763 impressions. Per the page's own recorded trigger, the next step is a proof-led snippet and body pass, **not** another title swap. Target `/blog/fixing-pixelated-photos` (Supabase-backed blog record, not a repo file).

Constraints: production DB backup required before touching the blog record (`yarn db:backup`, verify with `yarn db:backups` + `gzip -t`). Needs a test in `tests/unit/seo/`. Add a backlog entry. Estimate: 1–2 hours.

### P2 — 2026-08-22: GIF recovery checkpoint

Re-pull daily GSC for `/formats/upscale-gif-images` and `/format-scale/gif-upscale-16x`. Decision rule:

- Owner back under position 10 → done, close the follow-up.
- Owner still worse than position 15 → the `301` did not transfer signals. Switch the variants to `noindex` (leave them reachable) instead of redirecting, and re-request indexing on the owner.

Estimate: 15 min to check, half a day if the fallback is needed.

### P4 — carried over from earlier work, still open

- Rerun mobile PageSpeed and start GSC LCP/INP validation for the GIF page, but only once field data reflects the 2026-08-05 deployment.
- GSC **Validate fix** for the four Japanese social-resize 5xx examples.
- Cloudflare Worker CPU: the 2026-07-30 crawl found `error code: 1102` on 63 of 1,927 URLs, concentrated in localized `platform-format`, `format-scale`, and `device-use` pages. A sample of 8 localized pSEO URLs on 2026-08-08 returned no 5xx, so this is intermittent rather than resolved. Serving 503s to Googlebot degrades rankings sitewide and is the most plausible shared cause behind the mid-July slippage.
- Measure the [GSC SEO recovery PRD](../../PRDs/gsc-opportunity-recovery-2026-07-22.md): 28-day success-criteria evaluation due on or after 2026-08-19. Keep the PRD out of `done/` until recorded.

### Not SEO work

The brand-demand halving (#2) belongs with the signup regression incident. No amount of SEO work moves a query already sitting at position 1.0.

### Do not touch

`/tools/ai-image-upscaler` — no deploy caused the slip. Re-evaluate around 2026-08-19; edit only if it is still at position ~7.

## Rules the next agent must follow

From `CLAUDE.md`:

- SEO changes **must** have unit tests in `tests/unit/seo/`.
- SEO changes **must** append an entry to `docs/SEO/maintenance/seo-changes-backlog.md`.
- Run `yarn verify` before completing any task.
- Any production DB write needs a fresh verified backup first.
- Never use `process.env` directly; use `clientEnv` / `serverEnv` from `@shared/config/env`.
