# PRD: Pre-Deploy Production Hardening

**Date:** 2026-07-18  
**Status:** Ready for implementation  
**Owner:** Engineering  
**Reference:** `docs/PRDs/incident-remediation-followup-full.md`, Priority 1 only

`Complexity: 6 → MEDIUM mode`

- +3: more than 10 files across deploy scripts, application health, CI, configuration, and tests
- +2: new deployment-contract and database-verification module
- +1: production Supabase and Stripe integrations

## 1. Context

**Problem:** Production can currently receive an application build whose Git SHA, database migration history, database function contracts, or Stripe account do not match the source and configuration that were approved for deployment.

### Files analyzed

- `docs/PRDs/incident-remediation-followup-full.md`
- `docs/PRDs/production-credit-checkout-email-processing-incident-remediation.md`
- `docs/PRDs/done/deploy-system.md`
- `scripts/deploy/deploy.sh`
- `scripts/deploy/common.sh`
- `scripts/deploy/steps/00-fetch-secrets.sh`
- `scripts/deploy/steps/01-preflight.sh`
- `scripts/deploy/steps/02-build.sh`
- `scripts/deploy/steps/03-deploy.sh`
- `scripts/deploy/steps/06-verify.sh`
- `scripts/deploy/stripe-deployment-guard.ts`
- `scripts/deploy/verify-stripe-deployment-config.ts`
- `scripts/load-env.sh`
- `scripts/db-backup.sh`
- `.github/workflows/deploy.yml`
- `app/api/health/route.ts`
- `shared/config/env.ts`
- `supabase/migrations/20260718195105_fix_claim_grant_column_ambiguity.sql`
- `tests/unit/deploy/*.unit.spec.ts`
- `package.json`
- `wrangler.json`

### Current behavior

- `yarn deploy` requires a clean working tree but does not fetch the remote branch or reject committed-but-unpushed work.
- Neither the local deploy path nor the GitHub production workflow compares repository migration history with `supabase_migrations.schema_migrations` before deploying the application.
- `/api/health` proves database connectivity, but it does not identify the deployed Git commit.
- The existing Stripe guard validates key mode and price ownership indirectly, but it does not assert the authenticated Stripe account ID.
- The local and GitHub deployment paths implement different checks, so a guard added to only one path leaves another production entry point open.
- The migration directory contains legacy date-only versions with duplicate prefixes as well as modern unique timestamp versions. A naive filename-to-version set comparison would produce false drift and must not be used.

### Incident failure modes this PRD must close

1. Production DB is migrated while an older, incompatible app remains deployed.
2. The repository contains a migration production has not applied.
3. Production contains an out-of-repository migration or hot-applied migration history entry.
4. A critical RPC exists but its arguments or accepted domain no longer match the app.
5. A local deploy uses a commit that has not been pushed and cannot be reproduced by CI or another operator.
6. The deployed Worker is healthy but is not the commit the deploy initiated.
7. A valid-looking live Stripe secret belongs to the wrong live account.

## 2. Goals and non-goals

### Goals

- Fail before application deployment on any database migration or critical RPC contract mismatch.
- Make the application declare the exact migration version it requires.
- Prove the deployed Worker reports the exact expected Git SHA.
- Reject local deployments of unpushed commits using freshly fetched remote state.
- Reject production configuration authenticated to any Stripe account other than the explicitly provisioned account.
- Use the same reusable guard implementations from both production deployment paths.
- Keep all checks lightweight; none execute in the Cloudflare request path except returning already embedded release metadata from `/api/health`.

### Non-goals

- Applying, repairing, reverting, or renaming production migrations.
- Automating database schema changes.
- Stripe customer/object ownership repair.
- Secret normalization other than the two values required by these checks.
- Webhook event-set convergence or genuine Stripe delivery verification.
- Durable processing-job recovery.
- Reworking the broader deployment system or removing existing checks.
- Adding SEO behavior, routes, metadata, or sitemap changes.

