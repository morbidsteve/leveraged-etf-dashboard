import {
  OptionChain,
  OptionContract,
  OptionExpiration,
} from '@/types/options';

/**
 * Client-safe option-chain helpers. No server imports — these can run in
 * either the browser or a server route. The Schwab-specific I/O lives in
 * @/lib/schwab/options which pulls in oauth/fs and is server-only.
 */

/**
 * Find the contract closest to a target delta within a chain. Used by the
 * strategy → contract resolver in Sprint O8.
 *
 * `targetDelta` should be signed appropriately:
 *   - For calls: positive (e.g. 0.30 for a 30-delta call)
 *   - For puts: negative (e.g. -0.10 for a 10-delta put)
 */
export function findContractByDelta(
  exp: OptionExpiration,
  type: 'call' | 'put',
  targetDelta: number
): OptionContract | null {
  const map = type === 'call' ? exp.calls : exp.puts;
  const entries = Object.values(map);
  if (entries.length === 0) return null;
  let best: OptionContract | null = null;
  let bestDist = Infinity;
  for (const c of entries) {
    const d = Math.abs(c.delta - targetDelta);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/** Find the expiration nearest a target days-to-expiry. */
export function findExpirationByDte(
  chain: OptionChain,
  targetDte: number
): OptionExpiration | null {
  if (chain.expirations.length === 0) return null;
  return chain.expirations.reduce((best, cur) =>
    Math.abs(cur.daysToExpiry - targetDte) < Math.abs(best.daysToExpiry - targetDte)
      ? cur
      : best
  );
}

/** Return the ATM strike for an expiration (nearest to underlying price). */
export function findAtmStrike(
  exp: OptionExpiration,
  underlyingPrice: number
): number | null {
  const strikes = Object.keys(exp.calls)
    .concat(Object.keys(exp.puts))
    .map((s) => parseFloat(s));
  const unique = Array.from(new Set(strikes));
  if (unique.length === 0) return null;
  return unique.reduce((best, s) =>
    Math.abs(s - underlyingPrice) < Math.abs(best - underlyingPrice) ? s : best
  );
}
