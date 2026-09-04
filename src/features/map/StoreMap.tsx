/**
 * Plan SVG interactif (GDD §7.1, §15).
 *
 * Couches, dans l'ordre de lecture : passages (images nommées), zones (boutons focusables dont
 * le libellé résume l'occupation), annotations (jetons, marqueurs, obstructions — images
 * nommées, hors des boutons pour rester exposées aux lecteurs d'écran), puis superpositions
 * (lignes de vue, anneaux sonores). Tout ce qui est dessiné possède un équivalent textuel dans
 * `ZoneSheet`. Aucun sens n'est porté par la couleur seule : formes, traits, motifs et glyphes.
 */
import { useId, useRef, type KeyboardEvent } from 'react';
import { DEGREE_LABELS } from '@/components/ui';
import type { Selection } from '@/state/types';
import {
  DEGREE_GLYPH,
  formatMultiplier,
  formatPercent,
  nearestZone,
  type ArrowDirection,
  type MapFrame,
  type MarkerFrame,
  type PassageFrame,
  type Point,
  type SightFrame,
  type SoundFrame,
  type TokenFrame,
  type ZoneFrame,
} from './mapModel';

export interface StoreMapProps {
  frame: MapFrame;
  selection: Selection | null;
  /** Identifiants (zones, personnages) mis en évidence par le store. */
  highlightIds: ReadonlySet<string>;
  /** Identifiants (zones, personnages) impliqués par la dernière hypothèse placée. */
  pulseIds: ReadonlySet<string>;
  /** Faux en mouvement réduit : aucune classe d'animation n'est posée. */
  animate: boolean;
  onSelectZone: (zoneId: string) => void;
}

const TOKEN_RADIUS = 3.4;
const SOUND_RINGS = [4, 8, 12];
const ARROW_KEYS: Record<string, ArrowDirection> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const flag = (on: boolean): 'true' | undefined => (on ? 'true' : undefined);

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function diamondPoints(c: Point, r: number): string {
  return `${c.x},${c.y - r} ${c.x + r},${c.y} ${c.x},${c.y + r} ${c.x - r},${c.y}`;
}

/** Point situé à la fraction `t` du segment ab, décalé perpendiculairement de `offset`. */
function along(a: Point, b: Point, t: number, offset = 0): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: a.x + dx * t + (-dy / len) * offset,
    y: a.y + dy * t + (dx / len) * offset,
  };
}

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------

