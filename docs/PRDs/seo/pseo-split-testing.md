# PRD-pseo-split-testing — Control-group tests for pSEO template changes

**Status:** PROPOSED
**Priority:** P2 — planned improvement: template changes still ship as bulk rewrites (the 2026-09-10 failure mode), and pre/post checks cannot separate an edit from Google noise (AC-1 to AC-3 open).
**Complexity:** <score when planned in detail>
**Owner:** SEO dev agent; João approves each test start and each rollout.
**Depends on:** [PRD-seo-lock-monitoring](seo-lock-monitoring.md) (reuses its weekly cron route, `server/services/gsc.service.ts` and its stop-loss verdict format).

## Context
Industry practice (SearchPilot, SplitSignal; from memory, not verified today): change a random half of similar pages, keep the other half as control, and roll out only on a win. The 2026-09-10 bulk copy pass changed every page at once, so there was no control, and signups fell about 40%. pSEO categories (tools, scale, formats) have many similar pages and fit this method. Single pages (the homepage, the flagship post) do not fit. They keep the stop-loss in PRD-seo-lock-monitoring.

⚠️ Pages near 20 clicks/28d give little volume. A test can need 4–8 weeks for a clear result (estimate, not measured).

## Solution (outline, to detail before work starts)
A per-category assignment (`content/seo-split-tests.json`) puts a deterministic, hashed half of the slugs in the variant group. The pSEO metadata and template read the assignment. The weekly digest reports variant against control. A rollout or a revert is a signed lock change.

## Acceptance Criteria
- [ ] AC-1 [local]: The assignment splits a category into two groups with similar 28-day clicks, within 10%. proof: unit test on the assignment function — Evidence: pending.
- [ ] AC-2 [local]: Variant pages render the variant field, and control pages render the locked value. proof: unit test through the pSEO metadata generator — Evidence: pending.
- [ ] AC-3 [local]: The digest shows variant against control with WIN, FLAT or LOSS. proof: digest spec fixture — Evidence: pending.

## Decisions
- 2026-10-23 (João): record split testing as the follow-up to the lock work, in its own PRD.

## Execution Phases
#### Phase 1: Plan in detail (after PRD-seo-lock-monitoring is done)
**Status:** NOT STARTED
