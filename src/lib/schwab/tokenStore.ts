/**
 * Encrypted-on-disk token store for Schwab OAuth credentials.
 *
 * Tokens are sensitive — a leaked refresh token grants full read access and
 * could place orders if order scopes are granted. We encrypt at rest with
 * AES-256-GCM using a 32-byte key derived from SCHWAB_TOKEN_ENCRYPTION_KEY.
 *
 * The token file lives at /app/data/schwab-tokens.json (mounted via docker
 * volume so it survives container rebuilds). For local dev (no Docker), the
 * path is configurable via SCHWAB_TOKEN_PATH.
 *
 * THIS RUNS SERVER-SIDE ONLY. Never import from client components.
 */

import { promises as fs } from 'fs';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import path from 'path';

export interface SchwabTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;          // seconds (typically 1800 = 30 min)
  scope?: string;
  id_token?: string;
  // Stored derived fields
  obtained_at: number;          // unix ms
  refresh_token_obtained_at: number; // unix ms (Schwab refresh tokens last 7 days)
}

const TOKEN_PATH =
  process.env.SCHWAB_TOKEN_PATH ||
  path.join(process.env.NODE_ENV === 'production' ? '/app/data' : './data', 'schwab-tokens.json');

function getKey(): Buffer {
  const raw = process.env.SCHWAB_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      'SCHWAB_TOKEN_ENCRYPTION_KEY env var is required and must be at least 16 chars'
    );
  }
  // scrypt-derive a 32-byte key with a static (non-secret) salt — the
  // derivation just normalizes the key length; the secret is the env var.
  return scryptSync(raw, 'leveraged-etf-dashboard-schwab-tokens', 32);
}

interface EncryptedFile {
  v: 1;
  iv: string;     // base64
  tag: string;    // base64
  data: string;   // base64 ciphertext
}

function encrypt(plaintext: string): EncryptedFile {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  };
}

function decrypt(file: EncryptedFile): string {
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(file.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(file.tag, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(file.data, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

export async function loadTokens(): Promise<SchwabTokens | null> {
  try {
    const buf = await fs.readFile(TOKEN_PATH, 'utf8');
    const file = JSON.parse(buf) as EncryptedFile;
    return JSON.parse(decrypt(file)) as SchwabTokens;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return null;
    // If decryption fails (key mismatch / corruption), don't crash;
    // just treat as logged-out.
    if (e instanceof Error) {
      console.error('[schwab/tokenStore] failed to load tokens:', e.message);
    }
    return null;
  }
}

export async function saveTokens(tokens: SchwabTokens): Promise<void> {
  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
  const file = encrypt(JSON.stringify(tokens));
  await fs.writeFile(TOKEN_PATH, JSON.stringify(file), { mode: 0o600 });
}

export async function clearTokens(): Promise<void> {
  try {
    await fs.unlink(TOKEN_PATH);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') throw err;
  }
}

// ── Status helpers ─────────────────────────────────────────────────────

export interface SchwabStatus {
  connected: boolean;
  /** seconds until access token expiry (negative if expired) */
  accessTokenExpiresInSec: number | null;
  /** seconds until refresh token expiry (negative if expired) */
  refreshTokenExpiresInSec: number | null;
  /** whether this token is fresh enough to be used */
  needsReauth: boolean;
  scope?: string;
}

const REFRESH_TOKEN_LIFETIME_SEC = 7 * 24 * 3600; // Schwab: 7 days

export function describeStatus(tokens: SchwabTokens | null): SchwabStatus {
  if (!tokens) {
    return {
      connected: false,
      accessTokenExpiresInSec: null,
      refreshTokenExpiresInSec: null,
      needsReauth: false,
    };
  }
  const now = Date.now();
  const accessExpiresAt = tokens.obtained_at + tokens.expires_in * 1000;
  const refreshExpiresAt = tokens.refresh_token_obtained_at + REFRESH_TOKEN_LIFETIME_SEC * 1000;
  const accessTokenExpiresInSec = Math.floor((accessExpiresAt - now) / 1000);
  const refreshTokenExpiresInSec = Math.floor((refreshExpiresAt - now) / 1000);
  return {
    connected: true,
    accessTokenExpiresInSec,
    refreshTokenExpiresInSec,
    needsReauth: refreshTokenExpiresInSec <= 0,
    scope: tokens.scope,
  };
}
