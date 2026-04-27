import Link from 'next/link';
import type { Metadata } from 'next';
import { generateCategoryMetadata } from '@/lib/seo/metadata-factory';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

export async function generateMetadata(): Promise<Metadata> {
  return generateCategoryMetadata('extensions', 'en');
}

const FEATURES = [
  {
    title: 'Right-Click to Upscale',
    description:
      'Simply right-click on any image on the web and select "Upscale with MyImageUpscaler" to enhance it instantly.',
    icon: '🖱️',
  },
  {
    title: 'Drag & Drop Upload',
    description:
      'Open the extension popup and drag & drop images directly to upscale with your preferred settings.',
    icon: '📤',
  },
  {
    title: 'Side Panel Preview',
    description:
      'View beautiful before/after comparisons in the side panel before downloading your upscaled images.',
    icon: '👁️',
  },
  {
    title: 'Multiple Scale Options',
    description:
      'Choose from 2x, 4x, or 8x upscaling to get the perfect resolution for your needs.',
    icon: '📏',
  },
  {
    title: 'Quality Tiers',
    description:
      'Select from Auto, Quick, Face Restore, HD Upscale, or Ultra quality modes for optimal results.',
    icon: '⚡',
  },
  {
    title: 'Credits Sync',
    description:
      'Your MyImageUpscaler account syncs seamlessly with the extension for consistent credit tracking.',
    icon: '💳',
  },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: 'Install the Extension',
    description: 'Add the MyImageUpscaler extension from the Chrome Web Store to your browser.',
  },
  {
    step: 2,
    title: 'Sign In',
    description: 'Connect your MyImageUpscaler account to access your credits and settings.',
  },
  {
    step: 3,
    title: 'Start Upscaling',
    description: 'Right-click any image or drag & drop into the popup to upscale instantly.',
  },
];

export default function ChromeExtensionPage() {
  return (
    <>
      <SeoMetaTags path="/extensions/chrome" locale="en" />

      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-400 to-yellow-600">
              <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm-2-9c-.55 0-1 .45-1 1v1c0 .55-.45 1-1 1s-1-.45-1-1V7c0-.55.45-1 1-1zm2 3c.55 0 1-.45 1-1v-1c0-.55.45-1 1-1s1 .45 1 1v1c0 .55-.45 1-1 1z" />
              </svg>
            </div>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              MyImageUpscaler Chrome Extension
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-gray-600">
              Upscale images from any webpage with AI-powered right-click upscaling. Install our
              Chrome extension and enhance images without leaving your browser.
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <a
                href="https://chrome.google.com/webstore/detail/myimageupscaler-ai-image-u/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l4-4m-4 4h4"
                  />
                </svg>
                Install from Chrome Web Store
              </a>
              <Link
                href="/extensions"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                View All Extensions
              </Link>
            </div>
          </div>

          {/* Features */}
          <section className="mb-16">
            <h2 className="mb-8 text-2xl font-bold text-gray-900">Features</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(feature => (
                <div key={feature.title} className="rounded-xl border border-gray-200 p-6">
                  <div className="mb-3 text-3xl">{feature.icon}</div>
                  <h3 className="mb-2 text-lg font-semibold text-gray-900">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* How It Works */}
          <section className="mb-16">
            <h2 className="mb-8 text-2xl font-bold text-gray-900">How It Works</h2>
            <div className="space-y-6">
              {HOW_IT_WORKS.map(item => (
                <div key={item.step} className="flex gap-6">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="mb-2 text-lg font-semibold text-gray-900">{item.title}</h3>
                    <p className="text-gray-600">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* System Requirements */}
          <section className="mb-16 rounded-xl bg-gray-50 p-8">
            <h2 className="mb-4 text-xl font-bold text-gray-900">System Requirements</h2>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Google Chrome browser (version 88 or higher)</li>
              <li>• MyImageUpscaler account (free to sign up)</li>
              <li>• Internet connection for API calls</li>
            </ul>
          </section>

          {/* FAQ */}
          <section>
            <h2 className="mb-8 text-2xl font-bold text-gray-900">Frequently Asked Questions</h2>
            <div className="space-y-6">
              <div className="border-b border-gray-200 pb-6">
                <h3 className="mb-2 font-semibold text-gray-900">Is the Chrome extension free?</h3>
                <p className="text-gray-600">
                  The extension is free to install, but uses credits from your MyImageUpscaler
                  account. New users get free credits to try the service, and additional credits can
                  be purchased as needed.
                </p>
              </div>
              <div className="border-b border-gray-200 pb-6">
                <h3 className="mb-2 font-semibold text-gray-900">
                  Does the extension work on all websites?
                </h3>
                <p className="text-gray-600">
                  Yes! You can right-click on most images on any website to upscale them. Some
                  websites may have restrictions on certain images due to their server policies.
                </p>
              </div>
              <div className="border-b border-gray-200 pb-6">
                <h3 className="mb-2 font-semibold text-gray-900">
                  What image sizes can I upscale?
                </h3>
                <p className="text-gray-600">
                  The extension supports upscaling images up to your available credit balance.
                  Larger images may consume more credits. You can choose 2x, 4x, or 8x scaling
                  factors.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-gray-900">Is my data private?</h3>
                <p className="text-gray-600">
                  Yes. The extension only communicates with our secure API to process images. We
                  don&apos;t collect browsing history or personal data beyond what&apos;s necessary
                  for the upscaling service.
                </p>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className="mt-16 rounded-xl bg-blue-50 p-8 text-center">
            <h2 className="mb-4 text-2xl font-bold text-gray-900">Ready to Upscale Any Image?</h2>
            <p className="mb-6 text-gray-600">
              Install the MyImageUpscaler Chrome extension and start enhancing images from any
              webpage.
            </p>
            <a
              href="https://chrome.google.com/webstore/detail/myimageupscaler-ai-image-u/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-4 font-semibold text-white transition hover:bg-blue-700"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l4-4m-4 4h4"
                />
              </svg>
              Add to Chrome — It&apos;s Free
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
