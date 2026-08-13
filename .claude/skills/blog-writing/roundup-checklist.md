# Blog Roundup Checklist

Use this checklist before publishing the next comparison roundup. The goal is to reproduce the evidence and decision clarity behind the strongest-performing free-upscaler comparison, not to generate a thin list of tools.

## Research and testing

- [ ] Define one primary comparison query and the reader's decision before drafting.
- [ ] Test every named tool on the same representative inputs: faces, text, low-resolution photos, and one difficult edge case.
- [ ] Record version/date, plan or trial limits, output scale, watermark behavior, speed, and the exact test setup.
- [ ] Save one before/after screenshot per tested tool, with descriptive alt text and a consistent crop.

## Article structure

- [ ] Put a direct answer and the comparison criteria in the first screen.
- [ ] Include a scannable verdict table with best-for, quality, speed, limits, price, and watermark columns.
- [ ] Give each tool a short evidence-led review, followed by a clear limitation or trade-off.
- [ ] Mark the article's updated date and explain what changed since the prior version.
- [ ] Use `ItemList`/comparison schema only for claims represented visibly in the article.

## Conversion and distribution

- [ ] Link to the canonical tool page for each product tested and use descriptive anchor text.
- [ ] Include a relevant tool CTA above the fold and a linked primary CTA in the conclusion.
- [ ] Add at least two inbound internal links to the roundup before publishing; confirm with `yarn verify`.
- [ ] Add the published URL to the GSC request-indexing backlog when the change is material.

## Measurement

- [ ] Run `yarn seo:ctr:report` after the first complete 28-day window.
- [ ] Compare commercial CTR separately from informational citation URLs.
- [ ] Record the test window, query cluster, clicks, impressions, CTR, and next decision in the SEO backlog.
- [ ] Do not noindex or delete a post to improve the site-wide CTR average.

## Next named targets

1. Best GIF upscaler
2. Best free upscaler without watermark
3. Topaz alternatives
4. Best 8K upscaler
5. Best bulk upscaler
