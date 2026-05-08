'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { MainLayout, Drawer, BottomTabBar } from '@/components/Layout';
import { PriceDisplay } from '@/components/Price';
import { RSIGauge } from '@/components/RSI';
import { CandlestickChart } from '@/components/Chart';
import { OpenPositions, SignalRadar, GuardrailIndicator, ExposureWarning, WelcomeCard, NewsStrip, EarningsWidget, MultiSignalPanel, InsiderActivityCard, RegimeChip, HealthBadge } from '@/components/Dashboard';
import {
  TradesPanel,
  AnalyticsPanel,
  ScannerPanel,
  CalculatorPanel,
  AlertsPanel,
  SettingsPanel,
  NewTradePanel,
  OptionsPanel,
} from '@/components/Panels';
import { usePriceData, useHydration, useStoreHydration, useKeyboardShortcuts, useAlertEngine, useAlertRuleEngine, useStrategyEngine, usePositionAlertEngine } from '@/hooks';
import { AlertToast, NotificationPermissionBadge } from '@/components/Alerts';
import CommandPalette from '@/components/CommandPalette';
import ShortcutsHelp from '@/components/ShortcutsHelp';
import PositionActionModal, { PositionActionTarget } from '@/components/PositionActionModal';
import ThemeManager from '@/components/ThemeManager';
import LayoutSwitcher from '@/components/LayoutSwitcher';
import StrategyChat from '@/components/StrategyChat';
import { ToastHost } from '@/components/UI';
import { StrategyConfirmModal, StrategiesPanel, BacktestPanel, KillSwitch, JournalPanel, StrategyMonitor } from '@/components/Strategy';
import { Action, Strategy } from '@/types/strategy';
import { useTradeStore, usePriceStore, useSettingsStore, useStrategyStore, usePaperStore } from '@/store';
import type { Watchlist } from '@/types';
import {
  calculatePortfolioSummary,
  formatCurrency,
  formatPercent,
  formatPrice,
  calculateUnrealizedPnL,
} from '@/lib/calculations';
import { DEFAULT_RSI_CONFIG, getRSIColor } from '@/lib/rsi';
import { getMarketSession, getPollIntervalMs, describeSession } from '@/lib/marketHours';
import { RSIData, PriceData } from '@/types';

const INTERVALS = [
  { label: '1m', value: '1m' as const },
  { label: '5m', value: '5m' as const },
  { label: '15m', value: '15m' as const },
  { label: '1h', value: '1h' as const },
  { label: '1D', value: '1d' as const },
];

const RANGES = [
  { label: '1D', value: '1d' as const },
  { label: '5D', value: '5d' as const },
  { label: '1M', value: '1mo' as const },
  { label: '3M', value: '3mo' as const },
];

type DrawerView =
  | null
  | 'trades'
  | 'analytics'
  | 'scanner'
  | 'calculator'
  | 'alerts'
  | 'settings'
  | 'newTrade'
  | 'strategies'
  | 'backtest'
  | 'journal'
  | 'monitor'
  | 'options';

const DRAWER_TITLES: Record<Exclude<DrawerView, null>, { title: string; subtitle: string }> = {
  trades: { title: 'Trade History', subtitle: 'All open and closed trades' },
  analytics: { title: 'Analytics', subtitle: 'Performance metrics & risk' },
  scanner: { title: 'ETF Scanner', subtitle: 'Find RSI reversal patterns' },
  calculator: { title: 'DCA Calculator', subtitle: 'Plan averages and targets' },
  alerts: { title: 'Alerts', subtitle: 'Threshold notifications' },
  settings: { title: 'Settings', subtitle: 'Strategy & preferences' },
  newTrade: { title: 'New Trade', subtitle: 'Log a position' },
  strategies: { title: 'Strategies', subtitle: 'Composable buy/sell rules engine' },
  backtest: { title: 'Backtest', subtitle: 'Validate a strategy on historical data' },
  journal: { title: 'Trade journal', subtitle: 'Every paper trade with chart-context snapshots' },
  monitor: { title: 'Live monitor', subtitle: 'Real-time state of every (strategy × ticker)' },
  options: { title: 'Options', subtitle: 'Live chains, IV/Greeks, and multi-leg positions' },
};

