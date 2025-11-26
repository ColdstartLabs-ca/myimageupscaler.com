import { AreaChart, BadgeDelta, Card, DeltaType, Flex, Metric, Text } from '@tremor/react';
import { JSX, ReactNode } from 'react';

interface IProps {
  title: string;
  value: string;
  icon: ReactNode;
  trend?: string;
  trendUp?: boolean;
  sparklineData?: { date: string; value: number }[];
}

export function StatsCard({
  title,
  value,
  icon,
  trend,
  trendUp,
  sparklineData,
}: IProps): JSX.Element {
  const deltaType: DeltaType = trendUp ? 'increase' : 'decrease';

  return (
    <Card
      className="bg-cyber-darker border border-cyber-primary/20 hover:border-cyber-primary/40 transition-all duration-300"
      decoration="top"
      decorationColor={trendUp ? 'emerald' : 'rose'}
    >
      <Flex alignItems="start">
        <div>
          <Text className="text-cyber-text">{title}</Text>
          <Metric className="text-cyber-primary mt-2">{value}</Metric>
        </div>
        <div className="text-cyber-primary">{icon}</div>
      </Flex>

      {sparklineData && (
        <div className="mt-4 h-12">
          <AreaChart
            data={sparklineData}
            index="date"
            categories={['value']}
            colors={[trendUp ? 'emerald' : 'rose']}
            showXAxis={false}
            showYAxis={false}
            showLegend={false}
            showGridLines={false}
            showAnimation={true}
            className="h-12"
          />
        </div>
      )}

      {trend && (
        <Flex className="mt-4">
          <BadgeDelta deltaType={deltaType} className="text-cyber-text">
            {trend}
          </BadgeDelta>
        </Flex>
      )}
    </Card>
  );
}
