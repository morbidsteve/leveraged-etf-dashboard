'use client';

import { useState } from 'react';
import { Strategy, ConditionTree, ValueRef, Timeframe, StrategyMode } from '@/types/strategy';
import { describeCondition } from '@/lib/strategy/conditions';
import { parseCondition, ParseResult } from '@/lib/strategy/nlparser';

const COMMON_TICKERS = ['SOXL', 'TQQQ', 'SOXS', 'SQQQ', 'UPRO', 'TNA', 'LABU', 'TECL'];

type EntryGoal =
  | 'rsi_cross_oversold'
  | 'rsi_above'
  | 'price_above_vwap'
  | 'rsi_with_vwap'
  | 'natural_language';

type ExitGoal =
  | 'price_target_pct'
  | 'rsi_cross_back'
  | 'either_target_or_rsi'
  | 'time_based'
  | 'natural_language';

interface Props {
  onCreate: (strategy: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

type Step = 1 | 2 | 3 | 4;

/**
 * Goal-first guided strategy builder. Replaces the dense form with a
 * 4-step flow:
 *   1. Pick the entry signal goal
 *   2. Pick the exit/take-profit goal
 *   3. Pick tickers + sizing + safety stop
 *   4. Review the generated condition tree
 */
export default function StrategyWizard({ onCreate, onCancel }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Step 1: Entry
  const [entryGoal, setEntryGoal] = useState<EntryGoal>('rsi_cross_oversold');
  const [rsiPeriod, setRsiPeriod] = useState(250);
  const [oversold, setOversold] = useState(50);
  const [overbought, setOverbought] = useState(55);
  const [entryTimeframe, setEntryTimeframe] = useState<Timeframe | ''>('');
  const [entryNL, setEntryNL] = useState('');
  const [entryNLResult, setEntryNLResult] = useState<ParseResult | null>(null);

  // Step 2: Exit
  const [exitGoal, setExitGoal] = useState<ExitGoal>('price_target_pct');
  const [targetPct, setTargetPct] = useState(1.5);
  const [exitNL, setExitNL] = useState('');
  const [exitNLResult, setExitNLResult] = useState<ParseResult | null>(null);

  // Step 3: Risk / sizing / tickers / mode
  const [tickers, setTickers] = useState<string[]>(['SOXL']);
  const [tickerInput, setTickerInput] = useState('');
  const [shares, setShares] = useState(100);
  const [stopLossPct, setStopLossPct] = useState(1);
  const [cooldownMinutes, setCooldownMinutes] = useState(5);
  const [mode] = useState<StrategyMode>('paper');
  const [name, setName] = useState('');

  const tryParseEntry = () => {
    setEntryNLResult(parseCondition(entryNL));
  };
  const tryParseExit = () => {
    setExitNLResult(parseCondition(exitNL));
  };

  const buildEntry = (): ConditionTree | null => {
    const tf = entryTimeframe || undefined;
    switch (entryGoal) {
      case 'rsi_cross_oversold':
        return {
          type: 'cross',
          target: { kind: 'rsi', period: rsiPeriod, ...(tf && { tf }) },
          threshold: { kind: 'literal', value: oversold },
          dir: 'below',
        };
      case 'rsi_above':
        return {
          type: 'compare',
          left: { kind: 'rsi', period: rsiPeriod, ...(tf && { tf }) },
          op: '>',
          right: { kind: 'literal', value: oversold },
        };
      case 'price_above_vwap':
        return {
          type: 'compare',
          left: { kind: 'price', ...(tf && { tf }) },
          op: '>',
          right: { kind: 'vwap', ...(tf && { tf }) },
        };
      case 'rsi_with_vwap':
        return {
          type: 'and',
          children: [
            {
              type: 'cross',
              target: { kind: 'rsi', period: rsiPeriod, ...(tf && { tf }) },
              threshold: { kind: 'literal', value: oversold },
              dir: 'below',
            },
            {
              type: 'compare',
              left: { kind: 'price', ...(tf && { tf }) },
              op: '>',
              right: { kind: 'vwap', ...(tf && { tf }) },
            },
          ],
        };
      case 'natural_language':
        return entryNLResult?.tree ?? null;
    }
  };

  const buildExit = (): ConditionTree | null => {
    switch (exitGoal) {
      case 'price_target_pct':
        return {
          type: 'compare',
          left: { kind: 'price' },
          op: '>=',
          right: { kind: 'pct_of', base: { kind: 'entry_price' }, pct: targetPct },
        };
      case 'rsi_cross_back':
        return {
          type: 'cross',
          target: { kind: 'rsi', period: rsiPeriod },
          threshold: { kind: 'literal', value: overbought },
          dir: 'above',
        };
      case 'either_target_or_rsi':
        return {
          type: 'or',
          children: [
            {
              type: 'compare',
              left: { kind: 'price' },
              op: '>=',
              right: { kind: 'pct_of', base: { kind: 'entry_price' }, pct: targetPct },
            },
            {
              type: 'cross',
              target: { kind: 'rsi', period: rsiPeriod },
              threshold: { kind: 'literal', value: overbought },
              dir: 'above',
            },
          ],
        };
      case 'time_based':
        return {
          type: 'compare',
          left: { kind: 'minutes_since_entry' },
          op: '>',
          right: { kind: 'literal', value: 30 },
        };
      case 'natural_language':
        return exitNLResult?.tree ?? null;
    }
  };

  const generatedEntry = buildEntry();
  const generatedExit = buildExit();
  const canProceed = (): boolean => {
    if (step === 1) {
      if (entryGoal === 'natural_language') return !!entryNLResult?.tree;
      return generatedEntry !== null;
    }
    if (step === 2) {
      if (exitGoal === 'natural_language') return !!exitNLResult?.tree;
      return generatedExit !== null;
    }
    if (step === 3) {
      return tickers.length > 0 && shares > 0;
    }
    return true;
  };

  const addTicker = (t: string) => {
    const upper = t.trim().toUpperCase();
    if (!upper || tickers.includes(upper)) return;
    setTickers([...tickers, upper]);
  };
  const removeTicker = (t: string) => setTickers(tickers.filter((x) => x !== t));

  const handleCreate = () => {
    const entry = buildEntry();
    const exit = buildExit();
    if (!entry || !exit) return;

    const finalName = name.trim() || autoName(entryGoal, exitGoal, tickers);
    const strategy: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'> = {
      name: finalName,
      tickers,
      enabled: false,
      mode,
      size: { kind: 'shares', n: shares },
      rsiConfig: { period: rsiPeriod, oversold, overbought },
      entry: { when: entry },
      exit: { when: exit },
      stopLoss: stopLossPct > 0 ? { pct: stopLossPct } : undefined,
      cooldownMinutes,
    };
    onCreate(strategy);
  };

  return (
    <div className="card border-accent/40">
      <div className="card-header flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-accent-light font-semibold">
            New strategy · wizard
          </div>
          <h3 className="text-base font-bold text-white tracking-tight mt-0.5">
            {step === 1 && 'How do you enter?'}
            {step === 2 && 'How do you exit?'}
            {step === 3 && 'Tickers, sizing, safety'}
            {step === 4 && 'Review'}
          </h3>
        </div>
        <button onClick={onCancel} className="btn btn-ghost text-xs">
          Cancel
        </button>
      </div>

      <div className="card-body space-y-4">
        {/* Progress */}
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className={`flex-1 h-1 rounded ${
                n <= step ? 'bg-accent-light' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Entry */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              Pick the signal that triggers a buy. Each option seeds a fully-formed
              condition tree you can edit later.
            </p>
            <GoalCards
              value={entryGoal}
              onChange={(g) => setEntryGoal(g as EntryGoal)}
              options={[
                {
                  id: 'rsi_cross_oversold',
                  title: 'RSI crosses below threshold',
                  body: `Buy when RSI(${rsiPeriod}) crosses below ${oversold}. Your live setup.`,
                },
                {
                  id: 'rsi_above',
                  title: 'RSI is above a value',
                  body: 'Continuous condition — stays true while RSI is above. Less common but useful for confirmation.',
                },
                {
                  id: 'price_above_vwap',
                  title: 'Price above VWAP',
                  body: 'Trend filter — buy only when price is above the volume-weighted average.',
                },
                {
                  id: 'rsi_with_vwap',
                  title: 'RSI cross AND price > VWAP',
                  body: 'Compound: only enter on RSI cross when also above VWAP. Reduces false signals.',
                },
                {
                  id: 'natural_language',
                  title: 'Type it in plain English',
                  body: 'Free-form text → parsed into a condition tree. Use AND/OR, indicator names, timeframes.',
                },
              ]}
            />
            {(entryGoal === 'rsi_cross_oversold' ||
              entryGoal === 'rsi_above' ||
              entryGoal === 'rsi_with_vwap') && (
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/5">
                <Field label="RSI period">
                  <input
                    type="number"
                    value={rsiPeriod}
                    onChange={(e) => setRsiPeriod(Math.max(2, Number(e.target.value)))}
                    className="input w-full text-xs py-1.5 font-mono"
                  />
                </Field>
                <Field label="Oversold">
                  <input
                    type="number"
                    value={oversold}
                    onChange={(e) => setOversold(Number(e.target.value))}
                    className="input w-full text-xs py-1.5 font-mono"
                  />
                </Field>
                <Field label="Overbought">
                  <input
                    type="number"
                    value={overbought}
                    onChange={(e) => setOverbought(Number(e.target.value))}
                    className="input w-full text-xs py-1.5 font-mono"
                  />
                </Field>
              </div>
            )}
            {entryGoal !== 'natural_language' && (
              <Field label="Timeframe (optional)">
                <select
                  value={entryTimeframe}
                  onChange={(e) => setEntryTimeframe(e.target.value as Timeframe | '')}
                  className="input text-xs py-1.5 w-32"
                >
                  <option value="">native (chart interval)</option>
                  <option value="1m">@1m</option>
                  <option value="5m">@5m</option>
                  <option value="15m">@15m</option>
                  <option value="1h">@1h</option>
                  <option value="1d">@1d</option>
                </select>
              </Field>
            )}
            {entryGoal === 'natural_language' && (
              <NLBox
                label="Describe your buy signal"
                placeholder='e.g. "rsi(250) crosses below 50 AND price > vwap"'
                value={entryNL}
                onChange={setEntryNL}
                onParse={tryParseEntry}
                result={entryNLResult}
              />
            )}
            <PreviewBox label="Generated condition" tree={generatedEntry} />
          </div>
        )}

        {/* Step 2: Exit */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              Pick how the strategy exits. Combine with your entry — these are two independent rules.
            </p>
            <GoalCards
              value={exitGoal}
              onChange={(g) => setExitGoal(g as ExitGoal)}
              options={[
                {
                  id: 'price_target_pct',
                  title: `Sell at +${targetPct}% from entry`,
                  body: 'Resting limit at the broker. Fills the moment price hits target — no engine round-trip.',
                },
                {
                  id: 'rsi_cross_back',
                  title: `Sell when RSI crosses above ${overbought}`,
                  body: 'Engine watches RSI and fires a marketable sell on the cross. Captures longer moves.',
                },
                {
                  id: 'either_target_or_rsi',
                  title: 'Either target hit OR RSI reversal',
                  body: 'Whichever fires first wins. Compound exit with OR — the safer choice in trending markets.',
                },
                {
                  id: 'time_based',
                  title: 'Sell after 30 minutes',
                  body: 'Hard time exit. Useful for scalping when you want a fixed holding window regardless.',
                },
                {
                  id: 'natural_language',
                  title: 'Type it in plain English',
                  body: 'Free-form. Useful for complex compound exits.',
                },
              ]}
            />
            {(exitGoal === 'price_target_pct' || exitGoal === 'either_target_or_rsi') && (
              <Field label="Target % from entry">
                <input
                  type="number"
                  step="0.1"
                  value={targetPct}
                  onChange={(e) => setTargetPct(Number(e.target.value))}
                  className="input text-xs py-1.5 w-24 font-mono"
                />
              </Field>
            )}
            {exitGoal === 'natural_language' && (
              <NLBox
                label="Describe your sell signal"
                placeholder='e.g. "price >= entry × 1.015 OR rsi(250) crosses above 55"'
                value={exitNL}
                onChange={setExitNL}
                onParse={tryParseExit}
                result={exitNLResult}
              />
            )}
            <PreviewBox label="Generated condition" tree={generatedExit} />
          </div>
        )}

        {/* Step 3: Risk / sizing */}
        {step === 3 && (
          <div className="space-y-3">
            <Field label="Tickers — strategy runs independently per ticker">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/5 min-h-[40px]">
                  {tickers.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/20 border border-accent/30 text-accent-light text-xs font-mono"
                    >
                      {t}
                      <button onClick={() => removeTicker(t)} className="hover:text-white">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tickerInput}
                    onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                        e.preventDefault();
                        addTicker(tickerInput);
                        setTickerInput('');
                      }
                    }}
                    placeholder={tickers.length === 0 ? 'Type ticker + Enter' : ''}
                    className="flex-1 min-w-[80px] bg-transparent border-0 text-xs font-mono text-white focus:outline-none px-1"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {COMMON_TICKERS.map((t) => {
                    const active = tickers.includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() => (active ? removeTicker(t) : addTicker(t))}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          active
                            ? 'bg-accent/20 border-accent/40 text-accent-light'
                            : 'bg-white/[0.03] border-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        {active ? '−' : '+'} {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Shares per fire">
                <input
                  type="number"
                  value={shares}
                  onChange={(e) => setShares(Math.max(1, Number(e.target.value)))}
                  className="input w-full text-xs py-1.5 font-mono"
                />
              </Field>
              <Field label="Safety stop %">
                <input
                  type="number"
                  step="0.1"
                  value={stopLossPct}
                  onChange={(e) => setStopLossPct(Number(e.target.value))}
                  className="input w-full text-xs py-1.5 font-mono"
                />
              </Field>
              <Field label="Cooldown (min)">
                <input
                  type="number"
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(Math.max(0, Number(e.target.value)))}
                  className="input w-full text-xs py-1.5 font-mono"
                />
              </Field>
            </div>
            <Field label="Strategy name (optional)">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={autoName(entryGoal, exitGoal, tickers)}
                className="input w-full text-xs py-1.5"
              />
            </Field>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Mode is set to <strong className="text-white">paper</strong> — virtual fills, no
              broker contact. You can flip to manual_confirm or auto later from the strategy
              detail view (auto requires a typed confirmation).
            </p>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Review the generated strategy before creating.</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <ReviewRow label="Name" value={name.trim() || autoName(entryGoal, exitGoal, tickers)} />
              <ReviewRow label="Tickers" value={tickers.join(', ')} />
              <ReviewRow label="Mode" value="paper (safe default)" />
              <ReviewRow label="Shares per fire" value={shares.toString()} />
              <ReviewRow label="Cooldown" value={`${cooldownMinutes} min`} />
              <ReviewRow label="Safety stop" value={stopLossPct > 0 ? `-${stopLossPct}%` : 'disabled'} />
            </div>
            <ReviewBlock label="Entry">
              {generatedEntry && (
                <span className="font-mono text-xs text-gray-300">
                  {describeCondition(generatedEntry)}
                </span>
              )}
            </ReviewBlock>
            <ReviewBlock label="Exit">
              {generatedExit && (
                <span className="font-mono text-xs text-gray-300">
                  {describeCondition(generatedExit)}
                </span>
              )}
            </ReviewBlock>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              The strategy will be created <strong className="text-white">disabled</strong> in paper
              mode. Flip the toggle in the strategies list when you're ready, or open Backtest to
              validate it on history first.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-3 border-t border-white/5">
          <button
            onClick={() => setStep(Math.max(1, (step - 1) as Step) as Step)}
            disabled={step === 1}
            className="btn btn-ghost text-sm disabled:opacity-50"
          >
            ← Back
          </button>
          <div className="text-[10px] text-gray-500 uppercase tracking-widest">
            Step {step} / 4
          </div>
          {step < 4 ? (
            <button
              onClick={() => setStep((step + 1) as Step)}
              disabled={!canProceed()}
              className="btn btn-primary text-sm disabled:opacity-50"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={!canProceed() || !generatedEntry || !generatedExit}
              className="btn btn-success text-sm disabled:opacity-50"
            >
              Create strategy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GoalCards<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; title: string; body: string }[];
}) {
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`w-full text-left p-3 rounded-lg border transition ${
            value === o.id
              ? 'border-accent/60 bg-accent/10'
              : 'border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
          }`}
        >
          <div className={`font-medium text-sm ${value === o.id ? 'text-accent-light' : 'text-white'}`}>
            {o.title}
          </div>
          <div className="text-xs text-gray-400 mt-1">{o.body}</div>
        </button>
      ))}
    </div>
  );
}

function NLBox({
  label,
  placeholder,
  value,
  onChange,
  onParse,
  result,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onParse: () => void;
  result: ParseResult | null;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onParse();
            }
          }}
          placeholder={placeholder}
          className="input flex-1 text-xs py-1.5 font-mono"
        />
        <button onClick={onParse} className="btn btn-outline text-xs">
          Parse
        </button>
      </div>
      {result && (
        <div className="mt-2 text-[11px] space-y-1">
          {result.tree ? (
            <div className="text-profit">
              ✓ Parsed: <span className="font-mono">{describeFromTree(result.tree)}</span>
            </div>
          ) : (
            <div className="text-loss">
              ✗ Could not parse. {result.errors.join(' · ')}
            </div>
          )}
          {result.unparsed.length > 0 && (
            <div className="text-neutral">
              Ignored: {result.unparsed.map((u) => `"${u}"`).join(', ')}
            </div>
          )}
        </div>
      )}
      <p className="text-[10px] text-gray-500 mt-1">
        Recognized keywords: rsi(N), ema(N), sma(N), price, vwap, volume, entry, entry_price,
        minutes_since_entry, minutes_since_open · operators: crosses below/above, &gt;, &lt;, &gt;=,
        &lt;=, == · timeframes: on 1m / 5m / 15m / 1h / 1d · combine with AND / OR.
      </p>
    </div>
  );
}

function PreviewBox({
  label,
  tree,
}: {
  label: string;
  tree: ConditionTree | null;
}) {
  return (
    <div className="rounded-lg p-3 bg-black/30 border border-white/5">
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{label}</div>
      {tree ? (
        <div className="font-mono text-xs text-gray-200">{describeFromTree(tree)}</div>
      ) : (
        <div className="text-xs text-gray-500 italic">Not yet defined</div>
      )}
    </div>
  );
}

function describeFromTree(t: ConditionTree): string {
  return describeCondition(t);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2 bg-white/[0.03] border border-white/5">
      <div className="text-[9px] uppercase tracking-widest text-gray-500">{label}</div>
      <div className="font-mono text-sm text-white mt-0.5 truncate">{value}</div>
    </div>
  );
}

function ReviewBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg p-3 bg-white/[0.03] border border-white/5">
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  );
}

function autoName(entry: EntryGoal, exit: ExitGoal, tickers: string[]): string {
  const e: Record<EntryGoal, string> = {
    rsi_cross_oversold: 'RSI cross',
    rsi_above: 'RSI above',
    price_above_vwap: 'Price > VWAP',
    rsi_with_vwap: 'RSI + VWAP',
    natural_language: 'Custom',
  };
  const x: Record<ExitGoal, string> = {
    price_target_pct: 'target',
    rsi_cross_back: 'RSI exit',
    either_target_or_rsi: 'target/RSI',
    time_based: 'time exit',
    natural_language: 'custom exit',
  };
  const tickerLabel = tickers.length === 1 ? tickers[0] : `${tickers.length} tickers`;
  return `${e[entry]} → ${x[exit]} · ${tickerLabel}`;
}
