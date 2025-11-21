import { Metadata } from 'next';
import { HomePageClient } from '@/components/pages/HomePageClient';

export const metadata: Metadata = {
  title: 'PixelPerfect AI | Image Upscaling & Enhancement',
  description: 'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
};

export default function HomePage() {
  return <HomePageClient />;
}
