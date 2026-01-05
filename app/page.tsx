import { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@client/components/pages/HomePageClient';
import { JsonLd } from '@client/components/seo/JsonLd';
import { generateHomepageSchema } from '@lib/seo/schema-generator';

export const metadata: Metadata = {
  title: `AI Image Upscaler & Photo Enhancer | Enhance Quality Free Online`,
  description:
    'Free AI image enhancer that upscales photos to 4K without blur. Enhance image quality online in seconds—keeps text sharp. 10 free credits, no signup.',
  openGraph: {
    title: `AI Image Upscaler & Photo Quality Enhancer | Free Online`,
    description:
      'Free AI photo enhancer. Upscale images to 4K, enhance quality, keep text sharp. Try free.',
    type: 'website',
    url: '/',
  },
  alternates: {
    canonical: '/',
  },
};

export default function HomePage() {
  const homepageSchema = generateHomepageSchema();

  return (
    <>
      <JsonLd data={homepageSchema} />
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        }
      >
        <HomePageClient />
      </Suspense>
    </>
  );
}
