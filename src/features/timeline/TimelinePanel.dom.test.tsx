// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interval } from '@/domain/model/time';
import { useGameStore } from '@/state';
import { TimelinePanel } from './TimelinePanel';

function setup() {
  const store = useGameStore.getState();
  store.bootstrap();
  store.newGame();
}

describe('<TimelinePanel />', () => {
  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    act(() => {
      useGameStore.getState().setPlaying(false);
    });
    vi.restoreAllMocks();
  });

  it('affiche l’en-tête (titre, heure courante) et les pistes des six personnages avec un segment établi pour Ana', () => {
    render(<TimelinePanel />);
    expect(screen.getByRole('heading', { name: 'Frise — 20:49 → 21:15' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Heure courante' })).toHaveTextContent('20:49:00');

    const characters = [
      'Ana Sorel',
      'Malik Bensaïd',
      'Inès Vidal',
      'Jo Harel',
      'Mina Koenig',
      'Noé Rami',
    ];
    for (const name of characters) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
    const anaLane = screen.getByRole('group', { name: 'Ana Sorel' });
    const established = within(anaLane).getByRole('button', {
      name: 'Ana Sorel : Caisses, 20:49:00 → 20:53:05 (établi)',
    });
    expect(established).toHaveAttribute('data-status', 'established');
    // La position inconnue d'Ana est visible (« ? ») et nommée.
    expect(
      within(anaLane).getByRole('img', { name: /Ana Sorel : position inconnue, 20:53:05/ }),
    ).toBeInTheDocument();
    // Les autres lanes : bandes, pièces & faits, version, contradictions.
    expect(screen.getByRole('group', { name: 'Vidéo' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Pièces & faits' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Version' })).toHaveTextContent(
      'Aucune hypothèse datée',
    );
    expect(screen.getByRole('group', { name: 'Contradictions' })).toBeInTheDocument();
  });

  it('le range change le curseur, l’heure affichée et aria-valuetext', () => {
    render(<TimelinePanel />);
    const range = screen.getByRole('slider', { name: 'Curseur temporel' });
    expect(range).toHaveAttribute('max', '1560');
    expect(range).toHaveAttribute('aria-valuetext', '20:49:00');
    act(() => {
      fireEvent.change(range, { target: { value: '600' } });
    });
    expect(useGameStore.getState().cursor).toBe(600);
    expect(range).toHaveAttribute('aria-valuetext', '20:59:00');
    expect(screen.getByRole('status', { name: 'Heure courante' })).toHaveTextContent('20:59:00');
  });

  it('cliquer sur un marqueur de pièce sélectionne la pièce, déplace le curseur et met la zone en évidence', async () => {
    const user = userEvent.setup();
    render(<TimelinePanel />);
    const marker = screen.getByRole('button', {
      name: 'Pièce : Journal vidéo, 20:57:20 → 21:01:40',
    });
    await user.click(marker);
    const state = useGameStore.getState();
    expect(state.selection).toEqual({ kind: 'evidence', id: 'e_camera_gap' });
    expect(state.cursor).toBe(500);
    expect(state.highlightIds).toContain('office');
    expect(state.liveMessage).toMatch(/Journal vidéo/);
    expect(marker).toHaveAttribute('aria-current', 'true');
    // La version n'a pas été modifiée.
    expect(Object.keys(state.game?.claims ?? {})).toHaveLength(0);
  });

  it('un marqueur ponctuel (Capteur de porte, 20:52:00) place le curseur exactement sur son instant', async () => {
    const user = userEvent.setup();
    render(<TimelinePanel />);
    await user.click(screen.getByRole('button', { name: 'Pièce : Capteur de porte, 20:52:00' }));
    expect(useGameStore.getState().cursor).toBe(180);
    expect(useGameStore.getState().selection).toEqual({ kind: 'evidence', id: 'e_door_exit' });
  });

  it('un segment de personnage sélectionne le personnage et déplace le curseur au début du segment (clavier)', () => {
    render(<TimelinePanel />);
    const anaLane = screen.getByRole('group', { name: 'Ana Sorel' });
    const segment = within(anaLane).getByRole('button', {
      name: 'Ana Sorel : Caisses, 21:01:40 → 21:15:00 (établi)',
    });
    segment.focus();
    act(() => {
      fireEvent.click(segment); // détail 0 : activation clavier
    });
    const state = useGameStore.getState();
    expect(state.selection).toEqual({ kind: 'character', id: 'ana' });
    expect(state.cursor).toBe(760);
    expect(state.highlightIds).toEqual(['checkout', 'ana']);
    expect(anaLane).toHaveAttribute('data-selected', 'true');
  });

  it('« Événement suivant » saute au marqueur suivant, puis PageDown/PageUp naviguent au clavier', async () => {
    const user = userEvent.setup();
    render(<TimelinePanel />);
    const next = screen.getByRole('button', { name: 'Événement suivant' });
    const prev = screen.getByRole('button', { name: 'Événement précédent' });
    expect(prev).toBeDisabled();
    expect(prev).toHaveAccessibleDescription('Aucun événement avant le curseur.');

    await user.click(next);
    expect(useGameStore.getState().cursor).toBe(180); // Capteur de porte
    await user.click(next);
    expect(useGameStore.getState().cursor).toBe(238); // fait rapporté : remise de la pochette
    expect(prev).toBeEnabled();

    const range = screen.getByRole('slider', { name: 'Curseur temporel' });
    range.focus();
    await user.keyboard('{PageDown}');
    expect(useGameStore.getState().cursor).toBe(250); // contradiction inspectable
    await user.keyboard('{PageUp}');
    expect(useGameStore.getState().cursor).toBe(238);
    expect(useGameStore.getState().liveMessage).toMatch(/Événement précédent/);
  });

  it('les boutons −10 s / −1 s / +1 s / +10 s déplacent le curseur et sont désactivés aux bornes', async () => {
    const user = userEvent.setup();
    render(<TimelinePanel />);
    const back10 = screen.getByRole('button', { name: 'Reculer de 10 secondes' });
    const back1 = screen.getByRole('button', { name: 'Reculer d’une seconde' });
    expect(back10).toBeDisabled();
    expect(back1).toHaveAttribute('title', 'Début de la fenêtre');
    await user.click(screen.getByRole('button', { name: 'Avancer de 10 secondes' }));
    await user.click(screen.getByRole('button', { name: 'Avancer d’une seconde' }));
    expect(useGameStore.getState().cursor).toBe(11);
    expect(back10).toBeEnabled();
    await user.click(back1);
    expect(useGameStore.getState().cursor).toBe(10);
  });

  it('un clic sur une piste (hors bouton) place le curseur à l’instant cliqué', () => {
    const { container } = render(<TimelinePanel />);
    const track = container.querySelector<HTMLElement>('.tl-lane-evidence .tl-lane-track');
    expect(track).not.toBeNull();
    if (!track) return;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 1000,
      top: 0,
      height: 30,
      right: 1100,
      bottom: 30,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });
    act(() => {
      fireEvent.click(track, { clientX: 600 });
    });
    expect(useGameStore.getState().cursor).toBe(780);
  });

  it('la piste Version affiche l’intervalle d’une hypothèse datée et pulse après « set-claim »', () => {
    render(<TimelinePanel />);
    const versionLane = screen.getByRole('group', { name: 'Version' });
    expect(versionLane).not.toHaveClass('anim-propagate');
    act(() => {
      const r = useGameStore.getState().dispatch({
        type: 'set-claim',
        slotId: 'video_outage' as never,
        hypothesisId: 'h_deliberate_unplug' as never,
        actorId: 'malik' as never,
        interval: interval(503, 513),
      });
      expect(r.ok).toBe(true);
    });
    const claim = within(versionLane).getByRole('button', {
      name: /^Version : Débranchement volontaire \(Malik Bensaïd, Bureau\), 20:57:23 → 20:57:33$/,
    });
    expect(claim).toHaveAttribute('data-kind', 'claim');
    expect(versionLane).toHaveClass('anim-propagate');
    // Le segment proposé apparaît aussi dans la piste de Malik.
    const malikLane = screen.getByRole('group', { name: 'Malik Bensaïd' });
    expect(
      within(malikLane).getByRole('button', {
        name: 'Malik Bensaïd : Bureau, 20:57:23 → 20:57:33 (proposé)',
      }),
    ).toHaveAttribute('data-status', 'proposed');
  });

  it('sélectionner une contradiction depuis la frise ouvre l’onglet contradictions et fissure sa marque', async () => {
    const user = userEvent.setup();
    render(<TimelinePanel />);
    const lane = screen.getByRole('group', { name: 'Contradictions' });
    const mark = within(lane).getByRole('button', {
      name: /^Contradiction majeure : .+, 20:53:10$/,
    });
    expect(mark).toHaveAttribute('data-severity', 'major');
    expect(mark).not.toHaveClass('anim-crack');
    await user.click(mark);
    const state = useGameStore.getState();
    expect(state.selection?.kind).toBe('contradiction');
    expect(state.inspectorTab).toBe('contradictions');
    expect(state.cursor).toBe(250);
    expect(state.highlightIds).toEqual(expect.arrayContaining(['office', 'malik']));
    expect(mark).toHaveClass('anim-crack');
    expect(mark).toHaveAttribute('aria-current', 'true');
  });

  it('en mouvement réduit, aucune classe d’animation n’est posée', async () => {
    act(() => {
      useGameStore.getState().setPref('reducedMotion', 'on');
    });
    const user = userEvent.setup();
    render(<TimelinePanel />);
    const lane = screen.getByRole('group', { name: 'Contradictions' });
    const mark = within(lane).getByRole('button', { name: /^Contradiction majeure/ });
    await user.click(mark);
    expect(mark).not.toHaveClass('anim-crack');
    act(() => {
      useGameStore.getState().setPref('reducedMotion', 'system');
    });
  });

  it('Zoom + / − étirent le canevas et sont désactivés aux bornes', async () => {
    const user = userEvent.setup();
    const { container } = render(<TimelinePanel />);
    const zoomOut = screen.getByRole('button', { name: 'Zoom moins' });
    const zoomIn = screen.getByRole('button', { name: 'Zoom plus' });
    const canvas = container.querySelector<HTMLElement>('.tl-canvas');
    expect(zoomOut).toBeDisabled();
    expect(canvas).toHaveAttribute('data-zoom', '1');
    await user.click(zoomIn);
    expect(canvas).toHaveAttribute('data-zoom', '2');
    expect(canvas?.style.getPropertyValue('--tl-zoom')).toBe('2');
    expect(screen.getByRole('status', { name: 'Niveau de zoom' })).toHaveTextContent('×2');
    expect(zoomOut).toBeEnabled();
    await user.click(zoomIn);
    await user.click(zoomIn);
    expect(canvas).toHaveAttribute('data-zoom', '8');
    expect(zoomIn).toBeDisabled();
    expect(zoomIn).toHaveAttribute('title', 'Zoom maximal atteint');
  });

  it('la bande « Vidéo » expose la coupure et la bande « Obstruction » apparaît une fois l’obstruction connue', async () => {
    const user = userEvent.setup();
    render(<TimelinePanel />);
    const outage = screen.getByRole('button', {
      name: 'Coupure vidéo : Flux vidéo absent, 20:57:20 → 21:01:40',
    });
    await user.click(outage);
    expect(useGameStore.getState().cursor).toBe(500);
    expect(screen.getByRole('group', { name: 'Obstruction' })).toHaveTextContent(
      'Aucune obstruction connue',
    );

    act(() => {
      // Confrontation d’Inès avec le scan de palette : révèle la palette (obstruction publique).
      const r = useGameStore.getState().dispatch({
        type: 'confront',
        characterId: 'ines' as never,
        targetId: 's_ines_initial',
        supportId: 'e_pallet_scan',
        approach: 'empathetic',
      });
      if (!r.ok) {
        // Le scan doit d'abord être débloqué : Jo et le journal vidéo.
        useGameStore.getState().dispatch({
          type: 'confront',
          characterId: 'jo' as never,
          targetId: 's_jo_initial',
          supportId: 'e_camera_gap',
          approach: 'neutral',
        });
        useGameStore.getState().dispatch({
          type: 'confront',
          characterId: 'ines' as never,
          targetId: 's_ines_initial',
          supportId: 'e_pallet_scan',
          approach: 'empathetic',
        });
      }
    });
    const obstruction = screen.getByRole('button', {
      name: 'Obstruction connue : Passage obstrué — Allée froide, 20:56:00 → 21:03:10',
    });
    await user.click(obstruction);
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'cold_aisle' });
    expect(useGameStore.getState().cursor).toBe(420);
  });
});
