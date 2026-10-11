# PRD-SQR-02 — Move all MIU file storage from Supabase to Cloudflare R2

**Status:** NOT STARTED
**Priority:** P0 — After PRD-SQR-01, the retained gallery (about 3.2 GB) is still about 3× the Free storage limit. GB-hours run out about 3–4 days after the 2026-10-13 refill until AC-7 lands.
**Complexity:** 8 (HIGH); risk override: customer-data migration.
**Owner:** Claude (code and migration script), João (deploy, R2 bucket/domain setup, go for the Supabase delete)
**Depends on:** PRD-SQR-01 (verified full backup, AC-3)

## Context

Storage is used in about 8 source files, 15–18 with config:

| Bucket                 | Write                                                                                                                    | Read / sign                                                                                                                | Delete                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `upscale-inputs`       | Browser `uploadToSignedUrl`: `client/utils/api-client.ts:429-458`. Token from `app/api/upscale/upload/route.ts:114-122`. | `resolveUpscaleInput`: `server/services/upscale-input-storage.service.ts:93-150`. Signed URL sent to Replicate/Gemini.     | `:154` (sync exit), the cron sweeper `galleryCleanup.service.ts:216-228` |
| `saved-images`         | `galleryStorage.service.ts:214` (rollback :244)                                                                          | `listImages` signs at :508. The thumbnail uses a Supabase **transform** at :520-522.                                       | `:427-429`, `galleryCleanup.service.ts:430`                              |
| `blog-images` (public) | `blogImageStorage.service.ts:83`                                                                                         | `getPublicUrl` :96. The full URL is saved in `blog_images.url`, `blog_posts.featured_image_url`, and possibly post bodies. | `:112`                                                                   |

These also reference Supabase hosts: `next.config.js:53-54` (remotePatterns), `client/utils/image-loader.ts:6-14,67` (rewrites to Supabase `render/image`), `shared/config/security.ts:32-33` (CSP connect-src), `app/[locale]/layout.tsx:128` (preconnect), and `app/api/upscale/output/route.ts:34-52` (allow-lists Supabase signed output URLs).

`saved_images.storage_path` and `processing_credit_reservations.input_storage_path` hold **relative paths**. Those rows need no rewrite. `stageGeminiOutput` (`upscale-input-storage.service.ts:185-226`) has no callers.

Existing pieces: `aws4fetch` is already in `package.json:203` but unused. `wrangler.json:15-18` already binds R2 for the OpenNext cache. `gallery.config.ts` already allow-lists `r2.cloudflarestorage.com`.

## Solution

