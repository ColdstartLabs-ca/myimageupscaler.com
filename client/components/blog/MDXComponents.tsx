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
  <h1 className="text-3xl font-bold text-slate-900 mt-8 mb-4">{children}</h1>
);

const H2 = ({ children }: IHeadingProps): JSX.Element => (
  <h2 className="text-2xl font-semibold text-slate-800 mt-8 mb-4 pb-2 border-b border-slate-200">
    {children}
  </h2>
);

const H3 = ({ children }: IHeadingProps): JSX.Element => (
  <h3 className="text-xl font-semibold text-slate-800 mt-6 mb-3">{children}</h3>
);

const H4 = ({ children }: IHeadingProps): JSX.Element => (
  <h4 className="text-lg font-medium text-slate-700 mt-4 mb-2">{children}</h4>
);

const Paragraph = ({ children }: IChildrenProps): JSX.Element => (
  <p className="text-slate-600 leading-relaxed mb-4">{children}</p>
);

const Anchor = ({ href, children }: ILinkProps): JSX.Element => {
  const isInternal = href?.startsWith('/') || href?.startsWith('#');

  if (isInternal && href) {
    return (
      <Link
        href={href}
        className="text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
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
      className="text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
    >
      {children}
    </a>
  );
};

const MDXImage = ({ src, alt }: IMdxImageProps): JSX.Element | null => {
  if (!src) return null;

  return (
    <figure className="my-8">
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-100">
        <img src={src} alt={alt || ''} className="w-full h-full object-cover" />
      </div>
      {alt && <figcaption className="text-center text-sm text-slate-500 mt-2">{alt}</figcaption>}
    </figure>
  );
};

const CodeBlock = ({ children, className }: ICodeProps): JSX.Element => {
  const isInline = !className;

  if (isInline) {
    return (
      <code className="bg-slate-100 text-indigo-600 px-1.5 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    );
  }

  return (
    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto my-6">
      <code className={`${className} text-sm font-mono`}>{children}</code>
    </pre>
  );
};

const Blockquote = ({ children }: IBlockquoteProps): JSX.Element => (
  <blockquote className="border-l-4 border-indigo-500 pl-4 my-6 italic text-slate-600 bg-indigo-50 py-3 pr-4 rounded-r-lg">
    {children}
  </blockquote>
);

const UnorderedList = ({ children }: IListProps): JSX.Element => (
  <ul className="list-disc list-inside space-y-2 text-slate-600 mb-4 ml-4">{children}</ul>
);

const OrderedList = ({ children }: IListProps): JSX.Element => (
  <ol className="list-decimal list-inside space-y-2 text-slate-600 mb-4 ml-4">{children}</ol>
);

const ListItem = ({ children }: IChildrenProps): JSX.Element => (
  <li className="leading-relaxed">{children}</li>
);

const HorizontalRule = (): JSX.Element => <hr className="my-8 border-slate-200" />;

const Table = ({ children }: IChildrenProps): JSX.Element => (
  <div className="overflow-x-auto my-6">
    <table className="min-w-full border-collapse border border-slate-200 rounded-lg">
      {children}
    </table>
  </div>
);

const TableHead = ({ children }: IChildrenProps): JSX.Element => (
  <thead className="bg-slate-100">{children}</thead>
);

const TableBody = ({ children }: IChildrenProps): JSX.Element => (
  <tbody className="divide-y divide-slate-200">{children}</tbody>
);

const TableRow = ({ children }: IChildrenProps): JSX.Element => (
  <tr className="hover:bg-slate-50">{children}</tr>
);

const TableHeader = ({ children }: IChildrenProps): JSX.Element => (
  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border border-slate-200">
    {children}
  </th>
);

const TableCell = ({ children }: IChildrenProps): JSX.Element => (
  <td className="px-4 py-3 text-sm text-slate-600 border border-slate-200">{children}</td>
);

// Callout component for tips, warnings, etc.
interface ICalloutProps {
  type?: 'info' | 'warning' | 'tip' | 'error';
  children?: ReactNode;
}

const Callout = ({ type = 'info', children }: ICalloutProps): JSX.Element => {
  const styles = {
    info: 'bg-blue-50 border-blue-500 text-blue-800',
    warning: 'bg-amber-50 border-amber-500 text-amber-800',
    tip: 'bg-green-50 border-green-500 text-green-800',
    error: 'bg-red-50 border-red-500 text-red-800',
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
