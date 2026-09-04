/**
 * Modèle d'affichage du dossier : éléments homogènes (pièce, déclaration, personne, fait,
 * hypothèse, contradiction) construits UNIQUEMENT à partir de la vue joueur. Rien ici ne lit
 * le scénario brut : ce qui n'est pas dans `PlayerView` n'existe pas pour le dossier.
 */
import { useMemo } from 'react';
import type { PortraitState } from '@/components/portrait';
import { KIND_LABELS } from '@/components/ui';
import type { Severity } from '@/domain/model/contradiction';
import type { Approach } from '@/domain/model/scenario';
import type { CharacterView, Degree, PlayerView } from '@/domain/selectors/playerView';
import type { JournalEntry } from '@/domain/model/state';
import { useGameStore, type CasefileFilter } from '@/state';

export type CasefileItemKind =
  | 'evidence'
  | 'statement'
  | 'character'
  | 'fact'
  | 'hypothesis'
  | 'contradiction';

export interface CasefileItem {
  kind: CasefileItemKind;
  id: string;
  label: string;
  /** Degré affiché en badge ; null pour une personne ou une contradiction. */
  degree: Degree | null;
  /** Provenance courte : « Bureau », « Malik », « Caissier », « Origine de l'écart »… */
  provenance: string;
  /** Texte normalisé (sans accents, minuscules) pour la recherche. */
  haystack: string;
  severity?: Severity;
  contradictionKind?: string;
  trustState?: CharacterView['trustState'];
  /** Déclaration rétractée ou remplacée : affichée barrée. */
  historic?: boolean;
}

export const KIND_ORDER: readonly CasefileItemKind[] = [
  'evidence',
  'statement',
  'character',
  'fact',
  'hypothesis',
  'contradiction',
];

export const KIND_GLYPHS: Record<CasefileItemKind, string> = {
  evidence: '◆',
  statement: '❝',
  character: '☺',
  fact: '■',
  hypothesis: '⌂',
  contradiction: '⚠',
};

export const KIND_PLURAL: Record<CasefileItemKind, string> = {
  evidence: 'Pièces',
  statement: 'Déclarations',
  character: 'Personnes',
  fact: 'Faits',
  hypothesis: 'Hypothèses',
  contradiction: 'Contradictions',
};

export const KIND_SINGULAR: Record<CasefileItemKind, string> = {
  evidence: 'pièce',
  statement: 'déclaration',
  character: 'personne',
  fact: 'fait',
  hypothesis: 'hypothèse',
  contradiction: 'contradiction',
};

export const KIND_TO_FILTER: Record<CasefileItemKind, CasefileFilter> = {
  evidence: 'evidence',
  statement: 'statements',
  character: 'characters',
  fact: 'facts',
  hypothesis: 'hypotheses',
  contradiction: 'contradictions',
};

export const FILTER_ORDER: readonly CasefileFilter[] = [
  'all',
  'evidence',
  'statements',
  'characters',
  'facts',
  'hypotheses',
  'contradictions',
  'journal',
];

export const FILTER_LABELS: Record<CasefileFilter, string> = {
  all: 'Tout',
  evidence: 'Pièces',
  statements: 'Déclarations',
  characters: 'Personnes',
  facts: 'Faits',
  hypotheses: 'Hypothèses',
  contradictions: 'Contradictions',
  journal: 'Journal',
};

export const EMPTY_MESSAGES: Record<CasefileFilter, string> = {
  all: 'Le dossier est vide pour l’instant.',
  evidence: 'Aucune pièce ne correspond au filtre.',
  statements: 'Aucune déclaration ne correspond au filtre.',
  characters: 'Aucune personne ne correspond au filtre.',
  facts: 'Aucun fait n’est encore établi ni rapporté.',
  hypotheses: 'Aucune hypothèse n’est encore formulable.',
  contradictions: 'Aucune contradiction n’est relevée pour l’instant.',
  journal: 'Le journal est vide : aucune action n’a encore été consignée.',
};

export const TRUST_PORTRAIT_STATE: Record<CharacterView['trustState'], PortraitState> = {
  fermé: 'closed',
  prudent: 'careful',
  disponible: 'available',
  engagé: 'engaged',
};

export const TRUST_GLYPHS: Record<CharacterView['trustState'], string> = {
  fermé: '✕',
  prudent: '◔',
  disponible: '◑',
  engagé: '●',
};

export const APPROACH_LABELS: Record<Approach, string> = {
  neutral: 'neutre',
  empathetic: 'empathique',
  direct: 'directe',
};

export const APPROACHES: readonly Approach[] = ['neutral', 'empathetic', 'direct'];

export const MODALITY_LABELS: Record<string, string> = {
  visual: 'vue',
  audio: 'ouïe',
  reported: 'rapporté',
};

export const FIDELITY_LABELS: Record<string, string> = {
  exact: 'nette',
  partial: 'partielle',
  ambiguous: 'ambiguë',
};

