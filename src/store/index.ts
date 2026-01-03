import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

export const usePriceStore = create<PriceState>((set, get) => ({
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

  // Actions
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
      partialize: (state) => ({ trades: state.trades }),
    }
  )
);

// Alert Store
interface AlertState {
  alerts: Alert[];
  settings: AlertSettings;

  // Actions
  addAlert: (alert: Omit<Alert, 'id' | 'timestamp' | 'acknowledged'>) => void;
  acknowledgeAlert: (id: string) => void;
  clearAlerts: () => void;
  updateSettings: (settings: Partial<AlertSettings>) => void;
}

export const useAlertStore = create<AlertState>()(
  persist(
    (set, get) => ({
      alerts: [],
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
    }
  )
);

// App Settings Store
interface SettingsState {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  updateRSIConfig: (config: Partial<RSIConfig>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: {
        theme: 'dark',
        defaultTicker: 'TQQQ',
        rsiConfig: DEFAULT_RSI_CONFIG,
        alertSettings: {
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
        refreshInterval: 5000, // 5 seconds
      },

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
    }),
    {
      name: 'settings-storage',
    }
  )
);
