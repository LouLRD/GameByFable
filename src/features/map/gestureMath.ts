/**
 * Mathématiques pures de la vue du plan : échelle bornée, zoom autour d'un point, bornes de
 * translation, pas de pincement et discrimination tap / glissement. Aucune dépendance au DOM :
 * les coordonnées sont exprimées en pixels relatifs au coin supérieur gauche de la fenêtre du
 * plan (`Viewport`), et la transformation CSS est `translate(tx, ty) scale(scale)` avec une
 * origine en (0, 0) : un point de contenu `c` s'affiche en `t + c × scale`.
 */

export interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PointerSample extends Point {
  /** Horodatage en millisecondes (performance.now()). */
  time: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/** Paliers atteints par les boutons et le clavier (+ / −). */
export const ZOOM_LEVELS: readonly number[] = [1, 1.5, 2, 3, 4];
/** Facteur du double-tap. */
export const DOUBLE_TAP_FACTOR = 2;
/** Au-delà de ce déplacement (px), un appui devient un glissement et ne sélectionne plus. */
export const TAP_MAX_DISTANCE = 8;
/** Au-delà de cette durée (ms), un appui n'est plus un tap. */
export const TAP_MAX_DURATION = 400;
/** Délai maximal entre deux taps pour former un double-tap. */
export const DOUBLE_TAP_MAX_INTERVAL = 350;
/** Distance maximale entre deux taps pour former un double-tap. */
export const DOUBLE_TAP_MAX_DISTANCE = 30;
/** Seuil au-dessus duquel les étiquettes de durée réapparaissent en mode compact. */
export const LABELS_VISIBLE_SCALE = 1.5;

export const IDENTITY: Transform = { scale: 1, tx: 0, ty: 0 };

const EPSILON = 1e-6;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Bornes de translation : le contenu (de taille `viewport × scale`) couvre toujours la
 * fenêtre ; il ne peut ni laisser un bord vide ni sortir entièrement de la vue.
 */
export function clampTranslate(t: Transform, viewport: Viewport): Transform {
  const spanX = viewport.width - viewport.width * t.scale;
  const spanY = viewport.height - viewport.height * t.scale;
  const tx = Math.min(Math.max(0, spanX), Math.max(Math.min(0, spanX), t.tx));
  const ty = Math.min(Math.max(0, spanY), Math.max(Math.min(0, spanY), t.ty));
  return { scale: t.scale, tx: round(tx), ty: round(ty) };
}

export function clampTransform(t: Transform, viewport: Viewport): Transform {
  return clampTranslate({ ...t, scale: clampScale(t.scale) }, viewport);
}

/**
 * Change l'échelle en gardant fixe le point de contenu affiché sous `focus` (coordonnées de la
 * fenêtre) : c = (focus − t) / s ; t' = focus − c × s'.
 */
export function zoomAround(
  t: Transform,
  nextScale: number,
  focus: Point,
  viewport: Viewport,
): Transform {
  const scale = clampScale(nextScale);
  const cx = (focus.x - t.tx) / t.scale;
  const cy = (focus.y - t.ty) / t.scale;
  return clampTranslate({ scale, tx: focus.x - cx * scale, ty: focus.y - cy * scale }, viewport);
}

/** Zoom autour du centre de la fenêtre (boutons, clavier). */
export function zoomAroundCenter(t: Transform, nextScale: number, viewport: Viewport): Transform {
  return zoomAround(t, nextScale, { x: viewport.width / 2, y: viewport.height / 2 }, viewport);
}

export function panBy(t: Transform, dx: number, dy: number, viewport: Viewport): Transform {
  return clampTranslate({ scale: t.scale, tx: t.tx + dx, ty: t.ty + dy }, viewport);
}

/** Palier suivant strictement supérieur à l'échelle courante (ou le maximum). */
export function nextZoomLevel(scale: number): number {
  return ZOOM_LEVELS.find((level) => level > scale + EPSILON) ?? MAX_SCALE;
}

/** Palier précédent strictement inférieur à l'échelle courante (ou le minimum). */
export function previousZoomLevel(scale: number): number {
  const lower = ZOOM_LEVELS.filter((level) => level < scale - EPSILON);
  return lower.length > 0 ? (lower[lower.length - 1] ?? MIN_SCALE) : MIN_SCALE;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Pas incrémental d'un pincement : l'écart entre les deux pointeurs dicte le facteur d'échelle,
 * appliqué autour du milieu précédent ; le déplacement du milieu produit la translation.
 */
export function pinchStep(
  t: Transform,
  previous: readonly [Point, Point],
  current: readonly [Point, Point],
  viewport: Viewport,
): Transform {
  const d0 = distance(previous[0], previous[1]);
  const d1 = distance(current[0], current[1]);
  const m0 = midpoint(previous[0], previous[1]);
  const m1 = midpoint(current[0], current[1]);
  const factor = d0 > EPSILON ? d1 / d0 : 1;
  const zoomed = zoomAround(t, t.scale * factor, m0, viewport);
  return panBy(zoomed, m1.x - m0.x, m1.y - m0.y, viewport);
}

/** Un appui bref et immobile : seul cas où la sélection d'une zone est déclenchée. */
export function isTap(down: PointerSample, up: PointerSample): boolean {
  return distance(down, up) < TAP_MAX_DISTANCE && up.time - down.time < TAP_MAX_DURATION;
}

/** Le second tap d'un double-tap : proche du précédent dans l'espace et dans le temps. */
export function isDoubleTap(previous: PointerSample | null, current: PointerSample): boolean {
  if (!previous) return false;
  return (
    current.time - previous.time < DOUBLE_TAP_MAX_INTERVAL &&
    distance(previous, current) < DOUBLE_TAP_MAX_DISTANCE
  );
}

/** Échelle visée par un double-tap : ×2 borné, ou retour à 1× quand on est déjà au maximum. */
export function doubleTapScale(scale: number): number {
  return scale >= MAX_SCALE - EPSILON ? MIN_SCALE : clampScale(scale * DOUBLE_TAP_FACTOR);
}

/** Facteur de zoom pour une molette (Ctrl/⌘ + molette ou pincement de pavé tactile). */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0025);
}

export function transformToCss(t: Transform): string {
  return `translate(${round(t.tx)}px, ${round(t.ty)}px) scale(${round(t.scale)})`;
}

export function isIdentity(t: Transform): boolean {
  return Math.abs(t.scale - 1) < EPSILON && Math.abs(t.tx) < 0.5 && Math.abs(t.ty) < 0.5;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
