-- Create saved_images table for user image gallery persistence
-- Enables users to save and manage their upscaled images across sessions

CREATE TABLE IF NOT EXISTS public.saved_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,  -- Path in saved-images bucket: {user_id}/{filename}
  original_filename TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  model_used TEXT NOT NULL,  -- AI model used for upscaling (e.g., 'real-esrgan', 'flux-2-pro')
  processing_mode TEXT NOT NULL CHECK (processing_mode IN ('upscale', 'enhance', 'both', 'custom')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Constraints
  CONSTRAINT valid_file_size CHECK (file_size_bytes > 0),
  CONSTRAINT valid_width CHECK (width > 0),
  CONSTRAINT valid_height CHECK (height > 0)
);

-- Create index on user_id for fast user-scoped queries
CREATE INDEX IF NOT EXISTS idx_saved_images_user_id ON public.saved_images(user_id);

-- Create index on created_at for ordering by recency
CREATE INDEX IF NOT EXISTS idx_saved_images_created_at ON public.saved_images(created_at DESC);

-- Create composite index for common query pattern: user's images sorted by date
CREATE INDEX IF NOT EXISTS idx_saved_images_user_created ON public.saved_images(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.saved_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Service role has full access (for API routes)
CREATE POLICY "Service role full access on saved_images"
  ON public.saved_images
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Users can view only their own images
CREATE POLICY "Users can view own saved_images"
  ON public.saved_images
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert only their own images
CREATE POLICY "Users can insert own saved_images"
  ON public.saved_images
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete only their own images
CREATE POLICY "Users can delete own saved_images"
  ON public.saved_images
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE public.saved_images IS 'User-saved upscaled images for gallery persistence';
COMMENT ON COLUMN public.saved_images.id IS 'Unique identifier for the saved image';
COMMENT ON COLUMN public.saved_images.user_id IS 'Reference to the user who owns this image';
COMMENT ON COLUMN public.saved_images.storage_path IS 'Path in Supabase Storage bucket (format: {user_id}/{filename})';
COMMENT ON COLUMN public.saved_images.original_filename IS 'Original filename from user upload';
COMMENT ON COLUMN public.saved_images.file_size_bytes IS 'File size in bytes';
COMMENT ON COLUMN public.saved_images.width IS 'Image width in pixels';
COMMENT ON COLUMN public.saved_images.height IS 'Image height in pixels';
COMMENT ON COLUMN public.saved_images.model_used IS 'AI model used for processing (e.g., real-esrgan, flux-2-pro)';
COMMENT ON COLUMN public.saved_images.processing_mode IS 'Processing mode: upscale, enhance, both, or custom';
COMMENT ON COLUMN public.saved_images.created_at IS 'Timestamp when image was saved';
