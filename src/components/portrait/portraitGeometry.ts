/**
 * Géométrie des portraits : collages SVG abstraits générés localement.
 *
 * Tout est pur et déterministe : mêmes entrées (seed, accentColor) → même sortie.
 * Aucune dépendance à React, au DOM ou à Math.random.
 */

// ---------------------------------------------------------------------------
// Palette (GDD §13) et types publics
// ---------------------------------------------------------------------------

export const PALETTE = {
  inkNight: '#11151C',
  coldPaper: '#E8E3D7',
  sageNeon: '#A8C7A0',
  ticketAmber: '#E3A857',
  alertCoral: '#D66B5D',
  cameraBlue: '#6D8FA8',
} as const;

export const PORTRAIT_STATES = ['neutral', 'closed', 'careful', 'available', 'engaged'] as const;
export type PortraitState = (typeof PORTRAIT_STATES)[number];

export interface Point {
  x: number;
  y: number;
}

export interface CircleShape {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
  fill: string;
}

export interface RoundedRectShape {
  kind: 'roundedRect';
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  /** Rotation en degrés autour du centre du rectangle. */
  rotation: number;
  fill: string;
}

export interface PolygonShape {
  kind: 'polygon';
  cx: number;
  cy: number;
  radius: number;
  /** Nombre de côtés, entre 3 et 6. */
  sides: number;
  /** Rotation en degrés du premier sommet. */
  rotation: number;
  fill: string;
}

export interface ArcShape {
  kind: 'arc';
  cx: number;
  cy: number;
  r: number;
  /** Angle de départ en degrés (0 = droite, sens horaire en repère SVG). */
  startAngle: number;
  /** Ouverture en degrés, strictement inférieure à 360. */
  sweep: number;
  stroke: string;
  strokeWidth: number;
}

export interface HatchBandShape {
  kind: 'hatchBand';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation en degrés autour du centre de la bande. */
  rotation: number;
  color: string;
  /** Espacement des hachures en unités du viewBox. */
  spacing: number;
}

export type PortraitShape =
  CircleShape | RoundedRectShape | PolygonShape | ArcShape | HatchBandShape;

export type ShapeKind = PortraitShape['kind'];

export const SHAPE_KINDS: readonly ShapeKind[] = [
  'circle',
  'roundedRect',
  'polygon',
  'arc',
  'hatchBand',
];

/** Ligne abstraite qui donne la posture : direction du regard ou ligne d'épaule. */
export interface PostureLine {
  kind: 'gaze' | 'shoulder';
  from: Point;
  to: Point;
  stroke: string;
  strokeWidth: number;
}

export interface PortraitBackground {
  fill: string;
  /** Rayon des coins du fond ; 50 donne une pastille ronde. */
  cornerRadius: number;
}

export interface PortraitSpec {
  seed: number;
  /** Couleur d'accent normalisée en `#RRGGBB` majuscule. */
  accentColor: string;
  background: PortraitBackground;
  /** Entre 5 et 9 formes, chacune des cinq familles étant représentée au moins une fois. */
  shapes: PortraitShape[];
  posture: PostureLine;
}

export const MIN_SHAPES = 5;
export const MAX_SHAPES = 9;

// ---------------------------------------------------------------------------
// PRNG : mulberry32
// ---------------------------------------------------------------------------

/**
 * Générateur pseudo-aléatoire mulberry32, 32 bits, seedé.
 * Retourne une fonction produisant des nombres dans [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = Math.trunc(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function between(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

function pick<T>(rng: Rng, items: readonly [T, ...T[]]): T {
  const index = Math.floor(rng() * items.length);
  return items[index] ?? items[0];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Couleurs
// ---------------------------------------------------------------------------

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function parseHex(hex: string): Rgb | null {
  const match = HEX_COLOR.exec(hex);
  if (match === null) {
    return null;
  }
  const value = Number.parseInt(match[0].slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function toHex(rgb: Rgb): string {
  const channel = (n: number): string =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

/**
 * Normalise une couleur d'accent en `#RRGGBB` majuscule.
 * Une valeur illisible retombe sur l'ambre ticket, pour ne jamais casser un portrait.
 */