- **Two R2 buckets.** `miu-private` holds the `inputs/` and `saved/` prefixes and has no public access. `miu-public` holds blog images on a custom domain, for example `assets.myimageupscaler.com`.
- **Config (fixed values live in code, not env):** endpoint `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` (`CLOUDFLARE_ACCOUNT_ID` already exists in `serverEnv`), buckets `miu-private` and `miu-public`, public base `https://assets.myimageupscaler.com`, region `auto`. New secrets: `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Add them to the `serverEnv` schema (`shared/config/env.ts`), `.env.api.example`, the deploy allowlist `scripts/deploy/steps/05-secrets.sh` and `tests/unit/deploy/worker-secret-allowlist.unit.spec.ts`. João adds the prod values with `scripts/storage/set-r2-secrets.sh`.
- **Key layout in `miu-private`:** `inputs/<userId>/<jobId>.<ext>`, `saved/<existing storage_path>` (the DB paths stay the same, and the code adds the prefix), and `dev/...` for smoke tests and local runs.
- **One storage module** (`server/services/r2-storage.service.ts`) with `presignPut`, `presignGet`, `put`, `delete` and `head`. It uses `aws4fetch` with S3-compatible R2 keys from `serverEnv`. It replaces the Supabase calls in the 8 files above. The function signatures stay the same so callers do not change.
- **Inputs:** the browser PUTs to a presigned R2 URL, which needs a CORS rule on the bucket and a CSP `connect-src` entry. Replicate receives a presigned GET. An **R2 lifecycle rule deletes `inputs/` after 2 days.** The rule only *schedules* deletion two days after upload; Cloudflare then removes expired objects, typically within 24 hours after expiry but sometimes longer ([official lifecycle docs](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)). Deletion is therefore not a hard deadline, and no application code deletes an input early: two jobs may share one `input_storage_path`, so an early delete can break a pending job. This replaces the hourly sweeper: delete `cleanupStaleUpscaleInputs`, its cron route and its schedule. Also delete the dead `stageGeminiOutput` and its allow-list entry.
- **Immutable inputs (replaces Supabase `upsert: false`):** `presignPut` always signs the `If-None-Match: *` precondition and the exact body `content-length` (`allHeaders: true`, no toggle; `sizeBytes` is required and validated as a positive safe integer). R2 returns 412 when the object already exists, so a replayed grant cannot replace a committed input after validation, and a grant cannot declare a smaller size than it uploads. The upload route passes `parsed.data.sizeBytes`; the browser sends `file.size`, so CORS needs no change. The browser and every test helper send the same headers. A 412 after a lost response means the immutable object is already committed: the client treats it as a completed upload and the server validates the stored metadata and prefix. The bucket CORS must allow `content-type` **and** `if-none-match`; the exact policy is `scripts/storage/r2-cors.json` in the Wrangler CLI shape (not applied by this lane).
- **Content-encoding:** `resolveUpscaleInput` rejects a non-empty `content-encoding` other than `identity` before the size/MIME checks and before the provider URL, so a stored `gzip` cannot make the provider decode more bytes than the HEAD size measured.
- **Signing shared with the smoke:** the pure AWS signing lives in `server/services/r2-presign.mjs` (`presignPutUrl`, `presignGetUrl`; no `serverEnv`). `r2-storage.service.ts` keeps bucket/key validation and credentials, then delegates. `scripts/storage/r2-smoke.mjs` imports the same helper, so a passing smoke proves production signing rather than a copy.
- **Gallery:** the same relative paths under `saved/`, served through presigned GET. **Thumbnails:** use Cloudflare Images transformations. An authenticated route `/api/gallery/thumb/[id]` checks ownership, presigns a GET, and calls `fetch(presignedUrl, { cf: { image: { width: 400, format: 'auto' } } })`, then streams the response. Cloudflare does the resize, so the Worker CPU limit does not apply to it. The images stay private. If transformations are not enabled on the zone, the route returns the full image, and the UI uses `loading="lazy"`.
- **Blog:** public URLs on the R2 custom domain. A migration rewrites the Supabase URLs in `blog_images.url`, `featured_image_url` and post bodies. Then update `next.config.js` remotePatterns and `image-loader.ts`.
- **Cutover with no data loss (copy → flip → delta copy → verify → delete):**
  1. Copy every object from the verified PRD-SQR-01 backup to R2. Read each object back and compare its sha256 with the manifest.
  2. Deploy the R2 code. New writes now go to R2.
  3. Delta copy: objects that Supabase created after the backup listing are copied and verified the same way.
  4. `verify-integrity --store r2`: every `saved_images` row and every blog URL must resolve on R2 with the same hash. Required result: `missing: 0`.
  5. Delete from Supabase, from a frozen manifest only, in batches of 50 or fewer. Every deleted object must have a matching R2 hash.

  Between steps 2 and 3, a few minutes of new saves can show as broken thumbnails. No data is lost, because the Supabase object is not deleted until step 5.

## Acceptance Criteria

- [ ] AC-1 [local]: Against the real `miu-private` bucket, `scripts/storage/r2-smoke.mjs` takes a presigned PUT from the upload route code, uploads with `Origin: https://myimageupscaler.com` (CORS) and the signed `If-None-Match: *` + `content-length` headers, then a second PUT with **different bytes of the same length** returns **412** and the read-back sha256 still matches the first body. A wrong content-type and a wrong declared length each return **403**, so the signature provably binds those headers. Every PUT 200/412 returns `Access-Control-Allow-Origin`; a ranged GET returns **206** with the requested bytes. An OPTIONS preflight is allowed for each configured origin (apex, `www`, `localhost:3000`) with PUT, `content-type` and `if-none-match`; the script presigns a GET as the provider would, fetches it, compares the sha256, and deletes only its own `dev/` key in a `finally` block. All keys are under `dev/`. The smoke signs through the production helper `server/services/r2-presign.mjs`, so a pass proves the real signing path. Unit specs prove the upload route and `resolveUpscaleInput` call the R2 module, that the wrappers delegate to the shared helper, that omitting or changing the conditional header **or** the declared length changes the PUT signature, and that a non-identity `content-encoding` is rejected before the provider URL. proof: `node scripts/storage/r2-smoke.mjs` plus `yarn test` on the touched specs. Evidence: pending.
- [ ] AC-8 [shared]: After deploy, one real upscale on production succeeds, and its input object appears under `inputs/` in `miu-private`. proof: a prod smoke run plus an R2 object listing. Evidence: pending.
- [ ] AC-2 [local]: Saving to the gallery writes `saved/<path>` to R2. Listing returns working image URLs, and `/api/gallery/thumb/[id]` returns a resized image (`content-length` smaller than the original) and 403 for another user. Deleting removes the object before the row. proof: a gallery API integration test. Evidence: pending.
- [ ] AC-3 [local]: Uploading a blog image returns a URL on the R2 custom domain, and `next/image` renders it. proof: a blog image upload test. Evidence: pending.
- [ ] AC-4 [local]: `grep -rn "storage.from(" app server client` returns 0 matches. The input sweeper route and schedule are removed, and `scripts/check-cron-setup.mjs` passes. proof: grep plus `node scripts/check-cron-setup.mjs`. Evidence: pending.
- [ ] AC-5 [local]: The R2 copy matches the backup manifest. Every object's read-back sha256 matches, and the count equals saved-images + blog-images + the delta. proof: `backup-and-purge.mjs migrate-r2` output. Evidence: pending.
- [ ] AC-6 [local]: `verify-integrity --store r2` reports `missing: 0, hash_mismatch: 0` for all `saved_images` rows and all blog URLs. proof: script output. Evidence: pending.
- [ ] AC-7 [local]: After the Supabase delete, the total of the three Supabase buckets is less than 50 MB. The R2 lifecycle rule on `inputs/` is active. proof: the audit inventory query plus `wrangler r2 bucket lifecycle list miu-private`. Evidence: pending.

