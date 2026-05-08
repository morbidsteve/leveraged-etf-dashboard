import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/schwab/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/schwab/streamer-info
 *
 * Returns the streamer endpoint URL + customer credentials needed to
 * open a Schwab WebSocket stream from the browser. The server-side
 * access token is included because the LOGIN message requires it; the
 * token never persists in the browser beyond the active connection.
 *
 * Returns 401 when not connected to Schwab.
 */
interface UserPrefResponse {
  streamerInfo?: Array<{
    streamerSocketUrl?: string;
    schwabClientCustomerId?: string;
    schwabClientCorrelId?: string;
    schwabClientChannel?: string;
    schwabClientFunctionId?: string;
  }>;
}

export async function GET() {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: 'Not connected to Schwab' }, { status: 401 });
  }
  try {
    const r = await fetch('https://api.schwabapi.com/trader/v1/userPreference', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `userPreference ${r.status}` },
        { status: 502 }
      );
    }
    const data = (await r.json()) as UserPrefResponse;
    const info = data.streamerInfo?.[0];
    if (!info?.streamerSocketUrl || !info.schwabClientCustomerId) {
      return NextResponse.json(
        { error: 'streamerInfo missing in userPreference response' },
        { status: 502 }
      );
    }
    return NextResponse.json({
      url: info.streamerSocketUrl,
      customerId: info.schwabClientCustomerId,
      correlId: info.schwabClientCorrelId ?? '',
      channel: info.schwabClientChannel ?? '',
      functionId: info.schwabClientFunctionId ?? '',
      token,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