## 3. Integration points

**How will this feature be reached?**

- [x] Entry point identified: local `yarn deploy` and `.github/workflows/deploy.yml` on `master`/manual dispatch.
- [x] Caller files identified: `scripts/deploy/deploy.sh`, `scripts/deploy/steps/02-build.sh`, `scripts/deploy/steps/06-verify.sh`, and `.github/workflows/deploy.yml`.
- [x] Registration required: new package scripts for the database guard and release verification; both production paths call them before or after the appropriate boundary.

**Is this user-facing?**

- [x] No. This is an internal release-safety feature triggered by deployment automation.
- [x] The operator sees a pass/fail summary with mismatch categories and no secret values.
- [x] `/api/health` gains non-sensitive release metadata for automated verification.

**Full operator flow:**

1. Operator pushes an approved commit or starts `yarn deploy` from a clean branch.
2. The deploy resolves the immutable expected SHA and fresh upstream state.
3. Production secrets are loaded, backup completes where the existing local flow requires it, then the database and Stripe guards run.
4. The application is built with the expected SHA embedded in `.env.local` before both Next.js and OpenNext builds.
5. The Worker is deployed.
6. The release verifier reads `/api/health` and requires `release.sha` to equal the expected SHA.
7. Any mismatch exits non-zero and reports the exact failed contract; success continues to the existing smoke checks.

## 4. Solution

### Approach

- Add a version-controlled deployment contract beside the migrations. It declares the app-required migration, the start of strict unique-version tracking, the reviewed legacy baseline, and critical RPC signatures/domains.
- Add one reusable TypeScript database guard using `pg`. It performs read-only history/signature queries and transactional, rolled-back RPC probes.
- Extend the Stripe guard to retrieve the authenticated account and compare its ID with a required secret value.
- Embed the resolved source SHA through `.env.local`, expose it through typed `serverEnv`, and verify it with one reusable release-verification command.
- Wire the reusable commands into local deploy and GitHub Actions. Do not duplicate contract parsing in Bash, inline `jq`, or smoke tests.

```mermaid
flowchart LR
    A[Approved Git SHA] --> B[Fresh upstream guard]
    B --> C[Verified DB backup in local deploy]
    C --> D[Migration and RPC contract guard]
    D --> E[Stripe account and price guard]
    E --> F[Write SHA to .env.local]
    F --> G[Next and OpenNext build]
    G --> H[Cloudflare deploy]
    H --> I[/api/health release.sha]
    I --> J[Expected SHA equality]
```

### Key decisions

- [x] **Fail closed:** missing credentials, malformed contract data, query errors, timeouts, and mismatches block deployment. There is no skip flag for these guards.
- [x] **One contract source:** database expectations live in `supabase/deployment-contract.json`; Bash and workflow YAML must not restate migration/RPC expectations.
- [x] **No production mutation:** history and signature checks are read-only. RPC behavior probes run on a dedicated smoke-test profile inside explicit transactions that always roll back.
- [x] **No direct `process.env` outside typed config:** add all runtime inputs to `serverEnv` in `shared/config/env.ts`; pure validation functions receive values as arguments for unit testing.
- [x] **No hardcoded Stripe account:** the expected ID is required through `STRIPE_EXPECTED_ACCOUNT_ID`. The reference account value must be provisioned in secret stores, not committed as a fallback.
- [x] **No naive legacy migration comparison:** implementation starts with a read-only inventory of remote history. Reviewed legacy entries are pinned in the contract; every modern timestamp migration is compared exactly in both directions.
- [x] **Never rename applied migrations:** a legacy discrepancy blocks implementation and is resolved through a separately approved history-repair plan with the production backup protocol, not silently inside this PRD.
- [x] **Single SHA verifier implementation:** local verification and CI call the same TypeScript command. Do not add an inline CI `jq` check or a duplicate smoke assertion.
- [x] **Cloudflare CPU constraint:** `/api/health` only returns a build-time string; all network/database contract work runs in deploy automation, never in a Worker request.

