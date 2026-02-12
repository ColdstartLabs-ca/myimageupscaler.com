/**
 * Comparison Table Section Component
 * Displays page-specific comparison tables with real benchmark data
 */

import { FadeIn } from '@/app/(pseo)/_components/ui/MotionWrappers';
import type { IComparisonTable } from '@/lib/seo/pseo-types';
import { ReactElement } from 'react';

interface IComparisonTableSectionProps {
  comparisonTable: IComparisonTable;
  highlightRowIndex?: number;
}

export function ComparisonTableSection({
  comparisonTable,
  highlightRowIndex = -1,
}: IComparisonTableSectionProps): ReactElement {
  const { title, description, headers, rows } = comparisonTable;

  // Get all unique keys from rows to determine column data
  const rowKeys = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <FadeIn>
      <section className="py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">{title}</h2>
            {description && (
              <p className="text-text-secondary text-lg max-w-2xl mx-auto">{description}</p>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl glass-card-2025 border-white/10">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    {headers.map((header: string, idx: number) => (
                      <th
                        key={idx}
                        className="py-4 px-4 md:py-6 md:px-8 text-sm md:text-lg font-bold text-white"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {rows.map((row: Record<string, string | number | boolean>, rowIdx: number) => (
                    <tr
                      key={rowIdx}
                      className={`hover:bg-white/5 transition-colors ${
                        rowIdx === highlightRowIndex ? 'bg-accent/10' : ''
                      }`}
                    >
                      {rowKeys.map((key, cellIdx) => (
                        <td
                          key={cellIdx}
                          className={`py-4 px-4 md:py-5 md:px-8 text-sm md:text-base ${
                            rowIdx === highlightRowIndex && cellIdx > 0
                              ? 'text-accent font-bold'
                              : cellIdx === 0
                                ? 'text-white font-medium'
                                : 'text-text-secondary'
                          }`}
                        >
                          {row[key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {description && (
            <p className="mt-4 text-sm text-text-tertiary text-center">
              * Benchmarks based on typical image processing. Actual results may vary based on
              image complexity and size.
            </p>
          )}
        </div>
      </section>
    </FadeIn>
  );
}
