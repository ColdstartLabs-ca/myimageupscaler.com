import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  run: vi.fn(),
}));

vi.mock('replicate', () => ({
  default: class MockReplicate {
    run = mocks.run;

    constructor(options: unknown) {
      mocks.constructor(options);
    }
  },
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: {
    REPLICATE_API_TOKEN: 'test-token',
    REPLICATE_MODEL_VERSION: 'owner/model:version',
  },
}));
vi.mock('@shared/config/guest-limits.config', () => ({
  GUEST_LIMITS: { MODEL: 'real-esrgan', SCALE: 2 },
}));
vi.mock('@server/utils/retry', () => ({
  isRateLimitError: vi.fn(() => false),
  isTransientUpstreamError: vi.fn(() => false),
  withRetry: vi.fn((operation: () => Promise<unknown>) => operation()),
}));
vi.mock('@server/services/model-registry', () => ({
  ModelRegistry: {
    getInstance: () => ({
      getModel: () => ({ modelVersion: 'owner/model:version' }),
    }),
  },
}));

import { processGuestImage } from '@server/services/guest-processor';

describe('processGuestImage Replicate output handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.run.mockResolvedValue('https://replicate.delivery/output.png');
  });

  it('disables eager FileOutput streams in the Worker guest path', async () => {
    await processGuestImage({ imageData: 'YWJj', mimeType: 'image/jpeg' });

    expect(mocks.constructor).toHaveBeenCalledWith({
      auth: 'test-token',
      useFileOutput: false,
    });
  });
});