### Deployment contract shape

Create `supabase/deployment-contract.json` with this schema:

```json
{
  "requiredMigration": "20260718195105",
  "strictHistoryFrom": "20260708000100",
  "legacyHistory": [{ "version": "reviewed-remote-version", "name": "reviewed_remote_name" }],
  "criticalFunctions": [
    {
      "schema": "public",
      "name": "claim_free_credit_grant",
      "arguments": "p_user_id uuid, p_ip text, p_user_agent text, p_requested_credits integer",
      "result": "TABLE(granted_credits integer, existing_grant boolean, matched_account_count integer, new_total_balance integer)",
      "acceptedRequestedCredits": [0, 3, 5],
      "rejectedRequestedCredits": [10]
    }
  ]
}
```

The values shown for `legacyHistory` are placeholders, not implementation data. Populate them only from the Phase 1 read-only production inventory. Validate the JSON with Zod before connecting to production.

### Migration comparison rules

1. Parse only migration filenames matching `^([0-9]+)_(.+)\.sql$`; ignore `run-blog-migration.sh` and other non-SQL files.
2. Reject a new migration at or after `strictHistoryFrom` if its version is duplicated locally.
3. Query remote `supabase_migrations.schema_migrations` for `version` and `name` and normalize the name exactly once in the TypeScript module.
4. Require every strict local `(version, name)` entry to exist remotely; report these as `LOCAL_ONLY` (forgotten migration).
5. Require every strict remote `(version, name)` entry to exist locally; report these as `REMOTE_ONLY` (out-of-repository production change).
6. Require the remote legacy entries to equal the reviewed `legacyHistory` baseline. A new remote legacy entry is `REMOTE_ONLY`; a baseline entry disappearing is `REMOTE_HISTORY_MISSING`.
7. Require `requiredMigration` to be a strict local migration and to equal the newest strict migration version in the repository.
8. Require `requiredMigration` to exist remotely and to equal the newest strict remote migration version. This is the explicit app/DB compatibility gate.
9. Print version and name only. Never print a database URL, password, query result containing user data, or secret.

### Critical RPC checks

- Resolve exactly one function by schema/name and `pg_get_function_arguments`; zero or multiple matches fail.
- Compare `pg_get_function_arguments` and `pg_get_function_result` with the contract after whitespace normalization only. Do not normalize away argument names, types, order, or result columns.
- Require `DEPLOY_DB_SMOKE_USER_ID` to reference a dedicated, non-customer production profile maintained for deployment probes.
- For each accepted value (`0`, `3`, `5`), start a transaction, call `public.claim_free_credit_grant` with the smoke profile and reserved documentation IP/user-agent values, assert the call does not reject the requested amount, and roll back in `finally`.
- For each rejected value (`10`), start a separate transaction, assert the call raises `Unsupported free credit amount`, and roll back in `finally`.
- A valid probe must reach a successful RPC result. Treat `profile not found`, permissions errors, or any other exception as failure.
- Assert the smoke profile's balances and grant/transaction counts are unchanged before versus after all probes. This provides executable proof that rollback worked.

### Configuration changes

Add typed server configuration for:

- `APP_BUILD_SHA`: required to be a 40-character lowercase Git SHA when `ENV=production`; safe non-production default is `development`.
- `STRIPE_EXPECTED_ACCOUNT_ID`: required and matching `^acct_` in production; empty only outside production.
- `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_REGION`, and `SUPABASE_PROJECT_REF`: required by the production database guard, with no logged values.
- `DEPLOY_DB_SMOKE_USER_ID`: required UUID for production contract probes.

Document names and purpose in `.env.api.example`; do not commit real values.

### Data changes

