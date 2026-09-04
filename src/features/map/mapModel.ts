/**
 * Modèle d'affichage du plan à un instant donné (GDD §7).
 *
 * Fonctions pures : elles ne lisent que la vue joueur (aucun secret), les données publiques du
 * plan (zones, passages) et les fonctions spatiales du moteur (`canSee`, `hearSignal`, durées
 * de passage avec obstructions connues). Aucun recalcul du moteur : un changement de curseur ne
 * coûte que des lectures de `view.positions` et quelques parcours de graphe locaux.
 */
import { polygonToPath, zoneCentroid } from '@/domain/engine/geometry';
import type { PositionSegment, PositionStatus } from '@/domain/engine/positions';
import {
  canSee,
  hearSignal,
  obstructionActiveAt,
  passageObstructionAt,
  passageOpenAt,
  passageTravelSeconds,
  type SoundSource,
  type WorldState,
} from '@/domain/engine/spatial';
import type { CharacterId, ZoneId } from '@/domain/model/ids';
import type {
  Fidelity,
  LoadedScenario,
  Obstruction,
  Passage,
  SightQuality,
  Zone,
} from '@/domain/model/scenario';
import { intervalContainsTime, type Interval } from '@/domain/model/time';
import {
  positionAt,
  type CharacterView,
  type Degree,
  type PlayerView,
} from '@/domain/selectors/playerView';
import type { Selection } from '@/state/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type LightLevel = 'bright' | 'dim' | 'dark';

export interface TokenFrame {
  characterId: CharacterId;
  name: string;
  initial: string;
  accentColor: string;
  portraitSeed: number;
  trustState: CharacterView['trustState'];
  zoneId: ZoneId;
  status: PositionStatus;
  source: PositionSegment['source'];
  sourceIds: string[];
  transit: boolean;
  interval: Interval;
  /** Libellé accessible : « Malik Bensaïd — Rayon 2 (établi par la caméra) ». */
  label: string;
  point: Point;
}

export interface MarkerFrame {
  id: string;
  kind: 'evidence' | 'fact';
  label: string;
  degree: Degree;
  /** Identifiant de zone tel qu'exposé par la vue joueur (chaîne simple). */
  zoneId: string;
  at: number | null;
  interval: Interval | null;
  /** Instant à rejoindre par « Aller à l'instant » (null : marqueur sans horodatage). */
  goTo: number | null;
  /** Le curseur tombe dans l'instant (± fenêtre) ou l'intervalle du marqueur. */
  activeAtCursor: boolean;
}

export interface ZoneFrame {
  zone: Zone;
  centroid: Point;
  bounds: Bounds;
  path: string;
  light: LightLevel;
  /** Zone filmée par la caméra des zones centrales. */
  covered: boolean;
  /** Zone filmée mais caméra interrompue à cet instant. */
  offCamera: boolean;
  /** Obstruction connue et active à cet instant dans la zone. */
  obstruction: Obstruction | null;
  tokens: TokenFrame[];
  /** Tous les marqueurs localisés dans la zone (fiche). */
  markers: MarkerFrame[];
  /** Marqueurs dont l'instant ou l'intervalle contient le curseur (plan). */
  activeMarkers: MarkerFrame[];
  /** Libellé accessible du bouton de zone. */
  label: string;
}

export type PassageState = 'open' | 'closed' | 'obstructed';

export interface PassageFrame {
  passage: Passage;
  from: Zone;
  to: Zone;
  a: Point;
  b: Point;
  mid: Point;
  state: PassageState;
  obstruction: Obstruction | null;
  /** Durée de traversée à l'instant du curseur (obstruction connue comprise). */
  travelSeconds: number;
  baseSeconds: number;
  sight: SightQuality;
  soundLoss: number;
  /** Texte court affiché sur le plan : « 8 s », « 20 s ×2,2 », « fermé ». */
  label: string;
  ariaLabel: string;
}

export interface SightLineFrame {
  from: ZoneId;
  to: ZoneId;
  toLabel: string;
  a: Point;
  b: Point;
  quality: number;
  fidelity: Fidelity | 'none';
  via: ZoneId[];
  blockedBy: string | null;
}

export interface SightFrame {
  observer: CharacterView;
  zoneId: ZoneId;
  zoneLabel: string;
  origin: Point;
  /** Triées par qualité décroissante ; inclut les zones sans vue (qualité 0). */
  lines: SightLineFrame[];
}

export interface SoundZoneFrame {
  zoneId: ZoneId;
  zoneLabel: string;
  intensity: number;
  fidelity: Fidelity | 'none';
  directionZoneId: ZoneId | null;
  point: Point;
}

