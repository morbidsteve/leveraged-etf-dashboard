'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAlertRuleStore, AlertRule, AlertRuleFire } from '@/store';
import { parseCondition } from '@/lib/strategy/nlparser';
import { describeCondition } from '@/lib/strategy/conditions';
import { ConditionTree } from '@/types/strategy';
import { format } from 'date-fns';

/**
 * Custom alert rules — user-defined ConditionTree alerts decoupled from
 * strategies. Useful for "ping me when X happens on any of these tickers"
 * without composing a full strategy with sizing, mode, exit, etc.
 *
 * Lives at the top of the AlertsPanel drawer. Each rule has channels
 * (sound / toast / browser notif) and a per-ticker cooldown.
 */
export default function CustomAlertRulesPanel() {
  const rules = useAlertRuleStore((s) => s.rules);
  const fires = useAlertRuleStore((s) => s.fires);
  const addRule = useAlertRuleStore((s) => s.addRule);
  const updateRule = useAlertRuleStore((s) => s.updateRule);
  const deleteRule = useAlertRuleStore((s) => s.deleteRule);
  const acknowledgeFire = useAlertRuleStore((s) => s.acknowledgeFire);
  const clearFires = useAlertRuleStore((s) => s.clearFires);

  const [showNew, setShowNew] = useState(false);

  const recentFires = useMemo(
    () =>
      [...fires]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, 20),
    [fires]
  );

  // Listen for toast-channel fires and surface them as a transient overlay
  const [toast, setToast] = useState<{ ticker: string; ruleName: string; message: string } | null>(
    null
  );
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ ticker: string; ruleName: string; message: string }>;
      setToast(ev.detail);
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    };
    window.addEventListener('etf-alert-rule-fired', handler);
    return () => window.removeEventListener('etf-alert-rule-fired', handler);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-white tracking-tight">Custom alert rules</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Decoupled from strategies. Fires per-channel notifications when
            their condition evaluates true.
          </p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="btn btn-primary text-xs">
          {showNew ? 'Cancel' : '+ New rule'}
        </button>
      </div>

      {showNew && (
        <NewRuleForm
          onCreate={(input) => {
            addRule(input);
            setShowNew(false);
          }}
        />
      )}

      {rules.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-6 text-gray-500 text-xs">
            No custom alert rules yet. Create one to get pinged on a specific
            event without setting up a full strategy.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <RuleRow
              key={r.id}
              rule={r}
              onToggle={(v) => updateRule(r.id, { enabled: v })}
              onDelete={() => {
                if (confirm(`Delete alert rule "${r.name}"?`)) deleteRule(r.id);
              }}
              onChannelToggle={(channel) =>
                updateRule(r.id, {
                  channels: { ...r.channels, [channel]: !r.channels[channel] },
                })
              }
            />
          ))}
        </div>
      )}

      {/* Recent fires */}
      <div className="pt-2 border-t border-white/5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] uppercase tracking-widest text-gray-500">
            Recent fires ({recentFires.length})
          </h4>
          {fires.length > 0 && (
            <button onClick={clearFires} className="text-[10px] uppercase text-gray-500 hover:text-white">
              Clear
            </button>
          )}
        </div>
        {recentFires.length === 0 ? (
          <div className="text-xs text-gray-600 italic">No fires yet</div>
        ) : (
          <div className="space-y-1 font-mono text-[11px] max-h-48 overflow-y-auto">
            {recentFires.map((f) => (
              <FireRow key={f.id} fire={f} onAck={() => acknowledgeFire(f.id)} />
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-accent/20 backdrop-blur-md border border-accent/40 rounded-lg p-3 max-w-sm shadow-2xl animate-fade-in">
          <div className="text-[10px] uppercase tracking-widest text-accent-light font-bold">
            {toast.ruleName} · {toast.ticker}
          </div>
          <div className="text-xs text-white mt-1 font-mono">{toast.message}</div>
        </div>
      )}
    </div>
  );
}

// ── New rule form ────────────────────────────────────────────────────────

const COMMON_TICKERS = ['SOXL', 'TQQQ', 'SOXS', 'SQQQ', 'UPRO', 'TNA', 'LABU', 'TECL'];

function NewRuleForm({
  onCreate,
}: {
  onCreate: (input: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt' | 'lastFiredAt'>) => void;
}) {
  const [name, setName] = useState('');
  const [tickers, setTickers] = useState<string[]>(['SOXL']);
  const [tickerInput, setTickerInput] = useState('');
  const [conditionText, setConditionText] = useState('rsi(250) crosses below 50');
  const [tree, setTree] = useState<ConditionTree | null>(null);
  const [parseError, setParseError] = useState<string>('');
  const [cooldown, setCooldown] = useState(5);
  const [sound, setSound] = useState(true);
  const [toast, setToast] = useState(true);
  const [browserNotif, setBrowserNotif] = useState(false);

  const tryParse = () => {
    const result = parseCondition(conditionText);
    if (result.tree) {
      setTree(result.tree);
      setParseError('');
    } else {
      setTree(null);
      setParseError(result.errors.join(' · ') || 'Could not parse');
    }
  };

  const addTicker = (t: string) => {
    const upper = t.trim().toUpperCase();
    if (!upper || tickers.includes(upper)) return;
    setTickers([...tickers, upper]);
  };
  const removeTicker = (t: string) => setTickers(tickers.filter((x) => x !== t));

  const canCreate = name.trim() && tickers.length > 0 && tree !== null;

  const handleCreate = () => {
    if (!canCreate || !tree) return;
    onCreate({
      name: name.trim(),
      tickers,
      condition: tree,
      enabled: true,
      channels: { sound, toast, browserNotif },
      cooldownMinutes: cooldown,
    });
  };

  return (
    <div className="card border-accent/40">
      <div className="card-body space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. RSI dip on semis"
              className="input w-full text-xs py-1.5"
            />
          </Field>
          <Field label="Cooldown (minutes)">
            <input
              type="number"
              min={0}
              value={cooldown}
              onChange={(e) => setCooldown(Math.max(0, Number(e.target.value)))}
              className="input w-full text-xs py-1.5 font-mono"
            />
          </Field>
        </div>

        <Field label="Tickers">
          <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/5 min-h-[40px]">
            {tickers.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/20 border border-accent/30 text-accent-light text-xs font-mono"
              >
                {t}
                <button onClick={() => removeTicker(t)} className="hover:text-white">
                  ×
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
                } else if (e.key === 'Backspace' && tickerInput === '' && tickers.length > 0) {
                  removeTicker(tickers[tickers.length - 1]);
                }
              }}
              placeholder={tickers.length === 0 ? 'Type ticker + Enter' : ''}
              className="flex-1 min-w-[80px] bg-transparent border-0 text-xs font-mono text-white focus:outline-none px-1"
            />
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
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
        </Field>

        <Field label="Condition (plain English)">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={conditionText}
              onChange={(e) => setConditionText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  tryParse();
                }
              }}
              className="input flex-1 text-xs py-1.5 font-mono"
              placeholder='e.g. "rsi(250) crosses below 50 AND price > vwap"'
            />
            <button onClick={tryParse} className="btn btn-outline text-xs">
              Parse
            </button>
          </div>
          {tree && (
            <div className="text-[11px] text-profit mt-1.5 font-mono">
              ✓ {describeCondition(tree)}
            </div>
          )}
          {parseError && (
            <div className="text-[11px] text-loss mt-1.5">✗ {parseError}</div>
          )}
        </Field>

        <Field label="Notification channels">
          <div className="flex flex-wrap gap-3 text-xs">
            <Checkbox label="Sound" checked={sound} onChange={setSound} />
            <Checkbox label="Toast" checked={toast} onChange={setToast} />
            <Checkbox
              label="Browser notification"
              checked={browserNotif}
              onChange={setBrowserNotif}
            />
          </div>
        </Field>

        <div className="flex justify-end pt-1">
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="btn btn-primary text-sm disabled:opacity-40"
          >
            Create alert rule
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Existing rule row ────────────────────────────────────────────────────

