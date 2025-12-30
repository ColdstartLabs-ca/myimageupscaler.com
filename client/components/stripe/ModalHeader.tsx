'use client';

import { X, LucideIcon } from 'lucide-react';

interface IModalHeaderProps {
  title: string;
  icon?: LucideIcon;
  iconClassName?: string;
  onClose: () => void;
  disabled?: boolean;
}

/**
 * Reusable modal header component with title, icon, and close button
 */
export function ModalHeader({
  title,
  icon: Icon,
  iconClassName = 'text-muted-foreground',
  onClose,
  disabled = false,
}: IModalHeaderProps): JSX.Element {
  return (
    <div className="flex items-center justify-between p-6 border-b border-border">
      <div className="flex items-center gap-3">
        {Icon && (
          <div
            className={`p-2 rounded-lg ${iconClassName.includes('error') ? 'bg-error/10' : iconClassName.includes('success') ? 'bg-success/10' : iconClassName.includes('warning') ? 'bg-warning/10' : 'bg-surface-light'}`}
          >
            <Icon className={`h-5 w-5 ${iconClassName}`} />
          </div>
        )}
        <h2 className="text-xl font-semibold text-primary">{title}</h2>
      </div>
      <button
        onClick={onClose}
        className="text-muted-foreground hover:text-muted-foreground transition-colors"
        disabled={disabled}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
