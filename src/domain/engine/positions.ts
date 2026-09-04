/**
 * Modèle de positions du monde proposé.
 *
 * Trois statuts : établi (caméra, pièce, fait révélé), rapporté (déclaration debout),
 * proposé (claim du joueur). Les intervalles non couverts sont INCONNUS : un monde
 * incomplet n'est pas un monde faux.
 */
import type { CharacterId, StatementId, ZoneId } from '../model/ids';
import type { LoadedScenario, PropositionSemantics } from '../model/scenario';
import { interval, intervalsOverlap, sec, type Interval } from '../model/time';
import type { ExplanationStep } from '../model/contradiction';
import type { PlayerClaim } from '../model/version';
import { canonicalWorld, shortestTravelTime, traceRoute, type WorldState } from './spatial';

export type PositionStatus = 'established' | 'reported' | 'proposed';
export type PositionSource = 'camera' | 'evidence' | 'fact' | 'statement' | 'claim';

export interface PositionSegment {
  characterId: CharacterId;
  zoneId: ZoneId;
  interval: Interval;
  status: PositionStatus;
  source: PositionSource;
  sourceIds: string[];
  /** Présence ponctuelle vue en transit par la caméra. */
  transit: boolean;
  /** Déclaration « restée tout le temps » : exclut toute autre zone sur l'intervalle. */
  continuous: boolean;
}

export interface PositionModel {
  segments: PositionSegment[];
  byCharacter: ReadonlyMap<CharacterId, PositionSegment[]>;
  /** Intervalles (caméra active) pendant lesquels le personnage n'est dans aucune zone couverte. */
  absences: ReadonlyMap<CharacterId, Interval[]>;
  cameraOn: Interval[];
  coveredZones: ReadonlySet<ZoneId>;
}

/** Intervalles de fonctionnement de la caméra = fenêtre − coupure publique. */
export function cameraOnIntervals(scenario: LoadedScenario): Interval[] {
  const duration = scenario.data.scenario.timeline.durationSeconds;
  const gapMarker = scenario.index.evidenceMarkers.get(scenario.data.extension.cameraCoverage.gapEvidenceId);
  const gap = gapMarker?.interval;
  if (!gap) return [interval(0, duration)];
  const out: Interval[] = [];
  if (gap.start > 0) out.push(interval(0, gap.start));
  if (gap.end < duration) out.push(interval(gap.end, duration));
  return out;
}

function overlapsPoint(seg: Interval, point: number): boolean {
  return seg.start <= point && point < seg.end;
}

export function segmentsOverlap(a: PositionSegment, b: Interval): boolean {
  if (a.transit) return overlapsPoint(b, a.interval.start);
  if (b.start === b.end) return overlapsPoint(a.interval, b.start);
  return intervalsOverlap(a.interval, b);
}

function subtract(base: Interval, cuts: Interval[]): Interval[] {
  let pieces: Interval[] = [base];
  for (const c of cuts) {
    const next: Interval[] = [];
    for (const p of pieces) {
      if (!intervalsOverlap(p, c)) {
        next.push(p);
        continue;
      }
      if (p.start < c.start) next.push(interval(p.start, c.start));
      if (c.end < p.end) next.push(interval(c.end, p.end));
    }
    pieces = next;
  }
  return pieces.filter((p) => p.end - p.start > 0);
}

/**
 * Positions établies par la caméra : segments canoniques dans les zones couvertes hors coupure,
 * et passages ponctuels en transit dans une zone couverte (itinéraire canonique le plus court).
 * Dérivation mécanique : la caméra ne « sait » rien d'autre que ce qu'elle filme.
 */
