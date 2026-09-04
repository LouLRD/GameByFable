/**
 * Pistes de la frise : règle graduée, curseur (range accessible + ligne), bandes « coupure vidéo »
 * et « obstruction », une piste par personnage (positions établies / rapportées / proposées /
 * transit / inconnues, absences caméra), piste « Pièces & faits », piste « Version »,
 * piste « Contradictions ». Chaque marqueur est un bouton nommé ; aucun sens n'est porté par
 * la couleur seule (glyphes, motifs, styles de bordure, libellés).
 *
 * Le composant est mémoïsé et NE dépend PAS du curseur : seuls `CursorRange` et `CursorLine`
 * (petits composants abonnés au store) se rafraîchissent quand le curseur bouge.
 */
import {
  memo,
  useEffect,
  useRef,
  type CSSProperties,
  type JSX,
  type MouseEvent,
  type RefObject,
} from 'react';
import { Portrait } from '@/components/portrait';
import type { PlayerView } from '@/domain/selectors/playerView';
import type { PlayerAction } from '@/domain/model/actions';
import { useGameStore, type Selection } from '@/state';
import {
  describeEvent,
  formatWhen,
  packRows,
  percentOf,
  percentWidth,
  ratioOf,
  timeFromPointer,
  unknownSpans,
  visualSpan,
  type PositionSegmentView,
  type Span,
  type TimelineEvent,
} from './timelineEvents';

export interface TimelineTrackProps {
  view: PlayerView;
  zoneLabels: ReadonlyMap<string, string>;
  /** Événements datés (voir `buildTimelineEvents`), triés par instant. */
  events: readonly TimelineEvent[];
  /** Facteur d'étirement horizontal (1, 2, 4, 8). */
  zoom: number;
  /** Largeur mesurée de la zone de défilement (px), ou null si inconnue. */
  viewportWidth: number | null;
  reducedMotion: boolean;
  selection: Selection | null;
  /** Compteur d'actions acceptées et type de la dernière : fait pulser la piste Version. */
  actionNonce: number;
  lastActionType: PlayerAction['type'] | null;
  /** Conteneur défilant (pour garder le curseur visible). */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Identifiant du range du curseur (relié à l'<output> de l'en-tête). */
  rangeId: string;
  /** Activation d'un événement : sélection + curseur à `t`. */
  onSelectEvent: (ev: TimelineEvent, t: number) => void;
  /** Activation d'un segment de personnage : sélection du personnage + curseur à `t`. */
  onSelectCharacter: (characterId: string, zoneId: string, t: number) => void;
  /** Saut simple du curseur (bande de coupure). */
  onJump: (t: number, message: string) => void;
}

const STATUS_LABELS = { established: 'établi', reported: 'rapporté', proposed: 'proposé' } as const;
const SEVERITY_GLYPH = { notice: 'i', major: '!', critical: '!!' } as const;
const ANIM_TIMEOUT_MS = 900;
/** Largeur nominale de la colonne des libellés (px), pour le calcul des rangées. */
const LABEL_WIDTH_PX = 132;
/** Largeur de repli du viewport si aucune mesure n'est disponible. */
const FALLBACK_VIEWPORT_PX = 640;
/** Largeur d'un marqueur ponctuel (px) pour la détection de chevauchement. */
const POINT_WIDTH_PX = 40;

const cssVars = (vars: Record<string, string | number>): CSSProperties => vars;

/** Instant visé par un clic : position du pointeur clampée dans l'intervalle, ou `fallback` au clavier. */
function pointerTime(
  e: MouseEvent<HTMLElement>,
  span: Span,
  durationSeconds: number,
  fallback: number,
): number {
  if (e.detail === 0) return fallback;
  const track = e.currentTarget.closest<HTMLElement>('.tl-lane-track');
  if (!track) return fallback;
  const t = timeFromPointer(e.clientX, track.getBoundingClientRect(), durationSeconds);
  if (t === null) return fallback;
  return Math.min(span.end, Math.max(span.start, t));
}

