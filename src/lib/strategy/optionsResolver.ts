import { OptionChain, OptionContract, OptionLeg, OptionStructure } from '@/types/options';
import { findExpirationByDte, findContractByDelta } from '@/lib/options/helpers';

/**
 * Strategy → contract resolver. Given a chain and a high-level rule
 * ("sell a 10-delta put credit spread, 7 DTE, 5-wide"), pick concrete
 * legs from the live chain.
 *
 * Pure function — no I/O. Caller is responsible for fetching the chain.
 */

export type OptionsResolverRule =
  | {
      kind: 'short_put_vertical';
      dte: number;
      shortDelta: number;       // negative, e.g. -0.10
      width: number;            // dollars between strikes
      quantity: number;
    }
  | {
      kind: 'short_call_vertical';
      dte: number;
      shortDelta: number;       // positive, e.g. 0.10
      width: number;
      quantity: number;
    }
  | {
      kind: 'long_call';
      dte: number;
      delta: number;            // positive
      quantity: number;
    }
  | {
      kind: 'long_put';
      dte: number;
      delta: number;            // negative
      quantity: number;
    }
  | {
      kind: 'iron_condor';
      dte: number;
      shortDelta: number;       // 0.15 means short legs at ±15Δ
      width: number;
      quantity: number;
    };

export interface ResolvedStructure {
  structure: OptionStructure;
  legs: Pick<OptionLeg, 'contractSymbol' | 'underlying' | 'expiration' | 'strike' | 'type' | 'instruction' | 'quantity'>[];
  netCost: number;              // estimated, mark-based; + = debit, – = credit
  warnings: string[];
}

export function resolveOptionsRule(
  chain: OptionChain,
  rule: OptionsResolverRule
): ResolvedStructure | null {
  if (!chain.configured || chain.expirations.length === 0) return null;
  const exp = findExpirationByDte(chain, rule.dte);
  if (!exp) return null;
  const warnings: string[] = [];

  const ul = chain.underlying;
  const findStrikeNearest = (
    type: 'call' | 'put',
    targetStrike: number
  ): OptionContract | null => {
    const map = type === 'call' ? exp.calls : exp.puts;
    const entries = Object.values(map);
    if (entries.length === 0) return null;
    return entries.reduce((best, cur) =>
      Math.abs(cur.strike - targetStrike) < Math.abs(best.strike - targetStrike) ? cur : best
    );
  };

  switch (rule.kind) {
    case 'long_call':
    case 'long_put': {
      const type = rule.kind === 'long_call' ? 'call' : 'put';
      const c = findContractByDelta(exp, type, rule.delta);
      if (!c) return null;
      const cost = ((c.bid + c.ask) / 2) * rule.quantity * 100;
      return {
        structure: 'single',
        legs: [
          {
            contractSymbol: c.symbol,
            underlying: ul,
            expiration: exp.date,
            strike: c.strike,
            type,
            instruction: 'BUY_TO_OPEN',
            quantity: rule.quantity,
          },
        ],
        netCost: cost,
        warnings,
      };
    }

    case 'short_put_vertical':
    case 'short_call_vertical': {
      const type = rule.kind === 'short_put_vertical' ? 'put' : 'call';
      const shortC = findContractByDelta(exp, type, rule.shortDelta);
      if (!shortC) return null;
      const longStrike =
        type === 'put' ? shortC.strike - rule.width : shortC.strike + rule.width;
      const longC = findStrikeNearest(type, longStrike);
      if (!longC) return null;
      const credit =
        ((shortC.bid + shortC.ask) / 2 - (longC.bid + longC.ask) / 2) *
        rule.quantity *
        100;
      // For credit positions netCost is negative (received money)
      return {
        structure: 'vertical',
        legs: [
          {
            contractSymbol: shortC.symbol,
            underlying: ul,
            expiration: exp.date,
            strike: shortC.strike,
            type,
            instruction: 'SELL_TO_OPEN',
            quantity: rule.quantity,
          },
          {
            contractSymbol: longC.symbol,
            underlying: ul,
            expiration: exp.date,
            strike: longC.strike,
            type,
            instruction: 'BUY_TO_OPEN',
            quantity: rule.quantity,
          },
        ],
        netCost: -credit,
        warnings,
      };
    }

    case 'iron_condor': {
      const callShort = findContractByDelta(exp, 'call', rule.shortDelta);
      const putShort = findContractByDelta(exp, 'put', -rule.shortDelta);
      if (!callShort || !putShort) return null;
      const callLong = findStrikeNearest('call', callShort.strike + rule.width);
      const putLong = findStrikeNearest('put', putShort.strike - rule.width);
      if (!callLong || !putLong) return null;
      const credit =
        (((callShort.bid + callShort.ask) / 2 - (callLong.bid + callLong.ask) / 2) +
          ((putShort.bid + putShort.ask) / 2 - (putLong.bid + putLong.ask) / 2)) *
        rule.quantity *
        100;
      return {
        structure: 'iron_condor',
        legs: [
          {
            contractSymbol: putLong.symbol,
            underlying: ul,
            expiration: exp.date,
            strike: putLong.strike,
            type: 'put',
            instruction: 'BUY_TO_OPEN',
            quantity: rule.quantity,
          },
          {
            contractSymbol: putShort.symbol,
            underlying: ul,
            expiration: exp.date,
            strike: putShort.strike,
            type: 'put',
            instruction: 'SELL_TO_OPEN',
            quantity: rule.quantity,
          },
          {
            contractSymbol: callShort.symbol,
            underlying: ul,
            expiration: exp.date,
            strike: callShort.strike,
            type: 'call',
            instruction: 'SELL_TO_OPEN',
            quantity: rule.quantity,
          },
          {
            contractSymbol: callLong.symbol,
            underlying: ul,
            expiration: exp.date,
            strike: callLong.strike,
            type: 'call',
            instruction: 'BUY_TO_OPEN',
            quantity: rule.quantity,
          },
        ],
        netCost: -credit,
        warnings,
      };
    }
  }
}

/** Human-readable description of a resolver rule for event logs / UI. */
export function describeRule(rule: OptionsResolverRule): string {
  switch (rule.kind) {
    case 'long_call':
      return `long ${rule.dte}d call @ ${(rule.delta).toFixed(2)}Δ × ${rule.quantity}`;
    case 'long_put':
      return `long ${rule.dte}d put @ ${(rule.delta).toFixed(2)}Δ × ${rule.quantity}`;
    case 'short_put_vertical':
      return `${rule.dte}d short put vertical @ ${rule.shortDelta.toFixed(2)}Δ / ${rule.width} wide × ${rule.quantity}`;
    case 'short_call_vertical':
      return `${rule.dte}d short call vertical @ ${rule.shortDelta.toFixed(2)}Δ / ${rule.width} wide × ${rule.quantity}`;
    case 'iron_condor':
      return `${rule.dte}d iron condor @ ±${rule.shortDelta.toFixed(2)}Δ / ${rule.width} wide × ${rule.quantity}`;
  }
}
