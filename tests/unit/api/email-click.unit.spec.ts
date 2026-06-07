import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@app/api/email/click/route';
import { getEmailLifecycleService } from '@server/services/email-lifecycle.service';

vi.mock('@server/services/email-lifecycle.service', () => ({
  getEmailLifecycleService: vi.fn(),
}));

describe('GET /api/email/click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEmailLifecycleService).mockReturnValue({
      verifyClickToken: vi.fn().mockReturnValue(true),
      recordClick: vi.fn().mockResolvedValue({ redirectUrl: '/upscale?utm_source=email' }),
    } as never);
  });

  it('records click and redirects', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/email/click?q=queue_1&url=%2Fupscale&token=ok')
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/upscale?utm_source=email');
    const service = vi.mocked(getEmailLifecycleService).mock.results[0].value;
    expect(service.recordClick).toHaveBeenCalledWith({
      queueId: 'queue_1',
      destination: '/upscale',
    });
  });

  it('rejects unsafe redirect', async () => {
    vi.mocked(getEmailLifecycleService).mockReturnValue({
      verifyClickToken: vi.fn().mockReturnValue(true),
      recordClick: vi.fn().mockRejectedValue(new Error('Unsafe lifecycle email redirect')),
    } as never);

    const response = await GET(
      new NextRequest(
        'http://localhost/api/email/click?q=queue_1&url=https%3A%2F%2Fevil.example&token=ok'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Unsafe lifecycle email redirect');
  });
});
