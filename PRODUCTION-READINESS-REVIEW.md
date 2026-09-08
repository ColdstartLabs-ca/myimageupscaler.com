# Production readiness review: Cloudflare async upscale

**Current decision (2026-09-08): RELEASE BLOCKED — the mandatory built-runtime gate fails interrupted-delivery cleanup.**

Latest committed-code gate: 13 passed, one failed, five skipped in 5.1 minutes (`/tmp/upscale-release-disconnect-fixed.log`). The failed assertion requires an interrupted HTTP download to release its database delivery lease within two seconds. Separate diagnostics still found the lease held after seven seconds, with no release RPC attempted. Enabling incoming request signals, adding a Workers execution-context lifetime hold, and testing a direct Worker socket did not resolve it. Work stopped after three attempted fixes, as instructed. The doubtful assumption is that the original client disconnect reaches the Next.js route's stream cleanup callback. No timeout or assertion was weakened. All 435 unit tests and `yarn verify` pass, but they do not override this release blocker. Investigate disconnect propagation across workerd/OpenNext before deploying; the bounded database lease remains a safety fallback, not proof of prompt recovery.

The findings below are the original review, retained as historical evidence. The rate-budget collision, stalled recovery and terminal retry identity defects have since been fixed and covered by regression tests. Additional fixes preserve ambiguous admissions, prevent truncated/timed-out output acknowledgement, retain new jobs when discovery is stale, and add one durable eligible GPU-failure recovery attempt without a second debit. Account-wide billing denial does not trigger model fallback.

The new `yarn test:upscale:release` rebuilds the application and tests actual Workers routes with disposable PostgreSQL/PostgREST and a browser. All five projects (schema, provider outage, fallback, durable API, browser) are mandatory in `yarn deploy`, even with `--skip-tests`, before production credentials or database mutation. Four deployment-entrypoint regression tests enforce this. Provider/Auth/Storage transport is simulated; email telemetry is not part of this fixture.

Pre-commit verification checkpoint: 430 affected unit tests and four deployment-entrypoint tests passed; `yarn verify` passed (37.65 seconds). A fresh `yarn test:upscale:release` gate passed all 19 scenarios in 269.95 seconds, including successful fallback, failed alternate, lost alternate identity, full workspace upload and desktop/mobile reload recovery. Logs: `/tmp/upscale-release-final-green.log`, `/tmp/async-squash-final-units.log`, `/tmp/async-deploy-final.log`, `/tmp/async-final-verify-3.log`.

The post-commit rerun subsequently exposed interrupted-delivery cleanup failing its two-second assertion; five repeated probes reproduced it. Do not use the earlier pass to approve that revision. The corrective change enables incoming Workers cancellation signals and holds the execution context until stream cleanup releases its database lease. A regression asserts the lifecycle promise is registered and settled on cancellation. The final rerun must retain the exact committed revision and bundle identity in `test-results/async-upscale-runtime/candidate-identity.json`; use its complete command result, not an older pass. Deployment always rebuilds and reruns the gate from committed source.

Production constraints remain: five migration files are required for this candidate (the three async reservation/delivery/discovery migrations plus billing-circuit recovery and single-recovery migrations). The last production inspection found the original three absent; the two new migrations have not been applied. Perform the mandatory verified schema/data backup before production changes and recheck migration state. Direct production-token Replicate prediction creation and completion succeeded after funding returned; the actual `image-processing` availability RPC allowed admission despite its stale `half_open` label. This is time-specific diagnostic evidence, not a continuing availability guarantee.

No deployment or production database mutation was performed. Fresh staging provider cases, verified canary routing/rollback, enforced Cloudflare resource-limit evidence and the phase 6 observation gate remain required. Cron reconciliation bounds jobs/concurrency but does not yet enforce the PRD's aggregate 20-second budget; do not claim that timing contract is proven. The old worktree is retained pending cleanup authorization because its 22 GB includes ignored environment files and historical evidence.

## Historical review (before remediation)

Reviewed 2026-09-08. Scope: all tracked changes and new implementation/test/migration files in `.worktrees/cloudflare-async-upscale-crash-fix`, relative to HEAD `ae96360d` (also the current local master). This reviews the uncommitted working tree, not a deployed artifact. The `pr-review` skill guided the failure-path and verification assessment.

## 1. High: status polling does not have an independent rate budget

**Locations:** `server/rateLimit.ts:68`, `server/rateLimit.ts:100`, `lib/middleware/rateLimit.ts:133`.

All limiter instances read and write the same module-level `rateLimitStore`, keyed only by user ID. Selecting `upscaleStatusRateLimit` therefore does not isolate status traffic from general API traffic or the five-per-minute admission limiter. Different windows also destructively filter the same timestamp array.

**Impact:** a burst of status reads can reject an otherwise eligible admission or output download. General API calls can also discard older status timestamps and weaken the advertised minute-long limit. The newly added middleware tests mock the limiter implementation, so they cannot catch this.

**Observed reproduction:** with the real limiter and production-mode configuration, 120 status reads for one user succeeded; the user's first general API limiter call then returned `success: false`. A temporary regression probe expecting an independent general budget failed.

**Suggested fix:** give each policy its own map or namespace its storage key by policy. Keep the existing numeric limits. Add real-limiter tests covering status-to-general, status-to-admission, and mixed-window interactions with a controlled clock; do not mock the limiter under test.

## 2. High: a temporary recovery failure leaves a permanent processing spinner

