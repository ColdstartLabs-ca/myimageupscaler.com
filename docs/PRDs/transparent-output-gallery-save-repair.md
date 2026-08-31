# PRD: Transparent Output Preview and Gallery Save Repair

**Status:** Ready for TDD  
**Date:** 2026-08-31  
**Severity:** High  
**Source:** [BUG-REPORT-TRANSPARENT-OUTPUT-GALLERY-SAVE.md](../../BUG-REPORT-TRANSPARENT-OUTPUT-GALLERY-SAVE.md)

## 1. Executive summary

Two application regressions affected the same two paid upscale attempts on August 29 and 30, 2026:

1. The preview treated every API-delivered `blob:` URL as proof of image transparency. Since the August 26 output-delivery change now exposes normal opaque upscales through `blob:` URLs, the comparison view incorrectly rendered a checkerboard behind those results.
2. Gallery save first attempted a full-size browser WebP conversion. When that conversion failed, the fallback submitted the same `blob:` URL to a JSON API contract that accepts only `http://` or `https://` URLs. That mismatch deterministically returned the generic `Invalid request data` response.

This PRD fixes the confirmed application contracts: transparency becomes explicit per-result metadata, and browser blobs remain file uploads throughout the gallery-save path. It does not claim that the provider returned corrupt pixels. The historical provider artifacts have expired, so their alpha channels can no longer be inspected. A residual-evidence gate prevents closing the incident if a recovered original artifact proves there is also a provider-output defect.

## 2. Problem and evidence

### 2.1 User impact

An authenticated paying user completed two 4× Quick upscales that appeared partially transparent or checkerboarded in the comparison UI. Both attempts consumed one credit. The user then tried Save to Gallery twice per result; each save began, none completed, and the UI reported `Invalid request data`.

The product presented a completed paid operation while making the result look unusable and preventing the user from saving it. Customer credit remediation is already complete and is not part of this implementation.

### 2.2 Correlated production evidence

| Evidence          | Attempt A                                   | Attempt B                                   |
| ----------------- | ------------------------------------------- | ------------------------------------------- |
| Processing time   | 2026-08-29 19:06 UTC                        | 2026-08-30 16:39 UTC                        |
| Input             | JPEG, 1376×768                              | JPEG, 1376×768                              |
| Processing        | Quick / Real-ESRGAN, 4×                     | Quick / Real-ESRGAN, 4×                     |
| Reported output   | PNG, 5504×3072                              | PNG, 5504×3072                              |
| Server state      | Processing and credit reservation completed | Processing and credit reservation completed |
| Gallery telemetry | 2 save initiations; 0 saves                 | 2 save initiations; 0 saves                 |

The gallery filenames had no path separators, and the known model and processing-mode fields were valid. The output URLs were short-lived `replicate.delivery` URLs and now return 404, so the original output bytes cannot be used to determine whether they contained alpha pixels.

### 2.3 Confirmed root cause A: incorrect preview transparency

The August 26 capability-based delivery change made `/api/upscale/output` stream provider bytes to the browser. `client/utils/api-client.ts` now creates an object URL with `URL.createObjectURL(blob)` for ordinary server-backed upscales.

`client/components/features/image-processing/ImageComparison.tsx` still contains an older background-removal heuristic:

```ts
const showTransparency = hasTransparency ?? afterUrl.startsWith('blob:');
```

That heuristic is now false: a `blob:` URL describes how bytes are held in the browser, not whether their pixels have an alpha channel. `PreviewArea` does not supply `hasTransparency`, so every API-backed upscale takes the incorrect checkerboard path. The existing image-comparison unit test encodes this obsolete behavior and must be inverted.

The output route streams image bytes without browser-side compositing. For the affected 16:9 result, `object-contain` over the checkerboard container can expose a large checkerboard letterbox, matching the reported partial/checkerboard appearance without proving pixel corruption.

### 2.4 Confirmed root cause B: incompatible gallery fallback

