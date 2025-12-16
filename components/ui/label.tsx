// Stub component for build compatibility
import React from 'react';

export const Label = ({
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>): React.ReactElement => {
  return <label {...props}>{children}</label>;
};