export function deriveCameraSegments(scenario: LoadedScenario): { segments: PositionSegment[]; absences: Map<CharacterId, Interval[]> } {
  const covered = new Set(scenario.data.extension.cameraCoverage.zoneIds);
  const cameraOn = cameraOnIntervals(scenario);
  const cameraEvidenceId = scenario.data.extension.cameraCoverage.gapEvidenceId;
  const world = canonicalWorld(scenario);
  const segments: PositionSegment[] = [];
  const absences = new Map<CharacterId, Interval[]>();

  for (const track of scenario.data.movementTracks) {
    const seen: Interval[] = [];
    for (const sgm of track.segments) {
      if (!covered.has(sgm.zoneId)) continue;
      for (const on of cameraOn) {
        const start = Math.max(sgm.start, on.start);
        const end = Math.min(sgm.end, on.end);
        if (start < end) {
          const iv = interval(start, end);
          segments.push({
            characterId: track.characterId,
            zoneId: sgm.zoneId,
            interval: iv,
            status: 'established',
            source: 'camera',
            sourceIds: [cameraEvidenceId],
            transit: false,
            continuous: false,
          });
          seen.push(iv);
        }
      }
    }
    for (let i = 1; i < track.segments.length; i += 1) {
      const a = track.segments[i - 1];
      const b = track.segments[i];
      if (!a || !b) continue;
      const route = traceRoute(a.zoneId, b.zoneId, a.end, scenario, world);
      if (!route) continue;
      for (const step of route.steps) {
        if (step.to === b.zoneId) continue;
        if (!covered.has(step.to)) continue;
        const t = step.arriveAt;
        if (!cameraOn.some((on) => overlapsPoint(on, t))) continue;
        segments.push({
          characterId: track.characterId,
          zoneId: step.to,
          interval: interval(t, t),
          status: 'established',
          source: 'camera',
          sourceIds: [cameraEvidenceId],
          transit: true,
          continuous: false,
        });
        seen.push(interval(t, t + 1));
      }
    }
    const abs: Interval[] = [];
    for (const on of cameraOn) abs.push(...subtract(on, seen));
    absences.set(track.characterId, abs);
  }
  segments.sort(compareSegments);
  return { segments, absences };
}

function compareSegments(a: PositionSegment, b: PositionSegment): number {
  if (a.characterId !== b.characterId) return a.characterId < b.characterId ? -1 : 1;
  if (a.interval.start !== b.interval.start) return a.interval.start - b.interval.start;
  if (a.interval.end !== b.interval.end) return a.interval.end - b.interval.end;
  return a.zoneId < b.zoneId ? -1 : a.zoneId > b.zoneId ? 1 : 0;
}

/** Présences impliquées par la sémantique d'une proposition (pour une déclaration debout). */
export function presencesFromSemantics(
  sem: PropositionSemantics,
  statementId: StatementId,
  speakerId: CharacterId,
): PositionSegment[] {
  const mk = (characterId: CharacterId, zoneId: ZoneId, iv: Interval, continuous = false): PositionSegment => ({
    characterId,
    zoneId,
    interval: iv,
    status: 'reported',
    source: 'statement',
    sourceIds: [statementId],
    transit: false,
    continuous,
  });
  switch (sem.type) {
    case 'presence':
      return [mk(sem.characterId, sem.zoneId, sem.interval)];
    case 'continuous-presence':
      return [mk(sem.characterId, sem.zoneId, sem.interval, true)];
    case 'event':
      return sem.actorId && sem.zoneId && sem.interval && sem.requiresPresence ? [mk(sem.actorId, sem.zoneId, sem.interval)] : [];
    case 'sound':
      return sem.actorId && sem.zoneId && sem.interval ? [mk(sem.actorId, sem.zoneId, sem.interval)] : [];
    case 'perceived': {
      const out: PositionSegment[] = [];
      if (sem.observerZoneId) out.push(mk(sem.observerId, sem.observerZoneId, sem.target.interval));
      if (sem.target.characterId && sem.target.characterId !== speakerId) out.push(mk(sem.target.characterId, sem.target.zoneId, sem.target.interval));
      return out;
    }
    case 'absence':
    case 'object-location':
    case 'assertion':
      return [];
  }
}

