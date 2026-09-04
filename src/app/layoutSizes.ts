/**
 * Dimensions des colonnes du bureau (état local à l'interface : le store n'en a pas la charge).
 * Bornes de layout.css : dossier 240–40vw, inspecteur 280–45vw, frise 140–50vh.
 */
export interface LayoutSizes {
  casefile: number;
  inspector: number;
  timeline: number;
}

export interface Bounds {
  min: number;
  max: number;
}

export const DEFAULT_SIZES: LayoutSizes = { casefile: 320, inspector: 360, timeline: 220 };
export const RESIZE_STEP = 16;
const LAYOUT_KEY = 'lva:layout:v1';

export function layoutBounds(key: keyof LayoutSizes): Bounds {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const height = typeof window !== 'undefined' ? window.innerHeight : 800;
  switch (key) {
    case 'casefile':
      return { min: 240, max: Math.max(240, Math.round(width * 0.4)) };
    case 'inspector':
      return { min: 280, max: Math.max(280, Math.round(width * 0.45)) };
    case 'timeline':
      return { min: 140, max: Math.max(140, Math.round(height * 0.5)) };
  }
}

export function clampSize(value: number, { min, max }: Bounds): number {
  return Math.min(max, Math.max(min, value));
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function loadSizes(): LayoutSizes {
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_SIZES;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SIZES;
    const record = parsed as Record<string, unknown>;
    return {
      casefile: clampSize(readNumber(record.casefile, DEFAULT_SIZES.casefile), layoutBounds('casefile')),
      inspector: clampSize(readNumber(record.inspector, DEFAULT_SIZES.inspector), layoutBounds('inspector')),
      timeline: clampSize(readNumber(record.timeline, DEFAULT_SIZES.timeline), layoutBounds('timeline')),
    };
  } catch {
    return DEFAULT_SIZES;
  }
}

export function saveSizes(sizes: LayoutSizes): void {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(sizes));
  } catch {
    // stockage indisponible : la disposition reste en mémoire pour la session
  }
}
