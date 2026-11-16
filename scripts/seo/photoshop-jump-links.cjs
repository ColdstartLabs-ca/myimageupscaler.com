const { createHash } = require('node:crypto');

// Confirmed against the normal rendered article on 2026-11-16. Keep the headings
// and visible link labels intact; only the three dead fragment targets change.
const JUMP_LINK_FIXES = [
  {
    from: 'when-to-use-neural-filters-after-upscaling',
    to: 'how-to-upscale-an-image-in-photoshop-using-neural-filters',
    heading: 'How to Upscale an Image in Photoshop Using Neural Filters',
  },
  {
    from: 'batch-upscaling-images-in-photoshop',
    to: 'how-to-upscale-multiple-images-in-photoshop-batch-upscaling',
    heading: 'How to Upscale Multiple Images in Photoshop (Batch Upscaling)',
  },
  {
    from: 'photoshop-upscaling-for-print-size-and-300-dpi',
    to: 'how-to-upscale-a-photo-in-photoshop-for-print-300-dpi-guide',
    heading: 'How to Upscale a Photo in Photoshop for Print (300 DPI Guide)',
  },
];

function buildPhotoshopJumpLinkPatch(post, expectedContentHash) {
  if (post.slug !== 'photoshop-upscale-image' || post.status !== 'published') {
    throw new Error('Only the reviewed published Photoshop guide may be repaired');
  }
  const content = post.content;
  if (
    typeof content !== 'string' ||
    createHash('sha256').update(content).digest('hex') !== expectedContentHash
  ) {
    throw new Error('Content changed since review; refuse to overwrite');
  }

  for (const { heading } of JUMP_LINK_FIXES) {
    if (content.split('\n').filter(line => line === `## ${heading}`).length !== 1) {
      throw new Error(`Destination heading missing or ambiguous: ${heading}`);
    }
  }
  const count = target => content.split(`](#${target})`).length - 1;
  if (JUMP_LINK_FIXES.every(({ from, to }) => count(from) === 0 && count(to) === 1)) {
    return {};
  }
  if (!JUMP_LINK_FIXES.every(({ from, to }) => count(from) === 1 && count(to) === 0)) {
    throw new Error('Source jump links missing, ambiguous or partially repaired');
  }

  return {
    content: JUMP_LINK_FIXES.reduce(
      (body, { from, to }) => body.replace(`](#${from})`, `](#${to})`),
      content
    ),
  };
}

module.exports = { buildPhotoshopJumpLinkPatch, JUMP_LINK_FIXES };
