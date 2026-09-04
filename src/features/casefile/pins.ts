/**
 * Épingles du dossier : identifiants d'éléments que le joueur garde en tête de liste.
 * Préférence d'affichage pure (aucune logique métier) conservée dans `localStorage` sous la clé
 * `lva:pins:v1` (tableau JSON d'identifiants) et exposée par `useSyncExternalStore`.
 * Sans stockage (navigation privée, quota, API absente), les épingles vivent en mémoire.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';

export const PINS_KEY = 'lva:pins:v1';

const listeners = new Set<() => void>();
const EMPTY: readonly string[] = [];

/** Repli mémoire quand le stockage est indisponible ou a refusé la dernière écriture. */
let memory: readonly string[] = EMPTY;
let writeFailed = false;
/** Dernière valeur brute lue : évite de reconstruire le tableau tant que rien n'a changé. */
let cachedRaw: string | null | undefined;
let cachedPins: readonly string[] = EMPTY;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function parse(raw: string | null): readonly string[] {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Épingles courantes (référence stable tant que le contenu ne change pas). */
export function readPins(): readonly string[] {
  const store = storage();
  if (!store || writeFailed) return memory;
  let raw: string | null;
  try {
    raw = store.getItem(PINS_KEY);
  } catch {
    return memory;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPins = parse(raw);
  }
  return cachedPins;
}

function write(pins: readonly string[]): void {
  memory = pins;
  const raw = JSON.stringify(pins);
  cachedRaw = raw;
  cachedPins = pins;
  const store = storage();
  if (store) {
    try {
      store.setItem(PINS_KEY, raw);
      writeFailed = false;
    } catch {
      // stockage plein ou refusé : les épingles restent en mémoire pour la session
      writeFailed = true;
    }
  }
  for (const listener of listeners) listener();
}

export function isPinned(id: string): boolean {
  return readPins().includes(id);
}

export function togglePin(id: string): void {
  const current = readPins();
  write(current.includes(id) ? current.filter((p) => p !== id) : [...current, id]);
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent): void => {
    if (e.key === null || e.key === PINS_KEY) onChange();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

const serverSnapshot = (): readonly string[] => EMPTY;

export interface Pins {
  /** Identifiants épinglés, dans l'ordre d'épinglage. */
  pins: readonly string[];
  pinnedSet: ReadonlySet<string>;
  isPinned: (id: string) => boolean;
  toggle: (id: string) => void;
}

export function usePins(): Pins {
  const pins = useSyncExternalStore(subscribe, readPins, serverSnapshot);
  const pinnedSet = useMemo(() => new Set(pins), [pins]);
  const has = useCallback((id: string) => pinnedSet.has(id), [pinnedSet]);
  return { pins, pinnedSet, isPinned: has, toggle: togglePin };
}
