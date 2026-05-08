import { ConditionTree, ValueRef } from '@/types/strategy';

/**
 * Pine Script importer — translates a SUBSET of TradingView's Pine v5
 * into our ConditionTree. Supports the most common patterns; bails
 * gracefully on anything fancy.
 *
 * Supported patterns:
 *   - rsi(close, N) crossover/crossunder X
 *   - ta.crossover(rsi(close, N), X)  / ta.crossunder
 *   - close > / < / >= / <= ema(close, N) / sma(close, N) / vwap
 *   - Combinators: `and`, `or`, `not`
 *   - Constants: numeric literals
 *
 * Returns: { tree, errors, unhandledLines }. Treat unhandled lines as
 * informational — the user might have indicator declarations or
 * cosmetic helpers we just skip.
 */

export interface PineImportResult {
  tree: ConditionTree | null;
  errors: string[];
  unhandledLines: string[];
}

const RSI_RE = /\bta\.rsi\(\s*close\s*,\s*(\d+)\s*\)/g;
const EMA_RE = /\bta\.ema\(\s*close\s*,\s*(\d+)\s*\)/g;
const SMA_RE = /\bta\.sma\(\s*close\s*,\s*(\d+)\s*\)/g;

export function importPine(src: string): PineImportResult {
  const errors: string[] = [];
  const unhandledLines: string[] = [];

  // Strip comments
  const stripped = src
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => l.length > 0);

  // Find the strategy.entry / alertcondition / single boolean expression line
  // For simplicity, we scan for any line that looks like a condition (has
  // crossover/crossunder/comparison operator) and parse the FIRST one.
  let conditionLine: string | null = null;
  for (const line of stripped) {
    if (
      /\bta\.crossover\b|\bta\.crossunder\b|>=|<=|>|<|==|!=/i.test(line) &&
      !/^(\/\/|@|\/\*|input\b|var\b|var=|float\s|int\s|bool\s|string\s|color\s)/i.test(line)
    ) {
      conditionLine = line;
      break;
    }
    unhandledLines.push(line);
  }

  if (!conditionLine) {
    errors.push('No condition expression found. Looking for ta.crossover / comparison operators.');
    return { tree: null, errors, unhandledLines };
  }

  // Strip variable assignment / strategy.entry wrapper. Track whether
  // a wrapper was stripped so we can also strip the trailing closing
  // paren — for plain `name = expr` lines the trailing ) belongs to expr.
  let expr = conditionLine;
  let strippedWrapper = false;
  const wrapperRe1 = /^.*?\bstrategy\.(entry|exit)\([^,]+,\s*\w+\s*,?\s*when\s*=\s*/i;
  const wrapperRe2 = /^.*?\balertcondition\(\s*/i;
  const wrapperRe3 = /^.*?\bplotshape\([^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*condition\s*=\s*/i;
  if (wrapperRe1.test(expr) || wrapperRe2.test(expr) || wrapperRe3.test(expr)) {
    expr = expr.replace(wrapperRe1, '').replace(wrapperRe2, '').replace(wrapperRe3, '');
    strippedWrapper = true;
  }
  // Plain assignment: `name = expr`
  expr = expr.replace(/^[a-zA-Z_]\w*\s*=\s*/, '');
  if (strippedWrapper) {
    expr = expr.replace(/\)\s*$/, '');
  }

  // Try to split on `and` / `or` (top-level only — naive, doesn't handle
  // nested parens). For Pine code that uses parens, we recurse.
  try {
    const tree = parseExpression(expr.trim());
    return { tree, errors, unhandledLines };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { tree: null, errors, unhandledLines };
  }
}

function parseExpression(expr: string): ConditionTree {
  // Find top-level `or` (lowest precedence)
  const orParts = splitTopLevel(expr, /\bor\b/i);
  if (orParts.length > 1) {
    return {
      type: 'or',
      children: orParts.map(parseExpression),
    };
  }
  // Then top-level `and`
  const andParts = splitTopLevel(expr, /\band\b/i);
  if (andParts.length > 1) {
    return {
      type: 'and',
      children: andParts.map(parseExpression),
    };
  }
  // `not`
  const notMatch = expr.match(/^not\s+(.+)$/i);
  if (notMatch) {
    return {
      type: 'not',
      child: parseExpression(notMatch[1].trim()),
    };
  }
  // Strip outer parens
  let stripped = expr.trim();
  while (stripped.startsWith('(') && stripped.endsWith(')')) {
    const inner = stripped.slice(1, -1);
    if (matchedParens(inner)) stripped = inner.trim();
    else break;
  }
  return parseLeaf(stripped);
}

function parseLeaf(s: string): ConditionTree {
  // ta.crossover(a, b) / ta.crossunder(a, b) — nested-paren-aware
  const crossMatch = matchFunctionCall(s, ['ta.crossover', 'ta.crossunder']);
  if (crossMatch) {
    const [fn, args] = crossMatch;
    if (args.length !== 2) throw new Error(`Expected 2 args to ${fn}, got ${args.length}`);
    return {
      type: 'cross',
      target: parseValue(args[0]),
      threshold: parseValue(args[1]),
      dir: fn === 'ta.crossover' ? 'above' : 'below',
    };
  }
  // Comparison: a OP b — split on a top-level comparison operator
  const cmp = splitTopLevelComparison(s);
  if (cmp) {
    return {
      type: 'compare',
      left: parseValue(cmp.left),
      op: cmp.op as '>' | '<' | '>=' | '<=' | '==' | '!=',
      right: parseValue(cmp.right),
    };
  }
  throw new Error(`Could not parse leaf: "${s}"`);
}

/** Match `fn(arg1, arg2, ...)` accounting for nested parens.
 * Returns [fnName, args[]] or null. */
function matchFunctionCall(s: string, fns: string[]): [string, string[]] | null {
  for (const fn of fns) {
    if (!s.startsWith(fn + '(')) continue;
    if (!s.endsWith(')')) continue;
    const inner = s.slice(fn.length + 1, -1);
    return [fn, splitArgs(inner)];
  }
  return null;
}

function splitArgs(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(s.slice(start).trim());
  return parts;
}

function splitTopLevelComparison(s: string): { left: string; op: string; right: string } | null {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0) {
      // 2-char operators first
      if (s.slice(i, i + 2) === '>=' || s.slice(i, i + 2) === '<=' || s.slice(i, i + 2) === '==' || s.slice(i, i + 2) === '!=') {
        return { left: s.slice(0, i).trim(), op: s.slice(i, i + 2), right: s.slice(i + 2).trim() };
      }
      if (ch === '>' || ch === '<') {
        return { left: s.slice(0, i).trim(), op: ch, right: s.slice(i + 1).trim() };
      }
    }
  }
  return null;
}

