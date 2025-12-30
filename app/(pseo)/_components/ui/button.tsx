import React from 'react';

export interface IButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'className'
> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: IButtonProps): React.ReactElement => {
  const baseClasses =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary:
      'bg-accent hover:bg-accent-hover text-white shadow-md hover:shadow-lg glow-blue hover:glow-blue-lg focus:ring-accent',
    secondary: 'glass-card hover:bg-surface-light text-white hover:text-accent focus:ring-accent',
    ghost: 'hover:bg-surface-light text-text-secondary hover:text-text-primary focus:ring-accent',
    accent:
      'bg-success hover:bg-success/90 text-white shadow-md hover:shadow-lg focus:ring-success',
  };

  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  const focusRingClasses = 'focus:ring-2 focus:ring-offset-2 focus:ring-offset-base';

  const classes = `
    ${baseClasses}
    ${variantClasses[variant]}
    ${sizeClasses[size]}
    ${focusRingClasses}
    ${className}
  `
    .trim()
    .replace(/\s+/g, ' ');

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
};
