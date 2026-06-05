interface IBlogSignalPost {
  slug: string;
  title: string;
  description: string;
  date?: string;
  image?: string;
  tags?: string[];
}

interface IOrganizationInput {
  appName: string;
  baseUrl: string;
}

interface IBlogIndexJsonLd {
  '@context': 'https://schema.org';
  '@type': 'Blog';
  name: string;
  description: string;
  url: string;
  publisher: {
    '@type': 'Organization';
    name: string;
    logo: string;
  };
  blogPost: {
    '@type': 'BlogPosting';
    headline: string;
    description: string;
    url: string;
    datePublished?: string;
    image: string;
  }[];
}

interface IBlogItemListJsonLd {
  '@context': 'https://schema.org';
  '@type': 'ItemList';
  name: string;
  itemListElement: {
    '@type': 'ListItem';
    position: number;
    url: string;
    name: string;
  }[];
}

interface IBlogBreadcrumbJsonLd {
  '@context': 'https://schema.org';
  '@type': 'BreadcrumbList';
  itemListElement: {
    '@type': 'ListItem';
    position: number;
    name: string;
    item: string;
  }[];
}

interface IBlogAboutEntity {
  '@type': 'Thing';
  name: string;
}

export function buildBlogIndexJsonLd(
  posts: IBlogSignalPost[],
  org: IOrganizationInput
): IBlogIndexJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${org.appName} Image Enhancement Blog`,
    description:
      'AI image upscaling guides, image enhancement tutorials, tool comparisons, and print preparation advice.',
    url: `${org.baseUrl}/blog`,
    publisher: {
      '@type': 'Organization',
      name: org.appName,
      logo: `${org.baseUrl}/logo/horizontal-logo-full.png`,
    },
    blogPost: posts.slice(0, 12).map(post => ({
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      url: `${org.baseUrl}/blog/${post.slug}`,
      datePublished: post.date,
      image: post.image || `${org.baseUrl}/og-image.png`,
    })),
  };
}

export function buildBlogItemListJsonLd(
  posts: IBlogSignalPost[],
  org: IOrganizationInput
): IBlogItemListJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${org.appName} latest image enhancement guides`,
    itemListElement: posts.slice(0, 12).map((post, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${org.baseUrl}/blog/${post.slug}`,
      name: post.title,
    })),
  };
}

export function buildBlogBreadcrumbJsonLd(
  post: Pick<IBlogSignalPost, 'slug' | 'title'>,
  org: IOrganizationInput
): IBlogBreadcrumbJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: org.baseUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: `${org.baseUrl}/blog`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: `${org.baseUrl}/blog/${post.slug}`,
      },
    ],
  };
}

export function buildBlogAboutEntities(tags: string[] = []): IBlogAboutEntity[] {
  return tags.slice(0, 6).map(tag => ({
    '@type': 'Thing',
    name: tag,
  }));
}
