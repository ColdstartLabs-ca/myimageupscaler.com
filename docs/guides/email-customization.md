# Email Configuration Guide

This guide covers how to customize authentication emails (Supabase) and enable payment receipt emails (Stripe).

---

## 1. Supabase Email Template Customization

Supabase handles all authentication emails including email verification, password reset, and magic links. You can customize these templates in the Supabase Dashboard.

### Prerequisites

- Access to your Supabase project dashboard
- Admin/Owner permissions on the project

### Step 1: Access Email Templates

1. Log in to [Supabase Dashboard](https://app.supabase.com)
2. Select your **PixelPerfect** project
3. Navigate to **Authentication** > **Email Templates**

### Step 2: Available Templates

You can customize the following email templates:

#### Confirm Signup

Sent when a new user signs up with email/password.

**Default Variables:**

- `{{ .ConfirmationURL }}` - Link to confirm email address
- `{{ .SiteURL }}` - Your site URL (set in Auth settings)
- `{{ .Token }}` - Confirmation token
- `{{ .TokenHash }}` - Hashed token

**Recommended Customization:**

```html
<h2>Welcome to PixelPerfect AI!</h2>
<p>Thanks for signing up. Click the link below to verify your email address:</p>
<p><a href="{{ .ConfirmationURL }}">Verify Email Address</a></p>
<p>If you didn't sign up for PixelPerfect AI, you can safely ignore this email.</p>
<p>Best regards,<br />The PixelPerfect Team</p>
```

#### Invite User

Sent when inviting a user to your application (if using team features in Phase 3).

#### Magic Link

Sent for passwordless sign-in.

**Recommended Customization:**

```html
<h2>Sign in to PixelPerfect AI</h2>
<p>Click the link below to sign in to your account:</p>
<p><a href="{{ .ConfirmationURL }}">Sign In</a></p>
<p>This link expires in 1 hour.</p>
<p>If you didn't request this, please ignore this email.</p>
```

#### Change Email Address

Sent when a user changes their email address.

**Recommended Customization:**

```html
<h2>Confirm Email Change</h2>
<p>You requested to change your email address. Click the link below to confirm:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm Email Change</a></p>
<p>If you didn't request this change, please contact support immediately.</p>
```

#### Reset Password

Sent when a user requests a password reset.

**Recommended Customization:**

```html
<h2>Reset Your Password</h2>
<p>We received a request to reset your password. Click the link below to create a new password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>This link expires in 1 hour.</p>
<p>If you didn't request a password reset, you can safely ignore this email.</p>
<p>Best regards,<br />The PixelPerfect Team</p>
```

### Step 3: Branding Guidelines

For consistent branding across all emails:

**Colors:**

- Primary: `#6366f1` (indigo-500)
- Background: `#f8fafc` (slate-50)
- Text: `#0f172a` (slate-900)

**Logo:**

- Use hosted logo URL from your production domain
- Recommended size: 200px width

**Email Template Structure:**

```html
<div
  style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
>
  <div style="background-color: #6366f1; padding: 24px; text-align: center;">
    <!-- Logo here -->
    <h1 style="color: white; margin: 0;">PixelPerfect AI</h1>
  </div>
  <div style="background-color: white; padding: 32px; border: 1px solid #e2e8f0;">
    <!-- Email content here -->
  </div>
  <div style="text-align: center; padding: 16px; color: #64748b; font-size: 14px;">
    <p>© 2025 PixelPerfect AI. All rights reserved.</p>
    <p>
      <a href="https://pixelperfect.app/privacy" style="color: #6366f1;">Privacy Policy</a> |
      <a href="https://pixelperfect.app/terms" style="color: #6366f1;">Terms</a> |
      <a href="https://pixelperfect.app/help" style="color: #6366f1;">Help</a>
    </p>
  </div>
</div>
```

### Step 4: Test Email Templates

After customizing templates:

1. Click **Save** for each template
2. Test by triggering the email flow:
   - **Signup Confirmation**: Create a test account
   - **Password Reset**: Use "Forgot Password" flow
   - **Magic Link**: Try passwordless login (if enabled)
3. Check your inbox and verify:
   - Subject line is clear
   - Links work correctly
   - Branding looks professional
   - Mobile responsive

### Step 5: SMTP Settings (Optional)

By default, Supabase uses their SMTP server. For custom email domain:

1. Go to **Project Settings** > **Auth**
2. Scroll to **SMTP Settings**
3. Enable **Custom SMTP**
4. Configure:
   - **Host**: Your SMTP server
   - **Port**: Usually 587 (TLS) or 465 (SSL)
   - **Username**: Your SMTP username
   - **Password**: Your SMTP password
   - **Sender Email**: `noreply@pixelperfect.app`
   - **Sender Name**: `PixelPerfect AI`

**Recommended SMTP Providers:**

- **Resend** (planned for Phase 2)
- **SendGrid**
- **Postmark**
- **AWS SES**

---

## 2. Stripe Receipt Email Configuration

Stripe can automatically send payment receipts to customers. This requires configuration in the Stripe Dashboard.

### Step 1: Access Stripe Dashboard

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com)
2. Ensure you're in the correct account (switch if needed)

