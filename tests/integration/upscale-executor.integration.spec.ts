import { test, expect } from '@playwright/test';
import { startUpscalePostgres, type IUpscalePostgres } from '../helpers/upscale-postgres';
import {
  startHttpFixture,
  taskToken,
  callbackHeaders,
  type IHttpFixture,
} from '../../services/upscale-executor/testing/http-fixture';

import {
  launchExecutor,
  admitFixture,
  task,
  jobStage,
  type IExecutorProcess,
} from '../../services/upscale-executor/testing/executor-harness';

test.describe('real HTTP executor and PostgreSQL ledger', () => {
  let pg: IUpscalePostgres;
  let http: IHttpFixture;
  let executor: IExecutorProcess;
  let callback: IExecutorProcess;
  test.beforeAll(async () => {
    pg = await startUpscalePostgres({ executorReady: true });
    http = await startHttpFixture();
    executor = await launchExecutor(pg, http);
    callback = await launchExecutor(pg, http, 'callbacks');
  });
  test.afterAll(async () => {
    await executor?.stop();
    await callback?.stop();
    await http?.close();
    await pg?.stop();
  });
  test('recovers prediction identity when the create response is lost and ignores 20 duplicate callbacks', async () => {
    const { jobId } = await admitFixture(pg);
    http.dropNextCreate = true;
    expect((await task(executor, pg, jobId)).status).toBe(200);
    expect(await jobStage(pg, jobId)).toBe('submission_unknown');
    const attempt = (
      await pg.db.query('SELECT * FROM public.upscale_attempts WHERE job_id=$1', [jobId])
    ).rows[0];
    const prediction = [...http.predictions.values()].find(value =>
      value.webhook.includes(attempt.callback_correlation)
    )!;
    http.finish(prediction.id);
    const body = JSON.stringify({ id: prediction.id });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        fetch(`${callback.url}/webhooks/replicate?correlation=${attempt.callback_correlation}`, {
          method: 'POST',
          headers: callbackHeaders(body),
          body,
        })
      )
    );
    expect(
      results.every(response => response.ok),
      JSON.stringify(
        await Promise.all(
          results
            .filter(response => !response.ok)
            .map(async response => ({ status: response.status, body: await response.text() }))
        )
      )
    ).toBe(true);
    expect(await jobStage(pg, jobId)).toBe('staging');
    expect((await task(executor, pg, jobId)).ok).toBe(true);
    expect(await jobStage(pg, jobId)).toBe('ready');
    expect(http.uploads).toBe(1);
    expect(
      (
        await pg.db.query(
          'SELECT count(*)::int AS n FROM public.upscale_attempts WHERE job_id=$1',
          [jobId]
        )
      ).rows[0].n
    ).toBe(1);
    expect(
      (
        await pg.db.query(
          'SELECT status FROM public.processing_credit_reservations WHERE job_id=$1',
          [jobId]
        )
      ).rows[0].status
    ).toBe('processing');
  });
  test('rejects unsigned callbacks and wrong-audience task tokens before state changes', async () => {
    const { jobId } = await admitFixture(pg);
    expect(
      (
        await fetch(`${executor.url}/tasks/advance`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${taskToken({ aud: 'https://wrong.test' })}` },
          body: JSON.stringify({ jobId, action: 'advance', generation: 0 }),
        })
      ).status
    ).toBe(401);
    expect(
      (
        await fetch(`${callback.url}/webhooks/replicate?correlation=wrong`, {
          method: 'POST',
          body: JSON.stringify({ id: 'prediction' }),
        })
      ).status
    ).toBe(401);
    expect(await jobStage(pg, jobId)).toBe('queued');
  });
  test('allows only one external create under 20 simultaneous same-job HTTP tasks', async () => {
    const { jobId } = await admitFixture(pg);
    const before = http.creates;
    const results = await Promise.all(
      Array.from({ length: 20 }, () => task(executor, pg, jobId, 'advance'))
    );
    expect(
      results.every(response => response.ok),
      JSON.stringify(
        await Promise.all(
          results
            .filter(response => !response.ok)
            .map(async response => ({ status: response.status, body: await response.text() }))
        )
      )
    ).toBe(true);
    expect(http.creates - before).toBe(1);
    expect(
      (
        await pg.db.query(
          'SELECT count(*)::int AS n FROM public.processing_credit_reservations WHERE job_id=$1',
          [jobId]
        )
      ).rows[0].n
    ).toBe(1);
  });
});
