'use client';

interface IPlanComparisonCardProps {
  title: string;
  name: string;
  creditsPerMonth: number;
  variant?: 'current' | 'upgrade' | 'downgrade';
  effectiveText?: string;
}

/**
 * Card component showing plan details in comparison views
 */
export function PlanComparisonCard({
  title,
  name,
  creditsPerMonth,
  variant = 'current',
  effectiveText,
}: IPlanComparisonCardProps): JSX.Element {
  const variantStyles = {
    current: 'border-border bg-surface',
    upgrade: 'border-success/30 bg-success/10',
    downgrade: 'border-warning/30 bg-warning/10',
  };

  // Use explicit text colors for values to ensure contrast on all backgrounds
  const valueTextClass = 'text-text-primary';

  return (
    <div className={`border rounded-lg p-4 ${variantStyles[variant]}`}>
      <h3 className="font-medium text-text-primary mb-2">{title}</h3>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-text-secondary">Plan:</span>
          <span className={`font-medium ${valueTextClass}`}>{name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Credits:</span>
          <span className={valueTextClass}>{creditsPerMonth.toLocaleString()}/month</span>
        </div>
        {effectiveText && (
          <div className="flex justify-between">
            <span className="text-text-secondary">Effective:</span>
            <span className={`text-sm ${valueTextClass}`}>{effectiveText}</span>
          </div>
        )}
      </div>
    </div>
  );
}