/** Traits des passages, sous les zones (la partie visible est celle de l'interstice). */
function PassageLayer({ passages }: { passages: PassageFrame[] }): React.JSX.Element {
  return (
    <g className="map-passages">
      {passages.map((p) => {
        const s1 = along(p.a, p.b, 0, 1.3);
        const s2 = along(p.a, p.b, 1, 1.3);
        return (
          <g
            key={p.passage.id}
            className="map-passage"
            role="img"
            aria-label={p.ariaLabel}
            data-passage={p.passage.id}
            data-state={p.state}
            data-sight={p.sight}
          >
            <line className="map-passage-line" x1={p.a.x} y1={p.a.y} x2={p.b.x} y2={p.b.y} />
            {p.state === 'obstructed' ? (
              <line className="map-passage-hatch" x1={p.a.x} y1={p.a.y} x2={p.b.x} y2={p.b.y} />
            ) : null}
            {p.sight !== 'none' ? (
              <line className="map-passage-sight" x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

/** Étiquettes de durée dessinées au-dessus des zones (décoratives : le nom est porté par le trait). */
function PassageLabelLayer({ passages }: { passages: PassageFrame[] }): React.JSX.Element {
  return (
    <g className="map-passage-labels" aria-hidden="true">
      {passages.map((p) => {
        const width = p.label.length * 1.35 + 1.8;
        return (
          <g
            key={p.passage.id}
            className="map-passage-tag"
            data-passage={p.passage.id}
            data-state={p.state}
          >
            <rect
              className="map-passage-label-bg"
              x={p.mid.x - width / 2}
              y={p.mid.y - 1.7}
              width={width}
              height={3.4}
              rx={0.5}
            />
            <text className="map-passage-label" x={p.mid.x} y={p.mid.y + 0.95} textAnchor="middle">
              {p.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function LightMark({ zone }: { zone: ZoneFrame }): React.JSX.Element {
  const bars = zone.light === 'bright' ? 3 : zone.light === 'dim' ? 2 : 1;
  const x = zone.bounds.minX + 1.4;
  const y = zone.bounds.maxY - 1.6;
  return (
    <g className="map-zone-light" data-level={zone.light}>
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          className="map-zone-light-bar"
          data-on={flag(i < bars)}
          x={x + i * 1.5}
          y={y - (i + 1) * 0.9}
          width={1}
          height={(i + 1) * 0.9}
        />
      ))}
    </g>
  );
}

interface ZoneButtonProps {
  zone: ZoneFrame;
  selected: boolean;
  highlighted: boolean;
  pulsing: boolean;
  animate: boolean;
  paperId: string;
  offCamId: string;
  register: (id: string, el: SVGGElement | null) => void;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent<SVGGElement>) => void;
}

function ZoneButton({
  zone,
  selected,
  highlighted,
  pulsing,
  animate,
  paperId,
  offCamId,
  register,
  onSelect,
  onKeyDown,
}: ZoneButtonProps): React.JSX.Element {
  const b = zone.bounds;
  const shade = Math.round((1 - zone.zone.light) * 70) / 100;
  const classes = ['map-zone'];
  if (animate && pulsing) classes.push('anim-propagate');
  return (
    <g
      ref={(el) => register(zone.zone.id, el)}
      className={classes.join(' ')}
      role="button"
      tabIndex={0}
      aria-label={zone.label}
      aria-pressed={selected}
      data-zone={zone.zone.id}
      data-selected={selected ? 'true' : 'false'}
      data-covered={zone.covered ? 'true' : 'false'}
      data-off-camera={zone.offCamera ? 'true' : 'false'}
      data-light={zone.light}
      data-highlight={flag(highlighted)}
      data-pulse={flag(pulsing)}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <path className="map-zone-shape" d={zone.path} fill={`url(#${paperId})`} />
      <path className="map-zone-shade" d={zone.path} opacity={shade} />
      {zone.offCamera ? (
        <path className="map-zone-offcam" d={zone.path} fill={`url(#${offCamId})`} />
      ) : null}
      <path className="map-zone-outline" d={zone.path} />
      <path className="map-zone-halo" d={zone.path} />
      <text className="map-zone-name" x={b.minX + 1.4} y={b.minY + 3.6}>
        {zone.zone.label}
      </text>
      <LightMark zone={zone} />
      {zone.covered ? (
        <g className="map-zone-cam" transform={`translate(${b.minX + 1.4} ${b.minY + 4.7})`}>
          <rect className="map-zone-cam-bg" x={0} y={0} width={6} height={2.8} rx={0.4} />
          <text className="map-zone-cam-text" x={3} y={2.1} textAnchor="middle">
            CAM
          </text>
        </g>
      ) : null}
      {zone.offCamera ? (
        <text
          className="map-zone-offcam-text"
          x={zone.centroid.x}
          y={b.maxY - 5.6}
          textAnchor="middle"
        >
          HORS CHAMP
        </text>
      ) : null}
    </g>
  );
}

function Token({
  token,
  highlighted,
  pulsing,
  animate,
}: {
  token: TokenFrame;
  highlighted: boolean;
  pulsing: boolean;
  animate: boolean;
}): React.JSX.Element {
  const { x, y } = token.point;
  const classes = ['map-token'];
  if (animate && pulsing) classes.push('anim-propagate');
  return (
    <g
      className={classes.join(' ')}
      role="img"
      aria-label={token.label}
      data-token={token.characterId}
      data-zone={token.zoneId}
      data-status={token.status}
      data-transit={flag(token.transit)}
      data-highlight={flag(highlighted)}
      data-pulse={flag(pulsing)}
    >
      <circle className="map-token-ring" cx={x} cy={y} r={TOKEN_RADIUS + 1.3} />
      {token.status === 'proposed' ? (
        <polygon
          className="map-token-shape"
          points={diamondPoints(token.point, TOKEN_RADIUS + 0.7)}
          fill={token.accentColor}
        />
      ) : token.status === 'established' ? (
        <circle
          className="map-token-shape"
          cx={x}
          cy={y}
          r={TOKEN_RADIUS}
          fill={token.accentColor}
        />
      ) : (
        <circle
          className="map-token-shape"
          cx={x}
          cy={y}
          r={TOKEN_RADIUS}
          stroke={token.accentColor}
        />
      )}
      <text className="map-token-initial" x={x} y={y + 1.2} textAnchor="middle">
        {token.initial}
      </text>
      {token.transit ? (
        <text className="map-token-transit" x={x + TOKEN_RADIUS + 0.4} y={y - TOKEN_RADIUS + 0.6}>
          →
        </text>
      ) : null}
    </g>
  );
}

function ObstructionMark({ zone }: { zone: ZoneFrame }): React.JSX.Element | null {
  const o = zone.obstruction;
  if (!o) return null;
  const x = zone.bounds.maxX - 7.6;
  const y = zone.bounds.maxY - 6.4;
  return (
    <g
      className="map-obstruction"
      role="img"
      aria-label={`Obstruction connue dans ${zone.zone.label} : palette, trajets ${formatMultiplier(o.travelMultiplier)}`}
      data-obstruction={o.id}
      transform={`translate(${x} ${y})`}
    >
      <rect className="map-obstruction-slat" x={0} y={0} width={6.2} height={1} />
      <rect className="map-obstruction-slat" x={0} y={1.7} width={6.2} height={1} />
      <rect className="map-obstruction-block" x={0.3} y={3} width={1.3} height={1.4} />
      <rect className="map-obstruction-block" x={2.45} y={3} width={1.3} height={1.4} />
      <rect className="map-obstruction-block" x={4.6} y={3} width={1.3} height={1.4} />
    </g>
  );
}

function MarkerChip({
  marker,
  zone,
  index,
}: {
  marker: MarkerFrame;
  zone: ZoneFrame;
  index: number;
}): React.JSX.Element {
  // L'étiquette se limite à la largeur de la zone ; le libellé complet est dans aria-label et la fiche.
  const available = zone.bounds.maxX - zone.bounds.minX - 2.4;
  const maxChars = Math.max(6, Math.min(16, Math.floor((available - 1.6) / 1.25) - 2));
  const text = `${DEGREE_GLYPH[marker.degree]} ${shorten(marker.label, maxChars)}`;
  const width = Math.min(text.length * 1.25 + 1.6, available);
  const cx = zone.centroid.x;
  const y = zone.bounds.maxY - 1.4 - index * 3.2;
  const kind = marker.kind === 'evidence' ? 'Pièce' : 'Fait';
  return (
    <g
      className="map-marker"
      role="img"
      aria-label={`${kind} : ${marker.label} (${DEGREE_LABELS[marker.degree]}), ${zone.zone.label}`}
      data-marker={marker.id}
      data-degree={marker.degree}
    >
      <rect
        className="map-marker-bg"
        x={cx - width / 2}
        y={y - 2.6}
        width={width}
        height={2.9}
        rx={0.3}
      />
      <text className="map-marker-text" x={cx} y={y - 0.5} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

function SightOverlay({ sight, clock }: { sight: SightFrame; clock: string }): React.JSX.Element {
  const visible = sight.lines.filter((l) => l.quality > 0);
  return (
    <g
      className="map-sight"
      role="img"
      aria-label={`Lignes de vue de ${sight.observer.name} depuis ${sight.zoneLabel} à ${clock} : ${visible.length} zone${visible.length > 1 ? 's' : ''} visible${visible.length > 1 ? 's' : ''}`}
    >
      <circle className="map-sight-origin" cx={sight.origin.x} cy={sight.origin.y} r={1.6} />
      {visible.map((l) => {
        const at = along(l.a, l.b, 0.62);
        return (
          <g key={l.to} className="map-sight-item" data-fidelity={l.fidelity}>
            <line
              className="map-sight-line"
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              strokeOpacity={0.35 + l.quality * 0.65}
            />
            <text className="map-sight-label" x={at.x} y={at.y - 0.8} textAnchor="middle">
              {formatPercent(l.quality)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function SoundOverlay({ sound }: { sound: SoundFrame }): React.JSX.Element {
  const heard = sound.zones.filter((z) => z.fidelity !== 'none');
  return (
    <g
      className="map-sound"
      role="img"
      aria-label={`Propagation sonore — ${sound.label}, depuis ${sound.originLabel} : perceptible dans ${heard.length} zone${heard.length > 1 ? 's' : ''}`}
      data-sound={sound.id}
    >
      {SOUND_RINGS.map((r, i) => (
        <circle
          key={r}
          className="map-sound-ring"
          cx={sound.origin.x}
          cy={sound.origin.y}
          r={r}
          strokeOpacity={0.8 - i * 0.25}
        />
      ))}
      {heard
        .filter((z) => z.zoneId !== sound.originZoneId)
        .map((z) => (
          <text
            key={z.zoneId}
            className="map-sound-label"
            x={z.point.x}
            y={z.point.y}
            data-fidelity={z.fidelity}
          >
            {`♪ ${formatPercent(z.intensity)}`}
          </text>
        ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function StoreMap({
  frame,
  selection,
  highlightIds,
  pulseIds,
  animate,
  onSelectZone,
}: StoreMapProps): React.JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const paperId = `map-${uid}-paper`;
  const offCamId = `map-${uid}-offcam`;
  const zoneRefs = useRef(new Map<string, SVGGElement>());

  const register = (id: string, el: SVGGElement | null): void => {
    if (el) zoneRefs.current.set(id, el);
    else zoneRefs.current.delete(id);
  };

  const keyHandler = (zone: ZoneFrame) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectZone(zone.zone.id);
      return;
    }
    const direction = ARROW_KEYS[e.key];
    if (!direction) return;
    const next = nearestZone(frame.zones, zone, direction);
    if (next) {
      e.preventDefault();
      zoneRefs.current.get(next.zone.id)?.focus();
    }
  };

  const selectedZoneId = selection?.kind === 'zone' ? selection.id : null;
  const selectedCharacterId = selection?.kind === 'character' ? selection.id : null;

  return (
    <svg
      className="map-svg"
      viewBox="0 0 100 100"
      role="group"
      aria-label={`Plan du magasin à ${frame.clock}`}
      data-camera-on={frame.cameraOn ? 'true' : 'false'}
    >
      <defs>
        <pattern id={paperId} patternUnits="userSpaceOnUse" width={4} height={4}>
          <rect className="map-paper-base" x={0} y={0} width={4} height={4} />
          <path className="map-paper-grid" d="M0 0.5H4M0.5 0V4" />
        </pattern>
        <pattern
          id={offCamId}
          patternUnits="userSpaceOnUse"
          width={3}
          height={3}
          patternTransform="rotate(45)"
        >
          <rect className="map-offcam-stripe" x={0} y={0} width={1.2} height={3} />
        </pattern>
      </defs>

      <PassageLayer passages={frame.passages} />

      <g className="map-zones">
        {frame.zones.map((z) => (
          <ZoneButton
            key={z.zone.id}
            zone={z}
            selected={selectedZoneId === z.zone.id}
            highlighted={highlightIds.has(z.zone.id)}
            pulsing={pulseIds.has(z.zone.id)}
            animate={animate}
            paperId={paperId}
            offCamId={offCamId}
            register={register}
            onSelect={() => onSelectZone(z.zone.id)}
            onKeyDown={keyHandler(z)}
          />
        ))}
      </g>

      <PassageLabelLayer passages={frame.passages} />

      <g className="map-annotations">
        {frame.zones.map((z) => (
          <g key={z.zone.id} className="map-zone-annotations" data-zone={z.zone.id}>
            <ObstructionMark zone={z} />
            {z.activeMarkers.map((m, i) => (
              <MarkerChip key={m.id} marker={m} zone={z} index={i} />
            ))}
            {z.tokens.map((t) => (
              <Token
                key={t.characterId}
                token={t}
                highlighted={
                  highlightIds.has(t.characterId) || selectedCharacterId === t.characterId
                }
                pulsing={pulseIds.has(t.characterId)}
                animate={animate}
              />
            ))}
          </g>
        ))}
      </g>

      <g className="map-overlays">
        {frame.sight ? <SightOverlay sight={frame.sight} clock={frame.clock} /> : null}
        {frame.sounds.map((s) => (
          <SoundOverlay key={s.id} sound={s} />
        ))}
      </g>
    </svg>
  );
}
