export interface IEnv {
  API_BASE_URL: string;
  CRON_SECRET: string;
}

export type WorkerOutcome =
  | 'unknown'
  | 'ok'
  | 'exception'
  | 'exceededCpu'
  | 'exceededMemory'
  | 'scriptNotFound'
  | 'canceled'
  | 'responseStreamDisconnected';

export interface ITraceItem {
  scriptName: string;
  outcome: WorkerOutcome;
  eventTimestamp: number;
  event?: {
    request?: {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
    };
  };
}

const HARD_WORKER_FAILURES = new Set<WorkerOutcome>(['exception', 'exceededCpu', 'exceededMemory']);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return entry?.[1];
}

async function refundHardFailure(trace: ITraceItem, env: IEnv): Promise<void> {
  if (!HARD_WORKER_FAILURES.has(trace.outcome)) return;

  const request = trace.event?.request;
  if (!request?.url || request.method?.toUpperCase() !== 'POST') return;

  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return;
  }
  if (pathname !== '/api/upscale') return;

  const jobId = getHeader(request.headers, 'x-upscale-job-id');
  if (!jobId || !UUID_V4.test(jobId)) return;

  const rayId = getHeader(request.headers, 'cf-ray');
  if (!rayId) return;
  const response = await fetch(`${env.API_BASE_URL}/api/cron/upscale-tail-refund`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-cron-secret': env.CRON_SECRET,
    },
    body: JSON.stringify({
      jobId,
      outcome: trace.outcome,
      ...(rayId ? { rayId } : {}),
    }),
  });

  if (!response.ok) {
    console.error('Tail refund endpoint rejected hard Worker failure', {
      jobId,
      outcome: trace.outcome,
      status: response.status,
    });
  }
}

export default {
  async tail(events: ITraceItem[], env: IEnv): Promise<void> {
    await Promise.all(
      events.map(async trace => {
        try {
          await refundHardFailure(trace, env);
        } catch (error) {
          console.error('Failed to process hard Worker failure tail event', {
            outcome: trace.outcome,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );
  },
};
