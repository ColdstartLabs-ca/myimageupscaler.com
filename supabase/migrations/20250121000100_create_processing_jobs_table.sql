-- Processing jobs table for tracking image processing requests
-- Links to credit usage and provides job history

CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  input_image_path TEXT NOT NULL,
  output_image_path TEXT,
  credits_used INTEGER NOT NULL DEFAULT 1,
  processing_mode TEXT NOT NULL DEFAULT 'standard' CHECK (processing_mode IN ('standard', 'enhanced', 'gentle', 'portrait', 'product')),
  settings JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON public.processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON public.processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created_at ON public.processing_jobs(created_at DESC);

-- Enable RLS
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own jobs
CREATE POLICY "Users can view own jobs"
  ON public.processing_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own jobs
CREATE POLICY "Users can create own jobs"
  ON public.processing_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for background processing)
CREATE POLICY "Service role has full access to jobs"
  ON public.processing_jobs
  FOR ALL
  USING (auth.role() = 'service_role');

-- Updated at trigger
DROP TRIGGER IF EXISTS on_processing_jobs_updated ON public.processing_jobs;
CREATE TRIGGER on_processing_jobs_updated
  BEFORE UPDATE ON public.processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
