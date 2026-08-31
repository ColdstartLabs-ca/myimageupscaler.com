# PRD: Move Image Uploads Off the Worker

**Status:** Superseded on 2026-08-31
**Date:** 2026-08-18
**Source:** [2026-08-17 GSC decline root cause](../SEO/reports/2026-08-17-gsc-decline-root-cause.md) §7a

> Direct-to-storage input and streamed output handling shipped in commits including
> `e3244166` and `8070ab8d`, but production memory failures continued. Remaining
> attribution, legacy-body removal, and URL-only provider work now live in
> [`production-error-backlog-remediation.md`](production-error-backlog-remediation.md).

## Problem

Images reach `/api/upscale` as base64 inside a JSON body. A Cloudflare Worker gets **128MB of RAM**, and the payload is held at least twice before any of our code runs:

| Allocation                          | 25MB image |
| ----------------------------------- | ---------- |
| `req.json()` raw request text       | 66.6 MB    |
| parsed JSON string                  | 66.6 MB    |
| **Total, before validation starts** | **133 MB** |

Base64 inflates by ~33% (25MB → 33.3M characters) and JS strings are UTF-16 (2 bytes per character). The two copies above are unavoidable with a JSON body.

Measured impact before mitigation: the `myimageupscaler` Worker hit `exceededMemory` **~300 times per day, every day** (Aug 13–17: 339 / 295 / 259 / 317 / 298), and Cloudflare answered each with a non-JSON 503. The client could only classify those as `edge_error`. `processing_jobs` captured ~50/day of the ~300 because the client-side reporter is best-effort with a 2s timeout — roughly **1 in 6**.

### What is already fixed

`0e9c7140` removed five _additional_ full-payload copies (`imageData.split(',')[1]` in the Zod refine, the route's base64 check, `getBase64Size`, `validateMagicBytes`, `decodeImageDimensions`) and added a `Content-Length` guard that rejects oversized bodies before `req.json()` reads them.

That takes a 5MB free-tier upload from ~93MB (often fatal) to ~26MB (safe), which is the large majority of traffic. It cannot help the two unavoidable copies.

### What is still broken

The advertised **25MB paid tier cannot work**, and never could. The effective ceiling is now ~18MB (24MB body cap), above which users get a clean 413 instead of a silent 503. Honest, but still short of what we sell.

## Goal

The Worker never holds image bytes. Maximum upload size becomes a storage limit, not a memory limit, and `exceededMemory` goes to zero.

Success criteria:

- `exceededMemory` in Cloudflare Workers analytics is 0/day sustained.
- A 25MB upload succeeds end to end on the paid tier.
- No regression in `processing_jobs` completion rate or p99 duration.
- Free tier behavior and limits unchanged.

## Why this is smaller than it looks

Every Replicate builder already takes `imageDataUrl` as a **plain string** — `real-esrgan.builder.ts`, `nano-banana-pro`, `nano-banana-2`, `clarity-pro-upscaler`, `qwen-image-edit`, `p-image-edit`. Replicate accepts an `https://` URL wherever it accepts a data URL, so the provider layer needs **no changes at all**: `model-input.types.ts:245` stops building a data URL and passes a signed read URL instead.

Supabase Storage is already in use for gallery images (`server/services/galleryStorage.service.ts`, `galleryCleanup.service.ts`), so there is no new infrastructure to provision.

## Design

**Now:** browser → base64 in JSON → Worker holds up to 133MB → Replicate

**After:** browser → Supabase Storage → Worker passes a URL (~200 bytes) → Replicate fetches directly

### Steps

1. **Signed upload endpoint.** New route issuing a Supabase `createSignedUploadUrl` scoped to the user, into a short-lived `upscale-input` bucket. Enforce the tier size limit here — this is where size becomes authoritative.
2. **Client uploads first.** `useBatchQueue` / `api-client.ts` PUT the file to the signed URL, then POST `{ storagePath, mimeType, config }` to `/api/upscale`. Request body drops from ~33MB to a few hundred bytes.
3. **Ranged validation in the Worker.** Fetch `Range: bytes=0-32768` from storage. This is already everything the validators need — `validateMagicBytes` reads 16 base64 characters, `decodeImageDimensions` reads 44,000. Size comes from storage object metadata, so `validateImageSizeForTier` no longer needs the payload.
4. **Sign a read URL and pass it through.** `buildModelInputContext` sets `imageDataUrl` to the signed URL. All builders work unchanged.
5. **Expire temp objects.** Extend the existing `galleryCleanup.service.ts` cron pattern to purge `upscale-input` after processing or a short TTL.

### Rollout

This changes the API contract, so it needs a flag and a staged cutover, not a hard switch:

- Accept **both** shapes at `/api/upscale` (`imageData` or `storagePath`) for one release.
- Flag the client onto the storage path; watch `exceededMemory`, completion rate, and p99 duration.
- Remove the base64 branch and the `MAX_REQUEST_BYTES` guard once the old shape sees no traffic.

## Risks

| Risk                                                    | Mitigation                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Upload becomes a second failure point before processing | Retry the PUT client-side; surface a distinct error so it is not misread as a processing failure          |
| Signed URL expiry mid-processing                        | TTL well beyond p99 job duration (~53s measured for 12MP); sign at dispatch, not at upload                |
| Replicate cannot reach the signed URL                   | Verify against each model in staging before flagging traffic over; keep the base64 branch until confirmed |
| Orphaned objects if a job never dispatches              | TTL-based cleanup, not dispatch-based                                                                     |
| Storage egress cost                                     | Replicate fetches once per job; compare against current Worker CPU/duration cost before rollout           |

## Estimate

**About a day.** Most of it is the client upload path and progress UI. The API side is small: step 4 is a one-line swap, and step 3 reuses validators that already only read a prefix.

## Out of scope

- Changing tier size limits or pricing.
- Reworking the gallery/output storage path, which is unaffected.
- The `clientDisconnected` count (~225–300/day) visible alongside `exceededMemory` — not investigated, may be ordinary user cancellation.
