import {
  OptionChain,
  OptionContract,
  OptionInstruction,
  OptionStructure,
} from '@/types/options';
import { findExpirationByDte, findContractByDelta } from './helpers';

/**
 * Pure template builders — given a live chain, target DTE, and quantity,
 * return concrete legs for a structure. Shared between the Cmd+K palette,
 * the StrategyBuilder UI, and the resolver-backed strategy execution.
 *
 * Template id strings match the palette's options-template action names
 * so a single dispatch path covers every entrypoint.
 */

export type TemplateId =
  | 'bull-put-credit'
  | 'bear-call-credit'
  | 'bull-call-debit'
  | 'bear-put-debit'
  | 'iron-condor'
  | 'long-straddle'
  | 'short-straddle'
  | 'long-strangle'
  | 'short-strangle';

export type DraftLeg = {
  contract: OptionContract;
  instruction: OptionInstruction;
  quantity: number;
};

export interface BuiltTemplate {
  legs: DraftLeg[];
  structure: OptionStructure;
}

export function buildTemplate(
  chain: OptionChain,
  templateId: TemplateId,
  dte = 30,
  qty = 1
): BuiltTemplate | null {
  const exp = findExpirationByDte(chain, dte);
  if (!exp) return null;

  const requireBoth = (
    a: OptionContract | null,
    b: OptionContract | null,
    structure: OptionStructure,
    aIns: OptionInstruction,
    bIns: OptionInstruction
  ): BuiltTemplate | null => {
    if (!a || !b) return null;
    return {
      structure,
      legs: [
        { contract: a, instruction: aIns, quantity: qty },
        { contract: b, instruction: bIns, quantity: qty },
      ],
    };
  };

  switch (templateId) {
    case 'bull-put-credit': {
      const short = findContractByDelta(exp, 'put', -0.30);
      const long = findContractByDelta(exp, 'put', -0.15);
      return requireBoth(short, long, 'vertical', 'SELL_TO_OPEN', 'BUY_TO_OPEN');
    }
    case 'bear-call-credit': {
      const short = findContractByDelta(exp, 'call', 0.30);
      const long = findContractByDelta(exp, 'call', 0.15);
      return requireBoth(short, long, 'vertical', 'SELL_TO_OPEN', 'BUY_TO_OPEN');
    }
    case 'bull-call-debit': {
      const long = findContractByDelta(exp, 'call', 0.30);
      const short = findContractByDelta(exp, 'call', 0.15);
      return requireBoth(long, short, 'vertical', 'BUY_TO_OPEN', 'SELL_TO_OPEN');
    }
    case 'bear-put-debit': {
      const long = findContractByDelta(exp, 'put', -0.30);
      const short = findContractByDelta(exp, 'put', -0.15);
      return requireBoth(long, short, 'vertical', 'BUY_TO_OPEN', 'SELL_TO_OPEN');
    }
    case 'iron-condor': {
      const callShort = findContractByDelta(exp, 'call', 0.15);
      const callLong = findContractByDelta(exp, 'call', 0.05);
      const putShort = findContractByDelta(exp, 'put', -0.15);
      const putLong = findContractByDelta(exp, 'put', -0.05);
      if (!callShort || !callLong || !putShort || !putLong) return null;
      return {
        structure: 'iron_condor',
        legs: [
          { contract: putLong, instruction: 'BUY_TO_OPEN', quantity: qty },
          { contract: putShort, instruction: 'SELL_TO_OPEN', quantity: qty },
          { contract: callShort, instruction: 'SELL_TO_OPEN', quantity: qty },
          { contract: callLong, instruction: 'BUY_TO_OPEN', quantity: qty },
        ],
      };
    }
    case 'long-straddle': {
      const c = findContractByDelta(exp, 'call', 0.50);
      const p = findContractByDelta(exp, 'put', -0.50);
      if (!c || !p) return null;
      return {
        structure: 'straddle',
        legs: [
          { contract: c, instruction: 'BUY_TO_OPEN', quantity: qty },
          { contract: p, instruction: 'BUY_TO_OPEN', quantity: qty },
        ],
      };
    }
    case 'short-straddle': {
      const c = findContractByDelta(exp, 'call', 0.50);
      const p = findContractByDelta(exp, 'put', -0.50);
      if (!c || !p) return null;
      return {
        structure: 'straddle',
        legs: [
          { contract: c, instruction: 'SELL_TO_OPEN', quantity: qty },
          { contract: p, instruction: 'SELL_TO_OPEN', quantity: qty },
        ],
      };
    }
    case 'long-strangle': {
      const c = findContractByDelta(exp, 'call', 0.25);
      const p = findContractByDelta(exp, 'put', -0.25);
      if (!c || !p) return null;
      return {
        structure: 'strangle',
        legs: [
          { contract: c, instruction: 'BUY_TO_OPEN', quantity: qty },
          { contract: p, instruction: 'BUY_TO_OPEN', quantity: qty },
        ],
      };
    }
    case 'short-strangle': {
      const c = findContractByDelta(exp, 'call', 0.25);
      const p = findContractByDelta(exp, 'put', -0.25);
      if (!c || !p) return null;
      return {
        structure: 'strangle',
        legs: [
          { contract: c, instruction: 'SELL_TO_OPEN', quantity: qty },
          { contract: p, instruction: 'SELL_TO_OPEN', quantity: qty },
        ],
      };
    }
  }
}
