-- Create saved-images storage bucket for user-upscaled images
-- Private bucket - images served via signed URLs for security

-- Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'saved-images',
  'saved-images',
  false,  -- Private bucket - access via signed URLs
  10485760,  -- 10MB max file size
  ARRAY['image/webp', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow authenticated users to read their own images (path pattern: {user_id}/*)
CREATE POLICY "Users can read own saved images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'saved-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow service role to upload images (API routes handle user validation)
CREATE POLICY "Service role can upload saved images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'saved-images'
  AND auth.role() = 'service_role'
);

-- Allow service role to update images
CREATE POLICY "Service role can update saved images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'saved-images'
  AND auth.role() = 'service_role'
);

-- Allow service role to delete images
CREATE POLICY "Service role can delete saved images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'saved-images'
  AND auth.role() = 'service_role'
);

-- Add comment
COMMENT ON TABLE storage.buckets IS 'Storage buckets including saved-images for user gallery persistence';
