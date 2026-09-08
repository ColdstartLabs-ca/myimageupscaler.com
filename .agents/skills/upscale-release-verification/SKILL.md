---
name: upscale-release-verification
description: Use when checking MyImageUpscaler release readiness, async upscaling, missing RPCs, provider billing outages, stuck jobs, refunds, reconnects, or whether deploy --skip-tests is safe.
---

# Upscale release verification

Run from the intended MyImageUpscaler release checkout:

```bash
yarn test:upscale:release
```

This is mandatory in `yarn deploy`, including `--skip-tests`, before production secrets or migrations. It requires Docker, installed dependencies, and Playwright Chromium. A missing prerequisite or failed test blocks release; do not weaken the gate or substitute mocked API tests.

## Evidence contract

1. The command rebuilds current source into an isolated OpenNext/Workers artifact. It executes the actual application in workerd with disposable PostgreSQL/PostgREST. Preserve the command exit status, source/bundle identity and build logs under `test-results/async-upscale-runtime/`. Match that source identity to the checkout ultimately deployed; rerun after application changes.
2. Require the schema, durable API, provider outage, fallback, and browser projects to pass. The browser must upload/recover/download through real app routes; inspect final reservation status, exact credit transactions and decoded image dimensions, not only HTTP status or a visible button.
3. On failure, inspect the failing assertion and retained trace in `test-results/upscale-release/`. Distinguish application bugs from fixture infrastructure failures. Diagnostic runs against existing artifacts are useful for investigation, but only a fresh full gate is release evidence.
4. After changes, run affected unit tests and `yarn verify`. Confirm the deployment-entrypoint regression tests still block a failing gate with `--skip-tests`. Check production migration readiness separately before claiming production is repaired.
5. Report what passed, what remains unverified, and whether anything was deployed. “Local release gate passed” is not “production release-ready.” Provider/Auth/Storage transport is simulated, while app routes and database transitions are real. This does not prove live provider funds, output quality, email delivery, production credentials, or Cloudflare memory/CPU limits. Run `yarn test:upscale:async:runtime` for the separate local resource benchmark; deployed canary evidence is still required for actual Cloudflare limits.

## Outage checks

An HTTP 200 account/model lookup does not prove Replicate accepts paid predictions. A billing-denied prediction must refund once, pause subsequent admissions immediately, and recover through the normal cooldown/half-open logic after funding returns. Never fall back to another model for account-wide billing denial. Definitive eligible GPU failures may make one durable alternate attempt; ambiguous submissions must retain their original job ID and never create again.

Inspect `get_provider_circuit_availability('image-processing')`, not the raw `half_open` label or a different provider key. A stale half-open probe can already be available. Missing async RPCs cause a separate 503 and require the pending migrations, not a circuit reset.

Production diagnostics use the `gcloud-secrets` skill read-only. Never print credentials. A live billable prediction or production mutation needs user authorization. Before database repair, run and verify a fresh `yarn db:backup`, `yarn db:backups`, and `gzip -t` on both archives. Apply only the verified migration set, then confirm RPC availability and permissions. Do not deploy automatically when asked only to prepare a release.
