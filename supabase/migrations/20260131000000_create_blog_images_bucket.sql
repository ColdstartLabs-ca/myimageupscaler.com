-- Create blog-images storage bucket for blog featured images and content images
-- Images are compressed to WebP format before upload (handled by application)

-- Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-images',
  'blog-images',
  true,  -- Public bucket for CDN access
  5242880,  -- 5MB max (images are compressed before upload)
  ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow public read access to all images
CREATE POLICY "Public read access for blog images"
ON storage.objects FOR SELECT
USING (bucket_id = 'blog-images');

-- Allow service role to upload/delete images
CREATE POLICY "Service role can upload blog images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'blog-images'
  AND auth.role() = 'service_role'
);

CREATE POLICY "Service role can update blog images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'blog-images'
  AND auth.role() = 'service_role'
);

CREATE POLICY "Service role can delete blog images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'blog-images'
  AND auth.role() = 'service_role'
);

-- Add comment
COMMENT ON TABLE storage.buckets IS 'Storage buckets including blog-images for blog content';
