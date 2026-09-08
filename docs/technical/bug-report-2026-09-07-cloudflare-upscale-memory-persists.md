# Bug report: `/api/upscale` still exceeds Cloudflare Worker memory after prior buffering fixes

**Date:** 2026-09-07  
**Severity:** P0  
**Status:** Confirmed production incident; allocation site not yet proven  
**Tracking:** GitHub issue #127  
**Scope:** Investigation and recommended architecture; no fix is claimed here

## Executive verdict

Cloudflare is still terminating production `/api/upscale` invocations with Tail outcome `exceededMemory` and client-visible HTTP 503s after multiple memory-focused changes landed.

The earlier changes were reasonable and their narrow unit tests pass, but they did not remove the production failure. The remaining design still keeps a large Next.js/OpenNext Worker request alive while `replicate.run()` waits synchronously for an image prediction. Cloudflare's 128 MB limit is per isolate, not per invocation, and an isolate can serve multiple concurrent requests. That makes the synchronous orchestration model the leading architectural risk even when each request contains only a URL and the returned output is not intentionally downloaded.

**Recommendation:** stop applying another local buffering patch to this route. Replace the synchronous `replicate.run()` request lifecycle with asynchronous prediction creation plus webhook/queue completion, return `202 Accepted` with the durable job ID, and let the client poll the existing job/output state. First add stage-level observability and a deployment-to-git marker so the canary can prove exactly where memory termination disappears.

This recommendation is stronger than the root-cause claim: the hard memory termination is confirmed, but the exact allocation responsible is not yet measured.

## Customer-visible behavior

1. The dashboard starts an upscale and reserves credits.
2. Cloudflare terminates the Worker invocation with `exceededMemory`.
3. The browser receives a generic/non-JSON HTTP 503 and records `edge_error`.
4. The Tail Worker eventually refunds the reservation.
5. The user sees a failed attempt and may retry, producing a burst of failures despite eventual refunds.

## Production evidence

Window queried: `2026-09-07 00:00:00 UTC` through `2026-09-07 16:10:56 UTC`.

- **92** `processing_jobs` rows ended as client-observed `edge_error` across **21 users**.
- All **92/92** failed rows had no `model_id` recorded, locating the termination before the normal successful processor result was persisted. This does **not** prove that Replicate never accepted the prediction.
- **96** reservations were automatically refunded with `tail_observed_exceededMemory` across the same **21 users**, totaling **225 credits**. The count is four higher than the `processing_jobs` count because reservation and client-observation timestamps cross the selected window differently; do not equate the two tables row-for-row without job IDs.
- Failures occurred across many Cloudflare colos, led by ATL (54), YUL (8), FRA (5), EWR (4), HKG (4), and others. This is not isolated to one region.
- The largest affected cohort had **54 failures and 48 completed jobs** during the same two-hour interval, all primarily Quick 2x. The same user and configuration both succeeded and failed, so this is not a simple deterministic “unsupported model/settings” error.
- Memory-refunded reservations terminated after roughly **31 seconds median**. Completed reservations had roughly **28 seconds median**. Failures cluster near the normal provider completion window rather than at request parsing.
- Approximate reservation overlap was similar for failed and completed rows in the sampled window. Fleet-level request concurrency may still matter because Cloudflare memory is isolate-scoped, but the database alone does not prove it.

## Confirmed facts, inferences, and unknowns

### Confirmed

- Cloudflare Tail outcome is `exceededMemory`; this is not an inferred HTTP timeout.
- Cloudflare documents a **128 MB per-isolate** limit, including JavaScript heap and WebAssembly allocations. One isolate may handle multiple concurrent requests.
- Production automatic refunds are working for the observed hard Worker failures.
- The current repository path rejects inline image uploads, uses a private-storage reference, fetches only a bounded validation prefix, and configures the Replicate SDK with `useFileOutput: false`.
- The focused memory/refund regression suite passes: 4 files, 32 tests.

### Strong inference

The failure is now more likely to be caused by the lifecycle/heap profile of a long-lived OpenNext Worker invocation than by the already-removed explicit input/output image buffering. The route still owns the whole provider wait and several service/database objects until completion or failure.

### Not proven

- The exact object/allocation that pushes the isolate over 128 MB.
- Whether the dominant source is concurrent long-lived requests, the OpenNext/Next.js runtime baseline, Replicate SDK response parsing/log payloads, retained request context, or another imported/runtime allocation.
- Which Git SHA produced the currently active Cloudflare Worker. `wrangler deployments list` shows recent “Secret Change” versions with no git tag/message, so repository history cannot by itself prove the active code artifact.
- Whether a prediction was created at Replicate for every Worker-killed request; provider prediction IDs are not durably written before the synchronous wait.

## Ranked hypotheses to falsify

