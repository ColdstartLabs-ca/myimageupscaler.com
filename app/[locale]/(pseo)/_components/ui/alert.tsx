// Stub components for build compatibility
import React from 'react';

export const Alert = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement => {
  return <div className={className}>{children}</div>;
};

export const AlertDescription = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => <div>{children}</div>;
