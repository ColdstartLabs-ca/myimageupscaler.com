# PRD: OpenNext Revalidation Queue — Safe Re-Enable of Cache Interception

**Status:** Draft
**Date:** 2026-08-31
**Owner:** João Paulo Furtado
**Incident reference:** `BUG-REPORT-OPENNEXT-REVALIDATION-QUEUE-OUTAGE.md` (SEV-1, 2026-08-31, recovery commit `dd78b04c`)
**Priority:** P1 — restores intended cache architecture; removes a recurring 500-producing configuration hazard

## 1. Problem statement

Commit `fcb8c57f` (2026-08-26) enabled `enableCacheInterception: true` in `open-next.config.ts` without configuring a revalidation queue. `defineCloudflareConfig` silently defaults `queue` to `"dummy"`, whose `send()` throws `FatalError("Dummy queue is not implemented")`. With interception active, every stale cache hit of an ISR route reaches this code path. Production accumulated thousands of HTTP 500 responses on long-tail ISR routes (Aug 28: 3,401; Aug 31: 4,917) until interception was disabled at 16:58Z on 2026-08-31.

The emergency mitigation (`dd78b04c`) disabled interception and kept the R2 + regional incremental cache. This restored availability but left the site in a degraded-cache state: ISR routes that were previously served straight from the incremental cache before the Next server bundle loads now fall through to the server.

Investigation corrections to the bug report (verified against `@opennextjs/cloudflare@1.16.0` / `@opennextjs/aws@3.9.13` source and Cloudflare GraphQL analytics):

- The trigger is a **stale cache hit**, not a cold miss. Cold misses (`!cachedData?.value`) pass through to the server without touching the queue (`cacheInterceptor.js:64` only sends on `isStale`).
- Worker-level exceptions were near zero during the outage window (2 errors / 8,327 requests), so the exact 500-producing error was not captured. The "Dummy queue is not implemented" quote in the bug report is unproven as the direct 500 mechanism; both `queue.send` call sites in aws 3.9.13 are wrapped in try/catch.
- The ~250/hr 504s on host `cache.local` in zone analytics are the regional cache's Cache API keys appearing in analytics — a benign artifact, unrelated to the outage.

## 2. Goals

1. Configure a real, production-grade revalidation queue so cache interception can be re-enabled safely.
2. Prove ISR revalidation works end-to-end in preview before any production change.
3. Make the failure mode structurally impossible to reintroduce: interception enabled ⇒ queue configured ⇒ queue binding present, enforced by tests.
4. Recover the intended latency profile: ISR/SSG HTML served from the incremental cache ahead of the Next server bundle.

## 3. Non-goals

- No change to the R2 incremental cache or `withRegionalCache` configuration.
- No migration to a different queue technology (no SQS, no custom queue implementation).
- No CDN invalidation / cache purge setup (`cachePurge` remains unconfigured; noted as a known follow-up trade-off in Section 9).
- No change to page-level `revalidate` values, prerender manifests, or middleware.
- No work on the `cache.local` 504 analytics artifact.

## 4. Solution overview

Use the queue override shipped with the installed adapter — the Durable Object-based queue — instead of building one:

- `@opennextjs/cloudflare/overrides/queue/do-queue` (verified: resolves, `name: "durable-queue"`). It writes each revalidation message to a Durable Object (`env.NEXT_CACHE_DO_QUEUE`) keyed by message group, which schedules the revalidation via the existing `WORKER_SELF_REFERENCE` service binding with retries, persisted in DO storage.
- The Durable Object class `DOQueueHandler` is already exported by the generated worker entry (`.open-next/worker.js` exports `DOQueueHandler` from `.build/durable-objects/queue.js`). No application code needs to define or re-export it.

Chosen over `@opennextjs/cloudflare/overrides/queue/memory-queue` because the MemoryQueue revalidates inline (blocks the triggering request up to 10s) and dedupes only per isolate; the DO queue schedules asynchronously with persisted retry state and cross-isolate deduplication. Both are adapter-provided; the DO queue is the adapter's recommended production path.

## 5. Detailed requirements

### 5.1 OpenNext configuration

`open-next.config.ts`:

