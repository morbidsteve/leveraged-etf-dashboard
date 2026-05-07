import { NextResponse } from 'next/server';
import { getAccount, getAccountNumbers } from '@/lib/schwab/client';
import { getActiveAccountHash } from '@/lib/schwab/account';

export async function GET() {
  try {
    const accounts = await getAccountNumbers();
    const hash = await getActiveAccountHash();
    const detail = await getAccount(hash, true);
    const sa = detail.securitiesAccount;

    return NextResponse.json({
      accountNumber: sa.accountNumber,
      accountHash: hash,
      type: sa.type,
      cashBalance: sa.currentBalances?.cashBalance ?? null,
      buyingPower: sa.currentBalances?.buyingPower ?? null,
      equity: sa.currentBalances?.equity ?? null,
      liquidationValue: sa.currentBalances?.liquidationValue ?? null,
      positions: (sa.positions ?? []).map((p) => ({
        symbol: p.instrument.symbol,
        assetType: p.instrument.assetType,
        longQuantity: p.longQuantity,
        shortQuantity: p.shortQuantity,
        averagePrice: p.averagePrice ?? null,
        marketValue: p.marketValue ?? null,
        dayPnL: p.currentDayProfitLoss ?? null,
        dayPnLPct: p.currentDayProfitLossPercentage ?? null,
      })),
      multipleAccounts: accounts.length > 1,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
