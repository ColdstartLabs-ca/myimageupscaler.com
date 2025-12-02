import type { MDXComponents } from 'mdx/types';
import { mdxComponents } from '@client/components/blog/MDXComponents';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...mdxComponents,
    ...components,
  };
}
