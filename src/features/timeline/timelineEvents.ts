/**
 * Modèle d'affichage de la frise : événements datés (pièces, faits, hypothèses datées,
 * contradictions inspectables, coupure vidéo, obstructions, comptage) et géométrie
 * (temps ↔ position relative, rangées sans chevauchement). Tout est construit UNIQUEMENT
 * à partir de la vue joueur : ce qui n'est pas dans `PlayerView` n'existe pas ici.
 */
import type { Severity } from '@/domain/model/contradiction';
import type { Degree, PlayerView } from '@/domain/selectors/playerView';

export type TimelineEventKind =
  'evidence' | 'fact' | 'claim' | 'contradiction' | 'outage' | 'obstruction' | 'incident';

/** Intervalle en secondes simulées (non typé « Second » : usage d'affichage uniquement). */
export interface Span {
  start: number;
  end: number;
}

export interface TimelineEvent {
  /** Clé unique de rendu. */
  key: string;
  kind: TimelineEventKind;
  /** Identifiant de l'objet sélectionnable (pièce, fait, hypothèse, contradiction, zone). */
  id: string;
  label: string;
  /** Instant de l'événement (début pour un intervalle). */
  at: number;
  /** Fin de l'intervalle, ou null pour un événement ponctuel. */
  end: number | null;
  zoneIds: string[];
  participantIds: string[];
  degree: Degree | null;
  severity: Severity | null;
}

export type PositionSegmentView = PlayerView['positions']['segments'][number];

export const EVENT_KIND_LABELS: Record<TimelineEventKind, string> = {
  evidence: 'Pièce',
  fact: 'Fait',
  claim: 'Version',
  contradiction: 'Contradiction',
  outage: 'Coupure vidéo',
  obstruction: 'Obstruction connue',
  incident: 'Comptage',
};

export const EVENT_GLYPHS: Record<TimelineEventKind, string> = {
  evidence: '◆',
  fact: '■',
  claim: '◌',
  contradiction: '⚠',
  outage: '▮',
  obstruction: '▤',
  incident: '⏱',
};

const SEVERITY_ADJECTIVE: Record<Severity, string> = {
  notice: 'remarque',
  major: 'majeure',
  critical: 'critique',
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Position relative (0..1) d'un instant dans la fenêtre. */
export function ratioOf(t: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return clamp(t / durationSeconds, 0, 1);
}

/** Pourcentage CSS d'un instant (« 32.05% »). */
export function percentOf(t: number, durationSeconds: number): string {
  return `${(ratioOf(t, durationSeconds) * 100).toFixed(3)}%`;
}

/** Largeur CSS d'un intervalle, jamais négative. */
export function percentWidth(span: Span, durationSeconds: number): string {
  const width = ratioOf(span.end, durationSeconds) - ratioOf(span.start, durationSeconds);
  return `${(Math.max(0, width) * 100).toFixed(3)}%`;
}

/**
 * Instant correspondant à une position horizontale dans une piste.
 * Retourne null si la piste n'a pas de largeur mesurable (jsdom, élément masqué).
 */
export function timeFromPointer(
  clientX: number,
  rect: { left: number; width: number },
  durationSeconds: number,
): number | null {
  if (!(rect.width > 0)) return null;
  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
  return Math.round(ratio * durationSeconds);
}

/** Intervalles de la fenêtre NON couverts par `covered` (union, tri par début). */
export function complementSpans(covered: readonly Span[], durationSeconds: number): Span[] {
  const sorted = [...covered].filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start > cursor) out.push({ start: cursor, end: Math.min(s.start, durationSeconds) });
    cursor = Math.max(cursor, s.end);
    if (cursor >= durationSeconds) break;
  }
  if (cursor < durationSeconds) out.push({ start: cursor, end: durationSeconds });
  return out.filter((s) => s.end - s.start > 0);
}

/** Coupures vidéo connues : fenêtre − intervalles « caméra active ». */
export function outageSpans(view: PlayerView): Span[] {
  return complementSpans(view.positions.cameraOn, view.durationSeconds);
}

/** Intervalles où la position d'un personnage n'est ni établie, ni rapportée, ni proposée. */
export function unknownSpans(
  segments: readonly PositionSegmentView[],
  durationSeconds: number,
): Span[] {
  return complementSpans(
    segments
      .filter((s) => !s.transit)
      .map((s) => ({ start: s.interval.start, end: s.interval.end })),
    durationSeconds,
  );
}

/**
 * Répartit des intervalles (déjà triés par début) en rangées sans chevauchement
 * (algorithme glouton). Retourne l'indice de rangée de chaque intervalle.
 */
export function packRows(spans: readonly Span[]): number[] {
  const rowEnds: number[] = [];
  return spans.map((s) => {
    const row = rowEnds.findIndex((end) => end <= s.start);
    if (row === -1) {
      rowEnds.push(s.end);
      return rowEnds.length - 1;
    }
    rowEnds[row] = s.end;
    return row;
  });
}

/** Intervalle « visuel » d'un événement : un point occupe `pointSpan` secondes centrées sur lui. */
export function visualSpan(at: number, end: number | null, pointSpan: number): Span {
  if (end !== null && end > at) return { start: at, end: Math.max(end, at + pointSpan) };
  return { start: at - pointSpan / 2, end: at + pointSpan / 2 };
}

