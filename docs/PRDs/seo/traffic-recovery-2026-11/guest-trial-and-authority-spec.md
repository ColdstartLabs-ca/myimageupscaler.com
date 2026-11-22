# Guest 2× Trial Decision & Clean Authority Spec

**Status:** Decision record and operating spec. No code change. No posting. No API write. No DB access.
**Date:** 2026-11-21
**Source:** [PRD-TR-2026-11-03](03-money-pages-cwv-and-authority.md), [README.md](README.md), live checks on 2026-11-21.

---

## 1. Guest 2x trial — reference spec (NOT approved)

**Status:** NO guest upscale. The owner closed this on 2026-11-21, and `guestAccess: false` in `shared/config/product-capabilities.ts:28` records it. This spec serves PRD-TR-2026-11-03 Phase 3 AC-3 and exists so the decision can be revisited with numbers. Do not implement it without João's written approval and a COGS sign-off.

**Current path:** zero-signup tools plus the post-download 4x upsell (PRD-TR-2026-11-01 Phase 3, commit `9cf5977f`, PR #135). A guest trial would feed this funnel, not replace it.

### 1.1 User flow

1. Guest opens the upscaler page. Copy states one free 2x test per day and no account.
2. Guest uploads one image. Caps: the provider limit of `2,096,704` pixels (`shared/config/model-costs.config.ts:11`) and 2 MB (`shared/config/guest-limits.config.ts:25`).
3. Server runs `real-esrgan` at 2x only through `server/services/guest-processor.ts`. Cost is `$0.0017` per run.
4. Guest sees a reduced-size preview at full quality, with no watermark. The `quick` tier already supports 2x (`shared/types/coreflow.types.ts:356`).
5. HD download, 4x, 8x, and batch stay locked. The download button opens a free signup, and the result hands off to the workspace through the PRD-01 Phase 3 path.
6. A second guest run from the same IP within 24 h returns `429` and a signup prompt.

### 1.2 API (new, not approved)

- Route: `POST /api/upscale/guest`. Add it to `PUBLIC_API_ROUTES` in `shared/config/security.ts:122`.
- Auth: none. Verify the Cloudflare Turnstile token server-side with Siteverify before any provider call. No Turnstile code exists in the repo today, so this work is new.
- Check order, fail closed: burst guard, Turnstile, MIME and pixel checks, IP budget, global budget, then the provider call. Burst guard: `publicRateLimit` at 10 requests/10 s (`server/rateLimit.ts:112`).
- IP limit: one provider run per hashed IP per 24 h. Set `IP_DAILY_LIMIT: 1` in `shared/config/guest-limits.config.ts`; it is `20` today.
- Global cap: keep `500` runs/day and `$0.85`/day (`shared/config/guest-limits.config.ts:11-12`) until the COGS sign-off sets a new number.
- Kill switch: add `GUEST_UPSCALE_ENABLED` to `serverEnv` (`shared/config/env.ts:184`), default `false`. Return `503` when it is off.
- Reuse `server/services/guest-rate-limiter.ts` and `server/services/guest-processor.ts`. No route imports them today.
- Output TTL: one hour (`server/services/replicate/utils/output-parser.ts:119`). Keep no long-term copy and do not buffer the image in the Worker.
- Abuse log per attempt: hashed IP, Turnstile result, pixel count, provider run id, cost, latency, outcome (`server/monitoring/logger.ts`). Never log the raw IP or the image.
- Worker budget: 10 ms CPU (`CLAUDE.md:11`). Validate, call the provider, stream the URL. Do pixel work outside the Worker.

### 1.3 COGS (provider cost only)

| Runs/day | `real-esrgan` at `$0.0017` | `real-esrgan-large` at `$0.0047` |
| -------: | -------------------------: | -------------------------------: |
|      100 |                    `$0.17` |                          `$0.47` |
|    1,000 |                    `$1.70` |                          `$4.70` |
|   10,000 |                   `$17.00` |                         `$47.00` |

`real-esrgan-large` measured ~21 s at 2048x2048 2x on a T4 (`shared/config/model-costs.config.ts:48`). The trial uses the small model only.

Break-even: a guest run costs `c` = `$0.0017`, and one signup is worth `X`, an input the owner fills. Required signup conversion is `c / X`. At `X = $1` the gate is `0.17%`; at `$5`, `0.034%`; at `$10`, `0.017%`. This covers provider cost only, not support, storage, or refunds.

### 1.4 Risks

- Bot farms. `docs/PRDs/seo/traffic-recovery-2026-11/README.md:107` marks ~26% of Direct traffic as SG+CN bot inflation. Turnstile and the IP cap slow farms, but proxy pools still pass. The global cap is the hard stop.
- Cost runaway. A skipped counter increment removes the cap. Red-test the counter and the kill switch, and set provider spend alerts at the approved cap.
- CPU limit. Full decode or normalization in the Worker breaks the 10 ms budget. Keep it off this route.
- Attribution. GA4 `Unassigned` holds purchases today (`README.md:107`). Guest signups need `client_id` and `session_id` stitching, as PRD-01 Phase 3 does, or the trial looks worthless in GA4.
- Freeloading. A guest can pair the trial with a fresh account. Keep the anti-freeloader rules in `lib/anti-freeloader/`.

### 1.5 Acceptance tests for a future implementation

Unit:

- `tests/unit/api/guest-upscale-route.unit.spec.ts`: rejects a bad Turnstile token, more than `2,096,704` pixels, scale `4`, a model other than `real-esrgan`, and the second run from one IP in 24 h. Returns `503` when `GUEST_UPSCALE_ENABLED` is false. Deducts no credits.
- `tests/unit/server/guest-limits.unit.spec.ts`: enforces the 1/24 h IP limit, sets the TTLs, hashes the IP with `IP_HASH_SALT`, and fails closed when Redis is down.
- `tests/unit/seo/guest-trial-policy.unit.spec.ts`: `/api/upscale/guest` is in `PUBLIC_API_ROUTES`, and `guestAccess` stays `false` until owner approval and COGS sign-off land.

E2E:

- `tests/e2e/guest-upscale-trial.e2e.spec.ts`: one guest upload gives a 2x result and no HD download, 4x, 8x, or batch. The signup CTA hands the image to the workspace. The next run from the same IP shows the limit.

**Reopen gate:** owner written approval, a COGS sign-off with a per-run cost ceiling and a monthly cap, and a Turnstile gate plus an IP limit. All three, or the decision stays closed.

---

## 2. Clean authority playbook

### 2.1 Disavow assessment criteria

Baseline: DR `34`, `1,528` referring domains, `27/51` top DR domains flagged SPAM, `0` manual actions, `968` external links in GSC (`503` to `/`). The list includes launch directories (`goodaitools`, `showmysites`, `acidtools`) and `buybacklinks.agency`.

Mark a link for disavow only when it meets two or more criteria:

- Ahrefs or another tool flags the domain as spam.
- The site is a paid-link vendor or a link farm, for example `buybacklinks.agency`.
- The site is a launch directory with no editorial content, no traffic, and an exact-match anchor.
- The site has no topical fit with image upscaling and no organic traffic.
- The domain is a known expired-domain or PBN pattern.
- The anchor text is commercial and repeats exactly across many domains.

Do not disavow a link that meets one weak criterion. Do not disavow real editorial coverage, even when the DR is low. Record every disavow decision with the URL, date, criterion, and reviewer. Hold the file until João signs off. Disavow is a review process, not a bulk action.

### 2.2 Link rules

- No paid links.
- No directory blasts.
- No launch-site submissions for SEO.
- No link exchanges.
- One useful asset per pitch. No mass template sends.

Paid or directory links would add to the `27/51` spam footprint and put the `0` manual actions at risk. Stop them at the source.

### 2.3 Editorial link pitch workflow (5–10 links)

Goal: `5–10` real editorial referring domains to `/` over 60 days.

1. Build the target list. Check each site for topical fit, real traffic, editorial policy, and a live contact.
2. Pick one asset for the pitch: the flagship 5-image benchmark after capture, or the Print DPI checker. The checker is live at `/blog/poster-size-dimensions-pixels`, under the "Print readiness checker" block.
3. Write one short pitch per site. State the problem the asset solves, the one number it proves, and the link. No template blasts.
4. Send from a named person. Disclose affiliation.
5. Log the site, contact, asset, date, and outcome.
6. Follow up once after 7 days. Then stop.

**Target list categories (no site names invented):**

- Freelance photographer and retouching blogs.
- Design, illustration, and digital-art tutorial sites.
- Print-on-demand and e-commerce seller resources.
- AI-art newsletters and communities.
- Small-business marketing and content blogs.
- Print lab and photo-printing help centers.

### 2.4 Weekly Reddit checklist

Use `.claude/skills/reddit-seo-response/SKILL.md`. Do not post anything from an agent run.

- [ ] Read `docs/seo/reddit-post-log.md` first.
- [ ] Fetch fresh GSC and GA4 data. Use the skill scripts.
- [ ] Pick blog targets at position `4–20`, at least `50` impressions, and CTR below `5%`.
- [ ] Match one GSC query to one real thread question.
- [ ] Check the subreddit rules, the thread age, and the existing replies.
- [ ] Keep the `9:1` participation ratio.
- [ ] Disclose affiliation. Use one blog URL. Prefer a no-link answer.
- [ ] Run the draft through the `humanizer` skill.
- [ ] Write the action sheet. Log each row as `recommended`.
- [ ] João posts or skips. Mark the row `posted` or `skipped`.

---

## 3. Inputs and owners

| Input                                                   | Owner                      | Use                                                | Status            |
| ------------------------------------------------------- | -------------------------- | -------------------------------------------------- | ----------------- |
| Ahrefs referring-domains export with spam flags         | João                       | Build the disavow review list                      | TO PROVIDE        |
| GSC links export (`968` external, `503` to `/`)         | João                       | Cross-check the disavow list and editorial targets | TO PROVIDE        |
| 5-image benchmark captures                              | João                       | Flagship edit after Nov 26                         | BLOCKED on Nov 26 |
| Editorial target list and contacts                      | Agent draft, João approval | Pitch workflow                                     | NOT STARTED       |
| Reopen decision, COGS sign-off, Turnstile plus IP limit | João                       | Guest trial reopen only                            | CLOSED            |
| `yarn db:backup`, `yarn db:backups`, `gzip -t`          | Agent runs, João signs off | Any blog edit apply                                | PENDING           |

**Checkpoints from the README:**

| Date      | Checkpoint                                                  |
| --------- | ----------------------------------------------------------- |
| Nov 23    | Topaz recrawl                                               |
| Nov 26    | Confirm flagship Nov 11–18 drop                             |
| Nov 27    | TikTok verdict                                              |
| Nov 30    | Nov 2 4-page pSEO prune readback                            |
| Dec 7     | Topaz verdict and `/` hero readback                         |
| Dec 15–22 | Mobile CWV field validation and PRD-01/PRD-02 CTR readbacks |
