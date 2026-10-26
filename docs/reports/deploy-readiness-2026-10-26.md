# Deploy Readiness — 2026-10-26

**TLDR:** Initial check: ❌ not ready, because 3 unit tests failed. Update: all issues are fixed (see §0), and `yarn verify` and `yarn test:unit` pass. The deploy changes no user-facing behavior. The one runtime change is in the health check (§0.3).

## 0. Fixes applied (update, 2026-10-26)

| #   | Issue                                                                                       | Fix                                                                                                                                                                                                                                                                                    | Proof                       |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 0.1 | `pseo-hero-lcp` font tests read the old layout                                              | The tests now read `client/styles/fonts.ts`. They check `display: 'swap'` per font and the layout import.                                                                                                                                                                              | Red → green                 |
| 0.2 | `topaz-free-trial-snippet` expected a resolved row                                          | The test now expects the row reopened on 2026-10-26, with its history. The retired rung-2 constant has a comment.                                                                                                                                                                      | Red → green                 |
| 0.3 | `/api/health` stays `degraded`, and `quota-guard` sends a daily alert for `gallery-cleanup` | The cron worker pauses that job on purpose (`PAUSED_CLEANUP_ENDPOINTS`, PRD 04). `cronHealth.service.ts` now skips paused jobs (`PAUSED_CRON_JOB_KEYS`). A unit test keeps the two lists equal, so the job is expected again when the pause is removed. The pause itself is unchanged. | 3 new tests red → green     |
| 0.4 | GitHub CI fails `test-env-isolation` with exit 127                                          | The test sets `PATH=/usr/bin`, and CI has no node there. It now runs `process.execPath` plus the tsx CLI.                                                                                                                                                                              | Exit 127 reproduced, then 0 |
| 0.5 | 8 comments link to PRD paths that do not exist                                              | Comments point to the current PRD paths. A SQL file that was never committed is replaced by its commit id (`f2d8fc64`).                                                                                                                                                                | `tsc` clean                 |

Work split: opencode `deepseek-v4.1-flash` made 0.1, 0.2 and 0.5. Claude reviewed and corrected them, and made 0.3 and 0.4.

## 1. Baseline

| Item                  | Value                                                                      |
| --------------------- | -------------------------------------------------------------------------- |
| Last prod deploy      | 2026-10-15 03:20 UTC (`wrangler deployments list`)                         |
| Deployed commit       | `a853b0ff` (last commit before that time)                                  |
| Pending commits       | 10 (`1349f565` … `b129699d`)                                               |
| Files changed         | 307 total, 51 outside `docs/` and `*.md`                                   |
| GitHub Actions deploy | ⚠️ All runs since 2026-09-16 fail. Deploys go through local `yarn deploy`. |

## 2. What the pending diff contains

| Area                                                                   | Change                                                                                   | Runtime effect                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `app/`, `client/`, `server/`, `shared/`, `lib/`, `open-next.config.ts` | `@see docs/PRDs/...` comment paths after the PRD folder move, plus Prettier reformatting | ✅ None                                                                   |
| `tests/integration/*`                                                  | Prettier reformatting and comment paths                                                  | ✅ None                                                                   |
| `scripts/seo/*.cjs` + new unit specs                                   | Three Kings rollback, TikTok PFP title, print-format link helpers                        | ✅ None (operator scripts; the blog edits went live through the blog API) |
| `scripts/storage/*.mjs`                                                | Comment paths                                                                            | ✅ None                                                                   |
| `docs/`                                                                | PRD reorganization, SEO ledgers, backlog rollup                                          | ✅ None                                                                   |

Result: the deploy is a no-op for users. Shipping it only syncs prod with `master`.

## 3. Checks run

| Check                                                                          | Result                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `yarn verify` (tsc, lint, i18n ICU, SEO schema, indexation gate, cache config) | ✅ Pass (lint warnings only)                            |
| `yarn test:unit`                                                               | ❌ 3 failed / 7225 passed / 12 skipped (2 of 547 files) |
| `yarn test:api`, `yarn test:e2e`, `yarn test:upscale:release`                  | Not run                                                 |
| Prod `/api/health`                                                             | ⚠️ `degraded` — see §5                                  |

## 4. Blockers and corrections

### 4.1 ❌ `tests/unit/seo/pseo-hero-lcp.unit.spec.ts` — 2 failures

