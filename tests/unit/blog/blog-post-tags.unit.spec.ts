import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { BlogPostTags } from '@client/components/blog/BlogPostTags';

describe('BlogPostTags', () => {
  it('renders nothing when tags are empty', () => {
    const { container } = render(React.createElement(BlogPostTags, { tags: [] }));
    expect(container.firstChild).toBeNull();
  });

  it('renders compact inline topic links without hash prefixes', () => {
    render(
      React.createElement(BlogPostTags, {
        tags: ['convert picture to outline', 'photo to line art', 'image tracing'],
      })
    );

    expect(screen.getByText('Topics')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'convert picture to outline' })).toHaveAttribute(
      'href',
      '/blog?q=convert%20picture%20to%20outline'
    );
    expect(screen.getByRole('link', { name: 'photo to line art' })).toBeInTheDocument();
    expect(screen.queryByText('#convert picture to outline')).not.toBeInTheDocument();
  });

  it('uses nav semantics when placed at the top of the article', () => {
    render(
      React.createElement(BlogPostTags, {
        tags: ['image upscaling'],
        placement: 'top',
      })
    );

    expect(screen.getByRole('navigation', { name: 'Topics' })).toBeInTheDocument();
  });
});

describe('blog post tag placement', () => {
  it('renders topics after the hero and before article content', () => {
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx'),
      'utf8'
    );

    expect(pageSource).toContain('BlogPostTags');
    expect(pageSource).toMatch(/<BlogPostTags tags=\{post\.tags\} placement="top" \/>/);
    expect(pageSource).not.toMatch(/<BlogPostTags tags=\{post\.tags\} className=/);
  });
});