1. **The active production artifact is not running the intended `useFileOutput: false` behavior, or the Replicate SDK still converts a file output before returning.** Existing tests verify constructor options and mocked parsing, not the real SDK inside a deployed Worker. Log the deployed SHA, prediction ID, `typeof`/constructor of output, and whether the output is a string URL before any staging logic.
2. **The long-lived synchronous `replicate.run()` lifecycle pushes an already-heavy OpenNext isolate over its shared limit.** This is the architectural hypothesis. Test concurrent 30-second mocked predictions under a Worker-compatible profiler; do not infer it from fleet reservation counts alone.
3. **Quick paid fallback increases the failing payload/runtime class.** Oversized Quick 2x requests may route to `clarity-upscaler` or `real-esrgan-large`. Persist the resolved provider/model _before_ invocation so killed requests can be segmented; the current 92 failed rows have no `model_id`.
4. **Gemini output staging still materializes both base64 and a decoded Buffer.** This is a real memory amplifier in the Gemini branch, but it cannot explain a mostly-Quick incident unless routing/environment evidence shows those requests reached Gemini.
5. **Output delivery is a separate secondary risk.** `/api/upscale/output` streams without a maximum output-byte cap. It matters operationally, but the Tail refund consumer is explicitly scoped to `POST /api/upscale`, so it should not be named as the cause of this incident without separate Tail evidence.

## Current data flow and memory boundaries

### Input

- `app/api/upscale/route.ts:667-672` calls `resolveUpscaleInput()` with a private storage path.
- `server/services/upscale-input-storage.service.ts:130-148` creates a signed URL, requests a bounded prefix using `Range`, and base64-encodes only that validation prefix.
- The provider receives the signed storage URL rather than the full uploaded image body.

### Provider execution

- `app/api/upscale/route.ts:1171-1177` starts `processor.processImage()` inside the browser request lifecycle.
- `server/services/replicate.service.ts:107-110` sets `useFileOutput: false`, preventing Replicate `FileOutput` objects from eagerly fetching generated files.
- `server/services/replicate.service.ts:316-321` still calls `replicate.run()` and waits for the prediction result.
- Replicate documents async prediction creation as the default and recommends it for longer-running work; sync mode holds the request open.

### Output and accounting

- The application stages or references provider output only after the synchronous processor call returns.
- A Cloudflare Tail Worker observes hard invocation outcomes and performs idempotent reservation refunds.
- This limits financial harm but does not make the failed upscale usable and does not prevent retry storms.

## Git history: what has already been tried

| Date                     | Commit / issue                                                      | Attempt                                                                                                                 | Result / limitation                                                                                                              |
| ------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-11 to 2026-03-21 | Issue `#17`, PR `#38`                                               | Prevented **Replicate GPU OOM** by enforcing per-model pixel limits/resizing.                                           | Adjacent but different failure domain. Provider GPU memory errors must not be conflated with Cloudflare Worker heap termination. |
| 2026-08-03               | `docs/technical/bug-report-2026-08-03-upscale-non-json-response.md` | First detailed Worker report: non-JSON 503s and suspected image buffering under edge-memory pressure.                   | Correctly identified an edge-memory class but could not identify the exact active allocation.                                    |
| 2026-08-06 to 2026-08-10 | `8c30fd3c`, `6e673fe5`                                              | Added client/tier ceilings and recovered completion/error telemetry; backlog was marked closed locally.                 | The document explicitly said post-deploy verification was pending. Later observations proved closure was premature.              |
| 2026-08-17               | `70022404`, `f5f0eac5`, `42ed3282`                                  | Reduced credit burn for oversized/provider-GPU failures and improved retry/503 semantics.                               | Provider failure and accounting work; it did not address Worker heap ownership.                                                  |
| 2026-08-18               | `0e9c7140`                                                          | Reduced repeated validation/base64 work and bounded the decoded prefix used for image validation.                       | Narrow heap reduction; production failures persisted.                                                                            |
| 2026-08-24               | `15676497`                                                          | Lowered paid-tier/body caps because large base64 JSON uploads could still exceed the Worker heap.                       | Explicit stopgap; it rejected more dangerous requests but did not remove the architecture that buffered request bodies.          |
| 2026-08-26               | `e3244166` / `bb4b8dcb0` implementation line                        | Added private temporary upload/storage handling and moved provider input to a signed URL with bounded validation reads. | Removed the original full-input request body as the main pressure source; did not eliminate the incident.                        |
| 2026-08-28               | `8070ab8d`                                                          | Configured Replicate SDK `useFileOutput: false` to prevent eager output fetches.                                        | Unit-tested behavior is present in `origin/master`; production still emits `exceededMemory`.                                     |
| 2026-08-28               | `b18e817c` and follow-ups                                           | Bound reservations to Cloudflare ray IDs and added Tail-observed automatic refunds.                                     | Correct containment: credits recover. It treats the consequence, not the Worker OOM.                                             |
| 2026-08-31               | `b9a5653b` and backlog docs                                         | Executed the broad bugfix batch and made storage-only metadata requests the accepted path.                              | The production soak gate was not actually closed; later backlog observations and this incident falsify “resolved.”               |
| 2026-09-01               | `6d943297`                                                          | Restored direct-upload API regression coverage.                                                                         | Test-only confidence improvement; production recurrence continued.                                                               |
| 2026-09-02 to 2026-09-03 | `c1415687`, `c4fdaafc`                                              | Recorded fresh `exceededMemory` production observations after the earlier fixes.                                        | Strong evidence that the prior request/output reductions were insufficient.                                                      |
| 2026-09-07               | GitHub issue `#127`                                                 | Opened the current P0 with customer/fleet evidence and refund acceptance criteria.                                      | Active tracking issue; this report adds the missing historical and architectural analysis.                                       |