export function normalizeAccentColor(input: string): string {
  const rgb = parseHex(input.trim());
  return rgb === null ? PALETTE.ticketAmber : toHex(rgb);
}

/**
 * Variante de luminosité : `amount` dans [-1, 1].
 * Positif → mélange vers le blanc ; négatif → mélange vers le noir.
 * Une couleur illisible est renvoyée telle quelle.
 */
export function shadeHex(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (rgb === null) {
    return hex;
  }
  const factor = clamp(amount, -1, 1);
  const target = factor > 0 ? 255 : 0;
  const weight = Math.abs(factor);
  const mix = (channel: number): number => channel + (target - channel) * weight;
  return toHex({ r: mix(rgb.r), g: mix(rgb.g), b: mix(rgb.b) });
}

interface ColorPool {
  backgrounds: readonly [string, ...string[]];
  lights: readonly [string, ...string[]];
  masses: readonly [string, ...string[]];
  details: readonly [string, ...string[]];
  hatch: readonly [string, ...string[]];
  ink: string;
}

function buildColorPool(accent: string): ColorPool {
  const { inkNight, coldPaper, sageNeon, ticketAmber, alertCoral, cameraBlue } = PALETTE;
  return {
    backgrounds: [
      inkNight,
      shadeHex(inkNight, 0.06),
      shadeHex(inkNight, 0.12),
      shadeHex(cameraBlue, -0.6),
      shadeHex(accent, -0.72),
    ],
    lights: [
      coldPaper,
      shadeHex(coldPaper, -0.12),
      shadeHex(accent, 0.45),
      shadeHex(sageNeon, 0.3),
      shadeHex(ticketAmber, 0.3),
    ],
    masses: [
      accent,
      shadeHex(accent, -0.22),
      cameraBlue,
      shadeHex(cameraBlue, -0.25),
      sageNeon,
      shadeHex(alertCoral, -0.1),
    ],
    details: [
      accent,
      shadeHex(accent, 0.2),
      alertCoral,
      ticketAmber,
      cameraBlue,
      sageNeon,
      shadeHex(coldPaper, -0.3),
    ],
    hatch: [accent, shadeHex(accent, 0.25), shadeHex(accent, -0.15)],
    ink: inkNight,
  };
}

// ---------------------------------------------------------------------------
// Construction des formes
// ---------------------------------------------------------------------------

const HEAD_MIN_RADIUS = 15;
const HEAD_MAX_RADIUS = 22;

function makeHead(rng: Rng, pool: ColorPool): CircleShape | PolygonShape {
  const radius = between(rng, HEAD_MIN_RADIUS, HEAD_MAX_RADIUS);
  const cx = clamp(between(rng, 38, 62), radius, 100 - radius);
  const cy = clamp(between(rng, 32, 46), radius, 100 - radius);
  const fill = pick(rng, pool.lights);
  const usePolygon = rng() < 0.4;
  if (usePolygon) {
    return {
      kind: 'polygon',
      cx: round2(cx),
      cy: round2(cy),
      radius: round2(radius),
      sides: pick(rng, [4, 5, 6] as const),
      rotation: round2(between(rng, 0, 360)),
      fill,
    };
  }
  return { kind: 'circle', cx: round2(cx), cy: round2(cy), r: round2(radius), fill };
}

function headCenter(head: CircleShape | PolygonShape): Point {
  return { x: head.cx, y: head.cy };
}

function headRadius(head: CircleShape | PolygonShape): number {
  return head.kind === 'circle' ? head.r : head.radius;
}

