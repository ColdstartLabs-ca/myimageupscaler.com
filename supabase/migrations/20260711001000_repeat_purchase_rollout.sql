CREATE TABLE public.repeat_purchase_rollout (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  auto_top_up_enabled boolean NOT NULL DEFAULT true,
  auto_top_up_percent integer NOT NULL DEFAULT 0 CHECK (auto_top_up_percent BETWEEN 0 AND 100),
  repeat_purchase_enabled boolean NOT NULL DEFAULT true,
  repeat_purchase_percent integer NOT NULL DEFAULT 0 CHECK (repeat_purchase_percent BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.repeat_purchase_rollout (id) VALUES (true);

ALTER TABLE public.repeat_purchase_rollout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages repeat purchase rollout"
  ON public.repeat_purchase_rollout FOR ALL TO service_role USING (true) WITH CHECK (true);
