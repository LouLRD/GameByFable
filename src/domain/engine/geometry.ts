import type { Zone } from '../model/scenario';

/** Centroïde (moyenne des sommets) d'un polygone de zone, en coordonnées 0..100. */
export function zoneCentroid(zone: Zone): { x: number; y: number } {
  const n = zone.polygon.length;
  let x = 0;
  let y = 0;
  for (const [px, py] of zone.polygon) {
    x += px;
    y += py;
  }
  return { x: x / n, y: y / n };
}

export function polygonToPath(polygon: readonly (readonly [number, number])[]): string {
  return polygon.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ') + ' Z';
}
