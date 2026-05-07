# GSC Request Indexing Backlog

Created: 2026-05-06

## When To Use

After the next production deploy, open Google Search Console URL Inspection for each URL below and click **Request indexing**. Use this file to track exactly what still needs to be requested, then clean up the backlog manually when all requests are complete.

The API work already completed:

- IndexNow accepted all 6 URLs on 2026-05-06.
- `https://myimageupscaler.com/sitemap.xml` was resubmitted through the Search Console API on 2026-05-06.
- URL Inspection API reported all 6 URLs as indexable and fetchable.

## Pending URLs

Priority 1:

- [ ] Request indexing: `https://myimageupscaler.com/blog/best-free-ai-image-upscaler-2026-tested-compared`
- [ ] Request indexing: `https://myimageupscaler.com/blog/ai-image-upscaling-vs-sharpening-explained`
- [ ] Request indexing: `https://myimageupscaler.com/blog/best-ai-image-quality-enhancer-free`
- [ ] Request indexing: `https://myimageupscaler.com/blog/free-ai-upscaler-no-watermark`
- [ ] Request indexing: `https://myimageupscaler.com/blog/upscale-image-for-print-300-dpi-guide`

Priority 2:

- [ ] Request indexing: `https://myimageupscaler.com/it`

Cleanup:

- [ ] Manually clean up this backlog after every URL above has been requested in GSC.
- [ ] Add the completion date before archiving or deleting this file.

## Notes

- The 5 blog URLs are already `Submitted and indexed` in GSC, but the visible title/H1/body refresh should still be manually nudged after deploy.
- `/it` is indexed and canonicalized correctly, but GSC showed no referring sitemap before deploy. Recheck after the `sitemap-static.xml` locale-homepage change is live.
- After completing this backlog, mark the checkboxes and add the completion date here.
