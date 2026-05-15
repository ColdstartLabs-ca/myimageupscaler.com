# Reddit Post Log

Durable log for the `reddit-seo-response` skill. Read this before selecting new Reddit targets. Use it to avoid duplicate replies, track linked vs no-link participation, and maintain the 9:1 participation ratio.

Keep the latest 100 rows here. Move older rows to `docs/seo/reddit-post-log-archive.md` or summarize them by month while preserving linked-post counts.

## Summary

- Last updated: 2026-05-15
- Recent self-links posted: 1
- Recent no-link participation posts: 2
- Pending recommended self-links: 1
- Pending recommended no-link participation posts: 2
- Next recommended action: post the two no-link recommendations first; only use the recommended link reply after those are posted.

## Log

| Date       | Posted Date | Status      | Subreddit        | Thread                                                                                                     | Thread Title                                                                     | Target Page                                                                       | Link Decision                | Link Used | Notes                                                                                   |
| ---------- | ----------- | ----------- | ---------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------- | --------- | --------------------------------------------------------------------------------------- |
| 2026-05-15 | 2026-05-15  | posted      | r/upscaling      | https://www.reddit.com/r/upscaling/comments/1phzynp/is_there_any_free_unlimited_image_upscaler_thats/      | Is there any free unlimited image upscaler that's actually good?                 | https://myimageupscaler.com/blog/free-ai-upscaler-no-watermark                    | include link with disclosure | yes       | First campaign self-link. Disclosed affiliation with MyImageUpscaler.                   |
| 2026-05-15 | 2026-05-15  | posted      | r/GeminiAI       | https://www.reddit.com/r/GeminiAI/comments/1nbzdn4/whats_the_best_most_accurate_upscaler_for_keeping/      | What's the best, most accurate upscaler for keeping images true to the original? | https://myimageupscaler.com/blog/how-to-upscale-images-without-losing-quality     | no link                      | no        | Participation reply about low-creativity upscaling and preserving original details.     |
| 2026-05-15 | 2026-05-15  | posted      | r/AskPhotography | https://www.reddit.com/r/AskPhotography/comments/1t4cnhd/new_photographer_canon_r50_i_accidentally/        | New Photographer - Canon R50 - accidentally captured RAW instead of JPEG         | https://myimageupscaler.com/blog/fix-blurry-photos-ai-methods-guide               | no link                      | no        | Participation reply about opening CR3 files in Canon DPP and exporting sharpened JPEGs. |
| 2026-05-15 |             | recommended | r/AskPhotography | https://www.reddit.com/r/AskPhotography/comments/1pl1v1u/how_can_i_fix_blurry_photos/                      | How can I fix blurry photos?                                                     | none                                                                              | no link                      | no        | Batch 2 first no-link recommendation for new account.                                   |
| 2026-05-15 |             | recommended | r/graphic_design | https://www.reddit.com/r/graphic_design/comments/1rrp6h9/conversion_from_72_dpi_to_300_dpi_technical_info/ | Conversion from 72 dpi to 300 dpi technical info                                 | none                                                                              | no link                      | no        | Batch 2 second no-link recommendation for new account.                                  |
| 2026-05-15 |             | recommended | r/ask            | https://www.reddit.com/r/ask/comments/1rtu79x/where_do_i_go_to_upscale_images/                             | Where do I go to upscale images?                                                 | https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared | include link with disclosure | yes       | Batch 2 link recommendation; post only after the two no-link replies.                   |

## Recent Posted Copy

### 2026-05-15 - r/upscaling - free unlimited image upscaler

Thread: https://www.reddit.com/r/upscaling/comments/1phzynp/is_there_any_free_unlimited_image_upscaler_thats/

```text
I'd separate "free" from "unlimited," because most web upscalers quietly hit a wall somewhere: file size, queue time, output caps, watermarks, or failed jobs once the server gets busy.

If you want truly unlimited, local tools like Upscayl are usually the safest bet. The tradeoff is setup and output quality can vary a lot depending on the image.

For web tools, I'd test the same 3 images before trusting one:

- a face or portrait
- a small screenshot or text-heavy image
- a low-res photo with texture, like fabric, hair, or grass

A lot of upscalers look good on one type and fall apart on another.

I work on MyImageUpscaler, so obvious bias, but this is the page I'd use as the checklist for free/no-signup/no-watermark options:
https://myimageupscaler.com/blog/free-ai-upscaler-no-watermark
```

### 2026-05-15 - r/GeminiAI - accurate upscaler

Thread: https://www.reddit.com/r/GeminiAI/comments/1nbzdn4/whats_the_best_most_accurate_upscaler_for_keeping/

```text
The annoying answer is that the "most accurate" upscaler is usually the least creative one.

If you care about preserving the original face, pose, and small details, avoid anything that behaves like image-to-image generation with a high creativity or denoise setting. Those tools can look sharper, but they're also the ones that quietly redraw eyes, teeth, fabric patterns, logos, etc.

What I'd try:

- Use 2x before jumping to 4x or 8x.
- Pick the boring/photo/high-fidelity mode if the tool has one.
- Keep denoise or creativity low.
- Compare at 100% zoom, not just zoomed out.
- For portraits, check eyes, teeth, hands, and hair first.
```

### 2026-05-15 - r/AskPhotography - RAW photos fuzzy

Thread: https://www.reddit.com/r/AskPhotography/comments/1t4cnhd/new_photographer_canon_r50_i_accidentally/

```text
First thing I'd do: open the CR3 files in Canon DPP, not your phone preview or the default OS viewer. Some viewers show an embedded preview or apply almost no sharpening, so the files can look worse than they really are.

Quick path:

1. Copy the RAW files somewhere safe first.
2. Open a few keepers in Canon DPP.
3. Fix white balance/exposure if needed.
4. Add normal sharpening.
5. Export JPEGs at the size you need for the invitations.

If they're still fuzzy after that, it's probably focus, shutter speed, or lens softness rather than RAW vs JPEG. But don't reshoot until you've tried a proper RAW conversion. The camera-back preview is a terrible judge of sharpness.
```
