import { Strategy, ConditionTree, ValueRef } from '@/types/strategy';

/**
 * Deterministic English explainer for a Strategy. Produces a plain-text
 * narrative summary describing what the strategy does, when it fires,
 * what it buys/sells, and the safety net.
 *
 * No LLM required — every output is computed from the structure. Keeps
 * the dashboard self-contained and fast. A future Tier 7.1 commit can
 * add an LLM-backed variant for users who want richer explanations.
 */

export interface StrategyExplanation {
  summary: string;        // one-sentence headline
  entry: string;          // "fires when..."
  exit: string;
  safety: string;         // "stop loss at..."
  sizing: string;
  scope: string;          // tickers + mode + cooldown
  warnings: string[];     // anything the user should know
}

export function explainStrategy(s: Strategy): StrategyExplanation {
  const warnings: string[] = [];
  const tickerLabel = s.tickers.length === 1
    ? s.tickers[0]
    : `${s.tickers.length} tickers (${s.tickers.join(', ')})`;
  const modeLabel = s.mode === 'paper'
    ? 'paper-trading mode (no real orders)'
    : s.mode === 'manual_confirm'
    ? 'manual-confirm mode (asks before sending)'
    : 'AUTO mode (sends real broker orders!)';

  const entry = describeCondTree(s.entry.when, 'entry');
  const exit = describeCondTree(s.exit.when, 'exit');

  const sharesLabel = s.size.kind === 'shares'
    ? `${s.size.n} shares per fire`
    : `${s.size.pct}% of account risk per fire`;

  const safety = s.stopLoss?.pct
    ? `Hard stop at ${s.stopLoss.pct}% below entry — exits position immediately if price gaps down through this level`
    : 'No safety stop configured';

  if (!s.stopLoss?.pct && s.mode === 'auto') {
    warnings.push('Auto mode without a safety stop is dangerous; a flash crash can wipe the position with no floor');
  }
  if (s.cooldownMinutes < 1 && s.mode !== 'paper') {
    warnings.push('Cooldown < 1 minute can cause repeated rapid fires; consider 5+ minutes for live trading');
  }
  if (s.tickers.length > 5) {
    warnings.push(`Spreading across ${s.tickers.length} tickers — make sure you have buying power for all simultaneous fires`);
  }

  // Detect cross-asset references for an extra explanation line
  const externalTickers = collectExternalTickersFromTree(s.entry.when)
    .concat(collectExternalTickersFromTree(s.exit.when));
  const uniqueExternals = Array.from(new Set(externalTickers))
    .filter((t) => !s.tickers.map((x) => x.toUpperCase()).includes(t.toUpperCase()));
  if (uniqueExternals.length > 0) {
    warnings.push(
      `Cross-asset trigger — watches ${uniqueExternals.join(', ')} but trades ${s.tickers.join(', ')}. Make sure the watched ticker(s) are in your watchlist for live monitoring.`
    );
  }

  const summary = `"${s.name}" — when ${entry.toLowerCase()}, ${
    s.mode === 'paper' ? 'paper-buy' : 'buy'
  } ${tickerLabel}; exit when ${exit.toLowerCase()}.`;

  const scope = `Trades ${tickerLabel} in ${modeLabel}. Cooldown: ${s.cooldownMinutes} minute${s.cooldownMinutes === 1 ? '' : 's'} between fires per ticker. ${s.enabled ? '⚡ Currently enabled.' : '○ Currently disabled.'}`;

  return {
    summary,
    entry: `Entry — fires when ${entry}`,
    exit: `Exit — fires when ${exit}`,
    safety,
    sizing: sharesLabel,
    scope,
    warnings,
  };
}

