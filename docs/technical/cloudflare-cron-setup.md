# Cloudflare Cron Triggers Setup

This document explains how to configure Cloudflare Cron Triggers for the Stripe x Database Subscription Sync System.

## Overview

The system uses three scheduled cron jobs to maintain sync between Stripe and our database:

1. **Webhook Recovery** - Runs every 15 minutes
2. **Expiration Check** - Runs hourly
3. **Full Reconciliation** - Runs daily at 3:05 AM UTC

## Architecture

We use a dedicated **Cloudflare Worker** to handle cron triggers. The worker routes scheduled events to the appropriate Next.js API endpoints.

```
Cloudflare Cron Trigger → Worker → Next.js API → Supabase
```

**Why a separate worker?**

- Cloudflare Pages doesn't support cron triggers directly
- Workers provide better control and monitoring
- Easier local development with `wrangler dev`

## Quick Start (Recommended)

### 1. Install Dependencies

```bash
cd workers/cron
npm install
```

### 2. Set Up Secrets

```bash
# Generate a secure secret
openssl rand -hex 32

# Set it in Cloudflare
wrangler secret put CRON_SECRET
```

### 3. Deploy

```bash
./scripts/deploy.sh production
```

### 4. Verify

```bash
# Check health
curl https://pixelperfect-cron.workers.dev/health

# View logs
wrangler tail
```

That's it! The cron jobs are now running on schedule.

## Configuration Methods

### Method 1: Cloudflare Dashboard (Recommended for Production)

1. **Navigate to Cloudflare Pages Dashboard**

   - Go to your Cloudflare account
   - Select your PixelPerfect Pages project
   - Click on "Settings" > "Functions"

2. **Add Cron Triggers**

   - Go to the "Cron Triggers" section
   - Add the following schedules:

   | Schedule             | Cron Pattern   | Target URL                    | Description                     |
   | -------------------- | -------------- | ----------------------------- | ------------------------------- |
   | Every 15 minutes     | `*/15 * * * *` | `/api/cron/recover-webhooks`  | Retry failed webhook events     |
   | Hourly at :05        | `5 * * * *`    | `/api/cron/check-expirations` | Check for expired subscriptions |
   | Daily at 3:05 AM UTC | `5 3 * * *`    | `/api/cron/reconcile`         | Full reconciliation with Stripe |

3. **Set Environment Variable**

   - In Cloudflare Pages dashboard, go to "Settings" > "Environment Variables"
   - Add `CRON_SECRET` with a secure random value
   - Generate with: `openssl rand -hex 32`
   - Make sure it's set for both Production and Preview environments

4. **Configure HTTP Headers**
   - Cloudflare automatically adds the `x-cron-secret` header to cron requests
   - Ensure the header value matches your `CRON_SECRET` environment variable

### Method 2: wrangler.toml (For Local Development)

Create or update `wrangler.toml` in your project root:

```toml
name = "pixelperfect"
compatibility_date = "2025-03-02"

# Cron Triggers
[triggers]
crons = [
  # Webhook recovery - every 15 minutes
  "*/15 * * * *",
  # Expiration check - every hour at :05
  "5 * * * *",
  # Full reconciliation - daily at 3:05 AM UTC
  "5 3 * * *"
]

# Environment variables
[vars]
# Note: CRON_SECRET should be set via Cloudflare dashboard for security
```

**Important:** Do NOT commit sensitive values to `wrangler.toml`. Use Cloudflare dashboard for secrets.

### Method 3: Cloudflare Workers (Alternative)

If using Cloudflare Workers instead of Pages, create a worker to route cron events:

