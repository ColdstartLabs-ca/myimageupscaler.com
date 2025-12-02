# URL Architecture & Routing

## Sub-PRD 02: pSEO URL Structure

| Field               | Value                        |
| ------------------- | ---------------------------- |
| **Parent Document** | [00-index.md](./00-index.md) |
| **Status**          | Implemented                  |
| **Priority**        | P0                           |
| **Owner**           | Engineering                  |
| **Implemented**     | 2025-12-01                   |

---

## Overview

This document defines the URL architecture, routing patterns, and dynamic page generation strategy for PixelPerfect's programmatic SEO implementation.

---

## 1. URL Structure Philosophy

### 1.1 Design Principles

| Principle          | Description                       | Example                                 |
| ------------------ | --------------------------------- | --------------------------------------- |
| **Human-readable** | URLs should describe content      | `/tools/ai-image-upscaler` not `/t/123` |
| **Keyword-rich**   | Include target keywords naturally | `/guides/how-to-fix-blurry-photos`      |
| **Hierarchical**   | Category → Page structure         | `/compare/pixelperfect-vs-topaz`        |
| **Consistent**     | Same pattern across categories    | `/[category]/[slug]`                    |
| **Lowercase**      | All URLs lowercase with hyphens   | `/use-cases/ecommerce-product-photos`   |

### 1.2 URL Naming Conventions

```
Pattern: /{category}/{descriptive-slug}

Rules:
- Use hyphens (-) not underscores (_)
- All lowercase letters
- No special characters
- Max 60 characters for slug
- Include primary keyword when possible
- Avoid stop words when they don't add meaning
```

---

## 2. Complete URL Architecture

### 2.1 Full URL Tree

```
PixelPerfect pSEO URL Architecture
├── /tools/                           # Primary Tools Category
│   ├── page.tsx                      # Hub: /tools
│   └── [slug]/
│       └── page.tsx                  # Dynamic: /tools/[slug]
│       ├── ai-image-upscaler
│       ├── ai-photo-enhancer
│       ├── image-quality-enhancer
│       ├── photo-restoration
│       ├── batch-image-upscaler
│       ├── ai-image-enlarger
│       ├── ai-picture-enhancer
│       ├── ai-image-expander
│       ├── background-remover
│       └── noise-reduction
│
├── /formats/                         # File Format Category
│   ├── page.tsx                      # Hub: /formats
│   └── [slug]/
│       └── page.tsx                  # Dynamic: /formats/[slug]
│       ├── upscale-jpeg-images
│       ├── upscale-png-images
│       ├── upscale-webp-images
│       ├── upscale-heic-images
│       ├── upscale-gif-images
│       ├── upscale-bmp-images
│       ├── upscale-tiff-images
│       └── upscale-raw-photos
│
├── /scale/                           # Resolution Category
│   ├── page.tsx                      # Hub: /scale
│   └── [slug]/
│       └── page.tsx                  # Dynamic: /scale/[slug]
│       ├── upscale-images-2x
│       ├── upscale-images-4x
│       ├── upscale-images-8x
│       ├── upscale-images-16x
│       ├── upscale-to-4k
│       ├── upscale-to-8k
│       └── upscale-to-hd
│
├── /use-cases/                       # Industry/Use Case Category
│   ├── page.tsx                      # Hub: /use-cases
│   └── [slug]/
│       └── page.tsx                  # Dynamic: /use-cases/[slug]
│       ├── ecommerce-product-photos
│       ├── real-estate-listings
│       ├── social-media-images
│       ├── print-photography
│       ├── old-photo-restoration
│       ├── anime-manga-upscaling
│       ├── game-asset-upscaling
│       ├── medical-imaging
│       ├── digital-art-enhancement
│       └── thumbnail-upscaling
│
├── /compare/                         # Comparison Category
│   ├── page.tsx                      # Hub: /compare
│   └── [slug]/
│       └── page.tsx                  # Dynamic: /compare/[slug]
│       ├── pixelperfect-vs-topaz-gigapixel
│       ├── pixelperfect-vs-upscale-media
│       ├── pixelperfect-vs-vanceai
│       ├── pixelperfect-vs-bigjpg
│       ├── pixelperfect-vs-lets-enhance
│       ├── pixelperfect-vs-remini
│       ├── pixelperfect-vs-waifu2x
│       ├── pixelperfect-vs-imgupscaler
│       ├── pixelperfect-vs-deep-image
│       ├── free-vs-paid-upscalers
│       ├── online-vs-offline-upscalers
│       ├── ai-vs-traditional-upscaling
│       ├── best-ai-image-upscalers
│       ├── best-free-upscalers
│       └── best-batch-upscalers
│
├── /alternatives/                    # Alternatives Category
│   ├── page.tsx                      # Hub: /alternatives
│   └── [slug]/
│       └── page.tsx                  # Dynamic: /alternatives/[slug]
│       ├── topaz-gigapixel-alternatives
│       ├── upscale-media-alternatives
│       ├── bigjpg-alternatives
│       ├── waifu2x-alternatives
│       ├── lets-enhance-alternatives
│       ├── remini-alternatives
│       ├── vanceai-alternatives
│       ├── imgupscaler-alternatives
│       ├── photoshop-upscale-alternatives
│       └── lightroom-enhance-alternatives
│
├── /guides/                          # Educational Content
│   ├── page.tsx                      # Hub: /guides
│   └── [slug]/
│       └── page.tsx                  # Dynamic: /guides/[slug]
│       ├── how-to-upscale-images-without-losing-quality
│       ├── how-to-fix-blurry-photos
│       ├── how-to-restore-old-photos
│       ├── how-to-enhance-product-photos
│       ├── how-to-batch-upscale-images
│       ├── how-to-upscale-anime-images
│       ├── how-to-improve-image-resolution
│       ├── how-to-enlarge-photos-for-printing
│       ├── how-to-upscale-low-resolution-photos
│       ├── how-to-enhance-jpeg-quality
│       ├── ai-upscaling-explained
│       ├── image-resolution-guide
│       ├── photo-enhancement-tips
│       ├── batch-processing-guide
│       ├── format-conversion-guide
│       ├── ecommerce-image-optimization
│       ├── social-media-image-sizes
│       ├── print-resolution-requirements
│       ├── web-image-best-practices
│       └── api-integration-tutorial
│
└── /free/                            # Free Tools Category
    ├── page.tsx                      # Hub: /free
    └── [slug]/
        └── page.tsx                  # Dynamic: /free/[slug]
        ├── free-image-upscaler
        ├── free-photo-enhancer
        ├── free-ai-upscaler
        ├── free-online-upscaler
        └── free-batch-upscaler
```

