# Supabase Setup Guide

This guide will walk you through setting up Supabase for authentication, database, and backend services.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Project Setup](#project-setup)
4. [Authentication Configuration](#authentication-configuration)
5. [Database Setup](#database-setup)
6. [Environment Variables](#environment-variables)
7. [Row Level Security (RLS)](#row-level-security-rls)
8. [Testing](#testing)
9. [Production Deployment](#production-deployment)
10. [API Key System (Publishable & Secret Keys)](#api-key-system-publishable--secret-keys)

## Overview

Supabase provides:

- **Authentication** - Email/password, OAuth providers (Google, GitHub)
- **PostgreSQL Database** - Fully managed, scalable database
- **Row Level Security** - Fine-grained access control at the database level
- **Real-time Subscriptions** - Live data updates (optional)
- **Storage** - File storage with security rules (optional)

### Architecture

```
Frontend (Next.js)
    ↓
Supabase Client (@supabase/ssr)
    ↓
Supabase Auth ←→ Supabase Database
    ↑
API Routes (Service Role Key)
```

## Prerequisites

1. **Supabase Account**: [Sign up for Supabase](https://supabase.com/dashboard)
2. **Node.js 18+**: Required for the application
3. **Yarn**: Package manager

## Project Setup

### Step 1: Create a Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Fill in:
   - **Name**: Your project name (e.g., `myimageupscaler.com`)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
4. Click **Create new project**
5. Wait for project to initialize (1-2 minutes)

### Step 2: Get API Keys

1. Go to [**Settings → API**](https://supabase.com/dashboard/project/_/settings/api) in the Supabase Dashboard
2. Copy these values:

| Key                       | Format                      | Description                 | Usage               |
| ------------------------- | --------------------------- | --------------------------- | ------------------- |
| **Project URL**           | `https://xxxxx.supabase.co` | Your project's API endpoint | Public, client-side |
| **Publishable key**       | `sb_publishable_...`        | New format (recommended)    | Public, client-side |
| **Secret key**            | `sb_secret_...`             | New format (recommended)    | Server-side ONLY    |
| **anon (legacy)**         | `eyJhbGci...` (JWT)         | Legacy format               | Public, client-side |
| **service_role (legacy)** | `eyJhbGci...` (JWT)         | Legacy format               | Server-side ONLY    |

> **Note:** Supabase now offers new `publishable` and `secret` keys with better security and performance. See [API Key System](#api-key-system-publishable--secret-keys) for details. Both key systems work simultaneously.

**Security Warning:**

- The `anon`/`publishable` key is safe to expose in client-side code
- The `service_role`/`secret` key bypasses RLS - **NEVER expose to clients**

## Authentication Configuration

### Step 1: Configure Auth Providers

Go to [**Authentication → Providers**](https://supabase.com/dashboard/project/_/auth/providers):

#### Email/Password (Enabled by default)

- Email authentication is enabled by default
- Configure whether users need to verify their email to sign in (enabled by default on hosted projects)

#### Google OAuth (Optional)

See the detailed [Google OAuth Setup Guide](./google-oauth-setup.md) for step-by-step instructions including:

- Creating a Google Cloud project
- Configuring OAuth consent screen
- Setting up credentials

#### GitHub OAuth (Optional)

See the detailed [GitHub OAuth Setup Guide](./github-oauth-setup.md) for step-by-step instructions including:

- Creating a GitHub OAuth App
- Configuring callback URLs
- Handling private emails

### Step 2: Configure URL Settings

Go to [**Authentication → URL Configuration**](https://supabase.com/dashboard/project/_/auth/url-configuration):

| Setting       | Development                | Production                  |
| ------------- | -------------------------- | --------------------------- |
| Site URL      | `http://localhost:3000`    | `https://yourdomain.com`    |
| Redirect URLs | `http://localhost:3000/**` | `https://yourdomain.com/**` |

> **Tip:** Use wildcard `/**` to allow any path on these domains. The globstar (`**`) matches any sequence of characters including path separators.

### Step 3: Email Templates (Optional)

Go to [**Authentication → Templates**](https://supabase.com/dashboard/project/_/auth/templates) to customize:

- Confirm signup
- Reset password
- Magic link
- Email change

> **Note:** For production use, consider configuring a custom SMTP server. The default email service has a rate limit and is on a best-effort basis. See the [Custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp) for instructions.

## Database Setup

This project includes migration files in `supabase/migrations/` and a setup script to apply them.

### Option 1: Automated Setup (Recommended)

Use the setup script to apply all migrations:

```bash
# Run the setup script
./scripts/setup-supabase.sh

# Or generate SQL for manual execution
./scripts/setup-supabase.sh --manual
```

Script options:
| Flag | Description |
|------|-------------|
| `--manual` | Generate combined SQL file for Supabase Dashboard |
| `--dry-run` | Preview what would be executed |
| `--skip-verify` | Skip verification checklist |

### Option 2: Manual Dashboard Setup

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor**
2. Run migrations in order from `supabase/migrations/`:
   - `20250120000000_create_profiles_table.sql`
   - `20250120000200_create_subscriptions_table.sql`
   - `20250121000000_create_credit_transactions_table.sql`
   - `20250121000100_create_processing_jobs_table.sql`
   - `20250120000100_create_rpc_functions.sql`
   - `20250121000200_enhanced_credit_functions.sql`
   - `20250121000300_fix_initial_credits.sql`

### What Gets Created

| Type          | Name                      | Description                        |
| ------------- | ------------------------- | ---------------------------------- |
| **Tables**    | `profiles`                | User profiles with credits balance |
|               | `subscriptions`           | Stripe subscription records        |
|               | `credit_transactions`     | Credit usage/purchase history      |
|               | `processing_jobs`         | Background job tracking            |
| **Functions** | `increment_credits`       | Add credits to user                |
|               | `decrement_credits`       | Use credits                        |
|               | `has_sufficient_credits`  | Check balance                      |
|               | `get_active_subscription` | Get user's subscription            |
| **Triggers**  | `on_auth_user_created`    | Auto-create profile on signup      |

### Verify Setup

Run this query to verify tables were created:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

Expected tables: `credit_transactions`, `processing_jobs`, `profiles`, `subscriptions`

## Environment Variables

### Local Development

Create two environment files:

**`.env`** - Public variables:

```bash
# Supabase - Get from: Supabase Dashboard > Settings > API
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# App
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=MyImageUpscaler
```

**`.env.prod`** - Server-side secrets (NEVER commit):

```bash
# Supabase - Get from: Supabase Dashboard > Settings > API
# This is the service_role key (NOT anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Getting Your Keys

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to [**Settings → API**](https://supabase.com/dashboard/project/_/settings/api)
4. Copy the values:

| Dashboard Field | Environment Variable            |
| --------------- | ------------------------------- |
| Project URL     | `NEXT_PUBLIC_SUPABASE_URL`      |
| anon public     | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role    | `SUPABASE_SERVICE_ROLE_KEY`     |

### Security Notes

| Variable                        | Exposure        | Usage                                |
| ------------------------------- | --------------- | ------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Public (client) | Used in browser                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (client) | Used in browser, respects RLS        |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server ONLY     | Bypasses RLS, use in API routes only |

## Row Level Security (RLS)

RLS policies control who can access what data at the database level.

### Understanding RLS

```sql
-- Users can only see their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
```

This means:

- `auth.uid()` returns the current authenticated user's ID
- `id` is the profile's ID
- The policy only returns rows where these match

### Default Policies Created

| Table               | Policy     | Description                        |
| ------------------- | ---------- | ---------------------------------- |
| profiles            | SELECT own | Users see only their profile       |
| profiles            | UPDATE own | Users update only their profile    |
| subscriptions       | SELECT own | Users see only their subscriptions |
| credit_transactions | SELECT own | Users see only their transactions  |

### Service Role Bypass

The `service_role` key bypasses ALL RLS policies. Use it only in:

- API routes (server-side)
- Webhooks
- Admin operations
- E2E tests

```typescript
// Client-side (respects RLS)
const supabase = createBrowserClient(url, anonKey);

// Server-side (bypasses RLS)
const supabaseAdmin = createClient(url, serviceRoleKey);
```

## Testing

### Test Authentication Flow

1. Start the development server:

   ```bash
   yarn dev
   ```

2. Navigate to `http://localhost:3000`

3. Click "Sign In" and test:
   - Email/password signup
   - Email/password login
   - OAuth login (if configured)

### Test Database Access

```sql
-- In Supabase SQL Editor

-- Check if profiles are created on signup
SELECT * FROM profiles LIMIT 5;

-- Check RLS is working (should return nothing when not authenticated)
SELECT * FROM profiles;

-- Test RPC function
SELECT add_credits('user-uuid-here', 100, 'test', 'test-ref', 'Test credits');
```

### Test API Routes

```bash
# Health check
curl http://localhost:3000/api/health

# Billing info (requires auth)
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  http://localhost:3000/api/billing
```

### E2E Tests

Billing E2E tests require the service role key:

```bash
# Ensure .env.prod has SUPABASE_SERVICE_ROLE_KEY
yarn test:e2e
```

See [E2E Testing Setup Guide](./e2e-testing-setup.md) for details.

## Production Deployment

### Cloudflare Pages

Set environment variables in Cloudflare Dashboard:

1. Go to **Workers & Pages** → Your Project → **Settings** → **Environment Variables**
2. Add:

| Variable                        | Type       |
| ------------------------------- | ---------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Plain text |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Plain text |
| `SUPABASE_SERVICE_ROLE_KEY`     | Encrypted  |

### Production Checklist

- [ ] Run all database migrations in production Supabase
- [ ] Verify RLS policies are enabled on all tables
- [ ] Set production Site URL in Supabase Auth settings
- [ ] Add production domain to Redirect URLs
- [ ] Configure OAuth providers with production URLs
- [ ] Set all environment variables in Cloudflare
- [ ] Test authentication flow in production
- [ ] Monitor Supabase logs for errors

### Monitoring

1. **Supabase Dashboard** → **Logs** - Database and auth logs
2. **Supabase Dashboard** → **Reports** - Usage statistics
3. **Supabase Dashboard** → **Database** → **Roles** - Check permissions

## Troubleshooting

### "Invalid API key"

- Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
- Check `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the anon key (not service role)
- Ensure no extra whitespace in environment variables

### "User not found" / Profile not created

- Check the `handle_new_user` trigger exists
- Manually create profile:
  ```sql
  INSERT INTO profiles (id, email)
  SELECT id, email FROM auth.users WHERE id = 'user-uuid';
  ```

### RLS Policy Errors

- Ensure `auth.uid()` is being called (user is authenticated)
- Check policy conditions match your data structure
- Test with service role to bypass RLS and verify data exists

### "Permission denied for table"

- Enable RLS on the table: `ALTER TABLE tablename ENABLE ROW LEVEL SECURITY;`
- Create appropriate policies for the operation (SELECT, INSERT, UPDATE, DELETE)

### Service Role Key Not Working

- Ensure you copied the `service_role` key (not anon)
- Check it's in `.env.prod` (not `.env`)
- Verify the key hasn't been rotated in Supabase Dashboard

## Security Best Practices

1. **Never expose service role key** - Only use in server-side code
2. **Enable RLS on all tables** - Default deny all access
3. **Use RPC functions for sensitive operations** - Better control and logging
4. **Rotate keys if compromised** - Regenerate in Supabase Dashboard
5. **Monitor auth logs** - Watch for suspicious activity
6. **Use strong database password** - Generated during project creation
7. **Enable MFA for Supabase account** - Protect your dashboard access

## API Key System (Publishable & Secret Keys)

Supabase now offers two API key systems. The new **publishable** and **secret** keys are recommended for all new projects and provide significant security and performance improvements.

### API Key Types

| Type                    | Format               | Privileges | Usage                                                  |
| ----------------------- | -------------------- | ---------- | ------------------------------------------------------ |
| **Publishable key**     | `sb_publishable_...` | Low        | Safe for client-side: web pages, mobile apps, CLIs     |
| **Secret key**          | `sb_secret_...`      | Elevated   | Server-side ONLY: API routes, Edge Functions, webhooks |
| `anon` (legacy)         | JWT                  | Low        | Same as publishable key                                |
| `service_role` (legacy) | JWT                  | Elevated   | Same as secret key                                     |

### Why Use New Keys?

| Benefit         | Legacy (`anon`/`service_role`)           | New (`publishable`/`secret`)    |
| --------------- | ---------------------------------------- | ------------------------------- |
| **Performance** | JWT validation requires Auth server call | Local JWT verification (faster) |
| **Rotation**    | Rotating JWT secret causes downtime      | Zero-downtime rotation          |
| **Security**    | All keys tied to single JWT secret       | Independent key management      |
| **Revocation**  | Requires careful coordination            | Instant, reversible revocation  |

### Key Differences

1. **Independent Rotation** - Secret keys can be rotated without affecting publishable keys
2. **Browser Protection** - Secret keys automatically reject browser requests (401 Unauthorized)
3. **Multiple Secret Keys** - Create separate secret keys for different backend components
4. **No JWT Secret Exposure** - Private keys cannot be extracted from Supabase

### Migration Steps

1. Go to [**Settings → API**](https://supabase.com/dashboard/project/_/settings/api) in the Supabase Dashboard
2. Find the new publishable and secret keys (or create them if not yet available)
3. Update your environment variables:

```bash
# .env (public)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx  # New format

# .env.prod (server-side)
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx  # New format
```

4. Update code to use new auth patterns (optional but recommended):

```typescript
// Old way (requires server call)
const {
  data: { user },
} = await supabase.auth.getUser();

// New way (local verification with asymmetric keys)
const {
  data: { claims },
} = await supabase.auth.getClaims();
```

5. Test your application with the new keys
6. Once confirmed working, disable the legacy keys in the dashboard

### Current Status

**Both key systems work simultaneously.** You can migrate at your own pace:

- Legacy keys (`anon`, `service_role`) remain functional
- New keys available now in the Supabase Dashboard
- Recommended: Use new keys for better security and performance

### Known Limitations

- **Edge Functions**: Currently only support JWT verification via legacy keys. Use `--no-verify-jwt` flag with new keys and implement your own verification
- **CLI/Self-hosting**: Publishable and secret keys are only available on the hosted platform

### Resources

- [Understanding API Keys](https://supabase.com/docs/guides/api/api-keys)
- [JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys)
- [Migration Guide (Nuxt)](https://supabase.nuxtjs.org/getting-started/migration)

## Support

- **Supabase Docs**: https://supabase.com/docs
- **Supabase Discord**: https://discord.supabase.com
- **GitHub Issues**: Report project-specific issues