```typescript
// worker.ts
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const cronPattern = event.cron;

    let endpoint: string;
    if (cronPattern === '*/15 * * * *') {
      endpoint = '/api/cron/recover-webhooks';
    } else if (cronPattern === '5 * * * *') {
      endpoint = '/api/cron/check-expirations';
    } else if (cronPattern === '5 3 * * *') {
      endpoint = '/api/cron/reconcile';
    } else {
      console.error('Unknown cron pattern:', cronPattern);
      return;
    }

    const response = await fetch(`https://yourdomain.com${endpoint}`, {
      method: 'POST',
      headers: {
        'x-cron-secret': env.CRON_SECRET,
      },
    });

    console.log(`Cron job ${endpoint} responded with:`, response.status);
  },
};
```

## Cron Pattern Reference

```
┌───────────── minute (0 - 59)
│ ┌─────────── hour (0 - 23)
│ │ ┌───────── day of month (1 - 31)
│ │ │ ┌─────── month (1 - 12)
│ │ │ │ ┌───── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
* * * * *
```

Examples:

- `*/15 * * * *` - Every 15 minutes
- `5 * * * *` - Every hour at 5 minutes past
- `5 3 * * *` - Every day at 3:05 AM UTC
- `0 0 * * 0` - Every Sunday at midnight

## Testing Cron Jobs

### Local Testing

Use cURL or Postman to test endpoints locally:

```bash
# Test webhook recovery
curl -X POST http://localhost:3000/api/cron/recover-webhooks \
  -H "x-cron-secret: your-local-secret"

# Test expiration check
curl -X POST http://localhost:3000/api/cron/check-expirations \
  -H "x-cron-secret: your-local-secret"

# Test reconciliation
curl -X POST http://localhost:3000/api/cron/reconcile \
  -H "x-cron-secret: your-local-secret"
```

### Production Testing

1. **Manual Trigger via Cloudflare Dashboard**

   - Go to Cloudflare Pages > Functions > Cron Triggers
   - Click "Trigger" next to the desired cron job
   - Check logs for execution results

2. **Monitor Execution**

   - Check Cloudflare Analytics for cron execution logs
   - Query `sync_runs` table in Supabase to see job results:
     ```sql
     SELECT * FROM sync_runs
     ORDER BY started_at DESC
     LIMIT 10;
     ```

3. **View Sync Statistics**
   - Use the helper function to get stats:
     ```sql
     SELECT * FROM get_sync_run_stats('expiration_check', 24);
     SELECT * FROM get_sync_run_stats('webhook_recovery', 24);
     SELECT * FROM get_sync_run_stats('full_reconciliation', 168);
     ```

## Monitoring & Alerts

### Recommended Monitoring

1. **Baselime Alerts**

   - Set up alerts for failed sync runs
   - Alert on high discrepancy rates
   - Monitor cron execution failures

2. **Supabase Dashboard**

   - Create views to monitor sync health:
     ```sql
     CREATE VIEW sync_health AS
     SELECT
       job_type,
       COUNT(*) FILTER (WHERE status = 'completed') as success_count,
       COUNT(*) FILTER (WHERE status = 'failed') as failure_count,
       MAX(started_at) as last_run
     FROM sync_runs
     WHERE started_at > NOW() - INTERVAL '24 hours'
     GROUP BY job_type;
     ```

3. **Stripe Dashboard**
   - Monitor webhook delivery success rates
   - Check for webhook endpoint errors

### Health Check Queries

```sql
-- Recent sync runs
SELECT * FROM sync_runs
WHERE started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC;

-- Failed webhook events
SELECT * FROM webhook_events
WHERE status = 'failed'
  AND recoverable = true
ORDER BY created_at DESC
LIMIT 20;

