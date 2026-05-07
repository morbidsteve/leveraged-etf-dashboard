import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/schwab/oauth';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  // Construct redirect target back to the dashboard root with status query
  const root = new URL('/', request.url);

  if (error) {
    root.searchParams.set('schwab', 'error');
    root.searchParams.set('reason', error);
    return NextResponse.redirect(root);
  }
  if (!code) {
    root.searchParams.set('schwab', 'error');
    root.searchParams.set('reason', 'missing_code');
    return NextResponse.redirect(root);
  }

  try {
    await exchangeCode(code);
    root.searchParams.set('schwab', 'connected');
    return NextResponse.redirect(root);
  } catch (e) {
    root.searchParams.set('schwab', 'error');
    root.searchParams.set(
      'reason',
      e instanceof Error ? e.message.slice(0, 200) : 'token_exchange_failed'
    );
    return NextResponse.redirect(root);
  }
}
