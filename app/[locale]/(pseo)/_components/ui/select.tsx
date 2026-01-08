// Stub component for build compatibility
import React from 'react';

export const Select = ({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>): React.ReactElement => {
  return <select {...props}>{children}</select>;
};

export const SelectTrigger = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <div>{children}</div>
);
export const SelectValue = ({ placeholder }: { placeholder: string }): React.ReactElement => (
  <span>{placeholder}</span>
);
export const SelectContent = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <div>{children}</div>
);
export const SelectItem = ({
  children,
  value,
}: {
  children: React.ReactNode;
  value: string;
}): React.ReactElement => <option value={value}>{children}</option>;