/** Libellé d'horaire : « 20:57:20 » ou « 20:57:20 → 21:01:40 ». */
export function formatWhen(clock: (t: number) => string, at: number, end: number | null): string {
  return end !== null && end > at ? `${clock(at)} → ${clock(end)}` : clock(at);
}

/** Nom lisible d'un événement pour un lecteur d'écran : « Pièce : Journal vidéo, 20:57:20 ». */
export function describeEvent(ev: TimelineEvent, clock: (t: number) => string): string {
  const head =
    ev.kind === 'fact'
      ? `Fait ${ev.degree === 'reported' ? 'rapporté' : 'établi'}`
      : ev.kind === 'contradiction' && ev.severity
        ? `Contradiction ${SEVERITY_ADJECTIVE[ev.severity]}`
        : EVENT_KIND_LABELS[ev.kind];
  return `${head} : ${ev.label}, ${formatWhen(clock, ev.at, ev.end)}`;
}

function zoneLabelOf(
  zoneLabels: ReadonlyMap<string, string>,
  zoneId: string | null | undefined,
): string | null {
  if (!zoneId) return null;
  return zoneLabels.get(zoneId) ?? zoneId;
}

/** Tous les événements datés visibles par le joueur, triés par instant. */
export function buildTimelineEvents(
  view: PlayerView,
  zoneLabels: ReadonlyMap<string, string>,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const characterIds = new Set(view.characters.map((c) => c.id as string));

  for (const e of view.evidence) {
    const m = e.marker;
    if (!m) continue;
    const at = m.at ?? m.interval?.start;
    if (at === undefined) continue;
    events.push({
      key: `evidence:${e.id}`,
      kind: 'evidence',
      id: e.id,
      label: e.label,
      at,
      end: m.interval && m.at === undefined ? m.interval.end : null,
      zoneIds: m.zoneId ? [m.zoneId] : [],
      participantIds: [],
      degree: e.degree,
      severity: null,
    });
  }

  for (const f of view.facts) {
    events.push({
      key: `fact:${f.id}`,
      kind: 'fact',
      id: f.id,
      label: f.label,
      at: f.interval.start,
      end: f.interval.end,
      zoneIds: f.zoneId ? [f.zoneId] : [],
      participantIds: [...f.participantIds],
      degree: f.degree,
      severity: null,
    });
  }

  for (const claim of Object.values(view.version.claims)) {
    if (!claim.interval) continue;
    const hypothesis = view.hypotheses.find((h) => h.id === claim.hypothesisId);
    const slot = view.slots.find((s) => s.id === claim.slotId);
    const actor = claim.actorId ? view.characters.find((c) => c.id === claim.actorId) : undefined;
    const zone = zoneLabelOf(zoneLabels, claim.zoneId);
    const details = [actor?.name, zone].filter((x): x is string => Boolean(x));
    const base = hypothesis?.label ?? slot?.label ?? claim.hypothesisId;
    events.push({
      key: `claim:${claim.slotId}`,
      kind: 'claim',
      id: claim.hypothesisId,
      label: details.length > 0 ? `${base} (${details.join(', ')})` : base,
      at: claim.interval.start,
      end: claim.interval.end,
      zoneIds: claim.zoneId ? [claim.zoneId] : [],
      participantIds: claim.actorId ? [claim.actorId] : [],
      degree: 'proposed',
      severity: null,
    });
  }

  for (const c of view.contradictions) {
    if (c.inspectableAt === undefined) continue;
    events.push({
      key: `contradiction:${c.id}`,
      kind: 'contradiction',
      id: c.id,
      label: c.title,
      at: c.inspectableAt,
      end: null,
      zoneIds: [...c.inspectableZoneIds],
      participantIds: c.involvedIds.filter((id) => characterIds.has(id)),
      degree: null,
      severity: c.severity,
    });
  }

  for (const [i, span] of outageSpans(view).entries()) {
    events.push({
      key: `outage:${i}`,
      kind: 'outage',
      id: `outage-${i}`,
      label: 'Flux vidéo absent',
      at: span.start,
      end: span.end,
      zoneIds: [],
      participantIds: [],
      degree: null,
      severity: null,
    });
  }

  for (const o of view.obstructions) {
    const zone = zoneLabelOf(zoneLabels, o.zoneId) ?? o.zoneId;
    events.push({
      key: `obstruction:${o.id}`,
      kind: 'obstruction',
      id: o.zoneId,
      label: `Passage obstrué — ${zone}`,
      at: o.interval.start,
      end: o.interval.end,
      zoneIds: [o.zoneId],
      participantIds: [],
      degree: null,
      severity: null,
    });
  }

  events.push({
    key: 'incident',
    kind: 'incident',
    id: 'incident',
    label: 'Comptage de fermeture',
    at: view.incidentAt,
    end: null,
    zoneIds: [],
    participantIds: [],
    degree: null,
    severity: null,
  });

  return events.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}

/** Premier événement strictement après `cursor`, ou null. */
export function nextEvent(events: readonly TimelineEvent[], cursor: number): TimelineEvent | null {
  return events.find((e) => e.at > cursor) ?? null;
}

/** Dernier événement strictement avant `cursor`, ou null. */
export function previousEvent(
  events: readonly TimelineEvent[],
  cursor: number,
): TimelineEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e && e.at < cursor) return e;
  }
  return null;
}