None. This PRD does not add a migration or authorize production data changes. The DB probe is transactionally rolled back and verifies zero durable delta.

## 5. Sequence flow

```mermaid
sequenceDiagram
    participant O as Deploy entry point
    participant G as Git remote
    participant DB as Production Postgres
    participant S as Stripe
    participant B as Build
    participant CF as Cloudflare Worker

    O->>G: fetch and verify expected SHA is pushed
    O->>DB: read migration history and function metadata
    DB-->>O: versions, names, signatures
    O->>DB: BEGIN; RPC probes; ROLLBACK
    DB-->>O: accepted/rejected contract results
    O->>S: retrieve authenticated account and prices
    S-->>O: account ID and live price records
    O->>B: build with APP_BUILD_SHA in .env.local
    B->>CF: deploy immutable bundle
    O->>CF: GET /api/health
    CF-->>O: status and release.sha
    O->>O: require release.sha == expected SHA
```

## 6. Execution phases

### Phase 1: Pin the database deployment contract - Operators get a reviewed, testable model of repository and production history

**Files (max 5):**

- `supabase/deployment-contract.json` - required migration, legacy baseline, strict boundary, and critical RPC contract
- `scripts/deploy/database-deployment-contract.ts` - Zod schema, local migration parser, normalization, and pure comparison logic
- `tests/unit/deploy/database-deployment-contract.unit.spec.ts` - parser and bidirectional drift tests
- `package.json` - add a read-only inventory command used during implementation

**Implementation:**

- [ ] Query production migration history read-only and capture `(version, name)` only; do not inspect or export application rows.
- [ ] Reconcile the existing legacy duplicate-prefix files with remote history and populate `legacyHistory` from reviewed evidence.
- [ ] Set `strictHistoryFrom` to the first repository migration in the unique timestamp era that is confirmed in production.
- [ ] Set `requiredMigration` to the newest repository migration the current application requires.
- [ ] Implement fail-closed contract parsing and pure local/remote comparison functions.
- [ ] Reject duplicate strict versions, `LOCAL_ONLY`, `REMOTE_ONLY`, missing baseline entries, and a required head that is not the local latest strict version.
- [ ] Do not rename, repair, apply, or delete any migration in this phase.

**Tests required:**

| Test file                                                     | Test name                                                                           | Assertion                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- |
| `tests/unit/deploy/database-deployment-contract.unit.spec.ts` | `should report LOCAL_ONLY when a repository migration is not remote`                | exact missing version/name is returned    |
| same                                                          | `should report REMOTE_ONLY when production history is not in the repository`        | exact unexpected version/name is returned |
| same                                                          | `should reject duplicate versions when a migration is in the strict history window` | validation fails before a DB call         |
| same                                                          | `should preserve reviewed legacy duplicate-prefix history`                          | legacy files do not create false drift    |
| same                                                          | `should reject requiredMigration when it is not the latest strict local migration`  | stale app contract cannot pass            |
| same                                                          | `should ignore non-SQL migration directory files`                                   | helper scripts are excluded               |

**Verification plan:**

1. `yarn vitest run tests/unit/deploy/database-deployment-contract.unit.spec.ts`
2. Run the inventory command and manually compare its sanitized version/name output with the contract.
3. Save no production credentials or inventory artifacts in the repository.
4. `yarn verify`

**User verification:**

- Action: add a temporary fake strict migration to an in-memory unit-test fixture.
- Expected: comparison reports `LOCAL_ONLY`; reversing the fixture reports `REMOTE_ONLY`.

**Checkpoint:** Run the automated PRD checkpoint review. Proceed only on PASS.

### Phase 2: Block incompatible database deployments - Both deploy paths fail before build when migration or RPC contracts drift

**Files (max 5):**

- `scripts/deploy/database-deployment-guard.ts` - production connection, history/signature queries, transactional probes, sanitized CLI output
- `shared/config/env.ts` - typed DB guard inputs
- `.env.api.example` - names and safe setup comments only
- `tests/unit/deploy/database-deployment-guard.unit.spec.ts` - query, probe, rollback, and failure tests
- `package.json` - add `deploy:database:guard`

