/**
 * Graphe spatial pondéré et temporel : conditions d'ouverture, obstructions,
 * plus court chemin dépendant du temps, tracé d'itinéraire, lignes de vue et propagation sonore.
 *
 * Tout est pur et déterministe. Le « monde » passé en paramètre indique quelles obstructions
 * sont appliquées (celles connues du joueur pour le monde proposé ; toutes pour le canon).
 */
import type { ObstructionId, ZoneId } from '../model/ids';
import type { ConditionExpr, Fidelity, LoadedScenario, Obstruction, Passage } from '../model/scenario';
import { sec, type Second } from '../model/time';

export interface WorldState {
  /** Obstructions appliquées (connues). */
  readonly activeObstructionIds: ReadonlySet<ObstructionId>;
}

export const emptyWorld: WorldState = { activeObstructionIds: new Set() };

export const canonicalWorld = (scenario: LoadedScenario): WorldState => ({
  activeObstructionIds: new Set(scenario.data.obstructions.map((o) => o.id)),
});

export function evalCondition(expr: ConditionExpr, t: number): boolean {
  switch (expr.type) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'between':
      return expr.start <= t && t < expr.end;
    case 'not':
      return !evalCondition(expr.expr, t);
    case 'and':
      return expr.exprs.every((e) => evalCondition(e, t));
    case 'or':
      return expr.exprs.some((e) => evalCondition(e, t));
  }
}

export const obstructionActiveAt = (o: Obstruction, t: number): boolean => o.interval.start <= t && t < o.interval.end;

export function passageOpenAt(passage: Passage, t: number): boolean {
  return evalCondition(passage.openWhen, t);
}

/** Obstruction appliquée au passage à l'instant t, s'il y en a une. */
export function passageObstructionAt(
  passage: Passage,
  t: number,
  scenario: LoadedScenario,
  world: WorldState,
): Obstruction | null {
  if (!passage.affectedByObstructionId) return null;
  if (!world.activeObstructionIds.has(passage.affectedByObstructionId)) return null;
  const o = scenario.index.obstructions.get(passage.affectedByObstructionId);
  if (!o) return null;
  return obstructionActiveAt(o, t) ? o : null;
}

/** Durée de traversée d'un passage en partant à l'instant t. */
export function passageTravelSeconds(passage: Passage, t: number, scenario: LoadedScenario, world: WorldState): number {
  const o = passageObstructionAt(passage, t, scenario, world);
  return o ? passage.travelSeconds * o.travelMultiplier : passage.travelSeconds;
}

/** Prochain instant ≥ t où le passage est ouvert, ou null s'il ne s'ouvre plus avant l'horizon. */
export function nextOpenTime(passage: Passage, t: number, horizon: number): number | null {
  if (passage.openWhen.type === 'always') return t;
  if (passage.openWhen.type === 'never') return null;
  for (let u = Math.ceil(t); u <= horizon; u += 1) if (passageOpenAt(passage, u)) return u;
  return null;
}

export interface RouteStep {
  passageId: string;
  from: ZoneId;
  to: ZoneId;
  departAt: Second;
  arriveAt: Second;
  seconds: number;
  obstructedBy: ObstructionId | null;
  waited: number;
}

export interface Route {
  from: ZoneId;
  to: ZoneId;
  departure: Second;
  arrival: Second;
  /** Durée totale (attentes comprises). */
  seconds: number;
  /** Zones traversées, extrémités incluses. */
  via: ZoneId[];
  steps: RouteStep[];
  obstructed: boolean;
}

interface Label {
  zone: ZoneId;
  arrival: number;
  prev: { zone: ZoneId; step: RouteStep } | null;
}

/**
 * Plus court chemin dépendant du temps (Dijkstra sur l'heure d'arrivée). Les passages fermés
 * imposent une attente jusqu'à leur ouverture ; les passages obstrués coûtent plus cher à
 * l'instant du départ. Retourne null si la destination est inaccessible avant l'horizon.
 */
