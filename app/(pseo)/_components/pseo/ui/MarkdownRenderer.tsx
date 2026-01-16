/**
 * Simple Markdown Renderer Component
 * Uses marked for reliable parsing with DOMPurify for security
 * Sanitization runs client-side only to avoid jsdom dependency issues in edge runtime
 */

'use client';

import { ReactElement, memo, useMemo, useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface IMarkdownRendererProps {
  content: string;
  className?: string;
}

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

export const MarkdownRenderer = memo(
  ({ content, className = '' }: IMarkdownRendererProps): ReactElement => {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
      setIsClient(true);
    }, []);

    // Parse markdown (works on both server and client)
    const parsedMarkdown = useMemo(() => marked.parse(content) as string, [content]);

    // Sanitize only on client side - content is trusted (our markdown files)
    // This avoids jsdom dependency issues in edge/serverless environments
    const html = useMemo(
      () => (isClient ? DOMPurify.sanitize(parsedMarkdown) : parsedMarkdown),
      [parsedMarkdown, isClient]
    );

    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }
);

MarkdownRenderer.displayName = 'MarkdownRenderer';
