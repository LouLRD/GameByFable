/**
 * Libellés français de la conclusion (verdicts, familles de fin, cohérence, journal).
 * Séparés des composants pour le rechargement à chaud.
 */
import type { PortraitState } from '@/components/portrait';
import type { EndingFamily } from '@/domain/model/scenario';
import type { JournalEntry } from '@/domain/model/state';
import type { EpilogueCharacterView } from '@/domain/selectors/epilogue';

export type SignatureVerdict = 'signs' | 'signs-silently' | 'refuses' | 'requests-change';

export const VERDICT_LABELS: Record<SignatureVerdict, string> = {
  signs: 'signe',
  'signs-silently': 'signe sans un mot',
  refuses: 'refuse',
  'requests-change': 'demande une modification',
};

export const VERDICT_GLYPHS: Record<SignatureVerdict, string> = {
  signs: '✓',
  'signs-silently': '✓',
  refuses: '✗',
  'requests-change': '⟳',
};

export const VERDICT_PORTRAIT: Record<SignatureVerdict, PortraitState> = {
  signs: 'engaged',
  'signs-silently': 'available',
  refuses: 'closed',
  'requests-change': 'careful',
};

export const OUTCOME_TO_VERDICT: Record<EpilogueCharacterView['outcome'], SignatureVerdict> = {
  signed: 'signs',
  'signed-silently': 'signs-silently',
  refused: 'refuses',
  'requested-change': 'requests-change',
};

export const FAMILY_LABELS: Record<EndingFamily, string> = {
  truth: 'Vérité',
  consensus: 'Consensus',
  accusation: 'Accusation',
  incomplete: 'Classement',
  rejected: 'Rejet',
};

export const COHERENCE_LABELS: Record<string, string> = {
  incomplete: 'Version incomplète',
  impossible: 'Version impossible : au moins une hypothèse est physiquement exclue',
  contradicted: 'Version contredite par des pièces ou des déclarations',
  unsupported: 'Version possible, mais non étayée par les pièces',
  coherent: 'Version cohérente',
};

export const JOURNAL_KIND_LABELS: Record<JournalEntry['kind'], string> = {
  claim: 'hypothèse',
  clear: 'retrait',
  attach: 'pièce',
  confrontation: 'confrontation',
  probe: 'sondage',
  revelation: 'révélation',
  'round-table': 'table ronde',
  seal: 'sceau',
  annotation: 'annotation',
  pressure: 'pression',
};

/** Accord singulier / pluriel (le zéro reste au singulier en français). */
export function plural(n: number, singular: string, pluralForm: string): string {
  return n > 1 ? pluralForm : singular;
}
