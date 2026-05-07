'use client';

import React, { useState, useCallback, useEffect } from 'react';
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

interface ScanResponse {
  rsiConfig: { period: number; oversold: number; overbought: number };
  results: ScanResult[];
  timestamp: string;
}

const DEFAULT_ETFS = [
  'TQQQ', 'SOXL', 'UPRO', 'SPXL', 'TECL', 'FAS', 'TNA', 'LABU', 'FNGU', 'NAIL',
  'DPST', 'DFEN', 'RETL', 'MIDU', 'UDOW', 'URTY', 'WEBL', 'HIBL', 'WANT', 'DUSL',
  'QLD', 'SSO', 'UWM', 'DDM', 'MVV', 'SAA', 'UYG', 'ROM', 'USD', 'UGE',
];

function minsToTime(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = mins / 60;
  if (hours < 6.5) return `${hours.toFixed(1)}h`;
  return `${(hours / 6.5).toFixed(1)}d`;
}

export default function ScannerPanel() {
  const { settings, updateScannerSettings } = useSettingsStore();
  const scannerSettings = settings.scannerSettings || DEFAULT_SCANNER_SETTINGS;

  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const [period, setPeriod] = useState(scannerSettings.rsiPeriod);
  const [oversold, setOversold] = useState(scannerSettings.oversoldThreshold);
  const [dataSource, setDataSource] = useState<'yahoo' | 'finnhub'>(scannerSettings.dataSource);
  const [customSymbols, setCustomSymbols] = useState('');
  const [minWinRate, setMinWinRate] = useState(scannerSettings.minWinRate);
  const [minSignals, setMinSignals] = useState(scannerSettings.minSignals);
  const [showOnlyOversold, setShowOnlyOversold] = useState(false);
  const [viewMode, setViewMode] = useState<'combined' | 'shortTerm' | 'longTerm'>('combined');
  const [finnhubApiKey, setFinnhubApiKey] = useState('');

  useEffect(() => {
    updateScannerSettings({
      rsiPeriod: period,
      oversoldThreshold: oversold,
      minWinRate,
      minSignals,
      dataSource,
    });
  }, [period, oversold, minWinRate, minSignals, dataSource, updateScannerSettings]);

  useEffect(() => {
    const saved = localStorage.getItem('finnhub_api_key');
    if (saved) setFinnhubApiKey(saved);
  }, []);

  const runScan = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const symbols = customSymbols.trim()
        ? customSymbols
            .split(/[\s,;]+/)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
        : DEFAULT_ETFS;

      const params = new URLSearchParams({
        symbols: symbols.join(','),
        period: period.toString(),
        oversold: oversold.toString(),
        source: dataSource,
      });
      if (dataSource === 'finnhub' && finnhubApiKey) params.set('apiKey', finnhubApiKey);

      const response = await fetch(`/api/scanner?${params}`);
      if (!response.ok) throw new Error('Failed to fetch scanner results');
      const data: ScanResponse = await response.json();
      setResults(data.results);
      setLastScan(data.timestamp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [customSymbols, period, oversold, dataSource, finnhubApiKey]);

  const getMetrics = (r: ScanResult): TimeframeMetrics =>
    viewMode === 'longTerm' ? r.longTerm : r.shortTerm;
  const getScore = (r: ScanResult): number =>
    viewMode === 'shortTerm'
      ? r.shortTerm.signalStrength
      : viewMode === 'longTerm'
      ? r.longTerm.signalStrength
      : r.combinedScore;

  const filteredResults = results.filter((r) => {
    if (r.error) return false;
    const m = getMetrics(r);
    if (m.winRateAt1_5Pct < minWinRate) return false;
    if (m.totalSignals < minSignals) return false;
    if (showOnlyOversold && !r.isCurrentlyOversold) return false;
    return true;
  });

  const hotOpportunities = results.filter(
    (r) =>
      !r.error &&
      r.isCurrentlyOversold &&
      r.shortTerm.winRateAt1_5Pct >= 60 &&
      r.shortTerm.totalSignals >= 2
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Find ETFs where RSI {'<'} {oversold} historically gains 1.5%+ within 1 week
        </p>
        <button
          onClick={runScan}
          disabled={isLoading}
          className="btn btn-primary disabled:opacity-60"
        >
          {isLoading ? 'Scanning...' : 'Run Scan'}
        </button>
      </div>

      <div className="card">
        <div className="card-body grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className="label">RSI Period</label>
            <input
              type="number"
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              className="input w-full font-mono"
              min={2}
              max={500}
            />
          </div>
          <div>
            <label className="label">Oversold</label>
            <input
              type="number"
              value={oversold}
              onChange={(e) => setOversold(Number(e.target.value))}
              className="input w-full font-mono"
              min={1}
              max={100}
            />
          </div>
          <div>
            <label className="label">Min Win %</label>
            <input
              type="number"
              value={minWinRate}
              onChange={(e) => setMinWinRate(Number(e.target.value))}
              className="input w-full font-mono"
              min={0}
              max={100}
            />
          </div>
          <div>
            <label className="label">Min Signals</label>
            <input
              type="number"
              value={minSignals}
              onChange={(e) => setMinSignals(Number(e.target.value))}
              className="input w-full font-mono"
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
                className="w-4 h-4 rounded border-white/10 bg-white/[0.03] text-profit"
              />
              <span className="text-xs text-gray-400">Oversold now</span>
            </label>
          </div>
          <div className="col-span-2 sm:col-span-3 lg:col-span-5">
            <label className="label">Custom Symbols (optional)</label>
            <input
              type="text"
              value={customSymbols}
              onChange={(e) => setCustomSymbols(e.target.value.toUpperCase())}
              placeholder="SOXL TQQQ UPRO (leave empty for default 30 ETFs)"
              className="input w-full font-mono"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="card border-loss/50">
          <div className="card-body text-loss text-sm">{error}</div>
        </div>
      )}

      {hotOpportunities.length > 0 && (
        <div className="card border-profit/40">
          <div className="card-header">
            <h2 className="font-medium text-profit flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Hot Opportunities — currently oversold
            </h2>
          </div>
          <div className="card-body grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {hotOpportunities.map((r) => (
              <div
                key={r.symbol}
                className="p-3 bg-profit/10 border border-profit/30 rounded-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white">{r.symbol}</span>
                  <span className="badge badge-success">RSI {r.currentRSI.toFixed(1)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-gray-500">Px </span>
                    {formatCurrency(r.currentPrice)}
                  </div>
                  <div>
                    <span className="text-gray-500">7d </span>
                    <span className="text-profit">
                      {r.shortTerm.winRateAt1_5Pct.toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">60d </span>
                    <span className="text-accent-light">
                      {r.longTerm.winRateAt1_5Pct.toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Score </span>
                    {r.combinedScore}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-medium text-white text-sm">
              Results ({filteredResults.length} of {results.filter((r) => !r.error).length})
            </h2>
            <div className="flex items-center gap-3">
              <div className="chip-group">
                <button
                  onClick={() => setViewMode('combined')}
                  className={`chip ${viewMode === 'combined' ? 'active' : ''}`}
                >
                  Combined
                </button>
                <button
                  onClick={() => setViewMode('shortTerm')}
                  className={`chip ${viewMode === 'shortTerm' ? 'active-profit' : ''}`}
                >
                  7D
                </button>
                <button
                  onClick={() => setViewMode('longTerm')}
                  className={`chip ${viewMode === 'longTerm' ? 'active-accent' : ''}`}
                >
                  60D
                </button>
              </div>
              {lastScan && (
                <span className="text-[10px] text-gray-500">
                  {new Date(lastScan).toLocaleTimeString()}
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
                  <th>RSI</th>
                  <th>Signals</th>
                  <th>Win 1.5%</th>
                  <th>Win 2%</th>
                  <th>Avg Time</th>
                  <th>Max Gain</th>
                  <th>Max DD</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-gray-500">
                      No results match filters
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((r) => {
                    const m = getMetrics(r);
                    const score = getScore(r);
                    const isExp = expandedSymbol === r.symbol;
                    return (
                      <React.Fragment key={r.symbol}>
                        <tr
                          className={`cursor-pointer hover:bg-white/[0.03] ${
                            r.isCurrentlyOversold ? 'bg-profit/5' : ''
                          }`}
                          onClick={() => setExpandedSymbol(isExp ? null : r.symbol)}
                        >
                          <td className="font-medium text-white">
                            <div className="flex items-center gap-2">
                              <svg
                                className={`w-3 h-3 text-gray-500 transition-transform ${
                                  isExp ? 'rotate-90' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                              {r.symbol}
                              {r.isCurrentlyOversold && (
                                <span className="badge badge-success">OVERSOLD</span>
                              )}
                            </div>
                          </td>
                          <td className="font-mono">{formatCurrency(r.currentPrice)}</td>
                          <td
                            className={`font-mono ${
                              r.currentRSI < oversold
                                ? 'text-profit'
                                : r.currentRSI > 70
                                ? 'text-loss'
                                : 'text-neutral'
                            }`}
                          >
                            {r.currentRSI.toFixed(1)}
                          </td>
                          <td className="font-mono">{m.totalSignals}</td>
                          <td
                            className={`font-mono ${
                              m.winRateAt1_5Pct >= 70
                                ? 'text-profit'
                                : m.winRateAt1_5Pct >= 50
                                ? 'text-neutral'
                                : 'text-loss'
                            }`}
                          >
                            {m.winRateAt1_5Pct.toFixed(0)}%
                          </td>
                          <td className="font-mono">{m.winRateAt2Pct.toFixed(0)}%</td>
                          <td className="font-mono text-xs">
                            {minsToTime(m.avgMinsTo1_5Pct)}
                          </td>
                          <td className="font-mono text-profit">
                            {formatPercent(m.avgMaxGain * 100)}
                          </td>
                          <td className="font-mono text-loss">
                            {formatPercent(m.avgMaxDrawdown * 100)}
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-1.5 bg-white/5 rounded overflow-hidden">
                                <div
                                  className={`h-full rounded ${
                                    score >= 70
                                      ? 'bg-profit'
                                      : score >= 50
                                      ? 'bg-neutral'
                                      : 'bg-loss'
                                  }`}
                                  style={{ width: `${score}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs">{score}</span>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results.length === 0 && !isLoading && (
        <div className="card card-body text-center py-12 text-gray-500">
          <p className="text-sm mb-2">Click <strong className="text-white">Run Scan</strong> to find RSI reversal patterns</p>
          <p className="text-xs">Default scans 30 leveraged ETFs with your strategy parameters</p>
        </div>
      )}
    </div>
  );
}