### 2.2 Page Count Summary

| Category       | Pages  | Hub Page | Total  |
| -------------- | ------ | -------- | ------ |
| /tools/        | 10     | 1        | 11     |
| /formats/      | 8      | 1        | 9      |
| /scale/        | 7      | 1        | 8      |
| /use-cases/    | 10     | 1        | 11     |
| /compare/      | 15     | 1        | 16     |
| /alternatives/ | 10     | 1        | 11     |
| /guides/       | 20     | 1        | 21     |
| /free/         | 5      | 1        | 6      |
| **Total**      | **85** | **8**    | **93** |

---

## 3. Next.js App Router Implementation

### 3.1 Directory Structure

```
app/
├── (pseo)/                           # Route group (no URL segment)
│   ├── tools/
│   │   ├── page.tsx                  # /tools
│   │   └── [slug]/
│   │       └── page.tsx              # /tools/[slug]
│   │
│   ├── formats/
│   │   ├── page.tsx                  # /formats
│   │   └── [slug]/
│   │       └── page.tsx              # /formats/[slug]
│   │
│   ├── scale/
│   │   ├── page.tsx                  # /scale
│   │   └── [slug]/
│   │       └── page.tsx              # /scale/[slug]
│   │
│   ├── use-cases/
│   │   ├── page.tsx                  # /use-cases
│   │   └── [slug]/
│   │       └── page.tsx              # /use-cases/[slug]
│   │
│   ├── compare/
│   │   ├── page.tsx                  # /compare
│   │   └── [slug]/
│   │       └── page.tsx              # /compare/[slug]
│   │
│   ├── alternatives/
│   │   ├── page.tsx                  # /alternatives
│   │   └── [slug]/
│   │       └── page.tsx              # /alternatives/[slug]
│   │
│   ├── guides/
│   │   ├── page.tsx                  # /guides
│   │   └── [slug]/
│   │       └── page.tsx              # /guides/[slug]
│   │
│   └── free/
│       ├── page.tsx                  # /free
│       └── [slug]/
│           └── page.tsx              # /free/[slug]
```

