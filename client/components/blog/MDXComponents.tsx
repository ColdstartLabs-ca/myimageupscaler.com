import { ReactNode } from 'react';
import Link from 'next/link';
import type { MDXComponents } from 'mdx/types';

interface IHeadingProps {
  children?: ReactNode;
}

interface ILinkProps {
  href?: string;
  children?: ReactNode;
}

interface IMdxImageProps {
  src?: string;
  alt?: string;
}

interface ICodeProps {
  children?: ReactNode;
  className?: string;
}

interface IBlockquoteProps {
  children?: ReactNode;
}

interface IListProps {
  children?: ReactNode;
}

interface IChildrenProps {
  children?: ReactNode;
}

const H1 = ({ children }: IHeadingProps): JSX.Element => (
  <h1 className="text-3xl font-bold text-text-primary mt-8 mb-4">{children}</h1>
);

const H2 = ({ children }: IHeadingProps): JSX.Element => (
  <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4 pb-2 border-b border-white/10">
    {children}
  </h2>
);

const H3 = ({ children }: IHeadingProps): JSX.Element => (
  <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">{children}</h3>
);

const H4 = ({ children }: IHeadingProps): JSX.Element => (
  <h4 className="text-lg font-medium text-text-secondary mt-4 mb-2">{children}</h4>
);

const Paragraph = ({ children }: IChildrenProps): JSX.Element => (
  <p className="text-text-secondary leading-relaxed mb-4">{children}</p>
);

const Anchor = ({ href, children }: ILinkProps): JSX.Element => {
  const isInternal = href?.startsWith('/') || href?.startsWith('#');

  if (isInternal && href) {
    return (
      <Link
        href={href}
        className="text-accent hover:text-accent-hover underline underline-offset-2"
      >
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:text-accent-hover underline underline-offset-2"
    >
      {children}
    </a>
  );
};

const MDXImage = ({ src, alt }: IMdxImageProps): JSX.Element | null => {
  if (!src) return null;

  return (
    <figure className="my-8">
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-surface-light">
        <img src={src} alt={alt || ''} className="w-full h-full object-cover" />
      </div>
      {alt && (
        <figcaption className="text-center text-sm text-text-secondary mt-2">{alt}</figcaption>
      )}
    </figure>
  );
};

const CodeBlock = ({ children, className }: ICodeProps): JSX.Element => {
  const isInline = !className;

  if (isInline) {
    return (
      <code className="bg-surface-light text-accent px-1.5 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    );
  }

  return (
    <pre className="bg-surface text-text-primary p-4 rounded-lg overflow-x-auto my-6 border border-white/10">
      <code className={`${className} text-sm font-mono`}>{children}</code>
    </pre>
  );
};

const Blockquote = ({ children }: IBlockquoteProps): JSX.Element => (
  <blockquote className="border-l-4 border-accent pl-4 my-6 italic text-text-secondary bg-accent/10 py-3 pr-4 rounded-r-lg">
    {children}
  </blockquote>
);

const UnorderedList = ({ children }: IListProps): JSX.Element => (
  <ul className="list-disc list-inside space-y-2 text-text-secondary mb-4 ml-4">{children}</ul>
);

const OrderedList = ({ children }: IListProps): JSX.Element => (
  <ol className="list-decimal list-inside space-y-2 text-text-secondary mb-4 ml-4">{children}</ol>
);

const ListItem = ({ children }: IChildrenProps): JSX.Element => (
  <li className="leading-relaxed">{children}</li>
);

const HorizontalRule = (): JSX.Element => <hr className="my-8 border-white/10" />;

const Table = ({ children }: IChildrenProps): JSX.Element => (
  <div className="overflow-x-auto my-6">
    <table className="min-w-full border-collapse border border-white/10 rounded-lg">
      {children}
    </table>
  </div>
);

const TableHead = ({ children }: IChildrenProps): JSX.Element => (
  <thead className="bg-surface-light">{children}</thead>
);

const TableBody = ({ children }: IChildrenProps): JSX.Element => (
  <tbody className="divide-y divide-white/10">{children}</tbody>
);

const TableRow = ({ children }: IChildrenProps): JSX.Element => (
  <tr className="hover:bg-surface">{children}</tr>
);

const TableHeader = ({ children }: IChildrenProps): JSX.Element => (
  <th className="px-4 py-3 text-left text-sm font-semibold text-text-secondary border border-white/10">
    {children}
  </th>
);

const TableCell = ({ children }: IChildrenProps): JSX.Element => (
  <td className="px-4 py-3 text-sm text-text-secondary border border-white/10">{children}</td>
);

// Callout component for tips, warnings, etc.
interface ICalloutProps {
  type?: 'info' | 'warning' | 'tip' | 'error';
  children?: ReactNode;
}

const Callout = ({ type = 'info', children }: ICalloutProps): JSX.Element => {
  const styles = {
    info: 'bg-accent/10 border-accent text-text-primary',
    warning: 'bg-warning/10 border-warning text-text-primary',
    tip: 'bg-success/10 border-success text-text-primary',
    error: 'bg-error/10 border-error text-text-primary',
  };

  const icons = {
    info: 'i',
    warning: '!',
    tip: '✓',
    error: '✕',
  };

  return (
    <div className={`border-l-4 p-4 my-6 rounded-r-lg ${styles[type]}`}>
      <div className="flex items-start gap-3">
        <span className="font-bold text-lg">{icons[type]}</span>
        <div>{children}</div>
      </div>
    </div>
  );
};

const Pre = ({ children }: IChildrenProps): JSX.Element => <>{children}</>;

export const mdxComponents: MDXComponents = {
  h1: H1,
  h2: H2,
  h3: H3,
  h4: H4,
  p: Paragraph,
  a: Anchor,
  img: MDXImage,
  code: CodeBlock,
  pre: Pre,
  blockquote: Blockquote,
  ul: UnorderedList,
  ol: OrderedList,
  li: ListItem,
  hr: HorizontalRule,
  table: Table,
  thead: TableHead,
  tbody: TableBody,
  tr: TableRow,
  th: TableHeader,
  td: TableCell,
  Callout,
};
