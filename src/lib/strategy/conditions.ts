import { ConditionTree, DataContext, CompareOp } from '@/types/strategy';
import { evaluateValue, describeValue } from './values';

/**
 * Evaluate a boolean condition against the current data context.
 *
 * For `cross` conditions, we compare the current evaluation to a previous one;
 * crossings need both a "before" and "after" reading. The caller passes both
 * contexts; if `prevCtx` is null, no cross condition can fire (this is correct
 * behaviour on the very first tick).
 */
export function evaluate(
  cond: ConditionTree,
  ctx: DataContext,
  prevCtx: DataContext | null
): boolean {
  switch (cond.type) {
    case 'and':
      return cond.children.every((c) => evaluate(c, ctx, prevCtx));
    case 'or':
      return cond.children.some((c) => evaluate(c, ctx, prevCtx));
    case 'not':
      return !evaluate(cond.child, ctx, prevCtx);
    case 'compare': {
      const l = evaluateValue(cond.left, ctx);
      const r = evaluateValue(cond.right, ctx);
      if (l === null || r === null) return false;
      return applyCompare(l, cond.op, r);
    }
    case 'cross': {
      if (!prevCtx) return false;
      const currT = evaluateValue(cond.target, ctx);
      const currR = evaluateValue(cond.threshold, ctx);
      const prevT = evaluateValue(cond.target, prevCtx);
      const prevR = evaluateValue(cond.threshold, prevCtx);
      if (
        currT === null ||
        currR === null ||
        prevT === null ||
        prevR === null
      )
        return false;
      if (cond.dir === 'below') {
        return prevT >= prevR && currT < currR;
      } else {
        return prevT <= prevR && currT > currR;
      }
    }
    case 'time_window': {
      const t = ctx.timestamp;
      const [sh, sm] = cond.start.split(':').map(Number);
      const [eh, em] = cond.end.split(':').map(Number);
      const minutes = t.getHours() * 60 + t.getMinutes();
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      return minutes >= start && minutes <= end;
    }
  }
}

function applyCompare(l: number, op: CompareOp, r: number): boolean {
  switch (op) {
    case '>': return l > r;
    case '<': return l < r;
    case '>=': return l >= r;
    case '<=': return l <= r;
    case '==': return l === r;
    case '!=': return l !== r;
  }
}

/**
 * Human-readable rendering of a condition tree — used by the strategy builder UI
 * preview and by event-log entries.
 */
export function describeCondition(cond: ConditionTree): string {
  switch (cond.type) {
    case 'and':
      return cond.children.map(describeCondition).join(' AND ');
    case 'or':
      return cond.children.map(describeCondition).join(' OR ');
    case 'not':
      return `NOT (${describeCondition(cond.child)})`;
    case 'compare':
      return `${describeValue(cond.left)} ${cond.op} ${describeValue(cond.right)}`;
    case 'cross':
      return `${describeValue(cond.target)} crosses ${cond.dir} ${describeValue(cond.threshold)}`;
    case 'time_window':
      return `time in [${cond.start}, ${cond.end}]`;
  }
}