**Implementation:**

- [ ] Build the Postgres connection from typed Supabase configuration and use TLS with a bounded connection/query timeout.
- [ ] Import Phase 1 pure comparison logic rather than reimplementing it.
- [ ] Query and compare migration history, then compare critical function arguments and result shape.
- [ ] Run accepted and rejected grant probes in separate explicit transactions with unconditional rollback.
- [ ] Compare pre/post smoke-profile balances and relevant row counts.
- [ ] Redact errors so output contains the failed check but never credentials or user data.
- [ ] Exit `0` only when history, app-required head, signatures, behavior, and rollback invariants all pass.

**Tests required:**

| Test file                                                  | Test name                                                           | Assertion                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| `tests/unit/deploy/database-deployment-guard.unit.spec.ts` | `should stop before probes when migration history drifts`           | no RPC query/call occurs                             |
| same                                                       | `should reject an unexpected function argument or result signature` | mismatch exits non-zero                              |
| same                                                       | `should accept requested credits 0 3 and 5 and reject 10`           | all contract cases execute                           |
| same                                                       | `should rollback every successful and failed probe`                 | rollback is called in `finally` for each transaction |
| same                                                       | `should fail when the smoke profile changes durably`                | non-zero durable delta blocks deploy                 |
| same                                                       | `should redact connection credentials from errors`                  | captured stderr contains no supplied secret          |

**Verification plan:**

1. `yarn vitest run tests/unit/deploy/database-deployment-contract.unit.spec.ts tests/unit/deploy/database-deployment-guard.unit.spec.ts`
2. Against a local test Postgres instance, demonstrate one pass and seeded migration/signature mismatch failures.
3. Against production, run `yarn deploy:database:guard` read-only/rollback mode and record only the PASS summary.
4. `yarn verify`

**User verification:**

- Action: run the guard with the committed contract, then with a temporary expected argument mismatch.
- Expected: committed contract passes; mismatch fails without changing the smoke profile.

**Checkpoint:** Run the automated PRD checkpoint review. This phase also requires manual verification because it integrates with production Postgres. Proceed only after automated PASS and confirmation that the smoke profile has zero durable delta.

### Phase 3: Enforce pushed source and Stripe account identity - Local deploys are reproducible and both paths authenticate to the intended Stripe account

**Files (max 5):**

- `scripts/deploy/deploy.sh` - fresh fetch/upstream guard and database-guard wiring before build
- `scripts/deploy/stripe-deployment-guard.ts` - pure expected-account validation
- `scripts/deploy/verify-stripe-deployment-config.ts` - retrieve Stripe account and pass typed expectation
- `tests/unit/deploy/deploy-entrypoint.unit.spec.ts` - ordering and no-bypass assertions
- `tests/unit/deploy/stripe-deployment-guard.unit.spec.ts` - wrong/missing/correct account cases

**Implementation:**

- [ ] After the initial clean-tree check and before secret fetching/building, run `git fetch --prune origin` and fail if it fails.
- [ ] Require an upstream branch, reject detached HEAD for local production deploy, and require `HEAD` to be an ancestor of freshly fetched `@{upstream}`.
- [ ] Print local and upstream SHA prefixes only on mismatch; do not auto-push.
- [ ] Call `deploy:database:guard` after the existing verified backup and before any build/deploy step.
- [ ] Retrieve `stripe.accounts.retrieve()` using the configured secret and require the returned ID to equal `serverEnv.STRIPE_EXPECTED_ACCOUNT_ID`.
- [ ] Preserve all existing live-key, client/server price equality, live-mode, active-price, and ownership checks.
- [ ] Add no skip option for Git, database, or Stripe identity guards.

**Tests required:**

