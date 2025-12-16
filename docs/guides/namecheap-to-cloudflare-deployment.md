# Namecheap Domain to Cloudflare Deployment Guide

Complete guide for deploying a Next.js application from domain purchase on Namecheap to production deployment on Cloudflare Workers/Pages.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Part 1: Domain Purchase on Namecheap](#part-1-domain-purchase-on-namecheap)
3. [Part 2: Cloudflare Account Setup](#part-2-cloudflare-account-setup)
4. [Part 3: Transfer DNS to Cloudflare](#part-3-transfer-dns-to-cloudflare)
5. [Part 4: Deploy with OpenNext (Recommended)](#part-4-deploy-with-opennext-recommended)
6. [Part 5: Custom Domain Configuration](#part-5-custom-domain-configuration)
7. [Part 6: SSL/TLS and Security](#part-6-ssltls-and-security)
8. [Part 7: Environment Variables](#part-7-environment-variables)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Credit card for domain purchase
- GitHub account (for CI/CD integration)
- Node.js 18+ installed locally
- Wrangler CLI version 3.99.0 or later

---

## Part 1: Domain Purchase on Namecheap

### Step 1: Search for Your Domain

1. Go to [namecheap.com](https://www.namecheap.com)
2. Enter your desired domain name in the search bar
3. Review available TLDs (.com, .app, .io, etc.)
4. Click **Add to Cart** for your chosen domain

### Step 2: Configure Domain Settings

1. **WhoisGuard**: Enable free WhoisGuard privacy protection (recommended)
2. **Auto-Renew**: Consider enabling to prevent accidental expiration
3. **PremiumDNS**: Skip this - you'll use Cloudflare DNS instead

### Step 3: Complete Purchase

1. Create a Namecheap account or log in
2. Complete payment
3. Verify domain ownership via email confirmation

### Step 4: Disable DNSSEC (Important)

Before transferring to Cloudflare DNS:

1. Go to **Domain List** in Namecheap dashboard
2. Click **Manage** next to your domain
3. Navigate to **Advanced DNS** tab
4. Find **DNSSEC** section and ensure it's **disabled**

> **Note**: DNSSEC must be disabled before changing nameservers to Cloudflare. You can re-enable it through Cloudflare after the transfer.

---

## Part 2: Cloudflare Account Setup

### Step 1: Create Cloudflare Account

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click **Sign Up**
3. Enter email and password
4. Verify your email address

### Step 2: Add Your Domain

1. Click **Add a Site** or **Add Site**
2. Enter your domain name (e.g., `pixelperfect.app`)
3. Click **Continue**

### Step 3: Select Plan

1. Choose the **Free** plan (sufficient for most applications)
2. Click **Continue**

### Step 4: DNS Scan

1. Cloudflare will scan for existing DNS records
2. Review the imported records
3. Click **Continue**

### Step 5: Note Your Nameservers

Cloudflare will provide two nameservers, for example:

```
brad.ns.cloudflare.com
vita.ns.cloudflare.com
```

**Save these** - you'll need them in the next step.

---

## Part 3: Transfer DNS to Cloudflare

### Step 1: Update Nameservers in Namecheap

1. Log into your [Namecheap account](https://www.namecheap.com/myaccount/login/)
2. Go to **Domain List**
3. Click **Manage** next to your domain
4. Find the **Nameservers** section on the Domain tab
5. Change from **Namecheap BasicDNS** to **Custom DNS**
6. Enter Cloudflare's nameservers:
   - Nameserver 1: `brad.ns.cloudflare.com` (use your assigned server)
   - Nameserver 2: `vita.ns.cloudflare.com` (use your assigned server)
7. Click the **checkmark** to save

### Step 2: Verify in Cloudflare

1. Return to Cloudflare dashboard
2. Click **Check nameservers now**
3. Wait for verification (can take 5 minutes to 24 hours)

### Step 3: Confirmation

Once active, you'll see:

- Domain status changes to **Active**
- You'll receive an email confirmation from Cloudflare

> **Propagation Note**: DNS changes can take up to 24-48 hours to propagate globally, though it's usually much faster (5-30 minutes).

---

## Part 4: Deploy with OpenNext (Recommended)

> **Important**: Cloudflare now recommends using OpenNext with Cloudflare Workers instead of `@cloudflare/next-on-pages` (which is deprecated). This approach provides full support for Next.js 15 App Router, ISR, and server-side features.

### Step 1: Install Dependencies

```bash
yarn add @opennextjs/cloudflare@latest
yarn add -D wrangler@latest
```

### Step 2: Create Configuration Files

#### `wrangler.jsonc` (project root)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "pixelperfect",
  "compatibility_date": "2024-12-30",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "services": [
    {
      "binding": "WORKER_SELF_REFERENCE",
      "service": "pixelperfect"
    }
  ]
}
```

#### `open-next.config.ts` (project root)

```typescript
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Optional: Add R2 incremental cache for ISR
  // incrementalCache: r2IncrementalCache,
});
```

#### `.dev.vars` (for local development)

```
NEXTJS_ENV=development
```

#### `public/_headers` (caching rules)

```
/_next/static/*
  Cache-Control: public,max-age=31536000,immutable
```

### Step 3: Update `.gitignore`

Add the following:

```
.open-next
.dev.vars
```

### Step 4: Update `package.json` Scripts

```json
{
  "scripts": {
    "build": "next build",
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    "upload": "opennextjs-cloudflare build && opennextjs-cloudflare upload",
    "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
  }
}
```

### Step 5: Update Next.js Configuration

For local development with Cloudflare bindings, update `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ... your existing config
};

// Enable OpenNext dev server integration
if (process.env.NODE_ENV === "development") {
  const { initOpenNextCloudflareForDev } = await import(
    "@opennextjs/cloudflare"
  );
  initOpenNextCloudflareForDev();
}

export default nextConfig;
```

### Step 6: Remove Edge Runtime Declarations

If you have any `export const runtime = "edge";` declarations in your API routes, remove them. OpenNext uses the Node.js runtime.

### Step 7: Local Preview

```bash
yarn preview
```

This builds and runs the app locally using Wrangler.

### Step 8: Deploy

```bash
# Login to Cloudflare (first time only)
npx wrangler login

# Deploy
yarn deploy
```

---

## Part 5: Custom Domain Configuration

### Step 1: Access Worker Settings

1. Go to Cloudflare Dashboard
2. Navigate to **Workers & Pages**
3. Select your deployed application
4. Go to **Settings** > **Domains & Routes**

### Step 2: Add Custom Domain

1. Click **Add** > **Custom Domain**
2. Enter your domain: `pixelperfect.app`
3. Click **Add Custom Domain**

### Step 3: Add WWW Subdomain (Optional)

1. Click **Add** > **Custom Domain**
2. Enter: `www.pixelperfect.app`
3. Cloudflare will automatically configure DNS records

### Step 4: Verify DNS Records

In your Cloudflare DNS settings, you should see:

| Type  | Name | Content                       | Proxy |
| ----- | ---- | ----------------------------- | ----- |
| CNAME | @    | pixelperfect.workers.dev      | Yes   |
| CNAME | www  | pixelperfect.pages.dev        | Yes   |

> **Note**: The proxy status (orange cloud) should be enabled for security and performance benefits.

---

## Part 6: SSL/TLS and Security

### Step 1: Configure SSL/TLS Mode

1. Go to **SSL/TLS** in Cloudflare Dashboard
2. Select **Overview**
3. Set encryption mode to **Full (strict)**

### Step 2: Enable Security Features

Navigate to **SSL/TLS** > **Edge Certificates** and enable:

- **Always Use HTTPS**: Redirects HTTP to HTTPS
- **Automatic HTTPS Rewrites**: Fixes mixed content
- **Minimum TLS Version**: Set to TLS 1.2

### Step 3: Configure Additional Security (Optional)

In **Security** > **Settings**:

- **Security Level**: Medium
- **Challenge Passage**: 30 minutes
- **Browser Integrity Check**: On

### Step 4: Enable HSTS (Optional but Recommended)

In **SSL/TLS** > **Edge Certificates**:

1. Find **HTTP Strict Transport Security (HSTS)**
2. Click **Enable HSTS**
3. Configure:
   - Max Age: 6 months (or 1 year)
   - Include subdomains: Yes
   - Preload: Yes (after confirming everything works)

---

## Part 7: Environment Variables

### Step 1: Access Settings

1. Go to **Workers & Pages** > Your application
2. Navigate to **Settings** > **Variables and Secrets**

### Step 2: Add Production Variables

Click **Add** for each variable. Mark sensitive values as **Encrypt**.

#### Public Variables

```
NEXT_PUBLIC_BASE_URL=https://pixelperfect.app
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_AMPLITUDE_API_KEY=your_amplitude_key
NEXT_PUBLIC_GA_MEASUREMENT_ID=your_ga4_id
NEXT_PUBLIC_BASELIME_KEY=your_baselime_key
```

#### Server Secrets (Encrypt these)

```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_WEBHOOK_SECRET=your_webhook_secret
GEMINI_API_KEY=your_gemini_key
BASELIME_API_KEY=your_baselime_api_key
```

#### Stripe Price IDs

```
NEXT_PUBLIC_STRIPE_STARTER_CREDITS_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_PRO_CREDITS_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_ENTERPRISE_CREDITS_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_HOBBY_MONTHLY_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID=price_xxx
```

### Step 3: Redeploy

After adding environment variables, redeploy your application:

```bash
yarn deploy
```

---

## Part 8: Git Integration (CI/CD)

### Step 1: Connect Repository

1. Go to **Workers & Pages**
2. Click **Create** > **Pages** > **Connect to Git**
3. Select GitHub and authorize
4. Choose your repository

### Step 2: Configure Build Settings

- **Production branch**: `main` or `master`
- **Framework preset**: None (custom)
- **Build command**: `yarn deploy`
- **Build output directory**: `.open-next/assets`

### Step 3: Set Build Environment Variables

Add all environment variables in the build settings (same as Step 7).

### Step 4: Deploy Triggers

Configure automatic deployments:

- **Production**: Deploys on push to main branch
- **Preview**: Deploys on pull request creation

---

## Troubleshooting

### Common Issues

| Issue                         | Solution                                                                                                                          |
| :---------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| **Nameservers not updating**  | Wait 24-48 hours. Clear DNS cache: `sudo dscacheutil -flushcache` (macOS) or `ipconfig /flushdns` (Windows)                       |
| **SSL certificate pending**   | Ensure nameservers are correctly pointed to Cloudflare. Wait up to 24 hours.                                                      |
| **Build fails**               | Check Wrangler version is 3.99.0+. Ensure `nodejs_compat` flag is set.                                                            |
| **Worker size exceeded**      | Free plan: 3MB limit. Paid plan: 10MB. Consider code splitting or upgrading.                                                      |
| **Environment vars not found** | Redeploy after adding variables. Check variable names match exactly.                                                              |
| **API routes returning 404**  | Ensure routes don't have `export const runtime = "edge"`. Check wrangler.jsonc configuration.                                     |
| **Database connection errors** | Verify `SUPABASE_SERVICE_ROLE_KEY` is set. Check Supabase URL.                                                                    |
| **Mixed content warnings**    | Enable "Automatic HTTPS Rewrites" in Cloudflare SSL/TLS settings.                                                                 |

### Verify Deployment

After deployment, verify these endpoints:

```bash
# Health check
curl https://pixelperfect.app/api/health

# Sitemap
curl https://pixelperfect.app/sitemap.xml

# Robots.txt
curl https://pixelperfect.app/robots.txt
```

### Check Logs

View real-time logs:

```bash
npx wrangler tail
```

Or in Cloudflare Dashboard:

1. Go to **Workers & Pages** > Your application
2. Click **Logs** tab
3. View real-time or historical logs

---

## Post-Deployment Checklist

- [ ] Domain resolves correctly (`https://yourdomain.com`)
- [ ] SSL certificate is valid and shows padlock
- [ ] All pages load without errors
- [ ] API routes respond correctly
- [ ] Environment variables are accessible
- [ ] Database connections work (Supabase)
- [ ] Payment processing works (Stripe)
- [ ] Analytics tracking works (Amplitude + GA4)
- [ ] Error monitoring works (Baselime)
- [ ] WWW redirect configured (if applicable)
- [ ] Sitemap accessible at `/sitemap.xml`
- [ ] Robots.txt accessible at `/robots.txt`
- [ ] HSTS enabled (optional)

---

## References

- [Namecheap DNS to Cloudflare Guide](https://www.namecheap.com/support/knowledgebase/article.aspx/9607/2210/how-to-set-up-dns-records-for-your-domain-in-a-cloudflare-account/)
- [Cloudflare Nameserver Setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)
- [OpenNext Cloudflare Documentation](https://opennext.js.org/cloudflare)
- [OpenNext Getting Started Guide](https://opennext.js.org/cloudflare/get-started)
- [Cloudflare Workers Next.js Guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare Pages Next.js SSR (Legacy)](https://developers.cloudflare.com/pages/framework-guides/nextjs/ssr/)
