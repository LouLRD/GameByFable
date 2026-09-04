/**
 * Aides partagées du volet Version : libellés de cohérence, résolution d'identifiants
 * en libellés joueur, conversions horloge <-> secondes, résumés pour la région aria-live.
 * Ne lit que la vue joueur et les données publiques du plan (zones).
 */
import type { Zone } from '@/domain/model/scenario';
import type { PlayerView, VersionView } from '@/domain/selectors/playerView';
import type { GameStore, SelectionKind } from '@/state';
import { useGameStore } from '@/state';

/**
 * Accès aux actions du store hors abonnement React : les actions sont stables et ne
 * dépendent pas de `this`, on les appelle au moment du geste (`api().select(...)`).
 */
export const api = (): GameStore => useGameStore.getState();

export interface CoherenceDisplay {
  label: string;
  glyph: string;
}

const COHERENCE_DISPLAY: Record<string, CoherenceDisplay> = {
  incomplete: { label: 'incomplète', glyph: '◌' },
  impossible: { label: 'impossible', glyph: '✕' },
  contradicted: { label: 'contestée', glyph: '≠' },
  unsupported: { label: 'non étayée', glyph: '○' },
  coherent: { label: 'cohérente', glyph: '✓' },
};

export function coherenceDisplay(status: string): CoherenceDisplay {
  return COHERENCE_DISPLAY[status] ?? { label: status, glyph: '?' };
}

/** Genres de contradiction affectant la cohérence, dans l'ordre du GDD §9. */
export const KIND_ORDER = [
  'physical',
  'temporal',
  'sensory',
  'material',
  'epistemic',
  'discursive',
] as const;

export type CoherenceKind = (typeof KIND_ORDER)[number];

export const KIND_GROUP_TITLES: Record<CoherenceKind, string> = {
  physical: 'Physiques',
  temporal: 'Temporelles',
  sensory: 'Sensorielles',
  material: 'Matérielles',
  epistemic: 'Épistémiques',
  discursive: 'Discursives',
};

export const VERDICT_DISPLAY: Record<
  'signs' | 'refuses' | 'requests-change',
  { glyph: string; label: string }
> = {
  signs: { glyph: '✓', label: 'signerait' },
  refuses: { glyph: '✗', label: 'refuse de signer' },
  'requests-change': { glyph: '⟳', label: 'demande une modification' },
};

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/** Résumé concis d'une réévaluation, pour la région aria-live. */
export function describeVersion(version: VersionView): string {
  const blocking = version.blockingIds.length;
  const notices = version.noticeIds.length;
  const parts = [`cohérence ${coherenceDisplay(version.coherenceStatus).label}`];
  parts.push(plural(blocking, 'contradiction bloquante', 'contradictions bloquantes'));
  if (notices > 0) parts.push(plural(notices, 'remarque', 'remarques'));
  parts.push(`${version.signatureCount}/${version.adhesion.length} signeraient`);
  return `Version réévaluée : ${parts.join(', ')}.`;
}

export interface ResolvedRef {
  id: string;
  label: string;
  kind: SelectionKind | null;
}

/** Construit un résolveur identifiant → libellé joueur + genre de sélection. */
export function buildResolver(
  view: PlayerView,
  zones: readonly Zone[],
): (id: string) => ResolvedRef {
  const map = new Map<string, ResolvedRef>();
  for (const e of view.evidence) map.set(e.id, { id: e.id, label: e.label, kind: 'evidence' });
  for (const s of view.statements) {
    const text = s.text.length > 60 ? `${s.text.slice(0, 57)}…` : s.text;
    map.set(s.id, { id: s.id, label: `${s.speakerName} : « ${text} »`, kind: 'statement' });
  }
  for (const c of view.characters) map.set(c.id, { id: c.id, label: c.name, kind: 'character' });
  for (const h of view.hypotheses) {
    map.set(h.id, { id: h.id, label: `Hypothèse « ${h.label} »`, kind: 'hypothesis' });
  }
  for (const f of view.facts) map.set(f.id, { id: f.id, label: f.label, kind: 'fact' });
  for (const z of zones) map.set(z.id, { id: z.id, label: z.label, kind: 'zone' });
  for (const slot of view.slots) map.set(slot.id, { id: slot.id, label: slot.label, kind: null });
  return (id) => map.get(id) ?? { id, label: id, kind: null };
}

const CLOCK_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** "HH:MM:SS" (ou "HH:MM") → secondes depuis minuit ; null si le format est invalide. */
export function parseClockText(text: string): number | null {
  const m = CLOCK_RE.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3] ?? '0');
  if (h > 23 || min > 59 || s > 59) return null;
  return h * 3600 + min * 60 + s;
}

/** Horloge saisie → seconde simulée relative au début de la fenêtre ; null si invalide. */
export function clockToOffset(startClock: string, text: string): number | null {
  const abs = parseClockText(text);
  const start = parseClockText(startClock);
  if (abs === null || start === null) return null;
  return abs - start;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${min} min` : `${min} min ${rest} s`;
}

/** Identifiant DOM stable d'une carte d'emplacement (cible du focus « aller à l'emplacement »). */
export const slotCardDomId = (slotId: string): string => `slot-card-${slotId}`;

/** Défilement doux vers un élément, neutralisé en mouvement réduit et absent de jsdom. */
export function scrollTo(el: HTMLElement | null, reducedMotion: boolean): void {
  if (!el || reducedMotion || typeof el.scrollIntoView !== 'function') return;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