- **Cause:** `a853b0ff` moved the font setup from `app/(pseo)/layout.tsx` into `client/styles/fonts.ts` (self-hosted `localFont`). The test still reads the layout file and looks for `display: 'swap'` and `DM_Sans`.
- **Prod impact:** None. `client/styles/fonts.ts` sets `display: 'swap'` on both `inter` and `dmSans`.
- **Correction:** In both tests at lines 164–175, read `client/styles/fonts.ts`. Assert `display: 'swap'` for `inter` and `dmSans`. Also assert that `app/(pseo)/layout.tsx` imports `inter, dmSans` from `@client/styles/fonts`.
- **Note:** This test broke in the deployed commit itself. The Oct 15 deploy probably used `--skip-tests`, or the suite was not green then.

### 4.2 ❌ `tests/unit/seo/topaz-free-trial-snippet.unit.spec.ts:46` — 1 failure

- **Cause:** `57e82665` rolled back the Topaz rung-2 LOSS. It reopened the backlog row as `- [ ]` with a "Reopened 2026-10-26" note. The test still requires `[x]` and `API-resolved 2026-10-05`.
- **Prod impact:** None. The backlog row is correct. The test pins the old state.
- **Correction:** Rewrite the test "records the post-update indexing request as one resolved row":
  1. Keep `expect(rows).toHaveLength(1)`.
  2. Assert `- [ ]` and `Reopened 2026-10-26`.
  3. Assert that the history `2026-09-21` and `API-resolved Oct 5` stay in the row.
- **Also check:** The same file asserts that `TOPAZ_FREE_TRIAL_SNIPPET.seoDescription` starts with "Topaz Labs has no free trial". The rollback restored the earlier alternative-led description in the DB. This constant now describes a retired variant. Mark it as historical, or point the assertion at the rollback `previousValue` in `tests/unit/seo/three-kings-2026-10-26.unit.spec.ts`.

### 4.3 Verify the fix

1. Run `yarn vitest run tests/unit/seo/pseo-hero-lcp.unit.spec.ts tests/unit/seo/topaz-free-trial-snippet.unit.spec.ts`.
2. Run `yarn test:unit` and confirm 0 failures.
3. Run `yarn deploy`. It runs the full `yarn test` and the upscale release check.

## 5. Pre-existing prod issue (not caused by this diff)

### ⚠️ `gallery-cleanup` cron has never recorded a success

- **Evidence:** Prod `/api/health` at 2026-10-26 17:48 UTC returns `cron.status: fail`, `gallery-cleanup.lastSuccessAt: null`. `database-retention` is healthy (17:25 UTC).
- **Meaning:** Since the 2026-10-15 deploy (the R2 storage move, `00e7baae`), the nightly `/api/cron/gallery-cleanup` run has not reached `recordCronJobSuccess`. Either the route returns 500, or the cron worker does not call it. Inactive free-user gallery images are not being cleaned and expiry warnings are not queued.
- **Root cause (found in the follow-up):** `workers/cron/index.ts` skips `/api/cron/gallery-cleanup` on purpose (`PAUSED_CLEANUP_ENDPOINTS`, commit `00e7baae`), until the verified-backup retention gates in PRD 04 pass. The health check still expected the job. Fixed in §0.3. The Workers Observability API still rejects all three tokens.
- **Next step:**
  1. Open Cloudflare dashboard → Workers → `myimageupscaler` → Logs. Filter on `Gallery cleanup failed` after 00:00 UTC.
  2. Or give a token with the `Workers Observability: Read` scope, and the agent pulls the logs.
- **Ship decision:** This does not block the pending deploy. The deploy does not change this code.

## 6. Low-priority cleanup (not blocking)

- ⚠️ 8 code comments point to PRD paths that no longer exist. The 4 checked were already stale at `a853b0ff`. Examples: `server/analytics/checkoutFunnelAnalyzer.ts:7` and `shared/types/stripe.types.ts:19` (now under `docs/PRDs/done/revenue/`). `shared/config/subscription.types.ts` references `docs/PRDs/subscription-config/{credits-expiration,trial-periods}.md`, which do not exist anywhere.
- ⚠️ GitHub Actions `deploy.yml` fails on every push since 2026-09-16. Fix it or disable the push trigger so the red runs do not hide real failures.

## 7. After deploy

- `docs/SEO/maintenance/gsc-request-indexing-backlog.md` has open rows (for example, `blog/topaz-labs-free-trial`, cooling-off Oct 27 – Nov 9). Request indexing manually in GSC when each row says so.
