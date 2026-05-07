import { ConditionTree, ValueRef, CompareOp, Timeframe } from '@/types/strategy';

/**
 * Tiny natural-language parser for trading conditions. Produces a
 * ConditionTree from human-style input. Intentionally small grammar — covers
 * the patterns the user is most likely to type.
 *
 * Examples:
 *   "rsi(250) crosses below 50"
 *   "rsi(250) crosses below 50 and price > vwap"
 *   "price >= entry + 1.5%"
 *   "rsi(50) on 5m is below 60"
 *   "rsi(250) crosses above 55 OR minutes_since_entry > 30"
 *
 * Returns null when nothing parses; partial parses are reported via the
 * `unparsed` field so the UI can highlight what was ignored.
 */

export interface ParseResult {
  tree: ConditionTree | null;
  unparsed: string[];
  errors: string[];
}

export function parseCondition(input: string): ParseResult {
  const errors: string[] = [];
  const unparsed: string[] = [];
  const trimmed = input.trim();
  if (!trimmed) {
    return { tree: null, unparsed: [], errors: ['empty input'] };
  }

  // Split on AND / OR (case-insensitive). Track the operator between clauses.
  const tokens = splitByConnectors(trimmed);
  if (tokens.length === 0) {
    return { tree: null, unparsed: [], errors: ['could not split into clauses'] };
  }

  // If there's a mix of AND and OR, default to AND-priority (group ORs to one
  // OR-of-ANDs structure for now). Most real strategies are pure-AND or
  // pure-OR; a mixed string is rare.
  const allConnectors = tokens.filter((t) => t.kind === 'connector').map((t) => t.connector!);
  const hasAnd = allConnectors.includes('and');
  const hasOr = allConnectors.includes('or');

  const clauses: ConditionTree[] = [];
  for (const tk of tokens) {
    if (tk.kind !== 'clause') continue;
    const leaf = parseClause(tk.text);
    if (leaf) {
      clauses.push(leaf);
    } else {
      unparsed.push(tk.text);
    }
  }

  if (clauses.length === 0) {
    errors.push('no clauses parsed');
    return { tree: null, unparsed, errors };
  }

  let tree: ConditionTree;
  if (clauses.length === 1) {
    tree = clauses[0];
  } else if (hasAnd && !hasOr) {
    tree = { type: 'and', children: clauses };
  } else if (hasOr && !hasAnd) {
    tree = { type: 'or', children: clauses };
  } else {
    // mixed — default to AND, surface a hint
    errors.push('mixed AND/OR — defaulting to AND. Use parentheses (not yet supported) for explicit grouping.');
    tree = { type: 'and', children: clauses };
  }

  return { tree, unparsed, errors };
}

// ── Tokenization ────────────────────────────────────────────────────────

interface Token {
  kind: 'clause' | 'connector';
  text: string;
  connector?: 'and' | 'or';
}

function splitByConnectors(s: string): Token[] {
  // Split on whitespace-bounded AND/OR (case-insensitive). Keep clauses + connectors interleaved.
  const re = /\s+(AND|OR|and|And|or|Or)\s+/g;
  const out: Token[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const before = s.slice(lastIdx, m.index).trim();
    if (before) out.push({ kind: 'clause', text: before });
    out.push({
      kind: 'connector',
      text: m[1],
      connector: m[1].toLowerCase() as 'and' | 'or',
    });
    lastIdx = m.index + m[0].length;
  }
  const tail = s.slice(lastIdx).trim();
  if (tail) out.push({ kind: 'clause', text: tail });
  return out;
}

// ── Clause parsing ──────────────────────────────────────────────────────

function parseClause(s: string): ConditionTree | null {
  const cleaned = s.trim();

  // Try cross conditions first: "X crosses below|above Y"
  const cross = parseCross(cleaned);
  if (cross) return cross;

  // Then comparisons: "X (>|<|>=|<=|==|!=) Y" or natural variants
  const compare = parseCompare(cleaned);
  if (compare) return compare;

  return null;
}

function parseCross(s: string): ConditionTree | null {
  // Patterns like "rsi(250) crosses below 50" or "price crosses above vwap"
  const re = /^(.+?)\s+(?:crosses?|crossing|crosses_(?:below|above))\s+(below|above|under|over|down|up)\s+(.+)$/i;
  const m = s.match(re);
  if (!m) {
    // Alternate phrasing: "rsi crosses_below 50"
    const re2 = /^(.+?)\s+crosses?[_\s]+(below|above|under|over|down|up)\s+(.+)$/i;
    const m2 = s.match(re2);
    if (!m2) return null;
    return makeCross(m2[1], m2[2], m2[3]);
  }
  return makeCross(m[1], m[2], m[3]);
}

function makeCross(targetStr: string, dirStr: string, thresholdStr: string): ConditionTree | null {
  const target = parseValueRef(targetStr);
  const threshold = parseValueRef(thresholdStr);
  if (!target || !threshold) return null;
  const dir = /below|under|down/i.test(dirStr) ? 'below' : 'above';
  return { type: 'cross', target, threshold, dir };
}

