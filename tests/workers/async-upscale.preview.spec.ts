import { expect, test } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  ASYNC_RUNTIME_ARTIFACTS,
  startAsyncUpscaleRuntime,
  type IAsyncUpscaleRuntime,
} from '../helpers/async-upscale-runtime';

const INPUT_BYTES = 25 * 1024 * 1024;
const OUTPUT_BYTES = 25 * 1024 * 1024;
// Largest decoded GET response among the 12 historical Real-ESRGAN predictions
// inspected read-only. Fresh Clarity and large-ESRGAN payload evidence is pending.
const METADATA_BYTES = 5241;
const INITIAL_SUBSCRIPTION_CREDITS = 100;
const INITIAL_PURCHASED_CREDITS = 10;
const EARLY_RESPONSE_CONTROL = 'ASYNC_RUNTIME_EARLY_RESPONSE_CONTROL';

interface IWorkload {
  label: string;
  width: number;
  height: number;
  scale: 2 | 4;
  model: string;
  premiumModels: boolean;
}

const WORKLOADS: IWorkload[] = [
  {
    label: 'quick-2x-clarity',
    width: 2048,
    height: 2048,
    scale: 2,
    model: 'clarity-upscaler',
    premiumModels: true,
  },
  {
    label: 'quick-4x-esrgan',
    width: 1500,
    height: 1000,
    scale: 4,
    model: 'real-esrgan',
    premiumModels: true,
  },
];

interface IJob {
  id: string;
  user: { id: string; accessToken: string };
  body: Record<string, unknown>;
}

interface IFinancialState {
  job_id: string;
  status: string;
  amount: number;
  consumed_subscription: number;
  consumed_purchased: number;
  execution_mode: string | null;
  resolved_model: string | null;
  quality_tier: string | null;
  provider_phase: string | null;
  subscription_credits_balance: number;
  purchased_credits_balance: number;
  usage_count: number;
  usage_amount: number;
  refund_count: number;
  refund_amount: number;
  telemetry_model: string | null;
  telemetry_scale: number | null;
  telemetry_credits: number | null;
}

interface ITransport {
  success?: boolean;
  status?: string;
  retryAfterMs?: number;
  mimeType?: string;
  dimensions?: {
    input: { width: number; height: number };
    output: { width: number; height: number };
    actualScale: number;
  };
  processing?: {
    modelUsed: string;
    creditsUsed: number;
    creditsRemaining: number;
    reservationJobId: string;
    deliveryToken: string;
  };
}

interface IJobOutcome {
  jobId: string;
  admissionStatus: number;
  admissionMs: number;
  statusRequests: number;
  terminalStatus?: number;
  model?: string;
  creditsUsed?: number;
  dimensions?: ITransport['dimensions'];
  beforeOutput?: IFinancialState;
  duringOutput?: IFinancialState;
  finalState?: IFinancialState;
  output?: { bytes: number; sha256: string; width: number; height: number; readMs: number };
  error?: string;
}

interface IDriveJobOptions {
  deferFirstObservation?: boolean;
}

type IHeapSample = Awaited<ReturnType<IAsyncUpscaleRuntime['inspector']['sample']>>;