-- Subscription discrepancies (check manually)
SELECT s.id, s.status, s.current_period_end, p.subscription_status
FROM subscriptions s
JOIN profiles p ON s.user_id = p.id
WHERE s.status != p.subscription_status;
```

## Troubleshooting

### Cron Jobs Not Running

1. **Verify Environment Variable**

   - Check `CRON_SECRET` is set in Cloudflare dashboard
   - Ensure it matches the value used in requests

2. **Check Cloudflare Logs**

   - Go to Cloudflare Pages > Functions > Logs
   - Look for cron execution entries

3. **Validate Cron Patterns**
   - Use [crontab.guru](https://crontab.guru) to validate patterns
   - Ensure timezone is UTC (Cloudflare default)

### Authentication Errors

If seeing 401 Unauthorized:

- Verify `CRON_SECRET` environment variable is set
- Check header name is `x-cron-secret` (lowercase)
- Ensure value matches exactly (no extra whitespace)

### Rate Limiting

If hitting Stripe API rate limits:

- The reconciliation job includes 100ms delays between calls
- Runs at 3 AM UTC to minimize traffic
- Contact Stripe support to increase limits if needed

### Sync Run Failures

Check the `sync_runs` table for error messages:

```sql
SELECT * FROM sync_runs
WHERE status = 'failed'
ORDER BY started_at DESC
LIMIT 5;
```

## Security Considerations

1. **CRON_SECRET Protection**

   - Never commit the secret to git
   - Use Cloudflare dashboard to set it
   - Rotate regularly (e.g., quarterly)

2. **Request Validation**

   - All endpoints validate the cron secret header
   - Unauthorized requests return 401
   - No sensitive data in error responses

3. **Database Access**
   - Cron jobs use service role key for elevated access
   - RLS policies protect sync_runs table
   - All operations are logged for audit trail

## Rollback Plan

If cron jobs cause issues:

1. **Immediate**: Disable cron triggers in Cloudflare dashboard
2. **Verify**: Check `sync_runs` table for error patterns
3. **Fix**: Address issues in cron endpoint code
4. **Test**: Manually trigger endpoints to verify fix
5. **Re-enable**: Turn cron triggers back on

## Local Development with Wrangler

### Setup

1. **Install Worker Dependencies:**

   ```bash
   cd workers/cron
   npm install
   ```

2. **Create Local Secrets File:**

   ```bash
   echo "CRON_SECRET=your-local-dev-secret" > .dev.vars
   ```

   Note: Must match `CRON_SECRET` in `.env.api`

3. **Start the Worker:**

   ```bash
   npm run dev
   ```

   Worker runs at `http://localhost:8787`

4. **Start Next.js App (in another terminal):**
   ```bash
   cd /home/joao/projects/pixelperfect
   yarn dev
   ```
   App runs at `http://localhost:3000`

### Testing Cron Jobs Locally

#### Manual Trigger via Script

```bash
cd workers/cron

# Test webhook recovery
node scripts/test-trigger.js webhook-recovery

# Test expiration check
node scripts/test-trigger.js expiration-check

# Test full reconciliation
node scripts/test-trigger.js reconciliation
```

#### Manual Trigger via curl

```bash
# Webhook recovery
curl -X POST "http://localhost:8787/trigger?pattern=%2A%2F15%20%2A%20%2A%20%2A%20%2A"

# Expiration check
curl -X POST "http://localhost:8787/trigger?pattern=5%20%2A%20%2A%20%2A%20%2A"

# Full reconciliation
curl -X POST "http://localhost:8787/trigger?pattern=5%203%20%2A%20%2A%20%2A"
```

### Viewing Logs

```bash
# Local dev logs appear in wrangler dev terminal

# For deployed worker
wrangler tail

# Filter logs
wrangler tail --search "CRON"
```

### Development Workflow

1. Make changes to `workers/cron/index.ts`
2. Wrangler automatically reloads (hot reload)
3. Test with manual triggers
4. Check logs in terminal
5. Verify database updates in Supabase

### Common Issues

**Port Already in Use:**

```bash
wrangler dev --local --port 8788
```

**Can't Reach API:**

- Ensure Next.js is running on port 3000
- Check `API_BASE_URL` in `wrangler.toml` (development env)

**Secret Not Found:**

- Create `.dev.vars` file with `CRON_SECRET`
- Or use: `wrangler secret put CRON_SECRET --env development`

## Additional Resources

- [Cloudflare Cron Triggers Documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Stripe API Rate Limits](https://stripe.com/docs/rate-limits)
- [Supabase Functions](https://supabase.com/docs/guides/functions)
- [Worker README](../../workers/cron/README.md)
