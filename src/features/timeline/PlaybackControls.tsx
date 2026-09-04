/**
 * Commandes de relecture (GDD §7.1) : Lecture/Pause, vitesse, « Aller à la coupure »,
 * « Aller au comptage ». La boucle de lecture avance le curseur du store de `vitesse × dt`
 * (requestAnimationFrame, ou setInterval si rAF est absent), s'arrête en fin de fenêtre et
 * nettoie ses temporisateurs à la pause comme au démontage. Le curseur du store est entier :
 * la lecture progresse donc par secondes ; en mouvement réduit, la ligne du curseur n'est pas
 * interpolée (voir timeline.css).
 */
import { useEffect, useId, useRef, type JSX } from 'react';
import { useGameStore, useReducedMotion } from '@/state';

export const PLAYBACK_SPEEDS = [1, 2, 4, 8, 16] as const;

export interface PlaybackControlsProps {
  durationSeconds: number;
  /** Instant du comptage (`view.incidentAt`). */
  incidentAt: number;
  /** Début de la première coupure vidéo connue, ou null s'il n'y en a pas. */
  outageStart: number | null;
  clock: (t: number) => string;
}

/** Fallback sans requestAnimationFrame : période du setInterval (ms). */
const FALLBACK_TICK_MS = 50;
/** Écart maximal pris en compte entre deux images (s) : évite un saut après un onglet masqué. */
const MAX_FRAME_SECONDS = 0.25;

function usePlaybackLoop(
  playing: boolean,
  durationSeconds: number,
  clock: (t: number) => string,
): void {
  // L'horloge est lue via une référence : sa mise à jour ne relance pas la boucle.
  const clockRef = useRef(clock);
  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);
  useEffect(() => {
    if (!playing) return;
    const store = useGameStore;
    let position = store.getState().cursor;
    let lastKnownCursor = position;
    let lastNow: number | null = null;
    let cancelled = false;

    const advance = (now: number) => {
      if (cancelled) return;
      const state = store.getState();
      // Le curseur a été déplacé ailleurs (clic, range) : on repart de là.
      if (state.cursor !== lastKnownCursor) position = state.cursor;
      if (lastNow !== null) {
        const dt = Math.min(Math.max((now - lastNow) / 1000, 0), MAX_FRAME_SECONDS);
        position += dt * state.playbackSpeed;
      }
      lastNow = now;
      const whole = Math.floor(position);
      if (whole >= durationSeconds) {
        state.setCursor(durationSeconds);
        state.setPlaying(false);
        state.announce(`Fin de la fenêtre, ${clockRef.current(durationSeconds)}.`);
        lastKnownCursor = durationSeconds;
        return;
      }
      if (whole !== state.cursor) state.setCursor(whole);
      lastKnownCursor = store.getState().cursor;
    };

    const hasRaf =
      typeof window.requestAnimationFrame === 'function' &&
      typeof window.cancelAnimationFrame === 'function';
    let handle = 0;
    if (hasRaf) {
      const frame = (now: number) => {
        advance(now);
        if (!cancelled && store.getState().playing) handle = window.requestAnimationFrame(frame);
      };
      handle = window.requestAnimationFrame(frame);
    } else {
      handle = window.setInterval(() => advance(Date.now()), FALLBACK_TICK_MS);
    }
    return () => {
      cancelled = true;
      if (hasRaf) window.cancelAnimationFrame(handle);
      else window.clearInterval(handle);
    };
  }, [playing, durationSeconds]);
}

export function PlaybackControls({
  durationSeconds,
  incidentAt,
  outageStart,
  clock,
}: PlaybackControlsProps): JSX.Element {
  const playing = useGameStore((s) => s.playing);
  const speed = useGameStore((s) => s.playbackSpeed);
  const reducedMotion = useReducedMotion();
  const speedName = useId();
  const outageHintId = useId();

  usePlaybackLoop(playing, durationSeconds, clock);

  const togglePlay = () => {
    const store = useGameStore.getState();
    if (playing) {
      store.setPlaying(false);
      store.announce(`Pause, ${clock(store.cursor)}.`);
      return;
    }
    if (store.cursor >= durationSeconds) store.setCursor(0);
    store.setPlaying(true);
    store.announce(`Lecture ×${speed}${reducedMotion ? ', par pas d’une seconde' : ''}.`);
  };

  const goTo = (t: number, what: string) => {
    const store = useGameStore.getState();
    store.setCursor(t);
    store.announce(`${what}, ${clock(t)}.`);
  };

  return (
    <div className="tl-playback" role="group" aria-label="Relecture">
      <button
        type="button"
        className="btn btn-primary tl-play"
        aria-pressed={playing}
        title={playing ? 'Mettre en pause la relecture' : 'Lancer la relecture'}
        onClick={togglePlay}
      >
        <span className="tl-play-glyph" aria-hidden="true">
          {playing ? '❚❚' : '▶'}
        </span>
        Lecture
      </button>
      <fieldset className="tl-speed">
        <legend className="visually-hidden">Vitesse de relecture</legend>
        <span className="tl-speed-caption" aria-hidden="true">
          Vitesse
        </span>
        {PLAYBACK_SPEEDS.map((s) => (
          <label key={s} className="chip tl-speed-option">
            <input
              type="radio"
              name={speedName}
              value={s}
              checked={speed === s}
              onChange={() => useGameStore.getState().setPlaybackSpeed(s)}
            />
            <span>×{s}</span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="btn"
        disabled={outageStart === null}
        title={
          outageStart === null
            ? 'Aucune coupure vidéo connue dans le dossier'
            : `Placer le curseur au début de la coupure (${clock(outageStart)})`
        }
        {...(outageStart === null ? { 'aria-describedby': outageHintId } : {})}
        onClick={() => {
          if (outageStart !== null) goTo(outageStart, 'Début de la coupure vidéo');
        }}
      >
        Aller à la coupure
      </button>
      {outageStart === null ? (
        <span id={outageHintId} className="visually-hidden">
          Aucune coupure vidéo connue dans le dossier.
        </span>
      ) : null}
      <button
        type="button"
        className="btn"
        title={`Placer le curseur au comptage (${clock(incidentAt)})`}
        onClick={() => goTo(incidentAt, 'Comptage de fermeture')}
      >
        Aller au comptage
      </button>
    </div>
  );
}
