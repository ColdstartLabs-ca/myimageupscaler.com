const PREVIOUS_DESCRIPTION = 'Use our AI text image enhancer guide to make blurry text sharp and readable. Learn to prep files, optimize for OCR, and run batch workflows for perfect results.';
const SEO_DESCRIPTION = 'Make text in images easier to read: crop, straighten, adjust contrast, and check letter shapes before OCR. Follow steps for screenshots, labels, and scans.';

function buildDescriptionPatch(post) {
  if (post.slug !== 'text-image-enhancer' || post.status !== 'published') {
    throw new Error('Expected the published canonical readability guide');
  }
  if (post.seo_description === SEO_DESCRIPTION) return {};
  if (post.seo_description !== PREVIOUS_DESCRIPTION) {
    throw new Error('Description changed since review; stop and re-read the post');
  }
  return { seo_description: SEO_DESCRIPTION };
}

module.exports = { buildDescriptionPatch, PREVIOUS_DESCRIPTION, SEO_DESCRIPTION };