`client/hooks/useGallery.ts` attempts to fetch the result, decode a full-size bitmap, draw it to a canvas, and encode WebP before upload. For the affected output, that means a 5504×3072 decoded image and canvas. The exact browser exception is not observable in current telemetry.

The failure path is nevertheless deterministic:

1. Any conversion error enters the JSON fallback.
2. The fallback sends `imageUrl: "blob:..."`.
3. `shared/validation/gallery.schema.ts` accepts only `http://` or `https://` image URLs.
4. `app/api/gallery/route.ts` returns HTTP 400 with the generic `Invalid request data` message.

The fix must therefore be correct regardless of why conversion failed: a browser object URL must never be sent through the remote-URL JSON contract.

### 2.5 Known, inferred, and unknown

| Classification | Finding                                                                          | Product decision                                                                |
| -------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Confirmed      | Blob URL scheme is being mistaken for transparency.                              | Remove URL-based inference and carry explicit result metadata.                  |
| Confirmed      | Blob conversion fallback violates the HTTP(S)-only JSON schema.                  | Keep blob sources on the multipart upload path, including fallback.             |
| Confirmed      | Current API error text hides the invalid field and stage.                        | Return a safe actionable message and record a normalized failure stage.         |
| Inferred       | Full-resolution decode/canvas pressure caused the observed conversion failures.  | Do not depend on this inference; make all conversion failures safe.             |
| Unknown        | Whether expired provider artifacts contained unintended alpha or partial pixels. | Do not change models/providers; apply the residual-evidence gate in Section 12. |

This incident is separate from the later OpenNext revalidation-queue outage and must not be coupled to that remediation.

## 3. Objectives and success criteria

### Objectives

- Render normal opaque upscales without checkerboard styling, regardless of whether their URL scheme is `blob:`, `https:`, or another supported delivery mechanism.
- Preserve intentional transparency for background-removal results using explicit per-result metadata.
- Save browser-delivered upscale results to Gallery without converting a `blob:` URL into a JSON remote-URL request.
- Replace generic validation feedback with a safe, actionable failure reason and stage.
- Prove the incident-shaped 5504×3072 flow and negative controls with automated tests before release.

### Measurable success criteria

| Metric or gate                  | Required result                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Opaque preview regression test  | No checkerboard for an opaque result supplied through a `blob:` URL.                                       |
| Transparent preview control     | Checkerboard remains present when explicit `hasTransparency` is true.                                      |
| Gallery blob fallback test      | A conversion failure still produces multipart upload; JSON is never called with `blob:`.                   |
| Incident-shaped end-to-end test | 1376×768 opaque input → 5504×3072 result → visible opaque preview → successful gallery save.               |
| Post-deploy observation         | No unexplained `gallery_save_initiated` without success or normalized failure for the monitored test flow. |

## 4. Target audience and user stories

### Primary user

An authenticated user spending credits to upscale an opaque image and optionally save the delivered result to Gallery.

### User stories

- As an upscaler user, I see the pixels returned by processing without a false transparency treatment caused by the delivery URL format.
- As a background-removal user, I still see a checkerboard when the result is intentionally transparent.
- As a gallery user, I can save a browser blob even if optional WebP optimization fails.
- As a user whose save cannot proceed, I see whether the issue is file size, file type, metadata, upload, or storage rather than `Invalid request data`.
- As support or engineering, I can distinguish gallery failure stages without collecting image URLs, filenames, blobs, or customer PII.

## 5. User flows

### 5.1 Process and preview

```text
/api/upscale/output
        │ streams bytes
        ▼
browser Blob + object URL + explicit result metadata
        │
        ▼
batch item stores the result's transparency semantic
        │
        ▼
ImageComparison renders checkerboard only when explicitly true
```

Changing the currently selected model after processing must not change an existing result's transparency treatment. The semantic belongs to the completed batch item, not to the current control state.

### 5.2 Save to Gallery

```text
browser Blob/File ──► optional bounded optimization ──► multipart upload
       │                         │ conversion failure
       └─────────────────────────┘
                                      │
                                      ▼
                         validated gallery metadata
                                      │
                                      ▼
                              gallery storage + success
```

