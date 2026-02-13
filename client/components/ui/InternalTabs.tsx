'use client';

import React, { useState } from 'react';
import { cn } from '@client/utils/cn';
import { LucideIcon } from 'lucide-react';

export interface ITabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  content: React.ReactNode;
}

interface IInternalTabsProps {
  tabs: ITabItem[];
  defaultTab?: string;
  className?: string;
}

export const InternalTabs: React.FC<IInternalTabsProps> = ({ tabs, defaultTab, className }) => {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? '');
  const activeContent = tabs.find(t => t.id === activeTab)?.content;

  return (
    <div className={className}>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map(tab => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative',
                isActive ? 'text-accent' : 'text-muted-foreground hover:text-white'
              )}
            >
              {Icon && <Icon size={16} />}
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>{activeContent}</div>
    </div>
  );
};
