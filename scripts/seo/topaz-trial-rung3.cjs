'use strict';

const { createHash } = require('crypto');
const OPENING =
  'Topaz Labs no longer offers a conventional free trial for its current Topaz Photo desktop app. In 2026, Topaz Photo is subscription-only: you purchase first and can request a refund within two days if it does not fit your workflow. The old Topaz Photo AI preview-only trial belongs to a discontinued legacy app, so advice saying you can install the current app and test indefinitely without payment is outdated.';
const ANSWER =
  '**Quick answer:** Current Topaz Photo and Topaz Video desktop apps have no trial mode and require a paid subscription. Topaz says to contact support within two days of purchase to request a refund. An old Photo AI or Video AI trial screen does not establish the current app\'s terms.';
const EVIDENCE = `

### Verify the exact Topaz app before paying

The official product documentation, checked November 16, 2026, distinguishes current subscription apps from legacy AI versions:

| What you are evaluating | Primary-source check | What that proves |
| :--- | :--- | :--- |
| Current Topaz Photo | [Photo AI vs Topaz Photo](https://docs.topazlabs.com/topaz-photo/tpai-vs-tp) | The current app requires a subscription and has no trial mode. |
| Current Topaz Video | [Video AI vs Topaz Video](https://docs.topazlabs.com/topaz-video/tvai-vs-tv) | The current app also requires a subscription and has no trial mode. |
| A legacy app showing Trial mode | Check the product name and purchase-account email against those same guides. | A legacy installer or account mismatch is not evidence of a free current-app trial. |

**Refund check:** [Topaz's cancellation and refund policy](https://docs.topazlabs.com/sales-account-licensing/before-you-buy/refund-policy) requires a refund request within two days of purchase. Canceling a subscription does not request a refund. Read the checkout commitment, record your purchase time, and test the export workflow promptly if you choose to buy.`;

function buildTopazTrialPayload(post, expectedContentSHA256) {
  if (post.slug !== 'topaz-labs-free-trial') throw new Error('unexpected slug');
  if (!/^[a-f0-9]{64}$/.test(expectedContentSHA256 || '')) throw new Error('expected content hash required');
  if (typeof post.content !== 'string') throw new Error('content required');
  if (createHash('sha256').update(post.content).digest('hex') !== expectedContentSHA256) {
    throw new Error('content changed since authenticated preflight');
  }
  if (post.content.includes('### Verify the exact Topaz app before paying')) throw new Error('evidence module already exists');
  if (post.content.split(OPENING).length - 1 !== 1) throw new Error('opening anchor count must be 1');
  return { content: post.content.replace(OPENING, ANSWER + EVIDENCE) };
}

module.exports = { OPENING, ANSWER, EVIDENCE, buildTopazTrialPayload };
