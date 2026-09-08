import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ModelRegistry } from '@server/services/model-registry';
import {
  createUpscaleUser,
  admitUpscale,
  type IUpscalePostgres,
} from '../../../tests/helpers/upscale-postgres';
import {
  taskToken,
  OIDC_PUBLIC_KEY,
  type IHttpFixture,
  type IFixturePrediction,
} from './http-fixture';

export interface IExecutorProcess {
  child: ChildProcess;
  url: string;
  checkpoints: Set<string>;
  errors: string[];
  stop(): Promise<void>;
}
interface IUpscaleAttemptRecord {
  callback_correlation: string;
}
interface IJobOutcome {
  stage: string;
  reservation_status: string;
  subscription: number;
  purchased: number;
  refunds: number;
}
export async function launchExecutor(
  pg: IUpscalePostgres,
  http: IHttpFixture,
  mode = 'executor',
  checkpoint = ''
): Promise<IExecutorProcess> {
  const child = fork(
    'services/upscale-executor/testing/executor-process.ts',
    [
      pg.connectionString,
      http.origin,
      Buffer.from(OIDC_PUBLIC_KEY).toString('base64'),
      mode,
      checkpoint,
    ],
    { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
  );
  const checkpoints = new Set<string>();
  const errors: string[] = [];
  child.stderr?.on('data', chunk => errors.push(String(chunk)));
  child.on('message', (value: unknown) => {
    if (value && typeof value === 'object' && 'checkpoint' in value)
      checkpoints.add(String(value.checkpoint));
  });
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Executor start timeout: ${errors.join('')}`)),
      15_000
    );
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Executor exited ${code}: ${errors.join('')}`));
    });
    child.on('message', (value: unknown) => {
      if (value && typeof value === 'object' && 'ready' in value) {
        clearTimeout(timer);
        resolve(String(value.ready));
      }
    });
  });
  return {
    child,
    url,
    checkpoints,
    errors,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode) return;
      const stopped = new Promise<void>(resolve => child.once('exit', () => resolve()));
      child.kill('SIGKILL');
      await stopped;
    },
  };
}
export async function admitFixture(
  pg: IUpscalePostgres,
  modelId = 'real-esrgan'
): Promise<{ userId: string; jobId: string }> {
  const userId = await createUpscaleUser(pg.db, 30, 20);
  const jobId = randomUUID();
  const model = ModelRegistry.getInstance().getModel(modelId)!;
  const admission = await admitUpscale(pg.db, userId, jobId, {
    modelId,
    config: { qualityTier: 'quick', scale: 2, additionalOptions: {} },
  });
  if (admission.result_code !== 'admitted')
    throw new Error(`Fixture admission failed: ${admission.result_code}`);
  await pg.db.query('UPDATE public.upscale_executions SET model_version=$2 WHERE job_id=$1', [
    jobId,
    model.modelVersion,
  ]);
  return { userId, jobId };
}
export async function task(
  executor: IExecutorProcess,
  pg: IUpscalePostgres,
  jobId: string,
  action?: string
): Promise<Response> {
  const row = (
    await pg.db.query(
      'SELECT next_action,lease_generation FROM public.upscale_executions WHERE job_id=$1',
      [jobId]
    )
  ).rows[0];
  return fetch(`${executor.url}/tasks/advance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${taskToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      jobId,
      action: action ?? row.next_action ?? 'advance',
      generation: Number(row.lease_generation),
    }),
  });
}
export async function jobStage(pg: IUpscalePostgres, jobId: string): Promise<string> {
  return (await pg.db.query('SELECT stage FROM public.upscale_executions WHERE job_id=$1', [jobId]))
    .rows[0]?.stage;
}

export async function dispatch(executor: IExecutorProcess): Promise<Response> {
  return fetch(`${executor.url}/dispatch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${taskToken()}`, 'content-type': 'application/json' },
    body: '{}',
  });
}

export async function deliverPublishedTask(
  executor: IExecutorProcess,
  published: Record<string, unknown>
): Promise<Response> {
  const request = published.httpRequest as { body: string };
  return fetch(`${executor.url}/tasks/advance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${taskToken()}`, 'content-type': 'application/json' },
    body: Buffer.from(request.body, 'base64').toString(),
  });
}

export async function predictionForJob(
  pg: IUpscalePostgres,
  http: IHttpFixture,
  jobId: string
): Promise<{ attempt: IUpscaleAttemptRecord; prediction: IFixturePrediction | undefined }> {
  const attempt = (
    await pg.db.query(
      'SELECT * FROM public.upscale_attempts WHERE job_id=$1 ORDER BY ordinal DESC LIMIT 1',
      [jobId]
    )
  ).rows[0];
  if (!attempt) throw new Error('Provider attempt not found');
  return {
    attempt,
    prediction: [...http.predictions.values()].find(item =>
      item.webhook.includes(attempt.callback_correlation)
    ),
  };
}

export async function finishAndStage(
  executor: IExecutorProcess,
  pg: IUpscalePostgres,
  http: IHttpFixture,
  jobId: string
): Promise<void> {
  const { prediction } = await predictionForJob(pg, http, jobId);
  if (!prediction) throw new Error('Provider prediction not found');
  http.finish(prediction.id);
  for (let attempt = 0; attempt < 4 && (await jobStage(pg, jobId)) !== 'ready'; attempt += 1) {
    const stage = await jobStage(pg, jobId);
    const response = await task(
      executor,
      pg,
      jobId,
      stage === 'staging' ? 'stage' : stage === 'submission_unknown' ? 'reconcile' : 'poll'
    );
    if (!response.ok)
      throw new Error(`Advance returned ${response.status}: ${await response.text()}`);
  }
}

export async function readAndAcknowledge(
  pg: IUpscalePostgres,
  http: IHttpFixture,
  userId: string,
  jobId: string
): Promise<boolean> {
  const hash = 'a'.repeat(64);
  await pg.db.query('SELECT * FROM public.issue_upscale_delivery_capability($1,$2,$3)', [
    userId,
    jobId,
    hash,
  ]);
  const lease = await pg.db.query(
    'SELECT * FROM public.acquire_upscale_delivery_lease($1,$2,$3,120)',
    [userId, jobId, hash]
  );
  if (lease.rows.length !== 1) throw new Error('Ready output lease missing');
  const row = (
    await pg.db.query('SELECT * FROM public.upscale_executions WHERE job_id=$1', [jobId])
  ).rows[0];
  const response = await fetch(
    `${http.origin}/objects/${encodeURIComponent(row.output_storage_path)}`
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !bytes.equals(http.outputBytes))
    throw new Error('Staged output bytes do not match provider');
  return (
    await pg.db.query('SELECT public.acknowledge_upscale_execution($1,$2,$3,$4,$5) AS ok', [
      userId,
      jobId,
      row.output_storage_path,
      row.output_mime_type,
      hash,
    ])
  ).rows[0].ok;
}

export async function ledgerOutcome(
  pg: IUpscalePostgres,
  userId: string,
  jobId: string
): Promise<IJobOutcome | undefined> {
  return (
    await pg.db.query(
      `SELECT e.stage,r.status AS reservation_status,p.subscription_credits_balance AS subscription,p.purchased_credits_balance AS purchased,
    (SELECT count(*)::int FROM public.credit_transactions t WHERE t.user_id=$1 AND t.type='refund') AS refunds
    FROM public.upscale_executions e JOIN public.processing_credit_reservations r USING(job_id)
    JOIN public.profiles p ON p.id=e.user_id WHERE e.job_id=$2`,
      [userId, jobId]
    )
  ).rows[0];
}
