// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isScrollLocked, lockScroll } from './scrollLock';

describe('verrou de défilement', () => {
  it('verrouille le body, compte les références et restaure les styles', () => {
    document.body.style.overflow = 'auto';
    const a = lockScroll();
    expect(isScrollLocked()).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.dataset.scrollLocked).toBe('true');
    const b = lockScroll();
    a();
    expect(isScrollLocked()).toBe(true);
    b();
    expect(isScrollLocked()).toBe(false);
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.dataset.scrollLocked).toBeUndefined();
    // un double relâchement est sans effet
    b();
    expect(isScrollLocked()).toBe(false);
  });
});