### 3.2 Dynamic Route Implementation

```typescript
// app/(pseo)/tools/[slug]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getToolData, getAllToolSlugs } from '@/lib/pseo/data-loader';
import { generateToolSchema } from '@/lib/pseo/schema-generator';
import ToolPageTemplate from '@/components/pseo/ToolPageTemplate';

interface IToolPageProps {
  params: Promise<{ slug: string }>;
}

// Generate static paths at build time
export async function generateStaticParams() {
  const slugs = await getAllToolSlugs();
  return slugs.map((slug) => ({ slug }));
}

// Generate metadata
export async function generateMetadata({ params }: IToolPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getToolData(slug);

  if (!tool) return {};

  return {
    title: tool.metaTitle,
    description: tool.metaDescription,
    keywords: tool.secondaryKeywords.join(', '),
    openGraph: {
      title: tool.metaTitle,
      description: tool.metaDescription,
      type: 'website',
      url: `https://pixelperfect.app/tools/${slug}`,
      images: [
        {
          url: tool.ogImage || 'https://pixelperfect.app/og/tools-default.png',
          width: 1200,
          height: 630,
          alt: tool.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: tool.metaTitle,
      description: tool.metaDescription,
    },
    alternates: {
      canonical: `https://pixelperfect.app/tools/${slug}`,
    },
    robots: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  };
}

export default async function ToolPage({ params }: IToolPageProps) {
  const { slug } = await params;
  const tool = await getToolData(slug);

  if (!tool) {
    notFound();
  }

  const schema = generateToolSchema(tool);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <ToolPageTemplate data={tool} />
    </>
  );
}
```

### 3.3 Hub Page Implementation

```typescript
// app/(pseo)/tools/page.tsx
import { Metadata } from 'next';
import { getAllTools } from '@/lib/pseo/data-loader';
import CategoryHub from '@/components/pseo/CategoryHub';

export const metadata: Metadata = {
  title: 'AI Image Tools - Upscaler, Enhancer & More | PixelPerfect',
  description: 'Discover our suite of AI-powered image tools. Upscale, enhance, restore, and optimize your photos with cutting-edge technology. Free to try.',
  alternates: {
    canonical: 'https://pixelperfect.app/tools',
  },
};

export default async function ToolsHubPage() {
  const tools = await getAllTools();

  return (
    <CategoryHub
      title="AI Image Tools"
      description="Professional-grade AI tools for every image enhancement need"
      category="tools"
      items={tools}
    />
  );
}
```

---

## 4. Data Loading Architecture

### 4.1 Data Loader Module

```typescript
// src/lib/pseo/data-loader.ts
import { cache } from 'react';
import toolsData from '@/app/seo/data/tools.json';
import formatsData from '@/app/seo/data/formats.json';
import comparisonsData from '@/app/seo/data/comparisons.json';
import useCasesData from '@/app/seo/data/use-cases.json';
import guidesData from '@/app/seo/data/guides.json';
import alternativesData from '@/app/seo/data/alternatives.json';
import scalesData from '@/app/seo/data/scales.json';
import freeToolsData from '@/app/seo/data/free-tools.json';
import type {
  IToolPage,
  IFormatPage,
  IComparisonPage,
  IUseCasePage,
  IGuidePage,
  IAlternativePage,
  IScalePage,
  IFreePage,
  IPSEOPage,
} from '@/types/pseo';

// Tool Pages
export const getAllToolSlugs = cache(async (): Promise<string[]> => {
  return toolsData.pages.map(page => page.slug);
});

export const getToolData = cache(async (slug: string): Promise<IToolPage | null> => {
  const tool = toolsData.pages.find(page => page.slug === slug);
  return tool || null;
});

export const getAllTools = cache(async (): Promise<IToolPage[]> => {
  return toolsData.pages;
});

// Format Pages
export const getAllFormatSlugs = cache(async (): Promise<string[]> => {
  return formatsData.pages.map(page => page.slug);
});

export const getFormatData = cache(async (slug: string): Promise<IFormatPage | null> => {
  const format = formatsData.pages.find(page => page.slug === slug);
  return format || null;
});

export const getAllFormats = cache(async (): Promise<IFormatPage[]> => {
  return formatsData.pages;
});

// Comparison Pages
export const getAllComparisonSlugs = cache(async (): Promise<string[]> => {
  return comparisonsData.pages.map(page => page.slug);
});