interface LaneProps {
  id: string;
  label: JSX.Element | string;
  rows: number;
  className?: string;
  children: JSX.Element | (JSX.Element | null)[] | null;
  laneRef?: RefObject<HTMLDivElement | null>;
  data?: Record<string, string>;
}

function Lane({ id, label, rows, className, children, laneRef, data }: LaneProps): JSX.Element {
  const labelId = `${id}-label`;
  return (
    <div
      ref={laneRef}
      className={`tl-lane${className ? ` ${className}` : ''}`}
      role="group"
      aria-labelledby={labelId}
      {...data}
    >
      <div className="tl-lane-label" id={labelId}>
        {label}
      </div>
      <div className="tl-lane-track" style={cssVars({ '--tl-rows': Math.max(1, rows) })}>
        {children}
      </div>
    </div>
  );
}

function Ruler({ view, zoom }: { view: PlayerView; zoom: number }): JSX.Element {
  const minutes = Math.floor(view.durationSeconds / 60);
  const labelEvery = zoom >= 4 ? 1 : zoom >= 2 ? 2 : 5;
  const ticks: JSX.Element[] = [];
  for (let m = 0; m <= minutes; m += 1) {
    const t = m * 60;
    const labelled = m % labelEvery === 0;
    ticks.push(
      <span
        key={m}
        className={`tl-tick${labelled ? ' tl-tick-labelled' : ''}`}
        style={{ left: percentOf(t, view.durationSeconds) }}
      >
        {labelled ? <span className="tl-tick-label mono">{view.clock(t).slice(0, 5)}</span> : null}
      </span>,
    );
  }
  return (
    <div className="tl-lane tl-lane-ruler" aria-hidden="true">
      <div className="tl-lane-label">Heure</div>
      <div className="tl-lane-track">{ticks}</div>
    </div>
  );
}

function CursorRange({ id, view }: { id: string; view: PlayerView }): JSX.Element {
  const cursor = useGameStore((s) => s.cursor);
  return (
    <input
      id={id}
      type="range"
      className="tl-range"
      min={0}
      max={view.durationSeconds}
      step={1}
      value={cursor}
      aria-label="Curseur temporel"
      aria-valuetext={view.clock(cursor)}
      onChange={(e) => useGameStore.getState().setCursor(Number(e.currentTarget.value))}
    />
  );
}

function CursorLine({
  durationSeconds,
  scrollRef,
  reducedMotion,
  zoom,
}: {
  durationSeconds: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  reducedMotion: boolean;
  /** Le changement de zoom relance le recentrage. */
  zoom: number;
}): JSX.Element {
  const cursor = useGameStore((s) => s.cursor);
  const lineRef = useRef<HTMLDivElement>(null);
  const previousZoom = useRef(zoom);

  // Le curseur reste visible quand la frise est zoomée : recentrage doux quand le curseur bouge
  // (immédiat en mouvement réduit), immédiat quand c'est le zoom qui change.
  useEffect(() => {
    const zoomChanged = previousZoom.current !== zoom;
    previousZoom.current = zoom;
    const line = lineRef.current;
    const scroller = scrollRef.current;
    if (!line || !scroller) return;
    const width = scroller.clientWidth;
    if (!(width > 0) || scroller.scrollWidth <= width) return;
    const x = line.offsetLeft;
    const margin = 24;
    if (x >= scroller.scrollLeft + margin && x <= scroller.scrollLeft + width - margin) return;
    const left = Math.max(0, x - width / 2);
    const behavior: ScrollBehavior = reducedMotion || zoomChanged ? 'auto' : 'smooth';
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left, behavior });
    else scroller.scrollLeft = left;
  }, [cursor, scrollRef, reducedMotion, zoom]);

  return (
    <div
      ref={lineRef}
      className="tl-cursor-line"
      style={cssVars({ '--tl-cursor': ratioOf(cursor, durationSeconds).toFixed(5) })}
      aria-hidden="true"
    />
  );
}

