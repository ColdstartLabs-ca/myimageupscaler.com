const { createHash } = require('node:crypto');

const SOURCE_SLUG = 'what-resolution-for-print';
const TARGET_PATH = '/blog/best-high-resolution-image-format';
const INSERT_AFTER = '## Tips for Print-Ready Photos';
const LINK_SENTENCE = `For export choices, compare [high-resolution image formats for print and archiving](${TARGET_PATH}) before sending files to your print lab.`;

function buildInternalLinkPatch(post, expectedContentSha256) {
  if (post.slug !== SOURCE_SLUG || post.status !== 'published') {
    throw new Error('Expected the published canonical print-resolution guide');
  }
  const actualHash = createHash('sha256').update(post.content).digest('hex');
  if (actualHash !== expectedContentSha256) {
    throw new Error('Body changed since review; stop and re-read the post');
  }
  if (post.content.includes(TARGET_PATH)) return {};
  if (post.content.split(INSERT_AFTER).length !== 2) {
    throw new Error('Expected exactly one reviewed print-tips insertion point');
  }
  return { content: post.content.replace(INSERT_AFTER, `${INSERT_AFTER}\n\n${LINK_SENTENCE}`) };
}

module.exports = { buildInternalLinkPatch, INSERT_AFTER, LINK_SENTENCE, SOURCE_SLUG, TARGET_PATH };
