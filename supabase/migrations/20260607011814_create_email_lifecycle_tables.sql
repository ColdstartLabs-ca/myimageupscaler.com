-- Lifecycle email campaigns, queue, and event attribution.

CREATE TABLE IF NOT EXISTS public.email_lifecycle_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  template_name TEXT NOT NULL,
  email_type TEXT NOT NULL CHECK (email_type IN ('transactional', 'marketing')),
  preference_key TEXT NULL CHECK (
    preference_key IN ('marketing_emails', 'product_updates', 'low_credit_alerts')
  ),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  cooldown_days INTEGER NOT NULL DEFAULT 7,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_lifecycle_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key TEXT NOT NULL REFERENCES public.email_lifecycle_campaigns(key) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'failed', 'skipped', 'cancelled')
  ),
  reason TEXT NULL,
  template_data JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NULL REFERENCES public.email_lifecycle_queue(id) ON DELETE SET NULL,
  user_id UUID NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'queued',
      'sent',
      'skipped',
      'failed',
      'clicked',
      'returned',
      'purchased_after_email',
      'unsubscribed',
      'suppressed_frequency_cap',
      'suppressed_preference'
    )
  ),
  campaign_key TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_status_scheduled
  ON public.email_lifecycle_queue(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_user_campaign_status
  ON public.email_lifecycle_queue(user_id, campaign_key, status);
CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_campaign_created
  ON public.email_lifecycle_queue(campaign_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_lifecycle_events_user_time
  ON public.email_lifecycle_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_lifecycle_events_campaign_type
  ON public.email_lifecycle_events(campaign_key, event_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_lifecycle_queue_pending_unique
  ON public.email_lifecycle_queue(user_id, campaign_key)
  WHERE status = 'pending';

ALTER TABLE public.email_lifecycle_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_lifecycle_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages lifecycle campaigns" ON public.email_lifecycle_campaigns;
CREATE POLICY "Service role manages lifecycle campaigns"
  ON public.email_lifecycle_campaigns FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages lifecycle queue" ON public.email_lifecycle_queue;
CREATE POLICY "Service role manages lifecycle queue"
  ON public.email_lifecycle_queue FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages lifecycle events" ON public.email_lifecycle_events;
CREATE POLICY "Service role manages lifecycle events"
  ON public.email_lifecycle_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS on_email_lifecycle_campaigns_updated ON public.email_lifecycle_campaigns;
CREATE TRIGGER on_email_lifecycle_campaigns_updated
  BEFORE UPDATE ON public.email_lifecycle_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_email_lifecycle_queue_updated ON public.email_lifecycle_queue;
CREATE TRIGGER on_email_lifecycle_queue_updated
  BEFORE UPDATE ON public.email_lifecycle_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.email_lifecycle_campaigns
  (key, name, category, template_name, email_type, preference_key, cooldown_days, priority)
VALUES
  ('signup-no-upload-2h', 'Signup activation: first upload', 'product_lifecycle', 'lifecycle-welcome', 'marketing', 'product_updates', 7, 80),
  ('signup-no-upload-24h', 'Signup activation: workflows', 'product_lifecycle', 'feature-reminder', 'marketing', 'product_updates', 7, 70),
  ('signup-no-upload-3d-blog', 'Signup activation: tutorial', 'blog_education', 'blog-education', 'marketing', 'marketing_emails', 14, 50),
  ('first-result-followup', 'First result follow-up', 'product_lifecycle', 'feature-reminder', 'marketing', 'product_updates', 7, 70),
  ('low-credits', 'Low credits alert', 'low_credit', 'low-credits', 'marketing', 'low_credit_alerts', 7, 90),
  ('zero-credits', 'Zero credits alert', 'low_credit', 'low-credits', 'marketing', 'low_credit_alerts', 7, 95),
  ('insufficient-credits-finish-image', 'Finish image after insufficient credits', 'low_credit', 'low-credits', 'marketing', 'low_credit_alerts', 7, 95),
  ('unused-credits-14d', 'Unused credits reminder', 'win_back', 'unused-credits', 'marketing', 'marketing_emails', 14, 60),
  ('subscription-idle-5d', 'Subscriber idle feature reminder', 'product_lifecycle', 'feature-reminder', 'marketing', 'product_updates', 14, 60),
  ('subscription-unused-balance-14d', 'Subscriber unused balance reminder', 'product_lifecycle', 'unused-credits', 'marketing', 'product_updates', 14, 60),
  ('cancelled-period-ending', 'Subscription period ending reminder', 'win_back', 'win-back', 'marketing', 'marketing_emails', 14, 60),
  ('winback-free-7d', 'Activated free user win-back', 'win_back', 'win-back', 'marketing', 'marketing_emails', 14, 50),
  ('winback-credit-holder-21d', 'Credit holder win-back', 'win_back', 'unused-credits', 'marketing', 'marketing_emails', 14, 50),
  ('winback-former-buyer-45d', 'Former buyer win-back', 'win_back', 'win-back', 'marketing', 'marketing_emails', 14, 40),
  ('winback-never-uploaded-14d', 'Dormant signup sample image reminder', 'win_back', 'win-back', 'marketing', 'marketing_emails', 14, 40),
  ('blog-education-face-restore', 'Photo restoration guide', 'blog_education', 'blog-education', 'marketing', 'marketing_emails', 14, 40),
  ('blog-education-hd-ultra', 'HD and Ultra guide', 'blog_education', 'blog-education', 'marketing', 'marketing_emails', 14, 40),
  ('blog-education-batch', 'Batch workflow guide', 'blog_education', 'blog-education', 'marketing', 'marketing_emails', 14, 40),
  ('blog-education-ecommerce', 'Product image guide', 'blog_education', 'blog-education', 'marketing', 'marketing_emails', 14, 40),
  ('blog-education-file-prep', 'Source file preparation guide', 'blog_education', 'blog-education', 'marketing', 'marketing_emails', 14, 40)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  template_name = EXCLUDED.template_name,
  email_type = EXCLUDED.email_type,
  preference_key = EXCLUDED.preference_key,
  cooldown_days = EXCLUDED.cooldown_days,
  priority = EXCLUDED.priority,
  updated_at = NOW();
