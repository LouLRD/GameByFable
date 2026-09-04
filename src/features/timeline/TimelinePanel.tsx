/**
 * Frise et commandes de relecture (GDD §7.1, §7.4, §12 « centre bas » ; spec §11).
 *
 * En-tête (titre, heure courante, légende), barre de navigation (événement précédent/suivant,
 * −10 s / −1 s / +1 s / +10 s, zoom), pistes défilantes (`TimelineTrack`) et relecture
 * (`PlaybackControls`). Toutes les données viennent de la vue joueur ; toute mutation passe par
 * le store. Sélectionner un événement déplace le curseur, met en évidence zones et personnes,
 * ouvre sa fiche (sélection partagée) et ne modifie jamais la version.
 *
 * Mode compact (`compact`, coquille mobile < 1024 px) : la frise redevient le contenu principal.
 *   - barre du haut sur une rangée : heure courante, Lecture/Pause, vitesse (`<select>`),
 *     zoom cyclique ×1 → ×2 → ×4 ; le titre reste présent mais masqué visuellement ;
 *   - pistes = LA zone défilante du panneau ; un tap hors bouton place le curseur, un pan
 *     (> 8 px) ne le déplace pas ;
 *   - pied de panneau au pouce : puces défilantes (coupure, comptage, légende en feuille de
 *     fond) puis −10 s / −1 s / +1 s / +10 s (appui long = répétition) et événement
 *     précédent / suivant. Les libellés accessibles sont identiques à ceux du bureau.
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
import { Dialog } from '@/components/ui';
import { useGameStore, usePlayerView, useReducedMotion } from '@/state';
import { JumpShortcuts, PlaybackControls } from './PlaybackControls';
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
import { useHoldRepeat } from './useHoldRepeat';
import './timeline.css';

export const TIMELINE_ZOOMS = [1, 2, 4, 8] as const;
/** Niveaux du bouton de zoom cyclique en mode compact. */
export const COMPACT_ZOOMS = [1, 2, 4] as const;
/** Déplacement du pointeur (px) au-delà duquel un appui sur une piste est un défilement. */
export const PAN_THRESHOLD_PX = 8;

interface Nudge {
  delta: number;
  text: string;
  label: string;
}

const NUDGES: Nudge[] = [
  { delta: -10, text: '−10 s', label: 'Reculer de 10 secondes' },
  { delta: -1, text: '−1 s', label: 'Reculer d’une seconde' },
  { delta: 1, text: '+1 s', label: 'Avancer d’une seconde' },
  { delta: 10, text: '+10 s', label: 'Avancer de 10 secondes' },
];

export interface TimelinePanelProps {
  /** Rendu par la coquille mobile (< 1024 px) : pleine hauteur, commandes au pouce. */
  compact?: boolean;
}

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

/** Légende des codages (aucun sens porté par la couleur seule). */
function LegendList(): JSX.Element {
  return (
    <ul className="tl-legend-list">
      <li>
        <span className="tl-swatch" data-status="established" aria-hidden="true" /> établi (plein)
      </li>
      <li>
        <span className="tl-swatch" data-status="reported" aria-hidden="true" /> rapporté (hachures)
      </li>
      <li>
        <span className="tl-swatch" data-status="proposed" aria-hidden="true" /> proposé (trame
        ambre)
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
  );
}

/**
 * Bouton −10 s / −1 s / +1 s / +10 s. Avec `hold`, un appui maintenu répète le pas (mode compact) ;
 * sinon un simple clic (bureau, inchangé).
 */
function NudgeButton({
  nudge,
  blocked,
  hold,
}: {
  nudge: Nudge;
  blocked: boolean;
  hold: boolean;
}): JSX.Element {
  const { handlers, stop } = useHoldRepeat(() => useGameStore.getState().nudgeCursor(nudge.delta));
  // Borne atteinte pendant l'appui : la répétition s'arrête.
  useEffect(() => {
    if (blocked) stop();
  }, [blocked, stop]);
  return (
    <button
      type="button"
      className="btn tl-nudge"
      data-delta={nudge.delta}
      aria-label={nudge.label}
      disabled={blocked}
      title={
        blocked ? (nudge.delta < 0 ? 'Début de la fenêtre' : 'Fin de la fenêtre') : nudge.label
      }
      onKeyDown={onToolbarKeyDown}
      {...(hold ? handlers : { onClick: () => useGameStore.getState().nudgeCursor(nudge.delta) })}
    >
      {nudge.text}
    </button>
  );
}

/** Boutons de saut dont l'état dépend du curseur (isolés pour limiter les rendus). */
function NavButtons({
  events,
  durationSeconds,
  clock,
  compact,
}: {
  events: readonly TimelineEvent[];
  durationSeconds: number;
  clock: (t: number) => string;
  compact: boolean;
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
        className="btn tl-nav-prev"
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
        className="btn tl-nav-next"
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
      {compact ? null : <span className="tl-toolbar-sep" aria-hidden="true" />}
      {NUDGES.map((n) => (
        <NudgeButton
          key={n.delta}
          nudge={n}
          blocked={n.delta < 0 ? cursor <= 0 : cursor >= durationSeconds}
          hold={compact && Math.abs(n.delta) === 1}
        />
      ))}
    </>
  );
}