An HTTP(S) source may retain the existing remote-URL JSON flow. A `blob:` source may not use it. Gallery save and retry are post-processing actions and must never consume another processing credit.

### 5.3 Failure feedback

The client identifies the failing stage as `conversion`, `payload_validation`, `upload`, or `storage`. User-facing messages state the next useful action without leaking implementation details. Examples include “The image exceeds the 10 MB Gallery limit” and “The image file could not be uploaded; try Save again.”

## 6. Functional requirements

`TASK-1` is reserved for prerequisite verification in the implementation task plan. Feature work starts at `TASK-2`.

### TASK-2 — Reproduce and preserve incident evidence

**Requirement:** Add a deterministic local fixture or generated test blob representing an opaque 1376×768 input and 5504×3072 output. Record in the tests that historical provider bytes expired and are not evidence of pixel corruption.

**Acceptance criteria:**

- A red test demonstrates the current false checkerboard behavior for an opaque `blob:` result.
- A red test demonstrates that gallery conversion failure currently attempts an invalid JSON `blob:` URL.
- The reproduction does not require production credentials, customer images, or a live Replicate call.
- If the original customer output becomes available, compare its decoded alpha/pixel coverage separately before closing the residual gate.

### TASK-3 — Make transparency explicit per result

**Requirement:** Replace delivery-URL inference with explicit semantic metadata stored on the completed result/batch item. Ordinary upscale results default to opaque; operations known to produce alpha, such as background removal, set transparency explicitly.

**Acceptance criteria:**

- `ImageComparison` never uses URL scheme to infer transparency.
- Missing transparency metadata uses the safe product default of `false` for upscale results.
- The completed item's value drives preview rendering even after model/control selection changes.
- Processed object URLs are revoked when replaced, removed, or unmounted, after active download/save consumers finish.

### TASK-4 — Preserve blobs through Gallery upload

**Requirement:** Represent a processed result with enough source information to distinguish browser blobs/files from remote HTTP(S) URLs. Save a blob source through multipart upload. Optional optimization may precede upload, but conversion failure must fall back to uploading the original blob/file rather than JSON URL submission.

**Acceptance criteria:**

- No branch sends a `blob:`, `data:`, or other local-only URL to the JSON gallery API.
- A successful optimization uploads the optimized file through multipart.
- A failed optimization uploads the original source blob when it satisfies the existing MIME and 10 MB limits.
- If a non-optimizable source exceeds 10 MB, the user gets a size-specific error and no malformed API request is attempted.
- Save, failure, and retry do not reserve or consume processing credits.

Implementation should reuse or retain the output `Blob` when practical instead of repeatedly fetching its object URL. Bounded client-side resizing/encoding is allowed only when needed to satisfy the existing Gallery contract; this PRD does not authorize changing the 10 MB limit.

### TASK-5 — Validate multipart metadata and return actionable errors

**Requirement:** Apply a shared schema to multipart metadata using explicit coercion for numeric fields. Keep remote URL validation limited to HTTP(S). Normalize safe error responses across JSON and multipart branches.

**Acceptance criteria:**

- Multipart validates filename, positive dimensions, processing mode, model label, file presence, MIME, and size before storage.
- Invalid fields produce a stable error code, failure stage, and safe top-level message; structured field details may remain available to the client.
- A local-only URL in the JSON route produces an image-source/protocol error rather than generic `Invalid request data`.
- Authentication, ownership, gallery-capacity, MIME, size, and SSRF protections remain enforced.

The response contract should support this shape without exposing the submitted URL or filename:

```json
{
  "error": "Image source must be an HTTP(S) URL or a file upload",
  "code": "GALLERY_INVALID_IMAGE_SOURCE",
  "stage": "payload_validation"
}
```

### TASK-6 — Add privacy-safe failure telemetry

**Requirement:** Add a terminal gallery-save failure event, or extend the existing typed event contract, with normalized stage and reason fields.

**Acceptance criteria:**