function parseCompare(s: string): ConditionTree | null {
  // Natural phrasing: "is below", "is above", "is greater than", "is less than", "equals"
  // Fall back to symbolic operators ">=", "<=", "==", "!=", ">", "<"
  const naturalRe = /^(.+?)\s+(?:is\s+)?(below|under|less\s+than|<=?\s|<\s|>=?\s|>\s|>|<|>=|<=|==|!=|equal\s+to|equals|above|over|greater\s+than)\s+(.+)$/i;
  const m = s.match(naturalRe);
  if (!m) {
    // Try simple symbolic: "X >= Y"
    const sym = s.match(/^(.+?)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
    if (!sym) return null;
    const left = parseValueRef(sym[1].trim());
    const right = parseValueRef(sym[3].trim());
    if (!left || !right) return null;
    return { type: 'compare', left, op: sym[2] as CompareOp, right };
  }

  const left = parseValueRef(m[1].trim());
  const right = parseValueRef(m[3].trim());
  if (!left || !right) return null;
  const op = phrasedOp(m[2].trim());
  if (!op) return null;
  return { type: 'compare', left, op, right };
}

function phrasedOp(s: string): CompareOp | null {
  const lower = s.toLowerCase();
  if (/^(below|under|less\s+than|<)$/.test(lower)) return '<';
  if (/^(above|over|greater\s+than|>)$/.test(lower)) return '>';
  if (lower === '<=' || /at\s+most/.test(lower)) return '<=';
  if (lower === '>=' || /at\s+least/.test(lower)) return '>=';
  if (lower === '==' || /^equal\s+to$|^equals$/.test(lower)) return '==';
  if (lower === '!=') return '!=';
  return null;
}

// ── Value reference parsing ─────────────────────────────────────────────

function parseValueRef(s: string): ValueRef | null {
  const cleaned = s.trim();

  // Special: "entry + X%" or "entry × X" or "entry_price × 1.015"
  const pctMatch = cleaned.match(
    /^(entry|entry_price|entryprice)(?:\s*[×x*]\s*[\d.]+|\s*[+plus\s]+([\d.]+)\s*%|\s*\+\s*([\d.]+)\s*%)$/i
  );
  if (pctMatch) {
    const pct = Number(pctMatch[2] ?? pctMatch[3] ?? 0);
    if (Number.isFinite(pct) && pct !== 0) {
      return { kind: 'pct_of', base: { kind: 'entry_price' }, pct };
    }
  }

  // "entry_price * 1.015" → pct_of with pct = (factor - 1) * 100
  const mulMatch = cleaned.match(
    /^(entry|entry_price|entryprice)\s*(?:[×x*])\s*([\d.]+)$/i
  );
  if (mulMatch) {
    const factor = Number(mulMatch[2]);
    if (Number.isFinite(factor)) {
      const pct = (factor - 1) * 100;
      return { kind: 'pct_of', base: { kind: 'entry_price' }, pct };
    }
  }

  // Detect a timeframe suffix " on 5m" / " @5m" / " on 1h"
  const tfMatch = cleaned.match(/^(.+?)\s+(?:on|@)\s*(1m|5m|15m|1h|1d)$/i);
  let body = cleaned;
  let tf: Timeframe | undefined;
  if (tfMatch) {
    body = tfMatch[1];
    tf = tfMatch[2].toLowerCase() as Timeframe;
  }

  body = body.trim();

  // Numeric literal
  if (/^-?[\d.]+$/.test(body)) {
    const n = Number(body);
    return Number.isFinite(n) ? { kind: 'literal', value: n } : null;
  }

  // Indicator with period: rsi(250), ema(20), sma(50)
  const indMatch = body.match(/^(rsi|ema|sma)\s*\(\s*(\d+)\s*\)$/i);
  if (indMatch) {
    const kind = indMatch[1].toLowerCase() as 'rsi' | 'ema' | 'sma';
    const period = Number(indMatch[2]);
    return { kind, period, ...(tf && { tf }) };
  }

  // Indicator without explicit period (defaults: rsi=14, ema=20, sma=20)
  // We deliberately don't default RSI to 14 since the user trades RSI(250)
  // — leave it ambiguous and require the period.
  const bareIndMatch = body.match(/^(rsi|ema|sma)$/i);
  if (bareIndMatch) {
    return null;  // require explicit period
  }

  // Bare symbols
  const lower = body.toLowerCase();
  if (lower === 'price' || lower === 'last' || lower === 'close')
    return { kind: 'price', ...(tf && { tf }) };
  if (lower === 'vwap')
    return { kind: 'vwap', ...(tf && { tf }) };
  if (lower === 'volume')
    return { kind: 'volume', ...(tf && { tf }) };
  if (lower === 'entry_price' || lower === 'entry' || lower === 'entryprice')
    return { kind: 'entry_price' };
  if (lower === 'minutes_since_entry' || lower === 'mins_since_entry')
    return { kind: 'minutes_since_entry' };
  if (lower === 'minutes_since_open' || lower === 'mins_since_open')
    return { kind: 'minutes_since_open' };

  return null;
}
