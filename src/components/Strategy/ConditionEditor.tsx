'use client';

import {
  ConditionTree,
  ValueRef,
  CompareOp,
  CompareLeaf,
  CrossLeaf,
  AndNode,
  OrNode,
  Timeframe,
} from '@/types/strategy';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '1d'];
const TF_SUPPORTED_KINDS = new Set([
  'price',
  'rsi',
  'ema',
  'sma',
  'vwap',
  'volume',
]);

/** Where a condition lives — entry conditions can't reference entry_price. */
export type ConditionContext = 'entry' | 'exit' | 'stop';

interface Props {
  value: ConditionTree;
  onChange: (next: ConditionTree) => void;
  context: ConditionContext;
  /** depth limits nesting visually; root is 0 */
  depth?: number;
}

/**
 * Recursive condition tree editor. Supports compare and cross leaves plus
 * AND/OR groups. Designed to be embedded in StrategyDetail for inline edits
 * and in the new-strategy "Custom" template flow.
 */
export default function ConditionEditor({ value, onChange, context, depth = 0 }: Props) {
  if (value.type === 'and' || value.type === 'or') {
    return <GroupEditor value={value} onChange={onChange} context={context} depth={depth} />;
  }
  if (value.type === 'compare') {
    return <CompareEditor value={value} onChange={onChange} context={context} />;
  }
  if (value.type === 'cross') {
    return <CrossEditor value={value} onChange={onChange} context={context} />;
  }
  if (value.type === 'time_window') {
    return (
      <div className="text-xs text-gray-400 italic px-2 py-1">
        time window {value.start} → {value.end}
      </div>
    );
  }
  // NOT node — render read-only for MVP; not exposed by the builder yet.
  return (
    <div className="text-xs text-gray-400 italic px-2 py-1">
      NOT (...) — not editable in this UI yet
    </div>
  );
}

// ── Group (AND/OR) ───────────────────────────────────────────────────────