function makeTorso(rng: Rng, pool: ColorPool, head: CircleShape | PolygonShape): RoundedRectShape {
  const width = between(rng, 44, 64);
  const height = between(rng, 30, 42);
  const x = clamp(head.cx - width / 2 + between(rng, -6, 6), 0, 100 - width);
  const y = 100 - height;
  return {
    kind: 'roundedRect',
    x: round2(x),
    y: round2(y),
    width: round2(width),
    height: round2(height),
    radius: round2(between(rng, 4, 14)),
    rotation: round2(between(rng, -8, 8)),
    fill: pick(rng, pool.masses),
  };
}

function makeHatchBand(rng: Rng, pool: ColorPool): HatchBandShape {
  const width = between(rng, 30, 70);
  const height = between(rng, 6, 14);
  return {
    kind: 'hatchBand',
    x: round2(between(rng, 0, 100 - width)),
    y: round2(between(rng, 0, 100 - height)),
    width: round2(width),
    height: round2(height),
    rotation: round2(between(rng, -30, 30)),
    color: pick(rng, pool.hatch),
    spacing: round2(between(rng, 3, 6)),
  };
}

function makeBrowArc(rng: Rng, pool: ColorPool, head: CircleShape | PolygonShape): ArcShape {
  const r = between(rng, 6, 12);
  const center = headCenter(head);
  const cx = clamp(center.x + between(rng, -6, 6), r, 100 - r);
  const cy = clamp(center.y + between(rng, -4, 8), r, 100 - r);
  return {
    kind: 'arc',
    cx: round2(cx),
    cy: round2(cy),
    r: round2(r),
    startAngle: round2(between(rng, 0, 360)),
    sweep: round2(between(rng, 70, 200)),
    stroke: pool.ink,
    strokeWidth: round2(between(rng, 2, 4)),
  };
}

/** Accessoire posé au bord de la tête : mèche, col, boucle. Toujours de la famille complémentaire. */
function makeAccessory(
  rng: Rng,
  pool: ColorPool,
  head: CircleShape | PolygonShape,
): CircleShape | PolygonShape {
  const radius = between(rng, 6, 14);
  const angle = (between(rng, 0, 360) * Math.PI) / 180;
  const distance = headRadius(head) * 0.9;
  const center = headCenter(head);
  const cx = clamp(center.x + Math.cos(angle) * distance, radius, 100 - radius);
  const cy = clamp(center.y + Math.sin(angle) * distance, radius, 100 - radius);
  const fill = pick(rng, pool.details);
  if (head.kind === 'circle') {
    return {
      kind: 'polygon',
      cx: round2(cx),
      cy: round2(cy),
      radius: round2(radius),
      sides: pick(rng, [3, 4, 5, 6] as const),
      rotation: round2(between(rng, 0, 360)),
      fill,
    };
  }
  return { kind: 'circle', cx: round2(cx), cy: round2(cy), r: round2(radius), fill };
}

function makeExtra(rng: Rng, pool: ColorPool): PortraitShape {
  const kind = pick(rng, ['circle', 'roundedRect', 'polygon', 'arc', 'hatchBand'] as const);
  switch (kind) {
    case 'circle': {
      const r = between(rng, 3, 9);
      return {
        kind,
        cx: round2(between(rng, r, 100 - r)),
        cy: round2(between(rng, r, 100 - r)),
        r: round2(r),
        fill: pick(rng, pool.details),
      };
    }
    case 'roundedRect': {
      const width = between(rng, 10, 30);
      const height = between(rng, 4, 12);
      return {
        kind,
        x: round2(between(rng, 0, 100 - width)),
        y: round2(between(rng, 0, 100 - height)),
        width: round2(width),
        height: round2(height),
        radius: round2(between(rng, 1, 5)),
        rotation: round2(between(rng, -45, 45)),
        fill: pick(rng, pool.details),
      };
    }
    case 'polygon': {
      const radius = between(rng, 4, 10);
      return {
        kind,
        cx: round2(between(rng, radius, 100 - radius)),
        cy: round2(between(rng, radius, 100 - radius)),
        radius: round2(radius),
        sides: pick(rng, [3, 4, 5, 6] as const),
        rotation: round2(between(rng, 0, 360)),
        fill: pick(rng, pool.details),
      };
    }
    case 'arc': {
      const r = between(rng, 5, 14);
      return {
        kind,
        cx: round2(between(rng, r, 100 - r)),
        cy: round2(between(rng, r, 100 - r)),
        r: round2(r),
        startAngle: round2(between(rng, 0, 360)),
        sweep: round2(between(rng, 60, 240)),
        stroke: pick(rng, pool.details),
        strokeWidth: round2(between(rng, 1.5, 3)),
      };
    }
    case 'hatchBand':
      return makeHatchBand(rng, pool);
  }
}

