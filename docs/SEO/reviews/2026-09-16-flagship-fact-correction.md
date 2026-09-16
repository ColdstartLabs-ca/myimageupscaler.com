# Flagship fact correction — review package (AC-1)

**PRD:** [PRD-traffic-recovery-2026-09](../../PRDs/traffic-recovery-2026-09.md) · **Status:** prepared locally, NOT published
**Page:** `/blog/best-free-ai-image-upscaler-2026-tested-compared`
**Served source:** production DB record (blog API). The slug is not in `content/blog-data.json`.
**Prepared:** 2026-09-16 · **Approver:** João

## Files

- Corrected body: [`2026-09-16-flagship-corrected-content.md`](./2026-09-16-flagship-corrected-content.md)
- Diff vs live: [`2026-09-16-flagship-correction.diff`](./2026-09-16-flagship-correction.diff)

Baseline was fetched from `GET /api/blog/posts/best-free-ai-image-upscaler-2026-tested-compared` on 2026-09-16 (read-only; no write performed).

## What changes

| #   | Vendor        | Published claim (contradicted)                                                                | Corrected to (vendor-stated 2026-09-16)                         | Source                                                               |
| --- | ------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Let's Enhance | "5 credits/month", "limited at 5 images per month", table "5/month", watermark "None"         | "10 credits on signup, one time"; free-tier exports watermarked | [letsenhance.io/pricing](https://letsenhance.io/pricing)             |
| 2   | Bigjpg        | "Up to 10 images/day", "16x (free: 2x only)", "2x only", table "10/day (2x only)" / "2x free" | "20 pictures/month"; free up to 4x, 16x on paid                 | [bigjpg.com](https://bigjpg.com/)                                    |
| 3   | Pixelcut      | "Limited free tier with watermarks", "the free tier applies watermarks — a dealbreaker"       | "3 free downloads/day, watermark-free"                          | [pixelcut.ai/image-upscaler](https://www.pixelcut.ai/image-upscaler) |
| 4   | Img.Upscaler  | "5 images/day"                                                                                | "50 credits/month"                                              | [imgupscaler.com/pricing](https://imgupscaler.com/pricing)           |

Plus the heading `## The 12 Best Free AI Image Upscalers Tested in 2026` → `... Compared in 2026`, matching the page's own no-benchmark disclosure.

Each of the four facts is corrected at every place it appears (vendor section, comparison table, FAQ), so the page does not contradict itself. Nothing else changed.

## Not changed

Post `title` and `seo_title` ("Best Free AI Image Upscalers 2026: Limits Compared"), body H1, slug, description, tags, featured image, every other vendor entry, and every traffic/quality claim. No benchmark claim is added — these figures are vendor-stated, not export-tested.

## Publication (AC-2, owner action — João)

The served record lives in the production DB, so the repository backup gate runs first:

1. `yarn db:backup`
2. `yarn db:backups` and `gzip -t` on both new archives; record their paths. Stop if either fails.
3. `PATCH /api/blog/posts/best-free-ai-image-upscaler-2026-tested-compared` with `content` from the corrected file, `x-api-key: $BLOG_API_KEY`.
4. Readback evidence must be an **unauthenticated** public fetch of the live article showing the corrected copy — a 200 from the PATCH is not reader-served evidence.

Post-publish: append to the [SEO changes backlog](../maintenance/seo-changes-backlog.md), and start the 14-complete-day post-crawl window plus 3-day holdback (the Oct 4 gate applies only with no intervening edit).
