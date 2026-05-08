'use client';

import { useState } from 'react';
import { useTradeStore, usePaperStore, useStrategyStore, usePriceStore } from '@/store';
import { evaluateCustomIndicator } from '@/lib/customIndicators';
import { showToast } from '@/components/UI';

/**
 * Inline JS notebook for ad-hoc strategy R&D. Sandboxed Function-
 * constructor evaluation against your live store data.
 *
 * Exposed in scope:
 *   - trades, paperOpen, paperClosed, strategies, prices
 *   - sma(closes, n), ema(closes, n), rsi(closes, n), stddev(closes, n)
 *   - return any value to display as JSON
 *
 * Use case: "How many SOXL trades did I have in March?" or
 * "What's my average hold time when win rate > 60%?"
 *
 * Caveats: minimal sandboxing. No async/await. No network. For
 * personal use only.
 */
export default function Notebook() {
  const trades = useTradeStore((s) => s.trades);
  const paperOpen = usePaperStore((s) => s.open);
  const paperClosed = usePaperStore((s) => s.closed);
  const strategies = useStrategyStore((s) => s.strategies);
  const prices = usePriceStore((s) => s.prices);
  const candles = usePriceStore((s) => s.candles);

  const [code, setCode] = useState(
    `// Try this:
// Count trades per ticker
const byTicker = {};
for (const t of trades) {
  byTicker[t.ticker] = (byTicker[t.ticker] || 0) + 1;
}
return byTicker;`
  );
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [running, setRunning] = useState(false);

  const helpers = {
    sma: (closes: number[], n: number) => {
      if (closes.length < n) return NaN;
      let sum = 0;
      for (let i = closes.length - n; i < closes.length; i++) sum += closes[i];
      return sum / n;
    },
    ema: (closes: number[], n: number) => {
      if (closes.length < n) return NaN;
      const k = 2 / (n + 1);
      let ema = closes.slice(0, n).reduce((s, x) => s + x, 0) / n;
      for (let i = n; i < closes.length; i++) ema = (closes[i] - ema) * k + ema;
      return ema;
    },
    rsi: (closes: number[], n: number) => {
      if (closes.length < n + 1) return NaN;
      let g = 0, l = 0;
      for (let i = 1; i <= n; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) g += d; else l += -d;
      }
      let aG = g / n, aL = l / n;
      for (let i = n + 1; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        const ng = d > 0 ? d : 0, nl = d < 0 ? -d : 0;
        aG = (aG * (n - 1) + ng) / n;
        aL = (aL * (n - 1) + nl) / n;
      }
      if (aL === 0) return 100;
      return 100 - 100 / (1 + aG / aL);
    },
    stddev: (closes: number[], n: number) => {
      if (closes.length < n) return NaN;
      const slice = closes.slice(-n);
      const mean = slice.reduce((s, x) => s + x, 0) / n;
      return Math.sqrt(slice.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
    },
  };

  const run = () => {
    setRunning(true);
    setError('');
    setResult('');
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function(
        'trades',
        'paperOpen',
        'paperClosed',
        'strategies',
        'prices',
        'candles',
        'sma',
        'ema',
        'rsi',
        'stddev',
        `'use strict'; ${code}`
      );
      const out = fn(
        trades,
        paperOpen,
        paperClosed,
        strategies,
        prices,
        candles,
        helpers.sma,
        helpers.ema,
        helpers.rsi,
        helpers.stddev
      );
      setResult(JSON.stringify(out, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-medium text-white">Notebook</h2>
        <p className="text-[11px] text-gray-500 mt-1">
          Inline JS sandbox for ad-hoc analysis. Available variables:{' '}
          <code className="text-accent-light">trades</code>,{' '}
          <code className="text-accent-light">paperClosed</code>,{' '}
          <code className="text-accent-light">strategies</code>,{' '}
          <code className="text-accent-light">prices</code>,{' '}
          <code className="text-accent-light">candles</code>. Helpers:{' '}
          <code className="text-accent-light">sma/ema/rsi/stddev(closes, n)</code>.{' '}
          <code className="text-accent-light">return</code> any value to display.
        </p>
      </div>
      <div className="card-body space-y-3">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={10}
          spellCheck={false}
          className="w-full font-mono text-[11px] bg-black/30 border border-white/10 rounded p-2 text-gray-200 resize-y"
        />
        <button onClick={run} disabled={running} className="btn btn-primary text-sm">
          {running ? 'Running…' : 'Run'}
        </button>
        {error && (
          <div className="rounded border border-loss/30 bg-loss/10 p-2 text-[11px] font-mono text-loss whitespace-pre-wrap">
            {error}
          </div>
        )}
        {result && (
          <div className="rounded border border-white/10 bg-white/[0.02] p-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              Result
            </div>
            <pre className="font-mono text-[11px] text-gray-200 whitespace-pre-wrap max-h-72 overflow-y-auto">
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