/** Render a ConditionTree to a friendly English clause. */
function describeCondTree(tree: ConditionTree, ctx: 'entry' | 'exit'): string {
  switch (tree.type) {
    case 'and': {
      const parts = tree.children.map((c) => describeCondTree(c, ctx));
      if (parts.length === 0) return 'no condition';
      if (parts.length === 1) return parts[0];
      return parts.join(' AND ');
    }
    case 'or': {
      const parts = tree.children.map((c) => describeCondTree(c, ctx));
      if (parts.length === 0) return 'no condition';
      if (parts.length === 1) return parts[0];
      return `(${parts.join(' OR ')})`;
    }
    case 'not':
      return `NOT (${describeCondTree(tree.child, ctx)})`;
    case 'compare': {
      const left = describeValueRef(tree.left);
      const right = describeValueRef(tree.right);
      const opWord = describeOp(tree.op);
      return `${left} is ${opWord} ${right}`;
    }
    case 'cross': {
      const target = describeValueRef(tree.target);
      const threshold = describeValueRef(tree.threshold);
      return `${target} crosses ${tree.dir} ${threshold}`;
    }
    case 'time_window':
      return `time of day is between ${tree.start} and ${tree.end} (ET)`;
  }
}

function describeOp(op: string): string {
  switch (op) {
    case '>': return 'greater than';
    case '<': return 'less than';
    case '>=': return 'at or above';
    case '<=': return 'at or below';
    case '==': return 'exactly';
    case '!=': return 'not equal to';
  }
  return op;
}

function describeValueRef(ref: ValueRef): string {
  const tickerPrefix = (t?: string) => (t ? `${t}'s ` : '');
  const tfSuffix = (tf?: string) => (tf ? ` (${tf} timeframe)` : '');

  switch (ref.kind) {
    case 'literal':
      return ref.value.toString();
    case 'price':
      return `${tickerPrefix(ref.ticker)}price${tfSuffix(ref.tf)}`;
    case 'rsi':
      return `${tickerPrefix(ref.ticker)}RSI(${ref.period})${tfSuffix(ref.tf)}`;
    case 'ema':
      return `${tickerPrefix(ref.ticker)}EMA(${ref.period})${tfSuffix(ref.tf)}`;
    case 'sma':
      return `${tickerPrefix(ref.ticker)}SMA(${ref.period})${tfSuffix(ref.tf)}`;
    case 'vwap':
      return `${tickerPrefix(ref.ticker)}VWAP${tfSuffix(ref.tf)}`;
    case 'volume':
      return `${tickerPrefix(ref.ticker)}volume${tfSuffix(ref.tf)}`;
    case 'minutes_since_open':
      return 'minutes since market open';
    case 'entry_price':
      return 'entry price';
    case 'minutes_since_entry':
      return 'minutes since entry';
    case 'pct_of': {
      const base = describeValueRef(ref.base);
      const sign = ref.pct >= 0 ? 'plus' : 'minus';
      return `${base} ${sign} ${Math.abs(ref.pct)}%`;
    }
    case 'iv':
      return ref.period === 'live' ? 'implied volatility (live)' : 'implied volatility (252-day percentile)';
    case 'delta':
      return `${ref.daysToExpiry}-day ${ref.type} delta`;
    case 'days_to_expiry':
      return 'days to expiration';
    case 'position_pnl_pct':
      return 'position P&L percentage';
  }
}

function collectExternalTickersFromTree(tree: ConditionTree): string[] {
  const out: string[] = [];
  walk(tree);
  return out;

  function walk(t: ConditionTree) {
    switch (t.type) {
      case 'and':
      case 'or':
        t.children.forEach(walk);
        return;
      case 'not':
        walk(t.child);
        return;
      case 'compare':
        addRef(t.left); addRef(t.right);
        return;
      case 'cross':
        addRef(t.target); addRef(t.threshold);
        return;
      case 'time_window':
        return;
    }
  }
  function addRef(r: ValueRef) {
    if ('ticker' in r && r.ticker) out.push(r.ticker.toUpperCase());
    if (r.kind === 'pct_of') addRef(r.base);
  }
}
