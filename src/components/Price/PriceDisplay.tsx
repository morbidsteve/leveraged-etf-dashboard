'use client';

import { useEffect, useState, useRef } from 'react';
import { PriceData } from '@/types';
import { formatPrice, formatPercent } from '@/lib/calculations';

interface PriceDisplayProps {
  data: PriceData | null;
  showVolume?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function PriceDisplay({
  data,
  showVolume = true,
  size = 'lg',
}: PriceDisplayProps) {
  const [flashClass, setFlashClass] = useState('');
  const prevPrice = useRef<number | null>(null);

  useEffect(() => {
    if (data && prevPrice.current !== null) {
      if (data.price > prevPrice.current) {
        setFlashClass('flash-up');
      } else if (data.price < prevPrice.current) {
        setFlashClass('flash-down');
      }

      const timer = setTimeout(() => setFlashClass(''), 500);
      return () => clearTimeout(timer);
    }
    prevPrice.current = data?.price ?? null;
  }, [data?.price]);

  if (!data) {
    return (
      <div className={`${getSizeClasses(size)}`}>
        <div className="text-gray-500 animate-pulse">Loading...</div>
      </div>
    );
  }

  const isPositive = data.change >= 0;
  const changeColor = isPositive ? 'text-profit' : 'text-loss';

  return (
    <div className={`${getSizeClasses(size)} ${flashClass} rounded-lg transition-colors`}>
      <div className="flex items-baseline gap-2">
        <span className="text-gray-400 text-sm">{data.ticker}</span>
      </div>

      <div className="font-mono font-bold text-white">
        {formatPrice(data.price)}
      </div>

      <div className={`font-mono ${changeColor} flex items-center gap-2`}>
        <span>
          {isPositive ? '+' : ''}{formatPrice(data.change)}
        </span>
        <span>({formatPercent(data.changePercent)})</span>
      </div>

      {showVolume && (
        <div className="text-gray-500 text-sm mt-1">
          Vol: {formatVolume(data.volume)}
        </div>
      )}
    </div>
  );
}

function getSizeClasses(size: 'sm' | 'md' | 'lg'): string {
  switch (size) {
    case 'sm':
      return 'text-sm';
    case 'md':
      return 'text-base [&_.font-bold]:text-2xl';
    case 'lg':
      return 'text-lg [&_.font-bold]:text-4xl';
  }
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return `${(volume / 1_000_000_000).toFixed(2)}B`;
  }
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(2)}M`;
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(2)}K`;
  }
  return volume.toString();
}
