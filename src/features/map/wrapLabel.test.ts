import { describe, expect, it } from 'vitest';
import { wrapLabel } from './mapModel';

describe('wrapLabel', () => {
  it('garde un libellé court sur une ligne', () => {
    expect(wrapLabel('Caisses', 10)).toEqual(['Caisses']);
    expect(wrapLabel('Rayon 1', 10)).toEqual(['Rayon 1']);
  });

  it('coupe sur les espaces quand la limite est dépassée', () => {
    expect(wrapLabel('Allée froide', 7)).toEqual(['Allée', 'froide']);
    expect(wrapLabel('Salle de pause', 9)).toEqual(['Salle de', 'pause']);
    expect(wrapLabel('Salle de pause', 5)).toEqual(['Salle', 'de', 'pause']);
  });

  it('ne coupe jamais un mot, même plus long que la limite', () => {
    expect(wrapLabel('Bureau', 4)).toEqual(['Bureau']);
    expect(wrapLabel('Quai déchargement', 4)).toEqual(['Quai', 'déchargement']);
  });

  it('tolère les espaces multiples et les libellés vides', () => {
    expect(wrapLabel('  Salle   de  pause ', 8)).toEqual(['Salle de', 'pause']);
    expect(wrapLabel('', 8)).toEqual(['']);
  });
});
