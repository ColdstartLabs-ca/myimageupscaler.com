import { describe, expect, it, vi } from 'vitest';
import { AmplitudeCohortService } from '@server/services/amplitude-cohort.service';

describe('AmplitudeCohortService', () => {
  it('should poll and download cohort members when request succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request_id: 'request_123', cohort_id: 'cohort_123' }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ request_id: 'request_123', async_status: 'JOB INPROGRESS' }),
          {
            status: 202,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request_id: 'request_123', async_status: 'JOB COMPLETED' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response('user_id,amplitude_id,email\nuser_1,amp_1,USER@example.com\n', {
          status: 200,
          headers: { 'content-type': 'text/csv' },
        })
      );

    const service = new AmplitudeCohortService({
      apiKey: 'api-key',
      secretKey: 'secret-key',
      baseUrl: 'https://amplitude.test',
      fetchImpl: fetchImpl as never,
      pollIntervalMs: 0,
    });

    const members = await service.downloadCohortMembers('cohort_123');

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      'https://amplitude.test/api/5/cohorts/request/cohort_123?props=1&propKeys=email'
    );
    expect(members).toEqual([
      {
        userId: 'user_1',
        amplitudeId: 'amp_1',
        email: 'user@example.com',
        raw: { user_id: 'user_1', amplitude_id: 'amp_1', email: 'USER@example.com' },
      },
    ]);
  });
});
