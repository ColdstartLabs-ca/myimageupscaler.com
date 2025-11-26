import { z } from 'zod';

/**
 * Validation schema for the upscale API endpoint
 * Ensures all inputs are properly validated before processing
 */
export const upscaleSchema = z.object({
  imageData: z
    .string()
    .min(1, 'Image data is required')
    .refine(
      data => {
        // Basic check that it looks like base64 data
        // Allows for data URLs or raw base64
        if (data.startsWith('data:')) {
          const base64Part = data.split(',')[1];
          return base64Part && base64Part.length > 0;
        }
        return data.length > 0;
      },
      { message: 'Invalid image data format' }
    ),
  mimeType: z.string().default('image/jpeg'),
  config: z.object({
    mode: z.enum(['upscale', 'enhance', 'both', 'custom']),
    scale: z.union([z.literal(2), z.literal(4)]).default(2),
    denoise: z.boolean().default(false),
    enhanceFace: z.boolean().default(false),
    preserveText: z.boolean().default(false),
    customPrompt: z.string().optional(),
  }),
});

export type IUpscaleInput = z.infer<typeof upscaleSchema>;
export type IUpscaleConfig = IUpscaleInput['config'];
