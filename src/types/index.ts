// Trade-related types
export interface TradeEntry {
  id: string;
  date: Date;
  price: number;
  shares: number;
}

export interface TradeExit {
  id: string;
  date: Date;
  price: number;
  shares: number;
}

export interface Trade {
  id: string;
  ticker: string;
  status: 'open' | 'closed';
  entries: TradeEntry[];
  exits: TradeExit[];
  avgCost: number;
  totalShares: number;
  realizedPnL: number;
  unrealizedPnL: number;
  notes: string;
  tags: string[];
  createdAt: Date;
  closedAt?: Date;
}

// Portfolio types
export interface PortfolioSummary {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgReturnPercent: number;
  avgHoldTimeHours: number;
  totalProfit: number;
  unrealizedPnL: number;
  totalInvested: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  currentStreak: number;
  longestWinStreak: number;
}

export interface OpenPosition {
  trade: Trade;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  target15: number; // 1.5% profit target
  target20: number; // 2% profit target
  distanceToTarget15: number;
  distanceToTarget20: number;
  distanceToTarget15Percent: number;
  distanceToTarget20Percent: number;
}

// RSI types
export interface RSIConfig {
  period: number;
  overbought: number;
  oversold: number;
}

export type RSIStatus = 'buy' | 'sell' | 'neutral';

export interface RSIData {
  value: number;
  status: RSIStatus;
  timestamp: Date;
}

// Price/Chart types
export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PriceData {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: Date;
}

export interface ChartTimeframe {
  label: string;
  value: '1m' | '5m' | '15m' | '1h' | '1d';
  minutes: number;
}

// Alert types
export type AlertType =
  | 'rsi_oversold'
  | 'rsi_overbought'
  | 'price_target_15'
  | 'price_target_20'
  | 'volume_spike'
  | 'drawdown';

export interface Alert {
  id: string;
  type: AlertType;
  ticker: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface AlertSettings {
  id: string;
  ticker: string;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  priceAlerts: {
    target15Enabled: boolean;
    target20Enabled: boolean;
  };
  volumeSpikeEnabled: boolean;
  drawdownThreshold: number;
  soundEnabled: boolean;
  cooldownMinutes: number;
  enabled: boolean;
}

// DCA Calculator types
export interface DCACalculation {
  currentShares: number;
  currentAvgCost: number;
  newShares: number;
  newPrice: number;
  resultShares: number;
  resultAvgCost: number;
  resultTarget15: number;
  resultTarget20: number;
  totalInvested: number;
}

// Filter types for trade history
export interface TradeFilters {
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  ticker: string | null;
  status: 'all' | 'open' | 'closed';
  outcome: 'all' | 'win' | 'loss';
  holdDuration: {
    min: number | null;
    max: number | null;
  };
}

// Analytics types
export interface PerformanceByPeriod {
  period: string;
  trades: number;
  winRate: number;
  totalPnL: number;
  avgReturn: number;
}

export interface ReturnDistribution {
  range: string;
  count: number;
}

// App state types
export interface AppSettings {
  theme: 'dark' | 'light';
  defaultTicker: string;
  rsiConfig: RSIConfig;
  alertSettings: AlertSettings;
  refreshInterval: number; // in milliseconds
}

// API response types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
