import { NextResponse } from 'next/server';
import { readRecentAudit, getGuardrailConfig } from '@/lib/schwab/orderGuardrails';

export async function GET() {
  const entries = await readRecentAudit(50);
  const config = getGuardrailConfig();
  return NextResponse.json({
    config,
    recent: entries.reverse(), // most recent first
  });
}
