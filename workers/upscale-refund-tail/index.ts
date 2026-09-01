import { isUuidV4 } from '../../shared/validation/uuid';

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
const MAX_LOG_SCRIPT_NAME_LENGTH = 100;
const MAX_LOG_METHOD_LENGTH = 16;
const MAX_LOG_PATHNAME_LENGTH = 256;
const MAX_LOG_RAY_ID_LENGTH = 100;
const KNOWN_API_ROOTS = new Set([
  'account',
  'admin',
  'analytics',
  'analyze-image',
  'auto-top-up',
  'blog',
  'bg-removal',
  'checkout',
  'credit-estimate',
  'credits',
  'cron',
  'email',
  'engagement-discount',
  'experiments',
  'gallery',
  'geo',
  'health',
  'migrate-blog',
  'models',
  'portal',
  'protected',
  'proxy-image',
  'pseo',
  'seo',
  'subscription',
  'subscriptions',
  'support',
  'upscale',
  'users',
  'webhooks',
]);

export interface IHardWorkerFailureObservation {
  scriptName: string;
  outcome: Extract<WorkerOutcome, 'exception' | 'exceededCpu' | 'exceededMemory'>;
  method: string;
  pathname: string;
  rayId: string | undefined;
}

function getHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  const value = entry?.[1];
  return typeof value === 'string' ? value : undefined;
}

function boundLogValue(value: unknown, maxLength: number, fallback = 'unknown'): string {
  return (typeof value === 'string' ? value : fallback).slice(0, maxLength);
}

function classifyMethod(method: string | undefined): string {
  const normalized = typeof method === 'string' ? method.trim().toUpperCase() : '';
  return /^[A-Z]+$/.test(normalized)
    ? boundLogValue(normalized, MAX_LOG_METHOD_LENGTH)
    : 'UNKNOWN';
}

function redactPathname(pathname: string): string {
  if (pathname === '/api/upscale') return pathname;
  if (pathname === '/') return pathname;

  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'api' || !KNOWN_API_ROOTS.has(segments[1] ?? '')) {
    return '[redacted-path]';
  }

  const root = segments[1];
  return segments.length === 2 ? `/api/${root}` : `/api/${root}/[redacted]`;
}

/**
 * Return only safe, bounded route metadata for a hard Worker outcome.
 * The URL is parsed so query strings never enter the observation.
 */
export function classifyHardWorkerFailure(
  trace: ITraceItem
): IHardWorkerFailureObservation | null {
  if (!HARD_WORKER_FAILURES.has(trace.outcome)) return null;

  const request = trace.event?.request;
  let pathname = '[invalid-url]';
  if (request?.url) {
    try {
      pathname = new URL(request.url).pathname || '/';
    } catch {
      // Keep the invalid-url sentinel; never log the malformed input.
    }
  }

  const rayId = getHeader(request?.headers, 'cf-ray');
  return {
    scriptName: boundLogValue(trace.scriptName || 'unknown', MAX_LOG_SCRIPT_NAME_LENGTH),
    outcome: trace.outcome,
    method: classifyMethod(request?.method),
    pathname: boundLogValue(redactPathname(pathname), MAX_LOG_PATHNAME_LENGTH),
    rayId: rayId ? boundLogValue(rayId, MAX_LOG_RAY_ID_LENGTH) : undefined,
  };
}

async function refundHardFailure(
  trace: ITraceItem,
  env: IEnv,
  observation: IHardWorkerFailureObservation
): Promise<void> {
  const request = trace.event?.request;
  if (observation.method !== 'POST' || observation.pathname !== '/api/upscale') return;

  const jobId = getHeader(request?.headers, 'x-upscale-job-id');
  if (!isUuidV4(jobId)) return;

  const rayId = observation.rayId;
  if (!rayId) return;
  const response = await fetch(`${env.API_BASE_URL}/api/cron/upscale-tail-refund`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-cron-secret': env.CRON_SECRET,
    },
    body: JSON.stringify({
      jobId,
      outcome: observation.outcome,
      ...(rayId ? { rayId } : {}),
    }),
  });

  if (!response.ok) {
    console.warn('Tail refund endpoint rejected hard Worker failure', {
      outcome: observation.outcome,
      status: response.status,
      method: observation.method,
      pathname: observation.pathname,
      rayId: observation.rayId,
    });
  }
}

export default {
  async tail(events: ITraceItem[], env: IEnv): Promise<void> {
    await Promise.all(
      events.map(async trace => {
        try {
          const observation = classifyHardWorkerFailure(trace);
          if (!observation) return;

          console.error('Cloudflare hard Worker outcome', observation);
          await refundHardFailure(trace, env, observation);
        } catch (error) {
          console.warn('Failed to process hard Worker failure tail event', {
            outcome: trace.outcome,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );
  },
};
