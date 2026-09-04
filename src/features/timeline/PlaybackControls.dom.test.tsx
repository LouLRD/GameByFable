// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/state';
import { PlaybackControls } from './PlaybackControls';

const DURATION = 1560;
const clock = (t: number) => `t+${t}`;

function setup() {
  const store = useGameStore.getState();
  store.bootstrap();
  store.newGame();
  store.setPlaybackSpeed(4);
}

describe('<PlaybackControls />', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setup();
  });

  afterEach(() => {
    act(() => {
      useGameStore.getState().setPlaying(false);
    });
    vi.useRealTimers();
  });

  it('Lecture avance le curseur de vitesse × temps écoulé, puis Pause l’arrête', () => {
    render(
      <PlaybackControls
        durationSeconds={DURATION}
        incidentAt={1380}
        outageStart={500}
        clock={clock}
      />,
    );
    const play = screen.getByRole('button', { name: 'Lecture' });
    expect(play).toHaveAttribute('aria-pressed', 'false');

    act(() => {
      fireEvent.click(play);
    });
    expect(play).toHaveAttribute('aria-pressed', 'true');
    expect(useGameStore.getState().playing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const afterOneSecond = useGameStore.getState().cursor;
    // Vitesse ×4 : environ 4 secondes simulées par seconde réelle (première image sans avance).
    expect(afterOneSecond).toBeGreaterThanOrEqual(3);
    expect(afterOneSecond).toBeLessThanOrEqual(4);

    act(() => {
      fireEvent.click(play);
    });
    expect(play).toHaveAttribute('aria-pressed', 'false');
    const paused = useGameStore.getState().cursor;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(useGameStore.getState().cursor).toBe(paused);
  });

  it('un démontage pendant la lecture n’avance plus le curseur (aucun temporisateur fantôme)', () => {
    const { unmount } = render(
      <PlaybackControls
        durationSeconds={DURATION}
        incidentAt={1380}
        outageStart={500}
        clock={clock}
      />,
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Lecture' }));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const beforeUnmount = useGameStore.getState().cursor;
    unmount();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(useGameStore.getState().cursor).toBe(beforeUnmount);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('la vitesse ×16 est appliquée au store et accélère la relecture', () => {
    render(
      <PlaybackControls
        durationSeconds={DURATION}
        incidentAt={1380}
        outageStart={500}
        clock={clock}
      />,
    );
    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: '×16' }));
    });
    expect(useGameStore.getState().playbackSpeed).toBe(16);
    expect(screen.getByRole('radio', { name: '×16' })).toBeChecked();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Lecture' }));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(useGameStore.getState().cursor).toBeGreaterThanOrEqual(15);
  });

  it('s’arrête à la fin de la fenêtre et repasse en pause', () => {
    act(() => {
      useGameStore.getState().setCursor(DURATION - 2);
      useGameStore.getState().setPlaybackSpeed(16);
    });
    render(
      <PlaybackControls
        durationSeconds={DURATION}
        incidentAt={1380}
        outageStart={500}
        clock={clock}
      />,
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Lecture' }));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(useGameStore.getState().cursor).toBe(DURATION);
    expect(useGameStore.getState().playing).toBe(false);
    expect(screen.getByRole('button', { name: 'Lecture' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(useGameStore.getState().liveMessage).toMatch(/Fin de la fenêtre/);
  });

  it('« Aller à la coupure » et « Aller au comptage » déplacent le curseur', () => {
    render(
      <PlaybackControls
        durationSeconds={DURATION}
        incidentAt={1380}
        outageStart={500}
        clock={clock}
      />,
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Aller à la coupure' }));
    });
    expect(useGameStore.getState().cursor).toBe(500);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Aller au comptage' }));
    });
    expect(useGameStore.getState().cursor).toBe(1380);
  });

  it('désactive « Aller à la coupure » avec une explication quand aucune coupure n’est connue', () => {
    render(
      <PlaybackControls
        durationSeconds={DURATION}
        incidentAt={1380}
        outageStart={null}
        clock={clock}
      />,
    );
    const button = screen.getByRole('button', { name: 'Aller à la coupure' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringMatching(/Aucune coupure/));
    expect(button).toHaveAccessibleDescription(/Aucune coupure vidéo connue/);
  });
});
