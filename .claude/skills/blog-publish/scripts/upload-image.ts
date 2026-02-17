import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// eslint-disable-next-line no-restricted-syntax -- standalone CLI script, not a Next.js module
const SUPABASE_URL = process.env.SUPABASE_URL!;
// eslint-disable-next-line no-restricted-syntax -- standalone CLI script, not a Next.js module
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const inputPath = process.argv[2];
  const altText = process.argv[3] ?? '';
  const tags = (process.argv[4] ?? '').split(',').filter(Boolean);
  const imageType = (process.argv[5] ?? 'featured') as 'featured' | 'inline';
  const description = process.argv[6] ?? '';
  const prompt = process.argv[7] ?? '';

  if (!inputPath) {
    console.error(
      'Usage: upload-image.ts <input-path> [alt_text] [tags] [image_type] [description] [prompt]'
    );
    process.exit(1);
  }

  const imgBuffer = fs.readFileSync(inputPath);

  // Compress to WebP
  const maxWidth = imageType === 'featured' ? 1200 : 800;
  const maxHeight = imageType === 'featured' ? 630 : 600;
  const compressed = await sharp(imgBuffer)
    .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const timestamp = Date.now();
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const basename = inputPath
    .split('/')
    .pop()!
    .replace(/\.[^.]+$/, '');
  const storagePath = `${year}/${month}/${timestamp}-${basename}.webp`;

  const { error: uploadError } = await supabase.storage
    .from('blog-images')
    .upload(storagePath, compressed.data, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });

  if (uploadError) {
    console.error('Upload error:', uploadError);
    process.exit(1);
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/blog-images/${storagePath}`;

  // Save metadata to DB
  const { data: metaData, error: metaError } = await supabase
    .from('blog_images')
    .insert({
      url: publicUrl,
      storage_path: storagePath,
      alt_text: altText,
      tags,
      description,
      image_type: imageType,
      width: compressed.info.width,
      height: compressed.info.height,
      prompt: prompt || null,
    })
    .select('id')
    .single();

  if (metaError) {
    console.error('Metadata error (non-fatal):', metaError.message);
  }

  console.log(
    JSON.stringify({
      success: true,
      url: publicUrl,
      storage_path: storagePath,
      width: compressed.info.width,
      height: compressed.info.height,
      metadata_id: metaData?.id ?? null,
    })
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
