import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export { useStrategyStore } from './strategyStore';
export { usePaperStore } from './paperStore';
export type { PaperEntry, PaperTrade, TradeSnapshot } from './paperStore';
export { useAlertRuleStore } from './alertRuleStore';
export type { AlertRule, AlertRuleFire } from './alertRuleStore';
import {
  Trade,
  TradeEntry,
  TradeExit,
  PriceData,
  Candle,
  RSIConfig,
  RSIData,
  Alert,
  AlertSettings,
  ChartTimeframe,
  AppSettings,
  ScannerSettings,
  Watchlist,
} from '@/types';
import { DEFAULT_RSI_CONFIG } from '@/lib/rsi';
import { calculateAvgCost, calculateTotalShares, calculateRealizedPnL, generateId } from '@/lib/calculations';

// Price Store - for real-time price data
interface PriceState {
  prices: Record<string, PriceData>;
  candles: Record<string, Candle[]>;
  rsiData: Record<string, RSIData | null>;
  selectedTicker: string;
  selectedTimeframe: ChartTimeframe;
  isLoading: boolean;
  error: string | null;

  // Actions
  setPrice: (ticker: string, price: PriceData) => void;
  setCandles: (ticker: string, candles: Candle[]) => void;
  addCandle: (ticker: string, candle: Candle) => void;
  setRSIData: (ticker: string, data: RSIData | null) => void;
  setSelectedTicker: (ticker: string) => void;
  setSelectedTimeframe: (timeframe: ChartTimeframe) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const usePriceStore = create<PriceState>((set) => ({
  prices: {},
  candles: {},
  rsiData: {},
  selectedTicker: 'TQQQ',
  selectedTimeframe: { label: '1 min', value: '1m', minutes: 1 },
  isLoading: false,
  error: null,

  setPrice: (ticker, price) =>
    set((state) => ({
      prices: { ...state.prices, [ticker]: price },
    })),

  setCandles: (ticker, candles) =>
    set((state) => ({
      candles: { ...state.candles, [ticker]: candles },
    })),

  addCandle: (ticker, candle) =>
    set((state) => {
      const existing = state.candles[ticker] || [];
      const lastCandle = existing[existing.length - 1];

      // Update last candle if same timestamp, otherwise add new
      if (lastCandle && lastCandle.time === candle.time) {
        const updated = [...existing.slice(0, -1), candle];
        return { candles: { ...state.candles, [ticker]: updated } };
      }

      return { candles: { ...state.candles, [ticker]: [...existing, candle] } };
    }),

  setRSIData: (ticker, data) =>
    set((state) => ({
      rsiData: { ...state.rsiData, [ticker]: data },
    })),

  setSelectedTicker: (ticker) => set({ selectedTicker: ticker }),

  setSelectedTimeframe: (timeframe) => set({ selectedTimeframe: timeframe }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),
}));

// Trade Store - for trade management
interface TradeState {
  trades: Trade[];
  _hasHydrated: boolean;

