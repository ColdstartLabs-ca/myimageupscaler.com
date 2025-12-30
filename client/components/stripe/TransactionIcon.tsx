'use client';

type TransactionType = 'purchase' | 'subscription' | 'usage' | 'refund' | 'bonus';

interface ITransactionIconProps {
  type: TransactionType;
  className?: string;
}

/**
 * Icon configuration for each transaction type
 */
const TRANSACTION_ICONS: Record<
  TransactionType,
  {
    color: string;
    path: string | string[];
  }
> = {
  subscription: {
    color: 'text-success',
    path: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  },
  purchase: {
    color: 'text-info',
    path: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  },
  usage: {
    color: 'text-error',
    path: [
      'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
      'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    ],
  },
  refund: {
    color: 'text-warning',
    path: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
  },
  bonus: {
    color: 'text-accent',
    path: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7',
  },
};

/**
 * Transaction type icon component
 * Renders an SVG icon based on the transaction type
 */
export function TransactionIcon({
  type,
  className = 'h-5 w-5',
}: ITransactionIconProps): JSX.Element {
  const config = TRANSACTION_ICONS[type];
  const paths = Array.isArray(config.path) ? config.path : [config.path];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} ${config.color}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      {paths.map((d, index) => (
        <path key={index} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
      ))}
    </svg>
  );
}

/**
 * Get human-readable label for transaction type
 */
export function getTransactionTypeLabel(type: TransactionType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