export function traceRoute(
  from: ZoneId,
  to: ZoneId,
  departure: number,
  scenario: LoadedScenario,
  world: WorldState,
): Route | null {
  const horizon = scenario.data.scenario.timeline.durationSeconds + 3600;
  if (from === to) {
    return { from, to, departure: sec(departure), arrival: sec(departure), seconds: 0, via: [from], steps: [], obstructed: false };
  }
  const best = new Map<ZoneId, Label>();
  const startLabel: Label = { zone: from, arrival: departure, prev: null };
  const open: Label[] = [startLabel];
  best.set(from, startLabel);
  const settled = new Set<ZoneId>();
  while (open.length > 0) {
    // extraction du minimum (graphe petit : tri linéaire suffisant et déterministe)
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) {
      const a = open[i];
      const b = open[bi];
      if (a && b && (a.arrival < b.arrival || (a.arrival === b.arrival && a.zone < b.zone))) bi = i;
    }
    const current = open.splice(bi, 1)[0];
    if (!current || settled.has(current.zone)) continue;
    settled.add(current.zone);
    if (current.zone === to) break;
    const passages = [...(scenario.index.adjacency.get(current.zone) ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const p of passages) {
      const next = p.from === current.zone ? p.to : p.from;
      if (settled.has(next)) continue;
      const departAt = nextOpenTime(p, current.arrival, horizon);
      if (departAt === null) continue;
      const seconds = passageTravelSeconds(p, departAt, scenario, world);
      const arrival = departAt + seconds;
      const existing = best.get(next);
      if (!existing || arrival < existing.arrival) {
        const obstruction = passageObstructionAt(p, departAt, scenario, world);
        const label: Label = {
          zone: next,
          arrival,
          prev: {
            zone: current.zone,
            step: {
              passageId: p.id,
              from: current.zone,
              to: next,
              departAt: sec(departAt),
              arriveAt: sec(arrival),
              seconds,
              obstructedBy: obstruction ? obstruction.id : null,
              waited: departAt - current.arrival,
            },
          },
        };
        best.set(next, label);
        open.push(label);
      }
    }
  }
  const end = best.get(to);
  if (!end || !settled.has(to)) return null;
  const steps: RouteStep[] = [];
  let cur: Label | undefined = end;
  while (cur?.prev) {
    steps.unshift(cur.prev.step);
    cur = best.get(cur.prev.zone);
  }
  const via = [from, ...steps.map((s) => s.to)];
  return {
    from,
    to,
    departure: sec(departure),
    arrival: sec(end.arrival),
    seconds: end.arrival - departure,
    via,
    steps,
    obstructed: steps.some((s) => s.obstructedBy !== null),
  };
}

/** Durée minimale de trajet en partant à `atTime` ; Infinity si inaccessible. */
export function shortestTravelTime(
  from: ZoneId,
  to: ZoneId,
  atTime: number,
  scenario: LoadedScenario,
  world: WorldState,
): number {
  const r = traceRoute(from, to, atTime, scenario, world);
  return r ? r.seconds : Number.POSITIVE_INFINITY;
}

// ---------------------------------------------------------------------------
// Lignes de vue
// ---------------------------------------------------------------------------

export const MAX_SIGHT_HOPS = 3;
const SIGHT_VALUE: Record<'none' | 'partial' | 'clear', number> = { none: 0, partial: 0.5, clear: 1 };
const HOP_DECAY = 0.85;
const OCCLUSION_FACTOR = 0.35;

export interface SightResult {
  observerZoneId: ZoneId;
  targetZoneId: ZoneId;
  at: Second;
  /** Qualité 0..1 (0 = aucune vue). */
  quality: number;
  fidelity: Fidelity | 'none';
  via: ZoneId[];
  hops: number;
  /** Obstructions qui dégradent ou bloquent la vue. */
  occludedBy: ObstructionId[];
  blockedBy: ObstructionId | null;
}

export function fidelityFromQuality(q: number): Fidelity | 'none' {
  if (q >= 0.6) return 'exact';
  if (q >= 0.3) return 'partial';
  if (q > 0.12) return 'ambiguous';
  return 'none';
}

