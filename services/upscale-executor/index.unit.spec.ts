import { describe, expect, it, vi } from 'vitest';

import {
  advanceExecution,
  createStreamingOutputStager,
  type IExecutorAttempt,
  type IExecutorExecution,
  type IExecutorRpc,
} from './advance';
import { createCloudTasksPublisher, createExecutorServer, startExecutorHttpServer } from './index';

const jobId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';

function execution(overrides: Partial<IExecutorExecution> = {}): IExecutorExecution {
  return {
    job_id: jobId,
    user_id: '33333333-3333-4333-8333-333333333333',
    input_storage_path: '33333333-3333-4333-8333-333333333333/input.png',
    input_mime_type: 'image/png',
    input_size_bytes: 12,
    input_width: 64,
    input_height: 64,
    quality_tier: 'quick',
    scale: 2,
    config: { qualityTier: 'quick', scale: 2 },
    billing_model_id: 'real-esrgan',
    resolved_model_id: 'real-esrgan',
    provider: 'replicate',
    model_version: 'owner/model:version',
    stage: 'queued',
    lease_generation: 0,
    deadline_at: '2099-01-01T00:00:00.000Z',
    next_action_at: null,
    output_storage_path: null,
    output_mime_type: null,
    output_size_bytes: null,
    output_expires_at: null,
    failure_reason: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function attempt(overrides: Partial<IExecutorAttempt> = {}): IExecutorAttempt {
  return {
    attempt_id: attemptId,
    may_create: true,
    job_id: jobId,
    ordinal: 1,
    provider: 'replicate',
    model_id: 'real-esrgan',
    model_version: 'owner/model:version',
    callback_correlation: 'c'.repeat(64),
    submission_state: 'pending',
    provider_prediction_id: null,
    provider_status: null,
    provider_output_url: null,
    provider_output_mime_type: null,
    provider_output_expires_at: null,
    failure_reason: null,
    next_poll_at: null,
    ...overrides,
  };
}

function rpc(overrides: Partial<IExecutorRpc> = {}): IExecutorRpc {
  return {
    getExecution: vi.fn(async () => execution()),
    findAttemptByCorrelation: vi.fn(async () => null),
    getActiveAttempt: vi.fn(async () => null),
    getLatestTerminalAttempt: vi.fn(async () => null),
    createAttempt: vi.fn(async () => attempt()),
    bindPrediction: vi.fn(async () => true),
    markSubmissionUnknown: vi.fn(async () => true),
    markProviderTerminal: vi.fn(async () => true),
    markReady: vi.fn(async () => true),
    settleFailure: vi.fn(async () => true),
    retryOutbox: vi.fn(async () => true),
    acknowledgeOutbox: vi.fn(async () => true),
    scheduleAction: vi.fn(async () => true),
    claimOutbox: vi.fn(async () => []),
    ...overrides,
  };
}

describe('external upscale executor', () => {
  it.each(['executor', 'dispatcher', 'callbacks'] as const)(
    'only the dispatcher publishes runtime health (%s)',
    async mode => {
      const refreshHealth = vi.fn(async () => undefined);
      const server = await startExecutorHttpServer({
        rpc: rpc(),
        config: { mode, host: '127.0.0.1', port: 0 },
        refreshHealth,
        authorizeHealth: () => false,
      });
      try {
        expect(refreshHealth).toHaveBeenCalledTimes(mode === 'dispatcher' ? 1 : 0);
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
        const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
        expect(response.status).toBe(mode === 'executor' ? 401 : 200);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close(error => (error ? reject(error) : resolve()))
        );
      }
    }
  );

  it('keeps the public callback service unable to run private task and scheduler actions', async () => {
    const server = createExecutorServer({
      rpc: rpc(),
      config: { mode: 'callbacks' },
      authorizeTask: () => true,
      authorizeDispatch: () => true,
    });
    for (const path of ['/tasks/advance', '/dispatch']) {
      expect(
        (
          await server.handleRequest(
            new Request(`https://callback.test${path}`, { method: 'POST', body: '{}' })
          )
        ).status
      ).toBe(404);
    }
  });

  it('publishes a named OIDC Cloud Task with the documented REST body', async () => {
    const transport = vi.fn(async () => Response.json({}));
    await createCloudTasksPublisher({
      queueName: 'projects/p/locations/r/queues/q',
      targetUrl: 'https://executor.run.app',
      audience: 'https://executor.run.app',
      serviceAccountEmail: 'tasks@p.iam.gserviceaccount.com',
      accessToken: 'test',
      fetch: transport,
    }).publish({ outboxId: '12', jobId, action: 'advance', generation: 1 });
    const [url, init] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cloudtasks.googleapis.com/v2/projects/p/locations/r/queues/q/tasks');
    const body = JSON.parse(String(init.body));
    expect(body.task.name).toBe('projects/p/locations/r/queues/q/tasks/upscale-12-1');
    expect(body.name).toBeUndefined();
    expect(body.task.dispatchDeadline).toBe('900s');
    expect(body.task.httpRequest.oidcToken).toEqual({
      audience: 'https://executor.run.app',
      serviceAccountEmail: 'tasks@p.iam.gserviceaccount.com',
    });
  });
  it('requires the task bearer token before advancing work', async () => {
    const database = rpc({ getExecution: vi.fn(async () => null) });
    const server = createExecutorServer({
      rpc: database,
      config: { mode: 'executor' },
      authorizeTask: request => request.headers.get('x-executor-task-token') === 'task-secret',
    });

    const response = await server.handleRequest(
      new Request('http://executor.test/tasks/advance', {
        method: 'POST',
        body: JSON.stringify({ jobId, action: 'advance' }),
      })
    );

    expect(response.status).toBe(401);
    expect(database.getExecution).not.toHaveBeenCalled();
  });

  it('records an ambiguous provider create as unknown instead of retrying create', async () => {
    const database = rpc();
    const provider = {
      providerName: 'replicate',
      createPrediction: vi.fn(async () => {
        throw Object.assign(new Error('provider request timed out'), { ambiguous: true });
      }),
      getPrediction: vi.fn(),
      findPredictionForAttempt: vi.fn(),
      matchesAttempt: vi.fn(() => true),
    };

    const result = await advanceExecution(
      { jobId, action: 'advance' },
      {
        rpc: database,
        provider,
        inputResolver: { resolve: vi.fn(async () => 'https://storage.test/input.png') },
        clock: { now: () => Date.parse('2026-01-01T00:00:00.000Z') },
      }
    );

    expect(result).toMatchObject({ disposition: 'ack', stage: 'submission_unknown' });
    expect(provider.createPrediction).toHaveBeenCalledTimes(1);
    expect(database.markSubmissionUnknown).toHaveBeenCalledWith({
      jobId,
      attemptId,
      failureReason: 'provider request timed out',
    });
  });

  it('streams output within the byte bound to a deterministic attempt-owned object path', async () => {
    const upload = vi.fn(async (_path: string, body: ReadableStream<Uint8Array>) => {
      const bytes = await new Response(body).arrayBuffer();
      expect(bytes.byteLength).toBe(32);
    });
    const stager = createStreamingOutputStager({
      storage: {
        upload,
        stat: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue({ sizeBytes: 32, mimeType: 'image/png' }),
      },
      fetch: vi.fn(
        async () =>
          new Response(
            Uint8Array.from([
              137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0,
              0, 0, 0, 0, 0, 0,
            ]),
            {
              status: 200,
              headers: { 'content-type': 'image/png', 'content-length': '32' },
            }
          )
      ),
      maxBytes: 64,
      now: () => Date.parse('2026-01-01T00:00:00.000Z'),
      allowedHosts: ['replicate.delivery'],
    });

    const result = await stager.stage(
      execution({
        user_id: '33333333-3333-4333-8333-333333333333',
        stage: 'staging',
      }),
      attempt({
        submission_state: 'terminal',
        provider_output_url: 'https://replicate.delivery/output.png',
      })
    );

    expect(upload).toHaveBeenCalledWith(
      `${execution().user_id}/outputs/${jobId}/${attemptId}.png`,
      expect.any(ReadableStream),
      expect.objectContaining({ contentType: 'image/png', upsert: false })
    );
    expect(result).toMatchObject({
      storagePath: `${execution().user_id}/outputs/${jobId}/${attemptId}.png`,
      mimeType: 'image/png',
      sizeBytes: 32,
    });
  });

  it('schedules a fresh poll generation when a published task sees a nonterminal prediction', async () => {
    const scheduleAction = vi.fn(async () => true);
    const database = rpc({
      getExecution: vi.fn(async () => execution({ stage: 'processing', lease_generation: 3 })),
      getActiveAttempt: vi.fn(async () =>
        attempt({
          submission_state: 'accepted',
          provider_prediction_id: 'prediction-1',
        })
      ),
      scheduleAction,
    });
    const provider = {
      providerName: 'replicate',
      createPrediction: vi.fn(),
      getPrediction: vi.fn(async () => ({
        id: 'prediction-1',
        status: 'processing',
      })),
      findPredictionForAttempt: vi.fn(),
      matchesAttempt: vi.fn(() => true),
    };
    const server = createExecutorServer({
      rpc: database,
      provider,
      inputResolver: { resolve: vi.fn(async () => 'https://storage.test/input.png') },
      config: { mode: 'executor' },
      authorizeTask: request => request.headers.get('x-executor-task-token') === 'task-secret',
      now: () => Date.parse('2026-01-01T00:00:00.000Z'),
    });

    const response = await server.handleRequest(
      new Request('http://executor.test/tasks/advance', {
        method: 'POST',
        headers: { 'X-Executor-Task-Token': 'task-secret' },
        body: JSON.stringify({
          jobId,
          action: 'poll',
          generation: 3,
          outboxId: '12',
          claimant: 'dispatcher-a',
        }),
      })
    );

    expect(response.status).toBe(202);
    expect(scheduleAction).toHaveBeenCalledWith({
      jobId,
      action: 'poll',
      dueAt: expect.any(String),
      expectedGeneration: 3,
    });
    expect(database.retryOutbox).not.toHaveBeenCalled();
    expect(database.acknowledgeOutbox).not.toHaveBeenCalled();
  });

  it('does not mutate publishing claims when another generation already scheduled the retry', async () => {
    const database = rpc({
      getExecution: vi.fn(async () => execution({ stage: 'processing', lease_generation: 3 })),
      getActiveAttempt: vi.fn(async () =>
        attempt({ submission_state: 'accepted', provider_prediction_id: 'prediction-1' })
      ),
      scheduleAction: vi.fn(async () => false),
      retryOutbox: vi.fn(async () => true),
    });
    const provider = {
      providerName: 'replicate',
      createPrediction: vi.fn(),
      getPrediction: vi.fn(async () => ({ id: 'prediction-1', status: 'processing' })),
      findPredictionForAttempt: vi.fn(),
      matchesAttempt: vi.fn(() => true),
    };
    const server = createExecutorServer({
      rpc: database,
      provider,
      inputResolver: { resolve: vi.fn(async () => 'https://storage.test/input.png') },
      config: { mode: 'executor' },
      authorizeTask: request => request.headers.get('x-executor-task-token') === 'task-secret',
      now: () => Date.parse('2026-01-01T00:00:00.000Z'),
    });

    const response = await server.handleRequest(
      new Request('http://executor.test/tasks/advance', {
        method: 'POST',
        headers: { 'X-Executor-Task-Token': 'task-secret' },
        body: JSON.stringify({
          jobId,
          action: 'poll',
          generation: 3,
          outboxId: '12',
          claimant: 'dispatcher-a',
        }),
      })
    );

    expect(response.status).toBe(202);
    expect(database.retryOutbox).not.toHaveBeenCalled();
    expect(database.acknowledgeOutbox).not.toHaveBeenCalled();
  });
});
