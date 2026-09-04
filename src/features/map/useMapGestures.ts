/**
 * Gestes de la vue du plan (Pointer Events uniquement, jamais Touch Events).
 *
 * - un doigt : glissement (pan) dès que le déplacement dépasse `TAP_MAX_DISTANCE` ;
 * - deux doigts : pincement (échelle autour du point médian) ;
 * - tap bref et immobile : laissé passer vers la zone (sélection) ;
 * - double-tap (stylet / doigt) : zoom ×2 centré sur le point, ou retour à 1× au maximum ;
 * - Ctrl/⌘ + molette : zoom autour du pointeur ;
 * - clavier (+ / = , − , 0) quand un élément du plan a le focus.
 *
 * Tous les écouteurs sont natifs et posés sur le conteneur (`stageRef`) ; pendant un geste, les
 * déplacements et relâchements sont écoutés sur `window` pour survivre à la sortie du conteneur.
 * Un glissement ou un pincement supprime le `click` qui suit (phase de capture) : aucune
 * sélection accidentelle. Les mathématiques sont dans `gestureMath.ts`.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  TAP_MAX_DISTANCE,
  clampTransform,
  distance,
  doubleTapScale,
  isDoubleTap,
  isIdentity,
  isTap,
  nextZoomLevel,
  panBy,
  pinchStep,
  previousZoomLevel,
  wheelFactor,
  zoomAround,
  zoomAroundCenter,
  type Point,
  type PointerSample,
  type Transform,
  type Viewport,
} from './gestureMath';
import { formatMultiplier } from './mapModel';

export type GesturePhase = 'idle' | 'pan' | 'pinch';
export type ZoomCause = 'button' | 'keyboard' | 'double-tap' | 'wheel' | 'reset';
export type ZoomStepCause = Extract<ZoomCause, 'button' | 'keyboard'>;

/**
 * Message d'annonce (aria-live) d'un palier de zoom : « Zoom ×1,5. », « Plan recadré, zoom ×1. »,
 * « Zoom maximal (×4). » ; la molette, continue, n'est pas annoncée.
 */
export function zoomAnnouncement(scale: number, cause: ZoomCause, changed: boolean): string | null {
  if (cause === 'wheel') return null;
  const level = formatMultiplier(scale);
  if (cause === 'reset') return changed ? `Plan recadré, zoom ${level}.` : 'Plan déjà recadré.';
  if (changed) return `Zoom ${level}.`;
  return scale > 1 ? `Zoom maximal (${level}).` : `Zoom minimal (${level}).`;
}

export interface MapGesturesOptions {
  /**
   * Appelé après chaque palier discret (bouton, clavier, double-tap, recadrage, molette) avec
   * l'échelle résultante et l'indication qu'elle a effectivement changé (bornes atteintes sinon).
   */
  onZoomChange?: (scale: number, cause: ZoomCause, changed: boolean) => void;
}

export interface MapGestures {
  transform: Transform;
  phase: GesturePhase;
  atMin: boolean;
  atMax: boolean;
  zoomIn: (cause?: ZoomStepCause) => void;
  zoomOut: (cause?: ZoomStepCause) => void;
  /** Retour à 1× sans translation (bouton « Recadrer » ou touche 0) ; annoncé comme recadrage. */
  reset: () => void;
}

interface DownSample extends PointerSample {
  pointerType: string;
}

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const EPSILON = 1e-6;