| Test file                                                | Test name                                                    | Assertion                                  |
| -------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `tests/unit/deploy/deploy-entrypoint.unit.spec.ts`       | `should fetch origin before checking upstream ancestry`      | textual/order assertion proves fresh state |
| same                                                     | `should run database guard after backup and before build`    | required ordering is fixed                 |
| same                                                     | `should expose no bypass for release safety guards`          | unsupported flags still exit 2             |
| `tests/unit/deploy/stripe-deployment-guard.unit.spec.ts` | `should reject a live secret for the wrong expected account` | mismatch error names IDs but no key        |
| same                                                     | `should reject a missing expected production account`        | validation fails closed                    |
| same                                                     | `should accept matching account and valid live prices`       | existing price checks still pass           |

**Verification plan:**

1. `yarn vitest run tests/unit/deploy/deploy-entrypoint.unit.spec.ts tests/unit/deploy/stripe-deployment-guard.unit.spec.ts`
2. In a temporary local Git repository fixture, prove pushed HEAD passes and one local-only commit fails after fetch.
3. Run the Stripe guard with the provisioned production expectation; confirm only account ID and pass/fail are displayed.
4. `yarn verify`

**User verification:**

- Action: attempt deploy from a clean but unpushed local commit, then test a deliberately mismatched expected Stripe account in a safe invocation.
- Expected: both stop before build; the real pushed/configured state passes.

**Checkpoint:** Run the automated PRD checkpoint review. Manual confirmation is required for the production Stripe account lookup.

### Phase 4: Prove deployed release lineage - Health reports and automation verifies the exact build SHA

**Files (max 5):**

- `scripts/deploy/steps/02-build.sh` - resolve SHA and append it to `.env.local` before both builds
- `app/api/health/route.ts` - return non-sensitive `release.sha`
- `scripts/deploy/verify-release.ts` - reusable health response and exact-SHA verifier
- `scripts/deploy/steps/06-verify.sh` - invoke verifier before other post-deploy checks
- `tests/unit/deploy/release-lineage.unit.spec.ts` - env/build ordering, health shape, and verifier behavior

**Implementation:**

- [ ] Resolve expected SHA once with `git rev-parse HEAD`; require exactly 40 lowercase hex characters.
- [ ] Append `APP_BUILD_SHA=<sha>` to `.env.local` after combining production env files and before `next build`.
- [ ] Ensure deploy cleanup removes `.env.local` on success, failure, and interruption.
- [ ] Add `release: { sha: serverEnv.APP_BUILD_SHA }` to the typed health response without changing health status semantics.
- [ ] Implement bounded retries in `verify-release.ts`; require HTTP 200, valid JSON, healthy status, and exact SHA equality.
- [ ] Invoke the shared verifier from `06-verify.sh`; SHA mismatch is fatal, not a warning.
- [ ] Do not add release-SHA logic to smoke tests.

**Tests required:**

| Test file                                        | Test name                                                        | Assertion                              |
| ------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------- |
| `tests/unit/deploy/release-lineage.unit.spec.ts` | `should write APP_BUILD_SHA before Next and OpenNext builds`     | build ordering is correct              |
| same                                             | `should expose the typed build SHA from health`                  | response contains exact configured SHA |
| same                                             | `should accept health only when deployed and expected SHA match` | verifier exits zero                    |
| same                                             | `should fail when health reports development or another SHA`     | verifier exits non-zero                |
| same                                             | `should fail on malformed or missing release metadata`           | no compatibility fallback exists       |
| same                                             | `should clean up env local when build fails`                     | secret/build artifact is removed       |

**Verification plan:**

1. `yarn vitest run tests/unit/deploy/release-lineage.unit.spec.ts`
2. Build locally with a known SHA and inspect the built health handler through a local OpenNext preview.
3. Deploy a canary/preview and run the verifier with the canary SHA, then a deliberately wrong SHA.
4. `yarn verify`

