'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { MainLayout } from '@/components/Layout';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { useSettingsStore, DEFAULT_SCANNER_SETTINGS } from '@/store';

interface TimeframeMetrics {
  totalSignals: number;
  winsAt1_5Pct: number;
  winsAt2Pct: number;
  winRateAt1_5Pct: number;
  winRateAt2Pct: number;
  avgMinsTo1_5Pct: number;
  avgMaxGain: number;
  avgMaxDrawdown: number;
  signalStrength: number;
  dataPoints: number;
}

interface ScanResult {
  symbol: string;
  currentPrice: number;
  currentRSI: number;
  avgVolume: number;
  shortTerm: TimeframeMetrics;
  longTerm: TimeframeMetrics;
  combinedScore: number;
  isCurrentlyOversold: boolean;
  error?: string;
}

interface Methodology {
  shortTerm: {
    dataSource: string;
    dataPoints: string;
    targetWindow: string;
  };
  longTerm: {
    dataSource: string;
    dataPoints: string;
    targetWindow: string;
  };
  signalTrigger: string;
  targets: string[];
  scoreFormula: string;
}

interface ScanResponse {
  rsiConfig: {
    period: number;
    oversold: number;
    overbought: number;
  };
  results: ScanResult[];
  timestamp: string;
  methodology: Methodology;
}

// Default leveraged ETFs to scan
const DEFAULT_ETFS = [
  'TQQQ', 'SOXL', 'UPRO', 'SPXL', 'TECL', 'FAS', 'TNA', 'LABU', 'FNGU', 'NAIL',
  'DPST', 'DFEN', 'RETL', 'MIDU', 'UDOW', 'URTY', 'WEBL', 'HIBL', 'WANT', 'DUSL',
  'QLD', 'SSO', 'UWM', 'DDM', 'MVV', 'SAA', 'UYG', 'ROM', 'USD', 'UGE',
];

// Convert minutes to readable time
function minsToTime(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = mins / 60;
  if (hours < 6.5) return `${hours.toFixed(1)}h`;
  const days = hours / 6.5; // ~6.5 trading hours per day
  return `${days.toFixed(1)}d`;
}

// Tooltip component
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group relative cursor-help">
      {children}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 max-w-xs text-center">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></span>
      </span>
    </span>
  );
}

