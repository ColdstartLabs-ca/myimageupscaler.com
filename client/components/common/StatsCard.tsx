import { LucideIcon } from 'lucide-react';
import { JSX } from 'react';

interface IStatsCardProps {
  title: string;
  mainValue: string;
  subValue?: string;
  icon: LucideIcon;
  color: string;
  percentageChange?: number;
}

export function StatsCard({
  title,
  mainValue,
  subValue,
  icon: Icon,
  color,
  percentageChange,
}: IStatsCardProps): JSX.Element {
  return (
    <div
      className={`bg-gray-800 rounded-lg p-6 shadow-lg transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] hover:bg-gray-750 group`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 group-hover:translate-x-1 transition-transform duration-300">
          <h2 className={`text-lg font-semibold text-${color}-500`}>{title}</h2>
          {percentageChange !== undefined && (
            <span
              className={`text-sm font-medium ${
                percentageChange >= 0 ? 'text-green-500' : 'text-red-500'
              }`}
              title="Change in the last 24h"
            >
              {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange)}%
            </span>
          )}
        </div>
        <div
          className={`p-2 rounded-full bg-${color}-500/10 group-hover:scale-110 transition-transform duration-300`}
        >
          <Icon className={`h-6 w-6 text-${color}-500`} />
        </div>
      </div>
      <div className="mt-4 group-hover:translate-x-1 transition-transform duration-300">
        <p className="text-2xl font-bold tracking-tight">{mainValue}</p>
        {subValue && <p className="text-gray-400 text-sm mt-1">{subValue}</p>}
      </div>
    </div>
  );
}
