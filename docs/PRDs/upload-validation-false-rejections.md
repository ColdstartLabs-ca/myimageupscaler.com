# PRD: Upload Validation False Rejections

**Date:** 2026-07-25
**Status:** Ready
**Complexity:** 3 → LOW mode
**Owner:** Activation / Growth
**Source:** [Growth Diagnostic 2026-07-25](../reports/growth-diagnostic-2026-07-25.md) — priority #3 (impact 6 ÷ effort 2 = 3.0)

---

## 1. Context

**Problem:** Users uploading perfectly valid PNG and JPEG images are told their file type is invalid, at the very first step of the funnel, before they ever see the product work.

Amplitude, 30 days (2026-06-25 → 07-24):

| Error message                                   | Events |
| ----------------------------------------------- | ------ |
| `Invalid file type: image/png`                  | 277    |
| `Invalid file type: image/jpeg`                 | 161    |
| `upload_invalid_format` (errorType, all causes) | 696    |

`image/png` and `image/jpeg` are both on `ALLOWED_TYPES`. The allowlist is not what rejects them — a second, stricter content check runs afterward and hard-fails.

This is the cheapest revenue in the report: these are users who chose a file and pressed upload. Intent is already proven.

### 1.1 Files Analyzed

```
client/utils/file-validation.ts                                  # all three defects live here
client/components/features/image-processing/Dropzone.tsx         # consumes result, renders error, tracks event
shared/validation/upscale.schema.ts                              # IMAGE_VALIDATION.ALLOWED_TYPES
tests/unit/client/utils/file-validation.unit.spec.ts             # existing coverage
tests/unit/client/components/dropzone.unit.spec.tsx              # existing coverage
```

### 1.2 Current Behavior (verified in code)

`shared/validation/upscale.schema.ts:47`

```ts
ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const,
```

Validation runs in two passes. Pass one, `validateImageFile` (`client/utils/file-validation.ts:115-123`):

```ts
if (
  !IMAGE_VALIDATION.ALLOWED_TYPES.includes(
    file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic'
  )
) {
  return { valid: false, reason: 'type' };
}
```

Pass two, `validateImageFileWithDimensions` (`client/utils/file-validation.ts:149-166`):

```ts
const claimedMimeType = normalizeMimeType(file.type);
const detectedMimeType = await detectFileMimeType(file);
if (!detectedMimeType) {
  return { valid: false, reason: 'type', errorMessage: 'Unrecognized image format' };
}

if (claimedMimeType !== detectedMimeType) {
  return {
    valid: false,
    reason: 'type',
    detectedMimeType,
    errorMessage: `MIME type mismatch: claimed ${claimedMimeType}, detected ${detectedMimeType}`,
  };
}
```

Detection reads 12 bytes against a three-entry table (`client/utils/file-validation.ts:25-29`):

```ts
const MAGIC_BYTE_SIGNATURES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
};
```

### 1.3 Root Causes — three distinct defects

**Defect A — mismatch between two _allowed_ types is treated as fatal.** (`file-validation.ts:159`)

This is the one that produces the 438 PNG/JPEG events. A file whose content is JPEG but whose MIME says `image/png` (extremely common — renamed files, screenshots re-saved by editors, Android gallery exports, anything that went through a rename) is a **perfectly upscalable image**. Both the claimed and detected types are on the allowlist. We reject it anyway.

The error tracked is `Invalid file type: ${file.type}` (`Dropzone.tsx:220`), which reports the _claimed_ type — hence "Invalid file type: image/png" for a file that is genuinely a valid image.

**Defect B — `normalizeMimeType` is applied too late to do its job.** (`file-validation.ts:117` vs `:149`)

`normalizeMimeType` (`:31-33`) exists specifically to map `image/jpg` → `image/jpeg`. But pass one compares the **raw** `file.type` against `ALLOWED_TYPES` and returns before normalization ever happens. Any browser or OS reporting `image/jpg` — and any file with an empty `file.type`, which happens on some mobile and drag-and-drop paths — is rejected at line 117 with no error message at all.

**Defect C — HEIC is allowed but undetectable in the same pass, and the ftyp check is too loose.** (`file-validation.ts:60-67`)

```ts
if (header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) {
  return 'image/heic';
}
```

