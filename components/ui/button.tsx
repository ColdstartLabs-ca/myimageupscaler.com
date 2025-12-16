// Stub component for build compatibility
import React from 'react';

export const Button = ({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement => {
  return <button {...props}>{children}</button>;
};
