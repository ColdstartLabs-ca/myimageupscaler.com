'use client';

import { Search, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function BlogSearch(): JSX.Element {
  const t = useTranslations('blog.search');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) {
        params.set('q', query);
        params.delete('page');
      } else {
        params.delete('q');
      }
      router.push(`/blog?${params.toString()}`, { scroll: false });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, router, searchParams]);

  return (
    <div className="relative max-w-md mx-auto">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={t('placeholder')}
        aria-label={t('placeholder')}
        className="w-full pl-10 pr-10 py-2.5 bg-surface/50 border border-border/50 rounded-full text-sm text-white placeholder:text-text-secondary focus:outline-none focus:border-accent/50 focus:bg-surface transition-all"
      />
      {query && (
        <button
          onClick={() => setQuery('')}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
