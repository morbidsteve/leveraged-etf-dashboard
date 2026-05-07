'use client';

/**
 * Web Audio synthesized alert tones — no asset files needed.
 * Buy = ascending two-note chime; Sell = descending; Generic = single bell.
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

function playTone(frequency: number, durationMs: number, startOffsetMs: number = 0, volume: number = 0.15) {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === 'suspended') {
    audio.resume().catch(() => {});
  }

  const t0 = audio.currentTime + startOffsetMs / 1000;
  const t1 = t0 + durationMs / 1000;

  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(gain).connect(audio.destination);
  osc.start(t0);
  osc.stop(t1 + 0.05);
}

export function playBuyTone() {
  // C5 → E5: ascending, friendly
  playTone(523.25, 180);
  playTone(659.25, 220, 160);
}

export function playSellTone() {
  // E5 → C5: descending, warning
  playTone(659.25, 180);
  playTone(523.25, 220, 160);
}

export function playGenericTone() {
  playTone(880, 220);
}