interface ICohort {
  subject: string;
  artifact: IAsyncUpscaleRuntime['artifact'];
  label: string;
  workload: IWorkload;
  providerDelayMs: number;
  overlap: number;
  baselineHeap: IHeapSample;
  waitingHeap: Array<IHeapSample & { elapsedMs: number }>;
  medianRetainedJavaScriptHeapBytes: number;
  incrementalRetainedJavaScriptHeapBytes: number;
  snapshotRetainedJavaScriptHeapBytes: number;
  admissions: { p95Ms: number; p99Ms: number };
  jobs: IJobOutcome[];
  calls: IAsyncUpscaleRuntime['calls'];
  invocations: IAsyncUpscaleRuntime['invocations'];
  profiles: { cpu: string; heap: string; snapshot: string };
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) throw new Error('No measurements were collected');
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function snapshotRetainedJavaScriptHeapBytes(snapshot: unknown): number {
  const value = snapshot as {
    snapshot?: { meta?: { node_fields?: string[]; node_types?: string[][] } };
    nodes?: number[];
  };
  const fields = value.snapshot?.meta?.node_fields;
  const nodeTypes = value.snapshot?.meta?.node_types;
  const nodes = value.nodes;
  const typeIndex = fields?.indexOf('type') ?? -1;
  const selfSizeIndex = fields?.indexOf('self_size') ?? -1;
  const types = typeIndex >= 0 ? nodeTypes?.[typeIndex] : undefined;
  if (
    !fields ||
    !nodeTypes ||
    !nodes ||
    typeIndex < 0 ||
    selfSizeIndex < 0 ||
    !types ||
    fields.length === 0 ||
    nodes.length % fields.length !== 0
  ) {
    throw new Error('Heap snapshot has an unexpected V8 node layout');
  }
  let retained = 0;
  for (let offset = 0; offset < nodes.length; offset += fields.length) {
    if (types[nodes[offset + typeIndex]] !== 'native')
      retained += nodes[offset + selfSizeIndex] ?? 0;
  }
  return retained;
}

async function saveEvidence(label: string, evidence: unknown): Promise<void> {
  await mkdir(ASYNC_RUNTIME_ARTIFACTS, { recursive: true });
  await writeFile(
    join(ASYNC_RUNTIME_ARTIFACTS, `${label}.json`),
    JSON.stringify(evidence, null, 2)
  );
}

async function prepareJob(runtime: IAsyncUpscaleRuntime, workload: IWorkload): Promise<IJob> {
  const user = await runtime.createUser({
    tier: 'pro',
    subscriptionCredits: INITIAL_SUBSCRIPTION_CREDITS,
    purchasedCredits: INITIAL_PURCHASED_CREDITS,
  });
  const id = randomUUID();
  const storagePath = runtime.putInput({
    userId: user.id,
    jobId: id,
    width: workload.width,
    height: workload.height,
    bytes: INPUT_BYTES,
  });
  return {
    id,
    user,
    body: {
      jobId: id,
      storagePath,
      mimeType: 'image/png',
      config: { qualityTier: 'quick', scale: workload.scale },
    },
  };
}

async function financialState(
  runtime: IAsyncUpscaleRuntime,
  job: IJob
): Promise<IFinancialState | undefined> {
  const result = await runtime.database.pool.query<IFinancialState>(
    `SELECT r.job_id, r.status, r.amount, r.consumed_subscription, r.consumed_purchased,
      r.execution_mode, r.resolved_model, r.quality_tier, r.provider_phase,
      p.subscription_credits_balance, p.purchased_credits_balance,
      (SELECT count(*)::int FROM credit_transactions t
        WHERE t.user_id = r.user_id AND t.reference_id = r.job_id::text AND t.type = 'usage') AS usage_count,
      (SELECT coalesce(sum(t.amount), 0)::int FROM credit_transactions t
        WHERE t.user_id = r.user_id AND t.reference_id = r.job_id::text AND t.type = 'usage') AS usage_amount,
      (SELECT count(*)::int FROM credit_transactions t
        WHERE t.user_id = r.user_id AND t.type = 'refund') AS refund_count,
      (SELECT coalesce(sum(t.amount), 0)::int FROM credit_transactions t
        WHERE t.user_id = r.user_id AND t.type = 'refund') AS refund_amount,
      (SELECT j.model_id FROM processing_jobs j
        WHERE j.user_id = r.user_id AND j.status = 'completed' ORDER BY j.created_at DESC LIMIT 1) AS telemetry_model,
      (SELECT j.scale FROM processing_jobs j
        WHERE j.user_id = r.user_id AND j.status = 'completed' ORDER BY j.created_at DESC LIMIT 1) AS telemetry_scale,
      (SELECT j.credits_charged FROM processing_jobs j
        WHERE j.user_id = r.user_id AND j.status = 'completed' ORDER BY j.created_at DESC LIMIT 1) AS telemetry_credits
     FROM processing_credit_reservations r JOIN profiles p ON p.id = r.user_id
     WHERE r.job_id = $1 AND r.user_id = $2`,
    [job.id, job.user.id]
  );
  return result.rows[0];
}

