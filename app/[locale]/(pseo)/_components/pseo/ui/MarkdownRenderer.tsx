/**
 * Simple Markdown Renderer Component
 * Uses marked for reliable parsing with DOMPurify for security
 */

'use client';

import { ReactElement, memo } from 'react';
import { marked } from 'marked';
import createDOMPurify from 'dompurify';

interface IMarkdownRendererProps {
  content: string;
  className?: string;
}

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

const DOMPurify = createDOMPurify(window);

export const MarkdownRenderer = memo(({ content, className = '' }: IMarkdownRendererProps): ReactElement => {
  // Parse markdown and sanitize HTML
  const html = DOMPurify.sanitize(marked.parse(content) as string);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';
