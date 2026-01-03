'use client';

import { useState, useCallback, useEffect } from 'react';
import { MainLayout } from '@/components/Layout';
import { formatCurrency, formatPercent } from '@/lib/calculations';

interface ScanResult {
  symbol: string;
  currentPrice: number;
  currentRSI: number;
  avgVolume: number;
  totalSignals: number;
  winsAt1_5Pct: number;
  winsAt2Pct: number;
  winRateAt1_5Pct: number;
  winRateAt2Pct: number;
  avgMinsTo1_5Pct: number;
  avgMaxGain: number;
  avgMaxDrawdown: number;
  signalStrength: number;
  isCurrentlyOversold: boolean;
  dataPoints: number;
  error?: string;
}

interface Methodology {
  dataSource: string;
  dataPoints: string;
  signalTrigger: string;
  targetWindow: string;
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

export default function ScannerPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [methodology, setMethodology] = useState<Methodology | null>(null);

  // Scanner settings - defaults for intraday analysis
  const [period, setPeriod] = useState(14); // Standard 14-period RSI
  const [oversold, setOversold] = useState(50); // User's preferred threshold
  const [customSymbols, setCustomSymbols] = useState('');
  const [minWinRate, setMinWinRate] = useState(60);
  const [minSignals, setMinSignals] = useState(3);
  const [showOnlyOversold, setShowOnlyOversold] = useState(false);

  const runScan = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const symbols = customSymbols.trim()
        ? customSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
        : DEFAULT_ETFS;

