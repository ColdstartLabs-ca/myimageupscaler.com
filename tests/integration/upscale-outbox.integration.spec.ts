import { test, expect } from '@playwright/test';
import { startUpscalePostgres, type IUpscalePostgres } from '../helpers/upscale-postgres';
import {
  startHttpFixture,
  type IHttpFixture,
} from '../../services/upscale-executor/testing/http-fixture';
import {
  launchExecutor,
  admitFixture,
  dispatch,
  deliverPublishedTask,
  finishAndStage,
  readAndAcknowledge,
  ledgerOutcome,
  type IExecutorProcess,
} from '../../services/upscale-executor/testing/executor-harness';

test.describe('real HTTP outbox publication and recovery', () => {
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

  test('publishes a committed job after a lost wake and settles once after duplicate task delivery', async () => {
    const { jobId, userId } = await admitFixture(pg);
    const dispatcher = await launch('dispatcher');
    const executor = await launch();
    const result = await dispatch(dispatcher);
    expect(result.ok).toBe(true);
    expect(await result.json()).toMatchObject({ published: 1, acknowledged: 1 });
    const published = [...http.tasks.values()].at(-1)!;
    const before = http.creates;
    const results = await Promise.all(
      Array.from({ length: 20 }, () => deliverPublishedTask(executor, published))
    );
    expect(results.every(response => response.ok)).toBe(true);
    expect(http.creates - before).toBe(1);
    await finishAndStage(executor, pg, http, jobId);
    expect(await readAndAcknowledge(pg, http, userId, jobId)).toBe(true);
    expect(await ledgerOutcome(pg, userId, jobId)).toEqual({
      stage: 'completed',
      reservation_status: 'completed',
      subscription: 27,
      purchased: 20,
      refunds: 0,
    });
  });

  test('recovers after publication succeeds but the dispatcher dies before acknowledgement', async () => {
    const { jobId } = await admitFixture(pg);
    const dying = await launch('dispatcher', 'task_published');
    const pending = dispatch(dying).catch(() => null);
    await expect.poll(() => dying.checkpoints.has('task_published')).toBe(true);
    const taskCount = http.tasks.size;
    await dying.stop();
    await pending;
    await pg.db.query(
      "UPDATE public.upscale_outbox SET claim_expires_at=now()-interval '1 second' WHERE job_id=$1 AND published_at IS NULL",
      [jobId]
    );
    const restarted = await launch('dispatcher');
    const result = await dispatch(restarted);
    expect(result.ok).toBe(true);
    expect(await result.json()).toMatchObject({ published: 1, acknowledged: 1 });
    expect(http.tasks.size).toBe(taskCount);
    expect(
      (
        await pg.db.query(
          'SELECT count(*)::int AS n FROM public.upscale_outbox WHERE job_id=$1 AND published_at IS NOT NULL',
          [jobId]
        )
      ).rows[0].n
    ).toBe(1);
  });

  test('persists a failed task publication and republishes the same due row', async () => {
    const { jobId } = await admitFixture(pg);
    const dispatcher = await launch('dispatcher');
    http.failTaskPublish = true;
    const failure = await dispatch(dispatcher);
    expect(failure.ok).toBe(true);
    expect(await failure.json()).toMatchObject({ retried: 1, acknowledged: 0 });
    const row = (await pg.db.query('SELECT * FROM public.upscale_outbox WHERE job_id=$1', [jobId]))
      .rows[0];
    expect(row.published_at).toBeNull();
    expect(row.last_error).toContain('503');
    http.failTaskPublish = false;
    await pg.db.query(
      "UPDATE public.upscale_outbox SET due_at=now()-interval '1 second' WHERE job_id=$1",
      [jobId]
    );
    const recovered = await dispatch(dispatcher);
    expect(await recovered.json()).toMatchObject({ published: 1, acknowledged: 1 });
  });
});