export function useMapGestures(
  stageRef: RefObject<HTMLElement | null>,
  options: MapGesturesOptions = {},
): MapGestures {
  const [transform, setTransformState] = useState<Transform>(IDENTITY);
  const [phase, setPhase] = useState<GesturePhase>('idle');
  const transformRef = useRef<Transform>(IDENTITY);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const setTransform = useCallback((next: Transform): void => {
    const current = transformRef.current;
    if (
      Math.abs(current.scale - next.scale) < EPSILON &&
      Math.abs(current.tx - next.tx) < EPSILON &&
      Math.abs(current.ty - next.ty) < EPSILON
    ) {
      return;
    }
    transformRef.current = next;
    setTransformState(next);
  }, []);

  const measure = useCallback((): Viewport & { left: number; top: number } => {
    const el = stageRef.current;
    if (!el) return { width: 0, height: 0, left: 0, top: 0 };
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height, left: r.left, top: r.top };
  }, [stageRef]);

  const stepTo = useCallback(
    (nextScale: number, cause: ZoomCause): void => {
      const rect = measure();
      const current = transformRef.current;
      const next = cause === 'reset' ? IDENTITY : zoomAroundCenter(current, nextScale, rect);
      const changed =
        cause === 'reset' ? !isIdentity(current) : Math.abs(next.scale - current.scale) > EPSILON;
      if (changed) setTransform(next);
      optionsRef.current.onZoomChange?.(next.scale, cause, changed);
    },
    [measure, setTransform],
  );

  const zoomIn = useCallback(
    (cause: ZoomStepCause = 'button') => stepTo(nextZoomLevel(transformRef.current.scale), cause),
    [stepTo],
  );
  const zoomOut = useCallback(
    (cause: ZoomStepCause = 'button') =>
      stepTo(previousZoomLevel(transformRef.current.scale), cause),
    [stepTo],
  );
  const reset = useCallback(() => stepTo(MIN_SCALE, 'reset'), [stepTo]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const pointers = new Map<number, Point>();
    let down: DownSample | null = null;
    let moved = false;
    let suppressClick = false;
    let lastTap: PointerSample | null = null;
    let releaseTimer: number | null = null;

    const toLocal = (e: { clientX: number; clientY: number }): Point => {
      const rect = measure();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const viewport = (): Viewport => {
      const rect = measure();
      return { width: rect.width, height: rect.height };
    };
    const armClickSuppression = (): void => {
      suppressClick = true;
      // Le `click` suit immédiatement le `pointerup` ; au-delà, un clic clavier doit passer.
      if (releaseTimer !== null) window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        suppressClick = false;
        releaseTimer = null;
      }, 0);
    };

    const onWindowMove = (e: PointerEvent): void => {
      const previous = pointers.get(e.pointerId);
      if (!previous) return;
      const p = toLocal(e);
      if (pointers.size >= 2) {
        const [idA, idB] = [...pointers.keys()];
        if (idA === undefined || idB === undefined) return;
        const a0 = pointers.get(idA);
        const b0 = pointers.get(idB);
        pointers.set(e.pointerId, p);
        const a1 = pointers.get(idA);
        const b1 = pointers.get(idB);
        if (a0 && b0 && a1 && b1) {
          setTransform(pinchStep(transformRef.current, [a0, b0], [a1, b1], viewport()));
        }
        return;
      }
      if (!moved && down && distance(down, p) >= TAP_MAX_DISTANCE) {
        moved = true;
        suppressClick = true;
        setPhase('pan');
      }
      if (moved) {
        setTransform(panBy(transformRef.current, p.x - previous.x, p.y - previous.y, viewport()));
      }
      pointers.set(e.pointerId, p);
    };

    const detach = (): void => {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
    };

    const onWindowUp = (e: PointerEvent): void => {
      if (!pointers.has(e.pointerId)) return;
      const p = toLocal(e);
      pointers.delete(e.pointerId);
      if (pointers.size > 0) return; // un doigt reste posé : le geste continue de là où il est
      detach();
      setPhase('idle');
      const start = down;
      down = null;
      if (e.type === 'pointercancel' || moved || !start) {
        lastTap = null;
        if (moved || e.type === 'pointercancel') armClickSuppression();
        return;
      }
      const up: PointerSample = { ...p, time: now() };
      if (!isTap(start, up)) {
        lastTap = null;
        armClickSuppression();
        return;
      }
      if (start.pointerType !== 'mouse' && isDoubleTap(lastTap, up)) {
        lastTap = null;
        armClickSuppression();
        const current = transformRef.current;
        const next = zoomAround(current, doubleTapScale(current.scale), p, viewport());
        const changed = Math.abs(next.scale - current.scale) > EPSILON;
        if (changed) setTransform(next);
        optionsRef.current.onZoomChange?.(next.scale, 'double-tap', changed);
        return;
      }
      lastTap = up;
    };

    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const p = toLocal(e);
      if (pointers.size === 0) {
        window.addEventListener('pointermove', onWindowMove);
        window.addEventListener('pointerup', onWindowUp);
        window.addEventListener('pointercancel', onWindowUp);
        down = { ...p, time: now(), pointerType: e.pointerType };
        moved = false;
        suppressClick = false;
      } else if (pointers.size === 1) {
        // Deuxième doigt : pincement ; l'appui ne sélectionnera plus rien.
        moved = true;
        suppressClick = true;
        setPhase('pinch');
      }
      pointers.set(e.pointerId, p);
    };

    const onClickCapture = (e: MouseEvent): void => {
      if (!suppressClick) return;
      suppressClick = false;
      if (releaseTimer !== null) {
        window.clearTimeout(releaseTimer);
        releaseTimer = null;
      }
      e.preventDefault();
      e.stopPropagation();
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn('keyboard');
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut('keyboard');
      } else if (e.key === '0') {
        e.preventDefault();
        reset();
      }
    };

    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const current = transformRef.current;
      const next = zoomAround(
        current,
        current.scale * wheelFactor(e.deltaY),
        toLocal(e),
        viewport(),
      );
      const changed = Math.abs(next.scale - current.scale) > EPSILON;
      if (changed) setTransform(next);
      optionsRef.current.onZoomChange?.(next.scale, 'wheel', changed);
    };

    const onResize = (): void => {
      setTransform(clampTransform(transformRef.current, viewport()));
    };

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('click', onClickCapture, true);
    stage.addEventListener('keydown', onKeyDown);
    stage.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    return () => {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('click', onClickCapture, true);
      stage.removeEventListener('keydown', onKeyDown);
      stage.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      detach();
      if (releaseTimer !== null) window.clearTimeout(releaseTimer);
    };
  }, [stageRef, measure, setTransform, zoomIn, zoomOut, reset]);

  return {
    transform,
    phase,
    atMin: transform.scale <= MIN_SCALE + EPSILON,
    atMax: transform.scale >= MAX_SCALE - EPSILON,
    zoomIn,
    zoomOut,
    reset,
  };
}