function activeObstructions(t: number, scenario: LoadedScenario, world: WorldState): Obstruction[] {
  const out: Obstruction[] = [];
  for (const id of world.activeObstructionIds) {
    const o = scenario.index.obstructions.get(id);
    if (o && obstructionActiveAt(o, t)) out.push(o);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Peut-on voir la zone cible depuis la zone d'observation à l'instant t ?
 * Cherche la meilleure chaîne de passages à visibilité non nulle (≤ MAX_SIGHT_HOPS),
 * dégradée par la qualité de chaque passage, la distance, la lumière de la cible et les obstructions.
 */
export function canSee(
  observerZoneId: ZoneId,
  targetZoneId: ZoneId,
  at: number,
  scenario: LoadedScenario,
  world: WorldState,
): SightResult {
  const t = sec(at);
  const obstructions = activeObstructions(at, scenario, world);
  const targetLight = scenario.index.zones.get(targetZoneId)?.light ?? 1;
  const lightFactor = targetLight >= 0.7 ? 1 : 0.6 + (targetLight / 0.7) * 0.4;

  if (observerZoneId === targetZoneId) {
    const occ = obstructions.filter((o) => o.zoneId === targetZoneId).map((o) => o.id);
    const q = Math.min(1, lightFactor) * (occ.length > 0 ? 0.85 : 1);
    return { observerZoneId, targetZoneId, at: t, quality: q, fidelity: fidelityFromQuality(q), via: [observerZoneId], hops: 0, occludedBy: occ, blockedBy: null };
  }

  // Blocage explicite de paire
  for (const o of obstructions) {
    for (const [a, b] of o.blocksSightBetween) {
      if ((a === observerZoneId && b === targetZoneId) || (a === targetZoneId && b === observerZoneId)) {
        return { observerZoneId, targetZoneId, at: t, quality: 0, fidelity: 'none', via: [], hops: 0, occludedBy: [], blockedBy: o.id };
      }
    }
  }

  let best: { quality: number; via: ZoneId[]; occluded: ObstructionId[] } | null = null;
  const visit = (zone: ZoneId, quality: number, via: ZoneId[], occluded: ObstructionId[]) => {
    if (via.length - 1 > MAX_SIGHT_HOPS) return;
    if (zone === targetZoneId) {
      const q = quality * lightFactor;
      if (!best || q > best.quality || (q === best.quality && via.length < best.via.length)) best = { quality: q, via, occluded };
      return;
    }
    const passages = [...(scenario.index.adjacency.get(zone) ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const p of passages) {
      if (p.sight === 'none') continue;
      const next = p.from === zone ? p.to : p.from;
      if (via.includes(next)) continue;
      let q = quality * SIGHT_VALUE[p.sight];
      if (via.length >= 1 && via.length - 1 >= 1) q *= HOP_DECAY;
      let occ = occluded;
      // Traverser (ou atteindre) une zone encombrée réduit la visibilité.
      const zoneObstructions = obstructions.filter((o) => o.zoneId === next);
      if (zoneObstructions.length > 0) {
        q *= OCCLUSION_FACTOR;
        occ = [...occluded, ...zoneObstructions.map((o) => o.id)];
      }
      if (q <= 0.01) continue;
      visit(next, q, [...via, next], occ);
    }
  };
  visit(observerZoneId, 1, [observerZoneId], []);
  if (!best) {
    return { observerZoneId, targetZoneId, at: t, quality: 0, fidelity: 'none', via: [], hops: 0, occludedBy: [], blockedBy: null };
  }
  const found: { quality: number; via: ZoneId[]; occluded: ObstructionId[] } = best;
  const quality = Math.round(found.quality * 1000) / 1000;
  return {
    observerZoneId,
    targetZoneId,
    at: t,
    quality,
    fidelity: fidelityFromQuality(quality),
    via: found.via,
    hops: found.via.length - 1,
    occludedBy: [...new Set(found.occluded)],
    blockedBy: null,
  };
}

// ---------------------------------------------------------------------------
// Sons
// ---------------------------------------------------------------------------

export interface SoundSource {
  originZoneId: ZoneId;
  intensity: number;
  signatureTags: string[];
}

export interface HearResult {
  observerZoneId: ZoneId;
  originZoneId: ZoneId;
  /** Intensité perçue 0..1. */
  intensity: number;
  fidelity: Fidelity | 'none';
  via: ZoneId[];
  /** Zone voisine par laquelle le son arrive (null si même zone). */
  directionZoneId: ZoneId | null;
  perceivedTags: string[];
  /** Perte cumulée (produit des facteurs) ; 1 = aucune perte. */
  cumulativeLoss: number;
}

/** Étiquettes « grossières » perçues même lorsque le son est étouffé. */
export const COARSE_SOUND_TAGS: ReadonlySet<string> = new Set(['brief', 'continuous', 'metal', 'hum', 'sharp', 'loud', 'quiet', 'low', 'high', 'heavy']);
export const HEAR_THRESHOLDS = { exact: 0.35, partial: 0.15, ambiguous: 0.06 } as const;

export function hearFidelity(intensity: number): Fidelity | 'none' {
  if (intensity >= HEAR_THRESHOLDS.exact) return 'exact';
  if (intensity >= HEAR_THRESHOLDS.partial) return 'partial';
  if (intensity >= HEAR_THRESHOLDS.ambiguous) return 'ambiguous';
  return 'none';
}

/**
 * Propagation d'un son jusqu'à l'observateur : meilleur chemin (moindre perte) à travers les passages.
 * Chaque passage applique sa perte ; un passage fermé étouffe fortement ; chaque zone intermédiaire absorbe.
 */
export function hearSignal(
  observerZoneId: ZoneId,
  sound: SoundSource,
  at: number,
  scenario: LoadedScenario,
  world: WorldState,
): HearResult {
  const origin = sound.originZoneId;
  const absorption = (z: ZoneId) => scenario.index.zones.get(z)?.acousticAbsorption ?? 0;
  if (origin === observerZoneId) {
    const intensity = sound.intensity * (1 - absorption(origin) * 0.2);
    return {
      observerZoneId,
      originZoneId: origin,
      intensity: round3(intensity),
      fidelity: hearFidelity(intensity),
      via: [origin],
      directionZoneId: null,
      perceivedTags: [...sound.signatureTags],
      cumulativeLoss: round3(intensity / Math.max(sound.intensity, 1e-9)),
    };
  }
  // Dijkstra maximisant le facteur de transmission (produit) → minimiser -log.
  const bestFactor = new Map<ZoneId, number>([[origin, 1]]);
  const prev = new Map<ZoneId, ZoneId>();
  const open: ZoneId[] = [origin];
  const settled = new Set<ZoneId>();
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) {
      const a = open[i];
      const b = open[bi];
      if (!a || !b) continue;
      const fa = bestFactor.get(a) ?? 0;
      const fb = bestFactor.get(b) ?? 0;
      if (fa > fb || (fa === fb && a < b)) bi = i;
    }
    const zone = open.splice(bi, 1)[0];
    if (!zone || settled.has(zone)) continue;
    settled.add(zone);
    if (zone === observerZoneId) break;
    const factorHere = bestFactor.get(zone) ?? 0;
    const passages = [...(scenario.index.adjacency.get(zone) ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const p of passages) {
      const next = p.from === zone ? p.to : p.from;
      if (settled.has(next)) continue;
      let f = factorHere * (1 - p.soundLoss);
      if (!passageOpenAt(p, at)) f *= 0.5;
      if (passageObstructionAt(p, at, scenario, world)) f *= 0.85;
      // absorption de la zone d'arrivée (pleine pour la zone finale, moitié en transit)
      f *= next === observerZoneId ? 1 - absorption(next) * 0.3 : 1 - absorption(next) * 0.5;
      const existing = bestFactor.get(next);
      if (existing === undefined || f > existing) {
        bestFactor.set(next, f);
        prev.set(next, zone);
        open.push(next);
      }
    }
  }
  const factor = bestFactor.get(observerZoneId) ?? 0;
  const via: ZoneId[] = [];
  let cur: ZoneId | undefined = observerZoneId;
  while (cur) {
    via.unshift(cur);
    cur = prev.get(cur);
  }
  const intensity = round3(sound.intensity * factor);
  const fidelity = hearFidelity(intensity);
  const perceivedTags =
    fidelity === 'exact'
      ? [...sound.signatureTags]
      : fidelity === 'partial'
        ? sound.signatureTags.filter((t) => COARSE_SOUND_TAGS.has(t))
        : fidelity === 'ambiguous'
          ? sound.signatureTags.filter((t) => t === 'brief' || t === 'continuous')
          : [];
  const directionZoneId = via.length >= 2 ? (via[via.length - 2] ?? null) : null;
  return {
    observerZoneId,
    originZoneId: origin,
    intensity,
    fidelity,
    via: via.length > 0 && via[0] === origin ? via : [],
    directionZoneId,
    perceivedTags,
    cumulativeLoss: round3(factor),
  };
}

/** Similarité de Jaccard entre deux signatures sonores. */
export function signatureSimilarity(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

export const sharedTags = (a: readonly string[], b: readonly string[]): string[] => {
  const sb = new Set(b);
  return a.filter((t) => sb.has(t));
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