/** Présence impliquée par une claim paramétrée (acteur + zone + intervalle). */
export function presenceFromClaim(claim: PlayerClaim, requiresPresence: boolean): PositionSegment | null {
  if (!requiresPresence || !claim.actorId || !claim.zoneId || !claim.interval) return null;
  return {
    characterId: claim.actorId,
    zoneId: claim.zoneId,
    interval: claim.interval,
    status: 'proposed',
    source: 'claim',
    sourceIds: [claim.hypothesisId],
    transit: false,
    continuous: false,
  };
}

export function buildPositionModel(
  scenario: LoadedScenario,
  camera: { segments: PositionSegment[]; absences: Map<CharacterId, Interval[]> },
  extra: PositionSegment[],
): PositionModel {
  const segments = [...camera.segments, ...extra].sort(compareSegments);
  const byCharacter = new Map<CharacterId, PositionSegment[]>();
  for (const c of scenario.data.characters) byCharacter.set(c.id, []);
  for (const s of segments) {
    const list = byCharacter.get(s.characterId) ?? [];
    list.push(s);
    byCharacter.set(s.characterId, list);
  }
  return {
    segments,
    byCharacter,
    absences: camera.absences,
    cameraOn: cameraOnIntervals(scenario),
    coveredZones: new Set(scenario.data.extension.cameraCoverage.zoneIds),
  };
}

// ---------------------------------------------------------------------------
// canOccupy
// ---------------------------------------------------------------------------

export type OccupancyStatus = 'established' | 'possible' | 'reported-elsewhere' | 'impossible';

/**
 * Tolérances (secondes). Les chevauchements avec une position établie dans une AUTRE zone
 * restent stricts. Voir DECISIONS.md.
 * - bord de zone : une absence caméra qui ne dépasse pas cette marge n'est pas retenue
 *   (une personne au bord du champ, en train de sortir) ;
 * - trajet : marge d'estimation des durées de traversée.
 */
export const CAMERA_EDGE_TOLERANCE_SECONDS = 12;
export const TRAVEL_TOLERANCE_SECONDS = 3;
/** @deprecated alias historique de la tolérance de bord de zone. */
export const TOLERANCE_SECONDS = CAMERA_EDGE_TOLERANCE_SECONDS;

export interface OccupancyConflict {
  kind: 'overlap' | 'absence' | 'arrival-too-late' | 'departure-too-late' | 'reported-overlap';
  segment?: PositionSegment;
  steps: ExplanationStep[];
  /** Instant à inspecter sur la frise. */
  at: number;
  zoneIds: ZoneId[];
}

export interface OccupancyResult {
  status: OccupancyStatus;
  conflicts: OccupancyConflict[];
  supportingSegments: PositionSegment[];
}

/**
 * Le personnage peut-il occuper `zoneId` pendant `iv` compte tenu des positions établies,
 * des absences caméra et des durées de trajet (obstructions connues comprises) ?
 * `ignoreSourceIds` permet d'exclure la source évaluée elle-même (une déclaration ou une claim).
 */