**User verification:**

- Action: query `/api/health` after canary deployment and run `verify-release` with correct and incorrect SHAs.
- Expected: response reports the correct SHA; only the correct expectation passes.

**Checkpoint:** Run the automated PRD checkpoint review. Manual canary verification is required because Cloudflare propagation is external.

### Phase 5: Close CI parity and provision production inputs - Every production entry point runs the same mandatory checks

**Files (max 5):**

- `.github/workflows/deploy.yml` - database/Stripe pre-build guards, SHA build injection, and shared release verification
- `tests/unit/deploy/cloudflare-workflow.unit.spec.ts` - mandatory ordering, env wiring, and no duplicate inline verifier
- `shared/config/env.ts` - enforce final production requirements if Phase 2 staged them as optional during rollout
- `.env.api.example` - finalize operator documentation for required names
- `package.json` - expose the shared release-verification command if not already added

**Implementation:**

- [ ] Provision `STRIPE_EXPECTED_ACCOUNT_ID`, Supabase DB guard credentials, and `DEPLOY_DB_SMOKE_USER_ID` in GCloud Secret Manager and GitHub production secrets before making them required.
- [ ] Keep two enabled GCloud secret versions when updating the production secret, following the established safe fetch-modify-push practice.
- [ ] Wire CI to call the same `deploy:database:guard` and Stripe guard before `Build for Cloudflare Workers (OpenNext)`.
- [ ] Write `APP_BUILD_SHA=$GITHUB_SHA` to `.env.local` before the CI Next/OpenNext build and remove it afterward.
- [ ] Replace the health job's status-only curl with the shared release verifier using the expected workflow SHA; do not add inline JSON parsing.
- [ ] Ensure CI logs and GitHub annotations never print secret values or a database connection string.
- [ ] Keep the local backup-before-database-guard ordering. CI remains read-only/rollback-only and does not gain migration-apply authority.

**Tests required:**

| Test file                                            | Test name                                                               | Assertion                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| `tests/unit/deploy/cloudflare-workflow.unit.spec.ts` | `should run database and Stripe guards before the production build`     | both commands precede build                    |
| same                                                 | `should inject GITHUB_SHA through env local before both build commands` | known broken shell-only plumbing cannot return |
| same                                                 | `should verify production through the shared release verifier`          | no status-only curl or inline jq remains       |
| same                                                 | `should pass required secrets only to the steps that need them`         | least-scope env wiring                         |
| same                                                 | `should provide no migration apply or repair command`                   | CI remains non-destructive                     |

**Verification plan:**

1. `yarn vitest run tests/unit/deploy/*.unit.spec.ts`
2. Validate workflow syntax and inspect GitHub Actions expressions without exposing resolved secrets.
3. Run the workflow against a preview/canary environment first.
4. Confirm database, Stripe, build, deploy, and exact-SHA verification steps pass in order.
5. `yarn test` on affected areas and `yarn verify`.

**User verification:**

- Action: trigger the canary workflow from a known commit.
- Expected: guards pass before build, Cloudflare deploys, and the shared verifier reports the same full SHA.

**Checkpoint:** Run the automated PRD checkpoint review. Manual approval is required before enabling the new required secrets on the production workflow.

## 7. Rollout and stop conditions

### Rollout order

1. Complete the read-only production migration inventory and approve the legacy baseline.
2. Create the dedicated DB smoke profile; record its UUID only in secret stores.
3. Provision the expected Stripe account ID and database guard inputs in GCloud and GitHub production scope.
4. Run all guards manually against production without deploying.
5. Run an OpenNext canary/preview and prove embedded SHA verification.
6. Enable the local deployment wiring.
7. Enable the GitHub production workflow wiring.
8. Run one full deployment from a pushed, known commit and retain sanitized action logs as evidence.

### Stop conditions