interface CharacterLaneProps {
  character: PlayerView['characters'][number];
  segments: readonly PositionSegmentView[];
  absences: readonly Span[];
  view: PlayerView;
  zoneLabels: ReadonlyMap<string, string>;
  pointSpan: number;
  selected: boolean;
  onSelectCharacter: TimelineTrackProps['onSelectCharacter'];
}

function CharacterLane({
  character,
  segments,
  absences,
  view,
  zoneLabels,
  pointSpan,
  selected,
  onSelectCharacter,
}: CharacterLaneProps): JSX.Element {
  const rank = { established: 0, proposed: 1, reported: 2 } as const;
  const ordered = [...segments].sort(
    (a, b) => a.interval.start - b.interval.start || rank[a.status] - rank[b.status],
  );
  const rows = packRows(
    ordered.map((s) => visualSpan(s.interval.start, s.transit ? null : s.interval.end, pointSpan)),
  );
  const rowCount = rows.reduce((m, r) => Math.max(m, r + 1), 1);
  const unknown = unknownSpans(segments, view.durationSeconds);
  const zoneName = (zoneId: string) => zoneLabels.get(zoneId) ?? zoneId;

  return (
    <Lane
      id={`tl-character-${character.id}`}
      rows={rowCount}
      className="tl-lane-character"
      data={{ 'data-character-id': character.id, ...(selected ? { 'data-selected': 'true' } : {}) }}
      label={
        <>
          <span className="tl-portrait" aria-hidden="true">
            <Portrait
              seed={character.portraitSeed}
              accentColor={character.accentColor}
              name={character.name}
              size={22}
            />
          </span>
          <span className="tl-lane-name">{character.name}</span>
        </>
      }
    >
      {[
        ...unknown.map((u) => (
          <span
            key={`u-${u.start}`}
            className="tl-seg tl-seg-unknown"
            role="img"
            aria-label={`${character.name} : position inconnue, ${formatWhen(view.clock, u.start, u.end)}`}
            style={{
              left: percentOf(u.start, view.durationSeconds),
              width: percentWidth(u, view.durationSeconds),
            }}
          >
            <span className="tl-seg-glyph" aria-hidden="true">
              ?
            </span>
          </span>
        )),
        ...ordered.map((s, i) => {
          const row = rows[i] ?? 0;
          const zone = zoneName(s.zoneId);
          const span = { start: s.interval.start, end: s.interval.end };
          if (s.transit) {
            return (
              <button
                key={`t-${s.zoneId}-${s.interval.start}`}
                type="button"
                className="tl-mark tl-mark-transit"
                data-status={s.status}
                aria-label={`${character.name} : passage par ${zone}, ${view.clock(s.interval.start)} (${STATUS_LABELS[s.status]}, transit)`}
                title={`Passage par ${zone} — ${view.clock(s.interval.start)}`}
                style={{
                  left: percentOf(s.interval.start, view.durationSeconds),
                  ...cssVars({ '--tl-row': row }),
                }}
                onClick={() => onSelectCharacter(character.id, s.zoneId, s.interval.start)}
              >
                <span aria-hidden="true">◇</span>
              </button>
            );
          }
          return (
            <button
              key={`s-${s.status}-${s.zoneId}-${s.interval.start}-${s.interval.end}`}
              type="button"
              className="tl-seg"
              data-status={s.status}
              aria-label={`${character.name} : ${zone}, ${formatWhen(view.clock, s.interval.start, s.interval.end)} (${STATUS_LABELS[s.status]})`}
              title={`${zone} — ${formatWhen(view.clock, s.interval.start, s.interval.end)} — ${STATUS_LABELS[s.status]}`}
              style={{
                left: percentOf(s.interval.start, view.durationSeconds),
                width: percentWidth(span, view.durationSeconds),
                ...cssVars({ '--tl-row': row }),
              }}
              onClick={(e) =>
                onSelectCharacter(
                  character.id,
                  s.zoneId,
                  pointerTime(e, span, view.durationSeconds, s.interval.start),
                )
              }
            >
              <span className="tl-seg-text">{zone}</span>
            </button>
          );
        }),
        ...absences.map((a) => (
          <span
            key={`a-${a.start}`}
            className="tl-absence"
            role="img"
            aria-label={`${character.name} hors champ des caméras, ${formatWhen(view.clock, a.start, a.end)}`}
            title={`Hors champ des caméras — ${formatWhen(view.clock, a.start, a.end)}`}
            style={{
              left: percentOf(a.start, view.durationSeconds),
              width: percentWidth(a, view.durationSeconds),
            }}
          />
        )),
      ]}
    </Lane>
  );
}

