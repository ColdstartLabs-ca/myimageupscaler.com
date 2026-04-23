import Link from 'next/link';
import type { Metadata } from 'next';
import { generateCategoryMetadata } from '@/lib/seo/metadata-factory';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';

export const dynamic = 'force-static';
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return generateCategoryMetadata('ai-photo-editor', 'en');
}

interface ITool {
  name: string;
  description: string;
  href: string;
  cta: string;
  badge: string | null;
  disabled?: boolean;
}

const TOOLS: ITool[] = [
  {
    name: 'AI Image Upscaler',
    description:
      'Increase photo resolution up to 4x with AI. Sharp details, no artifacts — perfect for printing, e-commerce, and restoring old photos.',
    href: '/tools/ai-image-upscaler',
    cta: 'Upscale free →',
    badge: 'Most popular',
  },
  {
    name: 'AI Photo Enhancer',
    description:
      'Fix blurry, noisy, and low-quality photos automatically. AI detects and corrects issues — faces, textures, and fine details restored.',
    href: '/tools/ai-photo-enhancer',
    cta: 'Enhance free →',
    badge: null,
  },
  {
    name: 'Background Remover',
    description:
      'Remove photo backgrounds in one click. Get a clean transparent PNG — perfect for product shots, portraits, and logos.',
    href: '/tools/ai-background-remover',
    cta: 'Remove background →',
    badge: null,
  },
  {
    name: 'Image Compressor',
    description:
      'Reduce file size without visible quality loss. Compress JPEG, PNG, and WebP for faster websites and uploads.',
    href: '/tools/image-compressor',
    cta: 'Compress free →',
    badge: null,
  },
  {
    name: 'Image Resizer',
    description:
      'Resize photos to any dimension. Presets for Instagram, YouTube, Facebook, and more — exact pixels or percentage.',
    href: '/tools/image-resizer',
    cta: 'Resize free →',
    badge: null,
  },
  {
    name: 'Image Cropper',
    description:
      'Crop photos to any aspect ratio with free-form or preset modes. Square, 16:9, 4:3, circular — coming soon.',
    href: '/image-cropper',
    cta: 'Coming soon',
    badge: 'Coming soon',
    disabled: true,
  },
];

const FEATURES = [
  {
    title: 'No software to install',
    body: 'Everything runs in your browser. Upload, edit, and download — no account needed for basic tools.',
  },
  {
    title: 'AI-powered results',
    body: 'Each tool uses machine learning trained on millions of images to produce professional-quality output.',
  },
  {
    title: 'Free to start',
    body: 'Core features are free. Upscaling and enhancement use credits — you get free credits on signup.',
  },
  {
    title: 'Private and secure',
    body: 'Your photos are processed and immediately discarded. We never store or share your images.',
  },
];

const FAQ = [
  {
    q: 'Is this a real AI photo editor?',
    a: 'Yes. Each tool uses AI models — not simple filters. The upscaler and enhancer run deep learning models trained on high-resolution photo pairs. The background remover uses semantic segmentation to detect subjects.',
  },
  {
    q: 'How is this different from Photoshop or Lightroom?',
    a: 'Traditional editors require manual adjustments and expertise. Our tools apply AI automatically — upload a photo and get results in seconds, not minutes. No sliders, no learning curve.',
  },
  {
    q: 'Are the tools really free?',
    a: 'Format converters, compressor, and resizer are fully free with no limits. Upscaling and enhancement use credits — you get free credits on signup without a credit card.',
  },
  {
    q: 'What image formats are supported?',
    a: 'JPEG, PNG, and WebP work across all tools. The enhancer and upscaler also support HEIC, BMP, and TIFF for most operations.',
  },
];

export default function AIPhotoEditorHubPage() {
  return (
    <>
      <SeoMetaTags path="/ai-photo-editor" locale="en" />
      <HreflangLinks path="/ai-photo-editor" category="ai-photo-editor" locale="en" />

      <div className="container mx-auto px-4 py-12 bg-base min-h-screen">
        {/* Hero */}
        <div className="max-w-2xl mb-14">
          <h1 className="text-4xl font-bold mb-4 text-text-primary">Free AI Photo Editor</h1>
          <p className="text-xl text-text-secondary">
            Six AI-powered tools for upscaling, enhancement, background removal, compression, and
            resizing. No software. No signup for most tools.
          </p>
        </div>

        {/* Tool grid */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold mb-5 text-text-primary border-b border-border pb-2">
            Choose a tool
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {TOOLS.map(tool => (
              <div
                key={tool.name}
                className={`relative block p-5 glass-card rounded-lg border transition-all ${
                  tool.disabled
                    ? 'border-border opacity-60 cursor-not-allowed'
                    : 'border-border hover:border-accent hover:shadow-lg group'
                }`}
              >
                {tool.badge && !tool.disabled && (
                  <span className="absolute top-3 right-3 text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                    {tool.badge}
                  </span>
                )}
                {tool.badge && tool.disabled && (
                  <span className="absolute top-3 right-3 text-xs font-medium px-2 py-0.5 rounded-full bg-surface text-text-secondary border border-border">
                    {tool.badge}
                  </span>
                )}
                <h3 className="text-lg font-semibold mb-2 text-text-primary pr-20">
                  {tool.disabled ? (
                    tool.name
                  ) : (
                    <Link href={tool.href} className="group-hover:text-accent transition-colors">
                      {tool.name}
                    </Link>
                  )}
                </h3>
                <p className="text-text-secondary text-sm line-clamp-3">{tool.description}</p>
                {!tool.disabled && (
                  <Link
                    href={tool.href}
                    className="inline-block mt-3 text-accent text-sm font-medium group-hover:text-accent-hover transition-colors"
                  >
                    {tool.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Demo / primary CTA */}
        <section className="mb-16 p-8 rounded-xl border border-accent/30 bg-accent/5">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold text-text-primary mb-3">
              Try AI Enhancement in 10 Seconds
            </h2>
            <p className="text-text-secondary mb-6">
              Upload any photo — blurry, low-res, or damaged. The AI upscaler increases resolution
              up to 4x while sharpening details. Free for your first images.
            </p>
            <Link
              href="/tools/ai-image-upscaler"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-colors"
            >
              Try AI Upscaler Free →
            </Link>
            <p className="mt-3 text-xs text-text-secondary">
              No signup required to start. Free credits on account creation.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold mb-6 text-text-primary border-b border-border pb-2">
            Why use these tools
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="p-5 glass-card rounded-lg border border-border">
                <h3 className="font-semibold text-text-primary mb-1">{f.title}</h3>
                <p className="text-sm text-text-secondary">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-6 text-text-primary border-b border-border pb-2">
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            {FAQ.map(item => (
              <div key={item.q}>
                <h3 className="font-semibold text-text-primary mb-1">{item.q}</h3>
                <p className="text-text-secondary text-sm">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
