'use client';

/**
 * Local backup/restore of the entire dashboard state.
 * Bundles every persisted Zustand store into one JSON file so you can move
 * between devices without setting up a sync service.
 *
 * Format is versioned + tagged so we can migrate old backups in future.
 */

const PERSIST_KEYS = [
  'trade-storage',
  'alert-storage',
  'settings-storage',
  'strategy-storage',
  'paper-storage',
];

const SCHEMA_VERSION = 1;

export interface BackupBundle {
  schemaVersion: number;
  exportedAt: string;
  appName: 'leveraged-etf-dashboard';
  data: Record<string, unknown>;
}

export function exportBundle(): BackupBundle {
  const data: Record<string, unknown> = {};
  for (const key of PERSIST_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = raw;
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appName: 'leveraged-etf-dashboard',
    data,
  };
}

export function downloadBundle(): void {
  const bundle = exportBundle();
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.download = `etf-dashboard-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  ok: boolean;
  reason?: string;
  keysWritten: string[];
}

export function applyBundle(bundle: unknown): ImportResult {
  if (!isBackupBundle(bundle)) {
    return { ok: false, reason: 'Not a recognized backup file', keysWritten: [] };
  }
  if (bundle.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `Backup schema version ${bundle.schemaVersion} not supported (expected ${SCHEMA_VERSION})`,
      keysWritten: [],
    };
  }

  const written: string[] = [];
  for (const key of PERSIST_KEYS) {
    const value = bundle.data[key];
    if (value === undefined) continue;
    try {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      written.push(key);
    } catch (err) {
      return {
        ok: false,
        reason: `Failed to write ${key}: ${err instanceof Error ? err.message : String(err)}`,
        keysWritten: written,
      };
    }
  }
  return { ok: true, keysWritten: written };
}

function isBackupBundle(v: unknown): v is BackupBundle {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.schemaVersion === 'number' &&
    o.appName === 'leveraged-etf-dashboard' &&
    typeof o.data === 'object' &&
    o.data !== null
  );
}
