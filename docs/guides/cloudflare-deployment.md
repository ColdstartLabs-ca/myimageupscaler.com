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

## 3. Troubleshooting

| Issue                                   | Solution                                                                                                                                                                           |
| :-------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build fails on "Image Optimization"** | Next.js Image Optimization is not supported on Pages by default. Use `unoptimized: true` in `next.config.js` or use Cloudflare Images.                                             |
| **"Edge Runtime" errors**               | Ensure `export const runtime = 'edge'` is set in your API routes if they use Edge-specific APIs, though `next-on-pages` usually handles standard Node.js APIs via the compat flag. |
| **Environment Variables**               | Add secrets (API keys) in the Cloudflare Dashboard under **Settings** > **Environment Variables**. For local dev, use a `.dev.vars` file.                                          |
