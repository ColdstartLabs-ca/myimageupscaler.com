# Cloudflare Pages Deployment Guide

This guide details how to deploy the PixelPerfect application to Cloudflare Pages using the `@cloudflare/next-on-pages` adapter.

## Prerequisites

1.  **Cloudflare Account**: You need an active account.
2.  **Wrangler CLI**: Installed via `npm install -g wrangler` (or used via `npx`).
3.  **Project Setup**: Ensure you have run `yarn install` and the project is configured as per the PRD.

---

## 1. Local Build & Preview

Before deploying, verify the build locally to ensure the Cloudflare adapter works correctly.

### Step 1: Build

Run the pages build script to generate the worker and static assets.

```bash
yarn pages:build
```

_Success_: This should create a `.vercel/output` directory.

### Step 2: Preview

Run the local Cloudflare emulation.

```bash
yarn pages:preview
```

_Success_: The app should be accessible at `http://localhost:8788`.
_Verify_: Visit `http://localhost:8788/api/health` to check the worker status.

---

## 2. Deployment Methods

### Option A: Direct Upload (Fastest for Dev)

Use Wrangler to upload the built assets directly from your machine.

1.  **Login** (if not already logged in):

    ```bash
    npx wrangler login
    ```

2.  **Deploy**:

    ```bash
    yarn deploy
    ```

    _Note_: This runs `pages:build` and then `wrangler pages deploy`.

3.  **Verify**: Wrangler will output a URL (e.g., `https://pixelperfect.pages.dev`).

### Option B: Git Integration (Recommended for Production)

Connect your GitHub repository to Cloudflare Pages for automatic deployments.

1.  **Push Code**: Ensure your changes (including `wrangler.toml` and `package.json` updates) are pushed to GitHub.
2.  **Cloudflare Dashboard**:
    - Go to **Workers & Pages** > **Create Application** > **Pages** > **Connect to Git**.
    - Select the `pixelperfect` repository.
3.  **Build Settings**:
    - **Framework Preset**: `Next.js`
    - **Build Command**: `npx @cloudflare/next-on-pages` (or `yarn pages:build`)
    - **Build Output Directory**: `.vercel/output/static`
    - **Node.js Compatibility**: Ensure the `nodejs_compat` flag is set in **Settings** > **Functions** > **Compatibility Flags**, OR ensure `wrangler.toml` is present in the root.

---

## 3. Production Environment Variables

You must configure the following environment variables in Cloudflare Pages Dashboard before deployment:

### Required Variables

Navigate to **Settings** > **Environment Variables** in your Cloudflare Pages project and add:

#### Public Variables (from `.env.example`)

```bash
NEXT_PUBLIC_BASE_URL=https://pixelperfect.app
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_AMPLITUDE_API_KEY=your_amplitude_api_key
NEXT_PUBLIC_GA_MEASUREMENT_ID=your_ga4_measurement_id
NEXT_PUBLIC_BASELIME_KEY=your_baselime_public_key
```

#### Server-Side Secrets (from `.env.prod.example`)

```bash
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
GEMINI_API_KEY=your_gemini_api_key
BASELIME_API_KEY=your_baselime_server_api_key
```

#### Stripe Price IDs

```bash
NEXT_PUBLIC_STRIPE_STARTER_CREDITS_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_PRO_CREDITS_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_ENTERPRISE_CREDITS_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_HOBBY_MONTHLY_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID=price_xxx
```

### Important Notes

- **Never commit** `.env` or `.env.prod` files to version control
- Set variables for both **Production** and **Preview** environments
- After adding variables, trigger a new deployment for changes to take effect
- Use the `.env.example` and `.env.prod.example` files as reference

## 4. Custom Domain Configuration

### Step 1: Add Custom Domain

1. Go to **Custom domains** in your Cloudflare Pages project
2. Click **Set up a custom domain**
3. Enter `pixelperfect.app`
4. Click **Continue**

### Step 2: Configure DNS

If your domain is already on Cloudflare:

1. DNS records will be automatically configured
2. SSL certificate will be automatically provisioned

If your domain is external:

1. Add a CNAME record pointing to your `*.pages.dev` URL
2. Wait for DNS propagation (up to 48 hours)

### Step 3: SSL/TLS Settings

1. Go to **SSL/TLS** in Cloudflare Dashboard
2. Set encryption mode to **Full (strict)**
3. Enable **Always Use HTTPS**
4. Enable **Automatic HTTPS Rewrites**

### Step 4: Verify

1. Visit `https://pixelperfect.app`
2. Check SSL certificate (should show valid certificate)
3. Test all critical routes:
   - `/` - Landing page
   - `/upscaler` - Upscaler page
   - `/pricing` - Pricing page
   - `/help` - Help page
   - `/api/health` - Health check

## 5. Post-Deployment Verification Checklist

- [ ] Application loads successfully
- [ ] SSL certificate is valid
- [ ] All environment variables are accessible
- [ ] Database connections work (Supabase)
- [ ] Payment processing works (Stripe)
- [ ] Image processing works (Gemini API)
- [ ] Analytics tracking works (Amplitude + GA4)
- [ ] Error monitoring works (Baselime)
- [ ] Health check endpoint returns 200: `/api/health`
- [ ] Sitemap accessible: `/sitemap.xml`
- [ ] Robots.txt accessible: `/robots.txt`

## 6. Troubleshooting

| Issue                                   | Solution                                                                                                                                                                           |
| :-------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build fails on "Image Optimization"** | Next.js Image Optimization is not supported on Pages by default. Use `unoptimized: true` in `next.config.js` or use Cloudflare Images.                                             |
| **"Edge Runtime" errors**               | Ensure `export const runtime = 'edge'` is set in your API routes if they use Edge-specific APIs, though `next-on-pages` usually handles standard Node.js APIs via the compat flag. |
| **Environment Variables not loading**   | Ensure variables are set for the correct environment (Production/Preview). Trigger a new deployment after adding variables.                                                        |
| **API routes failing**                  | Check that all server-side secrets are configured. Review function logs in Cloudflare Dashboard.                                                                                   |
| **Database connection errors**          | Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly. Check Supabase project URL matches.                                                                                           |
| **Stripe webhooks failing**             | Update webhook endpoint in Stripe Dashboard to `https://pixelperfect.app/api/webhooks/stripe`. Verify webhook secret matches.                                                      |
