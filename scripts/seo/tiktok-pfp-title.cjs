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

const PREVIOUS_DESCRIPTION = 'Level up your brand with these 8 TikTok profile picture ideas for 2026. Learn how to create crisp, high-res PFPs that get noticed and drive clicks.';
const SEO_DESCRIPTION = 'Explore 8 TikTok PFP ideas: headshots, anime avatars, neon designs, logos, and more. Choose a style and use crop and clarity tips to prepare your photo.';

function buildDescriptionPatch(post) {
  if (post.slug !== 'tiktok-profile-picture-ideas' || post.status !== 'published') {
    throw new Error('Expected the published canonical TikTok post');
  }
  if (post.seo_title !== SEO_TITLE) {
    throw new Error('Title changed since review; stop and re-read the post');
  }
  if (post.seo_description === SEO_DESCRIPTION) return {};
  if (post.seo_description !== PREVIOUS_DESCRIPTION) {
    throw new Error('Description changed since review; stop and re-read the post');
  }
  return { seo_description: SEO_DESCRIPTION };
}

module.exports = { buildTitlePatch, PREVIOUS_TITLE, SEO_TITLE, buildDescriptionPatch, PREVIOUS_DESCRIPTION, SEO_DESCRIPTION };
