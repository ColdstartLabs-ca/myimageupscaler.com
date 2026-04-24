import Link from 'next/link';
import type { Metadata } from 'next';
import { generateCategoryMetadata } from '@/lib/seo/metadata-factory';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';

export async function generateMetadata(): Promise<Metadata> {
  return generateCategoryMetadata('extensions', 'en');
}

interface IExtensionCard {
  slug: string;
  name: string;
  description: string;
  storeUrl: string;
  icon: string;
  features: string[];
  badge?: string;
}

const EXTENSIONS: IExtensionCard[] = [
  {
    slug: 'chrome',
    name: 'Chrome Extension',
    description: 'Upscale images from any webpage with AI-powered right-click upscaling. Drag & drop or context menu integration.',
    storeUrl: 'https://chrome.google.com/webstore/detail/myimageupscaler-ai-image-u/',
    icon: 'chrome',
    features: [
      'Right-click to upscale any image',
      'Drag & drop upload',
      'Side panel preview',
      '2x, 4x, 8x scaling options',
      'Cross-language support',
    ],
    badge: 'Most Popular',
  },
  {
    slug: 'edge',
    name: 'Edge Extension',
    description: 'AI image upscaling for Microsoft Edge. Right-click integration and drag & drop support.',
    storeUrl: 'https://microsoftedge.microsoft.com/addons/detail/myimageupscaler-ai-image-upsc/',
    icon: 'edge',
    features: [
      'Right-click to upscale any image',
      'Drag & drop upload',
      'Side panel preview',
      'Compatible with Edge ecosystem',
    ],
  },
];

export default function ExtensionsPage() {
  return (
    <>
      <SeoMetaTags metadata={await generateMetadata()} />
      <HreflangLinks category="extensions" locale="en" />

      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12 text-center">
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Browser Extensions
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-gray-600">
              Install our AI-powered image upscaling extensions and enhance images directly from your browser.
              Right-click on any image to upscale it instantly.
            </p>
          </div>

          {/* Extensions Grid */}
          <div className="grid gap-8 md:grid-cols-2">
            {EXTENSIONS.map((ext) => (
              <Link
                key={ext.slug}
                href={`/extensions/${ext.slug}`}
                className="group block rounded-xl border border-gray-200 p-6 transition hover:border-blue-500 hover:shadow-lg"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-lg bg-gradient-to-br ${
                      ext.icon === 'chrome'
                        ? 'from-yellow-400 to-yellow-600'
                        : 'from-blue-400 to-blue-600'
                    }`} />
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 group-hover:text-blue-600">
                        {ext.name}
                      </h2>
                      </div>
                    </div>
                    {ext.badge && (
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                        {ext.badge}
                      </span>
                    )}
                  </div>

                  <p className="mb-4 text-gray-600">{ext.description}</p>

                  <ul className="mb-6 space-y-2">
                    {ext.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                        <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center text-sm text-blue-600 group-hover:text-blue-700">
                    <span>Learn more</span>
                    <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
          </div>

          {/* Features Section */}
          <div className="mt-16 rounded-xl bg-gray-50 p-8">
            <h2 className="mb-6 text-2xl font-bold text-gray-900">Why Install Our Extension?</h2>
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="mb-2 font-semibold text-gray-900">Instant Upscaling</h3>
                <p className="text-sm text-gray-600">
                  Right-click any image on the web and upscale it instantly without leaving your browser.
                </p>
              </div>
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                  <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586 1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="mb-2 font-semibold text-gray-900">Drag & Drop</h3>
                <p className="text-sm text-gray-600">
                  Simply drag and drop images into the extension popup to upscale with your preferred settings.
                </p>
              </div>
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="mb-2 font-semibold text-gray-900">Quality Preview</h3>
                <p className="text-sm text-gray-600">
                  View before/after comparisons in the side panel before downloading your upscaled images.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