async function driveJob(
  runtime: IAsyncUpscaleRuntime,
  job: IJob,
  providerDelayMs: number,
  options: IDriveJobOptions = {}
): Promise<IJobOutcome> {
  const startedAt = Date.now();
  const outcome: IJobOutcome = {
    jobId: job.id,
    admissionStatus: 0,
    admissionMs: 0,
    statusRequests: 0,
  };
  try {
    let response = await runtime.request(job.user, '/api/upscale', job.body);
    outcome.admissionMs = Date.now() - startedAt;
    outcome.admissionStatus = response.status;
    let body = (await response.json()) as ITransport;
    const deadline = startedAt + providerDelayMs + 60_000;
    let firstObservation = true;
    while (response.status === 202) {
      if (Date.now() >= deadline)
        throw new Error('Status did not become ready before the fixture deadline');
      const regularDelay = Math.max(1000, Math.min(body.retryAfterMs ?? 3000, 10_000));
      const deferredDelay = Math.max(1000, providerDelayMs + 1000 - (Date.now() - startedAt));
      await delay(options.deferFirstObservation && firstObservation ? deferredDelay : regularDelay);
      firstObservation = false;
      response = await runtime.request(job.user, `/api/upscale?jobId=${job.id}`);
      outcome.statusRequests++;
      body = (await response.json()) as ITransport;
    }
    outcome.terminalStatus = response.status;
    if (response.status !== 200 || !body.success || !body.processing) {
      outcome.error = `Upscale ended with HTTP ${response.status}`;
      return outcome;
    }
    outcome.model = body.processing.modelUsed;
    outcome.creditsUsed = body.processing.creditsUsed;
    outcome.dimensions = body.dimensions;
    outcome.beforeOutput = await financialState(runtime, job);
    const outputStartedAt = Date.now();
    const output = await runtime.request(job.user, '/api/upscale/output', {
      reservationJobId: body.processing.reservationJobId,
      deliveryToken: body.processing.deliveryToken,
    });
    if (output.status !== 200 || !output.body) {
      throw new Error(`Output ended with HTTP ${output.status}`);
    }
    if (output.headers.get('content-type')?.split(';')[0] !== 'image/png') {
      throw new Error('Output did not preserve its PNG content type');
    }
    const digest = createHash('sha256');
    const header = Buffer.alloc(24);
    let headerBytes = 0;
    let bytes = 0;
    const reader = output.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (!bytes) outcome.duringOutput = await financialState(runtime, job);
        const prefix = chunk.value.subarray(0, Math.max(0, header.length - headerBytes));
        header.set(prefix, headerBytes);
        headerBytes += prefix.length;
        bytes += chunk.value.byteLength;
        digest.update(chunk.value);
        // Apply backpressure in the actual client, independently of fixture streaming.
        await delay(5);
      }
    } finally {
      reader.releaseLock();
    }
    if (headerBytes !== 24 || header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error('Output did not contain a PNG signature and complete dimensions');
    }
    outcome.output = {
      bytes,
      sha256: digest.digest('hex'),
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
      readMs: Date.now() - outputStartedAt,
    };
  } catch (error) {
    if (outcome.admissionMs === 0) outcome.admissionMs = Date.now() - startedAt;
    outcome.error = error instanceof Error ? error.message : String(error);
  } finally {
    outcome.finalState = await financialState(runtime, job);
  }
  return outcome;
}

