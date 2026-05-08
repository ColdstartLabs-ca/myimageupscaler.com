# myimageupscaler.com Cron Worker

Cloudflare Worker that triggers scheduled cron jobs for the Stripe-Database sync system.

## Overview

This worker runs on Cloudflare's edge and executes scheduled tasks:

- **Webhook Recovery** - Every 15 minutes
- **Expiration Check** - Every hour at :05
- **Gallery Cleanup** - Daily at 12:00 AM UTC
- **Full Reconciliation** - Daily at 3:05 AM UTC
- **3-Kings Sitemap Refresh** - Daily at 4:30 AM UTC

The worker calls the Next.js API endpoints with the proper authentication header.

## Architecture

```
Cloudflare Cron Trigger
         ↓
   Cron Worker (index.ts)
         ↓
   POST /api/cron/{endpoint}
         ↓
   Next.js API (Cloudflare Pages)
         ↓
   Supabase Database
```

## Setup

### 1. Install Dependencies

```bash
cd workers/cron
npm install
```

### 2. Set Secrets

Set the `CRON_SECRET` (must match the value in your Next.js `.env.api`):

```bash
# Generate a secure secret
openssl rand -hex 32

# Set it in Cloudflare
wrangler secret put CRON_SECRET
# Paste the generated secret when prompted
```

### 3. Configure Environment

Update `wrangler.toml` with your production API URL:

```toml
[vars]
API_BASE_URL = "https://myimageupscaler.com"  # Your actual domain
```

## Local Development

### Start the Worker

```bash
npm run dev
```

This starts the worker at `http://localhost:8787` with hot reload.

### Start Your Next.js App

In another terminal:

```bash
cd /home/joao/projects/pixelperfect
yarn dev
```

Your Next.js app should be running at `http://localhost:3000`.

### Test Manually

```bash
# Test webhook recovery
node scripts/test-trigger.js webhook-recovery

# Test expiration check
node scripts/test-trigger.js expiration-check

# Test full reconciliation
node scripts/test-trigger.js reconciliation
```

### View Logs

```bash
# In the wrangler dev terminal, you'll see logs in real-time

# Or tail remote logs
wrangler tail
```

## Deployment

### Quick Deploy

```bash
./scripts/deploy.sh production
```

### Manual Deploy

```bash
# Deploy to production
npm run deploy:production

# Deploy to development
npm run deploy
```

### Verify Deployment

```bash
# Check health
curl https://myimageupscaler-cron.workers.dev/health

# View logs
wrangler tail

# Test manual trigger
node scripts/test-trigger.js webhook-recovery https://myimageupscaler-cron.workers.dev
```

## Cron Schedules

| Job                     | Pattern        | Frequency             | Endpoint                           |
| ----------------------- | -------------- | --------------------- | ---------------------------------- |
| Webhook Recovery        | `*/15 * * * *` | Every 15 minutes      | `/api/cron/recover-webhooks`       |
| Expiration Check        | `5 * * * *`    | Hourly at :05         | `/api/cron/check-expirations`      |
| Gallery Cleanup         | `0 0 * * *`    | Daily at 12:00 AM UTC | `/api/cron/gallery-cleanup`        |
| Full Reconciliation     | `5 3 * * *`    | Daily at 3:05 AM UTC  | `/api/cron/reconcile`              |
| 3-Kings Sitemap Refresh | `30 4 * * *`   | Daily at 4:30 AM UTC  | `/api/cron/refresh-3kings-sitemap` |

## Troubleshooting

### Worker Not Triggering

1. **Check Deployment:**

   ```bash
   wrangler deployments list
   ```

2. **View Logs:**

   ```bash
   wrangler tail
   ```

3. **Verify Secrets:**
   ```bash
   wrangler secret list
   ```

### Authentication Errors (401)

- Ensure `CRON_SECRET` matches in both:
  - Cloudflare Worker (wrangler secret)
  - Next.js API (`.env.api` file)

### Cron Not Running

- Cloudflare requires at least one HTTP request to activate cron triggers
- Send a health check: `curl https://myimageupscaler-cron.workers.dev/health`
- Cron triggers may take a few minutes to activate after deployment

### Local Development Issues

1. **Port Conflicts:**

   ```bash
   # Change port in wrangler dev
   wrangler dev --local --port 8788
   ```

2. **API Not Reachable:**
   - Ensure Next.js app is running on `http://localhost:3000`
   - Check `API_BASE_URL` in wrangler.toml

3. **CRON_SECRET Not Set:**
   ```bash
   # For local dev, create .dev.vars file
   echo "CRON_SECRET=your-local-secret" > .dev.vars
   ```

## Testing

### Manual Trigger via HTTP

```bash
# Trigger webhook recovery
curl -X POST "http://localhost:8787/trigger?pattern=%2A%2F15%20%2A%20%2A%20%2A%20%2A"

# Trigger expiration check
curl -X POST "http://localhost:8787/trigger?pattern=5%20%2A%20%2A%20%2A%20%2A"

# Trigger reconciliation
curl -X POST "http://localhost:8787/trigger?pattern=5%203%20%2A%20%2A%20%2A"
```

### Test Script

```bash
# Local
node scripts/test-trigger.js webhook-recovery

# Production
node scripts/test-trigger.js webhook-recovery https://myimageupscaler-cron.workers.dev
```

## Monitoring

### View Execution Logs

```bash
# Live tail
wrangler tail

# Filter by cron pattern
wrangler tail --search "CRON"
```

### Check Sync Results

Query the database to see sync run results:

```sql
SELECT * FROM sync_runs
WHERE started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC;
```

### Cloudflare Dashboard

1. Go to Cloudflare Dashboard → Workers
2. Select `myimageupscaler-cron`
3. View Analytics, Logs, and Cron Triggers

## Environment Variables

| Variable       | Description                   | Where to Set                      |
| -------------- | ----------------------------- | --------------------------------- |
| `CRON_SECRET`  | Auth secret for API endpoints | `wrangler secret put CRON_SECRET` |
| `API_BASE_URL` | Base URL of your Next.js API  | `wrangler.toml`                   |

## File Structure

```
workers/cron/
├── index.ts              # Worker code
├── wrangler.toml         # Cloudflare config
├── package.json          # Dependencies
├── scripts/
│   ├── deploy.sh         # Deployment script
│   └── test-trigger.js   # Manual trigger tool
└── README.md             # This file
```

## Related Documentation

- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Stripe Sync System PRD](../../docs/PRDs/stripe-db-sync-prd.md)
- [Subscription System Docs](../../docs/technical/systems/subscription-system.md)

## Development Workflow

1. **Make Changes** to `index.ts`
2. **Test Locally** with `npm run dev` + manual triggers
3. **Verify** logs and API responses
4. **Deploy** with `./scripts/deploy.sh production`
5. **Monitor** with `wrangler tail`

## Security

- Never commit `.dev.vars` (contains local secrets)
- Always use `wrangler secret put` for production secrets
- Rotate `CRON_SECRET` regularly (quarterly recommended)
- Monitor failed authentication attempts in logs
