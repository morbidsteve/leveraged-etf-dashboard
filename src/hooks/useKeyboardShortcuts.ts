'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface KeyboardShortcutsOptions {
  onRefresh?: () => void;
  onSearch?: () => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const router = useRouter();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Don't trigger with modifier keys (except for specific combos)
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'n':
          event.preventDefault();
          router.push('/trades/new');
          break;
        case 'c':
          event.preventDefault();
          router.push('/calculator');
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
