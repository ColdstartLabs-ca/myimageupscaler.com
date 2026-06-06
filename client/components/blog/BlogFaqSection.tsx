import { HelpCircle } from 'lucide-react';
import { BlogSectionHeader } from '@client/components/blog/BlogSectionHeader';
import type { IBlogFaqItem } from '@lib/blog/blog-faq';

interface IBlogFaqSectionProps {
  items: IBlogFaqItem[];
}

export function BlogFaqSection({ items }: IBlogFaqSectionProps): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <section id="frequently-asked-questions" className="not-prose mt-12">
      <BlogSectionHeader
        icon={HelpCircle}
        title="Frequently Asked Questions"
        subtitle="Quick answers for this guide"
      />
      <div className="mt-5 divide-y divide-border rounded-2xl border border-border bg-surface-light">
        {items.map(item => (
          <details key={item.question} className="group">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-primary transition-colors hover:text-accent">
              <span className="flex items-center justify-between gap-4">
                {item.question}
                <span className="text-lg text-accent transition-transform group-open:rotate-45">
                  +
                </span>
              </span>
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-text-secondary">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