interface EventLaneProps {
  id: string;
  label: string;
  className?: string;
  events: readonly TimelineEvent[];
  view: PlayerView;
  pointSpan: number;
  selection: Selection | null;
  reducedMotion: boolean;
  emptyText: string;
  laneRef?: RefObject<HTMLDivElement | null>;
  onSelectEvent: TimelineTrackProps['onSelectEvent'];
}

function selectionKindOf(kind: TimelineEvent['kind']): Selection['kind'] | null {
  switch (kind) {
    case 'evidence':
      return 'evidence';
    case 'fact':
      return 'fact';
    case 'claim':
      return 'hypothesis';
    case 'contradiction':
      return 'contradiction';
    case 'obstruction':
      return 'zone';
    case 'outage':
    case 'incident':
      return null;
  }
}

function EventLane({
  id,
  label,
  className,
  events,
  view,
  pointSpan,
  selection,
  reducedMotion,
  emptyText,
  laneRef,
  onSelectEvent,
}: EventLaneProps): JSX.Element {
  const rows = packRows(events.map((e) => visualSpan(e.at, e.end, pointSpan)));
  const rowCount = rows.reduce((m, r) => Math.max(m, r + 1), 1);
  return (
    <Lane
      id={id}
      label={label}
      rows={rowCount}
      {...(className ? { className } : {})}
      {...(laneRef ? { laneRef } : {})}
    >
      {events.length === 0 ? (
        <span className="tl-empty muted">{emptyText}</span>
      ) : (
        events.map((ev, i) => {
          const row = rows[i] ?? 0;
          const kind = selectionKindOf(ev.kind);
          const isSelected = kind !== null && selection?.kind === kind && selection.id === ev.id;
          const name = describeEvent(ev, view.clock);
          const glyph =
            ev.kind === 'fact'
              ? ev.degree === 'reported'
                ? '▤'
                : '■'
              : ev.kind === 'evidence'
                ? '◆'
                : ev.kind === 'claim'
                  ? '◌'
                  : '⚠';
          const common = {
            type: 'button' as const,
            'aria-label': name,
            title: name,
            'data-kind': ev.kind,
            ...(ev.degree ? { 'data-degree': ev.degree } : {}),
            ...(ev.severity ? { 'data-severity': ev.severity } : {}),
            ...(isSelected ? { 'aria-current': 'true' as const } : {}),
            onClick: (e: MouseEvent<HTMLButtonElement>) =>
              onSelectEvent(
                ev,
                ev.end !== null
                  ? pointerTime(e, { start: ev.at, end: ev.end }, view.durationSeconds, ev.at)
                  : ev.at,
              ),
          };
          const crack =
            isSelected && ev.kind === 'contradiction' && !reducedMotion ? ' anim-crack' : '';
          if (ev.end !== null) {
            return (
              <button
                key={ev.key}
                {...common}
                className={`tl-seg tl-seg-event${crack}`}
                style={{
                  left: percentOf(ev.at, view.durationSeconds),
                  width: percentWidth({ start: ev.at, end: ev.end }, view.durationSeconds),
                  ...cssVars({ '--tl-row': row }),
                }}
              >
                <span className="tl-seg-glyph" aria-hidden="true">
                  {glyph}
                </span>
                <span className="tl-seg-text">{ev.label}</span>
              </button>
            );
          }
          return (
            <button
              key={ev.key}
              {...common}
              className={`tl-mark${crack}`}
              style={{
                left: percentOf(ev.at, view.durationSeconds),
                ...cssVars({ '--tl-row': row }),
              }}
            >
              <span className="tl-seg-glyph" aria-hidden="true">
                {glyph}
              </span>
              {ev.severity ? (
                <span className="tl-sev" aria-hidden="true">
                  {SEVERITY_GLYPH[ev.severity]}
                </span>
              ) : null}
            </button>
          );
        })
      )}
    </Lane>
  );
}

