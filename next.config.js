import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const withNextIntl = createNextIntlPlugin('./i18n.config.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Disable Next.js DevTools overlay in production — it adds a 223KB chunk with 100% unused JS
  devIndicators: false,
  typescript: {
    // Keep TypeScript checking enabled
    ignoreBuildErrors: false,
  },
  // IMPORTANT: Disabled trailingSlash to prevent 308 redirects on API routes (especially webhooks)
  // trailingSlash: true causes Stripe webhooks to fail with 308 redirects
  // SEO trailing slashes are handled via explicit redirects below instead
  // Standalone output for OpenNext/Cloudflare deployment
  output: 'standalone',
  // Fix standalone output path when a package.json exists in a parent directory.
  // Without this, Next.js detects the parent as the monorepo root and nests the
  // standalone output at .next/standalone/projects/myimageupscaler.com/, which
  // @opennextjs/aws doesn't expect (it looks at .next/standalone/ directly).
  outputFileTracingRoot: __dirname,
  // Transpile packages for proper ESM handling
  transpilePackages: ['react-markdown', 'remark-gfm', 'unified', 'bail'],
  // Performance optimizations
  images: {
    unoptimized: true,
    // Allow external images from dicebear for avatars
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'myimageupscaler.com',
      },
    ],
    // Optimize image formats
    formats: ['image/avif', 'image/webp'],
  },
  // Enable experimental features for better performance
  experimental: {
    // Optimize package imports for smaller bundles
    optimizePackageImports: [
      'lucide-react',
      'react-icons',
      'date-fns',
      '@supabase/supabase-js',
      'framer-motion',
      'stripe',
      'marked',
      'zod',
      'zustand',
    ],
  },
  // External packages that shouldn't be bundled into the server
  serverExternalPackages: ['@imgly/background-removal', 'onnxruntime-web'],
  // Webpack configuration for bundle size optimization
  webpack: (config, { isServer, dev }) => {
    if (isServer) {
      // Enable server-side minification
      config.optimization = {
        ...config.optimization,
        minimize: true,
      };
    }

    // In production client builds, replace the 800KB DevTools bundle with a ~3KB shim.
    // Next.js 16 ships the full DevTools to all client builds, but it's only needed
    // in development. The shim exports the same API surface (dispatcher, render fns)
    // but as stubs — they're never called in production since HMR events don't fire.
    if (!dev && !isServer) {
      config.resolve.alias['next/dist/compiled/next-devtools'] = path.resolve(
        __dirname,
        'node_modules/next/dist/next-devtools/dev-overlay.shim.js'
      );
    }

    return config;
  },
  async redirects() {
    return [
      // Legacy URL redirects
      {
        source: '/upscale',
        destination: '/tools/ai-image-upscaler',
        permanent: true,
      },
      {
        source: '/enhance',
        destination: '/tools/ai-photo-enhancer',
        permanent: true,
      },
      // Category redirects (singular to plural)
      {
        source: '/tool/:slug',
        destination: '/tools/:slug',
        permanent: true,
      },
      {
        source: '/format/:slug',
        destination: '/formats/:slug',
        permanent: true,
      },
      {
        source: '/guide/:slug',
        destination: '/guides/:slug',
        permanent: true,
      },
      {
        source: '/use-case/:slug',
        destination: '/use-cases/:slug',
        permanent: true,
      },
      {
        source: '/alternative/:slug',
        destination: '/alternatives/:slug',
        permanent: true,
      },
      // Blog cannibalization fixes — consolidate duplicate intent posts
      {
        source: '/blog/best-free-ai-image-upscaler-tools-2026',
        destination: '/blog/best-free-ai-image-upscaler-2026-tested-compared',
        permanent: true,
      },
      {
        source: '/blog/best-image-upscaling-tools-2026',
        destination: '/blog/best-free-ai-image-upscaler-2026-tested-compared',
        permanent: true,
      },
      {
        source: '/blog/photo-enhancement-upscaling-vs-quality',
        destination: '/blog/ai-image-upscaling-vs-sharpening-explained',
        permanent: true,
      },
      {
        source: '/blog/free-upscaler-no-sign-up',
        destination: '/blog/free-ai-upscaler-no-watermark',
        permanent: true,
      },
      {
        source: '/blog/upscale-image-online-free',
        destination: '/blog/free-ai-upscaler-no-watermark',
        permanent: true,
      },
      {
        source: '/blog/ai-vs-traditional-image-upscaling',
        destination: '/blog/ai-image-upscaling-vs-sharpening-explained',
        permanent: true,
      },
      // Locale-prefixed variants for the same redirects
      {
        source: '/:locale(en|fr|de|es|it|ja|pt)/blog/best-free-ai-image-upscaler-tools-2026',
        destination: '/:locale/blog/best-free-ai-image-upscaler-2026-tested-compared',
        permanent: true,
      },
      {
        source: '/:locale(en|fr|de|es|it|ja|pt)/blog/best-image-upscaling-tools-2026',
        destination: '/:locale/blog/best-free-ai-image-upscaler-2026-tested-compared',
        permanent: true,
      },
      {
        source: '/:locale(en|fr|de|es|it|ja|pt)/blog/photo-enhancement-upscaling-vs-quality',
        destination: '/:locale/blog/ai-image-upscaling-vs-sharpening-explained',
        permanent: true,
      },
      {
        source: '/:locale(en|fr|de|es|it|ja|pt)/blog/free-upscaler-no-sign-up',
        destination: '/:locale/blog/free-ai-upscaler-no-watermark',
        permanent: true,
      },
      {
        source: '/:locale(en|fr|de|es|it|ja|pt)/blog/upscale-image-online-free',
        destination: '/:locale/blog/free-ai-upscaler-no-watermark',
        permanent: true,
      },
      {
        source: '/:locale(en|fr|de|es|it|ja|pt)/blog/ai-vs-traditional-image-upscaling',
        destination: '/:locale/blog/ai-image-upscaling-vs-sharpening-explained',
        permanent: true,
      },
    ];
  },
  // Headers handled by middleware (lib/middleware/securityHeaders.ts)
  // Static asset caching handled by Cloudflare CDN automatically
};

// Initialize OpenNext for local development with Cloudflare bindings
if (process.env.NODE_ENV === 'development') {
  import('@opennextjs/cloudflare')
    .then(({ initOpenNextCloudflareForDev }) => {
      initOpenNextCloudflareForDev();
    })
    .catch(() => {
      // Ignore if not installed yet
    });
}

export default withNextIntl(nextConfig);
