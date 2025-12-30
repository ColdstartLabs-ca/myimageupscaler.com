'use client';

import { useEffect, useState, useCallback } from 'react';
import { StripeService } from '@client/services/stripeService';
import { TransactionIcon, getTransactionTypeLabel } from './TransactionIcon';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface ICreditTransaction {
  id: string;
  amount: number;
  type: 'purchase' | 'subscription' | 'usage' | 'refund' | 'bonus';
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

interface IProps {
  limit?: number;
}

/**
 * Component to display credit transaction history
 *
 * Usage:
 * ```tsx
 * <CreditHistory limit={20} />
 * ```
 */
export function CreditHistory({ limit = 50 }: IProps): JSX.Element {
  const [transactions, setTransactions] = useState<ICreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ limit, offset: 0, total: 0 });

  const loadTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await StripeService.getCreditHistory(limit, 0);
      setTransactions(data.transactions);
      setPagination(data.pagination);
      setError(null);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load transaction history';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  if (loading) {
    return (
      <div className="bg-surface rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-primary mb-4">Transaction History</h3>
        <div className="flex items-center justify-center py-12">
          <svg
            className="animate-spin h-8 w-8 text-accent"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-primary mb-4">Transaction History</h3>
        <div className="bg-error/10 border border-error/20 rounded-lg p-4">
          <p className="text-sm text-error">{error}</p>
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-surface rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-primary mb-4">Transaction History</h3>
        <div className="text-center py-12">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12 text-slate-300 mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-muted-foreground">No transaction history yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-lg shadow overflow-hidden">
      <div className="p-6 border-b border-white/10">
        <h3 className="text-lg font-semibold text-primary">Transaction History</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Showing {transactions.length} of {pagination.total} transactions
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-surface">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Type
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Description
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Amount
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-slate-200">
            {transactions.map(transaction => (
              <tr key={transaction.id} className="hover:bg-surface transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <TransactionIcon type={transaction.type} />
                    <span className="text-sm font-medium text-primary">
                      {getTransactionTypeLabel(transaction.type)}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-primary">
                    {transaction.description || 'No description'}
                  </div>
                  {transaction.reference_id && (
                    <div className="text-xs text-muted-foreground mt-1 font-mono">
                      {transaction.reference_id.substring(0, 20)}...
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`text-sm font-semibold ${
                      transaction.amount > 0 ? 'text-success' : 'text-error'
                    }`}
                  >
                    {transaction.amount > 0 ? '+' : ''}
                    {transaction.amount}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-primary">
                    {dayjs(transaction.created_at).format('MMM D, YYYY')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {dayjs(transaction.created_at).fromNow()}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