function makePosture(
  rng: Rng,
  pool: ColorPool,
  head: CircleShape | PolygonShape,
  torso: RoundedRectShape,
): PostureLine {
  if (rng() < 0.6) {
    const center = headCenter(head);
    const eyeOffset = between(rng, -4, 4);
    const from = { x: center.x + eyeOffset, y: center.y - headRadius(head) * 0.15 };
    const direction = pick(rng, [-1, 1] as const);
    const angle = (between(rng, -55, 55) * Math.PI) / 180;
    const length = between(rng, 8, 16);
    const to = {
      x: from.x + Math.cos(angle) * length * direction,
      y: from.y + Math.sin(angle) * length,
    };
    return {
      kind: 'gaze',
      from: { x: round2(clamp(from.x, 0, 100)), y: round2(clamp(from.y, 0, 100)) },
      to: { x: round2(clamp(to.x, 0, 100)), y: round2(clamp(to.y, 0, 100)) },
      stroke: pool.ink,
      strokeWidth: 2.5,
    };
  }
  const tilt = between(rng, -6, 6);
  const inset = between(rng, 2, 8);
  return {
    kind: 'shoulder',
    from: {
      x: round2(clamp(torso.x + inset, 0, 100)),
      y: round2(clamp(torso.y + tilt, 0, 100)),
    },
    to: {
      x: round2(clamp(torso.x + torso.width - inset, 0, 100)),
      y: round2(clamp(torso.y - tilt, 0, 100)),
    },
    stroke: pick(rng, [PALETTE.coldPaper, shadeHex(pool.hatch[0], 0.35)] as const),
    strokeWidth: 3,
  };
}

/**
 * Construit la description complète d'un portrait pour une seed et une couleur d'accent.
 * Pure et déterministe. Toutes les coordonnées sont dans le viewBox [0, 100].
 */
export function buildPortrait(seed: number, accentColor: string): PortraitSpec {
  const accent = normalizeAccentColor(accentColor);
  const rng = mulberry32(seed);
  const pool = buildColorPool(accent);

  const background: PortraitBackground = {
    fill: pick(rng, pool.backgrounds),
    cornerRadius: pick(rng, [6, 10, 14, 50] as const),
  };

  const head = makeHead(rng, pool);
  const torso = makeTorso(rng, pool, head);
  const shapes: PortraitShape[] = [
    torso,
    head,
    makeAccessory(rng, pool, head),
    makeBrowArc(rng, pool, head),
    makeHatchBand(rng, pool),
  ];

  const extraCount = Math.floor(rng() * (MAX_SHAPES - MIN_SHAPES + 1));
  for (let i = 0; i < extraCount; i += 1) {
    shapes.push(makeExtra(rng, pool));
  }

  const posture = makePosture(rng, pool, head, torso);

  return { seed, accentColor: accent, background, shapes, posture };
}

// ---------------------------------------------------------------------------
// Variation par état de confiance
// ---------------------------------------------------------------------------

