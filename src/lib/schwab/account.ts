/**
 * Account-hash resolver. Schwab API endpoints take a *hash* of the account
 * number, not the raw number. The hash never changes for a given account.
 *
 * We resolve it once at server startup and cache for the process lifetime.
 * The user can pin a specific account via SCHWAB_ACCOUNT_HASH env var when
 * multiple accounts are linked — otherwise we use the first one.
 */

import { getAccountNumbers } from './client';

let cachedHash: string | null = null;

export async function getActiveAccountHash(): Promise<string> {
  if (cachedHash) return cachedHash;

  const pinned = process.env.SCHWAB_ACCOUNT_HASH;
  if (pinned) {
    cachedHash = pinned;
    return cachedHash;
  }

  const accounts = await getAccountNumbers();
  if (accounts.length === 0) {
    throw new Error('No Schwab accounts linked to this OAuth grant');
  }
  cachedHash = accounts[0].hashValue;
  if (accounts.length > 1) {
    console.warn(
      `[schwab/account] ${accounts.length} accounts linked; using first. ` +
        `Set SCHWAB_ACCOUNT_HASH to pin a specific one.`
    );
  }
  return cachedHash;
}

export function clearAccountHashCache() {
  cachedHash = null;
}