export const getComparisonData = cache(async (slug: string): Promise<IComparisonPage | null> => {
  const comparison = comparisonsData.pages.find(page => page.slug === slug);
  return comparison || null;
});

export const getAllComparisons = cache(async (): Promise<IComparisonPage[]> => {
  return comparisonsData.pages;
});

// Use Case Pages
export const getAllUseCaseSlugs = cache(async (): Promise<string[]> => {
  return useCasesData.pages.map(page => page.slug);
});

export const getUseCaseData = cache(async (slug: string): Promise<IUseCasePage | null> => {
  const useCase = useCasesData.pages.find(page => page.slug === slug);
  return useCase || null;
});

export const getAllUseCases = cache(async (): Promise<IUseCasePage[]> => {
  return useCasesData.pages;
});

// Guide Pages
export const getAllGuideSlugs = cache(async (): Promise<string[]> => {
  return guidesData.pages.map(page => page.slug);
});

export const getGuideData = cache(async (slug: string): Promise<IGuidePage | null> => {
  const guide = guidesData.pages.find(page => page.slug === slug);
  return guide || null;
});

export const getAllGuides = cache(async (): Promise<IGuidePage[]> => {
  return guidesData.pages;
});

// Alternative Pages
export const getAllAlternativeSlugs = cache(async (): Promise<string[]> => {
  return alternativesData.pages.map(page => page.slug);
});

export const getAlternativeData = cache(async (slug: string): Promise<IAlternativePage | null> => {
  const alternative = alternativesData.pages.find(page => page.slug === slug);
  return alternative || null;
});

export const getAllAlternatives = cache(async (): Promise<IAlternativePage[]> => {
  return alternativesData.pages;
});

// Scale Pages
export const getAllScaleSlugs = cache(async (): Promise<string[]> => {
  return scalesData.pages.map(page => page.slug);
});

export const getScaleData = cache(async (slug: string): Promise<IScalePage | null> => {
  const scale = scalesData.pages.find(page => page.slug === slug);
  return scale || null;
});

export const getAllScales = cache(async (): Promise<IScalePage[]> => {
  return scalesData.pages;
});

// Free Tool Pages
export const getAllFreeSlugs = cache(async (): Promise<string[]> => {
  return freeToolsData.pages.map(page => page.slug);
});

export const getFreeData = cache(async (slug: string): Promise<IFreePage | null> => {
  const freeTool = freeToolsData.pages.find(page => page.slug === slug);
  return freeTool || null;
});

export const getAllFreeTools = cache(async (): Promise<IFreePage[]> => {
  return freeToolsData.pages;
});

// Aggregate function for sitemap
export const getAllPSEOPages = cache(async (): Promise<IPSEOPage[]> => {
  const [tools, formats, comparisons, useCases, guides, alternatives, scales, freeTools] =
    await Promise.all([
      getAllTools(),
      getAllFormats(),
      getAllComparisons(),
      getAllUseCases(),
      getAllGuides(),
      getAllAlternatives(),
      getAllScales(),
      getAllFreeTools(),
    ]);

  return [
    ...tools.map(p => ({ ...p, category: 'tools' as const })),
    ...formats.map(p => ({ ...p, category: 'formats' as const })),
    ...comparisons.map(p => ({ ...p, category: 'compare' as const })),
    ...useCases.map(p => ({ ...p, category: 'use-cases' as const })),
    ...guides.map(p => ({ ...p, category: 'guides' as const })),
    ...alternatives.map(p => ({ ...p, category: 'alternatives' as const })),
    ...scales.map(p => ({ ...p, category: 'scale' as const })),
    ...freeTools.map(p => ({ ...p, category: 'free' as const })),
  ];
});
```

### 4.2 Data File Location

```
app/
└── seo/
    ├── data/
    │   ├── tools.json             # 10 tool page definitions
    │   ├── formats.json           # 8 format page definitions
    │   ├── scales.json            # 7 scale page definitions
    │   ├── use-cases.json         # 10 use case page definitions
    │   ├── comparisons.json       # 15 comparison page definitions
    │   ├── alternatives.json      # 10 alternative page definitions
    │   ├── guides.json            # 20 guide page definitions
    │   └── free-tools.json        # 5 free tool page definitions
    │
    ├── keywords.csv               # Full keyword research data
    └── top_keywords.csv           # High-priority keywords