function assertSuccessfulJob(job: IJobOutcome, workload: IWorkload, subject: string): void {
  expect(job.error, `${subject} ${job.jobId}`).toBeUndefined();
  expect(job.terminalStatus).toBe(200);
  expect(job.model).toBe(workload.model);
  expect(job.creditsUsed).toBe(1);
  expect(job.dimensions).toEqual({
    input: { width: workload.width, height: workload.height },
    output: { width: workload.width * workload.scale, height: workload.height * workload.scale },
    actualScale: workload.scale,
  });
  expect(job.output).toMatchObject({
    bytes: OUTPUT_BYTES,
    width: workload.width * workload.scale,
    height: workload.height * workload.scale,
  });
  expect(job.output!.readMs).toBeGreaterThan(500);
  expect(job.beforeOutput?.status).toBe('processing');
  expect(job.duringOutput?.status).toBe('processing');
  expect(job.finalState).toMatchObject({
    status: 'completed',
    amount: 1,
    consumed_subscription: 1,
    consumed_purchased: 0,
    subscription_credits_balance: INITIAL_SUBSCRIPTION_CREDITS - 1,
    purchased_credits_balance: INITIAL_PURCHASED_CREDITS,
    usage_count: 1,
    usage_amount: -1,
    refund_count: 0,
    refund_amount: 0,
    telemetry_model: workload.model,
    telemetry_scale: workload.scale,
    telemetry_credits: 1,
  });
  if (subject === 'candidate') {
    expect(job.admissionStatus).toBe(202);
    expect(job.statusRequests).toBeGreaterThan(0);
    expect(job.finalState).toMatchObject({
      execution_mode: 'replicate_async_v1',
      resolved_model: workload.model,
      quality_tier: 'quick',
      provider_phase: 'succeeded',
    });
  }
}

async function warm(
  runtime: IAsyncUpscaleRuntime,
  workload: IWorkload,
  providerDelayMs: number
): Promise<void> {
  runtime.setProviderDelayMs(0);
  try {
    const job = await prepareJob(runtime, workload);
    const unauthorized = await runtime.request(null, '/api/upscale', job.body);
    expect(unauthorized.status).toBe(401);
    await unauthorized.text();
    const outcome = await driveJob(runtime, job, 0);
    // A completed request exercises auth, model selection, real SQL and output EOF.
    // Zero-delay candidate admission can return either processing or ready.
    assertSuccessfulJob(outcome, workload, 'warmup');
  } finally {
    runtime.setProviderDelayMs(providerDelayMs);
  }
  runtime.calls.length = 0;
  runtime.invocations.length = 0;
}

