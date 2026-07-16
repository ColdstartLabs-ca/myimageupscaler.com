/**
 * Cloudflare Worker: Cron Job Router
 *
 * Routes scheduled cron events to the appropriate Next.js API endpoints.
 * This worker runs on Cloudflare's edge and triggers our API routes on schedule.
 *
 * Local Development:
 *   wrangler dev --local
 *
 * Deployment:
 *   wrangler deploy
 */

// Cloudflare Worker types
interface IScheduledEvent {
  cron: string;
  scheduledTime: number;
}

interface IExecutionContext {
  waitUntil(promise: Promise<void>): void;
}

export interface IEnv {
  API_BASE_URL: string;
  CRON_SECRET: string;
  WORKER_NAME?: string;
  CRON_SERVICE_NAME?: string;
}

interface ILifecycleDrainResponse {
  success?: boolean;
  eligible?: number;
  sent?: number;
  skipped?: number;
  stoppedByHealth?: boolean;
  stoppedByProvider?: boolean;
  stoppedByProviderCapacity?: boolean;
  durationMs?: number;
  providerIoMs?: number;
}

const LIFECYCLE_DRAINS_PER_SCHEDULE = 10;

function shouldStopLifecycleDrain(result: ILifecycleDrainResponse): boolean {
  return (
    result.success !== true ||
    result.stoppedByHealth === true ||
    result.stoppedByProvider === true ||
    result.stoppedByProviderCapacity === true ||
    result.eligible === 0 ||
    (result.sent === 0 && (result.skipped ?? 0) === 0)
  );
}

async function postCron(
  env: IEnv,
  endpoint: string
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(`${env.API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': env.CRON_SECRET,
    },
  });
  return { ok: response.ok, status: response.status, data: await response.json() };
}

async function runLifecycleSequence(env: IEnv, includeEligibility: boolean): Promise<void> {
  for (let index = 0; index < LIFECYCLE_DRAINS_PER_SCHEDULE; index++) {
    const drainOnly = !includeEligibility || index > 0;
    const endpoint = `/api/cron/email-lifecycle?drainOnly=${drainOnly}&scanLimit=25&sendLimit=1`;
    const { ok, data } = await postCron(env, endpoint);
    const result = data as ILifecycleDrainResponse;
    console.log('[CRON] Email Lifecycle drain completed', {
      invocation: index + 1,
      drainOnly,
      ok,
      eligible: result.eligible ?? 0,
      sent: result.sent ?? 0,
      skipped: result.skipped ?? 0,
      stoppedByHealth: result.stoppedByHealth === true,
      stoppedByProvider: result.stoppedByProvider === true,
      stoppedByProviderCapacity: result.stoppedByProviderCapacity === true,
      wallTimeMs: result.durationMs ?? null,
      providerIoMs: result.providerIoMs ?? null,
    });
    if (!ok || shouldStopLifecycleDrain(result)) return;
  }
}

export default {
  /**
   * Scheduled event handler - triggered by cron patterns defined in wrangler.toml
   */
  async scheduled(event: IScheduledEvent, env: IEnv, ctx: IExecutionContext): Promise<void> {
    const cronPattern = event.cron;

    console.log(`[CRON] Triggered at ${new Date().toISOString()} with pattern: ${cronPattern}`);

    // Map cron pattern to API endpoint
    let endpoint: string;
    let jobName: string;
    let lifecycleIncludeEligibility: boolean | null = null;

    if (cronPattern === '*/15 * * * *') {
      endpoint = '/api/cron/recover-webhooks';
      jobName = 'Webhook Recovery';
    } else if (cronPattern === '5 * * * *') {
      endpoint = '/api/cron/check-expirations';
      jobName = 'Expiration Check';
    } else if (cronPattern === '5 3 * * *') {
      endpoint = '/api/cron/reconcile';
      jobName = 'Full Reconciliation';
    } else if (cronPattern === '30 4 * * *') {
      endpoint = '/api/cron/refresh-3kings-sitemap';
      jobName = '3-Kings Sitemap Refresh';
    } else if (cronPattern === '0 0 * * *') {
      endpoint = '/api/cron/gallery-cleanup';
      jobName = 'Gallery Cleanup';
    } else if (cronPattern === '10 * * * *') {
      endpoint = '/api/cron/email-lifecycle?drainOnly=false&scanLimit=25&sendLimit=1';
      jobName = 'Email Lifecycle';
      lifecycleIncludeEligibility = true;
    } else if (cronPattern === '40 * * * *') {
      endpoint = '/api/cron/email-lifecycle?drainOnly=true&scanLimit=25&sendLimit=1';
      jobName = 'Email Lifecycle Catch-up';
      lifecycleIncludeEligibility = false;
    } else {
      console.error(`[CRON] Unknown cron pattern: ${cronPattern}`);
      return;
    }

    const url = `${env.API_BASE_URL}${endpoint}`;

    console.log(`[CRON] Executing ${jobName} -> ${url}`);

    // Execute the cron job asynchronously
    ctx.waitUntil(
      (async () => {
        try {
          if (lifecycleIncludeEligibility !== null) {
            await runLifecycleSequence(env, lifecycleIncludeEligibility);
            return;
          }
          const { ok, status, data } = await postCron(env, endpoint);
          if (ok) {
            console.log(`[CRON] ${jobName} completed successfully:`, data);
          } else {
            console.error(`[CRON] ${jobName} failed with status ${status}:`, data);
          }
        } catch (error) {
          console.error(`[CRON] ${jobName} error:`, error);
        }
      })()
    );
  },

  /**
   * Fetch handler - for manual testing via HTTP requests
   * GET /?pattern=star-slash-15 to test webhook recovery
   * GET /?pattern=5%20star%20star%20star%20star to test expiration check
   */
  async fetch(request: Request, env: IEnv, ctx: IExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          worker: env.CRON_SERVICE_NAME || 'myimageupscaler-cron',
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Manual trigger endpoint for testing
    if (url.pathname === '/trigger' && request.method === 'POST') {
      const pattern = url.searchParams.get('pattern');

      if (!pattern) {
        return new Response(
          JSON.stringify({
            error: 'Missing pattern parameter',
            usage: 'POST /trigger?pattern=*/15%20*%20*%20*%20*',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Simulate scheduled event
      const event = { cron: pattern, scheduledTime: Date.now() } as IScheduledEvent;
      await this.scheduled(event, env, ctx);

      return new Response(
        JSON.stringify({
          message: 'Cron job triggered',
          pattern,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Not Found',
        endpoints: {
          health: 'GET /health',
          trigger: 'POST /trigger?pattern=<cron-pattern>',
        },
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  },
};