## Blocked on

- The deploy (step 2) and the Supabase delete (step 5) are João's go.

## Integration Ledger

| Capability     | Reachable consumer/trigger                                        | Replaces / disposition                                    | Evidence   |
| -------------- | ----------------------------------------------------------------- | --------------------------------------------------------- | ---------- |
| Input upload   | `/api/upscale/upload` → `api-client.ts` presigned PUT             | Replaces `uploadToSignedUrl`                              | AC-1       |
| Provider input | `/api/upscale` → `resolveUpscaleInput` → presigned GET            | Replaces the Supabase signed URL                          | AC-1       |
| Gallery        | `/api/gallery`, `/api/gallery/[id]` → `galleryStorage.service.ts` | Replaces the Supabase bucket                              | AC-2, AC-6 |
| Blog images    | `/api/blog/images/upload` → `blogImageStorage.service.ts`         | Replaces `getPublicUrl`. The DB URLs are rewritten.       | AC-3, AC-6 |
| Input expiry   | R2 lifecycle rule                                                 | **Deletes** the `:20` sweeper, its route and its schedule | AC-4, AC-7 |

## Decisions

- 2026-10-10 (João): Stay on Free. Move storage to R2.
- 2026-10-10 (João): Thumbnails use Cloudflare Images transformations through `fetch` with `cf.image` (free tier: 5k unique transformations per month). The fallback is the full image with lazy loading.
- 2026-10-10 (Claude, via dashboard): Created `miu-private` and `miu-public` (Standard class, automatic location). Set CORS on `miu-private` for PUT/GET/HEAD from `https://myimageupscaler.com`, `https://www.myimageupscaler.com` and `http://localhost:3000`, with header `content-type` and exposed `ETag`. Added lifecycle rule `expire-inputs-2d` (prefix `inputs/`, delete after 2 days). Both were checked through the read API. Image Transformations was already enabled for the zone.
- 2026-10-10 (João + Claude): Custom domain `assets.myimageupscaler.com` added to `miu-public` (min TLS 1.0, enabled). It returns R2's 404 for missing keys. The R2 Account API token (Object Read & Write, `miu-private` and `miu-public` only) is stored as `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` in `myimageupscaler-api-prod` version 33, and version 32 stays enabled. Smoke test: PUT/GET/DELETE under `dev/` returned 200/200/204 on both buckets, and `myimageupscaler-inc-cache` returned 403, so the token scope is correct.
- 2026-10-10 (João): Back up and verify before any migration. Nothing is deleted from Supabase until its R2 hash matches (README safety contract).
- 2026-10-10 (Claude): R2 input PUTs restore the Supabase `upsert: false` guarantee with a signed `If-None-Match: *` precondition. The existing `miu-private` CORS rule allows only `content-type`, so it must also allow `if-none-match`; the exact policy is prepared at `scripts/storage/r2-cors.json` and is not applied in this lane. The CORS update and the real duplicate-PUT smoke are deployment-blocking; production is untouched.
- 2026-10-10 (Claude): Hardened the bounded input path after an adversarial review. `sizeBytes` is required in `presignPut`/`presignPutUrl` and signed as `content-length` (positive safe integer); `resolveUpscaleInput` rejects a non-identity `content-encoding` before validation; `01-preflight.sh` requires `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`; the smoke now checks ACAO on PUT 200/412, a 206 ranged GET, wrong-type/wrong-length 403, and the three configured origins. The `shared/config/security.ts` comment now says PUT. The runtime R2 behavior stays unproven until the real smoke runs.
- 2026-10-10 (Claude): The signing options were extracted to `server/services/r2-presign.mjs` so the smoke and the service cannot drift. The CORS file is now the Wrangler CLI shape (`rules[].allowed.{origins,methods,headers}`, `exposeHeaders`, `maxAgeSeconds`), not the AWS shape. Apply it to `miu-private` with `wrangler r2 bucket cors set miu-private --file scripts/storage/r2-cors.json` (pending João's go).

## Execution Phases

#### Phase 1: R2 module and inputs on R2

**Status:** CODE COMPLETE — PENDING CORS UPDATE, R2 SMOKE AND DEPLOY
**Deployment-blocking:** before the deploy, (1) apply the CORS policy to `miu-private` (the file is prepared but **not applied** and is in the Wrangler CLI shape):

```
wrangler r2 bucket cors set miu-private --file scripts/storage/r2-cors.json
```

and (2) run the real duplicate-PUT smoke `node scripts/storage/r2-smoke.mjs` and confirm the second different PUT returns 412, the read-back hash is unchanged, and the OPTIONS preflight allows `content-type` + `if-none-match`. Production is unchanged by this lane: no bucket, CORS, lifecycle, secret or deploy mutation happens here.
**Owner checkout:** `.worktrees/supabase-quota-r2/`
**Base SHA:** `ba604949735ac07a269c64a8888af1d84696daf1`
**Files:** `server/services/r2-storage.service.ts` (new), `server/services/r2-presign.mjs` (new, shared signing helper), `scripts/storage/r2-smoke.mjs` (new), `scripts/storage/r2-cors.json` (Wrangler CLI shape), `shared/config/env.ts`, `.env.api.example`, `scripts/deploy/steps/05-secrets.sh`, `scripts/deploy/steps/01-preflight.sh`, the allowlist and R2-preflight specs, `upscale-input-storage.service.ts`, `app/api/upscale/upload/route.ts`, `client/utils/api-client.ts`, `shared/config/security.ts`, the cron route, schedule and sweeper removal, and the Playwright input helpers `tests/helpers/upscale-input.ts`, `tests/helpers/account-creation-e2e.ts` and `tests/helpers/async-upscale-runtime.ts` (now PUT to the presigned R2 `uploadUrl`; the runtime fixture mocks the R2 S3 endpoint instead of Supabase storage). `wrangler.json` needs no change: the S3 API uses secrets, not bucket bindings.
**Verification:** AC-1 and AC-4.
**Production-pending tests (not run in this lane):**
- AC-1 `node scripts/storage/r2-smoke.mjs` — needs the R2 token and the applied CORS `if-none-match` header; the code is staged and the smoke script is written (including the duplicate-PUT 412 and preflight checks) but never run against a real object. All keys are under `dev/`. The unit specs run locally and prove the conditional-header signature binding and the browser 412 retry path.
- AC-8 production upscale + R2 `inputs/` listing — needs the deploy (João's go).
- AC-4 `grep -rn "storage.from(" app server client` still matches `galleryStorage.service.ts`, `blogImageStorage.service.ts` and the saved-images delete in `galleryCleanup.service.ts`; that is Phase 2 work, not Phase 1. The input sweeper, its route and its schedule are removed and `node scripts/check-cron-setup.mjs` passes.
- Playwright input helpers now target the R2 presigned PUT; `yarn tsc` is clean. The real browser/API upload flow is unrun without an R2 token, and the async runtime gate needs a full OpenNext build (`tests/helpers/async-upscale-runtime.ts --run`), which this lane did not execute.

**Integration overlap (SQR-03):** this lane also removed the `20 * * * *` input-sweeper cron from `workers/cron/index.ts` and `workers/cron/wrangler.toml`. SQR-03 edits the same two files for database retention. The `25 * * * *` retention branch and schedule are untouched here; rebase SQR-03 over this change and keep both edits.

#### Phase 2: Gallery and blog on R2

**Status:** LOCAL CODE COMPLETE — production migration and browser proof pending
**Files:** `galleryStorage.service.ts`, `app/api/gallery/thumb/[id]/route.ts` (new), `galleryCleanup.service.ts`, `blogImageStorage.service.ts`, `next.config.js`, `client/utils/image-loader.ts`, `app/[locale]/layout.tsx`, a migration that rewrites the blog URLs
**Verification:** AC-2 and AC-3. Blog URL changes are SEO-visible, so add a test in `tests/unit/seo/` and an entry in the backlog.

#### Phase 3: Data migration (copy → flip → delta → verify → delete)

**Status:** OPERATOR COPY/VERIFY/APPLY IMPLEMENTED — not executed. Phase 3 remains incomplete: no real R2 migration receipt or verified cutover exists, and source deletion remains disabled.
**Files:** `scripts/storage/migrate-r2.mjs` (new library + read-only CLI) and `tests/unit/scripts/r2-migration.unit.spec.ts` (new). Current-reference verification is implemented in `scripts/storage/verify-r2-references.mjs`; exact native-row CAS updates are in `scripts/storage/r2-reference-apply.mjs`.
**Prepared tooling (not run against production):**
- `runMigrationCopy` is an injectable, hermetic library. It reuses the SQR-01 frozen manifest and receipt (`loadBackupIdentity`), the per-batch local proof (`verifyFrozenArtifacts`) and the mandatory remote laptop proof (`verifyRemoteBatch`) with the local expected checksum lines, all BEFORE any PUT, in batches of 50 or fewer.
- The frozen plan records the whole raw manifest sha256 and the fixed mapping: `saved-images` → `miu-private/saved/<path>`, `blog-images` → `miu-public/<path>` (no invented blog prefix), `upscale-inputs` → `miu-private/inputs/<path>`. MIME comes from manifest metadata when present, else a strict extension table; unknown extensions fail and there is no octet-stream fallback.
- Every PUT signs `If-None-Match: *` + content-length + content-type through the exact production helper `server/services/r2-presign.mjs` and streams the local file with Node fetch `duplex: 'half'`. A 412 is accepted only when a streaming read-back matches the manifest bytes and sha256; a mismatch stops the run and never overwrites. The receipt is published only after every read-back passes and the count and byte total are exact.
- CLI: `plan --manifest <backup-run-dir>` is read-only and needs no GCloud credentials. `copy --manifest <run> --confirm` is wired to immutable R2 writes. Reference `verify` and `apply --confirm` are wired; apply requires a new verified database backup on both machines. None has been executed against production. Source deletes remain disabled.
- Evidence (local, 2026-10-10): `node --check scripts/storage/migrate-r2.mjs` passes; `tests/unit/scripts/r2-migration.unit.spec.ts` passes 20/20 (altered local bytes, missing local proof, failed remote proof, symlink, 412 match, 412 mismatch, read-back mismatch, foreign checkpoint, resume re-hash, exact mapping/MIME, partial-failure stop, exact signed headers, CLI refusals).
- Context: the SQR-01 full storage backup completed and both machines verified 6,553 objects (7,919,497,410 bytes); the source currently answers HTTP 200, so the older PRD 402 assumption is stale. Inputs keep the 2-day R2 lifecycle rule; the local verified backup is retained for 30 days.
**Verification:** AC-5, AC-6, then AC-7 after João's go.

- Cutover safety correction (2026-10-11): add an explicit `saved_images.storage_backend` with legacy/default `supabase`; new R2 writes explicitly set `r2`. Old requests can finish after any final inventory or deployment. Gallery and authenticated thumbnail reads therefore retain the original Supabase source until the operator verifies that individual R2 object in full and atomically marks its unchanged saved-image row migrated. No assumption of an upload pause or perfectly timed delta copy is allowed. No source purge before all current references have verified destination bytes. Migration/deploy remain operator gated.

- Integrated verification (2026-10-11): 699 affected tests passed across 57 files, including PostgreSQL migrations, copy/apply guards, public assets GET proof, gallery reads/recovery, and retention copy. `yarn verify` passed in 58.06 seconds. No R2 smoke, CORS/lifecycle mutation, copy, reference rewrite, or deploy has run.
- Source-purge safety remains an explicit incomplete gate: fresh metadata checks alone cannot fence a concurrent Storage overwrite between check and DELETE. Require a verified write fence or atomic conditional deletion before enabling any Supabase source purge; preserve all sources meanwhile. The one pre-existing missing blog object remains a failed reference, never a whitelist.