- Every save initiation reaches exactly one observed terminal outcome: saved or failed.
- Failure stage is one of `conversion`, `payload_validation`, `upload`, or `storage`.
- Reason values are bounded codes, not raw exception messages.
- Events exclude filenames, object/remote URLs, provider prediction identifiers, image bytes, credentials, and customer PII.
- The repository's analytics schema validation passes.

### TASK-7 — Add regression coverage

**Requirement:** Implement the test matrix in Section 10 using red/green TDD. Delete or invert the obsolete test that equates `blob:` with transparency.

**Acceptance criteria:** All affected unit and integration tests pass, followed by `yarn verify`.

### TASK-8 — Verify the release in production

**Requirement:** Run one controlled, authenticated production test with an opaque incident-shaped image and one intentional-transparency control. Do not ask the affected customer to retest.

**Acceptance criteria:**

- The opaque 4× result displays without false checkerboard styling and saves to Gallery.
- The transparency control retains checkerboard styling and alpha after save.
- The test account is charged only for the processing operation, never for gallery save or retry.
- Telemetry shows a terminal outcome for each initiated save, with no sensitive fields.
- Observe the relevant save outcomes for 24 hours before marking the incident closed.

## 7. Technical design

### 7.1 Result contract

Extend the client result and batch-item contract with explicit result semantics. The implementation may retain a `Blob`, `File`, or equivalent source descriptor, but it must express these facts independently:

| Field concept       | Purpose                                             | Lifetime                       |
| ------------------- | --------------------------------------------------- | ------------------------------ |
| Display URL         | Browser rendering and download                      | Revoke with item lifecycle     |
| Uploadable source   | Multipart Gallery save without URL reinterpretation | Browser session/item lifecycle |
| `hasTransparency`   | Controls comparison background                      | Completed item lifecycle       |
| Dimensions and MIME | Validation and metadata                             | Completed item lifecycle       |

No database migration is expected. The `saved_images` schema and existing storage layout remain unchanged.

### 7.2 Preview boundary

`ImageComparison` is a presentational consumer. It must receive the transparency decision from the processing/result layer and must not inspect URL strings to reconstruct domain meaning.

For this scope, normal upscale results are explicitly opaque. Background-removal results are explicitly transparent. The implementation must not add full-image alpha scanning to Cloudflare Workers; the 10 ms CPU constraint makes server-side pixel analysis unsuitable.

### 7.3 Gallery boundary

The client chooses the API representation from source kind:

| Source kind                              | API representation    | Allowed fallback                  |
| ---------------------------------------- | --------------------- | --------------------------------- |
| Browser `Blob` or `File`                 | `multipart/form-data` | Original source blob/file         |
| Object URL backed by an available blob   | `multipart/form-data` | Fetch object URL, then multipart  |
| Remote HTTP(S) URL                       | JSON remote URL       | Existing allowlisted server fetch |
| Local-only URL without retrievable bytes | None                  | Actionable client error           |

The server must continue enforcing the current 10 MB image limit and allowed MIME types. No image decoding or transformation is added to the Worker route.

### 7.4 Error contract

| Code                            | Stage                | User-facing intent                                  |
| ------------------------------- | -------------------- | --------------------------------------------------- |
| `GALLERY_INVALID_IMAGE_SOURCE`  | `payload_validation` | Use a valid upload or HTTP(S) source.               |
| `GALLERY_FILE_TOO_LARGE`        | `payload_validation` | Explain the 10 MB limit.                            |
| `GALLERY_UNSUPPORTED_FILE_TYPE` | `payload_validation` | Identify supported image types.                     |
| `GALLERY_UPLOAD_FAILED`         | `upload`             | Retry the save without reprocessing.                |
| `GALLERY_STORAGE_FAILED`        | `storage`            | Retry later; preserve the processed result locally. |

Existing authentication and gallery-capacity responses may retain their current specialized codes. Exact copy remains localized through the existing UI message system.

## 8. Prerequisites and access

### TASK-1 — Prerequisite verification