// Expanded Detail Row Component
function ExpandedDetail({ result, oversold }: { result: ScanResult; oversold: number }) {
  const { shortTerm, longTerm } = result;

  return (
    <tr>
      <td colSpan={10} className="p-0 bg-dark-bg">
        <div className="p-6 border-t border-dark-border">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-bold text-white">{result.symbol} - Detailed Analysis</h3>
              {result.isCurrentlyOversold && (
                <span className="badge badge-success">Currently Oversold (RSI {result.currentRSI.toFixed(1)})</span>
              )}
            </div>
            <div className="text-sm text-gray-400">
              Current Price: <span className="font-mono text-white">{formatCurrency(result.currentPrice)}</span>
            </div>
          </div>

          {/* Two Column Layout for Timeframes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Short-Term (7 Days) */}
            <div className="p-4 rounded-lg border border-profit/30 bg-profit/5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-profit"></div>
                <h4 className="font-medium text-profit">Short-Term Analysis (7 Days)</h4>
              </div>

              <div className="space-y-3 text-sm">
                <div className="p-3 bg-dark-card rounded">
                  <p className="text-gray-500 text-xs mb-1">Data Source</p>
                  <p className="text-white">1-minute candles over 7 trading days</p>
                  <p className="text-gray-400 text-xs mt-1">{shortTerm.dataPoints.toLocaleString()} data points analyzed</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-dark-card rounded">
                    <p className="text-gray-500 text-xs mb-1">RSI Signals Found</p>
                    <p className="text-2xl font-bold text-white">{shortTerm.totalSignals}</p>
                    <p className="text-gray-400 text-xs">Times RSI crossed below {oversold}</p>
                  </div>
                  <div className="p-3 bg-dark-card rounded">
                    <p className="text-gray-500 text-xs mb-1">Win Rate @ 1.5%</p>
                    <p className={`text-2xl font-bold ${shortTerm.winRateAt1_5Pct >= 60 ? 'text-profit' : shortTerm.winRateAt1_5Pct >= 40 ? 'text-neutral' : 'text-loss'}`}>
                      {shortTerm.winRateAt1_5Pct.toFixed(1)}%
                    </p>
                    <p className="text-gray-400 text-xs">{shortTerm.winsAt1_5Pct} of {shortTerm.totalSignals} signals hit +1.5%</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-dark-card rounded">
                    <p className="text-gray-500 text-xs mb-1">Win Rate @ 2%</p>
                    <p className={`text-xl font-bold ${shortTerm.winRateAt2Pct >= 50 ? 'text-profit' : shortTerm.winRateAt2Pct >= 30 ? 'text-neutral' : 'text-loss'}`}>
                      {shortTerm.winRateAt2Pct.toFixed(1)}%
                    </p>
                    <p className="text-gray-400 text-xs">{shortTerm.winsAt2Pct} of {shortTerm.totalSignals} signals hit +2%</p>
                  </div>
                  <div className="p-3 bg-dark-card rounded">
                    <p className="text-gray-500 text-xs mb-1">Avg Time to Target</p>
                    <p className="text-xl font-bold text-white">{minsToTime(shortTerm.avgMinsTo1_5Pct)}</p>
                    <p className="text-gray-400 text-xs">{Math.round(shortTerm.avgMinsTo1_5Pct)} minutes on average</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-dark-card rounded">
                    <p className="text-gray-500 text-xs mb-1">Avg Max Gain</p>
                    <p className="text-xl font-bold text-profit">+{(shortTerm.avgMaxGain * 100).toFixed(2)}%</p>
                    <p className="text-gray-400 text-xs">Highest point reached per signal</p>
                  </div>
                  <div className="p-3 bg-dark-card rounded">
                    <p className="text-gray-500 text-xs mb-1">Avg Max Drawdown</p>
                    <p className="text-xl font-bold text-loss">{(shortTerm.avgMaxDrawdown * 100).toFixed(2)}%</p>
                    <p className="text-gray-400 text-xs">Worst dip before hitting target</p>
                  </div>
                </div>

                <div className="p-3 bg-dark-card rounded">
                  <p className="text-gray-500 text-xs mb-1">Signal Strength Score</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 bg-dark-border rounded overflow-hidden">
                      <div
                        className={`h-full rounded ${shortTerm.signalStrength >= 70 ? 'bg-profit' : shortTerm.signalStrength >= 50 ? 'bg-neutral' : 'bg-loss'}`}
                        style={{ width: `${shortTerm.signalStrength}%` }}
                      />
                    </div>
                    <span className="font-bold text-white">{shortTerm.signalStrength}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Long-Term (60 Days) */}
            <div className="p-4 rounded-lg border border-blue-500/30 bg-blue-500/5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                <h4 className="font-medium text-blue-400">Long-Term Analysis (60 Days)</h4>
              </div>

              <div className="space-y-3 text-sm">
                <div className="p-3 bg-dark-card rounded">
                  <p className="text-gray-500 text-xs mb-1">Data Source</p>
                  <p className="text-white">5-minute candles over 60 trading days</p>
                  <p className="text-gray-400 text-xs mt-1">{longTerm.dataPoints.toLocaleString()} data points analyzed</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-dark-card rounded">
                    <p className="text-gray-500 text-xs mb-1">RSI Signals Found</p>
                    <p className="text-2xl font-bold text-white">{longTerm.totalSignals}</p>
                    <p className="text-gray-400 text-xs">Times RSI crossed below {oversold}</p>
                  </div>
                  <div className="p-3 bg-dark-card rounded">
                    <p className="text-gray-500 text-xs mb-1">Win Rate @ 1.5%</p>
                    <p className={`text-2xl font-bold ${longTerm.winRateAt1_5Pct >= 60 ? 'text-profit' : longTerm.winRateAt1_5Pct >= 40 ? 'text-neutral' : 'text-loss'}`}>
                      {longTerm.winRateAt1_5Pct.toFixed(1)}%
                    </p>
                    <p className="text-gray-400 text-xs">{longTerm.winsAt1_5Pct} of {longTerm.totalSignals} signals hit +1.5%</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-dark-card rounded">
                    <p className="text-gray-500 text-xs mb-1">Win Rate @ 2%</p>
                    <p className={`text-xl font-bold ${longTerm.winRateAt2Pct >= 50 ? 'text-profit' : longTerm.winRateAt2Pct >= 30 ? 'text-neutral' : 'text-loss'}`}>
                      {longTerm.winRateAt2Pct.toFixed(1)}%
                    </p>
                    <p className="text-gray-400 text-xs">{longTerm.winsAt2Pct} of {longTerm.totalSignals} signals hit +2%</p>
                  </div>
                  <div className="p-3 bg-dark-card rounded">
                    <p className="text-gray-500 text-xs mb-1">Avg Time to Target</p>
                    <p className="text-xl font-bold text-white">{minsToTime(longTerm.avgMinsTo1_5Pct)}</p>
                    <p className="text-gray-400 text-xs">{Math.round(longTerm.avgMinsTo1_5Pct)} minutes on average</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-dark-card rounded">
                    <p className="text-gray-500 text-xs mb-1">Avg Max Gain</p>
                    <p className="text-xl font-bold text-profit">+{(longTerm.avgMaxGain * 100).toFixed(2)}%</p>
                    <p className="text-gray-400 text-xs">Highest point reached per signal</p>
                  </div>
                  <div className="p-3 bg-dark-card rounded">
                    <p className="text-gray-500 text-xs mb-1">Avg Max Drawdown</p>
                    <p className="text-xl font-bold text-loss">{(longTerm.avgMaxDrawdown * 100).toFixed(2)}%</p>
                    <p className="text-gray-400 text-xs">Worst dip before hitting target</p>
                  </div>
                </div>

                <div className="p-3 bg-dark-card rounded">
                  <p className="text-gray-500 text-xs mb-1">Signal Strength Score</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 bg-dark-border rounded overflow-hidden">
                      <div
                        className={`h-full rounded ${longTerm.signalStrength >= 70 ? 'bg-profit' : longTerm.signalStrength >= 50 ? 'bg-neutral' : 'bg-loss'}`}
                        style={{ width: `${longTerm.signalStrength}%` }}
                      />
                    </div>
                    <span className="font-bold text-white">{longTerm.signalStrength}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Combined Score Explanation */}
          <div className="mt-6 p-4 rounded-lg border border-dark-border bg-dark-card">
            <h4 className="font-medium text-white mb-3">Combined Score: {result.combinedScore}</h4>
            <p className="text-sm text-gray-400">
              The combined score weighs short-term data (60%) higher than long-term data (40%) because recent market behavior
              is more predictive. Formula: <code className="bg-dark-bg px-2 py-1 rounded text-xs">0.6 × {shortTerm.signalStrength} + 0.4 × {longTerm.signalStrength} = {result.combinedScore}</code>
            </p>
          </div>

          {/* Interpretation Guide */}
          <div className="mt-4 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
            <h4 className="font-medium text-yellow-400 mb-2">How to Read This Data</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li><strong className="text-white">Signals:</strong> Each time RSI dropped below {oversold}, we tracked what happened over the next 390 minutes (1 trading day)</li>
              <li><strong className="text-white">Win Rate:</strong> What % of those signals resulted in price hitting +1.5% or +2% from the signal point</li>
              <li><strong className="text-white">Avg Time:</strong> How long it typically takes to hit the target when successful</li>
              <li><strong className="text-white">Max Gain/Drawdown:</strong> The best and worst points reached, helping you set stops and targets</li>
              <li><strong className="text-white">Consistent = Good:</strong> Look for ETFs where <span className="text-profit">both</span> timeframes show high win rates. This confirms the pattern is reliable.</li>
            </ul>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function ScannerPage() {
  const { settings, updateScannerSettings } = useSettingsStore();
  const scannerSettings = settings.scannerSettings || DEFAULT_SCANNER_SETTINGS;

  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [methodology, setMethodology] = useState<Methodology | null>(null);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  // Scanner settings - initialize from persisted settings
  const [period, setPeriod] = useState(scannerSettings.rsiPeriod);
  const [oversold, setOversold] = useState(scannerSettings.oversoldThreshold);
  const [dataSource, setDataSource] = useState<'yahoo' | 'finnhub'>(scannerSettings.dataSource);
  const [customSymbols, setCustomSymbols] = useState('');
  const [minWinRate, setMinWinRate] = useState(scannerSettings.minWinRate);
  const [minSignals, setMinSignals] = useState(scannerSettings.minSignals);
  const [showOnlyOversold, setShowOnlyOversold] = useState(false);
  const [viewMode, setViewMode] = useState<'combined' | 'shortTerm' | 'longTerm'>('combined');

  // API key settings
  const [finnhubApiKey, setFinnhubApiKey] = useState('');
  const [showApiSettings, setShowApiSettings] = useState(false);

  // Sync settings to store when they change
  useEffect(() => {
    updateScannerSettings({
      rsiPeriod: period,
      oversoldThreshold: oversold,
      minWinRate,
      minSignals,
      dataSource,
    });
  }, [period, oversold, minWinRate, minSignals, dataSource, updateScannerSettings]);

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('finnhub_api_key');
    if (savedKey) {
      setFinnhubApiKey(savedKey);
    }
  }, []);

  // Save API key to localStorage
  const saveApiKey = () => {
    localStorage.setItem('finnhub_api_key', finnhubApiKey);
    setShowApiSettings(false);
  };

  const runScan = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Parse symbols - accept comma, space, newline, or tab separated
      const symbols = customSymbols.trim()
        ? customSymbols.split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
        : DEFAULT_ETFS;

      const params = new URLSearchParams({
        symbols: symbols.join(','),
        period: period.toString(),
        oversold: oversold.toString(),
        source: dataSource,
      });

      // Add API key if using Finnhub
      if (dataSource === 'finnhub' && finnhubApiKey) {
        params.set('apiKey', finnhubApiKey);
      }

      const response = await fetch(`/api/scanner?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch scanner results');
      }

      const data: ScanResponse = await response.json();
      setResults(data.results);
      setLastScan(data.timestamp);
      setMethodology(data.methodology);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [customSymbols, period, oversold, dataSource, finnhubApiKey]);

  // Handle Enter key to run scan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        // Don't trigger if user is in a textarea
        const target = e.target as HTMLElement;
        if (target.tagName !== 'TEXTAREA') {
          runScan();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [runScan, isLoading]);

  // Get the relevant metrics based on view mode
  const getMetrics = (result: ScanResult): TimeframeMetrics => {
    if (viewMode === 'shortTerm') return result.shortTerm;
    if (viewMode === 'longTerm') return result.longTerm;
    // For combined, use short-term metrics but combined score
    return result.shortTerm;
  };

  const getScore = (result: ScanResult): number => {
    if (viewMode === 'shortTerm') return result.shortTerm.signalStrength;
    if (viewMode === 'longTerm') return result.longTerm.signalStrength;
    return result.combinedScore;
  };

  // Filter results and track why they're filtered
  const filteredResults = results.filter(r => {
    if (r.error) return false;
    const metrics = getMetrics(r);
    if (metrics.winRateAt1_5Pct < minWinRate) return false;
    if (metrics.totalSignals < minSignals) return false;
    if (showOnlyOversold && !r.isCurrentlyOversold) return false;
    return true;
  });

  // Get filtered out results with reasons
  const filteredOutResults = results.filter(r => !r.error).filter(r => {
    const metrics = getMetrics(r);
    return metrics.winRateAt1_5Pct < minWinRate ||
           metrics.totalSignals < minSignals ||
           (showOnlyOversold && !r.isCurrentlyOversold);
  }).map(r => {
    const metrics = getMetrics(r);
    const reasons: string[] = [];
    if (metrics.totalSignals < minSignals) reasons.push(`${metrics.totalSignals} signals (need ${minSignals})`);
    if (metrics.winRateAt1_5Pct < minWinRate) reasons.push(`${metrics.winRateAt1_5Pct.toFixed(0)}% win rate (need ${minWinRate}%)`);
    if (showOnlyOversold && !r.isCurrentlyOversold) reasons.push('not currently oversold');
    return { symbol: r.symbol, reasons, metrics };
  });

  // Find currently oversold with high win rates
  const hotOpportunities = results.filter(r =>
    !r.error &&
    r.isCurrentlyOversold &&
    r.shortTerm.winRateAt1_5Pct >= 60 &&
    r.shortTerm.totalSignals >= 2
  );

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">ETF Scanner</h1>
          <p className="text-sm text-gray-500 mt-1">
            Find ETFs where RSI drops below {oversold} and price gains 1.5%+ within 1 day
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={isLoading}
          className="btn btn-primary"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Scanning...
            </span>
          ) : (
            'Run Scan (Enter)'
          )}
        </button>
      </div>

      {/* Scanner Settings */}
      <div className="card mb-6">
        <div className="card-header">
          <h2 className="font-medium text-white">Scanner Settings</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="label flex items-center gap-1">
                RSI Period
                <Tooltip text="Number of candles used to calculate RSI. Standard is 14.">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Tooltip>
              </label>
              <input
                type="number"
                value={period}
                onChange={(e) => setPeriod(Number(e.target.value))}
                className="input w-full"
                min={2}
                max={100}
              />
            </div>
            <div>
              <label className="label flex items-center gap-1">
                Oversold Threshold
                <Tooltip text="RSI value that triggers a buy signal. When RSI crosses below this, we check if price gains 1.5%+ within 1 day.">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Tooltip>
              </label>
              <input
                type="number"
                value={oversold}
                onChange={(e) => setOversold(Number(e.target.value))}
                className="input w-full"
                min={1}
                max={100}
              />
            </div>
            <div>
              <label className="label flex items-center gap-1">
                Min Win Rate %
                <Tooltip text="Only show ETFs where at least this % of signals hit the 1.5% target within 1 day.">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Tooltip>
              </label>
              <input
                type="number"
                value={minWinRate}
                onChange={(e) => setMinWinRate(Number(e.target.value))}
                className="input w-full"
                min={0}
                max={100}
              />
            </div>
            <div>
              <label className="label flex items-center gap-1">
                Min Signals
                <Tooltip text="Minimum number of RSI crossings required. More signals = more reliable pattern.">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Tooltip>
              </label>
              <input
                type="number"
                value={minSignals}
                onChange={(e) => setMinSignals(Number(e.target.value))}
                className="input w-full"
                min={1}
                max={50}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyOversold}
                  onChange={(e) => setShowOnlyOversold(e.target.checked)}
                  className="w-4 h-4 rounded border-dark-border bg-dark-bg text-profit focus:ring-profit"
                />
                <span className="text-sm text-gray-400">Only oversold now</span>
              </label>
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Custom Symbols (comma-separated, leave empty for defaults)</label>
            <input
              type="text"
              value={customSymbols}
              onChange={(e) => setCustomSymbols(e.target.value.toUpperCase())}
              placeholder="TQQQ SOXL UPRO (space, comma, or newline separated)"
              className="input w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Default scans {DEFAULT_ETFS.length} leveraged ETFs. Press Enter to scan.
            </p>
          </div>

          {/* Data Source & API Settings */}
          <div className="mt-4 pt-4 border-t border-dark-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className="label mb-0">Data Source:</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDataSource('yahoo')}
                    className={`px-3 py-1.5 text-sm rounded ${dataSource === 'yahoo' ? 'bg-profit/20 text-profit border border-profit/50' : 'bg-dark-bg text-gray-400 border border-dark-border hover:text-white'}`}
                  >
                    Yahoo Finance
                  </button>
                  <button
                    onClick={() => setDataSource('finnhub')}
                    className={`px-3 py-1.5 text-sm rounded ${dataSource === 'finnhub' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : 'bg-dark-bg text-gray-400 border border-dark-border hover:text-white'}`}
                  >
                    Finnhub
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowApiSettings(!showApiSettings)}
                className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                API Settings
              </button>
            </div>

            {dataSource === 'finnhub' && !finnhubApiKey && (
              <p className="text-sm text-yellow-400 mt-2">
                Finnhub requires an API key. Click {"\""}API Settings{"\""} to configure.
              </p>
            )}

            {showApiSettings && (
              <div className="mt-4 p-4 bg-dark-bg rounded-lg border border-dark-border">
                <h3 className="text-sm font-medium text-white mb-3">API Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="label flex items-center gap-1">
                      Finnhub API Key
                      <Tooltip text="Get a free API key at finnhub.io. Required for Finnhub data source.">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </Tooltip>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={finnhubApiKey}
                        onChange={(e) => setFinnhubApiKey(e.target.value)}
                        placeholder="Enter your Finnhub API key"
                        className="input flex-1"
                      />
                      <button onClick={saveApiKey} className="btn btn-primary">
                        Save
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Get a free key at{' '}
                      <a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        finnhub.io
                      </a>
                      . Key is stored locally in your browser.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="card mb-6 border-loss/50">
          <div className="card-body text-loss">{error}</div>
        </div>
      )}

      {/* Hot Opportunities */}
      {hotOpportunities.length > 0 && (
        <div className="card mb-6 border-profit/50">
          <div className="card-header bg-profit/10">
            <h2 className="font-medium text-profit flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Hot Opportunities - Currently Oversold (RSI {'<'} {oversold})
            </h2>
          </div>
          <div className="card-body">
            <p className="text-sm text-gray-400 mb-4">
              These ETFs are <strong className="text-white">currently</strong> below RSI {oversold} and have historically gained 1.5%+ within 1 day.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {hotOpportunities.map((result) => (
                <div
                  key={result.symbol}
                  className="p-4 bg-profit/10 border border-profit/30 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-bold text-white">{result.symbol}</span>
                    <span className="badge badge-success">
                      RSI {result.currentRSI.toFixed(1)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Price:</span>
                      <span className="ml-1 font-mono">{formatCurrency(result.currentPrice)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">7d Win:</span>
                      <span className="ml-1 font-mono text-profit">{result.shortTerm.winRateAt1_5Pct.toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-gray-500">60d Win:</span>
                      <span className="ml-1 font-mono text-blue-400">{result.longTerm.winRateAt1_5Pct.toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Score:</span>
                      <span className="ml-1 font-mono">{result.combinedScore}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Methodology Explanation - shown after scan */}
      {results.length > 0 && methodology && (
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="font-medium text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              How This Works
            </h2>
          </div>
          <div className="card-body text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-white mb-3">Dual Timeframe Analysis</h3>
                <div className="space-y-3 text-gray-400">
                  <div className="p-3 bg-profit/10 border border-profit/30 rounded-lg">
                    <strong className="text-profit">Short-Term (7 days)</strong>
                    <p className="text-xs mt-1">{methodology.shortTerm.dataSource}</p>
                    <p className="text-xs text-gray-500">{methodology.shortTerm.dataPoints}</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <strong className="text-blue-400">Long-Term (60 days)</strong>
                    <p className="text-xs mt-1">{methodology.longTerm.dataSource}</p>
                    <p className="text-xs text-gray-500">{methodology.longTerm.dataPoints}</p>
                  </div>
                  <p className="text-xs">
                    <strong className="text-white">Combined Score:</strong> {methodology.scoreFormula}
                  </p>
                </div>
              </div>
              <div>
                <h3 className="font-medium text-white mb-3">The Strategy</h3>
                <div className="space-y-2 text-gray-400">
                  <div className="flex gap-2">
                    <span className="text-profit font-bold">1.</span>
                    <span><strong className="text-white">Signal:</strong> {methodology.signalTrigger}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-profit font-bold">2.</span>
                    <span><strong className="text-white">Target:</strong> Price gains 1.5% or 2% from entry</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-profit font-bold">3.</span>
                    <span><strong className="text-white">Window:</strong> 1 trading day (390 minutes)</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-profit font-bold">4.</span>
                    <span><strong className="text-white">Win Rate:</strong> % of signals that hit target</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-400 text-sm">
                <strong>Key Insight:</strong> Short-term (7d) shows recent behavior, long-term (60d) confirms pattern consistency.
                Both high = strong signal. Look for ETFs with {'>'}60% win rate in both timeframes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div>
              <h2 className="font-medium text-white">
                Scan Results ({filteredResults.length} of {results.filter(r => !r.error).length} ETFs pass filters)
              </h2>
            </div>
            <div className="flex items-center gap-4">
              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-dark-bg rounded-lg p-1">
                <button
                  onClick={() => setViewMode('combined')}
                  className={`px-3 py-1 text-xs rounded ${viewMode === 'combined' ? 'bg-dark-card text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  Combined
                </button>
                <button
                  onClick={() => setViewMode('shortTerm')}
                  className={`px-3 py-1 text-xs rounded ${viewMode === 'shortTerm' ? 'bg-profit/20 text-profit' : 'text-gray-400 hover:text-white'}`}
                >
                  7 Days
                </button>
                <button
                  onClick={() => setViewMode('longTerm')}
                  className={`px-3 py-1 text-xs rounded ${viewMode === 'longTerm' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400 hover:text-white'}`}
                >
                  60 Days
                </button>
              </div>
              {lastScan && (
                <span className="text-xs text-gray-500">
                  Last scan: {new Date(lastScan).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Price</th>
                  <th>
                    <Tooltip text="Current RSI value. Green if below threshold (oversold).">
                      <span className="underline decoration-dotted cursor-help">RSI</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text="Number of times RSI crossed below threshold.">
                      <span className="underline decoration-dotted cursor-help">Signals</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text="% of signals where price hit +1.5% within 1 trading day.">
                      <span className="underline decoration-dotted cursor-help">Win (1.5%)</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text="% of signals where price hit +2% within 1 trading day.">
                      <span className="underline decoration-dotted cursor-help">Win (2%)</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text="Average time to reach 1.5% target when successful.">
                      <span className="underline decoration-dotted cursor-help">Avg Time</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text="Average highest gain reached per signal.">
                      <span className="underline decoration-dotted cursor-help">Max Gain</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text="Average max drawdown before hitting target.">
                      <span className="underline decoration-dotted cursor-help">Max DD</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text={viewMode === 'combined' ? 'Combined: 60% short-term + 40% long-term score' : 'Score for this timeframe'}>
                      <span className="underline decoration-dotted cursor-help">Score</span>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.length === 0 && filteredOutResults.length > 0 ? (
                  <>
                    <tr>
                      <td colSpan={10} className="text-center py-4 text-gray-500 border-b border-dark-border">
                        No results match your filters. Here{"'"}s why:
                      </td>
                    </tr>
                    {filteredOutResults.map(({ symbol, reasons, metrics }) => (
                      <tr key={symbol} className="opacity-60">
                        <td className="font-medium text-white">{symbol}</td>
                        <td colSpan={3} className="text-sm text-yellow-400">
                          Filtered: {reasons.join(', ')}
                        </td>
                        <td colSpan={2} className="font-mono text-sm">
                          {metrics.totalSignals} signals, {metrics.winRateAt1_5Pct.toFixed(0)}% win
                        </td>
                        <td colSpan={4} className="text-xs text-gray-500">
                          Try lowering Min Win Rate to 0% or Min Signals to 1
                        </td>
                      </tr>
                    ))}
                  </>
                ) : filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-gray-500">
                      No results. Check if the data source is working.
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((result) => {
                    const metrics = getMetrics(result);
                    const score = getScore(result);
                    const isExpanded = expandedSymbol === result.symbol;
                    return (
                      <React.Fragment key={result.symbol}>
                        <tr
                          className={`cursor-pointer transition-colors hover:bg-dark-bg ${result.isCurrentlyOversold ? 'bg-profit/5' : ''} ${isExpanded ? 'bg-dark-bg' : ''}`}
                          onClick={() => setExpandedSymbol(isExpanded ? null : result.symbol)}
                        >
                          <td className="font-medium text-white">
                            <div className="flex items-center gap-2">
                              <svg
                                className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              {result.symbol}
                              {result.isCurrentlyOversold && (
                                <span className="badge badge-success text-xs">OVERSOLD</span>
                              )}
                            </div>
                          </td>
                          <td className="font-mono">{formatCurrency(result.currentPrice)}</td>
                          <td className={`font-mono ${result.currentRSI < oversold ? 'text-profit' : result.currentRSI > 70 ? 'text-loss' : 'text-neutral'}`}>
                            {result.currentRSI.toFixed(1)}
                          </td>
                          <td className="font-mono">
                            {viewMode === 'combined' ? (
                              <span className="flex gap-1">
                                <span className="text-profit">{result.shortTerm.totalSignals}</span>
                                <span className="text-gray-500">/</span>
                                <span className="text-blue-400">{result.longTerm.totalSignals}</span>
                              </span>
                            ) : (
                              metrics.totalSignals
                            )}
                          </td>
                          <td className={`font-mono ${metrics.winRateAt1_5Pct >= 70 ? 'text-profit' : metrics.winRateAt1_5Pct >= 50 ? 'text-neutral' : 'text-loss'}`}>
                            {viewMode === 'combined' ? (
                              <span className="flex gap-1">
                                <span className="text-profit">{result.shortTerm.winRateAt1_5Pct.toFixed(0)}%</span>
                                <span className="text-gray-500">/</span>
                                <span className="text-blue-400">{result.longTerm.winRateAt1_5Pct.toFixed(0)}%</span>
                              </span>
                            ) : (
                              `${metrics.winRateAt1_5Pct.toFixed(1)}%`
                            )}
                          </td>
                          <td className={`font-mono ${metrics.winRateAt2Pct >= 60 ? 'text-profit' : metrics.winRateAt2Pct >= 40 ? 'text-neutral' : 'text-loss'}`}>
                            {metrics.winRateAt2Pct.toFixed(1)}%
                          </td>
                          <td className="font-mono">{minsToTime(metrics.avgMinsTo1_5Pct)}</td>
                          <td className="font-mono text-profit">{formatPercent(metrics.avgMaxGain)}</td>
                          <td className="font-mono text-loss">{formatPercent(metrics.avgMaxDrawdown)}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-dark-border rounded overflow-hidden">
                                <div
                                  className={`h-full rounded ${score >= 70 ? 'bg-profit' : score >= 50 ? 'bg-neutral' : 'bg-loss'}`}
                                  style={{ width: `${score}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs">{score}</span>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && <ExpandedDetail result={result} oversold={oversold} />}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Show errors at bottom */}
          {results.some(r => r.error) && (
            <div className="p-4 border-t border-dark-border">
              <p className="text-xs text-gray-500 mb-2">ETFs with insufficient data:</p>
              <div className="flex flex-wrap gap-2">
                {results.filter(r => r.error).map(r => (
                  <span key={r.symbol} className="text-xs text-gray-600">{r.symbol}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      {results.length === 0 && !isLoading && (
        <div className="card">
          <div className="card-body text-center py-12">
            <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="text-lg font-medium text-white mb-2">Find Repeatable RSI Reversal Patterns</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-4">
              This scanner analyzes both short-term (7 days, 1-min bars) and long-term (60 days, 5-min bars) data
              to find ETFs where RSI dropping below {oversold} consistently leads to 1.5%+ gains within 1 day.
            </p>
            <div className="text-left max-w-lg mx-auto text-sm text-gray-400 space-y-2">
              <p><strong className="text-white">What you{"'"}re looking for:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong className="text-profit">High Win Rate in Both Timeframes</strong> - Confirms pattern reliability</li>
                <li><strong className="text-profit">Multiple Signals</strong> - More data points = more confidence</li>
                <li><strong className="text-profit">Good Risk/Reward</strong> - Avg Max Gain should exceed Avg Max Drawdown</li>
                <li><strong className="text-profit">Currently Oversold</strong> - Look for the OVERSOLD badge for potential entries</li>
              </ul>
            </div>
            <button onClick={runScan} className="btn btn-primary mt-6">
              Run Scan
            </button>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