function RuleRow({
  rule,
  onToggle,
  onDelete,
  onChannelToggle,
}: {
  rule: AlertRule;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
  onChannelToggle: (ch: 'sound' | 'toast' | 'browserNotif') => void;
}) {
  return (
    <div className="card">
      <div className="card-body space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Toggle on={rule.enabled} onChange={onToggle} />
            <div className="min-w-0">
              <div className="font-medium text-white text-sm tracking-tight truncate">
                {rule.name}
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5 truncate">
                {rule.tickers.join(', ')} · cooldown {rule.cooldownMinutes}m
              </div>
              <div className="font-mono text-[11px] text-gray-300 mt-1 break-words">
                {describeCondition(rule.condition)}
              </div>
            </div>
          </div>
          <button
            onClick={onDelete}
            className="text-[10px] uppercase tracking-widest text-loss hover:text-loss-light shrink-0"
          >
            Delete
          </button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
          <ChannelChip
            label="Sound"
            on={rule.channels.sound}
            onClick={() => onChannelToggle('sound')}
          />
          <ChannelChip
            label="Toast"
            on={rule.channels.toast}
            onClick={() => onChannelToggle('toast')}
          />
          <ChannelChip
            label="Browser notif"
            on={rule.channels.browserNotif}
            onClick={() => onChannelToggle('browserNotif')}
          />
        </div>
      </div>
    </div>
  );
}

function ChannelChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded border transition ${
        on
          ? 'bg-accent/15 border-accent/40 text-accent-light'
          : 'bg-white/[0.03] border-white/10 text-gray-500 hover:text-white'
      }`}
    >
      {on ? '✓' : '○'} {label}
    </button>
  );
}

function FireRow({ fire, onAck }: { fire: AlertRuleFire; onAck: () => void }) {
  return (
    <div
      className={`flex items-start gap-2 p-1.5 rounded ${
        fire.acknowledged ? 'opacity-40' : 'bg-white/[0.02]'
      }`}
    >
      <span className="text-gray-600 shrink-0">
        {format(new Date(fire.timestamp), 'HH:mm:ss')}
      </span>
      <span className="text-accent-light shrink-0 font-bold">{fire.ticker}</span>
      <span className="text-gray-300 truncate">{fire.detail}</span>
      <span className="text-gray-500 shrink-0 ml-auto">{fire.ruleName}</span>
      {!fire.acknowledged && (
        <button
          onClick={onAck}
          className="text-gray-500 hover:text-white shrink-0 text-[10px]"
        >
          ack
        </button>
      )}
    </div>
  );
}

// ── Tiny shared form helpers ─────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-gray-500 block mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`mt-1 relative w-9 h-5 rounded-full transition-colors shrink-0 ${
        on ? 'bg-profit' : 'bg-white/10'
      }`}
      type="button"
    >
      <div
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
          on ? 'left-4' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded"
      />
      <span className="text-gray-300">{label}</span>
    </label>
  );
}