async function measureCohort(
  runtime: IAsyncUpscaleRuntime,
  workload: IWorkload,
  providerDelayMs: number,
  overlap: number
): Promise<ICohort> {
  const label = `${workload.label}-${providerDelayMs}ms-${overlap}-jobs`;
  const jobs = await Promise.all(
    Array.from({ length: overlap }, () => prepareJob(runtime, workload))
  );
  const baselineHeap = await runtime.inspector.sample();
  await runtime.inspector.startProfiles();
  const startedAt = Date.now();
  const running = Promise.all(
    jobs.map(job =>
      driveJob(runtime, job, providerDelayMs, {
        // Keep the candidate Worker idle during the provider wait. Polling and
        // delivery remain covered by the recovery suites; this cohort isolates
        // the memory retained solely by the synchronous provider invocation.
        deferFirstObservation: runtime.artifact.subject === 'candidate',
      })
    )
  );
  // Observe rejection immediately even while profiling; runtime/database failures
  // must not become an unhandled rejection or disappear as a timeout.
  const settled = running.then(
    outcomes => ({ outcomes }),
    error => ({ error })
  );
  const waitingHeap: ICohort['waitingHeap'] = [];
  try {
    for (const offset of providerDelayMs === 120_000
      ? [6500, 20_500, 60_500, 105_500]
      : [6500, 13_500, 20_500]) {
      await delay(Math.max(0, startedAt + offset - Date.now()));
      // Sample the live heap at multiple in-flight checkpoints. The restored-
      // wait control can leave HeapProfiler.collectGarbage pending, so the
      // comparison uses the same supported Runtime.getHeapUsage path for both.
      waitingHeap.push({
        ...(await runtime.inspector.sample()),
        elapsedMs: Date.now() - startedAt,
      });
    }
    await runtime.inspector.snapshot(label);
    const snapshot = JSON.parse(
      await readFile(
        join(ASYNC_RUNTIME_ARTIFACTS, `${runtime.artifact.subject}-${label}.heapsnapshot`),
        'utf8'
      )
    );
    const result = await settled;
    if ('error' in result) throw result.error;
    const retained = percentile(
      waitingHeap.map(sample => sample.usedSize),
      0.5
    );
    return {
      subject: runtime.artifact.subject,
      artifact: runtime.artifact,
      label,
      workload,
      providerDelayMs,
      overlap,
      baselineHeap,
      waitingHeap,
      medianRetainedJavaScriptHeapBytes: retained,
      incrementalRetainedJavaScriptHeapBytes: retained - baselineHeap.usedSize,
      snapshotRetainedJavaScriptHeapBytes: snapshotRetainedJavaScriptHeapBytes(snapshot),
      admissions: {
        p95Ms: percentile(
          result.outcomes.map(job => job.admissionMs),
          0.95
        ),
        p99Ms: percentile(
          result.outcomes.map(job => job.admissionMs),
          0.99
        ),
      },
      jobs: result.outcomes,
      calls: [...runtime.calls],
      invocations: [...runtime.invocations],
      profiles: {
        cpu: `${runtime.artifact.subject}-${label}.cpuprofile`,
        heap: `${runtime.artifact.subject}-${label}.heapprofile`,
        snapshot: `${runtime.artifact.subject}-${label}.heapsnapshot`,
      },
    };
  } finally {
    await runtime.inspector.stopProfiles(label);
  }
}

function assertEarlyResponse(cohort: ICohort, marker = 'Candidate admission'): void {
  expect(
    cohort.admissions.p99Ms,
    `${marker}: admission must finish within 8 seconds`
  ).toBeLessThanOrEqual(8000);
  expect(
    cohort.admissions.p95Ms,
    `${marker}: admission p95 must finish within 3 seconds`
  ).toBeLessThanOrEqual(3000);
}

async function assertProfiles(cohort: ICohort): Promise<void> {
  const cpu = JSON.parse(
    await readFile(join(ASYNC_RUNTIME_ARTIFACTS, cohort.profiles.cpu), 'utf8')
  );
  const heap = JSON.parse(
    await readFile(join(ASYNC_RUNTIME_ARTIFACTS, cohort.profiles.heap), 'utf8')
  );
  expect(cpu.nodes.length).toBeGreaterThan(0);
  expect(cpu.samples.length).toBeGreaterThan(0);
  expect(heap.head).toBeDefined();
}

function providerCalls(cohort: ICohort) {
  const calls = cohort.calls.filter(call => call.host === 'api.replicate.com');
  return {
    creates: calls.filter(call => call.method === 'POST' && /\/predictions$/.test(call.path)),
    gets: calls.filter(call => call.method === 'GET' && /\/predictions\/[^/]+$/.test(call.path)),
  };
}

async function closeRuntimes(runtimes: IAsyncUpscaleRuntime[]): Promise<void> {
  const cleanup = await Promise.allSettled(runtimes.map(runtime => runtime.close()));
  for (const result of cleanup) if (result.status === 'rejected') throw result.reason;
}