export function TimelinePanel({ compact = false }: TimelinePanelProps = {}): JSX.Element {
  const view = usePlayerView();
  const zoneLabels = useZoneLabels();
  const selection = useGameStore((s) => s.selection);
  const actionNonce = useGameStore((s) => s.actionNonce);
  const lastActionType = useGameStore((s) => s.lastActionType);
  const reducedMotion = useReducedMotion();

  const zooms: readonly number[] = compact ? COMPACT_ZOOMS : TIMELINE_ZOOMS;
  const [rawZoomIndex, setZoomIndex] = useState(0);
  const zoomIndex = Math.min(rawZoomIndex, zooms.length - 1);
  const zoom = zooms[zoomIndex] ?? 1;
  const [legendOpen, setLegendOpen] = useState(false);

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

  // Tap sur une piste (hors bouton / range) : le curseur se place à l'instant visé.
  // Un pan (déplacement > PAN_THRESHOLD_PX entre l'appui et le relâchement) est un défilement.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || durationSeconds <= 0) return;
    let pressed: { x: number; y: number } | null = null;
    const onPointerDown = (e: globalThis.PointerEvent) => {
      pressed = { x: e.clientX, y: e.clientY };
    };
    const onClick = (e: globalThis.MouseEvent) => {
      const start = pressed;
      pressed = null;
      if (
        start &&
        (Math.abs(e.clientX - start.x) > PAN_THRESHOLD_PX ||
          Math.abs(e.clientY - start.y) > PAN_THRESHOLD_PX)
      )
        return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('button, input, label, a, [role="img"]')) return;
      const track = target.closest<HTMLElement>('.tl-lane-track');
      if (!track) return;
      const t = timeFromPointer(e.clientX, track.getBoundingClientRect(), durationSeconds);
      if (t === null) return;
      useGameStore.getState().setCursor(t);
    };
    scroller.addEventListener('pointerdown', onPointerDown);
    scroller.addEventListener('click', onClick);
    return () => {
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('click', onClick);
    };
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
    const nextIndex = Math.min(zooms.length - 1, Math.max(0, zoomIndex + delta));
    if (nextIndex === zoomIndex) return;
    setZoomIndex(nextIndex);
    useGameStore.getState().announce(`Zoom ×${zooms[nextIndex] ?? 1}.`);
  };

  const cycleZoom = () => {
    const nextIndex = (zoomIndex + 1) % zooms.length;
    setZoomIndex(nextIndex);
    useGameStore.getState().announce(`Zoom ×${zooms[nextIndex] ?? 1}.`);
  };

  if (!view) {
    return (
      <div className={compact ? 'tl tl-compact' : 'tl'} ref={rootRef}>
        <p className="tl-empty-panel muted">
          Aucune partie en cours : la frise s’affichera à l’ouverture du dossier.
        </p>
      </div>
    );
  }

  const outages = outageSpans(view);
  const outageStart = outages[0]?.start ?? null;
  const title = `Frise — ${view.clock(0).slice(0, 5)} → ${view.clock(view.durationSeconds).slice(0, 5)}`;

  const track = (
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
        compact={compact}
      />
    </div>
  );

  if (compact) {
    return (
      <div
        className="tl tl-compact"
        ref={rootRef}
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
      >
        <header className="tl-topbar">
          <h2 className="tl-title visually-hidden" id={titleId}>
            {title}
          </h2>
          <ClockOutput rangeId={rangeId} clock={view.clock} />
          <PlaybackControls
            compact
            durationSeconds={view.durationSeconds}
            incidentAt={view.incidentAt}
            outageStart={outageStart}
            clock={view.clock}
          />
          <button
            type="button"
            className="btn btn-ghost tl-zoom-cycle"
            title={`Étirer la frise (×${COMPACT_ZOOMS.join(', ×')}) — actuellement ×${zoom}`}
            onClick={cycleZoom}
          >
            <span className="tl-zoom-word">Zoom</span> <span className="mono">×{zoom}</span>
          </button>
        </header>

        {track}

        <div className="tl-footer">
          <div className="tl-chips" role="group" aria-label="Raccourcis de la frise">
            <JumpShortcuts
              variant="chip"
              incidentAt={view.incidentAt}
              outageStart={outageStart}
              clock={view.clock}
            />
            <button
              type="button"
              className="chip tl-chip"
              aria-haspopup="dialog"
              aria-expanded={legendOpen}
              onClick={() => setLegendOpen(true)}
            >
              Légende
            </button>
          </div>
          <div className="tl-thumb-nav" role="toolbar" aria-label="Navigation temporelle">
            <NavButtons
              events={events}
              durationSeconds={view.durationSeconds}
              clock={view.clock}
              compact
            />
          </div>
        </div>

        <Dialog
          open={legendOpen}
          title="Légende de la frise"
          onClose={() => setLegendOpen(false)}
          width={480}
          className="tl-legend-sheet"
        >
          <LegendList />
        </Dialog>
      </div>
    );
  }

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
            disabled={zoomIndex === zooms.length - 1}
            title={
              zoomIndex === zooms.length - 1
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
          <LegendList />
        </details>
      </header>

      <div className="tl-controls">
        <div className="tl-toolbar" role="toolbar" aria-label="Navigation temporelle">
          <NavButtons
            events={events}
            durationSeconds={view.durationSeconds}
            clock={view.clock}
            compact={false}
          />
        </div>
        <PlaybackControls
          durationSeconds={view.durationSeconds}
          incidentAt={view.incidentAt}
          outageStart={outageStart}
          clock={view.clock}
        />
      </div>

      {track}
    </div>
  );
}