### Step 2: Enable Receipt Emails

1. Navigate to **Settings** > **Emails**
2. Under **Customer emails**, find **Successful payments**
3. Toggle **ON** for "Automatically send receipts"

### Step 3: Customize Receipt Email (Optional)

1. Click **Customize** next to receipt emails
2. Configure:
   - **From name**: `PixelPerfect AI`
   - **Reply-to email**: `support@pixelperfect.app`
   - **Logo**: Upload your logo (recommended 200px width)
   - **Brand color**: `#6366f1`
   - **Footer text**: Add company address if required by law

### Step 4: Configure Receipt Settings

Additional settings to configure:

#### Include Product Descriptions

1. Go to **Settings** > **Emails** > **Receipts**
2. Enable **Include product descriptions**
3. This shows credit pack details on receipts

#### Enable Failed Payment Emails

1. Go to **Settings** > **Emails**
2. Enable **Failed payments** under Customer emails
3. This notifies customers when payments fail

#### Enable Refund Notifications

1. Go to **Settings** > **Emails**
2. Enable **Refunds** under Customer emails

### Step 5: Subscription Invoice Emails

For subscription plans:

1. Navigate to **Settings** > **Billing** > **Subscriptions and emails**
2. Enable the following:
   - **Upcoming invoice**: Remind customers before renewal (3 days before)
   - **Successful renewal**: Confirm successful subscription renewal
   - **Failed payment**: Alert when subscription payment fails
   - **Subscription canceled**: Notify when subscription ends

### Step 6: Customize Invoice Emails

1. Go to **Settings** > **Emails** > **Invoices**
2. Click **Customize**
3. Configure:
   - **Subject line**: `Your PixelPerfect AI invoice for [amount]`
   - **Footer message**: Custom footer with support info
   - **Logo**: Same as receipt logo

### Step 7: Test Receipt Emails

After configuration:

1. Make a test purchase using Stripe test mode
2. Use test card: `4242 4242 4242 4242`
3. Check the email address used in checkout
4. Verify:
   - Receipt arrives within 5 minutes
   - Branding matches your site
   - All purchase details are correct
   - Links work (if any)

### Step 8: Email Notification Matrix

Configure these notifications for optimal customer experience:

| Event                   | Email Type     | Enabled | Priority |
| ----------------------- | -------------- | ------- | -------- |
| Payment Successful      | Receipt        | ✅ Yes  | High     |
| Payment Failed          | Failed Payment | ✅ Yes  | High     |
| Subscription Renewal    | Invoice        | ✅ Yes  | High     |
| Upcoming Renewal        | Reminder       | ✅ Yes  | Medium   |
| Refund Processed        | Refund Receipt | ✅ Yes  | High     |
| Subscription Canceled   | Cancellation   | ✅ Yes  | Medium   |
| Payment Method Expiring | Reminder       | ✅ Yes  | Medium   |

---

## 3. Email Testing Checklist

Before going live, test all email flows:

### Supabase Emails

- [ ] Sign up with new email (verification email)
- [ ] Request password reset (reset email)
- [ ] Change email address (confirmation email)
- [ ] Try magic link login if enabled

### Stripe Emails

- [ ] Complete test purchase (receipt email)
- [ ] Process test refund (refund email)
- [ ] Create test subscription (invoice email)
- [ ] Trigger failed payment (failure email)
- [ ] Cancel test subscription (cancellation email)

### Email Quality Checks

- [ ] All emails arrive within 2 minutes
- [ ] Subject lines are clear and professional
- [ ] Branding is consistent
- [ ] All links work correctly
- [ ] Emails are mobile-responsive
- [ ] No spelling/grammar errors
- [ ] Footer includes legal links
- [ ] From name/address is correct

---

## 4. Troubleshooting

### Emails Not Arriving

**Supabase Emails:**

1. Check spam/junk folder
2. Verify email rate limits not exceeded
3. Check Supabase logs: **Authentication** > **Logs**
4. Verify SMTP settings if using custom SMTP

**Stripe Emails:**

1. Verify setting is enabled in Dashboard
2. Check test mode vs live mode
3. Verify customer email is valid in Stripe
4. Check Stripe logs: **Developers** > **Events**

### Email Deliverability Issues

1. **Set up SPF/DKIM** for custom domain (if using custom SMTP)
2. **Monitor bounce rate** in Stripe Dashboard
3. **Avoid spam triggers**:
   - Don't use all caps
   - Avoid excessive exclamation points
   - Include unsubscribe link (for marketing emails only)
   - Use reputable SMTP provider

### Email Template Variables Not Working

**Supabase:**

- Use correct syntax: `{{ .Variable }}`
- Check variable names in documentation
- Test with actual email flow, not preview

**Stripe:**

- Use Stripe template variables syntax
- Refer to Stripe email customization docs
- Preview in Stripe Dashboard before saving

---

## 5. Future Enhancements (Phase 2)

Planned email improvements:

- [ ] Custom email system using Resend + React Email
- [ ] Transactional emails (welcome, low credits, etc.)
- [ ] Email preferences/unsubscribe management
- [ ] Email analytics tracking
- [ ] Automated email campaigns

For now, Supabase + Stripe emails cover all critical user communication needs.
