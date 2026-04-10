import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('serverEnv GSC vars', () => {
  const originalGscEmail = process.env.GSC_SERVICE_ACCOUNT_EMAIL;
  const originalGscKey = process.env.GSC_PRIVATE_KEY;
  const originalGscSiteUrl = process.env.GSC_SITE_URL;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.GSC_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GSC_PRIVATE_KEY;
    delete process.env.GSC_SITE_URL;
  });

  afterEach(() => {
    vi.resetModules();

    if (originalGscEmail === undefined) {
      delete process.env.GSC_SERVICE_ACCOUNT_EMAIL;
    } else {
      process.env.GSC_SERVICE_ACCOUNT_EMAIL = originalGscEmail;
    }

    if (originalGscKey === undefined) {
      delete process.env.GSC_PRIVATE_KEY;
    } else {
      process.env.GSC_PRIVATE_KEY = originalGscKey;
    }

    if (originalGscSiteUrl === undefined) {
      delete process.env.GSC_SITE_URL;
    } else {
      process.env.GSC_SITE_URL = originalGscSiteUrl;
    }
  });

  test('loads GSC env vars from process.env', async () => {
    process.env.GSC_SERVICE_ACCOUNT_EMAIL = 'sa@project.iam.gserviceaccount.com';
    process.env.GSC_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n';
    process.env.GSC_SITE_URL = 'sc-domain:example.com';

    const { serverEnv } = await import('../../../shared/config/env');

    expect(serverEnv.GSC_SERVICE_ACCOUNT_EMAIL).toBe('sa@project.iam.gserviceaccount.com');
    expect(serverEnv.GSC_PRIVATE_KEY).toBe(
      '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n'
    );
    expect(serverEnv.GSC_SITE_URL).toBe('sc-domain:example.com');
  });

  test('falls back to default GSC_SITE_URL when unset', async () => {
    const { serverEnv } = await import('../../../shared/config/env');

    expect(serverEnv.GSC_SITE_URL).toBe('sc-domain:myimageupscaler.com');
  });
});