function parseValue(s: string): ValueRef {
  s = s.trim();
  // Numeric literal
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return { kind: 'literal', value: parseFloat(s) };
  }
  // ta.rsi(close, N)
  let m = s.match(/^ta\.rsi\(\s*close\s*,\s*(\d+)\s*\)$/);
  if (m) return { kind: 'rsi', period: parseInt(m[1], 10) };
  // ta.ema(close, N)
  m = s.match(/^ta\.ema\(\s*close\s*,\s*(\d+)\s*\)$/);
  if (m) return { kind: 'ema', period: parseInt(m[1], 10) };
  // ta.sma(close, N)
  m = s.match(/^ta\.sma\(\s*close\s*,\s*(\d+)\s*\)$/);
  if (m) return { kind: 'sma', period: parseInt(m[1], 10) };
  // ta.vwap
  if (/^ta\.vwap$/.test(s)) return { kind: 'vwap' };
  if (/^close$/.test(s)) return { kind: 'price' };
  if (/^volume$/.test(s)) return { kind: 'volume' };
  throw new Error(`Could not parse value: "${s}"`);
}

function splitTopLevel(s: string, sep: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0) {
      const remaining = s.slice(i);
      const m = remaining.match(sep);
      if (m && m.index === 0) {
        parts.push(s.slice(start, i).trim());
        start = i + m[0].length;
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  parts.push(s.slice(start).trim());
  return parts;
}

function matchedParens(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}