async function pairedWorkload(workload: IWorkload, providerDelayMs: number, overlap: number) {
  const started = await Promise.allSettled(
    (['candidate', 'synchronous-control'] as const).map(subject =>
      startAsyncUpscaleRuntime({
        subject,
        providerDelayMs,
        metadataBytes: METADATA_BYTES,
        outputBytes: OUTPUT_BYTES,
        premiumModels: workload.premiumModels,
      })
    )
  );
  const runtimes = started.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []));
  try {
    for (const result of started) if (result.status === 'rejected') throw result.reason;
    await Promise.all(runtimes.map(runtime => warm(runtime, workload, providerDelayMs)));
    const candidateRuntime = runtimes[0];
    const controlRuntime = runtimes[1];
    if (!candidateRuntime || !controlRuntime) throw new Error('Both runtime subjects are required');
    // Keep only one profiled workerd/Inspector pair active at a time. The
    // restored-wait control intentionally holds a provider request open, and
    // concurrent Inspector sessions can destabilize the native runtime.
    const candidate = await measureCohort(candidateRuntime, workload, providerDelayMs, overlap);
    await candidateRuntime.close();
    const control = await measureCohort(controlRuntime, workload, providerDelayMs, overlap);
    const evidence = {
      fixture: {
        inputBytes: INPUT_BYTES,
        outputBytes: OUTPUT_BYTES,
        metadataBytes: METADATA_BYTES,
      },
      providerPayloadSource: {
        evidence: '.tmp/async-upscale/provider-metadata-readonly.json',
        sampledPredictions: 12,
        sampledModel: 'nightmareai/real-esrgan',
        measurement: 'Largest decoded historical GET response; outputs had expired',
      },
      candidate,
      control,
      providerCalls: {
        candidate: {
          creates: providerCalls(candidate).creates.length,
          gets: providerCalls(candidate).gets.length,
        },
        control: {
          creates: providerCalls(control).creates.length,
          gets: providerCalls(control).gets.length,
        },
      },
      retainedJavaScriptHeapReductionBytes:
        control.snapshotRetainedJavaScriptHeapBytes - candidate.snapshotRetainedJavaScriptHeapBytes,
      limits: {
        crashCausality: 'UNPROVEN: restored wait has no reproduced OOM in this comparison',
        totalIsolateMemoryHeadroom:
          'NOT MEASURED: JavaScript heap excludes other isolate allocations',
        configuredCpuBudget:
          'PENDING: CPU profiles do not establish per-invocation budget enforcement',
        realProviderPayloads:
          'PENDING: fresh staging cases for each selected fallback are mandatory',
        productionSurvival: 'PENDING: production load and observation gates remain mandatory',
      },
    };
    await saveEvidence(candidate.label, evidence);
    await Promise.all([assertProfiles(candidate), assertProfiles(control)]);
    expect(candidate.artifact.bundleSha256).not.toBe(control.artifact.bundleSha256);
    expect(candidate.artifact.sourceSha256).not.toBe(control.artifact.sourceSha256);
    expect(candidate.artifact.sourceRevision).toBe(control.artifact.sourceRevision);
    assertEarlyResponse(candidate);
    expect(providerCalls(candidate).creates).toHaveLength(overlap);
    expect(providerCalls(control).creates).toHaveLength(overlap);
    expect(providerCalls(candidate).gets.length).toBeGreaterThanOrEqual(overlap);
    for (const cohort of [candidate, control]) {
      const decodedResponseSizes = cohort.calls
        .filter(call => call.host === 'api.replicate.com' && call.metadataBytes !== undefined)
        .map(call => call.metadataBytes!);
      expect(Math.max(...decodedResponseSizes)).toBe(METADATA_BYTES);
    }
    for (const invocation of candidate.invocations.filter(item =>
      /^\/api\/upscale(?:\?|$)/.test(item.path)
    )) {
      expect(invocation.headersMs, `${invocation.method} ${invocation.path}`).toBeLessThan(8000);
    }
    for (const job of candidate.jobs) assertSuccessfulJob(job, workload, 'candidate');
    for (const job of control.jobs) {
      if (providerDelayMs === 120_000 && job.terminalStatus !== 200) {
        // Preserve the existing 120s route timeout in the isolated control.
        expect(job.admissionMs).toBeGreaterThanOrEqual(120_000);
        expect(job.terminalStatus).toBeGreaterThanOrEqual(500);
        expect(job.finalState).toMatchObject({
          status: 'refunded',
          usage_count: 1,
          usage_amount: -1,
          refund_count: 1,
          refund_amount: 1,
          subscription_credits_balance: INITIAL_SUBSCRIPTION_CREDITS,
          purchased_credits_balance: INITIAL_PURCHASED_CREDITS,
        });
      } else {
        assertSuccessfulJob(job, workload, 'synchronous-control');
        expect(job.output?.sha256).toBe(candidate.jobs[0].output?.sha256);
      }
    }
    expect(
      control.admissions.p99Ms,
      'The restored wait must span the provider delay'
    ).toBeGreaterThanOrEqual(providerDelayMs);
    expect(
      candidate.snapshotRetainedJavaScriptHeapBytes,
      `Snapshot-retained JavaScript heap did not decrease; inspect ${candidate.label}.json and its heap profiles`
    ).toBeLessThan(control.snapshotRetainedJavaScriptHeapBytes);
    return evidence;
  } finally {
    await closeRuntimes(runtimes);
  }
}