  // Actions
  setHasHydrated: (state: boolean) => void;
  addTrade: (trade: Omit<Trade, 'id' | 'createdAt' | 'avgCost' | 'totalShares' | 'realizedPnL' | 'unrealizedPnL'>) => Trade;
  updateTrade: (id: string, updates: Partial<Trade>) => void;
  deleteTrade: (id: string) => void;
  addEntry: (tradeId: string, entry: Omit<TradeEntry, 'id'>) => void;
  addExit: (tradeId: string, exit: Omit<TradeExit, 'id'>) => void;
  closeTrade: (id: string) => void;
  getOpenTrades: () => Trade[];
  getClosedTrades: () => Trade[];
  getTradeById: (id: string) => Trade | undefined;
}

export const useTradeStore = create<TradeState>()(
  persist(
    (set, get) => ({
      trades: [],
      _hasHydrated: false,

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      addTrade: (tradeData) => {
        const newTrade: Trade = {
          ...tradeData,
          id: generateId(),
          createdAt: new Date(),
          avgCost: calculateAvgCost(tradeData.entries),
          totalShares: tradeData.entries.reduce((sum, e) => sum + e.shares, 0),
          realizedPnL: 0,
          unrealizedPnL: 0,
        };

        set((state) => ({
          trades: [...state.trades, newTrade],
        }));

        return newTrade;
      },

      updateTrade: (id, updates) =>
        set((state) => ({
          trades: state.trades.map((trade) =>
            trade.id === id ? { ...trade, ...updates } : trade
          ),
        })),

      deleteTrade: (id) =>
        set((state) => ({
          trades: state.trades.filter((trade) => trade.id !== id),
        })),

      addEntry: (tradeId, entry) =>
        set((state) => ({
          trades: state.trades.map((trade) => {
            if (trade.id !== tradeId) return trade;

            const newEntry = { ...entry, id: generateId() };
            const newEntries = [...trade.entries, newEntry];
            const avgCost = calculateAvgCost(newEntries);
            const totalShares = calculateTotalShares({ ...trade, entries: newEntries });

            return {
              ...trade,
              entries: newEntries,
              avgCost,
              totalShares,
            };
          }),
        })),

      addExit: (tradeId, exit) =>
        set((state) => ({
          trades: state.trades.map((trade) => {
            if (trade.id !== tradeId) return trade;

            const newExit = { ...exit, id: generateId() };
            const newExits = [...trade.exits, newExit];
            const updatedTrade = { ...trade, exits: newExits };
            const totalShares = calculateTotalShares(updatedTrade);
            const realizedPnL = calculateRealizedPnL(updatedTrade);

            // Auto-close if no shares remaining
            const isClosed = totalShares <= 0;

            return {
              ...updatedTrade,
              totalShares,
              realizedPnL,
              status: isClosed ? 'closed' : trade.status,
              closedAt: isClosed ? new Date() : trade.closedAt,
            };
          }),
        })),

      closeTrade: (id) =>
        set((state) => ({
          trades: state.trades.map((trade) =>
            trade.id === id
              ? { ...trade, status: 'closed', closedAt: new Date() }
              : trade
          ),
        })),

      getOpenTrades: () => get().trades.filter((t) => t.status === 'open'),

      getClosedTrades: () => get().trades.filter((t) => t.status === 'closed'),

      getTradeById: (id) => get().trades.find((t) => t.id === id),
    }),
    {
      name: 'trade-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ trades: state.trades }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// Alert Store
interface AlertState {
  alerts: Alert[];
  settings: AlertSettings;
  _hasHydrated: boolean;

  // Actions
  setHasHydrated: (state: boolean) => void;
  addAlert: (alert: Omit<Alert, 'id' | 'timestamp' | 'acknowledged'>) => void;
  acknowledgeAlert: (id: string) => void;
  clearAlerts: () => void;
  updateSettings: (settings: Partial<AlertSettings>) => void;
}

export const useAlertStore = create<AlertState>()(
  persist(
    (set) => ({
      alerts: [],
      _hasHydrated: false,
      settings: {
        id: 'default',
        ticker: 'TQQQ',
        rsiBuyThreshold: DEFAULT_RSI_CONFIG.oversold,
        rsiSellThreshold: DEFAULT_RSI_CONFIG.overbought,
        priceAlerts: {
          target15Enabled: true,
          target20Enabled: true,
        },
        volumeSpikeEnabled: false,
        drawdownThreshold: 5,
        soundEnabled: true,
        cooldownMinutes: 5,
        enabled: true,
      },

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      addAlert: (alertData) =>
        set((state) => ({
          alerts: [
            ...state.alerts,
            {
              ...alertData,
              id: generateId(),
              timestamp: new Date(),
              acknowledged: false,
            },
          ],
        })),

      acknowledgeAlert: (id) =>
        set((state) => ({
          alerts: state.alerts.map((alert) =>
            alert.id === id ? { ...alert, acknowledged: true } : alert
          ),
        })),

      clearAlerts: () => set({ alerts: [] }),

      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),
    }),
    {
      name: 'alert-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// Default scanner settings
export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = {
  rsiPeriod: 250,
  oversoldThreshold: 50,
  minWinRate: 0,
  minSignals: 1,
  dataSource: 'yahoo',
};

// App Settings Store
interface SettingsState {
  settings: AppSettings;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  updateRSIConfig: (config: Partial<RSIConfig>) => void;
  updateScannerSettings: (config: Partial<ScannerSettings>) => void;
  addToWatchlist: (ticker: string) => void;
  removeFromWatchlist: (ticker: string) => void;
  updateChartSettings: (settings: Partial<AppSettings['chartSettings']>) => void;
  // Multi-watchlist actions
  addWatchlist: (name: string, tickers?: string[]) => Watchlist;
  renameWatchlist: (id: string, name: string) => void;
  deleteWatchlist: (id: string) => void;
  setActiveWatchlist: (id: string) => void;
  duplicateWatchlist: (id: string) => Watchlist | null;
}

const DEFAULT_WATCHLIST_TICKERS = ['SOXL', 'TQQQ', 'SOXS', 'SQQQ', 'UPRO', 'TNA'];

/**
 * Lazy-init the multi-watchlist fields on a settings object. If watchlists
 * is missing/empty, seed from the legacy `watchlist` array. Returns a clone
 * of settings with watchlists/activeWatchlistId guaranteed populated and
 * with `watchlist` mirrored from the active list's tickers.
 */
function ensureWatchlists(settings: AppSettings): AppSettings {
  const lists = settings.watchlists ?? [];
  if (lists.length === 0) {
    const seedTickers =
      settings.watchlist && settings.watchlist.length > 0
        ? settings.watchlist
        : DEFAULT_WATCHLIST_TICKERS;
    const seed: Watchlist = {
      id: 'default',
      name: 'Default',
      tickers: seedTickers,
    };
    return {
      ...settings,
      watchlists: [seed],
      activeWatchlistId: 'default',
      watchlist: seedTickers,
    };
  }
  // Ensure activeWatchlistId points to a valid list
  let activeId = settings.activeWatchlistId;
  if (!activeId || !lists.find((l) => l.id === activeId)) {
    activeId = lists[0].id;
  }
  const active = lists.find((l) => l.id === activeId)!;
  return {
    ...settings,
    watchlists: lists,
    activeWatchlistId: activeId,
    watchlist: active.tickers, // mirror for legacy consumers
  };
}

function genWatchlistId(): string {
  return `wl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: {
        theme: 'dark',
        defaultTicker: 'SOXL',
        rsiConfig: DEFAULT_RSI_CONFIG,
        alertSettings: {
          id: 'default',
          ticker: 'SOXL',
          rsiBuyThreshold: DEFAULT_RSI_CONFIG.oversold,
          rsiSellThreshold: DEFAULT_RSI_CONFIG.overbought,
          priceAlerts: {
            target15Enabled: true,
            target20Enabled: true,
          },
          volumeSpikeEnabled: false,
          drawdownThreshold: 5,
          soundEnabled: true,
          cooldownMinutes: 5,
          enabled: true,
        },
        refreshInterval: 1000,
        scannerSettings: DEFAULT_SCANNER_SETTINGS,
        watchlist: ['SOXL', 'TQQQ', 'SOXS', 'SQQQ', 'UPRO', 'TNA'],
        chartSettings: {
          interval: '1m',
          range: '1d',
        },
        accountSize: 50000,
        defaultRiskPct: 1,
        indicators: {
          ema20: false,
          ema50: false,
          sma20: false,
          vwap: false,
          bollinger: false,
          macd: false,
        },
        guardrails: {
          maxTradesPerDay: undefined,    // disabled by default
          dailyLossLimit: undefined,
          extendedHours: false,
        },
      },
      _hasHydrated: false,

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),

      updateRSIConfig: (config) =>
        set((state) => ({
          settings: {
            ...state.settings,
            rsiConfig: { ...state.settings.rsiConfig, ...config },
          },
        })),

      updateScannerSettings: (config) =>
        set((state) => ({
          settings: {
            ...state.settings,
            scannerSettings: { ...state.settings.scannerSettings, ...config },
          },
        })),

      addToWatchlist: (ticker) =>
        set((state) => {
          const settings = ensureWatchlists(state.settings);
          const upperTicker = ticker.toUpperCase();
          const activeId = settings.activeWatchlistId!;
          const watchlists = settings.watchlists!.map((l) => {
            if (l.id !== activeId) return l;
            if (l.tickers.includes(upperTicker)) return l;
            return { ...l, tickers: [...l.tickers, upperTicker] };
          });
          const active = watchlists.find((l) => l.id === activeId)!;
          return {
            settings: {
              ...settings,
              watchlists,
              watchlist: active.tickers,
            },
          };
        }),

      removeFromWatchlist: (ticker) =>
        set((state) => {
          const settings = ensureWatchlists(state.settings);
          const upper = ticker.toUpperCase();
          const activeId = settings.activeWatchlistId!;
          const watchlists = settings.watchlists!.map((l) => {
            if (l.id !== activeId) return l;
            return { ...l, tickers: l.tickers.filter((t) => t !== upper) };
          });
          const active = watchlists.find((l) => l.id === activeId)!;
          return {
            settings: {
              ...settings,
              watchlists,
              watchlist: active.tickers,
            },
          };
        }),

      addWatchlist: (name, tickers = []) => {
        const id = genWatchlistId();
        const newList: Watchlist = {
          id,
          name: name.trim() || 'Untitled',
          tickers: tickers.map((t) => t.toUpperCase()),
        };
        set((state) => {
          const settings = ensureWatchlists(state.settings);
          return {
            settings: {
              ...settings,
              watchlists: [...settings.watchlists!, newList],
            },
          };
        });
        return newList;
      },

      renameWatchlist: (id, name) =>
        set((state) => {
          const settings = ensureWatchlists(state.settings);
          return {
            settings: {
              ...settings,
              watchlists: settings.watchlists!.map((l) =>
                l.id === id ? { ...l, name: name.trim() || l.name } : l
              ),
            },
          };
        }),

      deleteWatchlist: (id) =>
        set((state) => {
          const settings = ensureWatchlists(state.settings);
          // Refuse to delete the last list
          if (settings.watchlists!.length <= 1) return state;
          const remaining = settings.watchlists!.filter((l) => l.id !== id);
          let activeId = settings.activeWatchlistId!;
          if (activeId === id) activeId = remaining[0].id;
          const active = remaining.find((l) => l.id === activeId)!;
          return {
            settings: {
              ...settings,
              watchlists: remaining,
              activeWatchlistId: activeId,
              watchlist: active.tickers,
            },
          };
        }),

      setActiveWatchlist: (id) =>
        set((state) => {
          const settings = ensureWatchlists(state.settings);
          if (!settings.watchlists!.find((l) => l.id === id)) return state;
          const active = settings.watchlists!.find((l) => l.id === id)!;
          return {
            settings: {
              ...settings,
              activeWatchlistId: id,
              watchlist: active.tickers,
            },
          };
        }),

      duplicateWatchlist: (id) => {
        let duplicated: Watchlist | null = null;
        set((state) => {
          const settings = ensureWatchlists(state.settings);
          const src = settings.watchlists!.find((l) => l.id === id);
          if (!src) return state;
          duplicated = {
            id: genWatchlistId(),
            name: `${src.name} copy`,
            tickers: [...src.tickers],
          };
          return {
            settings: {
              ...settings,
              watchlists: [...settings.watchlists!, duplicated],
            },
          };
        });
        return duplicated;
      },

      updateChartSettings: (chartSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            chartSettings: { ...state.settings.chartSettings, ...chartSettings },
          },
        })),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
