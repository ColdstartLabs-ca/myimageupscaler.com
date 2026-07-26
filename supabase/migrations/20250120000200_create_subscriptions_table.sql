-- Create subscriptions table to mirror Stripe subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id TEXT PRIMARY KEY, -- Stripe subscription ID
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL,
  price_id TEXT NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE NOT NULL,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end ON public.subscriptions(current_period_end);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (for webhooks)
CREATE POLICY "Service role has full access to subscriptions"
  ON public.subscriptions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create updated_at trigger
DROP TRIGGER IF EXISTS on_subscriptions_updated ON public.subscriptions;
CREATE TRIGGER on_subscriptions_updated
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Optional: Create products table to sync Stripe product catalog
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY, -- Stripe product ID
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS for products (public read access)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products are publicly readable"
  ON public.products
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage products"
  ON public.products
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create prices table to sync Stripe prices
CREATE TABLE IF NOT EXISTS public.prices (
  id TEXT PRIMARY KEY, -- Stripe price ID
  product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  active BOOLEAN DEFAULT TRUE NOT NULL,
  currency TEXT NOT NULL,
  unit_amount INTEGER, -- Amount in cents
  type TEXT CHECK (type IN ('one_time', 'recurring')) NOT NULL,
  interval TEXT CHECK (interval IN ('day', 'week', 'month', 'year')),
  interval_count INTEGER,
  trial_period_days INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_prices_product_id ON public.prices(product_id);
CREATE INDEX IF NOT EXISTS idx_prices_active ON public.prices(active);

-- Enable RLS for prices (public read access)
ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Prices are publicly readable"
  ON public.prices
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage prices"
  ON public.prices
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create updated_at triggers
DROP TRIGGER IF EXISTS on_products_updated ON public.products;
CREATE TRIGGER on_products_updated
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_prices_updated ON public.prices;
CREATE TRIGGER on_prices_updated
  BEFORE UPDATE ON public.prices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
