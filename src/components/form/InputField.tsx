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
      <div className="mb-6">
        <input
          ref={ref}
          type={type}
          placeholder={placeholder}
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-red-500' : 'border-gray-300'
          } ${className || ''}`}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

InputField.displayName = 'InputField';