export const JOURNAL_KIND_LABELS: Record<JournalEntry['kind'], string> = {
  claim: 'version',
  clear: 'version',
  attach: 'rapport',
  confrontation: 'confrontation',
  probe: 'sondage',
  revelation: 'révélation',
  'round-table': 'table ronde',
  seal: 'scellé',
  annotation: 'annotation',
  pressure: 'pression',
};

/** Normalisation pour la recherche : sans accents, en minuscules. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function firstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}

/** "HH:MM:SS" → "HH:MM" pour les métadonnées compactes. */
export function shortClock(clock: string): string {
  return clock.length >= 5 ? clock.slice(0, 5) : clock;
}

/** Vrai en pile mobile / tablette (≤ 1023 px) : les bascules d'espace n'ont de sens que là. */
export function isCompactViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 1023px)').matches
  );
}

/** Libellés des zones du plan (données publiques du scénario). */
export function useZoneLabels(): ReadonlyMap<string, string> {
  const scenario = useGameStore((s) => s.scenario);
  return useMemo(
    () => new Map<string, string>((scenario?.data.zones ?? []).map((z): [string, string] => [z.id, z.label])),
    [scenario],
  );
}

export function buildCasefileItems(
  view: PlayerView,
  zoneLabels: ReadonlyMap<string, string>,
): CasefileItem[] {
  const zone = (id: string | null | undefined): string | null =>
    id ? (zoneLabels.get(id) ?? id) : null;
  const items: CasefileItem[] = [];

  for (const e of view.evidence) {
    const provenance = e.degree === 'deduced' ? 'déduit' : (zone(e.marker?.zoneId) ?? 'relevé');
    items.push({
      kind: 'evidence',
      id: e.id,
      label: e.label,
      degree: e.degree,
      provenance,
      haystack: normalizeText(
        [e.label, e.playerText, e.marker?.label ?? '', ...e.supportsLabels, ...e.excludesLabels].join(' '),
      ),
    });
  }

  for (const s of view.statements) {
    const item: CasefileItem = {
      kind: 'statement',
      id: s.id,
      label: s.propositionLabel,
      degree: s.degree,
      provenance: firstName(s.speakerName),
      haystack: normalizeText(`${s.speakerName} ${s.text} ${s.propositionLabel}`),
    };
    if (!s.standing) item.historic = true;
    items.push(item);
  }

  for (const c of view.characters) {
    items.push({
      kind: 'character',
      id: c.id,
      label: c.name,
      degree: null,
      provenance: c.role,
      haystack: normalizeText(`${c.name} ${c.role} ${c.pronouns} ${c.trustState}`),
      trustState: c.trustState,
    });
  }

  for (const f of view.facts) {
    const place = zone(f.zoneId);
    const when = shortClock(view.clock(f.interval.start));
    items.push({
      kind: 'fact',
      id: f.id,
      label: f.label,
      degree: f.degree,
      provenance: place ? `${place} · ${when}` : when,
      haystack: normalizeText(`${f.label} ${place ?? ''}`),
    });
  }

  const slotLabel = new Map<string, string>(view.slots.map((s): [string, string] => [s.id, s.label]));
  for (const h of view.hypotheses) {
    const slot = slotLabel.get(h.slotId) ?? h.slotId;
    items.push({
      kind: 'hypothesis',
      id: h.id,
      label: h.label,
      degree: 'proposed',
      provenance: slot,
      haystack: normalizeText(`${h.label} ${h.summary} ${slot}`),
    });
  }

  const seen = new Set<string>();
  for (const c of [...view.contradictions, ...view.motivational]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const kindLabel = KIND_LABELS[c.kind] ?? c.kind;
    items.push({
      kind: 'contradiction',
      id: c.id,
      label: c.title,
      degree: null,
      provenance: kindLabel,
      haystack: normalizeText(`${c.title} ${kindLabel}`),
      severity: c.severity,
      contradictionKind: c.kind,
    });
  }

  return items;
}

/** Résout un identifiant de référence (journal) vers un élément du dossier, s'il est visible. */
export function resolveRef(view: PlayerView, id: string): { kind: CasefileItemKind; label: string } | null {
  const e = view.evidence.find((x) => x.id === id);
  if (e) return { kind: 'evidence', label: e.label };
  const s = view.statements.find((x) => x.id === id);
  if (s) return { kind: 'statement', label: `${firstName(s.speakerName)} : ${s.propositionLabel}` };
  const c = view.characters.find((x) => x.id === id);
  if (c) return { kind: 'character', label: c.name };
  const h = view.hypotheses.find((x) => x.id === id);
  if (h) return { kind: 'hypothesis', label: h.label };
  const f = view.facts.find((x) => x.id === id);
  if (f) return { kind: 'fact', label: f.label };
  const k = [...view.contradictions, ...view.motivational].find((x) => x.id === id);
  if (k) return { kind: 'contradiction', label: k.title };
  return null;
}
