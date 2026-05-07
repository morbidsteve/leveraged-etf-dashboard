'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface KeyboardShortcutsOptions {
  onRefresh?: () => void;
  onSearch?: () => void;
  onNewTrade?: () => void;
  onCalculator?: () => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const router = useRouter();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key.toLowerCase()) {
        case 'n':
          event.preventDefault();
          if (options.onNewTrade) options.onNewTrade();
          else router.push('/trades/new');
          break;
        case 'c':
          event.preventDefault();
          if (options.onCalculator) options.onCalculator();
          else router.push('/calculator');
          break;
        case 'r':
          event.preventDefault();
          options.onRefresh?.();
          break;
        case '/':
          event.preventDefault();
          options.onSearch?.();
          break;
      }
    },
    [router, options]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
