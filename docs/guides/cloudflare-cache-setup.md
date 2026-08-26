# Cloudflare HTML cache setup

## R2 incremental cache

1. The private Standard-class `myimageupscaler-inc-cache` bucket was created on 2026-08-25.

   ```bash
   yarn wrangler r2 bucket create myimageupscaler-inc-cache
   ```

2. Deploy the isolated preview Worker using `wrangler.preview.json`. Confirm the
   `NEXT_INC_CACHE_R2_BUCKET` binding is present in its deployment settings.

   Verified 2026-08-25: the Webpack build uploads at 7.89 MiB compressed and preview version
   `9a7dbf83-3b06-4ae0-ba17-2fa9d80e5d03` deployed without a production route.

3. Request `/formats/upscale-gif-images` three times. Requests two and three must return
   `x-nextjs-cache: HIT` and complete in under 400 ms before production deployment.

## Cache HTML rule

Create a Cache Rule named `Cache anonymous HTML` with these constraints:

- Include `GET` and `HEAD` requests whose paths do not start with `/api/` or `/dashboard`.
- Exclude locale-prefixed dashboard paths matching `^/[a-z]{2}/dashboard(?:/|$)`.
- Bypass when a Supabase authentication cookie is present.
- Set cache eligibility to eligible and Edge TTL to respect origin headers.

The rule was activated on 2026-08-25 with this expression:

```text
(http.request.method in {"GET" "HEAD"} and not starts_with(http.request.uri.path, "/api/") and not starts_with(http.request.uri.path, "/dashboard") and not starts_with(http.request.uri.path, "/en/dashboard") and not starts_with(http.request.uri.path, "/es/dashboard") and not starts_with(http.request.uri.path, "/pt/dashboard") and not starts_with(http.request.uri.path, "/fr/dashboard") and not starts_with(http.request.uri.path, "/de/dashboard") and not starts_with(http.request.uri.path, "/it/dashboard") and not starts_with(http.request.uri.path, "/ja/dashboard") and not starts_with(http.request.uri.path, "/workspace") and not starts_with(http.request.uri.path, "/en/workspace") and not starts_with(http.request.uri.path, "/es/workspace") and not starts_with(http.request.uri.path, "/pt/workspace") and not starts_with(http.request.uri.path, "/fr/workspace") and not starts_with(http.request.uri.path, "/de/workspace") and not starts_with(http.request.uri.path, "/it/workspace") and not starts_with(http.request.uri.path, "/ja/workspace") and not http.cookie contains "sb-")
```

After deployment, make two cookie-free requests to `/`,
`/blog/fixing-pixelated-photos`, `/formats/upscale-gif-images`, and
`/tools/ai-image-upscaler`. The second response must have no `Set-Cookie`, shared
`Cache-Control` (`s-maxage`), and time to first byte below 400 ms. Cloudflare may omit
`cf-cache-status` when the Worker returns HTML directly; in that case the response must report
`x-opennext-cache: HIT` or `x-nextjs-cache: HIT`. If Cloudflare does emit `cf-cache-status`, it
must be `HIT`. An authenticated `/dashboard` response must remain bypassed and must never be
shared between users.

The post-deploy gate accepts either Cloudflare's CDN cache hit or OpenNext's incremental-cache
hit. This reflects the Worker execution order: cache interception can serve prerendered HTML from
R2 before the Next server bundle runs, while a direct Worker response does not always receive a
Cloudflare `cf-cache-status` header.
