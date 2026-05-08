import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Named layout views — save/load combinations of selected ticker, chart
 * settings, theme, density, and active drawer. Useful for switching
 * contexts ("Open" / "After-hours" / "Research") without re-configuring.
 */

export interface LayoutView {
  id: string;
  name: string;
  selectedTicker?: string;
  chartInterval?: '1m' | '5m' | '15m' | '1h' | '1d';
  chartRange?: '1d' | '5d' | '1mo' | '3mo';
  theme?: 'dark' | 'light';
  density?: 'comfortable' | 'compact';
  activeWatchlistId?: string;
  activeDrawer?: string | null;
  /** Chart indicators on/off snapshot */
  indicators?: {
    ema20?: boolean;
    ema50?: boolean;
    sma20?: boolean;
    vwap?: boolean;
    bollinger?: boolean;
    macd?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface LayoutState {
  views: LayoutView[];
  activeViewId: string | null;
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  addView: (input: Omit<LayoutView, 'id' | 'createdAt' | 'updatedAt'>) => LayoutView;
  updateView: (id: string, patch: Partial<LayoutView>) => void;
  deleteView: (id: string) => void;
  setActiveView: (id: string | null) => void;
}

function genId(): string {
  return `lv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      views: [],
      activeViewId: null,
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      addView: (input) => {
        const view: LayoutView = {
          ...input,
          id: genId(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        set((s) => ({ views: [...s.views, view] }));
        return view;
      },
      updateView: (id, patch) =>
        set((s) => ({
          views: s.views.map((v) =>
            v.id === id ? { ...v, ...patch, updatedAt: new Date() } : v
          ),
        })),
      deleteView: (id) =>
        set((s) => ({
          views: s.views.filter((v) => v.id !== id),
          activeViewId: s.activeViewId === id ? null : s.activeViewId,
        })),
      setActiveView: (id) => set({ activeViewId: id }),
    }),
    {
      name: 'layout-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