Before implementation, verify and record:

- The current 10 MB Gallery limit and allowed MIME list remain the intended product contract.
- Existing local test tooling can construct `Blob`, `FormData`, canvas/image decode mocks, and object URLs.
- A test account has one available processing credit and Gallery capacity for production verification.
- The original customer artifact is still unavailable or, if recovered, has been inspected for unintended alpha independently of UI rendering.
- The August 26 delivery behavior still creates browser object URLs for API-backed results.

No new environment variables, service accounts, database changes, or `.env.local` placeholders are required. Production evidence collection has already been completed read-only. Implementation and automated tests must use local fixtures/mocks and must not require production credentials.

## 9. Security, privacy, and performance

- Preserve current authentication, ownership, rate limiting, gallery capacity, MIME/size enforcement, and HTTP(S) SSRF allowlisting.
- Never serialize object URLs, raw URLs, filenames, image bytes, access tokens, or provider identifiers into analytics or logs.
- Keep image decode, resizing, and encoding in the browser; do not add CPU-heavy image work to Cloudflare Workers.
- Revoke processed object URLs at safe lifecycle boundaries to prevent memory growth during batch processing.
- Reject malformed multipart metadata before storage and return only safe normalized validation details.

## 10. Test plan

### Unit and component tests

| Area                 | Required red/green cases                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ImageComparison`    | Opaque `blob:` has no checkerboard; explicit transparency does; URL scheme has no effect.                                       |
| Preview/result state | Per-item transparency survives later control/model changes; processed URLs are revoked safely.                                  |
| `useGallery`         | Optimized multipart success; conversion failure uploads original blob; `blob:` never reaches JSON; >10 MB fallback is specific. |
| Gallery API route    | Valid multipart persists; invalid metadata/file produces stable code, stage, and actionable message.                            |
| Analytics contract   | Initiation terminates in saved/failed; allowed stages/reasons pass schema; sensitive fields are absent.                         |

### Integration and manual controls

| Scenario                                         | Expected result                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| Opaque 1376×768 → 4× 5504×3072 blob              | No false checkerboard; Gallery save succeeds.                     |
| Intentional transparent PNG/background removal   | Checkerboard visible; saved image retains alpha.                  |
| Forced optimizer/decode failure                  | Original acceptable blob uploads via multipart; no JSON fallback. |
| Oversized original plus forced optimizer failure | No upload attempt; 10 MB message and failed telemetry.            |
| HTTP(S) source conversion failure                | Existing validated remote-URL JSON fallback still works.          |

Verification commands:

```bash
yarn test:unit --run <affected-test-files>
yarn analytics:schema:validate
yarn verify
```

The implementer must replace `<affected-test-files>` with the concrete new and modified test paths. A docs-only PRD check does not substitute for these implementation gates.

## 11. Release acceptance criteria

The release is accepted only when all statements are true:

- Ordinary upscale results do not show checkerboard solely because their display URL begins with `blob:`.
- Intentional transparency is driven by explicit completed-result metadata and remains visually identifiable.
- Both the optimized and conversion-fallback blob paths save to Gallery using multipart upload.
- User-visible validation identifies the failed condition or stage; `Invalid request data` is no longer the only message for this flow.
- Tests, analytics schema validation, `yarn verify`, the controlled production check, and 24-hour observation all pass.

## 12. Residual-evidence gate

This PRD repairs the causes proven by code, history, production records, and telemetry. It must not be used to declare the provider's historical pixels valid.

If the original affected output or a deterministic provider reproduction becomes available:

1. Decode the raw artifact outside the comparison UI and inspect dimensions, alpha coverage, and pixel coverage.
2. Compare the same bytes on a solid background and the product checkerboard background.
3. If unintended alpha or missing pixel regions exist in the raw file, stop incident closure.
4. Open a separate provider-output investigation with artifact evidence, model version, prediction metadata, and credit/refund requirements.

Without such evidence, changing providers, scanning every output, or adding automatic refunds for visually misclassified but successfully delivered files is outside this PRD.

## 13. Rollout and monitoring

1. Ship behind the normal deployment path after all automated gates pass; no data migration or feature flag is required.
2. Use an internal authenticated account for the two production controls in `TASK-8` and remove its saved test images afterward through normal UI controls.
3. For 24 hours, compare gallery save initiations with terminal saved/failed events and inspect only normalized stages/reasons.
4. If blob-related validation failures recur, halt closure and preserve the local source characteristics without logging its contents or URL.
5. Mark the source bug report resolved only after the residual gate is documented and production checks pass.

## 14. Risks and mitigations

| Risk                                                                | Mitigation                                                                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A retained full-resolution blob increases browser memory use.       | Keep one source per item, avoid duplicate refetch/re-encode buffers, and revoke URLs on lifecycle cleanup.           |
| Original PNG exceeds Gallery's 10 MB limit after optimizer failure. | Use bounded browser optimization when possible; otherwise return the size-specific error without malformed fallback. |
| Background-removal transparency regresses.                          | Explicit positive control in unit, integration, and production verification.                                         |
| New error detail leaks user data.                                   | Emit fixed codes/stages and safe copy only; forbid raw exception and source fields.                                  |
| A real provider artifact defect is hidden by the UI fix.            | Keep the residual-evidence gate open and split provider remediation if raw-byte evidence appears.                    |

## 15. Assumptions, dependencies, and non-goals

### Assumptions and dependencies

- Supported browsers provide `Blob`, `FormData`, `fetch`, and object URL APIs already used by the application.
- Gallery continues accepting current supported image MIME types up to 10 MB.
- Background removal is the currently known operation that intentionally produces transparent results.
- The normal deployment pipeline can expose typed analytics changes without a database migration.
- Customer remediation remains complete and independent of software release.

### Non-goals

- Changing Replicate, Real-ESRGAN, model parameters, pricing, or credit cost.
- Repairing the separate OpenNext revalidation-queue outage.
- Redesigning Gallery storage, raising its size limit, or adding server-side image transformation.
- Claiming or detecting provider pixel corruption without raw artifact evidence.
- Retroactively changing credit transactions or building a general artifact-quality/refund engine.

## 16. Expected implementation touch points

| Area                           | Likely files                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Result semantics and lifecycle | `shared/types/coreflow.types.ts`, `client/utils/api-client.ts`, `client/hooks/useBatchQueue.ts` |
| Preview rendering              | `client/components/features/image-processing/ImageComparison.tsx`, its preview caller           |
| Gallery client upload          | `client/hooks/useGallery.ts` and save caller types                                              |
| Gallery request validation     | `shared/validation/gallery.schema.ts`, `app/api/gallery/route.ts`                               |
| Verification                   | Affected client, API, analytics, and integration test files under `tests/`                      |

These are implementation entry points, not permission for adjacent refactors. The implementation must remain surgical and may choose a smaller set after `TASK-1` verifies the live code.

## 17. Delivery estimate

| Work                                                |         Estimate |
| --------------------------------------------------- | ---------------: |
| Reproduction tests and explicit result semantics    | 2 engineer-hours |
| Blob-preserving Gallery path and API validation     | 3 engineer-hours |
| Telemetry and remaining regression coverage         | 2 engineer-hours |
| Local verification and controlled production checks | 2 engineer-hours |
| Post-deploy observation                             | 24 elapsed hours |

Expected implementation effort is 9 engineer-hours plus the 24-hour observation window. If recovered raw artifacts prove a provider defect, that work requires a separate estimate and must not be silently absorbed into this scope.

## 18. Definition of done

- `TASK-1` through `TASK-8` are complete with linked test evidence.
- No app path infers transparency from a URL scheme or submits a browser URL as a remote URL.
- The affected-shape opaque flow and intentional-transparency control both pass locally and in production.
- User-facing and telemetry failure contracts are actionable, bounded, and privacy-safe.
- The source bug report records the 24-hour result and whether the residual provider-artifact gate remains evidence-unavailable or was separately escalated.
