'use client';

import { useEffect, useRef, useState } from 'react';
import { useStrategyStore, usePaperStore, useTradeStore } from '@/store';
import { explainStrategy } from '@/lib/strategy/explainer';
import { scoreStrategy } from '@/lib/strategy/signalScoring';
import { showToast } from '@/components/UI';

/**
 * Strategy Chat — conversational assistant for poking at your
 * strategies. Currently uses a deterministic local interpreter
 * that handles common questions; can be upgraded to call an LLM API
 * (OpenAI / Anthropic) once the user provides an API key in settings.
 *
 * Capabilities (deterministic):
 *   - "explain my SOXL strategy" → uses explainStrategy
 *   - "how is RSI scalp doing?" → score + win rate + recent trades
 *   - "list my strategies" → enumerates names + state
 *   - "best/worst strategy" → ranks by total paper P&L
 *   - "list trades" / "list closed trades" → recent trade summary
 *   - Anything else → falls through to "I don't understand yet" with
 *     a hint about what works.
 *
 * Future Tier 7.1 commit can replace the dispatch with an LLM call.
 */

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function StrategyChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hi — I'm your strategy assistant. Try: \"explain my RSI scalp\", \"how is my SOXL strategy doing?\", \"list my strategies\", \"best/worst strategy\". I don't have a real LLM behind me yet — once you set an OpenAI/Anthropic API key in settings, I'll get smarter.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const strategies = useStrategyStore((s) => s.strategies);
  const paperClosed = usePaperStore((s) => s.closed);
  const trades = useTradeStore((s) => s.trades);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((ms) => [...ms, userMsg]);
    setInput('');

    // Try the real LLM first (if a key is configured server-side).
    // If unconfigured / errors, fall through to the deterministic
    // local interpreter — chat keeps working with no API key needed.
    try {
      const ctx: string[] = [];
      ctx.push(`Strategies: ${strategies.map((s) => s.name).join(', ') || 'none'}`);
      ctx.push(`Open trades: ${trades.filter((t) => t.status === 'open').length}`);
      ctx.push(`Paper trades closed: ${paperClosed.length}`);
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system:
            `Trading-strategy assistant. User context:\n${ctx.join('\n')}\n` +
            `Replies under 3 sentences unless asked for detail. No specific buy/sell recommendations.`,
          messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: text },
          ],
        }),
      });
      const data = await r.json();
      if (r.ok && data.reply) {
        setMessages((ms) => [
          ...ms,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: data.reply,
            timestamp: new Date(),
          },
        ]);
        return;
      }
      throw new Error(data.error || 'no reply');
    } catch {
      const reply = handleQuestion(text);
      setMessages((ms) => [
        ...ms,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content:
            reply +
            '\n\n_(Local fallback. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env for smarter replies.)_',
          timestamp: new Date(),
        },
      ]);
    }
  };

  const handleQuestion = (q: string): string => {
    const lower = q.toLowerCase();

    // List strategies
    if (lower.match(/(list|show|what)\s+.*\b(strateg|setups?)\b/)) {
      if (strategies.length === 0) return "You don't have any strategies yet.";
      return strategies
        .map(
          (s, i) =>
            `${i + 1}. **${s.name}** — ${s.tickers.join(', ')} · ${s.mode}${s.enabled ? ' · enabled' : ' · disabled'}`
        )
        .join('\n');
    }

    // List trades
    if (lower.match(/(list|show)\s+.*\b(trades?|positions?)\b/)) {
      const open = trades.filter((t) => t.status === 'open');
      const closed = trades.filter((t) => t.status === 'closed');
      const recent = lower.includes('closed') ? closed.slice(-10) : open;
      if (recent.length === 0) {
        return lower.includes('closed') ? 'No closed trades yet.' : 'No open positions.';
      }
      return recent
        .map((t) => `${t.ticker} · ${t.totalShares} shares · avg $${t.avgCost.toFixed(2)}`)
        .join('\n');
    }

    // Best/worst strategy by paper P&L
    if (lower.includes('best') || lower.includes('worst')) {
      if (strategies.length === 0) return 'No strategies to rank.';
      const ranked = strategies
        .map((s) => {
          const pnl = paperClosed
            .filter((t) => t.strategyId === s.id)
            .reduce((sum, t) => sum + t.realizedPnL, 0);
          return { s, pnl };
        })
        .sort((a, b) => b.pnl - a.pnl);
      const target = lower.includes('worst') ? ranked[ranked.length - 1] : ranked[0];
      return `**${lower.includes('worst') ? 'Worst' : 'Best'}** — ${target.s.name}: $${target.pnl.toFixed(2)} paper P&L.`;
    }

    // Explain a specific strategy by name
    const explainMatch = lower.match(/(?:explain|describe|tell me about)\s+(?:my\s+)?(?:strategy\s+)?(.+)/);
    if (explainMatch) {
      const needle = explainMatch[1].trim();
      const found = strategies.find(
        (s) =>
          s.name.toLowerCase().includes(needle.toLowerCase()) ||
          s.tickers.some((t) => t.toLowerCase() === needle.toLowerCase())
      );
      if (!found) return `I couldn't find a strategy matching "${needle}".`;
      const exp = explainStrategy(found);
      return [
        exp.summary,
        '',
        exp.entry,
        exp.exit,
        exp.safety,
        exp.sizing,
        ...(exp.warnings.length > 0 ? ['', `⚠ Warnings:`, ...exp.warnings.map((w) => `- ${w}`)] : []),
      ].join('\n');
    }

    // How is X doing?
    const performMatch = lower.match(/how(?:'s| is)?\s+(?:my\s+)?(.+?)(?:\s+doing)?(?:\?|$)/);
    if (performMatch) {
      const needle = performMatch[1].trim();
      const found = strategies.find(
        (s) =>
          s.name.toLowerCase().includes(needle.toLowerCase()) ||
          s.tickers.some((t) => t.toLowerCase() === needle.toLowerCase())
      );
      if (found) {
        const score = scoreStrategy(found, paperClosed);
        return [
          `**${found.name}** — score ${score.score.toFixed(0)}/100 (${score.reliable ? 'reliable' : 'low confidence'})`,
          score.description,
          `Trades: ${score.trades} (${score.recentTrades} in last 30d)`,
        ].join('\n');
      }
    }

    // Help
    if (lower.match(/help|what can you do|capabilities/)) {
      return 'I can: list your strategies, explain a strategy, tell you which is best/worst, list trades. Try: "explain RSI scalp" or "how is my SOXL strategy doing?"';
    }

    return `I don't understand "${q}" yet. Try: "list strategies", "explain <name>", "best strategy", "how is <name> doing?". Set an LLM API key in settings to get a smarter assistant (coming soon).`;
  };

  const clear = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Cleared. What would you like to know?',
        timestamp: new Date(),
      },
    ]);
    showToast('Chat cleared');
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-30 lg:bottom-4 glass-strong rounded-full p-3 shadow-glow hover:scale-105 transition border border-accent/30"
        title="Strategy assistant"
      >
        <svg className="w-5 h-5 text-accent-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-30 w-[min(400px,calc(100vw-2rem))] max-h-[70vh] glass-strong rounded-xl border border-accent/30 shadow-glow flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3 className="text-sm font-medium text-white">Strategy assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clear} className="text-[10px] text-gray-500 hover:text-white">Clear</button>
          <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div ref={messagesRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px]">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`text-xs whitespace-pre-wrap ${
              m.role === 'user' ? 'text-right' : 'text-left'
            }`}
          >
            <div
              className={`inline-block max-w-[85%] px-2.5 py-1.5 rounded-lg ${
                m.role === 'user'
                  ? 'bg-accent/20 border border-accent/40 text-white'
                  : 'bg-white/[0.04] border border-white/10 text-gray-200'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-white/10 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask about your strategies..."
          className="flex-1 input text-xs py-1.5"
        />
        <button onClick={send} disabled={!input.trim()} className="btn btn-primary text-xs disabled:opacity-40">
          Send
        </button>
      </div>
    </div>
  );
}
