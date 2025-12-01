import React, { forwardRef } from 'react';

export interface IInputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  type: string;
  placeholder: string;
  className?: string;
  error?: string;
  success?: boolean;
}

export const InputField = forwardRef<HTMLInputElement, IInputFieldProps>(
  ({ type, placeholder, className, error, success, ...props }, ref) => {
    const getBorderClasses = () => {
      if (error) {
        return 'border-red-300 ring-2 ring-red-500/20 focus:border-red-500 focus:ring-red-500/20';
      }
      if (success) {
        return 'border-green-400 ring-2 ring-green-500/20 focus:border-green-500 focus:ring-green-500/20';
      }
      return 'border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/20';
    };

    return (
      <div className="w-full">
        <input
          ref={ref}
          type={type}
          placeholder={placeholder}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 bg-white ${getBorderClasses()} ${className || ''} text-slate-900 placeholder:text-slate-400`}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-red-600 font-medium">{error}</p>}
      </div>
    );
  }
);

InputField.displayName = 'InputField';