```ts
import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: 'long-lived' }),
  queue: doQueue,
  // Re-enable only after preview acceptance (Section 7) passes.
  enableCacheInterception: false,
});
```

The `queue` override is effective for both the main server function and the external middleware bundle (the adapter propagates `queue` to both), so it must be set even while `enableCacheInterception` stays `false` — this removes the outage hazard for any future re-enable and for the middleware's `includeCache` path.

`enableCacheInterception` flips to `true` only in the deploy gated by Section 7 acceptance.

### 5.2 Wrangler bindings (both `wrangler.json` and `wrangler.preview.json`)

Add to each config:

```jsonc
"durable_objects": {
  "bindings": [
    { "binding": "NEXT_CACHE_DO_QUEUE", "class_name": "DOQueueHandler" }
  ]
},
"migrations": [
  { "tag": "v1", "new_sqlite_classes": ["DOQueueHandler"] }
]
```

- `new_sqlite_classes` is required because `DOQueueHandler` persists dedup/retry state in DO SQLite storage (`ctx.storage.sql`); the existing `compatibility_date: 2024-12-30` satisfies SQLite-backed DO requirements.
- `WORKER_SELF_REFERENCE` service binding already exists in both configs and is required by the DO to perform the revalidation request — verify it remains intact.
- Preview (`myimageupscaler-cache-preview`) and production (`myimageupscaler`) get independent DO namespaces; no shared state.

### 5.3 Optional runtime tuning (defaults are acceptable; do not set in v1)

| Env var | Default | Purpose |
|---|---|---|
| `NEXT_CACHE_DO_QUEUE_MAX_REVALIDATION` | `5` | Max concurrent revalidations per DO instance |
| `NEXT_CACHE_DO_QUEUE_REVALIDATION_TIMEOUT_MS` | `10000` | Per-revalidation request timeout |
| `NEXT_CACHE_DO_QUEUE_RETRY_INTERVAL_MS` | `2000` | Retry interval for failed revalidations |
| `NEXT_CACHE_DO_QUEUE_MAX_RETRIES` | `6` | Max retries for a failed revalidation |

### 5.4 Regression tests (unit, `tests/unit/seo/opennext-cache-config.unit.spec.ts`)

1. **Queue configured:** `cloudflareConfig.default?.override?.queue` resolves to the durable-queue override (import it in the test and assert identity, or assert `name === 'durable-queue'` via invocation).
2. **Paired invariant — interception implies queue:** a test that reads `enableCacheInterception` and, when `true`, requires the durable queue configured; when `false`, still requires the queue configured (the hazard removal). This replaces the current `should not intercept cached HTML without a configured revalidation queue` assertion.
3. **Binding present whenever interception could be on:** `wrangler.json` and `wrangler.preview.json` each contain a `durable_objects` binding `NEXT_CACHE_DO_QUEUE` → `DOQueueHandler`, and a `migrations` entry listing `DOQueueHandler` under `new_sqlite_classes`. Asserted unconditionally (bindings are harmless without interception and required for safety).
4. **Both bundles get the queue:** the adapter propagates `queue` to `middleware.override` — assert `cloudflareConfig.middleware?.override?.queue` equals the durable queue too.
5. Existing tests (R2 bucket binding, preview isolation, webpack build) remain green.

Per project rules: tests live in `tests/unit/seo/`, and an entry is appended to `docs/SEO/maintenance/seo-changes-backlog.md`.

### 5.5 Preview validation (staging worker `myimageupscaler-cache-preview`)

Deploy the preview worker with `queue: doQueue` bound and `enableCacheInterception: true`, then:

1. **Cold miss safety:** request an ISR route with the R2 preview bucket emptied; response is 2xx (rendered by the server), `x-opennext-cache` absent or `MISS` — no 5xx.
2. **Stale-hit revalidation demonstrated (the incident scenario):** request an ISR route past its revalidate window; expect 2xx with `x-opennext-cache: STALE` and `cache-control: s-maxage=1, stale-while-revalidate=...`; a follow-up request within the stale-while-revalidate window returns `x-opennext-cache: HIT`. Inspect preview Worker logs for the DO revalidation (or absence of any exception); confirm no `Dummy queue is not implemented` and no unhandled exception.
3. **Representative route classes:** `/` (home), one `/blog/<slug>`, one locale route (`/pt/...`), one pSEO route, one `/tools/...` route, `/api/health` — all 2xx/3xx on cold and warm requests.
4. **On-demand revalidation:** trigger `revalidatePath`/`revalidateTag` (e.g., via an admin action or a blog edit) and confirm the route serves fresh content within one revalidate window without manual cache purge.
5. **Soak:** five minutes of repeated requests across the route set with zero 5xx.