interface StateTuning {
  /** Multiplicateur d'ouverture des arcs. */
  sweep: number;
  /** Inclinaison additionnelle des bandes hachurées, en degrés. */
  bandTilt: number;
  /** Multiplicateur de longueur de la ligne de posture. */
  posture: number;
}

const STATE_TUNING: Record<PortraitState, StateTuning> = {
  closed: { sweep: 0.55, bandTilt: 14, posture: 0.6 },
  careful: { sweep: 0.8, bandTilt: 7, posture: 0.85 },
  neutral: { sweep: 1, bandTilt: 0, posture: 1 },
  available: { sweep: 1.2, bandTilt: -5, posture: 1.15 },
  engaged: { sweep: 1.4, bandTilt: -10, posture: 1.3 },
};

const MIN_SWEEP = 20;
const MAX_SWEEP = 340;

/**
 * Applique un état de confiance à un portrait : les arcs s'ouvrent ou se ferment,
 * les bandes s'inclinent, la ligne de posture s'allonge ou se rétracte.
 * L'état `neutral` renvoie le portrait inchangé. Les bornes [0, 100] sont préservées.
 */
export function applyPortraitState(spec: PortraitSpec, state: PortraitState): PortraitSpec {
  if (state === 'neutral') {
    return spec;
  }
  const tuning = STATE_TUNING[state];
  const shapes = spec.shapes.map((shape): PortraitShape => {
    switch (shape.kind) {
      case 'arc':
        return { ...shape, sweep: round2(clamp(shape.sweep * tuning.sweep, MIN_SWEEP, MAX_SWEEP)) };
      case 'hatchBand':
        return { ...shape, rotation: round2(shape.rotation + tuning.bandTilt) };
      case 'circle':
      case 'roundedRect':
      case 'polygon':
        return shape;
    }
  });
  const { from, to } = spec.posture;
  const posture: PostureLine = {
    ...spec.posture,
    to: {
      x: round2(clamp(from.x + (to.x - from.x) * tuning.posture, 0, 100)),
      y: round2(clamp(from.y + (to.y - from.y) * tuning.posture, 0, 100)),
    },
  };
  return { ...spec, shapes, posture };
}

// ---------------------------------------------------------------------------
// Helpers de rendu (purs) : conversion vers attributs SVG
// ---------------------------------------------------------------------------

/** Sommets d'un polygone régulier, dans l'ordre. */
export function polygonPoints(shape: PolygonShape): Point[] {
  const points: Point[] = [];
  const step = (2 * Math.PI) / shape.sides;
  const offset = (shape.rotation * Math.PI) / 180;
  for (let i = 0; i < shape.sides; i += 1) {
    const angle = offset + i * step;
    points.push({
      x: round2(clamp(shape.cx + Math.cos(angle) * shape.radius, 0, 100)),
      y: round2(clamp(shape.cy + Math.sin(angle) * shape.radius, 0, 100)),
    });
  }
  return points;
}

/** Points de départ et d'arrivée d'un arc. */
export function arcEndpoints(shape: ArcShape): { start: Point; end: Point } {
  const toPoint = (degrees: number): Point => {
    const radians = (degrees * Math.PI) / 180;
    return {
      x: round2(clamp(shape.cx + Math.cos(radians) * shape.r, 0, 100)),
      y: round2(clamp(shape.cy + Math.sin(radians) * shape.r, 0, 100)),
    };
  };
  return { start: toPoint(shape.startAngle), end: toPoint(shape.startAngle + shape.sweep) };
}

/** Attribut `d` d'un `<path>` pour un arc de cercle ouvert. */
export function arcPath(shape: ArcShape): string {
  const { start, end } = arcEndpoints(shape);
  const largeArc = shape.sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${shape.r} ${shape.r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** Attribut `points` d'un `<polygon>`. */
export function polygonPointsAttribute(shape: PolygonShape): string {
  return polygonPoints(shape)
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
}