interface BandLaneProps {
  id: string;
  label: string;
  band: 'outage' | 'obstruction';
  events: readonly TimelineEvent[];
  view: PlayerView;
  emptyText: string;
  selection: Selection | null;
  onSelectEvent: TimelineTrackProps['onSelectEvent'];
  onJump: TimelineTrackProps['onJump'];
}

function BandLane({
  id,
  label,
  band,
  events,
  view,
  emptyText,
  selection,
  onSelectEvent,
  onJump,
}: BandLaneProps): JSX.Element {
  return (
    <Lane id={id} label={label} rows={1} className="tl-lane-band" data={{ 'data-band': band }}>
      {events.length === 0 ? (
        <span className="tl-empty muted">{emptyText}</span>
      ) : (
        events.map((ev) => {
          const name = describeEvent(ev, view.clock);
          const span = { start: ev.at, end: ev.end ?? ev.at };
          const isSelected =
            band === 'obstruction' && selection?.kind === 'zone' && selection.id === ev.id;
          return (
            <button
              key={ev.key}
              type="button"
              className="tl-seg tl-band-seg"
              data-band={band}
              aria-label={name}
              title={`${name} — aller au début`}
              {...(isSelected ? { 'aria-current': 'true' } : {})}
              style={{
                left: percentOf(ev.at, view.durationSeconds),
                width: percentWidth(span, view.durationSeconds),
              }}
              onClick={(e) => {
                const t = pointerTime(e, span, view.durationSeconds, ev.at);
                if (band === 'outage') onJump(t, `Coupure vidéo, ${view.clock(t)}.`);
                else onSelectEvent(ev, t);
              }}
            >
              <span className="tl-seg-glyph" aria-hidden="true">
                {band === 'outage' ? '▮' : '▤'}
              </span>
              <span className="tl-seg-text">{ev.label}</span>
            </button>
          );
        })
      )}
    </Lane>
  );
}

