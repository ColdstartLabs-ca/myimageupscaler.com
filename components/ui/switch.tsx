// Stub component for build compatibility
import React from 'react';

export const Switch = ({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}): React.ReactElement => {
  return (
    <input type="checkbox" checked={checked} onChange={e => onCheckedChange(e.target.checked)} />
  );
};