### 5.6 Production rollout

1. Deploy with `enableCacheInterception: true` using `scripts/deploy/deploy.sh` (which runs the existing gates, including the Stripe guard and HTML cache gate).
2. Live checks immediately post-deploy: `/`, `/api/health`, `/blog/fixing-pixelated-photos`, one locale route, one pSEO route — repeated, not single-shot.
3. Five-minute production soak across the same route classes; zero 5xx.
4. Monitor the Hermes job `e49a8c5f4029` (`MIU Availability Auto-Repair`) for the following hour.
5. Confirm in Workers analytics that worker error rate stays at baseline (< 0.3%) for 24h.

## 6. Rollback plan

- Config-only rollback: set `enableCacheInterception: false` in `open-next.config.ts`, redeploy. This is the proven recovery path from the incident (recovery commit `dd78b04c` did exactly this).
- The DO binding and migration can remain deployed during rollback — unused bindings are inert; no data migration is involved. DO namespace deletion is optional cleanup, not required.
- The regression test asserting the paired invariant must be updated in the same commit as any rollback so the test suite always matches deployed reality.

## 7. Acceptance criteria

- [ ] `open-next.config.ts` configures the durable queue; no `enableCacheInterception` without it (enforced by unit tests, all green under `yarn test` and `yarn verify`).
- [ ] Both wrangler configs carry the `NEXT_CACHE_DO_QUEUE` binding and the SQLite DO migration.
- [ ] Preview: cold misses return 2xx; stale hits return `STALE` then `HIT`; zero exceptions in preview logs; five-minute soak clean.
- [ ] Production: five-minute soak clean; worker error rate at baseline for 24h post-deploy.
- [ ] Rollback path (`enableCacheInterception: false`) documented here and verified by the fact it was exercised successfully during the incident.
- [ ] SEO changes backlog entry appended.

## 8. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| DO queue blocking callers when > max concurrent revalidations | Low (default cap 5; long-lived regional cache dedupes sends) | Defaults acceptable at current traffic (~9k req/day); raise `NEXT_CACHE_DO_QUEUE_MAX_REVALIDATION` if preview shows queueing |
| Regional Cache API out of sync with R2 (no cache purge configured) — stale content served up to 30 min | Medium (existing behavior, unchanged by this PRD) | Accepted; documented in Section 9 as follow-up |
| Interception serves a cached error response (the unproven 500 mechanism from the incident) | Unknown — the exact 500 mechanism was not captured | Preview gate #2 exercises the exact incident scenario; production soak gates the flip; rollback is config-only |
| First-ever DO deployment requires migration ordering | Low | Migration ships in the same deploy as the binding; preview deploy validates the wrangler config end-to-end before production |
| Re-enabling interception regresses the performance gate | Low | The deploy script's performance gate runs on every deploy; a gate failure with healthy availability is treated as gate-noise per incident learnings, not as upload failure |

## 9. Follow-ups (out of scope)

1. **Cache purge (`cachePurge`):** with long-lived regional caching and no purge, the Cache API can be out of sync with R2 for up to 30 minutes. The adapter supports `cachePurge` (DO `BucketCachePurge` or API-based). Consider in a separate PRD.
2. **Sharded tag cache (`DOShardedTagCache`):** the worker entry already exports it; needed for precise tag-based invalidation at scale. Separate evaluation.
3. **Workers observability scope:** the deploy API token and wrangler OAuth both lack Workers observability read, which blocked capturing the exact outage exception. Grant the minimum read scope to an ops credential so future incidents correlate 500s with exact Worker exceptions (the bug report's own guardrail).
4. Correct `BUG-REPORT-OPENNEXT-REVALIDATION-QUEUE-OUTAGE.md` to reflect the verified trigger (stale hit, not cold miss) and the unproven exception quote, referencing this PRD.
