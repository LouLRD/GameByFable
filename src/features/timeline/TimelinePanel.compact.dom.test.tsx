// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStore, stubViewport } from '@/app/testing';
import { useGameStore } from '@/state';
import { TimelinePanel } from './TimelinePanel';
import { HOLD_DELAY_MS, HOLD_INTERVAL_MS } from './useHoldRepeat';

function setup() {
  resetStore();
  stubViewport(390);
  useGameStore.getState().newGame();
}

const trackRect = {
  left: 100,
  width: 1000,
  top: 0,
  height: 44,
  right: 1100,
  bottom: 44,
  x: 100,
  y: 0,
  toJSON: () => ({}),
};

describe('<TimelinePanel compact /> (mobile 390 px)', () => {
  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    act(() => {
      useGameStore.getState().setPlaying(false);
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rend une barre du haut compacte (heure, Lecture, vitesse en select, zoom cyclique) et un titre masqué mais accessible', () => {
    const { container } = render(<TimelinePanel compact />);
    expect(container.querySelector('.tl')).toHaveClass('tl-compact');

    // Titre présent pour l'accessibilité, sans grand en-tête visible.
    const heading = screen.getByRole('heading', { name: 'Frise — 20:49 → 21:15' });
    expect(heading).toHaveClass('visually-hidden');
    expect(container.querySelector('.tl-header')).toBeNull();
    expect(container.querySelector('.tl-controls')).toBeNull();

    const topbar = container.querySelector<HTMLElement>('.tl-topbar');
    expect(topbar).not.toBeNull();
    if (!topbar) return;
    expect(within(topbar).getByRole('status', { name: 'Heure courante' })).toHaveTextContent(
      '20:49:00',
    );
    const play = within(topbar).getByRole('button', { name: 'Lecture' });
    expect(play).toHaveAttribute('aria-pressed', 'false');
    // Vitesse par défaut du store : ×4.
    expect(within(topbar).getByRole('combobox', { name: 'Vitesse de relecture' })).toHaveValue('4');
    expect(within(topbar).getByRole('button', { name: 'Zoom ×1' })).toBeInTheDocument();

    // Plus de radios de vitesse ni de paire Zoom −/+ ; la légende n'est plus un <details>.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Zoom moins' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom plus' })).toBeNull();
    expect(container.querySelector('details.tl-legend')).toBeNull();

    // Rangée du pouce : barre d'outils avec les six commandes, libellés accessibles inchangés.
    const toolbar = screen.getByRole('toolbar', { name: 'Navigation temporelle' });
    expect(toolbar).toHaveClass('tl-thumb-nav');
    for (const name of [
      'Événement précédent',
      'Reculer de 10 secondes',
      'Reculer d’une seconde',
      'Avancer d’une seconde',
      'Avancer de 10 secondes',
      'Événement suivant',
    ]) {
      expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(within(toolbar).getByRole('button', { name: 'Avancer d’une seconde' })).toHaveAttribute(
      'data-delta',
      '1',
    );
    // Le range du curseur est toujours là (pouce élargi par CSS).
    expect(screen.getByRole('slider', { name: 'Curseur temporel' })).toHaveAttribute('max', '1560');
  });

  it('le select de vitesse écrit playbackSpeed dans le store et Lecture bascule aria-pressed', async () => {
    const user = userEvent.setup();
    render(<TimelinePanel compact />);
    const select = screen.getByRole('combobox', { name: 'Vitesse de relecture' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['×1', '×2', '×4', '×8', '×16']);
    await user.selectOptions(select, '8');
    expect(useGameStore.getState().playbackSpeed).toBe(8);
    expect(select).toHaveValue('8');
    await user.selectOptions(select, '16');
    expect(useGameStore.getState().playbackSpeed).toBe(16);

    const play = screen.getByRole('button', { name: 'Lecture' });
    await user.click(play);
    expect(useGameStore.getState().playing).toBe(true);
    expect(play).toHaveAttribute('aria-pressed', 'true');
    expect(useGameStore.getState().liveMessage).toMatch(/Lecture ×16/);
    await user.click(play);
    expect(useGameStore.getState().playing).toBe(false);
    expect(play).toHaveAttribute('aria-pressed', 'false');
  });

  it('le bouton Zoom cycle ×1 → ×2 → ×4 → ×1 et étire le canevas', async () => {
    const user = userEvent.setup();
    const { container } = render(<TimelinePanel compact />);
    const canvas = container.querySelector<HTMLElement>('.tl-canvas');
    expect(canvas).toHaveAttribute('data-zoom', '1');
    await user.click(screen.getByRole('button', { name: 'Zoom ×1' }));
    expect(canvas).toHaveAttribute('data-zoom', '2');
    expect(useGameStore.getState().liveMessage).toBe('Zoom ×2.');
    await user.click(screen.getByRole('button', { name: 'Zoom ×2' }));
    expect(canvas).toHaveAttribute('data-zoom', '4');
    await user.click(screen.getByRole('button', { name: 'Zoom ×4' }));
    expect(canvas).toHaveAttribute('data-zoom', '1');
    expect(screen.getByRole('button', { name: 'Zoom ×1' })).toBeInTheDocument();
  });

  it('un appui long sur « +1 s » répète le pas toutes les 120 ms après 500 ms, sans double déclenchement au relâchement', () => {
    vi.useFakeTimers();
    render(<TimelinePanel compact />);
    const plus1 = screen.getByRole('button', { name: 'Avancer d’une seconde' });

    // Appui bref : un seul pas (via le clic).
    act(() => {
      fireEvent.pointerDown(plus1, { button: 0 });
      vi.advanceTimersByTime(100);
      fireEvent.pointerUp(plus1);
      fireEvent.click(plus1);
    });
    expect(useGameStore.getState().cursor).toBe(1);

    // Appui long : rien avant 500 ms, puis un pas immédiat et un pas toutes les 120 ms.
    act(() => {
      fireEvent.pointerDown(plus1, { button: 0 });
      vi.advanceTimersByTime(HOLD_DELAY_MS - 1);
    });
    expect(useGameStore.getState().cursor).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(useGameStore.getState().cursor).toBe(2);
    act(() => {
      vi.advanceTimersByTime(HOLD_INTERVAL_MS * 3);
    });
    expect(useGameStore.getState().cursor).toBe(5);

    // Relâcher arrête ; le clic synthétique qui suit un appui long est ignoré.
    act(() => {
      fireEvent.pointerUp(plus1);
      fireEvent.click(plus1);
      vi.advanceTimersByTime(1000);
    });
    expect(useGameStore.getState().cursor).toBe(5);

    // « −1 s » recule de la même façon ; l'appui long s'arrête quand la borne est atteinte.
    const minus1 = screen.getByRole('button', { name: 'Reculer d’une seconde' });
    act(() => {
      fireEvent.pointerDown(minus1, { button: 0 });
      vi.advanceTimersByTime(HOLD_DELAY_MS + HOLD_INTERVAL_MS * 10);
    });
    expect(useGameStore.getState().cursor).toBe(0);
    expect(minus1).toBeDisabled();
    act(() => {
      fireEvent.pointerUp(window);
      vi.advanceTimersByTime(1000);
    });
    expect(useGameStore.getState().cursor).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('les boutons ±10 s restent des clics simples et Événement suivant saute au marqueur suivant', async () => {
    const user = userEvent.setup();
    render(<TimelinePanel compact />);
    await user.click(screen.getByRole('button', { name: 'Avancer de 10 secondes' }));
    expect(useGameStore.getState().cursor).toBe(10);
    await user.click(screen.getByRole('button', { name: 'Événement suivant' }));
    expect(useGameStore.getState().cursor).toBe(180);
    expect(useGameStore.getState().liveMessage).toMatch(/Événement suivant/);
    await user.click(screen.getByRole('button', { name: 'Reculer de 10 secondes' }));
    expect(useGameStore.getState().cursor).toBe(170);
  });

  it('un tap sur une piste place le curseur, un pan horizontal de plus de 8 px ne le déplace pas', () => {
    const { container } = render(<TimelinePanel compact />);
    const track = container.querySelector<HTMLElement>('.tl-lane-evidence .tl-lane-track');
    expect(track).not.toBeNull();
    if (!track) return;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(trackRect);

    // Pan : appui à x=600, relâchement (clic) à x=640 → ignoré.
    act(() => {
      fireEvent.pointerDown(track, { clientX: 600, clientY: 20 });
      fireEvent.click(track, { clientX: 640, clientY: 20 });
    });
    expect(useGameStore.getState().cursor).toBe(0);

    // Défilement vertical : ignoré aussi.
    act(() => {
      fireEvent.pointerDown(track, { clientX: 600, clientY: 20 });
      fireEvent.click(track, { clientX: 600, clientY: 60 });
    });
    expect(useGameStore.getState().cursor).toBe(0);

    // Tap : léger tremblement (≤ 8 px) → curseur à l'instant visé (603 → 785 s).
    act(() => {
      fireEvent.pointerDown(track, { clientX: 600, clientY: 20 });
      fireEvent.click(track, { clientX: 603, clientY: 22 });
    });
    expect(useGameStore.getState().cursor).toBe(785);

    // Un clic sans appui préalable (clavier, test) reste accepté.
    act(() => {
      fireEvent.click(track, { clientX: 100 });
    });
    expect(useGameStore.getState().cursor).toBe(0);
  });

  it('les raccourcis sont des puces dans une rangée défilante et la légende s’ouvre en feuille fermable par Échap', async () => {
    const user = userEvent.setup();
    const { container } = render(<TimelinePanel compact />);
    const chips = container.querySelector<HTMLElement>('.tl-chips');
    expect(chips).not.toBeNull();
    if (!chips) return;
    expect(chips).toHaveAttribute('role', 'group');
    const outage = within(chips).getByRole('button', { name: 'Aller à la coupure' });
    const incident = within(chips).getByRole('button', { name: 'Aller au comptage' });
    const legend = within(chips).getByRole('button', { name: 'Légende' });
    expect(outage).toHaveClass('chip');
    expect(incident).toHaveClass('chip');
    expect(legend).toHaveClass('chip');
    // Les raccourcis ne sont plus dans le groupe « Relecture » (barre du haut).
    expect(
      within(screen.getByRole('group', { name: 'Relecture' })).queryByRole('button', {
        name: 'Aller à la coupure',
      }),
    ).toBeNull();

    await user.click(outage);
    expect(useGameStore.getState().cursor).toBe(500);
    await user.click(incident);
    expect(useGameStore.getState().cursor).toBe(1380);

    await user.click(legend);
    const dialog = screen.getByRole('dialog', { name: 'Légende de la frise' });
    expect(within(dialog).getByText(/hors champ caméra/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Fermer la fenêtre' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(legend);
    await user.click(screen.getByRole('button', { name: 'Fermer la fenêtre' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('les pistes de personnages affichent un prénom court mais gardent leur nom complet accessible', () => {
    render(<TimelinePanel compact />);
    const expected: [string, string][] = [
      ['Ana Sorel', 'Ana'],
      ['Malik Bensaïd', 'Malik'],
      ['Inès Vidal', 'Inès'],
      ['Jo Harel', 'Jo'],
      ['Mina Koenig', 'Mina'],
      ['Noé Rami', 'Noé'],
    ];
    for (const [full, short] of expected) {
      const lane = screen.getByRole('group', { name: full });
      const visible = lane.querySelector<HTMLElement>('.tl-lane-label .tl-lane-name');
      expect(visible).not.toBeNull();
      expect(visible).toHaveTextContent(short);
      expect(visible).toHaveAttribute('aria-hidden', 'true');
    }
    // Les pistes longues gardent leur nom accessible malgré la coupure douce visible.
    expect(screen.getByRole('group', { name: 'Contradictions' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Obstruction' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Pièces & faits' })).toBeInTheDocument();
    // Les marqueurs restent des boutons nommés et sélectionnables.
    const anaLane = screen.getByRole('group', { name: 'Ana Sorel' });
    const segment = within(anaLane).getByRole('button', {
      name: 'Ana Sorel : Caisses, 21:01:40 → 21:15:00 (établi)',
    });
    act(() => {
      fireEvent.click(segment);
    });
    expect(useGameStore.getState().selection).toEqual({ kind: 'character', id: 'ana' });
    expect(useGameStore.getState().cursor).toBe(760);
  });

  it('sans partie en cours, le panneau compact affiche le message d’attente', () => {
    act(() => {
      useGameStore.setState({ game: null });
    });
    const { container } = render(<TimelinePanel compact />);
    expect(container.querySelector('.tl')).toHaveClass('tl-compact');
    expect(screen.getByText(/Aucune partie en cours/)).toBeInTheDocument();
  });
});