There is also an unmerged historical commit, `ec49995f`, describing a stricter storage-only Worker contract. Do not cite that hash as deployed. Equivalent storage-only behavior exists on `origin/master` via later history, but active Cloudflare version-to-git traceability remains missing.

## Why another small buffer patch is weak

1. **What is weak:** prior fixes each removed a plausible copy or byte path, but no change measured isolate heap at stage boundaries or proved the active deployment artifact.
2. **Unproven assumption:** “large image bytes must still be buffered somewhere” is no longer supported by the current input/output code alone.
3. **Ignored risk:** Cloudflare memory is isolate-wide; long-lived synchronous predictions preserve request state and may overlap even if each request looks small.
4. **Better alternative:** shorten the Worker request to validation/reservation/prediction creation and finish asynchronously.

## Recommended remediation

### P0 architecture change

Replace synchronous upscale orchestration with this durable state machine:

1. `POST /api/upscale`
   - authenticate and validate storage metadata;
   - reserve credits idempotently;
   - create a Replicate prediction asynchronously;
   - persist `provider_prediction_id` and status `processing` before returning;
   - return `202 { jobId, status: "processing" }` within a few seconds.
2. Replicate completion webhook (or a queue consumer)
   - authenticate and deduplicate the event;
   - read the terminal prediction by ID;
   - stage/reference the output without proxying image bytes through the main Worker;
   - atomically complete or refund the reservation.
3. Client
   - poll the durable job endpoint or subscribe to updates;
   - fetch the gated output only after status is `completed`;
   - on `edge_error`, refresh balance and apply bounded backoff rather than immediate retries.

### Required investigation before calling the fix complete

- Add low-cardinality stage markers: request accepted, storage validation complete, reservation complete, prediction ID persisted, provider completion received, output staged, response returned.
- Persist the provider prediction ID immediately after async creation so Replicate/app reconciliation is possible after Worker death.
- Add an immutable deployed git SHA/build ID to `/api/health`, Worker version metadata, or both.
- Profile the current route under Miniflare/Chrome DevTools with concurrent 30-second mocked predictions; capture heap snapshots rather than inferring from object sizes.
- Canary Quick 2x first and compare `tail_observed_exceededMemory` per 100 reservations against a fixed pre-deploy window.

### Short-term containment

- Keep automatic idempotent refunds enabled.
- After one edge-memory failure, show a specific retry-safe message and impose client backoff/circuit breaking.
- Rate-limit repeated retries per account. One account generated 54 of the 92 observed failures; this will reduce incident amplification but is not the root fix.

## Acceptance criteria

- [ ] Active Cloudflare Worker version maps to an exact git SHA.
- [ ] `/api/upscale` returns a durable `jobId` and `202` without waiting for model completion.
- [ ] Provider prediction ID is persisted before the initiating request ends.
- [ ] Completion/refund transitions are idempotent and mutually exclusive.
- [ ] No image body is buffered by the initiating request or output-delivery path.
- [ ] Production canary records zero `tail_observed_exceededMemory` for at least 24 hours and at least 500 representative reservations.
- [ ] Quick 2x and Quick 4x completion rates return to the agreed healthy baseline.
- [ ] Browser displays durable processing state, refreshes refunded balances, and prevents blind retry storms.
- [ ] Reconciliation detects provider completions whose initiating request died before acknowledgement.

## Verification performed for this report

```text
yarn vitest run \
  tests/unit/bugfixes/upscale-request-memory.unit.spec.ts \
  tests/unit/api/upscale-body-size-guard.unit.spec.ts \
  tests/unit/server/guest-processor-memory.unit.spec.ts \
  tests/unit/api/upscale-tail-refund.unit.spec.ts
```

Result: **4 test files / 32 tests passed** in the primary run. An independent focused audit also passed **3 files / 98 tests** covering the body guard, output route, and Replicate service; the runs overlap, so their test totals must not be added. These tests prove the narrow guards, streaming contract, constructor configuration, and refund behavior. They do not exercise the real Replicate SDK in a deployed Cloudflare isolate or simulate aggregate isolate heap under concurrent provider waits.

## External references

- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Error 1102 guidance: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1102/
- Replicate prediction modes: https://replicate.com/docs/topics/predictions/create-a-prediction
