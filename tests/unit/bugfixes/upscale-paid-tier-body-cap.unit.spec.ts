import { describe, expect, test } from 'vitest';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

// Body bytes peak at ~4x in the Worker (raw text + parsed string, both UTF-16).
const WORKER_PEAK_MULTIPLIER = 4;
// base64 inflates by 4/3; the JSON envelope adds a little more.
const BASE64_ENVELOPE_OVERHEAD = 1.4;
const WORKER_MEMORY_LIMIT = 128 * 1024 * 1024;

describe('paid tier fits through the Worker', () => {
  test('a max-size paid upload produces a body under the request cap', () => {
    const bodyBytes = IMAGE_VALIDATION.MAX_SIZE_PAID * BASE64_ENVELOPE_OVERHEAD;
    expect(bodyBytes).toBeLessThan(IMAGE_VALIDATION.MAX_REQUEST_BYTES);
  });

  test('the request cap leaves half the Worker heap for everything else', () => {
    expect(IMAGE_VALIDATION.MAX_REQUEST_BYTES * WORKER_PEAK_MULTIPLIER).toBeLessThanOrEqual(
      WORKER_MEMORY_LIMIT / 2
    );
  });
});