function TimelineTrackImpl({
  view,
  zoneLabels,
  events,
  zoom,
  viewportWidth,
  reducedMotion,
  selection,
  actionNonce,
  lastActionType,
  scrollRef,
  rangeId,
  onSelectEvent,
  onSelectCharacter,
  onJump,
}: TimelineTrackProps): JSX.Element {
  const versionLaneRef = useRef<HTMLDivElement>(null);
  const previousNonce = useRef(actionNonce);

  // Une hypothèse vient d'être placée : la piste Version pulse (sauf mouvement réduit).
  useEffect(() => {
    if (previousNonce.current === actionNonce) return;
    previousNonce.current = actionNonce;
    if (lastActionType !== 'set-claim' || reducedMotion) return;
    const el = versionLaneRef.current;
    if (!el) return;
    el.classList.remove('anim-propagate');
    // Force un recalcul de style pour relancer l'animation si la classe venait d'être retirée.
    el.getBoundingClientRect();
    el.classList.add('anim-propagate');
    const stop = () => {
      el.classList.remove('anim-propagate');
    };
    el.addEventListener('animationend', stop, { once: true });
    const timer = window.setTimeout(stop, ANIM_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('animationend', stop);
    };
  }, [actionNonce, lastActionType, reducedMotion]);

  const trackPx = Math.max(120, ((viewportWidth ?? FALLBACK_VIEWPORT_PX) - LABEL_WIDTH_PX) * zoom);
  const pointSpan = (POINT_WIDTH_PX / trackPx) * view.durationSeconds;

  const byKind = (kind: TimelineEvent['kind']) => events.filter((e) => e.kind === kind);
  const evidenceAndFacts = events.filter((e) => e.kind === 'evidence' || e.kind === 'fact');
  const claims = byKind('claim');
  const contradictions = byKind('contradiction');
  const undatedClaims = Object.values(view.version.claims).filter((c) => !c.interval).length;

  return (
    <div className="tl-canvas" style={cssVars({ '--tl-zoom': zoom })} data-zoom={zoom}>
      <Ruler view={view} zoom={zoom} />
      <div className="tl-lane tl-lane-cursor" role="group" aria-labelledby={`${rangeId}-label`}>
        <label className="tl-lane-label" id={`${rangeId}-label`} htmlFor={rangeId}>
          Curseur
        </label>
        <div className="tl-lane-track">
          <CursorRange id={rangeId} view={view} />
        </div>
      </div>
      <BandLane
        id="tl-band-outage"
        label="Vidéo"
        band="outage"
        events={byKind('outage')}
        view={view}
        emptyText="Aucune coupure connue"
        selection={selection}
        onSelectEvent={onSelectEvent}
        onJump={onJump}
      />
      <BandLane
        id="tl-band-obstruction"
        label="Obstruction"
        band="obstruction"
        events={byKind('obstruction')}
        view={view}
        emptyText="Aucune obstruction connue"
        selection={selection}
        onSelectEvent={onSelectEvent}
        onJump={onJump}
      />
      {view.characters.map((c) => (
        <CharacterLane
          key={c.id}
          character={c}
          segments={view.positions.byCharacter.get(c.id) ?? []}
          absences={view.positions.absences.get(c.id) ?? []}
          view={view}
          zoneLabels={zoneLabels}
          pointSpan={pointSpan}
          selected={selection?.kind === 'character' && selection.id === c.id}
          onSelectCharacter={onSelectCharacter}
        />
      ))}
      <EventLane
        id="tl-lane-evidence"
        label="Pièces & faits"
        className="tl-lane-evidence"
        events={evidenceAndFacts}
        view={view}
        pointSpan={pointSpan}
        selection={selection}
        reducedMotion={reducedMotion}
        emptyText="Aucune pièce datée"
        onSelectEvent={onSelectEvent}
      />
      <EventLane
        id="tl-lane-version"
        label="Version"
        className="tl-lane-version"
        events={claims}
        view={view}
        pointSpan={pointSpan}
        selection={selection}
        reducedMotion={reducedMotion}
        emptyText={
          undatedClaims > 0
            ? `${undatedClaims} hypothèse${undatedClaims > 1 ? 's' : ''} sans horaire`
            : 'Aucune hypothèse datée'
        }
        laneRef={versionLaneRef}
        onSelectEvent={onSelectEvent}
      />
      <EventLane
        id="tl-lane-contradictions"
        label="Contradictions"
        className="tl-lane-contradictions"
        events={contradictions}
        view={view}
        pointSpan={pointSpan}
        selection={selection}
        reducedMotion={reducedMotion}
        emptyText="Aucun instant à inspecter"
        onSelectEvent={onSelectEvent}
      />
      <div
        className="tl-incident"
        role="img"
        aria-label={`Repère du comptage : ${view.clock(view.incidentAt)}`}
        style={cssVars({ '--tl-at': ratioOf(view.incidentAt, view.durationSeconds).toFixed(5) })}
      >
        <span className="tl-incident-label" aria-hidden="true">
          Comptage
        </span>
      </div>
      <CursorLine
        durationSeconds={view.durationSeconds}
        scrollRef={scrollRef}
        reducedMotion={reducedMotion}
        zoom={zoom}
      />
    </div>
  );
}

export const TimelineTrack = memo(TimelineTrackImpl);