```

---

## 5. Internal Linking Strategy

### 5.1 Link Architecture

```mermaid
graph TD
    subgraph "Tier 1: Hub Pages"
        HOME[Homepage]
        UPSCALER[/upscaler]
        PRICING[/pricing]
    end

    subgraph "Tier 2: Category Hubs"
        TOOLS[/tools]
        FORMATS[/formats]
        SCALE[/scale]
        USECASES[/use-cases]
        COMPARE[/compare]
        ALTS[/alternatives]
        GUIDES[/guides]
        FREE[/free]
    end

    subgraph "Tier 3: pSEO Pages"
        TOOL_PAGES[Tool Pages x10]
        FORMAT_PAGES[Format Pages x8]
        SCALE_PAGES[Scale Pages x7]
        USECASE_PAGES[Use Case Pages x10]
        COMPARE_PAGES[Comparison Pages x15]
        ALT_PAGES[Alternative Pages x10]
        GUIDE_PAGES[Guide Pages x20]
        FREE_PAGES[Free Pages x5]
    end

    HOME --> TOOLS
    HOME --> COMPARE
    HOME --> UPSCALER
    HOME --> FREE

    TOOLS --> TOOL_PAGES
    FORMATS --> FORMAT_PAGES
    SCALE --> SCALE_PAGES
    USECASES --> USECASE_PAGES
    COMPARE --> COMPARE_PAGES
    ALTS --> ALT_PAGES
    GUIDES --> GUIDE_PAGES
    FREE --> FREE_PAGES

    TOOL_PAGES <--> COMPARE_PAGES
    TOOL_PAGES <--> GUIDE_PAGES
    FORMAT_PAGES <--> GUIDE_PAGES
    USECASE_PAGES <--> TOOL_PAGES
    COMPARE_PAGES <--> ALT_PAGES
    FREE_PAGES <--> TOOL_PAGES
```

### 5.2 Cross-Linking Rules

| From Category     | Link To           | Link Type           | Quantity     |
| ----------------- | ----------------- | ------------------- | ------------ |
| Tool Pages        | Compare Pages     | Contextual          | 2-3 per page |
| Tool Pages        | Guide Pages       | "How to use"        | 1-2 per page |
| Tool Pages        | Format Pages      | "Supported formats" | 3-4 per page |
| Compare Pages     | Tool Pages        | Feature mentions    | 2-3 per page |
| Compare Pages     | Alternative Pages | Cross-reference     | 1-2 per page |
| Guide Pages       | Tool Pages        | CTA/Action          | 2-3 per page |
| Guide Pages       | Format Pages      | Technical details   | 1-2 per page |
| Format Pages      | Scale Pages       | Resolution options  | 2-3 per page |
| Use Case Pages    | Tool Pages        | Solutions           | 2-3 per page |
| Use Case Pages    | Guide Pages       | Tutorials           | 1-2 per page |
| Free Pages        | Tool Pages        | Upgrade path        | 1-2 per page |
| Alternative Pages | Compare Pages     | Detailed comparison | 1-2 per page |

### 5.3 Link Implementation

```typescript
// src/components/pseo/RelatedPages.tsx
interface IRelatedPagesProps {
  currentSlug: string;
  category: string;
  relatedSlugs: string[];
}

