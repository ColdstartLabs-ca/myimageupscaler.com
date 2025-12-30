import {
  Banknote,
  Coins,
  Home,
  Landmark,
  LayoutDashboard,
  LineChart,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { JSX } from 'react';
import { IconType } from '@/shared/types/icons.types';

const icons = {
  Coins,
  LineChart,
  Home,
  Landmark,
  Banknote,
  LayoutDashboard,
  Wand2,
  Sparkles,
} as const;

interface ITabProps {
  id: string;
  label: string;
  icon: IconType;
  isActive: boolean;
  onClick: () => void;
}

export const Tab = ({ label, icon, isActive, onClick }: ITabProps): JSX.Element => {
  const Icon = icons[icon];

  return (
    <button
      className={`
        tab flex-1 gap-1.5 px-3 py-2 min-h-0 h-auto text-sm transition-colors duration-200 rounded-lg
        hover:bg-accent/10
        ${isActive ? 'bg-accent/20 text-accent font-medium' : 'text-text-muted'}
      `}
      onClick={onClick}
    >
      <Icon className="w-4 h-4" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
};
