export interface IBlogFaqItem {
  question: string;
  answer: string;
}

export interface IBlogFaqPostInput {
  title: string;
  description: string;
  category: string;
  tags?: string[];
}

export interface IBlogFaqJsonLd {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: {
    '@type': 'Question';
    name: string;
    acceptedAnswer: {
      '@type': 'Answer';
      text: string;
    };
  }[];
}

type BlogFaqIntent = 'how-to' | 'comparison' | 'requirements' | 'why' | 'general';

function cleanTopicFromTitle(title: string): string {
  return title
    .replace(/\bcomplete guide\b/gi, '')
    .replace(/\bguide\b/gi, '')
    .replace(/\btested\s*&?\s*compared\b/gi, '')
    .replace(/\btested\b/gi, '')
    .replace(/\bcompared\b/gi, '')
    .replace(/\bcomparison\b/gi, '')
    .replace(/\bfor\s+perfect\b.*$/gi, '')
    .replace(/\bfor\s+20\d{2}\b/gi, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/^how to\s+/i, '')
    .replace(/^best\s+/i, '')
    .replace(/\bno watermark\b/gi, 'with no watermark')
    .replace(/\s*[:|-]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]$/, '');
}

function getCategoryContext(category: string): string {
  const normalizedCategory = category.toLowerCase();

  if (normalizedCategory.includes('e-commerce')) {
    return 'product photos, marketplace requirements, label readability, and consistent catalog output';
  }

  if (normalizedCategory.includes('tips')) {
    return 'quick quality fixes, platform requirements, and practical image preparation choices';
  }

  return 'source image quality, upscale settings, output dimensions, and final visual inspection';
}

function sentenceCaseTopic(topic: string): string {
  const preserveWords = new Set([
    'AI',
    'API',
    'DPI',
    'HEIC',
    'JPEG',
    'PNG',
    'WebP',
    'DALL-E',
    '4K',
    '8K',
  ]);

  return topic
    .split(' ')
    .map(word => {
      const cleanWord = word.replace(/^[^\w]+|[^\w]+$/g, '');
      if (preserveWords.has(cleanWord) || /^[A-Z0-9-]{2,}$/.test(cleanWord)) return word;
      return word.toLowerCase();
    })
    .join(' ');
}

function getFaqIntent(title: string, category: string): BlogFaqIntent {
  const normalized = `${title} ${category}`.toLowerCase();

  if (/^how to\b/.test(normalized)) return 'how-to';
  if (/^why\b/.test(normalized)) return 'why';
  if (/\b(best|top|compare|comparison|compared|tools?|upscalers?)\b/.test(normalized)) {
    return 'comparison';
  }
  if (/\b(size|sizes|requirements?|dpi|resolution|print|format)\b/.test(normalized)) {
    return 'requirements';
  }

  return 'general';
}

function getPrimaryQuestion(intent: BlogFaqIntent, topic: string): string {
  const lowerTopic = sentenceCaseTopic(topic);

  if (intent === 'how-to') return `How do I ${lowerTopic}?`;
  if (intent === 'why') return `${lowerTopic.charAt(0).toUpperCase()}${lowerTopic.slice(1)}?`;
  if (intent === 'comparison') return `How do I choose the right ${lowerTopic}?`;
  if (intent === 'requirements') return `What should I know about ${lowerTopic}?`;

  return `What should I know about ${lowerTopic}?`;
}

function getPrimaryAnswer(intent: BlogFaqIntent, post: IBlogFaqPostInput): string {
  if (intent === 'comparison') {
    return `${post.description} Compare tools by output sharpness, watermark policy, signup requirements, file limits, export quality, and whether the result holds up when inspected at 100%.`;
  }

  if (intent === 'requirements') {
    return `${post.description} Start by confirming the target size, format, and platform requirements, then upscale only as much as needed to meet that target without introducing artifacts.`;
  }

  if (intent === 'why') {
    return `${post.description} The practical fix is to identify the source problem first, then use the smallest workflow that addresses it without over-processing the image.`;
  }

  return `${post.description} Start with the highest-quality source file available, choose the smallest upscale factor that meets your target size, and inspect the result at 100% before publishing or printing.`;
}

export function buildFallbackBlogFaq(post: IBlogFaqPostInput): IBlogFaqItem[] {
  const topic = cleanTopicFromTitle(post.title) || post.title;
  const intent = getFaqIntent(post.title, post.category);
  const categoryContext = getCategoryContext(post.category);
  const tagContext = post.tags?.slice(0, 3).join(', ');
  const topicContext = tagContext
    ? `${categoryContext}, especially ${tagContext}`
    : categoryContext;

  return [
    {
      question: getPrimaryQuestion(intent, topic),
      answer: getPrimaryAnswer(intent, post),
    },
    {
      question: `When should I use AI upscaling for this workflow?`,
      answer: `Use AI upscaling when the original image is too small for the target use case but still has enough detail to guide the model. For ${post.category.toLowerCase()} work, pay closest attention to ${topicContext}.`,
    },
    {
      question: `How do I avoid losing quality after upscaling?`,
      answer:
        'Upscale once from the best original, avoid repeated compression, keep important text and edges sharp, and export in a format that matches the final use. If the output shows halos, smeared texture, or distorted text, reduce the upscale factor or use a cleaner source image.',
    },
  ];
}

export function buildFaqJsonLd(items: IBlogFaqItem[]): IBlogFaqJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
