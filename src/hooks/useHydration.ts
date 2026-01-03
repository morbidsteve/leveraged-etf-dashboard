'use client';

import { useState, useEffect } from 'react';
import { useTradeStore, useSettingsStore, useAlertStore } from '@/store';

export function useHydration() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}

// Hook that waits for both DOM hydration and Zustand store hydration
export function useStoreHydration() {
  const [hydrated, setHydrated] = useState(false);

  // Subscribe to store hydration states
  const tradeHydrated = useTradeStore((state) => state._hasHydrated);
  const settingsHydrated = useSettingsStore((state) => state._hasHydrated);
  const alertHydrated = useAlertStore((state) => state._hasHydrated);

  useEffect(() => {
    // Check if all stores are hydrated
    if (tradeHydrated && settingsHydrated && alertHydrated) {
      setHydrated(true);
    }
  }, [tradeHydrated, settingsHydrated, alertHydrated]);

  return hydrated;
}
