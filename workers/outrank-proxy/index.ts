/**
 * Cloudflare Worker: Outrank Webhook Proxy
 *
 * Proxies Outrank.so webhook requests to the main worker via service binding,
 * bypassing zone-level Bot Fight Mode (which blocks automated POST requests).
 *
 * Deployed on workers.dev only (no zone routes), so no Bot Fight Mode applies.
 * The service binding forwards internally to the main worker without going
 * through the zone security pipeline.
 *
 * Outrank should send webhooks to:
 *   https://myimageupscaler-outrank-proxy.<account>.workers.dev/
 */

interface IEnv {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MAIN_WORKER: any; // Fetcher type is Cloudflare-specific, not available in standard TS
  ALLOWED_IP: string;
}

export default {
  async fetch(request: Request, env: IEnv): Promise<Response> {
    // Health check
    if (request.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          worker: 'myimageupscaler-outrank-proxy',
          timestamp: new Date().toISOString(),
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const clientIP = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    // Forward to main worker via service binding (bypasses zone security)
    console.log(`[OUTRANK-PROXY] Forwarding webhook from ${clientIP}`);

    const targetUrl = new URL('https://myimageupscaler.com/api/webhooks/outrank');

    const response = await env.MAIN_WORKER.fetch(
      new Request(targetUrl.toString(), {
        method: 'POST',
        headers: request.headers,
        body: request.body,
      })
    );

    console.log(`[OUTRANK-PROXY] Response: ${response.status}`);
    return response;
  },
};
