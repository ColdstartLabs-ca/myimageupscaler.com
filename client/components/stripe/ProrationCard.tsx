'use client';

interface IProrationCardProps {
  amountDue: number;
  currency?: string;
}

/**
 * Card component showing proration/billing adjustment details
 */
export function ProrationCard({ amountDue }: IProrationCardProps): JSX.Element {
  const getVariantStyles = () => {
    if (amountDue > 0) return 'border-info/20 bg-info/10';
    if (amountDue < 0) return 'border-success/20 bg-success/10';
    return 'border-border bg-surface';
  };

  const getAmountStyles = () => {
    if (amountDue > 0) return 'text-info';
    if (amountDue < 0) return 'text-success';
    return 'text-primary';
  };

  const getMessage = () => {
    if (amountDue > 0) return 'This amount will be charged immediately';
    if (amountDue < 0) return 'This amount will be credited to your account';
    return null;
  };

  return (
    <div className={`border rounded-lg p-4 mb-6 ${getVariantStyles()}`}>
      <h3 className="font-medium text-primary mb-2">Billing Adjustment</h3>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Proration amount:</span>
          <span className={`font-medium ${getAmountStyles()}`}>
            {amountDue > 0 ? '+' : ''}${(amountDue / 100).toFixed(2)}
          </span>
        </div>
        {getMessage() && <p className="text-sm text-muted-foreground">{getMessage()}</p>}
      </div>
    </div>
  );
}
