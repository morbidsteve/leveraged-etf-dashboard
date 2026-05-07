/**
 * Server-side hard caps on Schwab order placement. Enforced in the
 * /api/schwab/orders/place route as defense-in-depth — runs even if the
 * UI guardrails or kill switch are bypassed.
 *
 * All limits are read from env vars at request time (so changes in .env
 * apply on next container rebuild via auto-rebuild).
 *
 * Audit logged to /app/data/order-audit.log (append-only).
 */

import { promises as fs } from 'fs';
import path from 'path';

const AUDIT_PATH =
  process.env.SCHWAB_AUDIT_LOG_PATH ||
  path.join(process.env.NODE_ENV === 'production' ? '/app/data' : './data', 'order-audit.log');

export interface GuardrailConfig {
  /** Max notional ($ per order). 0 / undefined = unlimited. */
  maxOrderNotional: number;
  /** Max orders accepted per UTC day across all strategies. 0 / undefined = unlimited. */
  maxOrdersPerDay: number;
  /** Allowed symbols. Empty array = no allowlist (everything allowed). */
  symbolAllowlist: string[];
}

export function getGuardrailConfig(): GuardrailConfig {
  const num = (k: string) => {
    const v = process.env[k];
    if (!v) return 0;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const allowlist = (process.env.SCHWAB_SYMBOL_ALLOWLIST || '')
    .split(/[\s,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return {
    maxOrderNotional: num('SCHWAB_MAX_ORDER_NOTIONAL'),
    maxOrdersPerDay: num('SCHWAB_MAX_ORDERS_PER_DAY'),
    symbolAllowlist: allowlist,
  };
}

export interface GuardrailDecision {
  allow: boolean;
  reason?: string;
  config: GuardrailConfig;
  ordersToday: number;
}

interface OrderInfo {
  symbol: string;
  shares: number;
  estimatedPrice: number;
}

/**
 * Check whether an order should be accepted. Reads the audit log for
 * today's count.
 */
export async function checkGuardrails(order: OrderInfo): Promise<GuardrailDecision> {
  const config = getGuardrailConfig();
  const ordersToday = await countOrdersTodayFromAudit();

  // Symbol allowlist
  if (config.symbolAllowlist.length > 0) {
    if (!config.symbolAllowlist.includes(order.symbol.toUpperCase())) {
      return {
        allow: false,
        reason: `Symbol ${order.symbol} not in SCHWAB_SYMBOL_ALLOWLIST (${config.symbolAllowlist.join(', ')})`,
        config,
        ordersToday,
      };
    }
  }

  // Per-order notional
  const notional = order.shares * order.estimatedPrice;
  if (config.maxOrderNotional > 0 && notional > config.maxOrderNotional) {
    return {
      allow: false,
      reason: `Order notional $${notional.toFixed(2)} exceeds SCHWAB_MAX_ORDER_NOTIONAL=$${config.maxOrderNotional}`,
      config,
      ordersToday,
    };
  }

  // Daily count
  if (config.maxOrdersPerDay > 0 && ordersToday >= config.maxOrdersPerDay) {
    return {
      allow: false,
      reason: `Daily order limit reached (${ordersToday}/${config.maxOrdersPerDay}). Server caps until UTC midnight.`,
      config,
      ordersToday,
    };
  }

  return { allow: true, config, ordersToday };
}

interface AuditEntry {
  ts: string;
  outcome: 'allowed' | 'rejected' | 'submitted' | 'failed';
  symbol: string;
  shares: number;
  estimatedPrice: number;
  reason?: string;
  orderId?: string;
}

export async function recordAudit(entry: Omit<AuditEntry, 'ts'>): Promise<void> {
  await fs.mkdir(path.dirname(AUDIT_PATH), { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  await fs.appendFile(AUDIT_PATH, line, { mode: 0o600 });
}

async function countOrdersTodayFromAudit(): Promise<number> {
  try {
    const buf = await fs.readFile(AUDIT_PATH, 'utf8');
    const lines = buf.split('\n').filter(Boolean);
    const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
    let count = 0;
    for (const line of lines) {
      try {
        const e = JSON.parse(line) as AuditEntry;
        if (e.outcome === 'submitted' && e.ts.startsWith(today)) count++;
      } catch {
        // skip bad lines
      }
    }
    return count;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return 0;
    return 0;
  }
}

export async function readRecentAudit(limit = 100): Promise<AuditEntry[]> {
  try {
    const buf = await fs.readFile(AUDIT_PATH, 'utf8');
    const lines = buf.split('\n').filter(Boolean).slice(-limit);
    const out: AuditEntry[] = [];
    for (const line of lines) {
      try {
        out.push(JSON.parse(line) as AuditEntry);
      } catch {
        // skip
      }
    }
    return out;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return [];
    return [];
  }
}
