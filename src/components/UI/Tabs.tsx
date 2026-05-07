'use client';

import { ReactNode } from 'react';

export interface TabDef<T extends string = string> {
  id: T;
  label: string;
  badge?: string | number;
}

interface Props<T extends string = string> {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  variant?: 'pills' | 'underline';
  className?: string;
}

/**
 * Lightweight tab strip used across drawers (Settings, Strategy detail).
 */
export default function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  variant = 'pills',
  className,
}: Props<T>) {
  if (variant === 'underline') {
    return (
      <div className={`flex items-center gap-1 border-b border-white/10 ${className ?? ''}`}>
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`relative px-3 py-2 text-xs font-semibold uppercase tracking-widest transition ${
                isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="ml-1.5 text-[10px] font-mono text-gray-500">
                  {typeof t.badge === 'number' ? t.badge : `(${t.badge})`}
                </span>
              )}
              {isActive && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent-light" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`chip-group flex-wrap ${className ?? ''}`}>
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`chip ${isActive ? 'active' : ''}`}
          >
            {t.label}
            {t.badge !== undefined && (
              <span className="ml-1.5 text-[10px] font-mono opacity-70">
                {typeof t.badge === 'number' ? t.badge : `(${t.badge})`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Hide/show wrapper that complements Tabs. */
export function TabPanel({
  active,
  id,
  children,
}: {
  active: string;
  id: string;
  children: ReactNode;
}) {
  if (active !== id) return null;
  return <div>{children}</div>;
}
