# GitHub OAuth Setup Guide

This guide walks you through setting up GitHub OAuth for authentication with Supabase.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [GitHub OAuth App Setup](#github-oauth-app-setup)
4. [Supabase Configuration](#supabase-configuration)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)

## Overview

GitHub OAuth allows users to sign in to your application using their GitHub account. This is particularly useful for:

- **Developer-focused apps** - Your users likely already have GitHub accounts
- **Seamless UX** - One-click sign in
- **Access to GitHub data** - Optionally access repos, gists, etc.

### Authentication Flow

```
User clicks "Sign in with GitHub"
    ↓
Redirect to GitHub authorization page
    ↓
User grants permission
    ↓
GitHub redirects to Supabase callback URL
    ↓
Supabase creates/updates user and session
    ↓
Redirect to your application
```

## Prerequisites

1. **GitHub Account** - Any GitHub account can create OAuth apps
2. **Supabase Project** - See [Supabase Setup Guide](./supabase-setup.md)
3. **Your Supabase callback URL** (format: `https://xxxxx.supabase.co/auth/v1/callback`)

## GitHub OAuth App Setup

### Step 1: Navigate to Developer Settings

1. Go to [GitHub](https://github.com) and sign in
2. Click your profile picture (top-right) → **Settings**
3. Scroll down to **Developer settings** (bottom of left sidebar)
4. Click **OAuth Apps**

Or go directly to: [github.com/settings/developers](https://github.com/settings/developers)

### Step 2: Create New OAuth App

1. Click **New OAuth App** (or **Register a new application**)

2. Fill in the application details:

| Field                          | Value                                                  |
| ------------------------------ | ------------------------------------------------------ |
| **Application name**           | Your app name (e.g., `PixelPerfect`)                   |
| **Homepage URL**               | Your app's homepage (e.g., `https://pixelperfect.app`) |
| **Application description**    | (Optional) Brief description                           |
| **Authorization callback URL** | Your Supabase callback URL                             |

### Step 3: Get Your Callback URL

Before filling in the callback URL, get it from Supabase:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Click on **GitHub**
5. Copy the **Callback URL** shown (format: `https://xxxxx.supabase.co/auth/v1/callback`)

### Step 4: Complete Registration

1. Paste the Supabase callback URL in **Authorization callback URL**
2. Click **Register application**

### Step 5: Get Credentials

After registration, you'll see your app's settings page:

1. Copy the **Client ID** (displayed on the page)
2. Click **Generate a new client secret**
3. Copy the **Client Secret** immediately (it won't be shown again!)

```
Client ID: Iv1.xxxxxxxxxxxxxxxx
Client Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Warning:** Store the Client Secret securely. If you lose it, you'll need to generate a new one.

### Step 6: (Optional) Upload App Logo

1. Click **Upload new logo**
2. Upload a square image (recommended: 512x512 px)
3. This logo appears on the GitHub authorization page

## Supabase Configuration

### Step 1: Enable GitHub Provider

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Click on **GitHub** to expand
5. Toggle **Enable GitHub provider** to ON
6. Paste your **Client ID** from GitHub
7. Paste your **Client Secret** from GitHub
8. Click **Save**

### Step 2: Configure Redirect URLs

1. Navigate to **Authentication** → **URL Configuration**
2. Set **Site URL** to your production URL:
   ```
   https://yourdomain.com
   ```
3. Add **Redirect URLs** for all environments:
   ```
   http://localhost:3000/**
   http://localhost:8788/**
   https://yourdomain.com/**
   https://www.yourdomain.com/**
   https://your-project.pages.dev/**
   ```

## Testing

### Local Development

1. Start your development server:

   ```bash
   yarn dev
   ```

2. Navigate to your login page

3. Click "Sign in with GitHub"

4. Authorize the app on GitHub's authorization page

5. You should be redirected back to your app, authenticated

### Verify User Creation

Check that the user was created in Supabase:

```sql
-- In Supabase SQL Editor
SELECT id, email, raw_user_meta_data
FROM auth.users
WHERE raw_user_meta_data->>'provider_id' IS NOT NULL;
```

The `raw_user_meta_data` will contain:

- `user_name` - GitHub username
- `avatar_url` - Profile picture URL
- `full_name` - Display name (if set)

## Production Deployment

### Update GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click on your OAuth app
3. Update **Homepage URL** to production URL
4. The **Authorization callback URL** should already be your Supabase URL (no change needed)

### Production Checklist

- [ ] Update Homepage URL in GitHub OAuth app
- [ ] Update Supabase Site URL to production domain
- [ ] Add production URLs to Supabase Redirect URLs
- [ ] Test OAuth flow on production
- [ ] (Optional) Add app logo for better branding

### Organization OAuth Apps

For production apps, consider creating the OAuth app under a GitHub Organization:

1. Go to your organization's settings
2. Navigate to **Developer settings** → **OAuth Apps**
3. Create the app there

Benefits:

- Multiple maintainers can manage the app
- Professional appearance (org name shown in authorization)
- Centralized credential management

## Troubleshooting

### "The redirect_uri is not valid"

**Cause:** Callback URL mismatch between GitHub and Supabase.

**Solution:**

1. Copy the exact callback URL from Supabase → Authentication → Providers → GitHub
2. Update the Authorization callback URL in GitHub OAuth app settings
3. Ensure no trailing slash differences

### "Application suspended"

**Cause:** GitHub suspended the OAuth app (usually due to policy violations).

**Solution:**

1. Check your email for notices from GitHub
2. Review [GitHub's OAuth app policies](https://docs.github.com/en/developers/apps/building-oauth-apps/creating-an-oauth-app)
3. Contact GitHub support if needed

### User not created in database

**Cause:** Profile trigger not working.

**Solution:**

1. Check `handle_new_user` trigger exists (see [Supabase Setup](./supabase-setup.md))
2. Verify user exists in `auth.users`
3. Manually create profile:
   ```sql
   INSERT INTO profiles (id, email, full_name, avatar_url)
   SELECT
     id,
     email,
     raw_user_meta_data->>'full_name',
     raw_user_meta_data->>'avatar_url'
   FROM auth.users
   WHERE id = 'user-uuid';
   ```

### "Bad credentials" error

**Cause:** Invalid or expired Client Secret.

**Solution:**

1. Generate a new Client Secret in GitHub OAuth app settings
2. Update the secret in Supabase → Authentication → Providers → GitHub
3. Note: Old secret is invalidated immediately

### Private email not accessible

**Cause:** User has email set to private on GitHub.

**Solution:**
GitHub provides a fallback email format: `{id}+{username}@users.noreply.github.com`

To request email scope explicitly, you can modify the auth call:

```typescript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    scopes: 'user:email',
  },
});
```

### Rate limiting

**Cause:** Too many OAuth requests from your app.

**Solution:**

1. Implement proper session management (don't re-auth unnecessarily)
2. Use refresh tokens instead of new OAuth flows
3. Consider caching user data

## Advanced Configuration

### Requesting Additional Scopes

By default, GitHub OAuth provides basic profile info. For additional access:

```typescript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    scopes: 'read:user user:email repo',
    redirectTo: `${window.location.origin}/auth/callback`,
  },
});
```

Common scopes:
| Scope | Access |
|-------|--------|
| `read:user` | Read user profile data |
| `user:email` | Read user email addresses |
| `repo` | Full access to repositories |
| `public_repo` | Access to public repositories only |

### GitHub App vs OAuth App

For more advanced use cases, consider a [GitHub App](https://docs.github.com/en/developers/apps/building-github-apps):

| Feature      | OAuth App   | GitHub App          |
| ------------ | ----------- | ------------------- |
| Rate limits  | Lower       | Higher              |
| Permissions  | User-level  | Fine-grained        |
| Installation | Per-user    | Per-org/repo        |
| Best for     | Simple auth | GitHub integrations |

## Security Best Practices

1. **Keep Client Secret secure** - Never commit to version control
2. **Use HTTPS** - Required for production OAuth
3. **Validate state parameter** - Supabase handles this automatically
4. **Limit scopes** - Only request what you need
5. **Rotate secrets periodically** - Generate new secrets and update Supabase

## Additional Resources

- [Supabase GitHub Auth Docs](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [GitHub Developer Settings](https://github.com/settings/developers)