Any ISO base-media file — MP4, MOV, M4A — matches `ftyp` and is reported as `image/heic`. This is a false _accept_ in the opposite direction, and it means a user dragging a video gets it past detection and into a failing upscale rather than a clear "we don't support video" message. Lower urgency than A and B, but it is in the same function and should be fixed in the same pass.

---

## 2. Goals / Non-Goals

**Goals**

- Stop rejecting files whose detected content type is on the allowlist.
- Accept `image/jpg` and empty-MIME files that sniff as a supported format.
- Reject actual non-images with a clear, specific message.
- Keep the security property that motivated sniffing: never trust the claimed type when the content disagrees — trust the _content_.

**Non-Goals**

- Adding new supported formats (AVIF, TIFF, BMP). Separate PRD.
- Raising size or dimension limits.
- Client-side format _conversion_ (e.g. HEIC → JPEG). Separate PRD.

> **Scope correction, made during implementation.** This PRD originally listed "server-side validation changes" as a non-goal, on the assumption that the client was the only gate. **That was wrong.** `shared/validation/upscale.schema.ts:326` contained the identical claimed-vs-detected rejection, and `client/utils/api-client.ts:153,276` send the _claimed_ `file.type` (with a `|| 'image/jpeg'` fallback that actively manufactures mismatches for empty-MIME files). A client-only fix would have changed the error message from "Invalid file type" to a 400 from `/api/upscale` and fixed nothing. The implementation therefore covers client, shared schema, and the upscale route.

---

## 3. Solution

**Principle: the detected content type is the source of truth. The claimed type is a hint.**

Replace the equality check with an allowlist membership check on the _detected_ type, and carry the detected type forward as the file's real type.

```ts
// client/utils/file-validation.ts — replaces the claimed !== detected hard-fail

const detectedMimeType = await detectFileMimeType(file);

// Content is authoritative. If we recognize it and it's supported, accept —
// regardless of what the browser claimed the type was.
if (detectedMimeType && isAllowedType(detectedMimeType)) {
  return { valid: true, detectedMimeType, dimensions };
}

// Recognized, but genuinely unsupported (e.g. video sniffed as ISO-BMFF).
if (detectedMimeType) {
  return {
    valid: false,
    reason: 'type',
    detectedMimeType,
    errorMessage: `Unsupported format: ${detectedMimeType}`,
  };
}

// Unrecognized content. Fall back to the claimed type only if it is allowed,
// and let the dimension load be the real arbiter — a file the browser cannot
// decode will fail there with a clear message.
if (isAllowedType(normalizeMimeType(file.type))) {
  return { valid: true, dimensions };
}

return { valid: false, reason: 'type', errorMessage: 'Unrecognized image format' };
```

Supporting changes:

1. **Normalize before the allowlist check** — `file-validation.ts:117` becomes `isAllowedType(normalizeMimeType(file.type))`. Extract a shared `isAllowedType(mime: string): boolean` helper so pass one and pass two cannot drift.
2. **Allow empty `file.type`** through pass one so that sniffing gets a chance to identify it. An empty type is an absence of information, not evidence of a bad file.
3. **Tighten HEIC detection** — require a known HEIC/HEIF brand at bytes 8-11 (`heic`, `heix`, `hevc`, `mif1`, `heim`, `msf1`), mirroring how the WebP branch already re-checks bytes 8-11. Anything else ISO-BMFF returns `null` (→ "Unrecognized image format") rather than a false `image/heic`.
4. **Report the useful type in analytics** — `Dropzone.tsx:220` should send `detectedMimeType ?? file.type ?? 'unknown'`, so the next diagnostic shows what files actually are, not what they claimed.

### 3.1 Security note

This is not a loosening. The current code trusts the claimed type in pass one and then rejects on disagreement; the proposed code trusts the _content_ and ignores the claim. That is strictly the stronger position. A `.png` containing an executable still fails: it will not sniff to an allowed type, and it will not decode in `loadImageDimensions`.

---

## 4. Implementation

Single phase — this is one file plus a call site.

**Status: implemented 2026-07-25.** `yarn verify` clean; 4,997 unit tests pass.

