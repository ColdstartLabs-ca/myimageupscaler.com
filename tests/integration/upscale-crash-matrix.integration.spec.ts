import { test, expect } from '@playwright/test';
import { startUpscalePostgres, type IUpscalePostgres } from '../helpers/upscale-postgres';
import {
  startHttpFixture,
  callbackHeaders,
  type IHttpFixture,
} from '../../services/upscale-executor/testing/http-fixture';
import {
  launchExecutor,
  admitFixture,
  task,
  jobStage,
  dispatch,
  predictionForJob,
  finishAndStage,
  readAndAcknowledge,
  ledgerOutcome,
  type IExecutorProcess,
} from '../../services/upscale-executor/testing/executor-harness';

const CHECKPOINTS = [
  'admission_commit',
  'attempt_persisted',
  'provider_accepted',
  'prediction_bound',
  'task_published',
  'output_staged',
  'settlement_committed',
] as const;

test.describe('real PostgreSQL and HTTP process crash matrix', () => {
  let pg: IUpscalePostgres;
  let http: IHttpFixture;
  const processes: IExecutorProcess[] = [];
  const launch = async (mode = 'executor', checkpoint = '') => {
    const child = await launchExecutor(pg, http, mode, checkpoint);
    processes.push(child);
    return child;
  };
  test.beforeAll(async () => {
    pg = await startUpscalePostgres({ executorReady: true });
    http = await startHttpFixture();
  });
  test.afterAll(async () => {
    await Promise.all(processes.map(child => child.stop()));
    await http?.close();
    await pg?.stop();
  });

  for (const checkpoint of CHECKPOINTS) {
    test(`survives SIGKILL at ${checkpoint} without a second external create or split settlement`, async () => {
      const { jobId, userId } = await admitFixture(pg);
      const createsBefore = http.creates;
      const dying = await launch(
        checkpoint === 'task_published' ? 'dispatcher' : 'executor',
        checkpoint
      );
      if (checkpoint === 'output_staged') {
        const setup = await launch();
        expect((await task(setup, pg, jobId)).ok).toBe(true);
        const { prediction } = await predictionForJob(pg, http, jobId);
        http.finish(prediction!.id);
        expect((await task(setup, pg, jobId, 'poll')).ok).toBe(true);
      }
      if (checkpoint === 'settlement_committed')
        await pg.db.query(
          "UPDATE public.upscale_executions SET deadline_at=now()-interval '1 second' WHERE job_id=$1",
          [jobId]
        );
      const pending = (
        checkpoint === 'task_published' ? dispatch(dying) : task(dying, pg, jobId)
      ).catch(() => null);
      await expect.poll(() => dying.checkpoints.has(checkpoint), { timeout: 15_000 }).toBe(true);
      await dying.stop();
      await pending;
      const restarted = await launch();

      if (checkpoint === 'attempt_persisted' || checkpoint === 'settlement_committed') {
        await pg.db.query(
          "UPDATE public.upscale_executions SET deadline_at=now()-interval '1 second' WHERE job_id=$1",
          [jobId]
        );
        const duplicates = await Promise.all(
          Array.from({ length: 20 }, () => task(restarted, pg, jobId))
        );
        expect(
          duplicates.every(response => response.ok),
          JSON.stringify(
            await Promise.all(
              duplicates
                .filter(response => !response.ok)
                .map(async response => ({ status: response.status, body: await response.text() }))
            )
          )
        ).toBe(true);
        expect(await ledgerOutcome(pg, userId, jobId)).toEqual({
          stage: 'expired',
          reservation_status: 'refunded',
          subscription: 30,
          purchased: 20,
          refunds: 1,
        });
        expect(
          (
            await pg.db.query('SELECT * FROM public.acquire_upscale_delivery_lease($1,$2,$3,120)', [
              userId,
              jobId,
              'a'.repeat(64),
            ])
          ).rows
        ).toHaveLength(0);
        expect(http.creates - createsBefore).toBe(0);
        return;
      }
      if (checkpoint === 'provider_accepted') {
        const { attempt, prediction } = await predictionForJob(pg, http, jobId);
        http.finish(prediction!.id);
        const callbacks = await launch('callbacks');
        const body = JSON.stringify({ id: prediction!.id });
        const responses = await Promise.all(
          Array.from({ length: 20 }, () =>
            fetch(
              `${callbacks.url}/webhooks/replicate?correlation=${attempt.callback_correlation}`,
              { method: 'POST', headers: callbackHeaders(body), body }
            )
          )
        );
        expect(responses.every(response => response.ok)).toBe(true);
      } else if (checkpoint === 'admission_commit' || checkpoint === 'task_published') {
        if (checkpoint === 'task_published') {
          await pg.db.query(
            "UPDATE public.upscale_outbox SET claim_expires_at=now()-interval '1 second' WHERE job_id=$1",
            [jobId]
          );
          const dispatcher = await launch('dispatcher');
          expect((await dispatch(dispatcher)).ok).toBe(true);
        }
        expect((await task(restarted, pg, jobId)).ok).toBe(true);
      }
      await finishAndStage(restarted, pg, http, jobId);
      expect(await jobStage(pg, jobId)).toBe('ready');
      expect(http.creates - createsBefore).toBe(1);
      expect(await readAndAcknowledge(pg, http, userId, jobId)).toBe(true);
      const duplicates = await Promise.all(
        Array.from({ length: 20 }, () => task(restarted, pg, jobId))
      );
      expect(
        duplicates.every(response => response.ok),
        JSON.stringify(
          await Promise.all(
            duplicates
              .filter(response => !response.ok)
              .map(async response => ({ status: response.status, body: await response.text() }))
          )
        )
      ).toBe(true);
      expect(await ledgerOutcome(pg, userId, jobId)).toEqual({
        stage: 'completed',
        reservation_status: 'completed',
        subscription: 27,
        purchased: 20,
        refunds: 0,
      });
    });
  }
});