export interface SoundFrame {
  id: string;
  /** « Fait : Choc métallique… » ou « Hypothèse : Chariot sur le seuil ». */
  label: string;
  originZoneId: ZoneId;
  originLabel: string;
  origin: Point;
  interval: Interval | null;
  /** Triées par intensité décroissante ; inclut les zones inaudibles. */
  zones: SoundZoneFrame[];
}

export interface MapFrame {
  cursor: number;
  clock: string;
  cameraOn: boolean;
  zones: ZoneFrame[];
  zoneById: ReadonlyMap<string, ZoneFrame>;
  passages: PassageFrame[];
  /** Personnages sans position connue à cet instant. */
  offScreen: CharacterView[];
  sight: SightFrame | null;
  sounds: SoundFrame[];
}

export interface FrameInput {
  scenario: LoadedScenario;
  view: PlayerView;
  world: WorldState;
  cursor: number;
  selection: Selection | null;
}

// ---------------------------------------------------------------------------
// Libellés et formats
// ---------------------------------------------------------------------------

/** Un marqueur ponctuel est « à l'instant » dans cette fenêtre autour de son horodatage. */
export const MARKER_INSTANT_WINDOW_SECONDS = 15;

export const LIGHT_LABELS: Record<LightLevel, string> = {
  bright: 'éclairée',
  dim: 'tamisée',
  dark: 'sombre',
};

export const SIGHT_LABELS: Record<SightQuality, string> = {
  clear: 'vue nette',
  partial: 'vue partielle',
  none: 'aucune vue',
};

export const FIDELITY_LABELS: Record<Fidelity | 'none', string> = {
  exact: 'nette',
  partial: 'partielle',
  ambiguous: 'ambiguë',
  none: 'aucune',
};

export const HEAR_LABELS: Record<Fidelity | 'none', string> = {
  exact: 'net',
  partial: 'étouffé',
  ambiguous: 'à peine perceptible',
  none: 'inaudible',
};

export const POSITION_SOURCE_LABELS: Record<PositionSegment['source'], string> = {
  camera: 'établi par la caméra',
  evidence: 'établi par une pièce',
  fact: 'établi par un fait',
  statement: 'rapporté par une déclaration',
  claim: 'proposé par votre version',
};

export const STATUS_GLYPH: Record<PositionStatus, string> = {
  established: '■',
  reported: '▤',
  proposed: '◆',
};

export const DEGREE_GLYPH: Record<Degree, string> = {
  established: '■',
  reported: '▤',
  deduced: '◆',
  proposed: '◌',
};

export function lightLevel(light: number): LightLevel {
  if (light >= 0.75) return 'bright';
  if (light >= 0.55) return 'dim';
  return 'dark';
}

export function formatSeconds(seconds: number): string {
  return `${Math.round(seconds)} s`;
}

/** « ×2,2 » — virgule décimale française, une décimale au plus. */
export function formatMultiplier(multiplier: number): string {
  return `×${(Math.round(multiplier * 10) / 10).toString().replace('.', ',')}`;
}

