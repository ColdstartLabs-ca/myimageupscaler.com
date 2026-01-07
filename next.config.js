/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  typescript: {
    // Keep TypeScript checking enabled
    ignoreBuildErrors: false,
  },
  // Always use trailing slashes for proper SEO
  trailingSlash: true,
  // Skip static generation for OpenNext migration
  ...(process.env.OPENNEXT && {
    output: 'export',
  }),
  // Transpile packages for proper ESM handling
  transpilePackages: ['react-markdown', 'remark-gfm', 'unified', 'bail'],
  // Performance optimizations
  images: {
    unoptimized: process.env.OPENNEXT ? true : false,
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
    ],
    // Optimize image formats
    formats: ['image/avif', 'image/webp'],
  },
  // Enable experimental features for better performance
  experimental: {
    // Optimize package imports for smaller bundles
    optimizePackageImports: ['lucide-react', 'react-icons', 'date-fns', '@supabase/supabase-js'],
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
    ];
  },
  async headers() {
    return [
      {
        // Apply security and CORS headers to all API routes
        source: '/api/:path*',
        headers: [
          // Security headers
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // CORS headers
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
          {
            key: 'Access-Control-Allow-Origin',
            // Use ALLOWED_ORIGIN env var in production, '*' for development
            // SECURITY: Set ALLOWED_ORIGIN to your actual domain in production!
            value: process.env.ALLOWED_ORIGIN || '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'X-CSRF-Token, X-Requested-With, Accept, Authorization, Content-Type, X-User-Id',
          },
        ],
      },
      {
        // Cache static assets
        source: '/:all*(svg|jpg|png|webp|avif|woff|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
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

export default nextConfig;
