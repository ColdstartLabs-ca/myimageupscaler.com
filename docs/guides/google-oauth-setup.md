# Google OAuth Setup Guide

This guide walks you through setting up Google OAuth for authentication with Supabase, using Google Identity Services (GIS) for native sign-in.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Google Cloud Console Setup](#google-cloud-console-setup)
4. [Supabase Configuration](#supabase-configuration)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)

## Overview

This app uses **Google Identity Services (GIS)** for native Google sign-in. This provides:

- **Native App Branding** - Consent screen shows your domain (myimageupscaler.com) instead of Supabase's
- **Better UX** - Popup-based flow keeps users on your site
- **FedCM Ready** - Compatible with Chrome's third-party cookie phase-out
- **Seamless Fallback** - Automatically falls back to redirect OAuth if GIS unavailable

### Authentication Flow (GIS - Primary)

```
User clicks "Sign in with Google"
    ↓
Google Identity Services popup appears
(Shows: "Continue to myimageupscaler.com")
    ↓
User selects Google account
    ↓
Google returns ID token to browser
    ↓
App calls supabase.auth.signInWithIdToken()
    ↓
Supabase validates token and creates session
    ↓
User redirected to dashboard
```

### Fallback Flow (Redirect OAuth)

If GIS is unavailable (script blocked, browser incompatible), the app automatically falls back to redirect-based OAuth:

```
User clicks "Sign in with Google"
    ↓
Redirect to Google OAuth consent screen
(Shows: "Continue to xqysaylskffsfwunczbd.supabase.co")
    ↓
User grants permission
    ↓
Google redirects to Supabase callback URL
    ↓
Supabase creates session and redirects to /auth/callback
    ↓
App completes auth and redirects user
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
4. Enter a project name (e.g., `myimageupscaler-auth`)
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
| App name           | Your app name (e.g., `MyImageUpscaler`)     |
| User support email | Your email                                  |
| App logo           | (Optional) Upload your logo                 |
| App domain         | Your production domain                      |
| Authorized domains | `myimageupscaler.com`, `supabase.co`        |
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

#### Test Users (External apps in Testing mode):

If your app is in "Testing" mode, add test user emails:

1. Click **Add Users**
2. Enter email addresses that can test the OAuth flow
3. Click **Save and Continue**

### Step 3: Create OAuth Credentials

1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Application type**: `Web application`
4. Enter a name (e.g., `MyImageUpscaler Web Client`)

#### Configure Authorized JavaScript Origins:

**CRITICAL for Google Identity Services:** Add ALL of these origins:

```
http://localhost
http://localhost:3000
https://myimageupscaler.com
https://www.myimageupscaler.com
```

> **Important:** For localhost development, you MUST add BOTH:
> - `http://localhost` (without port)
> - `http://localhost:3000` (with port)
>
> GIS requires both origins to function correctly. Missing either will cause a 403 error.

#### Configure Authorized Redirect URIs:

Add **only** your Supabase callback URL (used for fallback OAuth):

```
https://xqysaylskffsfwunczbd.supabase.co/auth/v1/callback
```

> **Note:** The GIS popup flow doesn't use redirect URIs - they're only needed for the fallback redirect OAuth flow.

5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

### Step 4: Save Your Credentials

Store these securely - you'll need them for Supabase configuration:

```
Client ID: 756001348384-xxxxxxxxxx.apps.googleusercontent.com
Client Secret: GOCSPX-xxxxxxxxxxxxxxxx
```

## Supabase Configuration

### Step 1: Enable Google Provider

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Click on **Google**
5. Toggle **Enable Google provider** to ON
6. Paste your **Client ID** from Google Cloud
7. Paste your **Client Secret** from Google Cloud

### Step 2: Configure Client IDs for ID Token Auth

For the GIS flow (signInWithIdToken), add your Client ID to the allowed list:

1. In the Google provider settings, find **Client IDs** field
2. Add your Client ID: `756001348384-xxxxxxxxxx.apps.googleusercontent.com`
3. Click **Save**

> **Note:** This is required for Supabase to accept ID tokens from your Google client.

### Step 3: Configure Redirect URLs

These are used for the fallback OAuth flow:

1. Navigate to **Authentication** → **URL Configuration**
2. Set **Site URL** to your production URL:
   ```
   https://myimageupscaler.com
   ```
3. Add **Redirect URLs** for all environments:
   ```
   http://localhost:3000/**
   https://myimageupscaler.com/**
   https://www.myimageupscaler.com/**
   ```

## Environment Variables

Ensure your `.env.client` has the Google Client ID:

```bash
# .env.client
NEXT_PUBLIC_GOOGLE_CLIENT_ID=756001348384-xxxxxxxxxx.apps.googleusercontent.com
```

## Content Security Policy

The app's CSP is configured to allow Google Identity Services. If you're having issues, verify these are in your CSP:

```
script-src: https://accounts.google.com
style-src: https://accounts.google.com
connect-src: https://accounts.google.com
frame-src: https://accounts.google.com
```

See `shared/config/security.ts` for the full CSP configuration.

## Testing

### Local Development

1. Start your development server:

   ```bash
   yarn dev
   ```

2. Navigate to your login page

3. Click "Sign in with Google"

4. A popup should appear showing "Continue to localhost" or your domain

5. Select your Google account

6. You should be redirected to your app, authenticated

### Verify User Creation

Check that the user was created in Supabase:

```sql
-- In Supabase SQL Editor
SELECT id, email, raw_user_meta_data
FROM auth.users
WHERE email = 'your-email@gmail.com';
```

## Production Deployment

### Development vs Production Modes

#### Testing Mode (Default - For Development)

- Only users added as "Test users" can sign in
- No publishing required
- Perfect for local development

**To add yourself as a test user:**

1. Go to **OAuth consent screen** in Google Cloud Console
2. Scroll to **Test users** section
3. Click **Add Users**
4. Enter your Gmail address
5. Click **Save**

#### Production Mode (For Public Release)

1. Go to **OAuth consent screen**
2. Click **"Publish App"** to move out of Testing mode
3. Confirm the warning

> **Note:** For apps requesting only basic scopes (email, profile, openid), Google verification is typically not required.

### Production Checklist

- [ ] Add all production domains to Authorized JavaScript Origins:
  - `https://myimageupscaler.com`
  - `https://www.myimageupscaler.com`
- [ ] Verify Supabase callback URL in Authorized Redirect URIs
- [ ] Add Client ID to Supabase's "Client IDs" field for ID token auth
- [ ] Update Supabase Site URL to production domain
- [ ] Publish OAuth consent screen (or add users as test users)
- [ ] Test OAuth flow on production

## Troubleshooting

### "[GSI_LOGGER]: The given origin is not allowed for the given client ID"

**Cause:** Missing authorized JavaScript origin in Google Cloud Console.

**Solution:**

1. Go to Google Cloud Console → Credentials → Your OAuth Client
2. Add ALL required origins to "Authorized JavaScript origins":
   - `http://localhost` (without port - **commonly missed!**)
   - `http://localhost:3000` (with port)
   - Your production domains
3. Wait 2-5 minutes for changes to propagate

### 403 Forbidden on `/gsi/status`

**Cause:** Missing `http://localhost` origin or CSP/Referrer-Policy issues.

**Solution:**

1. Verify `http://localhost` (no port) is in Authorized JavaScript Origins
2. Check CSP allows `https://accounts.google.com` in connect-src and style-src
3. For localhost, ensure Referrer-Policy is `no-referrer-when-downgrade`

### "Google One Tap not displayed: unknown_reason"

**Cause:** Various - could be CSP, origin issues, or browser settings.

**Solution:**

1. Check browser console for specific errors
2. Verify all CSP directives allow Google's domains
3. Clear browser cache and cookies
4. Try in incognito mode

### Fallback to redirect OAuth keeps triggering

**Cause:** GIS script not loading or failing to initialize.

**Solution:**

1. Check network tab for blocked requests to `accounts.google.com`
2. Verify CSP allows `script-src https://accounts.google.com`
3. Check if ad blockers are blocking Google scripts

### "Error 400: redirect_uri_mismatch"

**Cause:** Redirect URI doesn't match Google Cloud config (fallback flow).

**Solution:**

1. Verify Supabase callback URL: `https://xxxxx.supabase.co/auth/v1/callback`
2. Ensure this EXACT URL is in Authorized redirect URIs
3. Wait 5 minutes for changes to propagate

### "Access blocked: App is in testing mode"

**Cause:** OAuth consent screen is in Testing mode and user isn't a test user.

**Solution:**

1. Add the user's email to Test Users in OAuth consent screen
2. OR publish the app (OAuth consent screen → Publish App)

### CSP violations in console

**Cause:** Content Security Policy blocking Google Identity Services.

**Solution:**

Verify `shared/config/security.ts` includes:

```typescript
'script-src': ['https://accounts.google.com'],
'style-src': ['https://accounts.google.com'],
'connect-src': ['https://accounts.google.com'],
'frame-src': ['https://accounts.google.com'],
```

### User not created in database

**Cause:** Profile trigger not working or RLS issues.

**Solution:**

1. Check `handle_new_user` trigger exists
2. Verify the user exists in `auth.users` table
3. Manually create profile if needed:
   ```sql
   INSERT INTO profiles (id, email, full_name, avatar_url)
   SELECT id, email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'avatar_url'
   FROM auth.users WHERE email = 'user@gmail.com';
   ```

## Security Best Practices

1. **Restrict authorized domains** - Only add domains you control
2. **Use HTTPS in production** - Required for OAuth
3. **Don't expose Client Secret** - Keep it in Supabase only
4. **Nonce validation** - The app uses SHA-256 hashed nonces for replay protection
5. **Monitor OAuth consent screen** - Check for suspicious activity
6. **Keep CSP strict** - Only allow necessary Google domains

## Additional Resources

- [Google Identity Services Documentation](https://developers.google.com/identity/gsi/web/guides/overview)
- [Supabase signInWithIdToken Docs](https://supabase.com/docs/reference/javascript/auth-signinwithidtoken)
- [Supabase Google Auth Docs](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [FedCM Migration Guide](https://developers.google.com/identity/gsi/web/guides/fedcm-migration)
- [Google Cloud Console](https://console.cloud.google.com/)
