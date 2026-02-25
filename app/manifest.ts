import { MetadataRoute } from 'next';
import { clientEnv } from '@shared/config/env';

export default function manifest(): MetadataRoute.Manifest {
  const APP_NAME = clientEnv.APP_NAME;

  return {
    name: `${APP_NAME} - Image Upscaling & Enhancement`,
    short_name: APP_NAME,
    description:
      'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3b82f6',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
