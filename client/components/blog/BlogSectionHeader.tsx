import type { LucideIcon } from 'lucide-react';

interface IBlogSectionHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  iconVariant?: 'accent' | 'success';
}

export function BlogSectionHeader({
  icon: Icon,
  title,
  subtitle,
  iconVariant = 'accent',
}: IBlogSectionHeaderProps): JSX.Element {
  const iconContainerClass =
    iconVariant === 'success'
      ? 'rounded-full border border-success/40 bg-success/10 text-success'
      : 'rounded-xl bg-accent/10 text-accent';

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center ${iconContainerClass}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="font-display text-xl font-bold text-primary">{title}</h2>
        {subtitle ? <p className="text-sm text-text-secondary">{subtitle}</p> : null}
      </div>
    </div>
  );
}
