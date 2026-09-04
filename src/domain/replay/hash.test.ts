import { describe, expect, it } from 'vitest';
import { fnv1a, hashHex, mulberry32, seededId, semanticHash, stableStringify } from './hash';

describe('hachage déterministe', () => {
  it('sérialisation stable indépendante de l’ordre des clés, Set et Map compris', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(stableStringify({ a: [2, { c: 2, d: 1 }], b: 1 }));
    expect(stableStringify(new Set(['b', 'a']))).toBe('["a","b"]');
    expect(stableStringify(new Map([['b', 1], ['a', 2]]))).toBe('[["a",2],["b",1]]');
    expect(stableStringify(undefined)).toBe('undefined');
  });

  it('fnv1a et identifiants dérivés de la graine', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(hashHex('abc')).toBe(hashHex('abc'));
    expect(hashHex('abc')).not.toBe(hashHex('abd'));
    expect(seededId('seed', 3, 'j')).toBe(seededId('seed', 3, 'j'));
    expect(seededId('seed', 3, 'j')).not.toBe(seededId('seed', 4, 'j'));
    expect(semanticHash({ a: 1 })).toBe(semanticHash({ a: 1 }));
  });

  it('mulberry32 est reproductible et borné', () => {
    const a = mulberry32(17);
    const b = mulberry32(17);
    const xs = Array.from({ length: 5 }, () => a());
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});
