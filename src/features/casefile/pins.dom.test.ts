// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINS_KEY, isPinned, readPins, togglePin } from './pins';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pins (lva:pins:v1)', () => {
  it('lit un tableau vide sans stockage préalable et garde une référence stable', () => {
    const a = readPins();
    expect(a).toEqual([]);
    expect(readPins()).toBe(a);
  });

  it('épingle et désépingle en écrivant un tableau JSON d’identifiants', () => {
    togglePin('e_camera_gap');
    togglePin('malik');
    expect(readPins()).toEqual(['e_camera_gap', 'malik']);
    expect(JSON.parse(window.localStorage.getItem(PINS_KEY) ?? '[]')).toEqual([
      'e_camera_gap',
      'malik',
    ]);
    expect(isPinned('malik')).toBe(true);
    togglePin('e_camera_gap');
    expect(readPins()).toEqual(['malik']);
    expect(isPinned('e_camera_gap')).toBe(false);
  });

  it('ignore un contenu illisible ou des entrées non textuelles', () => {
    window.localStorage.setItem(PINS_KEY, '{oops');
    expect(readPins()).toEqual([]);
    window.localStorage.setItem(PINS_KEY, JSON.stringify(['ok', 3, null, 'aussi']));
    expect(readPins()).toEqual(['ok', 'aussi']);
  });

  it('tolère un stockage qui refuse l’écriture : les épingles restent en mémoire', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    togglePin('f_count_complete');
    expect(readPins()).toEqual(['f_count_complete']);
    expect(setItem).toHaveBeenCalled();
    setItem.mockRestore();
    // Nettoyage : l'état mémoire est resynchronisé à la prochaine écriture réussie.
    togglePin('f_count_complete');
    expect(readPins()).toEqual([]);
  });
});
