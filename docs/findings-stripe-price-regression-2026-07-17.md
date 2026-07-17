# Findings: Stripe price ID regression + recent-commit review (2026-07-17)

## 1. The Stripe price ID regression

**Symptom**: checkout rejects price IDs ("Unknown price ID" from `assertKnownPriceId` in
`shared/config/subscription.utils.ts:104`, or Stripe "No such price").

**Root cause**: client and server price ID defaults pointed at _different Stripe accounts_
since the corp account migration.

Three price ID families exist in history:

| Family                        | Account                                 | Where it lived                                                  |
| ----------------------------- | --------------------------------------- | --------------------------------------------------------------- |
| `price_1Sz0f...L1vUl00LlZ...` | old personal account                    | server defaults in `shared/config/env.ts` (until 057e1b1c)      |
| `price_1TPos...1I7KzZir1i...` | stale/wrong set introduced at migration | client defaults in `shared/config/env.ts` (eee29d59 → 057e1b1c) |
| `price_1TPo...17DctxcZv2...`  | current corp account (coldstartlabs.ca) | both, after 057e1b1c                                            |

Timeline:

- **2025-12-01 (`4bd4b705`)** — `NEXT_PUBLIC_STRIPE_PRICE_*` vars were removed from the CI
  build env in `.github/workflows/deploy.yml` ("Stripe Price IDs are now configured in
  shared/config/stripe.ts"). From this point, CI-built client bundles bake in the **code
  defaults** from `shared/config/env.ts`.
- **2026-04-24 (`eee29d59`, "fixes on webhook secret"** — same day as the corp Stripe
  migration) — updated **only the client-side** defaults to the `1I7KzZir1i` family, leaving
  server defaults on the old personal account's `L1vUl00LlZ` IDs. This is the regression:
  the browser sends a price ID the server's price index (built from `serverEnv`) doesn't
  contain, and neither family matches the corp account the live `STRIPE_SECRET_KEY` targets.
- The old `load-env.sh` sync only copied server → public IDs when the public var was
  _unset_, so a stale value in the `.env.client` prod secret silently won.

## 2. Does 057e1b1c fix it?

**Yes, for both deploy paths. The configuration caveat is verified; rollout is pending.**

What the commit does:

- Aligns all client and server defaults in `shared/config/env.ts` on the corp
  `17DctxcZv2` family (subscriptions + credit packs).
- `scripts/load-env.sh`: `sync_public_stripe_prices` now **always** overrides
  `NEXT_PUBLIC_STRIPE_PRICE_*` with the server-side values, so a stale `.env.client`
  secret can no longer win. `scripts/deploy/deploy.sh:52` sources this before build.
- Adds an analytics fetch timeout (`fetchAnalyticsWithTimeout`) for Amplitude/GA4 —
  unrelated to Stripe, looks correct (aborts + clears timer).

Why it works per path:

- **Local deploy (`scripts/deploy/deploy.sh`)**: server secrets from GCloud override the
  public vars at build; preflight (`scripts/deploy/steps/01-preflight.sh`) validates every
  `*STRIPE_PRICE*` var against the live Stripe API and blocks deploy on mismatch. Solid.
- **CI deploy (push to master)**: no price vars are injected, so both client bundle and
  server fall back to the now-aligned code defaults.

**Verification on 2026-07-17**: the GCloud production API secret uses a live Stripe key;
all seven `STRIPE_PRICE_*` values match the `17DctxcZv2` code defaults; and Stripe reports
all seven prices active and live-mode. The live `/api/health` endpoint is healthy. However,
the production checkout smoke test still returns `INVALID_PRICE` for the corp Starter ID,
which proves the live Worker is serving a pre-`057e1b1c` bundle. Deploy the committed fix,
then rerun `SMOKE_BASE_URL=https://myimageupscaler.com yarn test:smoke`.

## 3. Other regressions in recent commits

### 3.1 CONFIRMED — CI deploy verification is a no-op (`8d6bb348`)

`.github/workflows/deploy.yml:142-148`: the "Verify Deployment" job replaced live HTTP
checks (`/api/health` with retries + homepage 200) with a Cloudflare API query asserting
only `.result.deployments | length > 0`. That is true if _any historical_ deployment
exists, so a Worker that deploys but throws at runtime — exactly the class of the checkout
breakage — passes green. The real post-deploy checks (live health, webhook secret,
smoke tests) live only in `scripts/deploy/steps/06-verify.sh`, which CI never runs.

**Resolved in the follow-up commit**: CI retains the Cloudflare deployment query and now
also calls the production `/api/health` endpoint with bounded retries and a hard failure
on non-200 responses.

### 3.2 Clean

- `bd3116f0` (webpack worker build): build step env block unchanged; `--webpack` is
  correct for Next 16 + OpenNext; mirrors local `02-build.sh`.
- `2a8fa2d2` (deploy command): `deploy --config wrangler.json` is correct; old command was
  an invalid wrangler subcommand.
- `6e5a1190` / `f29edcb4` (CI Postgres migration tests): no masking — unreachable DB fails
  the job rather than skipping.
- `d99424a9` ("fixes"): docs only (AGENTS.md, reddit post log).

### 3.3 Minor

- **Resolved in the follow-up commit**: `tests/smoke/checkout.smoke.spec.ts` now falls back
  to the corp Starter ID, with a regression assertion preventing the stale family from
  returning.

### 3.4 `9499bc84` — restore lifecycle email delivery

The core fix is sound: the prior freeze came from frequency-cap queries counting
`['pending','sent']` rows, so stuck-pending rows permanently suppressed users. The commit
correctly narrows cap/cooldown counting to `status='sent'`, adds a separate pending-dedup
check, and the claim RPC / advisory-lock budget / stale-claim reclaim have no double-send
hole. But it introduces regressions:

1. **MEDIUM (delivery) — permanent retry loop for poison rows.** Non-recipient provider
   errors (HTTP 400, missing config/auth) are classified `scope='provider'`
   (`server/services/email-providers/base-email-provider-adapter.ts:107`), and in
   `processDueQueue`'s catch (`server/services/email-lifecycle.service.ts` ~686-720) any
   provider-scope error takes the provider-stop path: the row is rescheduled
   `pending, now+10min` (line ~1349) with no attempt counter and is never marked
   `failed`. A message both providers reject retries forever and halts the drain each
   cycle (old code dead-lettered non-transient errors).
2. **MEDIUM (throughput) — one bad row stalls the drain.** `shouldStopLifecycleDrain`
   (`workers/cron/index.ts`) stops when `sent===0 && skipped===0`; with `sendLimit`
   clamped to 1, a single row that ends `failed` stops all remaining drains for that
   hourly schedule. Compounds with #1: a persistently failing top-priority row throttles
   all mail behind it.
3. **MEDIUM (analytics) — bounce/complaint metrics silently ~0.** The new
   `get_email_recipient_value_performance` SQL regex-matches `'hard.?bounce|complaint'`
   in `metadata->>'error'` / `provider_response`, but the same commit changed failure
   metadata to `{classification,scope,transient}` (no `error` key, no those keywords).
   Synchronously-detected bounces no longer count.
4. **LOW (deploy)** — five non-`CONCURRENTLY` `CREATE INDEX` on the hot
   `email_lifecycle_queue` in one migration take a write lock during deploy.
5. **LOW (deploy)** — `deploy.sh` now hard-blocks every prod deploy on `yarn db:backup`;
   any backup failure blocks all deploys. (`06-verify.sh`'s email-readiness check is
   non-blocking.)
6. **LOW** — `markQueueRow('sent')` runs before `recordLifecycleEvent`; if the event
   insert throws, a delivered row is mislabeled `failed` (pre-existing pattern). Policy
   version `'v1'` is duplicated between SQL and `RECIPIENT_VALUE_POLICY_VERSION` —
   bumping the constant without a migration silently stops marketing drainage.

Strongest items to act on: #1 and #2 (they compound into delivery throttling) and
#3 (silent analytics breakage).

### 3.5 Follow-up resolution

- **3.4.1 resolved**: only transient provider-scoped failures are rescheduled. Permanent
  request, authentication, and configuration errors are dead-lettered; generic "not
  configured" errors are now classified as permanent provider-configuration failures.
- **3.4.2 resolved**: the cron drain continues after a row fails permanently and stops
  only for explicit health/provider capacity signals, provider incidents, empty queues,
  or request failures. The sequence remains bounded to ten single-send invocations.
- **3.4.3 resolved**: failed lifecycle events again include a normalized `error` signal
  (`hard_bounce` or `complaint`) while retaining structured classification metadata, so
  the deployed performance SQL counts synchronous failures.
- **3.4.4 historical/no rewrite**: the index migration is already committed and may have
  run. Editing it in place would not repair deployed databases and could create migration
  drift; use concurrent index creation for future hot-table migrations.
- **3.4.5 intentionally retained**: a failed production backup continues to block deploys,
  matching the repository's production-database safety requirement.
- **3.4.6 verified/guarded**: `recordLifecycleEvent` logs insert errors rather than throwing,
  so a delivered row remains `sent`; a regression test now proves this. A second test ties
  the SQL due-queue policy version to `RECIPIENT_VALUE_POLICY_VERSION`, so a one-sided
  version bump fails verification.
