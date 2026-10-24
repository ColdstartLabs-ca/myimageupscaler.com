import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('serverEnv ADMIN_EMAIL', () => {
  const originalAdminEmail = process.env.ADMIN_EMAIL;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.ADMIN_EMAIL;
  });

  afterEach(() => {
    vi.resetModules();

    if (originalAdminEmail === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = originalAdminEmail;
    }
  });

  test('defaults to admin@coldstartlabs.ca when unset', async () => {
    const { serverEnv } = await import('../../../shared/config/env');

    expect(serverEnv.ADMIN_EMAIL).toBe('admin@coldstartlabs.ca');
  });

  test('respects explicit ADMIN_EMAIL', async () => {
    process.env.ADMIN_EMAIL = 'ops@example.com';

    const { serverEnv } = await import('../../../shared/config/env');

    expect(serverEnv.ADMIN_EMAIL).toBe('ops@example.com');
  });
});
