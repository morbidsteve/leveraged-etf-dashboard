import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * API key infrastructure — server-side. Generates, stores, validates
 * keys for third-party access to the dashboard's REST API and webhooks.
 *
 * Storage: append-only JSON at /app/data/api-keys.json. Each key is
 * stored as { id, label, hash, createdAt, lastUsedAt, scopes, revoked }.
 * Plain key is shown to the user ONCE at creation time; only a SHA-256
 * hash is persisted. Comparison is constant-time.
 *
 * This is intentionally minimal — full multi-user requires a database;
 * this gets us read API access for the personal-deploy case.
 */

const DATA_DIR = process.env.WORKER_DATA_DIR ?? '/app/data';
const KEYS_FILE = path.join(DATA_DIR, 'api-keys.json');

export type ApiScope = 'read' | 'write' | 'admin';

export interface ApiKeyRecord {
  id: string;
  label: string;          // user-supplied label ("Mobile app", "Zapier", etc.)
  hash: string;           // SHA-256 of the raw key
  scopes: ApiScope[];
  createdAt: string;
  lastUsedAt?: string;
  revoked?: boolean;
}

export interface NewApiKey {
  id: string;
  label: string;
  raw: string;            // shown to user ONCE
  scopes: ApiScope[];
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadKeys(): Promise<ApiKeyRecord[]> {
  try {
    const text = await fs.readFile(KEYS_FILE, 'utf8');
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function saveKeys(keys: ApiKeyRecord[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8');
}

function genId(): string {
  return `ak-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function genRawKey(): string {
  // 32 bytes of randomness — base64url encoded ~43 chars
  return `etfd_${crypto.randomBytes(32).toString('base64url')}`;
}

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Create a new API key. Returns the record + the RAW key (only time
 * the caller sees it; we only persist the hash). */
export async function createApiKey(
  label: string,
  scopes: ApiScope[] = ['read']
): Promise<NewApiKey> {
  const raw = genRawKey();
  const id = genId();
  const record: ApiKeyRecord = {
    id,
    label: label.trim() || 'Unnamed key',
    hash: hashKey(raw),
    scopes,
    createdAt: new Date().toISOString(),
  };
  const all = await loadKeys();
  all.push(record);
  await saveKeys(all);
  return { id, label: record.label, raw, scopes };
}

/** List all keys (without the raw value, which we don't have). */
export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  return loadKeys();
}

/** Revoke a key by id (sets revoked: true; doesn't delete so the audit
 * trail is preserved). */
export async function revokeApiKey(id: string): Promise<boolean> {
  const all = await loadKeys();
  const key = all.find((k) => k.id === id);
  if (!key) return false;
  key.revoked = true;
  await saveKeys(all);
  return true;
}

/**
 * Validate a raw key against stored hashes. Returns the matching record
 * if valid + active, null otherwise. Constant-time comparison.
 */
export async function validateApiKey(
  raw: string,
  requiredScope: ApiScope = 'read'
): Promise<ApiKeyRecord | null> {
  if (!raw || !raw.startsWith('etfd_')) return null;
  const hash = hashKey(raw);
  const all = await loadKeys();
  for (const k of all) {
    if (k.revoked) continue;
    // constant-time compare
    if (
      k.hash.length === hash.length &&
      crypto.timingSafeEqual(Buffer.from(k.hash), Buffer.from(hash))
    ) {
      // Scope check
      if (k.scopes.includes('admin')) return k;
      if (k.scopes.includes(requiredScope)) return k;
      return null; // valid key but lacks required scope
    }
  }
  return null;
}

/** Update lastUsedAt — call after a successful API request. */
export async function touchApiKey(id: string): Promise<void> {
  const all = await loadKeys();
  const key = all.find((k) => k.id === id);
  if (!key) return;
  key.lastUsedAt = new Date().toISOString();
  await saveKeys(all);
}
