import { MetadataRoute } from 'next';
import { clientEnv } from '@shared/config/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${clientEnv.BASE_URL}/sitemap.xml`,
  };
}
