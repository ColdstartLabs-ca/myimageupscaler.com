-- Credit transactions audit log table
-- Records all credit changes for audit trail and debugging

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- Positive for additions, negative for deductions
  type TEXT NOT NULL CHECK (type IN ('purchase', 'subscription', 'usage', 'refund', 'bonus')),
  reference_id TEXT, -- Stripe session ID, job ID, etc.
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_reference_id ON public.credit_transactions(reference_id);

-- Enable RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own transaction history
CREATE POLICY "Users can view own transactions"
  ON public.credit_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (for webhooks and RPCs)
CREATE POLICY "Service role has full access to transactions"
  ON public.credit_transactions
  FOR ALL
  USING (auth.role() = 'service_role');
