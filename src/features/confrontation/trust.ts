/**
 * Présentation de l'état de confiance (GDD §6.4) : glyphe + libellé + état de portrait.
 * L'ordre permet de comparer deux états sans manipuler la valeur numérique du moteur.
 */
import type { PortraitState } from '@/components/portrait';
import type { CharacterView } from '@/domain/selectors/playerView';

export type TrustLabel = CharacterView['trustState'];

export const TRUST_ORDER: readonly TrustLabel[] = ['fermé', 'prudent', 'disponible', 'engagé'];

/** Glyphes distincts par état : le sens n'est jamais porté par la couleur seule. */
export const TRUST_GLYPH: Record<TrustLabel, string> = {
  fermé: '⊘',
  prudent: '◔',
  disponible: '◑',
  engagé: '●',
};

export const TRUST_PORTRAIT: Record<TrustLabel, PortraitState> = {
  fermé: 'closed',
  prudent: 'careful',
  disponible: 'available',
  engagé: 'engaged',
};

/** Rang ordinal d'un état (0 = fermé … 3 = engagé). */
export function trustRank(label: TrustLabel): number {
  return TRUST_ORDER.indexOf(label);
}

/**
 * Vrai si l'état courant est strictement inférieur à l'état requis. Comme la fonction
 * d'état du moteur est monotone, un rang inférieur implique une confiance inférieure au seuil.
 */
export function trustBelow(current: TrustLabel, required: TrustLabel): boolean {
  return trustRank(current) < trustRank(required);
}