function GroupEditor({
  value,
  onChange,
  context,
  depth,
}: {
  value: AndNode | OrNode;
  onChange: (next: ConditionTree) => void;
  context: ConditionContext;
  depth: number;
}) {
  const setKind = (kind: 'and' | 'or') => {
    if (kind === value.type) return;
    onChange({ ...value, type: kind } as AndNode | OrNode);
  };

  const updateChild = (idx: number, child: ConditionTree) => {
    const next = [...value.children];
    next[idx] = child;
    onChange({ ...value, children: next });
  };

  const removeChild = (idx: number) => {
    const next = value.children.filter((_, i) => i !== idx);
    if (next.length === 1) {
      // collapse single-child group into the child itself
      onChange(next[0]);
    } else {
      onChange({ ...value, children: next });
    }
  };

  const addChild = (kind: 'compare' | 'cross') => {
    onChange({
      ...value,
      children: [...value.children, defaultLeaf(kind)],
    });
  };

  const wrapInGroup = (idx: number, groupKind: 'and' | 'or') => {
    const child = value.children[idx];
    const wrapped: AndNode | OrNode = {
      type: groupKind,
      children: [child, defaultLeaf('compare')],
    };
    updateChild(idx, wrapped);
  };

  const accent = value.type === 'and' ? 'border-accent/40' : 'border-neutral/40';

  return (
    <div className={`rounded-lg border ${accent} p-2 space-y-2 bg-white/[0.02]`} style={{ marginLeft: depth > 0 ? 0 : 0 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest">
          <span className="text-gray-500">Match</span>
          <button
            onClick={() => setKind('and')}
            className={`px-2 py-0.5 rounded ${
              value.type === 'and' ? 'bg-accent/20 text-accent-light' : 'text-gray-400 hover:text-white'
            }`}
          >
            All
          </button>
          <span className="text-gray-700">/</span>
          <button
            onClick={() => setKind('or')}
            className={`px-2 py-0.5 rounded ${
              value.type === 'or' ? 'bg-neutral/20 text-neutral' : 'text-gray-400 hover:text-white'
            }`}
          >
            Any
          </button>
          <span className="text-gray-500">of:</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {value.children.map((child, idx) => (
          <div key={idx} className="flex items-start gap-1.5">
            <div className="flex-1 min-w-0">
              <ConditionEditor
                value={child}
                onChange={(c) => updateChild(idx, c)}
                context={context}
                depth={depth + 1}
              />
            </div>
            <div className="flex flex-col gap-1 shrink-0 mt-0.5">
              {child.type !== 'and' && child.type !== 'or' && depth < 2 && (
                <button
                  onClick={() => wrapInGroup(idx, value.type === 'and' ? 'or' : 'and')}
                  className="text-[9px] text-gray-500 hover:text-white px-1.5 py-0.5 rounded border border-white/5 uppercase tracking-wide"
                  title={`Wrap in ${value.type === 'and' ? 'OR' : 'AND'}`}
                >
                  {value.type === 'and' ? '+OR' : '+AND'}
                </button>
              )}
              {value.children.length > 1 && (
                <button
                  onClick={() => removeChild(idx)}
                  className="text-[9px] text-gray-600 hover:text-loss px-1.5 py-0.5"
                  title="Remove condition"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 pt-1 border-t border-white/5">
        <button
          onClick={() => addChild('compare')}
          className="text-[10px] uppercase tracking-wider px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-white/5"
        >
          + Compare
        </button>
        <button
          onClick={() => addChild('cross')}
          className="text-[10px] uppercase tracking-wider px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-white/5"
        >
          + Cross
        </button>
      </div>
    </div>
  );
}

// ── Compare leaf ─────────────────────────────────────────────────────────

const COMPARE_OPS: CompareOp[] = ['>', '<', '>=', '<=', '==', '!='];

function CompareEditor({
  value,
  onChange,
  context,
}: {
  value: CompareLeaf;
  onChange: (next: ConditionTree) => void;
  context: ConditionContext;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap p-1.5 rounded bg-white/[0.02] border border-white/5">
      <ValueRefEditor
        value={value.left}
        onChange={(v) => onChange({ ...value, left: v })}
        context={context}
      />
      <select
        value={value.op}
        onChange={(e) => onChange({ ...value, op: e.target.value as CompareOp })}
        className="bg-white/[0.06] border border-white/10 rounded px-2 py-1 text-xs font-mono text-white"
      >
        {COMPARE_OPS.map((op) => (
          <option key={op} value={op}>{op}</option>
        ))}
      </select>
      <ValueRefEditor
        value={value.right}
        onChange={(v) => onChange({ ...value, right: v })}
        context={context}
      />
    </div>
  );
}

// ── Cross leaf ───────────────────────────────────────────────────────────

function CrossEditor({
  value,
  onChange,
  context,
}: {
  value: CrossLeaf;
  onChange: (next: ConditionTree) => void;
  context: ConditionContext;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap p-1.5 rounded bg-white/[0.02] border border-white/5">
      <ValueRefEditor
        value={value.target}
        onChange={(v) => onChange({ ...value, target: v })}
        context={context}
      />
      <select
        value={value.dir}
        onChange={(e) => onChange({ ...value, dir: e.target.value as 'above' | 'below' })}
        className="bg-white/[0.06] border border-white/10 rounded px-2 py-1 text-xs font-mono text-white"
      >
        <option value="below">crosses below</option>
        <option value="above">crosses above</option>
      </select>
      <ValueRefEditor
        value={value.threshold}
        onChange={(v) => onChange({ ...value, threshold: v })}
        context={context}
      />
    </div>
  );
}

// ── ValueRef editor ──────────────────────────────────────────────────────

const VALUE_KINDS_ALL: { kind: ValueRef['kind']; label: string; entryOnly?: boolean }[] = [
  { kind: 'literal', label: 'number' },
  { kind: 'price', label: 'price' },
  { kind: 'rsi', label: 'rsi(n)' },
  { kind: 'ema', label: 'ema(n)' },
  { kind: 'sma', label: 'sma(n)' },
  { kind: 'vwap', label: 'vwap' },
  { kind: 'volume', label: 'volume' },
  { kind: 'minutes_since_open', label: 'mins since open' },
  { kind: 'entry_price', label: 'entry_price', entryOnly: false }, // tag below — only valid in exit/stop
  { kind: 'minutes_since_entry', label: 'mins since entry', entryOnly: false },
  { kind: 'pct_of', label: 'pct_of(...)' },
];

function ValueRefEditor({
  value,
  onChange,
  context,
}: {
  value: ValueRef;
  onChange: (v: ValueRef) => void;
  context: ConditionContext;
}) {
  const kinds = VALUE_KINDS_ALL.filter((k) => {
    if (context === 'entry' && (k.kind === 'entry_price' || k.kind === 'minutes_since_entry')) {
      return false;
    }
    return true;
  });

  const handleKindChange = (kind: ValueRef['kind']) => {
    onChange(defaultValueRef(kind));
  };

  return (
    <div className="inline-flex items-center gap-1 rounded bg-white/[0.04] border border-white/5 px-1.5 py-1">
      <select
        value={value.kind}
        onChange={(e) => handleKindChange(e.target.value as ValueRef['kind'])}
        className="bg-transparent border-0 text-xs font-mono text-white focus:outline-none cursor-pointer"
      >
        {kinds.map((k) => (
          <option key={k.kind} value={k.kind} className="bg-ink-surface">
            {k.label}
          </option>
        ))}
      </select>

      {value.kind === 'literal' && (
        <input
          type="number"
          step="any"
          value={value.value}
          onChange={(e) => onChange({ kind: 'literal', value: Number(e.target.value) })}
          className="w-16 bg-white/[0.05] border border-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-white"
        />
      )}

      {(value.kind === 'rsi' || value.kind === 'ema' || value.kind === 'sma') && (
        <>
          <span className="text-gray-500 text-[10px]">period</span>
          <input
            type="number"
            min={1}
            value={value.period}
            onChange={(e) =>
              onChange({ ...value, period: Math.max(1, Number(e.target.value)) })
            }
            className="w-14 bg-white/[0.05] border border-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-white"
          />
        </>
      )}

      {/* Timeframe picker — only for kinds that support it */}
      {TF_SUPPORTED_KINDS.has(value.kind) && (
        <TfPicker
          value={(value as { tf?: Timeframe }).tf}
          onChange={(tf) => onChange({ ...value, tf } as ValueRef)}
        />
      )}

      {value.kind === 'pct_of' && (
        <PctOfEditor value={value} onChange={onChange} context={context} />
      )}
    </div>
  );
}

function TfPicker({
  value,
  onChange,
}: {
  value: Timeframe | undefined;
  onChange: (tf: Timeframe | undefined) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v ? (v as Timeframe) : undefined);
      }}
      className="bg-white/[0.05] border border-white/10 rounded px-1.5 py-0.5 text-[10px] font-mono text-gray-300 cursor-pointer"
      title="Timeframe — leave blank to use the strategy's main chart interval"
    >
      <option value="" className="bg-ink-surface">native</option>
      {TIMEFRAMES.map((tf) => (
        <option key={tf} value={tf} className="bg-ink-surface">
          @{tf}
        </option>
      ))}
    </select>
  );
}

function PctOfEditor({
  value,
  onChange,
  context,
}: {
  value: Extract<ValueRef, { kind: 'pct_of' }>;
  onChange: (v: ValueRef) => void;
  context: ConditionContext;
}) {
  return (
    <div className="inline-flex items-center gap-1 ml-1">
      <span className="text-gray-500 text-[10px]">of</span>
      <ValueRefEditor
        value={value.base}
        onChange={(b) => onChange({ ...value, base: b })}
        context={context}
      />
      <span className="text-gray-500 text-[10px]">×</span>
      <span className="text-gray-400 text-[10px]">(1 +</span>
      <input
        type="number"
        step="0.1"
        value={value.pct}
        onChange={(e) => onChange({ ...value, pct: Number(e.target.value) })}
        className="w-14 bg-white/[0.05] border border-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-white"
      />
      <span className="text-gray-400 text-[10px]">%)</span>
    </div>
  );
}

// ── Defaults ─────────────────────────────────────────────────────────────

export function defaultLeaf(kind: 'compare' | 'cross'): ConditionTree {
  if (kind === 'cross') {
    return {
      type: 'cross',
      target: { kind: 'rsi', period: 250 },
      threshold: { kind: 'literal', value: 50 },
      dir: 'below',
    };
  }
  return {
    type: 'compare',
    left: { kind: 'price' },
    op: '>=',
    right: { kind: 'literal', value: 0 },
  };
}

function defaultValueRef(kind: ValueRef['kind']): ValueRef {
  switch (kind) {
    case 'literal': return { kind: 'literal', value: 0 };
    case 'price': return { kind: 'price' };
    case 'rsi': return { kind: 'rsi', period: 250 };
    case 'ema': return { kind: 'ema', period: 20 };
    case 'sma': return { kind: 'sma', period: 20 };
    case 'vwap': return { kind: 'vwap' };
    case 'volume': return { kind: 'volume' };
    case 'minutes_since_open': return { kind: 'minutes_since_open' };
    case 'entry_price': return { kind: 'entry_price' };
    case 'minutes_since_entry': return { kind: 'minutes_since_entry' };
    case 'pct_of':
      return { kind: 'pct_of', base: { kind: 'entry_price' }, pct: 1.5 };
  }
}

/**
 * Sensible blank starting strategy for the "Custom" template — the user's
 * RSI cross + 1.5% target setup, easy to edit from there.
 */
export function blankCustomStrategy() {
  const entry: ConditionTree = {
    type: 'cross',
    target: { kind: 'rsi', period: 250 },
    threshold: { kind: 'literal', value: 50 },
    dir: 'below',
  };
  const exit: ConditionTree = {
    type: 'compare',
    left: { kind: 'price' },
    op: '>=',
    right: { kind: 'pct_of', base: { kind: 'entry_price' }, pct: 1.5 },
  };
  return { entry, exit };
}
