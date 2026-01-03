'use client';

import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export default function StatCard({
  label,
  value,
  subValue,
  icon,
  trend,
  className = '',
}: StatCardProps) {
  const trendColor = trend === 'up'
    ? 'text-profit'
    : trend === 'down'
      ? 'text-loss'
      : 'text-gray-400';

  return (
    <div className={`stat-card ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label">{label}</p>
          <p className={`stat-value ${trendColor}`}>{value}</p>
          {subValue && (
            <p className="text-sm text-gray-500 mt-1">{subValue}</p>
          )}
        </div>
        {icon && (
          <div className="text-gray-500">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
