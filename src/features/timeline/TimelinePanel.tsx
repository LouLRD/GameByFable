/**
 * Frise et commandes de relecture (GDD §7.1, §7.4, §12 « centre bas » ; spec §11).
 *
 * En-tête (titre, heure courante, légende), barre de navigation (événement précédent/suivant,
 * −10 s / −1 s / +1 s / +10 s, zoom), pistes défilantes (`TimelineTrack`) et relecture
 * (`PlaybackControls`). Toutes les données viennent de la vue joueur ; toute mutation passe par
 * le store. Sélectionner un événement déplace le curseur, met en évidence zones et personnes,
 * ouvre sa fiche (sélection partagée) et ne modifie jamais la version.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
} from 'react';
import { useGameStore, usePlayerView, useReducedMotion } from '@/state';
import { PlaybackControls } from './PlaybackControls';
import { TimelineTrack } from './TimelineTrack';
import {
  buildTimelineEvents,
  describeEvent,
  nextEvent,
  outageSpans,
  previousEvent,
  timeFromPointer,
  type TimelineEvent,
} from './timelineEvents';
import './timeline.css';

export const TIMELINE_ZOOMS = [1, 2, 4, 8] as const;

const NUDGES: { delta: number; text: string; label: string }[] = [
  { delta: -10, text: '−10 s', label: 'Reculer de 10 secondes' },
  { delta: -1, text: '−1 s', label: 'Reculer d’une seconde' },
  { delta: 1, text: '+1 s', label: 'Avancer d’une seconde' },
  { delta: 10, text: '+10 s', label: 'Avancer de 10 secondes' },
];

/** Navigation par flèches dans la barre d'outils (motif APG « toolbar »). */
function onToolbarKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End')
    return;
  const toolbar = e.currentTarget.closest('[role="toolbar"]');
  if (!toolbar) return;
  const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const index = buttons.indexOf(e.currentTarget);
  if (index === -1) return;
  e.preventDefault();
  const next =
    e.key === 'ArrowRight'
      ? (index + 1) % buttons.length
      : e.key === 'ArrowLeft'
        ? (index - 1 + buttons.length) % buttons.length
        : e.key === 'Home'
          ? 0
          : buttons.length - 1;
  buttons[next]?.focus();
}

function useZoneLabels(): ReadonlyMap<string, string> {
  const scenario = useGameStore((s) => s.scenario);
  return useMemo(
    () =>
      new Map<string, string>(
        (scenario?.data.zones ?? []).map((z): [string, string] => [z.id, z.label]),
      ),
    [scenario],
  );
}

/** Largeur d'un élément suivie par ResizeObserver (null si indisponible). */
function useElementWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function ClockOutput({
  rangeId,
  clock,
}: {
  rangeId: string;
  clock: (t: number) => string;
}): JSX.Element {
  const cursor = useGameStore((s) => s.cursor);
  return (
    <output className="tl-clock mono" htmlFor={rangeId} aria-live="off" aria-label="Heure courante">
      {clock(cursor)}
    </output>
  );
}

/** Boutons de saut dont l'état dépend du curseur (isolés pour limiter les rendus). */
function NavButtons({
  events,
  durationSeconds,
  clock,
}: {
  events: readonly TimelineEvent[];
  durationSeconds: number;
  clock: (t: number) => string;
}): JSX.Element {
  const cursor = useGameStore((s) => s.cursor);
  const prevHintId = useId();
  const nextHintId = useId();
  const prev = previousEvent(events, cursor);
  const next = nextEvent(events, cursor);

  const jump = (ev: TimelineEvent, direction: 'précédent' | 'suivant') => {
    const store = useGameStore.getState();
    store.setCursor(ev.at);
    store.highlight([...ev.zoneIds, ...ev.participantIds]);
    store.announce(`Événement ${direction} : ${describeEvent(ev, clock)}.`);
  };

  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={prev === null}
        title={
          prev
            ? `Aller à : ${describeEvent(prev, clock)} (Page précédente)`
            : 'Aucun événement avant le curseur'
        }
        {...(prev === null ? { 'aria-describedby': prevHintId } : {})}
        aria-label="Événement précédent"
        onKeyDown={onToolbarKeyDown}
        onClick={() => {
          if (prev) jump(prev, 'précédent');
        }}
      >
        <span aria-hidden="true">◂</span> Précédent
      </button>
      {prev === null ? (
        <span id={prevHintId} className="visually-hidden">
          Aucun événement avant le curseur.
        </span>
      ) : null}
      <button
        type="button"
        className="btn"
        disabled={next === null}
        title={
          next
            ? `Aller à : ${describeEvent(next, clock)} (Page suivante)`
            : 'Aucun événement après le curseur'
        }
        {...(next === null ? { 'aria-describedby': nextHintId } : {})}
        aria-label="Événement suivant"
        onKeyDown={onToolbarKeyDown}
        onClick={() => {
          if (next) jump(next, 'suivant');
        }}
      >
        Suivant <span aria-hidden="true">▸</span>
      </button>
      {next === null ? (
        <span id={nextHintId} className="visually-hidden">
          Aucun événement après le curseur.
        </span>
      ) : null}
      <span className="tl-toolbar-sep" aria-hidden="true" />
      {NUDGES.map((n) => {
        const blocked = n.delta < 0 ? cursor <= 0 : cursor >= durationSeconds;
        return (
          <button
            key={n.delta}
            type="button"
            className="btn tl-nudge"
            aria-label={n.label}
            disabled={blocked}
            title={blocked ? (n.delta < 0 ? 'Début de la fenêtre' : 'Fin de la fenêtre') : n.label}
            onKeyDown={onToolbarKeyDown}
            onClick={() => useGameStore.getState().nudgeCursor(n.delta)}
          >
            {n.text}
          </button>
        );
      })}
    </>
  );
}

