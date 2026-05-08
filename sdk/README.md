# ETF Dashboard SDK

Lightweight TypeScript client for the dashboard's REST API.

## Install

Copy `etfd-client.ts` into your project. No npm package — single file
with zero dependencies (uses global `fetch`, available in Node 18+).

## Use

```ts
import { EtfDashboardClient } from './etfd-client';

const client = new EtfDashboardClient({
  baseUrl: 'https://your-dashboard.example.com',
  apiKey: 'etfd_xxxxx',
});

// Health check (gives you build version + which subsystems are configured)
const health = await client.health();
console.log(health);
// { status: 'ok', version: '1.0.0', timestamp: '...', features: { ... } }

// Latest quote for a ticker
const quote = await client.quote('SOXL');
console.log(`SOXL: $${quote.price} (${quote.changePercent.toFixed(2)}%)`);

// List trades (placeholder until server-side persistence lands)
const trades = await client.trades();
```

## Authentication

Every endpoint except `/health` requires an API key. Generate one in the
dashboard at **Settings → Broker → API keys**. Save the raw key the
moment it's shown — only its hash is persisted server-side.

## Errors

Failed requests throw `EtfDashboardApiError` with `status` and `body`
fields:

```ts
import { EtfDashboardApiError } from './etfd-client';

try {
  await client.quote('XYZ');
} catch (e) {
  if (e instanceof EtfDashboardApiError && e.status === 403) {
    // Insufficient scope — add 'read' to the key's scopes
  }
}
```

## Versioning

The SDK targets `/api/v1`. Future API versions will be additive
(`/api/v2`); the SDK will offer parallel `v1Client.*` / `v2Client.*`
namespaces rather than breaking.
