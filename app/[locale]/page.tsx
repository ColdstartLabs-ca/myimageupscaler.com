import { Suspense } from 'react';
import { HomePageClient } from '@client/components/pages/HomePageClient';
import { JsonLd } from '@client/components/seo/JsonLd';
import { generateHomepageSchema } from '@lib/seo/schema-generator';

export default function LocaleHomePage() {
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