export function TimelinePanel(): JSX.Element {
  const view = usePlayerView();
  const zoneLabels = useZoneLabels();
  const selection = useGameStore((s) => s.selection);
  const actionNonce = useGameStore((s) => s.actionNonce);
  const lastActionType = useGameStore((s) => s.lastActionType);
  const reducedMotion = useReducedMotion();

  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = TIMELINE_ZOOMS[zoomIndex] ?? 1;

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportWidth = useElementWidth(scrollRef);
  const titleId = useId();
  const rangeId = useId();
  const zoomOutputId = useId();

  const events = useMemo(
    () => (view ? buildTimelineEvents(view, zoneLabels) : []),
    [view, zoneLabels],
  );
  const clock = view?.clock ?? null;
  const durationSeconds = view?.durationSeconds ?? 0;

  // Clavier au niveau du panneau : Page précédente / Page suivante → événement précédent / suivant.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !clock) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'PageUp' && e.key !== 'PageDown') return;
      const state = useGameStore.getState();
      const target =
        e.key === 'PageDown'
          ? nextEvent(events, state.cursor)
          : previousEvent(events, state.cursor);
      e.preventDefault();
      if (!target) {
        state.announce(
          e.key === 'PageDown'
            ? 'Aucun événement après le curseur.'
            : 'Aucun événement avant le curseur.',
        );
        return;
      }
      state.setCursor(target.at);
      state.highlight([...target.zoneIds, ...target.participantIds]);
      state.announce(
        `Événement ${e.key === 'PageDown' ? 'suivant' : 'précédent'} : ${describeEvent(target, clock)}.`,
      );
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, [events, clock]);

  // Clic sur une piste (hors bouton / range) : le curseur se place à l'instant cliqué.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || durationSeconds <= 0) return;
    const onClick = (e: globalThis.MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('button, input, label, a, [role="img"]')) return;
      const track = target.closest<HTMLElement>('.tl-lane-track');
      if (!track) return;
      const t = timeFromPointer(e.clientX, track.getBoundingClientRect(), durationSeconds);
      if (t === null) return;
      useGameStore.getState().setCursor(t);
    };
    scroller.addEventListener('click', onClick);
    return () => scroller.removeEventListener('click', onClick);
  }, [durationSeconds]);

  const onSelectEvent = useCallback(
    (ev: TimelineEvent, t: number) => {
      if (!clock) return;
      const store = useGameStore.getState();
      const ids = [...ev.zoneIds, ...ev.participantIds];
      switch (ev.kind) {
        case 'evidence':
          store.select('evidence', ev.id, { cursor: t });
          break;
        case 'fact':
          store.select('fact', ev.id, { cursor: t });
          break;
        case 'claim':
          store.select('hypothesis', ev.id, { cursor: t });
          break;
        case 'contradiction':
          store.select('contradiction', ev.id, { cursor: t });
          break;
        case 'obstruction':
          store.select('zone', ev.id, { cursor: t });
          break;
        case 'outage':
        case 'incident':
          store.setCursor(t);
          break;
      }
      if (ids.length > 0) store.highlight(ids);
      store.announce(`${describeEvent(ev, clock)} — sélectionné, curseur à ${clock(t)}.`);
    },
    [clock],
  );

  const onSelectCharacter = useCallback(
    (characterId: string, zoneId: string, t: number) => {
      if (!view) return;
      const store = useGameStore.getState();
      store.select('character', characterId, { cursor: t });
      store.highlight([zoneId, characterId]);
      const name = view.characters.find((c) => c.id === characterId)?.name ?? characterId;
      store.announce(`${name} : sélection, curseur à ${view.clock(t)}.`);
    },
    [view],
  );

  const onJump = useCallback((t: number, message: string) => {
    const store = useGameStore.getState();
    store.setCursor(t);
    store.announce(message);
  }, []);

  const changeZoom = (delta: 1 | -1) => {
    const nextIndex = Math.min(TIMELINE_ZOOMS.length - 1, Math.max(0, zoomIndex + delta));
    if (nextIndex === zoomIndex) return;
    setZoomIndex(nextIndex);
    useGameStore.getState().announce(`Zoom ×${TIMELINE_ZOOMS[nextIndex] ?? 1}.`);
  };

  if (!view) {
    return (
      <div className="tl" ref={rootRef}>
        <p className="tl-empty-panel muted">
          Aucune partie en cours : la frise s’affichera à l’ouverture du dossier.
        </p>
      </div>
    );
  }

  const outages = outageSpans(view);
  const outageStart = outages[0]?.start ?? null;
  const title = `Frise — ${view.clock(0).slice(0, 5)} → ${view.clock(view.durationSeconds).slice(0, 5)}`;

  return (
    <div className="tl" ref={rootRef} data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <header className="tl-header">
        <h2 className="tl-title" id={titleId}>
          {title}
        </h2>
        <ClockOutput rangeId={rangeId} clock={view.clock} />
        <div className="tl-zoom-group" role="group" aria-label="Zoom de la frise">
          <button
            type="button"
            className="btn btn-ghost tl-zoom"
            aria-label="Zoom moins"
            disabled={zoomIndex === 0}
            title={zoomIndex === 0 ? 'Zoom minimal atteint' : 'Réduire l’étirement de la frise'}
            onClick={() => changeZoom(-1)}
          >
            Zoom −
          </button>
          <output
            id={zoomOutputId}
            className="tl-zoom-level mono"
            aria-label="Niveau de zoom"
            aria-live="off"
          >
            ×{zoom}
          </output>
          <button
            type="button"
            className="btn btn-ghost tl-zoom"
            aria-label="Zoom plus"
            disabled={zoomIndex === TIMELINE_ZOOMS.length - 1}
            title={
              zoomIndex === TIMELINE_ZOOMS.length - 1
                ? 'Zoom maximal atteint'
                : 'Étirer la frise horizontalement'
            }
            onClick={() => changeZoom(1)}
          >
            Zoom +
          </button>
        </div>
        <details className="tl-legend">
          <summary className="btn btn-ghost tl-legend-toggle">Légende</summary>
          <ul className="tl-legend-list">
            <li>
              <span className="tl-swatch" data-status="established" aria-hidden="true" /> établi
              (plein)
            </li>
            <li>
              <span className="tl-swatch" data-status="reported" aria-hidden="true" /> rapporté
              (hachures)
            </li>
            <li>
              <span className="tl-swatch" data-status="proposed" aria-hidden="true" /> proposé
              (trame ambre)
            </li>
            <li>
              <span className="tl-swatch" data-status="unknown" aria-hidden="true">
                ?
              </span>{' '}
              inconnu
            </li>
            <li>
              <span className="tl-swatch tl-swatch-glyph" aria-hidden="true">
                ◇
              </span>{' '}
              passage (transit)
            </li>
            <li>
              <span className="tl-swatch tl-swatch-absence" aria-hidden="true" /> hors champ caméra
            </li>
            <li>
              <span className="tl-swatch tl-swatch-glyph" aria-hidden="true">
                ◆
              </span>{' '}
              pièce
            </li>
            <li>
              <span className="tl-swatch tl-swatch-glyph" aria-hidden="true">
                ■
              </span>{' '}
              fait établi
            </li>
            <li>
              <span className="tl-swatch tl-swatch-glyph" aria-hidden="true">
                ▤
              </span>{' '}
              fait rapporté
            </li>
            <li>
              <span className="tl-swatch tl-swatch-glyph" aria-hidden="true">
                ⚠
              </span>{' '}
              contradiction (i remarque, ! majeure, !! critique)
            </li>
          </ul>
        </details>
      </header>

      <div className="tl-controls">
        <div className="tl-toolbar" role="toolbar" aria-label="Navigation temporelle">
          <NavButtons events={events} durationSeconds={view.durationSeconds} clock={view.clock} />
        </div>
        <PlaybackControls
          durationSeconds={view.durationSeconds}
          incidentAt={view.incidentAt}
          outageStart={outageStart}
          clock={view.clock}
        />
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <TimelineTrack
          view={view}
          zoneLabels={zoneLabels}
          events={events}
          zoom={zoom}
          viewportWidth={viewportWidth}
          reducedMotion={reducedMotion}
          selection={selection}
          actionNonce={actionNonce}
          lastActionType={lastActionType}
          scrollRef={scrollRef}
          rangeId={rangeId}
          onSelectEvent={onSelectEvent}
          onSelectCharacter={onSelectCharacter}
          onJump={onJump}
        />
      </div>
    </div>
  );
}
