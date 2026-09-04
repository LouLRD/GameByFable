/**
 * Mini-plan statique des trajectoires réelles (épilogue uniquement, après scellement).
 * Curseur temporel local : les jetons se placent dans la zone du segment contenant t.
 * Équivalent textuel : liste « personne — zone » mise à jour avec le curseur.
 */
import { useId, useState, type JSX } from 'react';

import type { MovementTrack, Zone } from '@/domain/model/scenario';

export interface TrajectoryCharacter {
  id: string;
  name: string;
  accentColor: string;
}

export interface TrajectoryMapProps {
  zones: readonly Zone[];
  tracks: readonly MovementTrack[];
  characters: readonly TrajectoryCharacter[];
  durationSeconds: number;
  clock: (t: number) => string;
  /** Position initiale du curseur local (secondes). */
  initialTime?: number | undefined;
}

type Placement =
  { kind: 'zone'; zoneId: string } | { kind: 'moving' } | { kind: 'before' } | { kind: 'after' };

/** Décalages (unités du plan 0–100) pour empiler plusieurs jetons dans une même zone. */
const OFFSETS: readonly [number, number][] = [
  [0, 0],
  [-4.5, -3],
  [4.5, -3],
  [-4.5, 3],
  [4.5, 3],
  [0, -6],
  [0, 6],
];

function centroid(polygon: readonly [number, number][]): [number, number] {
  if (polygon.length === 0) return [50, 50];
  let x = 0;
  let y = 0;
  for (const [px, py] of polygon) {
    x += px;
    y += py;
  }
  return [x / polygon.length, y / polygon.length];
}

function placementAt(track: MovementTrack | undefined, t: number): Placement {
  if (!track || track.segments.length === 0) return { kind: 'after' };
  const inside = track.segments.find((seg) => seg.start <= t && t <= seg.end);
  if (inside) return { kind: 'zone', zoneId: inside.zoneId };
  const first = track.segments[0];
  const last = track.segments[track.segments.length - 1];
  if (first && t < first.start) return { kind: 'before' };
  if (last && t > last.end) return { kind: 'after' };
  return { kind: 'moving' };
}

function placementLabel(placement: Placement, zoneLabel: (id: string) => string): string {
  switch (placement.kind) {
    case 'zone':
      return zoneLabel(placement.zoneId);
    case 'moving':
      return 'en déplacement';
    case 'before':
      return 'pas encore sur le plan';
    case 'after':
      return 'a quitté le plan';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function TrajectoryMap({
  zones,
  tracks,
  characters,
  durationSeconds,
  clock,
  initialTime = 0,
}: TrajectoryMapProps): JSX.Element {
  const [t, setT] = useState(() => clamp(Math.round(initialTime), 0, durationSeconds));
  const rangeId = useId();
  const listId = useId();

  const zoneLabel = (id: string): string => zones.find((z) => z.id === id)?.label ?? id;
  const zoneCentroid = new Map<string, [number, number]>(
    zones.map((z) => [z.id, centroid(z.polygon)]),
  );

  const placements = characters.map((character) => ({
    character,
    placement: placementAt(
      tracks.find((track) => track.characterId === character.id),
      t,
    ),
  }));

  // Index de chaque jeton au sein de sa zone, pour l'empilement.
  const perZone = new Map<string, number>();
  const tokens = placements.flatMap(({ character, placement }) => {
    if (placement.kind !== 'zone') return [];
    const center = zoneCentroid.get(placement.zoneId);
    if (!center) return [];
    const index = perZone.get(placement.zoneId) ?? 0;
    perZone.set(placement.zoneId, index + 1);
    const [dx, dy] = OFFSETS[index % OFFSETS.length] ?? [0, 0];
    return [
      {
        character,
        zoneId: placement.zoneId,
        x: clamp(center[0] + dx, 3, 97),
        y: clamp(center[1] + dy, 3, 97),
      },
    ];
  });

  const move = (delta: number): void => setT((prev) => clamp(prev + delta, 0, durationSeconds));
  const time = clock(t);

  return (
    <div className="traj">
      <svg
        className="traj-map"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Plan du magasin à ${time} : position réelle de chaque personne. Détail dans la liste qui suit.`}
        aria-describedby={listId}
      >
        {zones.map((zone) => {
          const [cx, cy] = zoneCentroid.get(zone.id) ?? [50, 50];
          const points = zone.polygon.map(([x, y]) => `${x},${y}`).join(' ');
          return (
            <g key={zone.id} data-zone={zone.id}>
              <polygon className="traj-zone" points={points} />
              <text className="traj-zone-label" x={cx} y={cy - 4.5} textAnchor="middle">
                {zone.label}
              </text>
            </g>
          );
        })}
        {tokens.map(({ character, zoneId, x, y }) => (
          <g
            key={character.id}
            className="traj-token"
            data-character={character.id}
            data-zone={zoneId}
            transform={`translate(${x} ${y})`}
          >
            <circle r={3.2} fill={character.accentColor} />
            <text y={1.2} textAnchor="middle">
              {character.name.charAt(0)}
            </text>
          </g>
        ))}
      </svg>

      <div className="traj-controls">
        <div className="field">
          <label className="field-label" htmlFor={rangeId}>
            Heure de la soirée
          </label>
          <output className="traj-clock" htmlFor={rangeId} aria-live="off">
            {time}
          </output>
          <input
            id={rangeId}
            className="traj-range"
            type="range"
            min={0}
            max={durationSeconds}
            step={1}
            value={t}
            aria-valuetext={time}
            onChange={(e) => setT(clamp(Number(e.currentTarget.value), 0, durationSeconds))}
          />
          <p className="field-hint">
            Flèches : ± 1 s · Page précédente / suivante : ± 10 % de la soirée.
          </p>
        </div>
        <div className="traj-buttons">
          <button type="button" className="btn" onClick={() => setT(0)}>
            Début
          </button>
          <button type="button" className="btn" onClick={() => move(-30)}>
            − 30 s
          </button>
          <button type="button" className="btn" onClick={() => move(30)}>
            + 30 s
          </button>
          <button type="button" className="btn" onClick={() => setT(durationSeconds)}>
            Fin
          </button>
        </div>
        <ul id={listId} className="traj-list list-plain">
          {placements.map(({ character, placement }) => (
            <li key={character.id} data-character={character.id} data-placement={placement.kind}>
              <span
                className="traj-swatch"
                style={{ background: character.accentColor }}
                aria-hidden="true"
              >
                {character.name.charAt(0)}
              </span>
              <span>
                {character.name} — {placementLabel(placement, zoneLabel)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
