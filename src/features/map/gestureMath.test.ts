import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  clampTransform,
  clampTranslate,
  doubleTapScale,
  isDoubleTap,
  isIdentity,
  isTap,
  nextZoomLevel,
  panBy,
  pinchStep,
  previousZoomLevel,
  transformToCss,
  wheelFactor,
  zoomAround,
  zoomAroundCenter,
  type Transform,
} from './gestureMath';

const VIEWPORT = { width: 390, height: 390 };

describe('clampScale', () => {
  it('borne l’échelle entre 1× et 4× et rejette les valeurs non finies', () => {
    expect(clampScale(0.5)).toBe(MIN_SCALE);
    expect(clampScale(1)).toBe(1);
    expect(clampScale(2.5)).toBe(2.5);
    expect(clampScale(9)).toBe(MAX_SCALE);
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(MIN_SCALE);
  });
});

describe('clampTranslate', () => {
  it('à 1×, la translation est toujours nulle', () => {
    expect(clampTranslate({ scale: 1, tx: 80, ty: -40 }, VIEWPORT)).toEqual(IDENTITY);
  });

  it('à 2×, le contenu couvre toujours la fenêtre : tx et ty restent dans [−390, 0]', () => {
    expect(clampTranslate({ scale: 2, tx: 50, ty: 10 }, VIEWPORT)).toEqual({
      scale: 2,
      tx: 0,
      ty: 0,
    });
    expect(clampTranslate({ scale: 2, tx: -500, ty: -391 }, VIEWPORT)).toEqual({
      scale: 2,
      tx: -390,
      ty: -390,
    });
    expect(clampTranslate({ scale: 2, tx: -120, ty: -200 }, VIEWPORT)).toEqual({
      scale: 2,
      tx: -120,
      ty: -200,
    });
  });

  it('les bornes suivent les dimensions réelles de la fenêtre (non carrée)', () => {
    const t = clampTranslate({ scale: 3, tx: -9999, ty: -9999 }, { width: 300, height: 200 });
    expect(t).toEqual({ scale: 3, tx: -600, ty: -400 });
  });

  it('clampTransform borne aussi l’échelle', () => {
    expect(clampTransform({ scale: 0.2, tx: -30, ty: -30 }, VIEWPORT)).toEqual(IDENTITY);
    expect(clampTransform({ scale: 12, tx: 0, ty: 0 }, VIEWPORT).scale).toBe(MAX_SCALE);
  });
});

describe('zoomAround', () => {
  it('garde fixe le point de contenu situé sous le point focal', () => {
    const focus = { x: 100, y: 200 };
    const t = zoomAround(IDENTITY, 2, focus, VIEWPORT);
    expect(t).toEqual({ scale: 2, tx: -100, ty: -200 });
    // Le point de contenu (100, 200) s'affiche toujours en (100, 200).
    expect(t.tx + 100 * t.scale).toBe(focus.x);
    expect(t.ty + 200 * t.scale).toBe(focus.y);
  });

  it('enchaîne deux zooms autour de points différents en restant cohérent', () => {
    const t1 = zoomAround(IDENTITY, 2, { x: 100, y: 100 }, VIEWPORT);
    const t2 = zoomAround(t1, 4, { x: 300, y: 50 }, VIEWPORT);
    // Point de contenu sous (300, 50) avant le second zoom :
    const cx = (300 - t1.tx) / t1.scale;
    const cy = (50 - t1.ty) / t1.scale;
    expect(t2.scale).toBe(4);
    expect(t2.tx + cx * 4).toBeCloseTo(300, 6);
    expect(t2.ty + cy * 4).toBeCloseTo(50, 6);
  });

  it('borne la translation aux coins et l’échelle au maximum', () => {
    expect(zoomAround(IDENTITY, 2, { x: 0, y: 0 }, VIEWPORT)).toEqual({ scale: 2, tx: 0, ty: 0 });
    expect(zoomAround(IDENTITY, 2, { x: 390, y: 390 }, VIEWPORT)).toEqual({
      scale: 2,
      tx: -390,
      ty: -390,
    });
    expect(zoomAround(IDENTITY, 40, { x: 195, y: 195 }, VIEWPORT).scale).toBe(MAX_SCALE);
  });

  it('zoomAroundCenter cible le centre de la fenêtre', () => {
    expect(zoomAroundCenter(IDENTITY, 2, VIEWPORT)).toEqual({ scale: 2, tx: -195, ty: -195 });
  });
});

