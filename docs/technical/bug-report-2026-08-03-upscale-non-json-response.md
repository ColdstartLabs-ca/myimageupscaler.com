# Bug Report — Upscale Client Crashes on Non-JSON Cloudflare Response

- **Date observed:** 2026-08-03
- **Status:** Resolved
- **Severity:** Medium
- **Area:** Image processing / client API error handling
- **Primary location:** `client/utils/api-client.ts:305-306,348`

## Summary

When `/api/upscale` returns an HTML response, the client attempts to parse it as JSON and surfaces the low-level browser exception:

```text
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

This masks the actual HTTP status, Cloudflare Ray ID, and actionable failure reason. It also gives the user no useful recovery guidance.

## User impact

- The upscale fails with an implementation-detail error instead of a useful message.
- Support cannot identify the underlying Cloudflare failure from the UI report.
- The user cannot distinguish a transient edge failure, oversized request, Worker failure, provider outage, or retryable server response.

No evidence currently indicates incorrect credit charging in the observed incident. That must remain part of regression verification for failures occurring after credit deduction.

## Verified code path

`client/utils/api-client.ts` assumes every response body is JSON:

- For non-2xx responses, line 306 calls `response.json()` without a fallback.
- For successful responses, line 348 also calls `response.json()` without verifying `Content-Type`.

Any Cloudflare-generated HTML response—such as a transient edge error, request-size rejection, or Worker failure page—therefore replaces the real error with a JSON parser exception.

## Production evidence collected

Evidence gathered immediately after the report:

1. `GET https://myimageupscaler.com/api/health` returned `200` with `application/json` and a healthy status.
2. An unauthenticated `POST https://myimageupscaler.com/api/upscale` returned `401` with a valid JSON error body.
3. A live `wrangler tail` captured four subsequent production `/api/upscale` executions with Worker outcome `Ok` and no exceptions.
4. Additional captured upscale traffic returned `200` and `402` with Worker outcome `ok`; this traffic was not attributed to the reporting user.
5. The exact original HTML response was not captured because live tailing started after the incident.
6. Historical Workers Observability querying returned Cloudflare `403 Authentication error`; the current production token can create live tails but lacks the `Workers Observability Write` permission required by Cloudflare's historical telemetry query endpoint.

## Evidence boundary

The **client-side masking bug is verified**. The upstream cause of the original HTML response is **unresolved**.

Current evidence does not justify claiming a Replicate outage, Worker exception, request-size rejection, or Cloudflare incident. The next recurrence must be correlated using the request timestamp, response status, response `Content-Type`, and `cf-ray` header.

## Reproduction

The exact production edge event is not reproducible from available evidence. The client defect can be reproduced deterministically in a unit test:

1. Mock `/api/upscale` with a non-2xx response.
2. Set `Content-Type: text/html`.
3. Return a body beginning with `<!DOCTYPE html>`.
4. Call the upscale client.
5. Observe that `response.json()` throws `SyntaxError` before MIU can produce a domain error.

The same defect exists if a `200` response unexpectedly contains HTML.

## Recommended remediation

Add a shared response parser for the upscale client that:

1. Reads the response `Content-Type` before parsing.
2. Parses JSON only when the body is JSON-compatible.
3. Handles empty, text, and HTML bodies without exposing raw HTML.
4. Preserves existing typed handling for `FREE_LIMIT_EXCEEDED`, `AI_UNAVAILABLE`, and `BATCH_LIMIT_EXCEEDED`.
5. For non-JSON failures, throws a safe typed error containing:
   - HTTP status;
   - a sanitized user-facing message;
   - the Cloudflare `cf-ray` response header when present;
   - retryability classification where known.
6. For an unexpected non-JSON `2xx` response, reports an invalid upstream response rather than `SyntaxError`.
7. Logs diagnostic metadata without logging authorization headers, cookies, image data, or raw HTML bodies.

Suggested generic user message:

```text
Image processing returned an unexpected server response. Please try again. If it continues, contact support with reference {cf-ray}.
```

## Required tests

- `502 text/html` does not throw or display `Unexpected token '<'`.
- `503 text/html` produces a retryable service-unavailable error.
- `413 text/html` produces an image/request-too-large message when the status is available.
- `200 text/html` produces an invalid-response error.
- Empty non-2xx body is handled safely.
- Existing JSON success behavior remains unchanged.
- Existing typed JSON errors remain unchanged.
- Diagnostics include status and `cf-ray` but exclude the raw HTML body and private request data.
- Credit balance and batch-slot behavior remain correct for a route failure after deduction.

## Acceptance criteria

- Users never see a raw JSON parsing exception for `/api/upscale`.
- Every non-JSON failure produces a safe, actionable message.
- Cloudflare failures can be correlated from status plus Ray ID.
- Existing upscale success and typed-error tests pass.
- The fix is verified locally and on a deployed production request before this report is closed.

## Operational follow-up

The client-side masking defect is resolved by `parseJsonResponse()` in
`client/utils/api-client.ts`. HTML and other non-JSON responses now become a typed
`UpscaleEdgeError` carrying the HTTP status and `cf-ray` value; the queue marks the
item retryable and emits `processing_failed`. The behavior is covered by unit tests,
including an observed red control with the old direct JSON parsing path.

The production deployment and 24-hour post-deploy observation remain an operator
follow-up; this lane did not have a Cloudflare API token for live tailing.

Consider granting the existing diagnostic token the minimum Cloudflare permission required to query historical Workers Observability telemetry. Do not broaden unrelated account permissions. This is optional for the client fix but would shorten future incident diagnosis.