test('runtime collection negative control', { tag: '@collection-control' }, () => {
  expect('ASYNC_RUNTIME_COLLECTION_SENTINEL').toBe('must fail');
});

test(
  'restored wait fails the early-response measurement',
  { tag: '@synchronous-control' },
  async () => {
    test.setTimeout(180_000);
    const runtime = await startAsyncUpscaleRuntime({
      subject: 'synchronous-control',
      providerDelayMs: 30_000,
      metadataBytes: METADATA_BYTES,
      outputBytes: OUTPUT_BYTES,
    });
    try {
      const job = await prepareJob(runtime, WORKLOADS[0]);
      const startedAt = Date.now();
      const request = runtime.request(job.user, '/api/upscale', job.body).then(
        response => ({ kind: 'response' as const, elapsedMs: Date.now() - startedAt, response }),
        error => ({ kind: 'error' as const, elapsedMs: Date.now() - startedAt, error })
      );
      const result = await Promise.race([
        request,
        delay(10_000).then(() => ({ kind: 'timeout' as const, elapsedMs: Date.now() - startedAt })),
      ]);
      expect(
        result.elapsedMs,
        `${EARLY_RESPONSE_CONTROL}: restored synchronous request must return within 8 seconds`
      ).toBeLessThanOrEqual(8000);
    } finally {
      await runtime.close();
    }
  }
);

test('should finish admission before delayed provider completion under concurrent large Quick requests', async () => {
  test.setTimeout(30 * 60_000);
  const comparisons = [];
  const hashesByWorkload = new Map<string, string>();
  for (const providerDelayMs of [30_000, 120_000]) {
    for (const overlap of [1, 5, 10]) {
      // At most four isolates: two scales, each with a separately warmed pair.
      // Fresh pairs prevent the control's real 120s timeout/circuit state from
      // contaminating the next workload or its retained-heap baseline.
      const outcomes = await Promise.allSettled(
        WORKLOADS.map(workload => pairedWorkload(workload, providerDelayMs, overlap))
      );
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') throw outcome.reason;
        const comparison = outcome.value;
        for (const job of comparison.candidate.jobs) {
          const expectedHash = hashesByWorkload.get(comparison.candidate.workload.label);
          if (expectedHash) expect(job.output!.sha256).toBe(expectedHash);
          else hashesByWorkload.set(comparison.candidate.workload.label, job.output!.sha256);
        }
        comparisons.push({
          label: comparison.candidate.label,
          admissions: comparison.candidate.admissions,
          retainedJavaScriptHeapReductionBytes: comparison.retainedJavaScriptHeapReductionBytes,
          evidence: `${comparison.candidate.label}.json`,
        });
      }
      await saveEvidence('matrix-progress', comparisons);
    }
  }
  expect(comparisons).toHaveLength(12);
});

test('preserves the largest Quick 2x request when premium model policy selects large Real-ESRGAN', async () => {
  test.setTimeout(180_000);
  await pairedWorkload(
    {
      ...WORKLOADS[0],
      label: 'quick-2x-esrgan-large',
      model: 'real-esrgan-large',
      premiumModels: false,
    },
    30_000,
    1
  );
});