describe('panBy', () => {
  it('translate puis borne', () => {
    const start: Transform = { scale: 2, tx: -195, ty: -195 };
    expect(panBy(start, 50, -50, VIEWPORT)).toEqual({ scale: 2, tx: -145, ty: -245 });
    expect(panBy(start, 300, 0, VIEWPORT)).toEqual({ scale: 2, tx: 0, ty: -195 });
    expect(panBy(start, -300, 300, VIEWPORT)).toEqual({ scale: 2, tx: -390, ty: 0 });
  });

  it('à 1×, un glissement ne déplace rien', () => {
    expect(panBy(IDENTITY, 25, 25, VIEWPORT)).toEqual(IDENTITY);
  });
});

describe('paliers de zoom', () => {
  it('nextZoomLevel monte au palier strictement supérieur, borné à 4×', () => {
    expect(nextZoomLevel(1)).toBe(1.5);
    expect(nextZoomLevel(1.5)).toBe(2);
    expect(nextZoomLevel(1.7)).toBe(2);
    expect(nextZoomLevel(3)).toBe(4);
    expect(nextZoomLevel(4)).toBe(4);
  });

  it('previousZoomLevel descend au palier strictement inférieur, borné à 1×', () => {
    expect(previousZoomLevel(4)).toBe(3);
    expect(previousZoomLevel(1.7)).toBe(1.5);
    expect(previousZoomLevel(1.5)).toBe(1);
    expect(previousZoomLevel(1)).toBe(1);
  });

  it('doubleTapScale double, puis revient à 1× depuis le maximum', () => {
    expect(doubleTapScale(1)).toBe(2);
    expect(doubleTapScale(2)).toBe(4);
    expect(doubleTapScale(3)).toBe(4);
    expect(doubleTapScale(4)).toBe(1);
  });

  it('wheelFactor : molette vers le haut agrandit, vers le bas réduit', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(0)).toBe(1);
  });
});

describe('pinchStep', () => {
  it('l’écart des doigts dicte l’échelle autour du point médian', () => {
    const t = pinchStep(
      IDENTITY,
      [
        { x: 100, y: 200 },
        { x: 200, y: 200 },
      ],
      [
        { x: 50, y: 200 },
        { x: 250, y: 200 },
      ],
      VIEWPORT,
    );
    expect(t).toEqual({ scale: 2, tx: -150, ty: -200 });
  });

  it('le déplacement du point médian produit une translation', () => {
    const t = pinchStep(
      IDENTITY,
      [
        { x: 100, y: 200 },
        { x: 200, y: 200 },
      ],
      [
        { x: 70, y: 200 },
        { x: 270, y: 200 },
      ],
      VIEWPORT,
    );
    expect(t).toEqual({ scale: 2, tx: -130, ty: -200 });
  });

  it('un écart nul au départ ne divise pas par zéro', () => {
    const same = { x: 120, y: 120 };
    const t = pinchStep(
      IDENTITY,
      [same, same],
      [
        { x: 100, y: 100 },
        { x: 140, y: 140 },
      ],
      VIEWPORT,
    );
    expect(t).toEqual(IDENTITY);
  });
});

describe('tap et double-tap', () => {
  it('un appui bref et immobile est un tap ; 8 px ou 400 ms le disqualifient', () => {
    const down = { x: 100, y: 100, time: 1000 };
    expect(isTap(down, { x: 103, y: 102, time: 1150 })).toBe(true);
    expect(isTap(down, { x: 108, y: 100, time: 1150 })).toBe(false);
    expect(isTap(down, { x: 100, y: 100, time: 1400 })).toBe(false);
  });

  it('un double-tap est proche dans le temps et dans l’espace', () => {
    const first = { x: 100, y: 100, time: 1000 };
    expect(isDoubleTap(null, first)).toBe(false);
    expect(isDoubleTap(first, { x: 110, y: 105, time: 1200 })).toBe(true);
    expect(isDoubleTap(first, { x: 100, y: 100, time: 1400 })).toBe(false);
    expect(isDoubleTap(first, { x: 160, y: 100, time: 1100 })).toBe(false);
  });
});

describe('transformToCss / isIdentity', () => {
  it('produit translate puis scale, arrondi au millième', () => {
    expect(transformToCss({ scale: 2, tx: -100.00049, ty: -200 })).toBe(
      'translate(-100px, -200px) scale(2)',
    );
    expect(transformToCss(IDENTITY)).toBe('translate(0px, 0px) scale(1)');
  });

  it('isIdentity tolère un demi-pixel', () => {
    expect(isIdentity(IDENTITY)).toBe(true);
    expect(isIdentity({ scale: 1, tx: 0.2, ty: -0.3 })).toBe(true);
    expect(isIdentity({ scale: 1.5, tx: 0, ty: 0 })).toBe(false);
  });
});
