/**
 * Account-hash resolver. Schwab API endpoints take a *hash* of the account
 * number, not the raw number. The hash never changes for a given account.
 *
 * We resolve it once at server startup and cache for the process lifetime.
 * The user can pin a specific account via SCHWAB_ACCOUNT_HASH env var when
 * multiple accounts are linked — otherwise we use the first one.
 */

import { getAccountNumbers, type AccountNumberHash } from './client';

let cachedHash: string | null = null;
let cachedAccountNumber: string | null = null;
let cachedAccountList: AccountNumberHash[] | null = null;

/**
 * Resolve the single Schwab account this dashboard is allowed to trade in.
 *
 * Resolution order, fail-closed:
 *   1. SCHWAB_ACCOUNT_HASH env var pinned                       -> use it.
 *   2. Exactly one account authorized in the OAuth grant        -> use it.
 *   3. Multiple accounts authorized but no pin                  -> THROW.
 *      Forces an explicit choice instead of silently defaulting
 *      to "the first one Schwab returned" which could trade in
 *      the wrong account.
 */
export async function getActiveAccountHash(): Promise<string> {
  if (cachedHash) return cachedHash;

  const pinned = process.env.SCHWAB_ACCOUNT_HASH;
  const accounts = await getAccountNumbers();
  cachedAccountList = accounts;

  if (pinned) {
    // Verify the pinned hash is actually in the authorized list — catches
    // stale env vars after a re-auth without that account checked.
    const match = accounts.find((a) => a.hashValue === pinned);
    if (!match) {
      throw new Error(
        `SCHWAB_ACCOUNT_HASH is set but that hash is not in the current OAuth ` +
          `grant. Re-authorize and check the correct account, OR update ` +
          `SCHWAB_ACCOUNT_HASH. Authorized hashes: ${accounts.map((a) => a.hashValue.slice(0, 8) + '...').join(', ')}`
      );
    }
    cachedHash = match.hashValue;
    cachedAccountNumber = match.accountNumber;
    return cachedHash;
  }

  if (accounts.length === 0) {
    throw new Error('No Schwab accounts authorized in this OAuth grant');
  }

  if (accounts.length > 1) {
    throw new Error(
      `${accounts.length} Schwab accounts are authorized but SCHWAB_ACCOUNT_HASH ` +
        `is not pinned. Refusing to default to "the first one" — pick one ` +
        `explicitly. Authorized accounts: ${accounts.map((a) => `***${a.accountNumber.slice(-4)} (hash ${a.hashValue.slice(0, 8)}...)`).join(', ')}. ` +
        `Either re-authorize and uncheck all but one, OR set SCHWAB_ACCOUNT_HASH ` +
        `to one of the hashes above and restart.`
    );
  }

  cachedHash = accounts[0].hashValue;
  cachedAccountNumber = accounts[0].accountNumber;
  return cachedHash;
}

/** Returns the masked account number (last 4) of the resolved active account, or null. */
export async function getActiveAccountSummary(): Promise<{
  hash: string;
  accountNumber: string;
  maskedNumber: string;
  totalAuthorized: number;
  pinned: boolean;
} | null> {
  try {
    const hash = await getActiveAccountHash();
    if (!cachedAccountNumber) return null;
    return {
      hash,
      accountNumber: cachedAccountNumber,
      maskedNumber: `***${cachedAccountNumber.slice(-4)}`,
      totalAuthorized: cachedAccountList?.length ?? 1,
      pinned: Boolean(process.env.SCHWAB_ACCOUNT_HASH),
    };
  } catch {
    return null;
  }
}

export function clearAccountHashCache() {
  cachedHash = null;
  cachedAccountNumber = null;
  cachedAccountList = null;
}
