# Google OAuth Setup (Supabase)

This guide will walk you through configuring Google OAuth for your Supabase project to work on both local and production environments.

## Prerequisites

- A [Google Cloud Console](https://console.cloud.google.com/) account
- A [Supabase](https://supabase.com/) project (e.g., `https://cowcemqubuqdtpfklqkr.supabase.co`)

---

## Step 1: Set Up Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Select or create a new project:
   - Click on the project dropdown and select "New Project."
   - Name your project and click "Create."
3. Enable OAuth Consent Screen:
   - Navigate to **APIs & Services > OAuth consent screen**.
   - Choose **External** for the user type and click "Create."
   - Complete the required fields:
     - **App name**: e.g., "PixelPerfect AI"
     - **Support email**: your support email
     - **Authorized domains**: add `supabase.co`
     - **Contact email**: your contact email
4. **Save and Continue** through the remaining steps.

---

## Step 2: Set Up OAuth Credentials

1. Go to **APIs & Services > Credentials** in the Google Cloud Console.
2. Click **Create Credentials** > **OAuth client ID**.
3. Select **Web application** as the application type.
4. Set up **Authorized JavaScript Origins** and **Authorized Redirect URIs**:

   ### Authorized JavaScript Origins

   - Add:
     - `http://localhost:3000` (for local development)
     - `https://cowcemqubuqdtpfklqkr.supabase.co` (for production)

   ### Authorized Redirect URIs

   - Add:
     - `https://cowcemqubuqdtpfklqkr.supabase.co/auth/v1/callback` (for production)

   **Note:** Supabase handles OAuth callbacks at their domain (`https://YOUR_PROJECT.supabase.co/auth/v1/callback`), not at localhost. You only need to add your Supabase project URL as a redirect URI.

5. Click **Create**. You’ll receive a **Client ID** and **Client Secret**.

Add the **Client ID** to your `.env.client` file:

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
```

---

## Step 3: Configure Google OAuth in Supabase

1. Log in to your [Supabase Dashboard](https://app.supabase.com/).
2. Go to your project and navigate to **Authentication > Providers**.
3. Toggle the **Google** provider to **Enabled**.
4. Enter the **Client ID** and **Client Secret** from Google Cloud Console.
5. Click **Save** to apply the changes.

---

## Step 4: Testing OAuth

To test Google OAuth in both environments:

- Run your application locally with `yarn dev` (runs on `http://localhost:3000`)
- Click "Continue with Google" - Supabase will redirect to Google, then back to your app
- For production, deploy your application and test with your production Supabase URL

---

## Troubleshooting Tips

- **"Invalid Domain" Error**: Ensure you only add `supabase.co` to the **Authorized Domains** section, not `localhost`.
- **Scopes**: You may add or customize scopes like `openid`, `profile`, and `email` if your application requires additional access.
