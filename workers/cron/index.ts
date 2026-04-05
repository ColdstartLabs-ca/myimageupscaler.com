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

// eslint-disable-next-line import/no-default-export
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

    if (cronPattern === '*/15 * * * *') {
      endpoint = '/api/cron/recover-webhooks';
      jobName = 'Webhook Recovery';
    } else if (cronPattern === '5 * * * *') {
      endpoint = '/api/cron/check-expirations';
      jobName = 'Expiration Check';
    } else if (cronPattern === '5 3 * * *') {
      endpoint = '/api/cron/reconcile';
      jobName = 'Full Reconciliation';
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
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cron-secret': env.CRON_SECRET,
            },
          });

          const data = await response.json();

          if (response.ok) {
            console.log(`[CRON] ${jobName} completed successfully:`, data);
          } else {
            console.error(`[CRON] ${jobName} failed with status ${response.status}:`, data);
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