| Step | Change                                                                                                     | File                                  | Done |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---- |
| 1    | Add `isAllowedType()` + `HEIF_BRANDS`; normalize before the allowlist check                                | `client/utils/file-validation.ts`     | ✅   |
| 2    | Allow empty `file.type` past pass one, resolved by sniffing                                                | `client/utils/file-validation.ts`     | ✅   |
| 3    | Replace mismatch hard-fail with a detected-type allowlist check                                            | `client/utils/file-validation.ts`     | ✅   |
| 4    | Tighten HEIC to require a HEIF brand at bytes 8-11                                                         | `client/utils/file-validation.ts`     | ✅   |
| 5    | **Server:** drop claimed-vs-detected; return the detected type                                             | `shared/validation/upscale.schema.ts` | ✅   |
| 6    | **Server:** same HEIF brand tightening                                                                     | `shared/validation/upscale.schema.ts` | ✅   |
| 7    | **Route:** enforce `ALLOWED_TYPES` against the _detected_ type; pass it downstream via `effectiveMimeType` | `app/api/upscale/route.ts`            | ✅   |

Step 5 of the original plan (track the detected type in `Dropzone.tsx:220` analytics) was **not** implemented — deferred to keep the diff surgical. `upload_invalid_format` still reports the claimed type, so post-deploy verification measures volume, not composition.

### False-accept audit

The relaxation's risk is accepting something it shouldn't. Checked:

- **`validateMagicBytes` has exactly one caller** (`app/api/upscale/route.ts`), and it now enforces the allowlist. No other code path relied on the old rejection.
- **GIF** is in the server's `MAGIC_BYTES` but not in `ALLOWED_TYPES`. Since the claimed type is no longer compared, the allowlist check on the detected type is the _only_ thing keeping it out — pinned by tests on both layers.
- **MP4/MOV/M4A** previously passed as `image/heic` via the brand-less `ftyp` check. Now rejected — a net tightening.
- **Non-images** still rejected; content must resolve to a recognized signature.
- The security property that motivated magic-byte validation is intact: content must sniff to a supported image format before reaching any AI provider.

---

## 5. Testing (green/red — write failing tests first)

Add to `tests/unit/client/utils/file-validation.unit.spec.ts`:

| Case                     | Input                                 | Expected                                            |
| ------------------------ | ------------------------------------- | --------------------------------------------------- |
| Mismatch, both allowed   | JPEG bytes, `type: 'image/png'`       | **valid** (regression test for Defect A)            |
| `image/jpg` alias        | JPEG bytes, `type: 'image/jpg'`       | **valid** (Defect B)                                |
| Empty MIME               | PNG bytes, `type: ''`                 | **valid** (Defect B)                                |
| Real video               | MP4 `ftyp` bytes, `type: 'video/mp4'` | invalid, message names the detected type (Defect C) |
| Genuine HEIC             | `ftyp` + `heic` brand                 | valid                                               |
| Non-image                | random bytes, `type: 'image/png'`     | invalid, "Unrecognized image format"                |
| Oversized still rejected | valid PNG over limit                  | invalid, reason `size` (no regression)              |

Also update `tests/unit/client/components/dropzone.unit.spec.tsx` to assert the analytics payload carries the detected type.

Run: `yarn test:unit`, then `yarn verify`.

---

## 6. Success Metrics

| Metric                                        | Baseline (30d to 2026-07-24) | Target |
| --------------------------------------------- | ---------------------------- | ------ |
| `error_occurred` / `upload_invalid_format`    | 696                          | < 200  |
| `Invalid file type: image/png` + `image/jpeg` | 438                          | ~0     |
| `image_uploaded` unique users                 | 7,796                        | +2-4%  |

Check at 14 days via the Amplitude segmentation pull in the [wtf-should-i-do-next](../../.claude/skills/wtf-should-i-do-next/SKILL.md) skill.

**Counter-metric:** `upscale_failed` (baseline 3,410) must not rise. If accepting more files pushes malformed images into processing, that shows up here.

---

## 7. Risks

| Risk                                                     | Likelihood | Mitigation                                                                                                     |
| -------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| Accepting files the upscaler then fails on               | Medium     | Counter-metric above; `loadImageDimensions` already rejects undecodable files before submit                    |
| HEIC brand list incomplete, rejecting real HEICs         | Low        | Unrecognized → falls through to claimed-type path, which allows `image/heic`; net behavior no worse than today |
| Server-side validation disagrees with the relaxed client | Low        | Server validates independently and is unchanged; worst case is a server-side rejection with its own message    |
