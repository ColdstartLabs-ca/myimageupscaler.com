'use client';

import React from 'react';
import { cn } from '@client/utils/cn';
import { LucideIcon } from 'lucide-react';

interface ITabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  children: React.ReactNode;
}

export const TabButton: React.FC<ITabButtonProps> = ({ active, onClick, icon: Icon, children }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex flex-col items-center justify-center py-3 px-3 text-xs font-medium transition-colors duration-200 min-w-[60px] touch-manipulation',
        active
          ? 'text-accent bg-accent/10 glow-blue'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface/50'
      )}
    >
      <Icon className={cn('h-5 w-5 mb-1', active ? 'text-accent' : 'text-text-muted')} />
      <span>{children}</span>
    </button>
  );
};
