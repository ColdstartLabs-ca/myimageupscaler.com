import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, serverEnv } = vi.hoisted(() => ({
  from: vi.fn(),
  serverEnv: { SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key' },
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from },
}));

vi.mock('@shared/config/env', () => ({ serverEnv }));

describe('published blog inventory', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('fails closed instead of treating a database inventory failure as an empty list', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST500',
        message: 'database connection unavailable',
      },
    });
    from.mockReturnValue(query);

    const { getAllPublishedSlugsStrict } = await import('@server/services/blog.service');

    await expect(getAllPublishedSlugsStrict()).rejects.toThrow(
      /Published blog inventory unavailable.*PGRST500.*database connection unavailable/i
    );
  });

  it('keeps static generation working when the database inventory is unavailable', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST500',
        message: 'database connection unavailable',
      },
    });
    from.mockReturnValue(query);

    const { getAllPublishedSlugs } = await import('@server/services/blog.service');

    const slugs = await getAllPublishedSlugs();

    expect(slugs.length).toBeGreaterThan(0);
  });
});