**Locations:** `client/utils/api-client.ts:1008`, `client/hooks/useBatchQueue.ts:348`, `client/hooks/useBatchQueue.ts:378`.

When the first status request in `resumeAsyncUpscale` loses its connection, it throws `AsyncUpscalePendingError`. The hook keeps the item in `PROCESSING` and deletes its controller, but schedules no further request. Its discovery effect only runs on mount/user change. The processing overlay offers no retry action. An initial active-list failure similarly exits recovery without retrying.

**Impact:** a refresh during intermittent connectivity can strand an admitted job until another page reload, even after connectivity returns. The same stalled presentation occurs when polling exhausts its budget: the request stops while the UI still implies active processing. Database reconciliation may eventually refund the job, but this mounted UI does not learn that outcome.

**Observed reproduction:** a recovered job's first resume rejected with `AsyncUpscalePendingError`; dispatching online/focus events produced no second resume. The probe expected two calls and observed one. Existing recovery tests cover successful restoration, not this boundary.

**Suggested fix:** put the initial read and list discovery under bounded retry/reconnect handling. After the polling budget ends, expose a “Check status” action for the same job ID and allow a final authoritative status/refund check. Preserve the no-second-admission guarantee. Add tests for lost initial GET, failed list discovery, and deadline exhaustion followed by reconciliation.

## 3. Medium: retrying a refunded item reuses its terminal job ID

**Locations:** `client/hooks/useBatchQueue.ts:555`, `client/hooks/useBatchQueue.ts:648`, `client/hooks/useBatchQueue.ts:913`.

The terminal-error branch removes the persisted recovery entry but leaves `asyncJobId` on the queue item. `processBatch` includes every ERROR item, including items marked `retryable: false`. Its next attempt reuses that ID. The server correctly replays the immutable refunded reservation for unchanged settings, or returns a fingerprint conflict for changed settings; it cannot start a new prediction for that identity.

**Impact:** starting the batch again after a confirmed provider failure cannot retry that image successfully. The customer must remove and re-add the file. The stale identity also conflates an explicit new attempt with recovery of an unresolved attempt.

**Observed reproduction:** process one item, return a confirmed refunded terminal error, then invoke `processBatch`. Both calls to `processImage` received exactly the same UUID despite a UUID generator capable of returning a fresh ID. The regression probe failed.

**Suggested fix:** distinguish confirmed-terminal attempts from unresolved jobs. Respect non-retryable errors in batch selection. If the product permits an explicit new attempt after refund, clear/replace the old job identity only for that action. Keep the original ID for ambiguous outcomes and resume those through status/output. Test both branches, including changed settings.

## Release evidence still required

The implementation PRD itself leaves staging and phase 6 pending (`docs/PRDs/cloudflare-async-upscale-crash-fix.md:211`). Local evidence supports the architecture, but does not establish production crash resolution.

1. Make the documented integration/E2E commands reproducible. The PRD records successful alternate-config runs, but the standard web-server commands encountered the worktree's `node_modules -> ../../node_modules` symlink. That symlink is still present.
2. Exercise fresh real-provider staging cases for large paid Quick 2x/4x and fallback, including interruption/recovery. The inspected runtime matrix uses a fixture provider; JavaScript heap reductions do not prove total isolate headroom or enforced Cloudflare CPU limits.
3. Verify source/build/deployed-version identity and an actual canary route. Before any production migration, perform the repository-required verified backup. Rehearse rollback that stops new admissions while preserving async status, delivery, and reconciliation for existing jobs.
4. Before broad rollout or incident closure, satisfy the PRD's canary gate: at least 24 hours and 500 representative admissions, zero async memory terminations, verified Tail collection, financial invariants, and completion/refund/backlog measurements against the predefined baseline. These are rollout gates, not a demand for production deployment during this review.

## Verification and limits

| Check                                                                                                                                                         | Result                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Targeted Vitest matrix: async routes, output, cron, credit parity, body guard, failure recording, client API, queue hooks, credit manager, delivery migration | **190 tests passed across 14 files**, 7.25 seconds                                                            |
| `yarn verify`                                                                                                                                                 | **Passed**, 28.66 seconds; includes TypeScript, lint, translation/schema/indexation checks and 11 cache tests |
| Temporary defect probes                                                                                                                                       | **3 failed as expected**, confirming the rate-budget collision and two queue recovery/retry defects           |
| `git diff --check`                                                                                                                                            | Passed                                                                                                        |
| Existing built-runtime artifacts                                                                                                                              | Inspected matrix and artifact presence; **not rerun** during this review                                      |

The existing matrix records 12 workload comparisons with reduced retained JavaScript heap. The PRD records a successful built-runtime package gate, 10 integration tests, and two browser tests under its alternate setup. Those historical results are distinguished from the fresh checks above. This review did not run a live provider, apply migrations, query production data, or deploy.

Fresh command logs are available locally at `/tmp/async-upscale-production-review-tests.log`, `/tmp/async-upscale-production-review-verify.log`, `/tmp/async-upscale-production-review-probes.log`, and `/tmp/async-upscale-production-review-rate-probe.log`. The temporary probes were removed after recording their failures; application code was not fixed as part of this review. The existing tests and implementation remain in place.

The transactional admission, observation fencing, guarded refund paths, and output leases are useful protections. Approval remains blocked by the concrete defects above and the missing release evidence. The approximately 22 GB worktree is retained because it contains the user's uncommitted implementation and runtime evidence; review completion does not make that checkout disposable.

**Next action:** turn finding 1 into a real-limiter regression test before changing the storage key.
