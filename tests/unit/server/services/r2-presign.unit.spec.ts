import { beforeEach, describe, expect, it, vi } from 'vitest';

const helper = vi.hoisted(() => ({
  presignPutUrl: vi.fn(async () => 'put-url'),
  presignGetUrl: vi.fn(async () => 'get-url'),
}));

vi.mock('@server/services/r2-presign.mjs', () => helper);

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    CLOUDFLARE_ACCOUNT_ID: 'acct-123',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
  },
}));

import { presignGet, presignPut } from '@server/services/r2-storage.service';

const ENDPOINT = 'https://acct-123.r2.cloudflarestorage.com';

describe('r2-storage.service delegates to the shared r2-presign helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the built URL, credentials and PUT options to presignPutUrl', async () => {
    await expect(
      presignPut({
        bucket: 'miu-private',
        key: 'inputs/user-1/job.png',
        sizeBytes: 1024,
        contentType: 'image/png',
      })
    ).resolves.toBe('put-url');

    expect(helper.presignPutUrl).toHaveBeenCalledTimes(1);
    expect(helper.presignPutUrl).toHaveBeenCalledWith({
      url: `${ENDPOINT}/miu-private/inputs/user-1/job.png`,
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      sizeBytes: 1024,
      contentType: 'image/png',
      expiresSeconds: 900,
    });
  });

  it('passes the built URL, credentials and GET expiry to presignGetUrl', async () => {
    await expect(presignGet('miu-private', 'inputs/user-1/job.png')).resolves.toBe('get-url');

    expect(helper.presignGetUrl).toHaveBeenCalledTimes(1);
    expect(helper.presignGetUrl).toHaveBeenCalledWith({
      url: `${ENDPOINT}/miu-private/inputs/user-1/job.png`,
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      expiresSeconds: 600,
    });
  });
});