export default function CommandCenterPage() {
  const hydrated = useHydration();
  const storeHydrated = useStoreHydration();
  const settings = useSettingsStore((state) => state.settings);
  const updateRSIConfig = useSettingsStore((state) => state.updateRSIConfig);
  const addToWatchlist = useSettingsStore((state) => state.addToWatchlist);
  const removeFromWatchlist = useSettingsStore((state) => state.removeFromWatchlist);
  const updateChartSettings = useSettingsStore((state) => state.updateChartSettings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  const [selectedTicker, setSelectedTicker] = useState('SOXL');
  const [showAddTicker, setShowAddTicker] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [showRSIConfig, setShowRSIConfig] = useState(false);
  const [drawer, setDrawer] = useState<DrawerView>(null);

  const defaultWatchlist = ['SOXL', 'TQQQ', 'SOXS', 'SQQQ', 'UPRO', 'TNA'];
  const rsiConfig = storeHydrated ? settings.rsiConfig : DEFAULT_RSI_CONFIG;
  const watchlist = storeHydrated && settings.watchlist ? settings.watchlist : defaultWatchlist;
  const chartInterval = storeHydrated ? settings.chartSettings?.interval || '1m' : '1m';
  const chartRange = storeHydrated ? settings.chartSettings?.range || '1d' : '1d';
  const refreshInterval = storeHydrated ? settings.refreshInterval : 1000;
  const indicators = storeHydrated ? settings.indicators ?? {} : {};
  const extendedHours = storeHydrated ? settings.guardrails?.extendedHours ?? false : false;
  const toggleIndicator = (key: 'ema20' | 'ema50' | 'vwap' | 'bollinger') =>
    updateSettings({
      indicators: { ...(settings.indicators ?? {}), [key]: !(settings.indicators?.[key] ?? false) },
    });
  const toggleExtendedHours = () =>
    updateSettings({
      guardrails: {
        ...(settings.guardrails ?? {}),
        extendedHours: !(settings.guardrails?.extendedHours ?? false),
      },
    });

  // Fetch data for every potential ticker (hooks must be unconditional)
  const tickerHookConfig = (ticker: string) => ({
    ticker,
    interval: chartInterval,
    range: chartRange,
    refreshInterval,
    enabled: hydrated && watchlist.includes(ticker),
    rsiConfig,
    includePrePost: extendedHours,
  });

  const soxl = usePriceData(tickerHookConfig('SOXL'));
  const tqqq = usePriceData(tickerHookConfig('TQQQ'));
  const soxs = usePriceData(tickerHookConfig('SOXS'));
  const sqqq = usePriceData(tickerHookConfig('SQQQ'));
  const upro = usePriceData(tickerHookConfig('UPRO'));
  const spxu = usePriceData(tickerHookConfig('SPXU'));
  const tna = usePriceData(tickerHookConfig('TNA'));
  const tza = usePriceData(tickerHookConfig('TZA'));
  const labu = usePriceData(tickerHookConfig('LABU'));
  const labd = usePriceData(tickerHookConfig('LABD'));
  const tecl = usePriceData(tickerHookConfig('TECL'));
  const tecs = usePriceData(tickerHookConfig('TECS'));
  const fngu = usePriceData(tickerHookConfig('FNGU'));
  const fngd = usePriceData(tickerHookConfig('FNGD'));
  const knownTickers = ['SOXL','TQQQ','SOXS','SQQQ','UPRO','SPXU','TNA','TZA','LABU','LABD','TECL','TECS','FNGU','FNGD'];
  const custom = usePriceData({
    ticker: selectedTicker,
    interval: chartInterval,
    range: chartRange,
    refreshInterval,
    enabled: hydrated && !knownTickers.includes(selectedTicker),
    rsiConfig,
    includePrePost: extendedHours,
  });

  const tickerDataMap: Record<string, ReturnType<typeof usePriceData>> = {
    SOXL: soxl,
    TQQQ: tqqq,
    SOXS: soxs,
    SQQQ: sqqq,
    UPRO: upro,
    SPXU: spxu,
    TNA: tna,
    TZA: tza,
    LABU: labu,
    LABD: labd,
    TECL: tecl,
    TECS: tecs,
    FNGU: fngu,
    FNGD: fngd,
  };

  const selectedData = tickerDataMap[selectedTicker] || custom;
  const { priceData, candles, rsiData, isLoading, error, refresh } = selectedData;

  const trades = useTradeStore((state) => state.trades);
  const updateTradeStop = useTradeStore((state) => state.updateTrade);
  const prices = usePriceStore((state) => state.prices);
  const strategies = useStrategyStore((state) => state.strategies);
  const paperClosed = usePaperStore((state) => state.closed);
  const isFirstRun = strategies.length === 0 && trades.length === 0 && paperClosed.length === 0;

  useKeyboardShortcuts({
    onRefresh: refresh,
    onNewTrade: () => setDrawer('newTrade'),
    onCalculator: () => setDrawer('calculator'),
  });

  // Mount the alert engine — watches RSI across all watchlist tickers and
  // fires sounds + browser notifications + toast on threshold crossings.
  useAlertEngine();

  // Mount the custom alert-rule engine — evaluates user-defined ConditionTree
  // rules across their tickers and fires per-channel notifications with cooldown.
  useAlertRuleEngine();

  // Mount the position-alert engine — auto-fires take-profit / stop
  // notifications when an open position crosses % thresholds from entry.
  usePositionAlertEngine();

  // Read ?d=<drawer> from URL on mount (sidebar redirects from old pages
  // and shareable deep-links land here with a drawer pre-opened). Strip
  // the param after consuming so refreshes are clean.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const d = params.get('d');
    const ALLOWED = [
      'strategies', 'monitor', 'backtest', 'journal',
      'trades', 'analytics', 'scanner',
      'calculator', 'alerts', 'settings', 'newTrade', 'options',
    ];
    if (d && ALLOWED.includes(d)) {
      setDrawer(d as DrawerView);
      params.delete('d');
      const qs = params.toString();
      const url = window.location.pathname + (qs ? `?${qs}` : '');
      window.history.replaceState(null, '', url);
    }
    // Sidebar logo dispatches this to close any open drawer
    const closeHandler = () => setDrawer(null);
    window.addEventListener('etf-close-drawer', closeHandler);
    // Empty-state CTAs dispatch this to swap drawers
    const openHandler = (e: Event) => {
      const view = (e as CustomEvent<string>).detail;
      const ALLOWED = [
        'strategies', 'monitor', 'backtest', 'journal',
        'trades', 'analytics', 'scanner',
        'calculator', 'alerts', 'settings', 'newTrade', 'options',
      ];
      if (typeof view === 'string' && ALLOWED.includes(view)) {
        setDrawer(view as DrawerView);
      }
    };
    window.addEventListener('etf-open-drawer', openHandler);
    // Components anywhere can dispatch this to open the position modal
    const positionHandler = (e: Event) => {
      const ev = e as CustomEvent<PositionActionTarget>;
      if (ev.detail) setPositionTarget(ev.detail);
    };
    window.addEventListener('etf-open-position-modal', positionHandler);
    // Cmd+K palette: refresh prices on demand
    const refreshHandler = () => {
      refresh();
    };
    window.addEventListener('etf-refresh-data', refreshHandler);
    return () => {
      window.removeEventListener('etf-close-drawer', closeHandler);
      window.removeEventListener('etf-open-drawer', openHandler);
      window.removeEventListener('etf-open-position-modal', positionHandler);
      window.removeEventListener('etf-refresh-data', refreshHandler);
    };
  }, [refresh]);

  // Pending action awaiting manual confirmation
  const [pendingAction, setPendingAction] = useState<{ action: Action; strategy: Strategy } | null>(null);
  const [positionTarget, setPositionTarget] = useState<PositionActionTarget | null>(null);

  // Mount the strategy engine — runs every tick, evaluates enabled strategies,
  // emits paper trades or fires the manual-confirm modal.
  useStrategyEngine({
    onPendingAction: (action, strategy) => setPendingAction({ action, strategy }),
  });

  const portfolioSummary = useMemo(() => calculatePortfolioSummary(trades), [trades]);

  // Day P&L (sum of closed P&L from today + unrealized changes)
  const dayPnL = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const closedToday = trades
      .filter((t) => t.status === 'closed' && t.closedAt && new Date(t.closedAt) >= today)
      .reduce((s, t) => s + t.realizedPnL, 0);
    const openUnrealized = trades
      .filter((t) => t.status === 'open')
      .reduce((s, t) => {
        const cp = prices[t.ticker]?.price || t.avgCost;
        return s + calculateUnrealizedPnL(t, cp);
      }, 0);
    return closedToday + openUnrealized;
  }, [trades, prices]);

  const watchlistItems = watchlist.map((ticker) => {
    const data = tickerDataMap[ticker] || { priceData: null, rsiData: null, isLoading: true };
    return {
      ticker,
      priceData: data.priceData,
      rsiData: data.rsiData,
      isLoading: data.isLoading,
    };
  });

  // Radar items include candles for the sparkline rendering
  const radarItems = watchlist.map((ticker) => {
    const data = tickerDataMap[ticker] || {
      priceData: null,
      rsiData: null,
      candles: [],
      isLoading: true,
    };
    return {
      ticker,
      priceData: data.priceData,
      rsiData: data.rsiData,
      candles: data.candles ?? [],
      isLoading: data.isLoading,
    };
  });

  const handleAddTicker = useCallback(() => {
    if (newTicker.trim()) {
      addToWatchlist(newTicker.trim());
      setNewTicker('');
      setShowAddTicker(false);
    }
  }, [newTicker, addToWatchlist]);

  if (!hydrated || !storeHydrated) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[500px] text-gray-500">
          <span className="animate-pulse">Loading dashboard...</span>
        </div>
      </MainLayout>
    );
  }

  const rsiStatus = rsiData?.status || 'neutral';
  const rsiColor = getRSIColor(rsiStatus);
  const isPriceUp = (priceData?.change ?? 0) >= 0;

  const drawerInfo = drawer ? DRAWER_TITLES[drawer] : null;

  return (
    <MainLayout
      contentClassName="pt-14 lg:pt-0 lg:ml-0"
      onSelectDrawer={(view) => setDrawer(view as DrawerView)}
      activeDrawer={drawer}
    >
      {/* TOP BAR */}
      <div className="sticky top-0 lg:top-0 z-20 px-4 lg:px-6 py-3 glass-strong border-b border-white/5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: ticker + price */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2">
              <SessionPill />
              <NotificationPermissionBadge />
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-xl font-bold tracking-tight text-white">
                {selectedTicker}
              </span>
              {priceData ? (
                <>
                  <span className="font-mono text-2xl font-bold text-white">
                    ${formatPrice(priceData.price)}
                  </span>
                  <span
                    className={`font-mono text-sm font-semibold ${
                      isPriceUp ? 'text-profit' : 'text-loss'
                    }`}
                  >
                    {isPriceUp ? '+' : ''}
                    {formatPrice(priceData.change)} ({formatPercent(priceData.changePercent)})
                  </span>
                </>
              ) : (
                <span className="text-gray-500 text-sm animate-pulse">Loading...</span>
              )}
              {rsiData && (
                <span
                  className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-md border"
                  style={{
                    color: rsiColor,
                    borderColor: `${rsiColor}55`,
                    backgroundColor: `${rsiColor}15`,
                  }}
                >
                  RSI {rsiData.value.toFixed(1)}
                </span>
              )}
            </div>
          </div>

          {/* Right: kill switch + guardrails + day P&L + actions */}
          <div className="flex items-center gap-3">
            <KillSwitch />
            <GuardrailIndicator dayPnL={dayPnL} />
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
              <span className="text-[10px] uppercase tracking-widest text-gray-500">
                Day P&L
              </span>
              <span
                className={`font-mono font-bold ${
                  dayPnL >= 0 ? 'text-profit' : 'text-loss'
                }`}
              >
                {dayPnL >= 0 ? '+' : ''}
                {formatCurrency(dayPnL)}
              </span>
            </div>
            <button
              onClick={() => setDrawer('newTrade')}
              className="btn btn-success text-sm px-3 py-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="hidden sm:inline">New Trade</span>
            </button>
            <button
              onClick={refresh}
              className="btn btn-ghost p-2"
              title="Refresh (R)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* WELCOME (first-run only) */}
      <div className="px-4 lg:px-6 pt-4">
        <WelcomeCard
          show={isFirstRun}
          onOpenStrategies={() => setDrawer('strategies')}
          onOpenBacktest={() => setDrawer('backtest')}
          onOpenSettings={() => setDrawer('settings')}
        />
      </div>

      {/* SIGNAL RADAR */}
      <div className="px-4 lg:px-6 pt-4">
        <div className="flex items-center justify-between mb-2 gap-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Signal radar · all watchlist
          </h2>
          <div className="flex items-center gap-2">
            <RegimeChip />
            <span className="text-[10px] text-gray-600 uppercase tracking-widest hidden sm:inline">
              BUY/SELL float to top
            </span>
            <LayoutSwitcher />
            <HealthBadge />
          </div>
        </div>
        <SignalRadar
          items={radarItems}
          selectedTicker={selectedTicker}
          onSelect={setSelectedTicker}
          oversold={rsiConfig.oversold}
          overbought={rsiConfig.overbought}
        />
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-12 gap-4 p-4 lg:p-6">
        {/* WATCHLIST RAIL */}
        <aside className="col-span-12 lg:col-span-3 xl:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Watchlist
            </h2>
            <button
              onClick={() => setShowAddTicker(!showAddTicker)}
              className="text-[10px] uppercase tracking-wide text-gray-500 hover:text-white transition"
            >
              {showAddTicker ? 'Cancel' : '+ Add'}
            </button>
          </div>

          {/* Active watchlist switcher */}
          <ActiveWatchlistSwitcher
            onManage={() => setDrawer('settings')}
          />

          {showAddTicker && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTicker()}
                placeholder="TICKER"
                className="input flex-1 text-sm py-1.5"
                autoFocus
              />
              <button
                onClick={handleAddTicker}
                className="btn btn-success text-xs py-1.5 px-2"
              >
                Add
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            {watchlistItems.map((item) => (
              <WatchlistRow
                key={item.ticker}
                {...item}
                isSelected={item.ticker === selectedTicker}
                onSelect={() => setSelectedTicker(item.ticker)}
                onRemove={() => removeFromWatchlist(item.ticker)}
              />
            ))}
          </div>
        </aside>

        {/* CHART CENTER */}
        <section className="col-span-12 lg:col-span-6 xl:col-span-7 space-y-4">
          <div className="card overflow-hidden">
            <div className="card-header flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="font-semibold text-white tracking-tight">
                  {selectedTicker}
                  <span className="text-gray-500 text-xs ml-2 font-normal">
                    {chartInterval} • {chartRange}
                  </span>
                </h3>
                {isLoading && (
                  <span className="text-[10px] text-gray-500 animate-pulse">Updating...</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="chip-group">
                  {INTERVALS.map((int) => (
                    <button
                      key={int.value}
                      onClick={() => updateChartSettings({ interval: int.value })}
                      className={`chip ${
                        chartInterval === int.value ? 'active-accent' : ''
                      }`}
                    >
                      {int.label}
                    </button>
                  ))}
                </div>
                <div className="chip-group">
                  {RANGES.map((rng) => (
                    <button
                      key={rng.value}
                      onClick={() => updateChartSettings({ range: rng.value })}
                      className={`chip ${
                        chartRange === rng.value ? 'active-profit' : ''
                      }`}
                    >
                      {rng.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={toggleExtendedHours}
                  className={`chip ${extendedHours ? 'active' : ''} px-2.5`}
                  title="Include pre-market and after-hours candles"
                >
                  EXT
                </button>
                <div className="chip-group" title="Indicator overlays">
                  <button
                    onClick={() => toggleIndicator('ema20')}
                    className={`chip ${indicators.ema20 ? 'active' : ''}`}
                    style={indicators.ema20 ? { color: '#fb923c' } : undefined}
                  >
                    EMA 20
                  </button>
                  <button
                    onClick={() => toggleIndicator('ema50')}
                    className={`chip ${indicators.ema50 ? 'active' : ''}`}
                    style={indicators.ema50 ? { color: '#a78bfa' } : undefined}
                  >
                    EMA 50
                  </button>
                  <button
                    onClick={() => toggleIndicator('vwap')}
                    className={`chip ${indicators.vwap ? 'active' : ''}`}
                    style={indicators.vwap ? { color: '#06b6d4' } : undefined}
                  >
                    VWAP
                  </button>
                  <button
                    onClick={() => toggleIndicator('bollinger')}
                    className={`chip ${indicators.bollinger ? 'active' : ''}`}
                  >
                    BB
                  </button>
                </div>
              </div>
            </div>
            <div className="p-2">
              {candles.length > 0 ? (
                <div className="h-[320px] sm:h-[420px] lg:h-[520px]">
                  <CandlestickChart
                    candles={candles}
                    trades={trades.filter((t) => t.ticker === selectedTicker)}
                    rsiConfig={rsiConfig}
                    showRSI={true}
                    showVolume={true}
                    showTradeMarkers={true}
                    showRSICrossings={true}
                    showOversoldCrossings={true}
                    showOverboughtCrossings={false}
                    showEMA20={indicators.ema20}
                    showEMA50={indicators.ema50}
                    showVWAP={indicators.vwap}
                    showBollinger={indicators.bollinger}
                    showPatterns={indicators.patterns ?? false}
                    showSessionBands={extendedHours}
                    stopLines={trades
                      .filter((t) => t.status === 'open' && t.ticker === selectedTicker && t.stopPrice && t.stopPrice > 0)
                      .map((t) => ({ ticker: t.ticker, price: t.stopPrice!, tradeId: t.id }))}
                    entryLines={trades
                      .filter((t) => t.status === 'open' && t.ticker === selectedTicker)
                      .map((t) => ({ ticker: t.ticker, price: t.avgCost, tradeId: t.id }))}
                    onStopDrag={(tradeId, newPrice) =>
                      updateTradeStop(tradeId, { stopPrice: newPrice })
                    }
                  />
                </div>
              ) : (
                <div className="h-[420px] flex items-center justify-center text-gray-500">
                  {isLoading ? 'Loading chart data...' : 'No chart data available'}
                </div>
              )}
              {error && <div className="px-3 py-2 text-xs text-loss">{error}</div>}
            </div>
          </div>

          {/* RSI Gauge + strategy bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card md:col-span-2">
              <div className="card-body">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    RSI Gauge
                  </span>
                  <button
                    onClick={() => setShowRSIConfig(!showRSIConfig)}
                    className="text-[10px] text-gray-500 hover:text-white uppercase tracking-wide"
                  >
                    {showRSIConfig ? 'Done' : 'Tune'}
                  </button>
                </div>
                <RSIGauge data={rsiData} config={rsiConfig} />
                {showRSIConfig && (
                  <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-3 gap-3">
                    <ConfigInput
                      label="Period"
                      value={rsiConfig.period}
                      onChange={(v) => updateRSIConfig({ period: v })}
                    />
                    <ConfigInput
                      label="Oversold"
                      value={rsiConfig.oversold}
                      onChange={(v) => updateRSIConfig({ oversold: v })}
                    />
                    <ConfigInput
                      label="Overbought"
                      value={rsiConfig.overbought}
                      onChange={(v) => updateRSIConfig({ overbought: v })}
                    />
                  </div>
                )}
              </div>
            </div>

            <MultiSignalPanel onSelectTicker={setSelectedTicker} />

            <div className="card">
              <div className="card-body">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Mini label="Win Rate" value={`${portfolioSummary.winRate.toFixed(0)}%`} />
                  <Mini
                    label="Trades"
                    value={portfolioSummary.totalTrades.toString()}
                  />
                  <Mini
                    label="Total P&L"
                    value={formatCurrency(portfolioSummary.totalProfit)}
                    color={portfolioSummary.totalProfit >= 0 ? 'profit' : 'loss'}
                  />
                  <Mini label="Open" value={portfolioSummary.openTrades.toString()} />
                </div>
              </div>
            </div>
          </div>

          {/* Quick action launchpad */}
          <div className="space-y-3">
            <LaunchSection label="Strategy">
              <ActionTile icon="strategies" label="Strategies" onClick={() => setDrawer('strategies')} highlight />
              <ActionTile icon="monitor" label="Live monitor" onClick={() => setDrawer('monitor')} highlight />
              <ActionTile icon="backtest" label="Backtest" onClick={() => setDrawer('backtest')} />
              <ActionTile icon="journal" label="Journal" onClick={() => setDrawer('journal')} />
              <ActionTile icon="backtest" label="Replay" onClick={() => { window.location.href = '/replay'; }} />
            </LaunchSection>
            <LaunchSection label="Analyze">
              <ActionTile icon="trades" label="Trades" onClick={() => setDrawer('trades')} />
              <ActionTile icon="analytics" label="Analytics" onClick={() => setDrawer('analytics')} />
              <ActionTile icon="scanner" label="Scanner" onClick={() => setDrawer('scanner')} />
            </LaunchSection>
            <LaunchSection label="Tools">
              <ActionTile icon="calc" label="Calculator" onClick={() => setDrawer('calculator')} />
              <ActionTile icon="alerts" label="Alerts" onClick={() => setDrawer('alerts')} />
              <ActionTile icon="settings" label="Settings" onClick={() => setDrawer('settings')} />
            </LaunchSection>
          </div>
        </section>

        {/* RIGHT RAIL - Open Positions + News + Earnings */}
        <aside className="col-span-12 lg:col-span-3 xl:col-span-3 space-y-4">
          <div>
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
              Positions ({trades.filter((t) => t.status === 'open').length})
            </h2>
            <ExposureWarning />
            <CompactPositions
              trades={trades}
              prices={prices}
              onSelectTicker={setSelectedTicker}
              onActionPosition={(tradeId) => setPositionTarget({ kind: 'manual', tradeId })}
            />
          </div>
          <EarningsWidget tickers={watchlist} />
          <NewsStrip ticker={selectedTicker} />
          <InsiderActivityCard ticker={selectedTicker} />
        </aside>
      </div>

      {/* ALERT TOAST — surfaces live signals in the corner */}
      <AlertToast onOpenPanel={() => setDrawer('alerts')} />

      {/* THEME / DENSITY — applies classes to <html> */}
      <ThemeManager />

      {/* COMMAND PALETTE — Cmd+K universal jump */}
      <CommandPalette />
      <ShortcutsHelp />
      <ToastHost />

      {/* POSITION ACTION MODAL — close/partial-close/adjust-stop/broker-route */}
      <PositionActionModal
        target={positionTarget}
        onClose={() => setPositionTarget(null)}
      />

      {/* STRATEGY CHAT — bottom-right floating assistant */}
      <StrategyChat />

      {/* MOBILE-ONLY BOTTOM TAB BAR */}
      <BottomTabBar activeDrawer={drawer} />

      {/* STRATEGY CONFIRM MODAL — manual_confirm strategies surface here */}
      <StrategyConfirmModal
        pending={
          pendingAction
            ? {
                action: pendingAction.action,
                strategy: pendingAction.strategy,
                livePrice: priceData?.price ?? 0,
              }
            : null
        }
        onConfirm={() => setPendingAction(null)}
        onCancel={() => setPendingAction(null)}
      />

      {/* DRAWERS */}
      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawerInfo?.title}
        subtitle={drawerInfo?.subtitle}
        size={drawer === 'analytics' || drawer === 'scanner' || drawer === 'trades' || drawer === 'strategies' || drawer === 'backtest' || drawer === 'journal' || drawer === 'monitor' || drawer === 'options' ? 'xl' : 'lg'}
      >
        {drawer === 'strategies' && <StrategiesPanel />}
        {drawer === 'monitor' && <StrategyMonitor />}
        {drawer === 'backtest' && <BacktestPanel />}
        {drawer === 'journal' && <JournalPanel />}
        {drawer === 'trades' && <TradesPanel />}
        {drawer === 'analytics' && <AnalyticsPanel />}
        {drawer === 'scanner' && <ScannerPanel />}
        {drawer === 'calculator' && <CalculatorPanel defaultTicker={selectedTicker} />}
        {drawer === 'alerts' && <AlertsPanel />}
        {drawer === 'settings' && <SettingsPanel />}
        {drawer === 'options' && <OptionsPanel />}
        {drawer === 'newTrade' && (
          <NewTradePanel
            defaultTicker={selectedTicker}
            onCreated={() => setDrawer(null)}
          />
        )}
      </Drawer>
    </MainLayout>
  );
}

interface WatchlistRowProps {
  ticker: string;
  priceData: PriceData | null;
  rsiData: RSIData | null;
  isLoading: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function WatchlistRow({
  ticker,
  priceData,
  rsiData,
  isLoading,
  isSelected,
  onSelect,
  onRemove,
}: WatchlistRowProps) {
  const change = priceData?.changePercent ?? 0;
  const isPositive = change >= 0;
  const rsiColor = rsiData ? getRSIColor(rsiData.status) : '#6b7280';

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={`group relative px-3 py-2 rounded-lg border transition-all cursor-pointer ${
        isSelected
          ? 'border-accent/50 bg-accent/10'
          : 'border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold text-white text-sm tracking-tight">{ticker}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-loss transition-opacity p-0.5"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {isLoading ? (
        <div className="h-3 bg-white/5 rounded animate-pulse" />
      ) : priceData ? (
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-white">${formatPrice(priceData.price)}</span>
          <span className={`font-mono font-semibold ${isPositive ? 'text-profit' : 'text-loss'}`}>
            {isPositive ? '+' : ''}
            {change.toFixed(2)}%
          </span>
        </div>
      ) : (
        <div className="text-xs text-gray-500">--</div>
      )}
      {rsiData && (
        <div className="flex items-center justify-between mt-1.5 text-[10px]">
          <span className="text-gray-500 uppercase tracking-wider">RSI</span>
          <span className="font-mono font-medium" style={{ color: rsiColor }}>
            {rsiData.value.toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}

function CompactPositions({
  trades,
  prices,
  onSelectTicker,
  onActionPosition,
}: {
  trades: ReturnType<typeof useTradeStore.getState>['trades'];
  prices: Record<string, PriceData>;
  onSelectTicker: (t: string) => void;
  onActionPosition?: (tradeId: string) => void;
}) {
  const updateTrade = useTradeStore((s) => s.updateTrade);
  const open = trades.filter((t) => t.status === 'open');

  if (open.length === 0) {
    return (
      <div className="card card-body text-center py-8 text-gray-500 text-xs">
        <svg className="w-8 h-8 mx-auto mb-2 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        No open positions
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {open.map((trade) => {
        const cp = prices[trade.ticker]?.price || trade.avgCost;
        const pnl = (cp - trade.avgCost) * trade.totalShares;
        const pnlPct = trade.avgCost > 0 ? ((cp - trade.avgCost) / trade.avgCost) * 100 : 0;
        const target15 = trade.avgCost * 1.015;
        const target20 = trade.avgCost * 1.02;
        const isProfit = pnl >= 0;
        const targetPct =
          target15 > trade.avgCost
            ? Math.min(100, Math.max(0, ((cp - trade.avgCost) / (target15 - trade.avgCost)) * 100))
            : 0;

        return (
          <div key={trade.id} className="card glass-hover p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => onSelectTicker(trade.ticker)}
                className="text-left flex-1 min-w-0"
              >
                <span className="font-bold text-white text-sm">{trade.ticker}</span>
              </button>
              <div className="text-right">
                <div className={`font-mono text-sm font-bold ${isProfit ? 'text-profit' : 'text-loss'}`}>
                  {isProfit ? '+' : ''}
                  {formatCurrency(pnl)}
                </div>
                <div className={`font-mono text-[10px] ${isProfit ? 'text-profit' : 'text-loss'}`}>
                  {formatPercent(pnlPct)}
                </div>
              </div>
              {onActionPosition && (
                <button
                  onClick={() => onActionPosition(trade.id)}
                  className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-white px-2 py-1 rounded border border-white/10 hover:border-accent/40 hover:bg-accent/5 transition shrink-0"
                  title="Sell, partial close, or adjust stop"
                >
                  Manage
                </button>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono">
              <span>
                {trade.totalShares} @ {formatPrice(trade.avgCost)}
              </span>
              <span className="text-white">{formatPrice(cp)}</span>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-profit">{formatPrice(target15)} (1.5%)</span>
                <span className="text-profit">{formatPrice(target20)} (2%)</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${targetPct}%`,
                    background:
                      targetPct >= 100
                        ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                        : targetPct >= 50
                        ? 'linear-gradient(90deg, #eab308, #22c55e)'
                        : 'linear-gradient(90deg, #6b7280, #eab308)',
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <span className="text-[10px] uppercase tracking-widest text-gray-500 shrink-0">
                Stop
              </span>
              <input
                type="number"
                step="0.01"
                value={trade.stopPrice ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  updateTrade(trade.id, { stopPrice: v ? Number(v) : undefined });
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="—"
                className="flex-1 bg-white/[0.05] border border-white/10 rounded px-1.5 py-0.5 text-[11px] font-mono text-loss text-right focus:outline-none focus:border-loss/50"
              />
              {trade.stopPrice && trade.stopPrice > 0 && (
                <span className="text-[9px] font-mono text-loss whitespace-nowrap">
                  {((trade.stopPrice - trade.avgCost) / trade.avgCost * 100).toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SignalBadge({ status, value }: { status: 'buy' | 'sell' | 'neutral'; value?: number }) {
  if (status === 'buy') {
    return (
      <div className="rounded-lg p-3 bg-profit/15 border border-profit/40">
        <div className="text-profit text-2xl font-bold tracking-tight">BUY</div>
        <div className="text-[10px] text-profit/80 uppercase tracking-widest mt-0.5">
          Oversold {value !== undefined && `· RSI ${value.toFixed(1)}`}
        </div>
      </div>
    );
  }
  if (status === 'sell') {
    return (
      <div className="rounded-lg p-3 bg-loss/15 border border-loss/40">
        <div className="text-loss text-2xl font-bold tracking-tight">SELL</div>
        <div className="text-[10px] text-loss/80 uppercase tracking-widest mt-0.5">
          Overbought {value !== undefined && `· RSI ${value.toFixed(1)}`}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg p-3 bg-neutral/10 border border-neutral/30">
      <div className="text-neutral text-2xl font-bold tracking-tight">HOLD</div>
      <div className="text-[10px] text-neutral/80 uppercase tracking-widest mt-0.5">
        Neutral {value !== undefined && `· RSI ${value.toFixed(1)}`}
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: 'profit' | 'loss';
}) {
  const cls = color === 'profit' ? 'text-profit' : color === 'loss' ? 'text-loss' : 'text-white';
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`font-mono font-bold text-sm ${cls}`}>{value}</div>
    </div>
  );
}

function ConfigInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-1">{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input w-full font-mono text-sm py-1.5"
      />
    </div>
  );
}

function LaunchSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">
        {label}
      </div>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

function SessionPill() {
  // Re-renders once per minute so the session label / cadence stays current
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const session = getMarketSession();
  const intervalMs = getPollIntervalMs();
  const label = describeSession(session);
  const cadenceLabel =
    intervalMs < 5000 ? `${(intervalMs / 1000).toFixed(0)}s` : `${(intervalMs / 1000).toFixed(0)}s`;
  const tone =
    session === 'open'
      ? 'text-profit'
      : session === 'pre' || session === 'post'
      ? 'text-neutral'
      : 'text-gray-500';
  const dotCls = session === 'open' ? 'live-dot' : 'inline-block w-2 h-2 rounded-full bg-gray-500';

  return (
    <div className="inline-flex items-center gap-2" title={`Polling cadence: ${cadenceLabel}`}>
      <span className={dotCls} />
      <span className={`text-[10px] font-medium uppercase tracking-widest ${tone}`}>
        {label}
      </span>
      <span className="text-[10px] font-mono text-gray-600">{cadenceLabel}</span>
    </div>
  );
}

function ActionTile({
  icon,
  label,
  onClick,
  highlight,
}: {
  icon: 'strategies' | 'monitor' | 'backtest' | 'journal' | 'trades' | 'analytics' | 'scanner' | 'calc' | 'alerts' | 'settings';
  label: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  const ICONS: Record<typeof icon, React.ReactNode> = {
    strategies: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </>
    ),
    backtest: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9 9 0 1018 0 9 9 0 00-18 0zM12 6v6l4 2" />
      </>
    ),
    journal: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </>
    ),
    monitor: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </>
    ),
    trades: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    ),
    analytics: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    ),
    scanner: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    ),
    calc: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    ),
    alerts: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    ),
    settings: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </>
    ),
  };

  return (
    <button
      onClick={onClick}
      className={`card glass-hover p-3 flex flex-col items-center justify-center gap-1.5 group ${
        highlight ? 'border-accent/40 bg-accent/5' : ''
      }`}
    >
      <svg
        className={`w-5 h-5 transition-colors ${
          highlight ? 'text-accent-light' : 'text-gray-400 group-hover:text-white'
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        {ICONS[icon]}
      </svg>
      <span
        className={`text-[10px] uppercase tracking-widest transition-colors ${
          highlight
            ? 'text-accent-light'
            : 'text-gray-400 group-hover:text-white'
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function ActiveWatchlistSwitcher({ onManage }: { onManage: () => void }) {
  const settings = useSettingsStore((s) => s.settings);
  const setActive = useSettingsStore((s) => s.setActiveWatchlist);
  const lists: Watchlist[] = settings.watchlists ?? [];
  const activeId = settings.activeWatchlistId ?? lists[0]?.id;
  // If there's only one list, hide the chip — no point cluttering UI.
  if (lists.length <= 1) return null;
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <select
        value={activeId}
        onChange={(e) => setActive(e.target.value)}
        className="bg-white/[0.03] border border-white/10 rounded px-1.5 py-0.5 text-gray-300 hover:text-white focus:outline-none focus:border-accent/40 truncate max-w-[120px]"
        title="Switch active watchlist"
      >
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.tickers.length})
          </option>
        ))}
      </select>
      <button
        onClick={onManage}
        className="text-gray-500 hover:text-white"
        title="Manage watchlists"
      >
        ⚙
      </button>
    </div>
  );
}
