/**
 * Adaptateurs de stockage.
 *
 * La persistance ne parle jamais directement à `localStorage` : elle passe par
 * `StorageAdapter`, ce qui permet un adaptateur mémoire dans les tests et une borne
 * de taille explicite par clé (le stockage local doit rester borné).
 */

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

/** Levée par l'adaptateur borné quand une valeur dépasse la taille maximale autorisée. */
export class StorageQuotaError extends Error {
  readonly key: string;
  readonly bytes: number;
  readonly maxBytes: number;

  constructor(key: string, bytes: number, maxBytes: number) {
    super(
      `Valeur trop volumineuse pour la clé « ${key} » : ${bytes} octets (maximum ${maxBytes}).`,
    );
    this.name = 'StorageQuotaError';
    this.key = key;
    this.bytes = bytes;
    this.maxBytes = maxBytes;
  }
}

/** Adaptateur en mémoire, utilisé par les tests et comme repli quand aucun stockage n'est disponible. */
export class MemoryStorage implements StorageAdapter {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }
}

const PROBE_KEY = 'lva:probe';
const PROBE_VALUE = 'ok';

/**
 * Enveloppe `localStorage` dans un `StorageAdapter`.
 * Retourne `null` si `localStorage` est absent, lève (mode privé, politique de sécurité,
 * quota nul) ou ne relit pas fidèlement une clé sonde.
 */
export function createLocalStorageAdapter(): StorageAdapter | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const store: Storage = localStorage;
    store.setItem(PROBE_KEY, PROBE_VALUE);
    const readBack = store.getItem(PROBE_KEY);
    store.removeItem(PROBE_KEY);
    if (readBack !== PROBE_VALUE) return null;

    return {
      getItem: (key) => store.getItem(key),
      setItem: (key, value) => {
        store.setItem(key, value);
      },
      removeItem: (key) => {
        store.removeItem(key);
      },
      keys: () => {
        const out: string[] = [];
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i);
          if (key !== null) out.push(key);
        }
        return out;
      },
    };
  } catch {
    return null;
  }
}

const encoder = new TextEncoder();

/** Taille UTF-8 d'une chaîne, en octets. */
export function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

/**
 * Borne la taille de chaque valeur écrite. Une valeur trop grande est refusée en levant
 * `StorageQuotaError` AVANT toute écriture : l'ancienne valeur de la clé reste intacte.
 */
export function createBoundedAdapter(
  inner: StorageAdapter,
  maxBytesPerKey = 512_000,
): StorageAdapter {
  return {
    getItem: (key) => inner.getItem(key),
    setItem: (key, value) => {
      const bytes = byteLength(value);
      if (bytes > maxBytesPerKey) throw new StorageQuotaError(key, bytes, maxBytesPerKey);
      inner.setItem(key, value);
    },
    removeItem: (key) => {
      inner.removeItem(key);
    },
    keys: () => inner.keys(),
  };
}
