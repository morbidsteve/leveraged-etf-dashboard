'use client';

import { useEffect, useRef, useState } from 'react';
import { useSettingsStore, useTradeStore, usePriceStore } from '@/store';
import { showToast } from '@/components/UI/Toast';

/**
 * Push-to-talk voice command button. Hold to listen, release to
 * interpret. NEVER always-listening — privacy first.
 *
 * Recognized intents (rule-based, no LLM round-trip):
 *   "show <ticker>"            → switch the dashboard's selected ticker
 *   "kill switch [on|off]"     → toggle / set the master kill switch
 *   "what's open"              → speak open positions count + total P&L
 *   "what's [ticker]"          → speak last price + RSI status
 *   "buy <N> <ticker>"         → opens the new-trade flow with prefill
 *   "go to journal|replay|compare|settings"
 *
 * Uses the standard Web Speech API. Silent fallback when unsupported
 * (Safari + older Firefox).
 */
type RecState = 'idle' | 'listening' | 'processing';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionLike = any;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionLike;
    webkitSpeechRecognition?: SpeechRecognitionLike;
  }
}

export default function VoiceCommandButton({
  onSelectTicker,
}: {
  onSelectTicker: (t: string) => void;
}) {
  const [state, setState] = useState<RecState>('idle');
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike>(null);

  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const trades = useTradeStore((s) => s.trades);
  const prices = usePriceStore((s) => s.prices);
  const rsiData = usePriceStore((s) => s.rsiData);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const Cls = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Cls) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const r = new Cls();
    r.lang = 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;
    r.onresult = (ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => {
      const transcript = ev.results[0]?.[0]?.transcript ?? '';
      if (transcript) {
        setState('processing');
        interpret(transcript);
      }
      setState('idle');
    };
    r.onerror = () => setState('idle');
    r.onend = () => {
      setState((s) => (s === 'listening' ? 'idle' : s));
    };
    recRef.current = r;
    return () => {
      try {
        r.abort();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const interpret = (raw: string) => {
    const text = raw.toLowerCase().trim();
    showToast(`🎤 "${raw}"`, 'info', 2500);

    // kill switch on/off
    if (/kill\s+switch\s*(on|engage|engaged|activate)?\b/.test(text) && !/(off|disable|cancel)/.test(text)) {
      updateSettings({ killSwitch: true });
      showToast('🚫 Kill switch ON', 'error', 3000);
      return;
    }
    if (/kill\s+switch\s*(off|disable|cancel|deactivate)/.test(text)) {
      updateSettings({ killSwitch: false });
      showToast('● Kill switch OFF', 'success', 3000);
      return;
    }

    // navigation
    const navMatch = text.match(/(?:go to|open|show)\s+(journal|replay|compare|settings|watch|dashboard)/);
    if (navMatch) {
      const dest = navMatch[1];
      const path = dest === 'dashboard' ? '/' : `/${dest}`;
      window.location.href = path;
      return;
    }

    // what's open
    if (/what(?:'s| is)\s+open/.test(text) || /open positions/.test(text)) {
      const open = trades.filter((t) => t.status === 'open');
      const total = open.reduce(
        (s, t) => s + (prices[t.ticker]?.price ?? t.avgCost) * t.totalShares,
        0
      );
      const tickers = open.map((t) => t.ticker).join(', ') || 'no open positions';
      speak(`${open.length} open. ${tickers}. Total exposure ${dollarsToWords(total)}.`);
      return;
    }

    // what's <ticker>
    const whatMatch = text.match(/(?:what(?:'s| is))\s+([a-z]{1,5})\b/);
    if (whatMatch) {
      const t = whatMatch[1].toUpperCase();
      const p = prices[t];
      const r = rsiData[t];
      if (!p) {
        speak(`No data for ${spell(t)}.`);
        return;
      }
      const status = r?.status ?? 'neutral';
      const verdict = status === 'buy' ? 'buy signal' : status === 'sell' ? 'sell signal' : 'no signal';
      speak(`${spell(t)} at ${p.price.toFixed(2)}. ${verdict}.`);
      return;
    }

    // show <ticker>
    const showMatch = text.match(/(?:show|switch to|select)\s+([a-z]{1,5})\b/);
    if (showMatch) {
      const t = showMatch[1].toUpperCase();
      onSelectTicker(t);
      showToast(`Switched to ${t}`, 'info', 2000);
      return;
    }

    // buy N <ticker>
    const buyMatch = text.match(/buy\s+(\d+)\s+([a-z]{1,5})\b/);
    if (buyMatch) {
      const n = Number(buyMatch[1]);
      const t = buyMatch[2].toUpperCase();
      // Open new-trade flow with prefill via query string
      window.location.href = `/trades/new?ticker=${t}&shares=${n}`;
      return;
    }

    showToast(`Couldn't parse: "${raw}"`, 'error', 4000);
  };

  const start = () => {
    if (!recRef.current || state !== 'idle') return;
    try {
      recRef.current.start();
      setState('listening');
    } catch {
      // ignore "already started" errors from rapid press
    }
  };
  const stop = () => {
    if (!recRef.current) return;
    try {
      recRef.current.stop();
    } catch {
      // ignore
    }
  };

  if (!supported) return null;

  const tone =
    state === 'listening'
      ? 'bg-loss/30 border-loss/60 text-loss'
      : state === 'processing'
      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
      : 'bg-white/[0.03] border-white/15 text-gray-400 hover:text-white';

  return (
    <button
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border min-h-[32px] flex items-center gap-1.5 transition-colors ${tone}`}
      title='Hold to talk. Try "show SOXL", "what&apos;s open", "kill switch on", "go to journal"'
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${state === 'listening' ? 'bg-loss animate-pulse' : 'bg-gray-400'}`} />
      🎤 {state === 'listening' ? 'Listening…' : state === 'processing' ? '…' : 'Voice'}
    </button>
  );
}

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

function spell(ticker: string): string {
  // Speak common leveraged-ETF tickers as letters; otherwise words
  const known: Record<string, string> = {
    SOXL: 'sox L',
    SOXS: 'sox S',
    TQQQ: 'T cubed',
    SQQQ: 'S cubed',
    UPRO: 'oo pro',
    SPXU: 'S P X U',
    TNA: 'T N A',
    TZA: 'T Z A',
  };
  return known[ticker] ?? ticker.split('').join(' ');
}

function dollarsToWords(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} million dollars`;
  if (abs >= 1_000) return `${(n / 1000).toFixed(1)} thousand dollars`;
  return `${n.toFixed(0)} dollars`;
}
