# Google OAuth Setup Guide

This guide walks you through setting up Google OAuth for authentication with Supabase.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Google Cloud Console Setup](#google-cloud-console-setup)
4. [Supabase Configuration](#supabase-configuration)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)

## Overview

Google OAuth allows users to sign in to your application using their Google account. This provides:

- **Seamless UX** - One-click sign in with existing Google accounts
- **Security** - No password management required
- **Profile Data** - Access to user's name, email, and profile picture

### Authentication Flow

```
User clicks "Sign in with Google"
    ↓
Redirect to Google OAuth consent screen
    ↓
User grants permission
    ↓
Google redirects to Supabase callback URL
    ↓
Supabase creates/updates user and session
    ↓
Redirect to your application
```

## Prerequisites

1. **Google Account** with access to [Google Cloud Console](https://console.cloud.google.com/)
2. **Supabase Project** - See [Supabase Setup Guide](./supabase-setup.md)
3. **Your Supabase callback URL**: `https://xqysaylskffsfwunczbd.supabase.co/auth/v1/callback`

## Google Cloud Console Setup

### Step 1: Create or Select a Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown (top-left, next to "Google Cloud")
3. Click **New Project** or select an existing one
4. Enter a project name (e.g., `pixelperfect-auth`)
5. Click **Create**

### Step 2: Configure OAuth Consent Screen

1. Navigate to **APIs & Services** → **OAuth consent screen**
2. Select **User Type**:
   - **Internal** - Only users in your Google Workspace organization
   - **External** - Any Google account (select this for public apps)
3. Click **Create**

#### Fill in App Information:

| Field              | Value                                       |
| ------------------ | ------------------------------------------- |
| App name           | Your app name (e.g., `PixelPerfect`)        |
| User support email | Your email                                  |
| App logo           | (Optional) Upload your logo                 |
| App domain         | Your production domain                      |
| Authorized domains | `supabase.co` (required for Supabase OAuth) |
| Developer contact  | Your email                                  |

4. Click **Save and Continue**

#### Configure Scopes:

1. Click **Add or Remove Scopes**
2. Select these scopes:
   - `openid` - Required for authentication
   - `email` - Access user's email
   - `profile` - Access user's name and profile picture
3. Click **Update**
4. Click **Save and Continue**

#### Test Users (External apps only):

If your app is in "Testing" mode, add test user emails:

1. Click **Add Users**
2. Enter email addresses that can test the OAuth flow
3. Click **Save and Continue**

### Step 3: Create OAuth Credentials

1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Application type**: `Web application`
4. Enter a name (e.g., `PixelPerfect Web Client`)

#### Configure Authorized JavaScript Origins:

Add all domains your app runs from (this allows the OAuth popup to initiate):

```
http://localhost:3000
https://yourdomain.com
https://www.yourdomain.com
https://your-project.pages.dev
```

> **Note:** These are your app's domains, not Supabase's domain.

#### Configure Authorized Redirect URIs:

Add **only** your Supabase callback URL:

```
https://xqysaylskffsfwunczbd.supabase.co/auth/v1/callback
```

> **Important:**
>
> - Do NOT add localhost or your app's domains here
> - Google redirects to Supabase's callback URL (not your app)
> - Supabase then redirects back to your app automatically

5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

### Step 4: Save Your Credentials

Store these securely - you'll need them for Supabase configuration:

```
Client ID: 123456789-abcdefg.apps.googleusercontent.com
Client Secret: GOCSPX-xxxxxxxxxxxxxxxx
```

## Supabase Configuration

### Step 1: Find Your Callback URL

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Click on **Google**
5. Copy the **Callback URL** shown

### Step 2: Enable Google Provider

1. Toggle **Enable Google provider** to ON
2. Paste your **Client ID** from Google Cloud
3. Paste your **Client Secret** from Google Cloud
4. Click **Save**

### Step 3: Configure Redirect URLs

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

> **Note:** Use wildcard `/**` to allow any path on these domains.

## Testing

### Local Development

1. Start your development server:

   ```bash
   yarn dev
   ```

2. Navigate to your login page

3. Click "Sign in with Google"

4. Select your Google account (must be a test user if app is in Testing mode)

5. Grant permissions on the consent screen

6. You should be redirected back to your app, authenticated

### Verify User Creation

Check that the user was created in Supabase:

```sql
-- In Supabase SQL Editor
SELECT id, email, raw_user_meta_data
FROM auth.users
WHERE email = 'your-email@gmail.com';
```

## Production Deployment

### Publishing Your OAuth App

Before going live, you need to publish your OAuth consent screen:

1. Go to **OAuth consent screen** in Google Cloud Console
2. Click **Publish App**
3. Confirm the warning about verification

> **Note:** For apps requesting sensitive scopes or with many users, Google may require verification. This can take several days.

### Production Checklist

- [ ] Add production domain to Authorized JavaScript Origins
- [ ] Add production Supabase callback URL to Authorized Redirect URIs
- [ ] Update Supabase Site URL to production domain
- [ ] Add production URLs to Supabase Redirect URLs
- [ ] Publish OAuth consent screen (move out of Testing mode)
- [ ] Test OAuth flow on production

### Cloudflare Pages Deployment

No additional environment variables needed for Google OAuth - credentials are stored in Supabase.

## Troubleshooting

### "Error 400: redirect_uri_mismatch"

**Cause:** The redirect URI doesn't match what's configured in Google Cloud.

**Solution:**

1. Check your Supabase callback URL: `https://xxxxx.supabase.co/auth/v1/callback`
2. Ensure this EXACT URL is in Google Cloud Console → Credentials → Authorized redirect URIs
3. Wait 5 minutes for changes to propagate

### "Access blocked: App is in testing mode"

**Cause:** OAuth consent screen is in Testing mode and user isn't a test user.

**Solution:**

1. Add the user's email to Test Users in OAuth consent screen
2. OR publish the app (OAuth consent screen → Publish App)

### "Sign in with Google" button not working

**Cause:** Missing or incorrect Google credentials in Supabase.

**Solution:**

1. Verify Client ID and Client Secret in Supabase → Authentication → Providers → Google
2. Ensure Google provider is enabled (toggle ON)

### User not created in database

**Cause:** Profile trigger not working or RLS issues.

**Solution:**

1. Check `handle_new_user` trigger exists (see [Supabase Setup](./supabase-setup.md))
2. Verify the user exists in `auth.users` table
3. Manually create profile if needed:
   ```sql
   INSERT INTO profiles (id, email, full_name, avatar_url)
   SELECT id, email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'avatar_url'
   FROM auth.users WHERE email = 'user@gmail.com';
   ```

### "This app isn't verified"

**Cause:** Google showing warning for unverified apps requesting sensitive scopes.

**Solution:**

1. For development/testing, click "Advanced" → "Go to [App Name] (unsafe)"
2. For production, submit app for verification in OAuth consent screen

### CORS errors

**Cause:** Missing authorized JavaScript origin.

**Solution:**

1. Add your domain to Authorized JavaScript Origins in Google Cloud Console
2. Include both `http://` and `https://` versions
3. Include both `www` and non-`www` versions if applicable

## Security Best Practices

1. **Restrict authorized domains** - Only add domains you control
2. **Use HTTPS in production** - Required for OAuth
3. **Don't expose Client Secret** - Keep it in Supabase only
4. **Review scopes** - Only request what you need
5. **Monitor OAuth consent screen** - Check for suspicious activity

## Additional Resources

- [Supabase Google Auth Docs](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)
