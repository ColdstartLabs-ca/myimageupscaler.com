'use strict';

const { createHash } = require('node:crypto');
const { applyBestAiUpscalerRung3 } = require('./three-kings-2026-09-24.cjs');
const { applyYoutubeThumbnailRung3, EVIDENCE } = require('./three-kings-2026-10-05.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.trimEnd();
const CURRENT_TOPAZ_HASH = '30aa280c435dfbf84aaccc8820fdd79d6af6f25c1379e3e682953b4ee00df092';

function rollbackPayload(post, edit) {
  if (edit.field === 'rollback') throw new Error('never undo a diagnostic rollback');
  if (edit.outcome?.verdict !== 'LOSS') throw new Error('requires a judged LOSS');
  if (edit.outcome.impDelta <= -40 && Math.abs(edit.outcome.posDelta) <= 1) {
    throw new Error('demand collapse: do not revert');
  }
  if (!edit.previousValue) throw new Error('missing exact prior value');
  if (post.slug === 'topaz-labs-free-trial') {
    if (hash(post.seo_description) !== CURRENT_TOPAZ_HASH) throw new Error('current description changed');
    return { seo_description: edit.previousValue };
  }
  if (post.slug === 'best-ai-upscaler') {
    const expected = applyBestAiUpscalerRung3({ content: edit.previousValue }).content;
    if (normalize(post.content) !== normalize(expected)) throw new Error('current body changed');
    return { content: edit.previousValue };
  }
  if (post.slug === 'how-to-upscale-youtube-thumbnails') {
    const expected = applyYoutubeThumbnailRung3({ content: edit.previousValue }).content.replaceAll(
      'https://xqysaylskffsfwunczbd.supabase.co/storage/v1/object/public/blog-images/',
      'https://assets.myimageupscaler.com/'
    );
    if (normalize(post.content) !== normalize(expected)) throw new Error('current body changed');
    // The recorded old body contains false guest/DPI/upload claims and obsolete
    // storage URLs. Undo only the experimental module, not those factual repairs.
    const guidance = EVIDENCE.trim().split('\n\n').find(p => p.startsWith('For standard video thumbnails,'));
    if (!guidance) throw new Error('missing recorded upload guidance');
    return {
      content: post.content.replace(EVIDENCE.trim(), guidance).replaceAll('evidence block above', 'upload guidance above'),
    };
  }
  throw new Error('URL is outside the authorized regression set');
}

module.exports = { rollbackPayload };
