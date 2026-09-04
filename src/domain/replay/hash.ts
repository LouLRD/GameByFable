/**
 * Hachage déterministe (FNV-1a 32 bits) et sérialisation stable pour :
 * - les identifiants dérivés de la graine et de l'index d'action ;
 * - le hash sémantique d'un état (tests d'invariants).
 */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const hashHex = (input: string): string => fnv1a(input).toString(16).padStart(8, '0');

/** JSON.stringify avec clés d'objet triées (ordre indépendant de l'insertion). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  if (value instanceof Set) return stableStringify([...value].sort());
  if (value instanceof Map) return stableStringify([...value.entries()].sort());
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export const semanticHash = (value: unknown): string => hashHex(stableStringify(value));

/** Identifiant dérivé de la graine et de l'index d'action (jamais aléatoire). */
export function seededId(seed: string, actionIndex: number, salt: string): string {
  return `${salt}-${hashHex(`${seed}:${actionIndex}:${salt}`)}`;
}

/** PRNG déterministe (mulberry32) pour les besoins purement cosmétiques dérivés de la graine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