export function canOccupy(
  characterId: CharacterId,
  zoneId: ZoneId,
  iv: Interval,
  model: PositionModel,
  scenario: LoadedScenario,
  world: WorldState,
  ignoreSourceIds: readonly string[] = [],
): OccupancyResult {
  const all = (model.byCharacter.get(characterId) ?? []).filter((s) => !s.sourceIds.some((id) => ignoreSourceIds.includes(id)));
  const established = all.filter((s) => s.status === 'established');
  const reported = all.filter((s) => s.status === 'reported');
  const conflicts: OccupancyConflict[] = [];
  const supporting: PositionSegment[] = [];

  // 1. Chevauchement avec une position établie ailleurs
  for (const s of established) {
    if (!segmentsOverlap(s, iv)) continue;
    if (s.zoneId === zoneId) {
      supporting.push(s);
      continue;
    }
    conflicts.push({
      kind: 'overlap',
      segment: s,
      at: Math.max(s.interval.start, iv.start),
      zoneIds: [s.zoneId, zoneId],
      steps: [
        { type: 'position', characterId, zoneId: s.zoneId, interval: s.interval, source: s.source === 'camera' ? 'camera' : s.source === 'fact' ? 'fact' : 'evidence' },
        { type: 'overlap', characterId, a: { zoneId: s.zoneId, interval: s.interval }, b: { zoneId, interval: iv } },
      ],
    });
  }
  // 2. Absence des zones couvertes pendant que la caméra tourne
  if (model.coveredZones.has(zoneId)) {
    for (const abs of model.absences.get(characterId) ?? []) {
      if (!intervalsOverlap(abs, iv) && !(iv.start === iv.end && overlapsPoint(abs, iv.start))) continue;
      const overlapLength = Math.min(abs.end, iv.end) - Math.max(abs.start, iv.start);
      if (iv.start !== iv.end && overlapLength <= CAMERA_EDGE_TOLERANCE_SECONDS) continue;
      conflicts.push({
        kind: 'absence',
        at: Math.max(abs.start, iv.start),
        zoneIds: [zoneId],
        steps: [
          { type: 'absent-from-camera', characterId, interval: abs },
          { type: 'text', text: `La zone visée est filmée : la présence y serait visible.` },
        ],
      });
    }
  }
  // 3. Accessibilité depuis l'ancre établie précédente
  const before = established
    .filter((s) => s.zoneId !== zoneId && (s.transit ? s.interval.start <= iv.start : s.interval.end <= iv.start))
    .sort((a, b) => (a.transit ? a.interval.start : a.interval.end) - (b.transit ? b.interval.start : b.interval.end))
    .at(-1);
  if (before && conflicts.every((c) => c.kind !== 'overlap')) {
    const tA = before.transit ? before.interval.start : before.interval.end;
    const route = traceRoute(before.zoneId, zoneId, tA, scenario, world);
    const travel = route ? route.seconds : Number.POSITIVE_INFINITY;
    if (tA + travel > iv.start + TRAVEL_TOLERANCE_SECONDS) {
      conflicts.push({
        kind: 'arrival-too-late',
        segment: before,
        at: tA,
        zoneIds: [before.zoneId, zoneId],
        steps: [
          { type: 'position', characterId, zoneId: before.zoneId, interval: before.interval, source: before.source === 'camera' ? 'camera' : before.source === 'fact' ? 'fact' : 'evidence' },
          { type: 'travel', characterId, from: before.zoneId, to: zoneId, departure: sec(tA), seconds: travel, via: route?.via ?? [], obstructed: route?.obstructed ?? false },
          { type: 'arrival-too-late', characterId, zoneId, earliest: sec(tA + travel), required: iv.start },
        ],
      });
    }
  }
  // 4. Accessibilité vers l'ancre établie suivante
  const after = established
    .filter((s) => s.zoneId !== zoneId && s.interval.start >= iv.end)
    .sort((a, b) => a.interval.start - b.interval.start)[0];
  if (after && conflicts.every((c) => c.kind !== 'overlap')) {
    const route = traceRoute(zoneId, after.zoneId, iv.end, scenario, world);
    const travel = route ? route.seconds : Number.POSITIVE_INFINITY;
    if (iv.end + travel > after.interval.start + TRAVEL_TOLERANCE_SECONDS) {
      conflicts.push({
        kind: 'departure-too-late',
        segment: after,
        at: iv.end,
        zoneIds: [zoneId, after.zoneId],
        steps: [
          { type: 'position', characterId, zoneId: after.zoneId, interval: after.interval, source: after.source === 'camera' ? 'camera' : after.source === 'fact' ? 'fact' : 'evidence' },
          { type: 'travel', characterId, from: zoneId, to: after.zoneId, departure: iv.end, seconds: travel, via: route?.via ?? [], obstructed: route?.obstructed ?? false },
          { type: 'departure-too-late', characterId, zoneId, latest: sec(after.interval.start - travel), required: iv.end },
        ],
      });
    }
  }
  if (conflicts.length > 0) return { status: 'impossible', conflicts, supportingSegments: supporting };

  // 5. Déclarations debout plaçant la personne ailleurs
  for (const s of reported) {
    if (s.zoneId === zoneId) continue;
    if (!segmentsOverlap(s, iv)) continue;
    const statementId = s.sourceIds[0] ?? '';
    conflicts.push({
      kind: 'reported-overlap',
      segment: s,
      at: Math.max(s.interval.start, iv.start),
      zoneIds: [s.zoneId, zoneId],
      steps: [
        { type: 'statement', statementId, speakerId: characterId },
        { type: 'position', characterId, zoneId: s.zoneId, interval: s.interval, source: 'statement' },
        { type: 'overlap', characterId, a: { zoneId: s.zoneId, interval: s.interval }, b: { zoneId, interval: iv } },
      ],
    });
  }
  if (conflicts.length > 0) return { status: 'reported-elsewhere', conflicts, supportingSegments: supporting };
  if (supporting.some((s) => !s.transit && s.interval.start <= iv.start && iv.end <= s.interval.end)) {
    return { status: 'established', conflicts: [], supportingSegments: supporting };
  }
  return { status: 'possible', conflicts: [], supportingSegments: supporting };
}

