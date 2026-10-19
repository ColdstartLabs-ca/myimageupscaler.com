// One-variable blog-edit payload; refuse to overwrite an unreviewed title.
const PREVIOUS_TITLE = '8 TikTok Profile Picture Ideas to Stand Out in 2026';
const SEO_TITLE = 'TikTok Profile Picture Ideas: 8 PFP Styles (2026)';

function buildTitlePatch(post) {
  if (post.slug !== 'tiktok-profile-picture-ideas' || post.status !== 'published') {
    throw new Error('Expected the published canonical TikTok post');
  }
  if (post.seo_title === SEO_TITLE) return {};
  if (post.seo_title !== PREVIOUS_TITLE) {
    throw new Error('Title changed since review; stop and re-read the post');
  }
  return { seo_title: SEO_TITLE };
}

module.exports = { buildTitlePatch, PREVIOUS_TITLE, SEO_TITLE };
