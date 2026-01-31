import React, { forwardRef } from 'react';

export interface IInputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  type: string;
  placeholder: string;
  className?: string;
  error?: string;
  success?: boolean;
  ariaLabel?: string;
}

export const InputField = forwardRef<HTMLInputElement, IInputFieldProps>(
  ({ type, placeholder, className, error, success, ariaLabel, ...props }, ref) => {
    const getBorderClasses = () => {
      if (error) {
        return 'border-red-500 ring-2 ring-red-500/20 focus:border-red-500 focus:ring-red-500/20';
      }
      if (success) {
        return 'border-green-500 ring-2 ring-green-500/20 focus:border-green-500 focus:ring-green-500/20';
      }
      return 'border-border hover:border-border/80 focus:border-accent focus:ring-accent/20';
    };

    return (
      <div className="w-full">
        <input
          ref={ref}
          type={type}
          placeholder={placeholder}
          aria-label={ariaLabel || placeholder}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 bg-surface ${getBorderClasses()} ${className || ''} text-foreground placeholder:text-muted-foreground`}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-error font-medium">{error}</p>}
      </div>
    );
  }
);

InputField.displayName = 'InputField';
