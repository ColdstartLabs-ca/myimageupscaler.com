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
          ? 'text-indigo-600 bg-indigo-50'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
      )}
    >
      <Icon className={cn('h-5 w-5 mb-1', active ? 'text-indigo-600' : 'text-slate-400')} />
      <span>{children}</span>
    </button>
  );
};
