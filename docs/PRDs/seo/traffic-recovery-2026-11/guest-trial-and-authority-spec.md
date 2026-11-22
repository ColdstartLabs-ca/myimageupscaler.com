# Guest 2× Trial Decision & Clean Authority Spec

**Status:** Decision record and operating spec. No code change. No posting. No API write. No DB access.
**Date:** 2026-11-21
**Source:** [PRD-TR-2026-11-03](03-money-pages-cwv-and-authority.md), [README.md](README.md), live checks on 2026-11-21.

---

## 1. Guest 2× trial: closed by owner decision

**Decision:** NO guest upscale trial. The owner settled this on 2026-11-21.

**Recorded reasons:**

- The browser upscaler does not work.
- No cost-bearing upscale API runs on a public route.
- `guestAccess: false` in `shared/config/product-capabilities.ts:28`.

**Chosen alternative:** keep the zero-signup tools and add the post-download 4× upsell. This path is defined in PRD-TR-2026-11-01 Phase 3 and ships inside this PRD suite. Status: implemented in commit `9cf5977f` (PR #135), live after the next deploy.

**To reopen, all three must land:**

1. A new owner decision that reverses this record.
2. A COGS sign-off with a per-upscale cost ceiling and a monthly cap.
3. A Turnstile gate plus an IP rate limit on the public route.

Do not design the endpoint, the credit path, or the abuse tiers while the decision stays closed.

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

| Input | Owner | Use | Status |
| ----- | ----- | --- | ------ |
| Ahrefs referring-domains export with spam flags | João | Build the disavow review list | TO PROVIDE |
| GSC links export (`968` external, `503` to `/`) | João | Cross-check the disavow list and editorial targets | TO PROVIDE |
| 5-image benchmark captures | João | Flagship edit after Nov 26 | BLOCKED on Nov 26 |
| Editorial target list and contacts | Agent draft, João approval | Pitch workflow | NOT STARTED |
| Reopen decision, COGS sign-off, Turnstile plus IP limit | João | Guest trial reopen only | CLOSED |
| `yarn db:backup`, `yarn db:backups`, `gzip -t` | Agent runs, João signs off | Any blog edit apply | PENDING |

**Checkpoints from the README:**

| Date | Checkpoint |
| ---- | ---------- |
| Nov 23 | Topaz recrawl |
| Nov 26 | Confirm flagship Nov 11–18 drop |
| Nov 27 | TikTok verdict |
| Nov 30 | Nov 2 4-page pSEO prune readback |
| Dec 7 | Topaz verdict and `/` hero readback |
| Dec 15–22 | Mobile CWV field validation and PRD-01/PRD-02 CTR readbacks |
