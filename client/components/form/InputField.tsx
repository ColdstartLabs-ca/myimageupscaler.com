import React, { forwardRef } from 'react';

export interface IInputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  type: string;
  placeholder: string;
  className?: string;
  error?: string;
}

export const InputField = forwardRef<HTMLInputElement, IInputFieldProps>(
  ({ type, placeholder, className, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          type={type}
          placeholder={placeholder}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200 bg-background ${
            error ? 'border-error ring-2 ring-error/20' : 'border-border hover:border-border/80'
          } ${className || ''} text-foreground placeholder:text-muted-foreground/60`}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-error font-medium">{error}</p>}
      </div>
    );
  }
);

InputField.displayName = 'InputField';