      const params = new URLSearchParams({
        symbols: symbols.join(','),
        period: period.toString(),
        oversold: oversold.toString(),
      });

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
  }, [customSymbols, period, oversold]);

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

  // Filter results
  const filteredResults = results.filter(r => {
    if (r.error) return false;
    if (r.winRateAt1_5Pct < minWinRate) return false;
    if (r.totalSignals < minSignals) return false;
    if (showOnlyOversold && !r.isCurrentlyOversold) return false;
    return true;
  });

  // Find currently oversold with high win rates
  const hotOpportunities = results.filter(r =>
    !r.error &&
    r.isCurrentlyOversold &&
    r.winRateAt1_5Pct >= 60 &&
    r.totalSignals >= 3
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
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div>
              <label className="label flex items-center gap-1">
                RSI Period
                <Tooltip text="Number of 1-minute candles used to calculate RSI. Standard is 14.">
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
              placeholder="TQQQ, SOXL, UPRO..."
              className="input w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Default scans {DEFAULT_ETFS.length} leveraged ETFs. Press Enter to scan.
            </p>
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
              These ETFs are <strong className="text-white">currently</strong> below RSI {oversold} and have historically gained 1.5%+ within 1 day at least 60% of the time.
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
                      <span className="text-gray-500">Win Rate:</span>
                      <span className="ml-1 font-mono text-profit">{result.winRateAt1_5Pct.toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Avg Time:</span>
                      <span className="ml-1 font-mono">{minsToTime(result.avgMinsTo1_5Pct)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Signals:</span>
                      <span className="ml-1 font-mono">{result.totalSignals}</span>
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
                <h3 className="font-medium text-white mb-3">The Strategy</h3>
                <div className="space-y-3 text-gray-400">
                  <div className="flex gap-3">
                    <span className="text-profit font-bold">1.</span>
                    <div>
                      <strong className="text-white">Data:</strong> {methodology.dataSource}
                      <p className="text-xs text-gray-500">{methodology.dataPoints}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-profit font-bold">2.</span>
                    <div>
                      <strong className="text-white">Signal:</strong> {methodology.signalTrigger}
                      <p className="text-xs text-gray-500">Each time RSI drops below {oversold}, we record the entry price</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-profit font-bold">3.</span>
                    <div>
                      <strong className="text-white">Target:</strong> Price gains 1.5% or 2% from entry
                      <p className="text-xs text-gray-500">Window: {methodology.targetWindow}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-profit font-bold">4.</span>
                    <div>
                      <strong className="text-white">Win Rate:</strong> % of signals that hit target
                      <p className="text-xs text-gray-500">Higher = more reliable pattern</p>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-medium text-white mb-3">Column Explanations</h3>
                <div className="space-y-2 text-gray-400">
                  <p>
                    <Tooltip text="How many times RSI crossed below the threshold in the past month. More signals = more data points to validate the pattern.">
                      <span className="text-white font-medium underline decoration-dotted cursor-help">Signals:</span>
                    </Tooltip>
                    {' '}Times RSI crossed below {oversold} in past 30 days
                  </p>
                  <p>
                    <Tooltip text="Of all the signals, what percentage hit +1.5% within 1 trading day? 60%+ is considered good.">
                      <span className="text-white font-medium underline decoration-dotted cursor-help">Win Rate (1.5%):</span>
                    </Tooltip>
                    {' '}% that gained 1.5%+ within 1 day
                  </p>
                  <p>
                    <Tooltip text="Of all the signals, what percentage hit +2% within 1 trading day?">
                      <span className="text-white font-medium underline decoration-dotted cursor-help">Win Rate (2%):</span>
                    </Tooltip>
                    {' '}% that gained 2%+ within 1 day
                  </p>
                  <p>
                    <Tooltip text="When the target was hit, how long did it take on average?">
                      <span className="text-white font-medium underline decoration-dotted cursor-help">Avg Time:</span>
                    </Tooltip>
                    {' '}Average time to reach 1.5% target
                  </p>
                  <p>
                    <Tooltip text="Average highest gain reached per signal (even if target wasn't hit).">
                      <span className="text-white font-medium underline decoration-dotted cursor-help">Avg Max Gain:</span>
                    </Tooltip>
                    {' '}Average peak gain per signal
                  </p>
                  <p>
                    <Tooltip text="Average worst drawdown before hitting target. Lower = less risk.">
                      <span className="text-white font-medium underline decoration-dotted cursor-help">Avg Max DD:</span>
                    </Tooltip>
                    {' '}Average max drawdown before target
                  </p>
                  <p>
                    <Tooltip text={`Composite score: ${methodology.scoreFormula}. Higher = better opportunity.`}>
                      <span className="text-white font-medium underline decoration-dotted cursor-help">Score:</span>
                    </Tooltip>
                    {' '}Overall quality rating (0-100)
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-400 text-sm">
                <strong>Key Insight:</strong> Look for ETFs with high win rates ({'>'}60%), multiple signals ({'>'}3), and good risk/reward (Max Gain {'>'} Max DD).
                The {'"'}OVERSOLD{'"'} badge means the ETF is <em>currently</em> below RSI {oversold} — a potential entry point.
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
            {lastScan && (
              <span className="text-xs text-gray-500">
                Last scan: {new Date(lastScan).toLocaleTimeString()}
              </span>
            )}
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
                    <Tooltip text="Number of times RSI crossed below threshold in past 30 days.">
                      <span className="underline decoration-dotted cursor-help">Signals</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text="% of signals where price hit +1.5% within 1 trading day.">
                      <span className="underline decoration-dotted cursor-help">Win Rate (1.5%)</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text="% of signals where price hit +2% within 1 trading day.">
                      <span className="underline decoration-dotted cursor-help">Win Rate (2%)</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text="Average time to reach 1.5% target when successful.">
                      <span className="underline decoration-dotted cursor-help">Avg Time</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text="Average highest gain reached per signal.">
                      <span className="underline decoration-dotted cursor-help">Avg Max Gain</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text="Average max drawdown before hitting target.">
                      <span className="underline decoration-dotted cursor-help">Avg Max DD</span>
                    </Tooltip>
                  </th>
                  <th>
                    <Tooltip text="Composite score: 50% win rate + 30% risk/reward + 20% sample size.">
                      <span className="underline decoration-dotted cursor-help">Score</span>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-gray-500">
                      No results match your filters. Try lowering Min Win Rate or Min Signals.
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((result) => (
                    <tr key={result.symbol} className={result.isCurrentlyOversold ? 'bg-profit/5' : ''}>
                      <td className="font-medium text-white">
                        <div className="flex items-center gap-2">
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
                      <td className="font-mono">{result.totalSignals}</td>
                      <td className={`font-mono ${result.winRateAt1_5Pct >= 70 ? 'text-profit' : result.winRateAt1_5Pct >= 50 ? 'text-neutral' : 'text-loss'}`}>
                        {result.winRateAt1_5Pct.toFixed(1)}%
                      </td>
                      <td className={`font-mono ${result.winRateAt2Pct >= 60 ? 'text-profit' : result.winRateAt2Pct >= 40 ? 'text-neutral' : 'text-loss'}`}>
                        {result.winRateAt2Pct.toFixed(1)}%
                      </td>
                      <td className="font-mono">{minsToTime(result.avgMinsTo1_5Pct)}</td>
                      <td className="font-mono text-profit">{formatPercent(result.avgMaxGain)}</td>
                      <td className="font-mono text-loss">{formatPercent(result.avgMaxDrawdown)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-dark-border rounded overflow-hidden">
                            <div
                              className={`h-full rounded ${result.signalStrength >= 70 ? 'bg-profit' : result.signalStrength >= 50 ? 'bg-neutral' : 'bg-loss'}`}
                              style={{ width: `${result.signalStrength}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs">{result.signalStrength}</span>
                        </div>
                      </td>
                    </tr>
                  ))
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
              This scanner backtests 30 days of 1-minute data to find ETFs where RSI dropping below {oversold}
              has historically led to 1.5%+ gains within 1 trading day.
            </p>
            <div className="text-left max-w-lg mx-auto text-sm text-gray-400 space-y-2">
              <p><strong className="text-white">What you{"'"}re looking for:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong className="text-profit">High Win Rate</strong> - At least 60% of signals hit the 1.5% target</li>
                <li><strong className="text-profit">Multiple Signals</strong> - 3+ occurrences means the pattern is repeatable</li>
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
