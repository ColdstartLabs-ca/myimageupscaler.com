-- Billing analytics is deduplicated separately from Stripe webhook delivery.
-- webhook_events prevents replaying one Stripe event, while this table prevents
-- different deliveries of the same billing lifecycle action from being emitted
-- twice (for example checkout-first and subscription-created-first).

CREATE TABLE IF NOT EXISTS public.billing_analytics_events (
  event_key TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  lifecycle_action TEXT NOT NULL,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_analytics_events_source_action
  ON public.billing_analytics_events(event_name, source_object_id, lifecycle_action);

CREATE INDEX IF NOT EXISTS idx_billing_analytics_events_source_object
  ON public.billing_analytics_events(source_object_id, created_at DESC);

ALTER TABLE public.billing_analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages billing analytics events"
  ON public.billing_analytics_events;
CREATE POLICY "Service role manages billing analytics events"
  ON public.billing_analytics_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.billing_analytics_events IS
  'Durable deduplication claims for Stripe-backed billing analytics events.';
COMMENT ON COLUMN public.billing_analytics_events.event_key IS
  'Stable Amplitude insert_id derived from event name, provider object, and lifecycle action.';
COMMENT ON COLUMN public.billing_analytics_events.source_object_id IS
  'Stripe object ID that is the source of the billing lifecycle or charge.';
COMMENT ON COLUMN public.billing_analytics_events.lifecycle_action IS
  'Canonical billing action used to distinguish creation, cancellation, renewal, and charge events.';