export default function RelatedPages({
  currentSlug,
  category,
  relatedSlugs,
}: IRelatedPagesProps) {
  return (
    <section className="mt-12 border-t pt-8">
      <h2 className="text-2xl font-bold mb-6">Related Pages</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {relatedSlugs
          .filter((slug) => slug !== currentSlug)
          .slice(0, 6)
          .map((slug) => (
            <RelatedPageCard key={slug} slug={slug} category={category} />
          ))}
      </div>
    </section>
  );
}
```

---

## 6. Redirect & Migration Strategy

### 6.1 URL Redirects

```typescript
// next.config.ts
const nextConfig = {
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
      // Typo corrections
      {
        source: '/tools/ai-image-upscalar',
        destination: '/tools/ai-image-upscaler',
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
};
```

### 6.2 404 Handling

```typescript
// app/(pseo)/[category]/[slug]/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Page Not Found</h1>
        <p className="text-gray-600 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/tools" className="btn-primary">
            Browse Tools
          </Link>
          <Link href="/" className="btn-secondary">
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
```

---

## 7. SEO URL Optimization

### 7.1 URL Best Practices Checklist

- [ ] All URLs are lowercase
- [ ] Hyphens used for word separation
- [ ] No trailing slashes
- [ ] No URL parameters for content variations
- [ ] Keywords present in URL path
- [ ] Max 3-4 levels deep
- [ ] Descriptive slugs (not IDs)
- [ ] Consistent category naming

### 7.2 Canonical URL Generation

```typescript
// src/lib/pseo/url-utils.ts
const BASE_URL = 'https://pixelperfect.app';

export function generateCanonicalUrl(category: string, slug: string): string {
  return `${BASE_URL}/${category}/${slug}`;
}

export function generateCategoryUrl(category: string): string {
  return `${BASE_URL}/${category}`;
}

export function validateSlug(slug: string): boolean {
  // Only lowercase letters, numbers, and hyphens
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugRegex.test(slug) && slug.length <= 60;
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Spaces to hyphens
    .replace(/-+/g, '-') // Multiple hyphens to single
    .replace(/^-|-$/g, '') // Trim hyphens
    .slice(0, 60); // Max length
}
```

---

## 8. Implementation Checklist

### Phase 1: Foundation (Week 1)

- [ ] Create `app/(pseo)/` route group
- [ ] Implement `/tools/` routes
- [ ] Implement `/compare/` routes
- [ ] Implement `/free/` routes
- [ ] Set up data loader module
- [ ] Create sample JSON data files

### Phase 2: Expansion (Week 2)

- [ ] Implement `/formats/` routes
- [ ] Implement `/scale/` routes
- [ ] Implement `/use-cases/` routes
- [ ] Implement `/alternatives/` routes
- [ ] Implement `/guides/` routes
- [ ] Set up all hub pages

### Phase 3: Polish (Week 3)

- [ ] Implement redirect rules
- [ ] Add 404 handling
- [ ] Set up internal linking component
- [ ] Validate all URLs against checklist
- [ ] Test all dynamic routes
- [ ] Performance optimization

---

## Document Changelog

| Version | Date       | Author           | Changes                                                 |
| ------- | ---------- | ---------------- | ------------------------------------------------------- |
| 1.0     | 2025-12-01 | Development Team | Initial URL architecture                                |
| 1.1     | 2025-12-01 | Development Team | Implemented: routes, data loaders, URL utils, redirects |

## Implementation Summary

### Created Infrastructure (2025-12-01)

1. **URL Utilities** (`lib/seo/url-utils.ts`)

   - Canonical URL generation
   - Slug validation and generation
   - Category helpers and constants
   - Category display names and descriptions

2. **pSEO Page Types** (`lib/seo/pseo-types.ts`)

   - Complete type definitions for all page categories
   - Tool, Format, Scale, Use Case, Comparison, Alternative, Guide, Free pages
   - Supporting interfaces for features, FAQs, steps, etc.

3. **Data Loader Module** (`lib/seo/data-loader.ts`)

   - React cache-based data loading
   - Slug generators for all categories
   - Page data loaders for all categories
   - Aggregate function for sitemap generation
   - Temporary implementation using keyword mappings

4. **Next.js Routes** (`app/(pseo)/`)

   - Created route group structure for clean URLs
   - Implemented dynamic [slug] routes for all categories
   - Hub pages for each category
   - Metadata generation per page
   - Static params generation at build time

5. **Redirects** (`next.config.js`)

   - Legacy URL redirects (/upscale → /tools/ai-image-upscaler)
   - Singular to plural category redirects
   - Permanent (301) redirects for SEO

6. **Module Exports** (`lib/seo/index.ts`)
   - Centralized exports for all SEO functionality
   - Type exports, data loaders, utilities

### Routes Created

- ✅ `/tools/` - 10 tools mapped
- ✅ `/compare/` - Comparison pages
- ✅ `/free/` - Free tool pages
- ✅ `/guides/` - Guide pages
- ✅ `/scale/` - Directory structure created
- ✅ `/formats/` - Directory structure created
- ✅ `/use-cases/` - Directory structure created
- ✅ `/alternatives/` - Directory structure created

### Next Steps

- Create JSON data files for each category in `app/seo/data/`
- Build page templates for content rendering
- Implement schema markup (PRD-PSEO-04)
- Generate sitemap (PRD-PSEO-04)
- Proceed to PRD-PSEO-03: Content Templates