- Remote migration history cannot be reconciled with the repository and reviewed legacy baseline.
- Implementing the guard would require renaming, deleting, applying, or repairing a production migration under this PRD.
- A DB probe changes the smoke profile, grant rows, transaction rows, or balances after rollback.
- The expected Stripe account has not been provisioned in both production secret stores.
- `.env.local` does not reliably disappear after a failed build.
- Preview or production health reports `development`, a short SHA, or a SHA different from the deployment source.
- Either production entry point can bypass a migration, DB contract, Stripe identity, or release-lineage guard.

If a production schema/history repair becomes necessary, stop. Create and verify a fresh backup with `yarn db:backup`, `yarn db:backups`, and `gzip -t`, record the archive paths, and obtain approval through a separate database-change plan before changing production.

## 8. Verification strategy

### Required evidence by phase

- Unit tests prove parsing, comparison, error handling, ordering, redaction, and exact SHA/account matching.
- Local Postgres integration proves transaction rollback and behavioral RPC checks.
- Read-only production runs prove migration/signature/account checks against real external systems.
- Canary deployment proves build-time SHA plumbing survives Next.js, OpenNext, and Cloudflare.
- The final workflow run proves all checks execute in the required order from one immutable pushed commit.

### Final commands

```bash
yarn vitest run tests/unit/deploy/*.unit.spec.ts
yarn test
yarn verify
```

`yarn verify` is mandatory before completion even if earlier phase checkpoints ran it.

### Verification evidence to append during implementation

```markdown
## Verification Evidence

- Phase 1 contract/history tests: PASS; production inventory reviewed by: <name/date>
- Phase 2 DB guard: PASS; smoke profile durable delta: zero
- Phase 3 upstream and Stripe identity guards: PASS; authenticated account: <account id>
- Phase 4 canary SHA: expected <sha>, observed <sha>, PASS
- Phase 5 production workflow run: <run URL>, all mandatory steps PASS
- yarn test: PASS
- yarn verify: PASS
```

Do not append credentials, database URLs, secret hashes, user data, or full external API payloads.

## 9. Acceptance criteria

- [ ] The app-required migration is version-controlled beside `supabase/migrations/`.
- [ ] A local-only migration blocks both production deployment paths before build.
- [ ] A remote-only migration history entry blocks both production deployment paths before build.
- [ ] A remote head older or newer than the app-required migration blocks deployment.
- [ ] Missing, overloaded, or signature-drifted critical RPCs block deployment.
- [ ] `claim_free_credit_grant` probes prove `0/3/5` accepted and `10` rejected, with zero durable production changes.
- [ ] Local `yarn deploy` fetches origin and rejects a clean but unpushed commit.
- [ ] The build embeds a full immutable SHA through `.env.local` before Next/OpenNext compilation.
- [ ] `/api/health` returns the deployed SHA, and exact mismatch is fatal after deployment.
- [ ] The Stripe guard rejects a live key from any account other than `STRIPE_EXPECTED_ACCOUNT_ID`.
- [ ] Local and GitHub production paths call the same reusable database, Stripe, and release verifiers.
- [ ] No new skip flag bypasses a production safety guard.
- [ ] No deployment guard logs secrets, DB URLs, user data, or raw provider payloads.
- [ ] All phase tests pass, affected `yarn test` passes, and final `yarn verify` passes.
- [ ] Every automated checkpoint review passes; production DB, Stripe, Cloudflare, and secret-provisioning manual checks are approved.

## 10. Post-deploy checks

- Confirm `/api/health` reports the just-deployed full SHA.
- Confirm the database guard still passes after deployment; it must remain read-only/rollback-only.
- Confirm the authenticated Stripe account ID matches the provisioned expectation and existing checkout smoke still passes.
- Confirm no DB smoke-profile balances or audit counts changed.
- Check deployment logs for mismatch warnings or redaction failures.
- This PRD contains no SEO changes, so it does not add a GSC or IndexNow follow-up.
