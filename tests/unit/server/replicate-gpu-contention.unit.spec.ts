import { describe, expect, it } from 'vitest';
import { isGpuContentionError, isTransientUpstreamError } from '@server/utils/retry';
import { createReplicateRetryPolicy } from '@server/services/replicate.service';
import {
  ReplicateErrorCode,
  replicateErrorMapper,
} from '@server/services/replicate/utils/error-mapper';

/**
 * Two different GPU failures arrive as similar-looking text and must not be
 * treated the same way.
 *
 * The model's own guard rejects an input that is genuinely too big, before any
 * allocation. Retrying is pointless and the user does need a smaller image.
 *
 * A CUDA OOM is contention on Replicate's shared GPU: the message reports how
 * little of the card was free at that moment. The same request succeeds on a
 * quieter GPU, so it should retry and must not tell the user their image is
 * too large. 140 of 151 Real-ESRGAN failures over Aug 8-17 were this case,
 * every one of them failing without a single retry.
 */
const CONTENTION_OOM =
  'CUDA out of memory. Tried to allocate 4.00 GiB. GPU 0 has a total capacity of 14.56 GiB of which 3.47 GiB is free.';

const MODEL_PIXEL_GUARD =
  'Input image of dimensions (1800, 1800, 3) has a total number of pixels 3240000 greater than the max size that fits in GPU memory on this hardware, 2096704. Resize input image and try again.';

describe('GPU failure classification', () => {
  it('recognises a contention OOM', () => {
    expect(isGpuContentionError(CONTENTION_OOM)).toBe(true);
  });

  it('does not retry an input the model itself rejected as too large', () => {
    expect(isGpuContentionError(MODEL_PIXEL_GUARD)).toBe(false);
    expect(isTransientUpstreamError(MODEL_PIXEL_GUARD)).toBe(false);
  });

  it('retries a contention OOM once and then gives up', () => {
    const shouldRetry = createReplicateRetryPolicy();

    // A contention attempt burns ~16s median of provider time, so a second
    // retry would push the request past the route's 2-minute budget and the
    // user would see a timeout instead of a clear message.
    expect(shouldRetry(CONTENTION_OOM)).toBe(true);
    expect(shouldRetry(CONTENTION_OOM)).toBe(false);
  });

  it('keeps the full retry budget for fast-failing transient errors', () => {
    const shouldRetry = createReplicateRetryPolicy();

    expect(shouldRetry('502 Bad Gateway')).toBe(true);
    expect(shouldRetry('502 Bad Gateway')).toBe(true);
    expect(shouldRetry('rate limit exceeded')).toBe(true);
  });

  it('gives each request its own contention budget', () => {
    const first = createReplicateRetryPolicy();
    first(CONTENTION_OOM);

    expect(createReplicateRetryPolicy()(CONTENTION_OOM)).toBe(true);
  });

  it('reports a contention OOM as a provider problem, not a user problem', () => {
    const mapped = replicateErrorMapper.mapError(new Error(CONTENTION_OOM));

    expect(mapped.code).toBe(ReplicateErrorCode.PROVIDER_UNAVAILABLE);
    expect(mapped.message.toLowerCase()).not.toContain('too large');
    expect(mapped.message.toLowerCase()).not.toContain('smaller image');
  });

  it('still tells the user to shrink a genuinely oversized image', () => {
    const mapped = replicateErrorMapper.mapError(new Error(MODEL_PIXEL_GUARD));

    expect(mapped.code).toBe(ReplicateErrorCode.IMAGE_TOO_LARGE);
    expect(mapped.message.toLowerCase()).toContain('smaller image');
  });

  it('keeps treating a decode failure as invalid input rather than retrying it', () => {
    const decodeFailure = "'NoneType' object has no attribute 'shape'";

    expect(isTransientUpstreamError(decodeFailure)).toBe(false);
    expect(replicateErrorMapper.mapError(new Error(decodeFailure)).code).toBe(
      ReplicateErrorCode.INVALID_INPUT
    );
  });
});
