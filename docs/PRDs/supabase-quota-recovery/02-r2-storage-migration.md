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
- **Inputs:** the browser PUTs to a presigned R2 URL, which needs a CORS rule on the bucket and a CSP `connect-src` entry. Replicate receives a presigned GET. An **R2 lifecycle rule deletes `inputs/` after 2 days.** This replaces the hourly sweeper: delete `cleanupStaleUpscaleInputs`, its cron route and its schedule. Also delete the dead `stageGeminiOutput` and its allow-list entry.
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

- [ ] AC-1 [local]: Against the real `miu-private` bucket, `scripts/storage/r2-smoke.mjs` takes a presigned PUT from the upload route code, uploads with `Origin: https://myimageupscaler.com` (CORS), presigns a GET as the provider would, fetches it, compares the sha256, and deletes it. All keys are under `dev/`. Unit specs prove the upload route and `resolveUpscaleInput` call the R2 module. proof: `node scripts/storage/r2-smoke.mjs` plus `yarn test` on the touched specs. Evidence: pending.
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

## Execution Phases

#### Phase 1: R2 module and inputs on R2

**Status:** NOT STARTED
**Files:** `server/services/r2-storage.service.ts` (new), `scripts/storage/r2-smoke.mjs` (new), `shared/config/env.ts`, `.env.api.example`, `scripts/deploy/steps/05-secrets.sh`, the allowlist spec, `upscale-input-storage.service.ts`, `app/api/upscale/upload/route.ts`, `client/utils/api-client.ts`, `shared/config/security.ts`, `wrangler.json`, the cron route, schedule and sweeper removal
**Verification:** AC-1 and AC-4. AC-1 needs the R2 token, so write the code first and run the smoke test once the token exists.

#### Phase 2: Gallery and blog on R2

**Status:** NOT STARTED
**Files:** `galleryStorage.service.ts`, `app/api/gallery/thumb/[id]/route.ts` (new), `galleryCleanup.service.ts`, `blogImageStorage.service.ts`, `next.config.js`, `client/utils/image-loader.ts`, `app/[locale]/layout.tsx`, a migration that rewrites the blog URLs
**Verification:** AC-2 and AC-3. Blog URL changes are SEO-visible, so add a test in `tests/unit/seo/` and an entry in the backlog.

#### Phase 3: Data migration (copy → flip → delta → verify → delete)

**Status:** NOT STARTED
**Files:** add `migrate-r2` and `verify-integrity --store r2` to `scripts/storage/backup-and-purge.mjs`
**Verification:** AC-5, AC-6, then AC-7 after João's go.