/** Conflit entre deux présences proposées/déclarées du même personnage (chevauchement ou trajet insuffisant). */
export function checkPairCompatibility(
  a: PositionSegment,
  b: PositionSegment,
  scenario: LoadedScenario,
  world: WorldState,
): OccupancyConflict | null {
  if (a.characterId !== b.characterId) return null;
  if (a.zoneId === b.zoneId) return null;
  const [first, second] = a.interval.start <= b.interval.start ? [a, b] : [b, a];
  if (intervalsOverlap(first.interval, second.interval)) {
    return {
      kind: 'overlap',
      segment: first,
      at: Math.max(first.interval.start, second.interval.start),
      zoneIds: [first.zoneId, second.zoneId],
      steps: [{ type: 'overlap', characterId: a.characterId, a: { zoneId: first.zoneId, interval: first.interval }, b: { zoneId: second.zoneId, interval: second.interval } }],
    };
  }
  const travel = shortestTravelTime(first.zoneId, second.zoneId, first.interval.end, scenario, world);
  if (first.interval.end + travel > second.interval.start + TRAVEL_TOLERANCE_SECONDS) {
    const route = traceRoute(first.zoneId, second.zoneId, first.interval.end, scenario, world);
    return {
      kind: 'arrival-too-late',
      segment: first,
      at: first.interval.end,
      zoneIds: [first.zoneId, second.zoneId],
      steps: [
        { type: 'travel', characterId: a.characterId, from: first.zoneId, to: second.zoneId, departure: first.interval.end, seconds: travel, via: route?.via ?? [], obstructed: route?.obstructed ?? false },
        { type: 'arrival-too-late', characterId: a.characterId, zoneId: second.zoneId, earliest: sec(first.interval.end + travel), required: second.interval.start },
      ],
    };
  }
  return null;
}

/** Zone occupée à l'instant t (meilleur statut disponible), pour l'affichage. */
export function positionAt(model: PositionModel, characterId: CharacterId, t: number): PositionSegment | null {
  const list = model.byCharacter.get(characterId) ?? [];
  const rank: Record<PositionStatus, number> = { established: 0, proposed: 1, reported: 2 };
  let best: PositionSegment | null = null;
  for (const s of list) {
    const hit = s.transit ? Math.abs(s.interval.start - t) < 0.5 : overlapsPoint(s.interval, t);
    if (!hit) continue;
    if (!best || rank[s.status] < rank[best.status]) best = s;
  }
  return best;
}
