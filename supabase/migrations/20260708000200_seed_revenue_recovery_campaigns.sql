INSERT INTO public.email_lifecycle_campaigns
  (key, name, category, template_name, email_type, preference_key, cooldown_days, priority)
VALUES
  ('checkout-abandoned-24h', 'Checkout abandoner recovery', 'revenue_recovery', 'checkout-recovery', 'marketing', 'marketing_emails', 7, 100),
  ('upgrade-click-no-purchase-24h', 'Upgrade click no purchase recovery', 'revenue_recovery', 'checkout-recovery', 'marketing', 'marketing_emails', 7, 90),
  ('credit-wall-dismissed-48h', 'Credit wall dismissed recovery', 'revenue_recovery', 'credit-wall-recovery', 'marketing', 'marketing_emails', 7, 80),
  ('high-usage-free-user', 'High usage free user recovery', 'revenue_recovery', 'credit-wall-recovery', 'marketing', 'marketing_emails', 7, 70)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  template_name = EXCLUDED.template_name,
  email_type = EXCLUDED.email_type,
  preference_key = EXCLUDED.preference_key,
  cooldown_days = EXCLUDED.cooldown_days,
  priority = EXCLUDED.priority,
  updated_at = NOW();
