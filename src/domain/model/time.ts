/** Seconde simulée depuis le début de la fenêtre du scénario. */
export type Second = number & { readonly __brand: 'Second' };

export interface Interval {
  start: Second;
  end: Second;
}

export const sec = (n: number): Second => n as Second;

export const interval = (start: number, end: number): Interval => ({
  start: sec(start),
  end: sec(end),
});

export const intervalsOverlap = (a: Interval, b: Interval): boolean =>
  a.start < b.end && b.start < a.end;

export const intervalContains = (outer: Interval, inner: Interval): boolean =>
  outer.start <= inner.start && inner.end <= outer.end;

export const intervalContainsTime = (i: Interval, t: number): boolean => i.start <= t && t < i.end;

export const intervalDuration = (i: Interval): number => i.end - i.start;

export const intersectIntervals = (a: Interval, b: Interval): Interval | null => {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return start < end ? interval(start, end) : null;
};

/** Formatte une seconde simulée en horloge "HH:MM:SS" à partir d'une horloge de départ "HH:MM:SS". */
export function formatClock(startClock: string, seconds: number, withSeconds = true): string {
  const [h = 0, m = 0, s = 0] = startClock.split(':').map((p) => Number.parseInt(p, 10));
  const total = h * 3600 + m * 60 + s + Math.round(seconds);
  const hh = Math.floor(total / 3600) % 24;
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return withSeconds ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(hh)}:${pad(mm)}`;
}

/** Formatte en français lisible : "20 h 57 min 20 s". */
export function formatClockFr(startClock: string, seconds: number): string {
  const [h = 0, m = 0, s = 0] = startClock.split(':').map((p) => Number.parseInt(p, 10));
  const total = h * 3600 + m * 60 + s + Math.round(seconds);
  const hh = Math.floor(total / 3600) % 24;
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return ss === 0 ? `${hh} h ${pad(mm)}` : `${hh} h ${pad(mm)} min ${pad(ss)} s`;
}

export const parseClockToSeconds = (startClock: string, clock: string): Second => {
  const toSec = (c: string) => {
    const [h = 0, m = 0, s = 0] = c.split(':').map((p) => Number.parseInt(p, 10));
    return h * 3600 + m * 60 + s;
  };
  return sec(toSec(clock) - toSec(startClock));
};
