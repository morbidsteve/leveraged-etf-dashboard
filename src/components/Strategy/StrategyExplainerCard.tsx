'use client';

import { useMemo, useState } from 'react';
import { Strategy } from '@/types/strategy';
import { explainStrategy } from '@/lib/strategy/explainer';

/**
 * Plain-English explanation card for a single strategy. Lives inside
 * StrategyDetail so users can quickly grok what a complex condition
 * tree actually does.
 *
 * Deterministic — no LLM. Computed from the structure with describe-
 * style helpers. Future Tier 7 commit can layer an LLM-generated
 * narrative on top.
 */
export default function StrategyExplainerCard({ strategy }: { strategy: Strategy }) {
  const [expanded, setExpanded] = useState(false);
  const explanation = useMemo(() => explainStrategy(strategy), [strategy]);

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-widest text-accent-light font-bold">
          What this does (plain English)
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-white shrink-0"
        >
          {expanded ? 'Less' : 'More'}
        </button>
      </div>

      <p className="text-sm text-white leading-relaxed">{explanation.summary}</p>

      {expanded && (
        <div className="space-y-2 pt-2 border-t border-white/5">
          <ExplainRow label="Entry" body={explanation.entry} />
          <ExplainRow label="Exit" body={explanation.exit} />
          <ExplainRow label="Safety" body={explanation.safety} />
          <ExplainRow label="Sizing" body={explanation.sizing} />
          <ExplainRow label="Scope" body={explanation.scope} />

          {explanation.warnings.length > 0 && (
            <div className="rounded-md border border-amber-400/30 bg-amber-500/5 p-2 space-y-1">
              <div className="text-[9px] uppercase tracking-widest text-amber-300 font-bold">
                ⚠ Warnings
              </div>
              {explanation.warnings.map((w, i) => (
                <div key={i} className="text-[11px] text-amber-100/90 leading-relaxed">
                  {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExplainRow({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-0.5">{label}</div>
      <p className="text-[11px] text-gray-200 leading-relaxed">{body}</p>
    </div>
  );
}