/** « 42 % » — espace insécable (U+00A0) avant le signe. */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}\u00a0%`;
}

export function personCount(n: number): string {
  if (n === 0) return 'aucune personne présente';
  if (n === 1) return '1 personne présente';
  return `${n} personnes présentes`;
}

/** Initiales (prénom + nom) : deux personnages partageant une initiale restent distincts. */
export function characterInitial(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const first = words[0]?.charAt(0) ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? '') : '';
  const initials = `${first}${last}`;
  return initials === '' ? '?' : initials.toLocaleUpperCase('fr-FR');
}

export function tokenLabel(name: string, zoneLabel: string, seg: PositionSegment): string {
  const source = POSITION_SOURCE_LABELS[seg.source];
  return `${name} — ${zoneLabel} (${source}${seg.transit ? ', en transit' : ''})`;
}

// ---------------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------------

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function polygonBounds(zone: Zone): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of zone.polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Disposition déterministe des jetons d'une zone : un seul jeton au centre (légèrement sous le
 * centroïde pour laisser la place au libellé), sinon répartition régulière sur une ellipse
 * adaptée aux proportions de la zone.
 */
export function tokenPoints(centroid: Point, bounds: Bounds, count: number): Point[] {
  const cx = centroid.x;
  const cy = centroid.y + 1.5;
  if (count <= 1) return [{ x: round2(cx), y: round2(cy) }];
  const rx = clamp((bounds.maxX - bounds.minX) * 0.24, 2.6, 8);
  const ry = clamp((bounds.maxY - bounds.minY) * 0.22, 2.6, 8);
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return { x: round2(cx + rx * Math.cos(angle)), y: round2(cy + ry * Math.sin(angle)) };
  });
}

export type ArrowDirection = 'left' | 'right' | 'up' | 'down';

const DIRECTIONS: Record<ArrowDirection, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/** Zone la plus proche dans une direction (navigation au clavier par flèches). */
export function nearestZone(
  zones: readonly ZoneFrame[],
  from: ZoneFrame,
  direction: ArrowDirection,
): ZoneFrame | null {
  const dir = DIRECTIONS[direction];
  let best: { zone: ZoneFrame; score: number } | null = null;
  for (const z of zones) {
    if (z.zone.id === from.zone.id) continue;
    const vx = z.centroid.x - from.centroid.x;
    const vy = z.centroid.y - from.centroid.y;
    const along = vx * dir.x + vy * dir.y;
    if (along <= 0) continue;
    const perp = Math.abs(vx * dir.y - vy * dir.x);
    if (perp > along * 1.6) continue;
    const score = along + perp * 0.5;
    if (!best || score < best.score) best = { zone: z, score };
  }
  return best ? best.zone : null;
}

// ---------------------------------------------------------------------------
// Construction de la trame
// ---------------------------------------------------------------------------

interface ZoneGeometry {
  zone: Zone;
  centroid: Point;
  bounds: Bounds;
  path: string;
}

function markerActive(
  marker: { at: number | null; interval: Interval | null },
  cursor: number,
): boolean {
  if (marker.interval) return intervalContainsTime(marker.interval, cursor);
  if (marker.at !== null) return Math.abs(marker.at - cursor) <= MARKER_INSTANT_WINDOW_SECONDS;
  return false;
}

function collectMarkers(view: PlayerView, cursor: number): Map<string, MarkerFrame[]> {
  const byZone = new Map<string, MarkerFrame[]>();
  const push = (m: MarkerFrame) => {
    const list = byZone.get(m.zoneId) ?? [];
    list.push(m);
    byZone.set(m.zoneId, list);
  };
  for (const e of view.evidence) {
    if (!e.marker?.zoneId) continue;
    const at = e.marker.at ?? null;
    const iv = e.marker.interval ?? null;
    const base = { at, interval: iv };
    push({
      id: e.id,
      kind: 'evidence',
      label: e.marker.label,
      degree: e.degree,
      zoneId: e.marker.zoneId,
      at,
      interval: iv,
      goTo: at ?? iv?.start ?? null,
      activeAtCursor: markerActive(base, cursor),
    });
  }
  for (const f of view.facts) {
    if (!f.zoneId) continue;
    push({
      id: f.id,
      kind: 'fact',
      label: f.label,
      degree: f.degree,
      zoneId: f.zoneId,
      at: null,
      interval: f.interval,
      goTo: f.interval.start,
      activeAtCursor: intervalContainsTime(f.interval, cursor),
    });
  }
  for (const list of byZone.values()) {
    list.sort(
      (a, b) => (a.goTo ?? Number.POSITIVE_INFINITY) - (b.goTo ?? Number.POSITIVE_INFINITY),
    );
  }
  return byZone;
}

const inBounds = (p: Point, b: Bounds): boolean =>
  p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

/**
 * Point où poser l'étiquette d'un passage : milieu de l'interstice entre les deux zones sur la
 * droite reliant leurs centroïdes (plutôt que le milieu géométrique, souvent recouvert par une zone).
 */
function gapMidpoint(from: ZoneGeometry, to: ZoneGeometry): Point {
  const a = from.centroid;
  const b = to.centroid;
  const at = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const steps = 200;
  let exit = 0;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (!inBounds(at(t), from.bounds)) break;
    exit = t;
  }
  let enter = 1;
  for (let i = steps; i >= 0; i -= 1) {
    const t = i / steps;
    if (!inBounds(at(t), to.bounds)) break;
    enter = t;
  }
  const t = exit <= enter ? (exit + enter) / 2 : 0.5;
  const p = at(t);
  return { x: round2(p.x), y: round2(p.y) };
}

function passageFrame(
  passage: Passage,
  geometry: ReadonlyMap<string, ZoneGeometry>,
  cursor: number,
  scenario: LoadedScenario,
  world: WorldState,
): PassageFrame | null {
  const from = geometry.get(passage.from);
  const to = geometry.get(passage.to);
  if (!from || !to) return null;
  const open = passageOpenAt(passage, cursor);
  const obstruction = passageObstructionAt(passage, cursor, scenario, world);
  const travelSeconds = passageTravelSeconds(passage, cursor, scenario, world);
  const state: PassageState = !open ? 'closed' : obstruction ? 'obstructed' : 'open';
  const label = !open
    ? 'fermé'
    : obstruction
      ? `${formatSeconds(travelSeconds)} ${formatMultiplier(obstruction.travelMultiplier)}`
      : formatSeconds(travelSeconds);
  const details = [
    !open ? 'fermé à cet instant' : `${formatSeconds(travelSeconds)} de traversée`,
    obstruction ? `obstrué (${formatMultiplier(obstruction.travelMultiplier)})` : null,
    SIGHT_LABELS[passage.sight],
    `perte sonore ${formatPercent(passage.soundLoss)}`,
  ].filter((d): d is string => d !== null);
  return {
    passage,
    from: from.zone,
    to: to.zone,
    a: from.centroid,
    b: to.centroid,
    mid: gapMidpoint(from, to),
    state,
    obstruction,
    travelSeconds,
    baseSeconds: passage.travelSeconds,
    sight: passage.sight,
    soundLoss: passage.soundLoss,
    label,
    ariaLabel: `Passage ${from.zone.label} – ${to.zone.label} : ${details.join(', ')}`,
  };
}

interface SoundCandidate {
  id: string;
  label: string;
  interval: Interval | null;
  source: SoundSource;
}

/**
 * Sons en jeu : le fait sélectionné s'il porte un signal sonore (fait déjà révélé au joueur),
 * sinon les hypothèses « son » placées dans la version (effet monde de type son + zone),
 * lorsque le curseur tombe dans leur intervalle ou que l'hypothèse est sélectionnée.
 */
function soundCandidates(input: FrameInput): SoundCandidate[] {
  const { scenario, view, cursor, selection } = input;
  if (selection?.kind === 'fact') {
    const fact = view.facts.find((f) => f.id === selection.id);
    const signal = fact ? scenario.index.soundsByFact.get(fact.id) : undefined;
    if (fact && signal) {
      return [
        {
          id: `fact:${fact.id}`,
          label: `Fait : ${fact.label}`,
          interval: fact.interval,
          source: {
            originZoneId: signal.originZoneId,
            intensity: signal.intensity,
            signatureTags: [...signal.signatureTags],
          },
        },
      ];
    }
  }
  const out: SoundCandidate[] = [];
  for (const claim of Object.values(view.version.claims)) {
    const hypothesis = view.hypotheses.find((h) => h.id === claim.hypothesisId);
    if (!hypothesis?.hasWorldEffect || !claim.zoneId) continue;
    const effect = scenario.index.hypothesisExtensions.get(hypothesis.id)?.worldEffect;
    if (effect?.type !== 'sound') continue;
    const selected = selection?.kind === 'hypothesis' && selection.id === hypothesis.id;
    const inWindow = !claim.interval || intervalContainsTime(claim.interval, cursor);
    if (!selected && !inWindow) continue;
    out.push({
      id: `claim:${claim.slotId}`,
      label: `Hypothèse : ${hypothesis.label}`,
      interval: claim.interval ?? null,
      source: {
        originZoneId: claim.zoneId,
        intensity: effect.intensity,
        signatureTags: [...effect.signatureTags],
      },
    });
  }
  return out;
}

export function buildMapFrame(input: FrameInput): MapFrame {
  const { scenario, view, world, cursor, selection } = input;
  const clock = view.clock(cursor);
  const cameraOn = view.positions.cameraOn.some((iv) => intervalContainsTime(iv, cursor));
  const activeObstructions = view.obstructions.filter((o) => obstructionActiveAt(o, cursor));

  const geometry = new Map<string, ZoneGeometry>();
  for (const zone of scenario.data.zones) {
    geometry.set(zone.id, {
      zone,
      centroid: zoneCentroid(zone),
      bounds: polygonBounds(zone),
      path: polygonToPath(zone.polygon),
    });
  }

  // Jetons : meilleure position connue de chaque personnage à cet instant.
  const segmentsByZone = new Map<string, { character: CharacterView; seg: PositionSegment }[]>();
  const offScreen: CharacterView[] = [];
  for (const character of view.characters) {
    const seg = positionAt(view.positions, character.id, cursor);
    if (!seg) {
      offScreen.push(character);
      continue;
    }
    const list = segmentsByZone.get(seg.zoneId) ?? [];
    list.push({ character, seg });
    segmentsByZone.set(seg.zoneId, list);
  }

  const markersByZone = collectMarkers(view, cursor);

  const zones: ZoneFrame[] = [];
  const zoneById = new Map<string, ZoneFrame>();
  for (const g of geometry.values()) {
    const { zone, centroid, bounds, path } = g;
    const covered = view.positions.coveredZones.has(zone.id);
    const offCamera = covered && !cameraOn;
    const obstruction = activeObstructions.find((o) => o.zoneId === zone.id) ?? null;
    const present = segmentsByZone.get(zone.id) ?? [];
    const points = tokenPoints(centroid, bounds, present.length);
    const tokens: TokenFrame[] = present.map(({ character, seg }, i) => ({
      characterId: character.id,
      name: character.name,
      initial: characterInitial(character.name),
      accentColor: character.accentColor,
      portraitSeed: character.portraitSeed,
      trustState: character.trustState,
      zoneId: seg.zoneId,
      status: seg.status,
      source: seg.source,
      sourceIds: [...seg.sourceIds],
      transit: seg.transit,
      interval: seg.interval,
      label: tokenLabel(character.name, zone.label, seg),
      point: points[i] ?? { x: centroid.x, y: centroid.y },
    }));
    const markers = markersByZone.get(zone.id) ?? [];
    const light = lightLevel(zone.light);
    const labelParts = [
      `Zone ${zone.label}`,
      personCount(tokens.length),
      covered ? 'filmée' : 'non filmée',
      LIGHT_LABELS[light],
    ];
    if (offCamera) labelParts.push('hors champ à cet instant');
    if (obstruction) labelParts.push('obstruction connue');
    const frame: ZoneFrame = {
      zone,
      centroid,
      bounds,
      path,
      light,
      covered,
      offCamera,
      obstruction,
      tokens,
      markers,
      activeMarkers: markers.filter((m) => m.activeAtCursor),
      label: labelParts.join(', '),
    };
    zones.push(frame);
    zoneById.set(zone.id, frame);
  }

  const passages = scenario.data.passages
    .map((p) => passageFrame(p, geometry, cursor, scenario, world))
    .filter((p): p is PassageFrame => p !== null);

  // Lignes de vue du personnage sélectionné.
  let sight: SightFrame | null = null;
  if (selection?.kind === 'character') {
    const observer = view.characters.find((c) => c.id === selection.id);
    const seg = observer ? positionAt(view.positions, observer.id, cursor) : null;
    const origin = seg ? geometry.get(seg.zoneId) : undefined;
    if (observer && seg && origin) {
      const lines: SightLineFrame[] = [];
      for (const target of geometry.values()) {
        if (target.zone.id === seg.zoneId) continue;
        const r = canSee(seg.zoneId, target.zone.id, cursor, scenario, world);
        lines.push({
          from: seg.zoneId,
          to: target.zone.id,
          toLabel: target.zone.label,
          a: origin.centroid,
          b: target.centroid,
          quality: r.quality,
          fidelity: r.fidelity,
          via: [...r.via],
          blockedBy: r.blockedBy,
        });
      }
      lines.sort((x, y) => y.quality - x.quality || x.toLabel.localeCompare(y.toLabel, 'fr'));
      sight = {
        observer,
        zoneId: seg.zoneId,
        zoneLabel: origin.zone.label,
        origin: origin.centroid,
        lines,
      };
    }
  }

  // Propagation sonore.
  const sounds: SoundFrame[] = [];
  for (const candidate of soundCandidates(input)) {
    const origin = geometry.get(candidate.source.originZoneId);
    if (!origin) continue;
    const zonesHeard: SoundZoneFrame[] = [];
    for (const target of geometry.values()) {
      const r = hearSignal(target.zone.id, candidate.source, cursor, scenario, world);
      zonesHeard.push({
        zoneId: target.zone.id,
        zoneLabel: target.zone.label,
        intensity: r.intensity,
        fidelity: r.fidelity,
        directionZoneId: r.directionZoneId,
        point: { x: round2(target.bounds.minX + 1.4), y: round2(target.bounds.minY + 7.2) },
      });
    }
    zonesHeard.sort(
      (x, y) => y.intensity - x.intensity || x.zoneLabel.localeCompare(y.zoneLabel, 'fr'),
    );
    sounds.push({
      id: candidate.id,
      label: candidate.label,
      originZoneId: candidate.source.originZoneId,
      originLabel: origin.zone.label,
      origin: origin.centroid,
      interval: candidate.interval,
      zones: zonesHeard,
    });
  }

  return { cursor, clock, cameraOn, zones, zoneById, passages, offScreen, sight, sounds };
}
