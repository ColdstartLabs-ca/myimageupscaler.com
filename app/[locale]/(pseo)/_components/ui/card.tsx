// Stub components for build compatibility
import React from 'react';

export const Card = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement => {
  return <div className={className}>{children}</div>;
};

export const CardHeader = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <div>{children}</div>
);
export const CardTitle = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <h3>{children}</h3>
);
export const CardContent = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <div>{children}</div>
);
