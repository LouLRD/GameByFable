import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryStorage,
  StorageQuotaError,
  byteLength,
  createBoundedAdapter,
  createLocalStorageAdapter,
} from './storage';

describe('MemoryStorage', () => {
  it('stocke, relit, liste et supprime des clés', () => {
    const store = new MemoryStorage();
    expect(store.getItem('a')).toBeNull();
    store.setItem('a', '1');
    store.setItem('b', '2');
    expect(store.getItem('a')).toBe('1');
    expect(store.keys().sort()).toEqual(['a', 'b']);
    store.removeItem('a');
    expect(store.getItem('a')).toBeNull();
    expect(store.keys()).toEqual(['b']);
  });
});

describe('createBoundedAdapter', () => {
  it('laisse passer une valeur sous la borne et refuse au-delà sans écrire', () => {
    const inner = new MemoryStorage();
    const bounded = createBoundedAdapter(inner, 10);
    bounded.setItem('k', '0123456789');
    expect(inner.getItem('k')).toBe('0123456789');

    expect(() => {
      bounded.setItem('k', '01234567890');
    }).toThrow(StorageQuotaError);
    expect(inner.getItem('k')).toBe('0123456789');
  });

  it('mesure la taille en octets UTF-8 et la reporte dans l’erreur', () => {
    const bounded = createBoundedAdapter(new MemoryStorage(), 4);
    expect(byteLength('é')).toBe(2);
    let caught: unknown;
    try {
      bounded.setItem('clé', 'ééé');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StorageQuotaError);
    const quota = caught as StorageQuotaError;
    expect(quota.name).toBe('StorageQuotaError');
    expect(quota.key).toBe('clé');
    expect(quota.bytes).toBe(6);
    expect(quota.maxBytes).toBe(4);
  });

  it('délègue lecture, suppression et liste à l’adaptateur interne', () => {
    const inner = new MemoryStorage();
    inner.setItem('x', 'y');
    const bounded = createBoundedAdapter(inner);
    expect(bounded.getItem('x')).toBe('y');
    expect(bounded.keys()).toEqual(['x']);
    bounded.removeItem('x');
    expect(inner.keys()).toEqual([]);
  });
});

describe('createLocalStorageAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retourne null quand localStorage est absent', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(createLocalStorageAdapter()).toBeNull();
  });

  it('retourne null quand localStorage lève à l’écriture', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('SecurityError');
      },
      getItem: () => null,
      removeItem: () => undefined,
      key: () => null,
      length: 0,
    });
    expect(createLocalStorageAdapter()).toBeNull();
  });

  it('retourne null quand la clé sonde n’est pas relue fidèlement', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => undefined,
      getItem: () => null,
      removeItem: () => undefined,
      key: () => null,
      length: 0,
    });
    expect(createLocalStorageAdapter()).toBeNull();
  });

  it('enveloppe un stockage fonctionnel et nettoie la clé sonde', () => {
    const backing = new Map<string, string>();
    const fake = {
      setItem: (k: string, v: string) => backing.set(k, v),
      getItem: (k: string) => backing.get(k) ?? null,
      removeItem: (k: string) => backing.delete(k),
      key: (i: number) => [...backing.keys()][i] ?? null,
      get length() {
        return backing.size;
      },
    };
    vi.stubGlobal('localStorage', fake);

    const adapter = createLocalStorageAdapter();
    expect(adapter).not.toBeNull();
    expect(backing.has('lva:probe')).toBe(false);

    adapter?.setItem('lva:v1:auto', '{}');
    expect(adapter?.getItem('lva:v1:auto')).toBe('{}');
    expect(adapter?.keys()).toEqual(['lva:v1:auto']);
    adapter?.removeItem('lva:v1:auto');
    expect(backing.size).toBe(0);
  });
});
