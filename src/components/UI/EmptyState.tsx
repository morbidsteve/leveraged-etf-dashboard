'use client';

import { ReactNode } from 'react';

/**
 * Consistent empty-state across panels. Single component instead of
 * eight ad-hoc "no data" divs that each look slightly different.
 */
interface Props {
  icon?: 'trades' | 'journal' | 'strategies' | 'analytics' | 'scanner' | 'alerts' | 'positions';
  title: string;
  description?: ReactNode;
  primaryCta?: { label: string; onClick: () => void };
  secondaryCta?: { label: string; onClick: () => void };
}

export default function EmptyState({
  icon = 'trades',
  title,
  description,
  primaryCta,
  secondaryCta,
}: Props) {
  return (
    <div className="card card-body text-center py-12 px-6">
      <div className="w-12 h-12 mx-auto rounded-full bg-white/[0.04] border border-white/5 flex items-center justify-center mb-4">
        <Icon kind={icon} />
      </div>
      <h3 className="text-base font-semibold text-white tracking-tight mb-1">{title}</h3>
      {description && (
        <div className="text-sm text-gray-400 leading-relaxed max-w-md mx-auto">
          {description}
        </div>
      )}
      {(primaryCta || secondaryCta) && (
        <div className="flex items-center justify-center gap-2 mt-5">
          {secondaryCta && (
            <button onClick={secondaryCta.onClick} className="btn btn-ghost text-sm">
              {secondaryCta.label}
            </button>
          )}
          {primaryCta && (
            <button onClick={primaryCta.onClick} className="btn btn-primary text-sm">
              {primaryCta.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Icon({ kind }: { kind: NonNullable<Props['icon']> }) {
  const cls = 'w-6 h-6 text-gray-500';
  switch (kind) {
    case 'trades':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      );
    case 'journal':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case 'strategies':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    case 'analytics':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case 'scanner':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    case 'alerts':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      );
    case 'positions':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
  }
}
