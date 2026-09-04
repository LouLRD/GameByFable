// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { claimSlotId } from '@/domain/model/ids';
import { claim } from '@/test/helpers';
import { useGameStore } from '@/state';
import { ContradictionInspector } from './ContradictionInspector';

const MALIK_VERSION_ID = 'temporal:r_actor_overlap:e_camera_gap+h_malik_theft+malik';

function resetGame(): void {
  localStorage.clear();
  const store = useGameStore.getState();
  store.bootstrap();
  store.newGame();
}

function placeMalik(): void {
  act(() => {
    useGameStore.getState().dispatch(claim('cash_origin', 'h_malik_theft'));
  });
}

function detail(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.ci-detail');
  if (!el) throw new Error('Détail absent');
  return el;
}

describe('<ContradictionInspector />', () => {
  beforeEach(() => {
    resetGame();
  });

  afterEach(() => {
    useGameStore.getState().clearSelection();
  });

  it('groupe par genre, filtre, et affiche l’état vide invitant à placer une hypothèse', async () => {
    const user = userEvent.setup();
    render(<ContradictionInspector />);

    expect(screen.getByRole('heading', { name: /Temporelles/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Discursives/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Épistémiques/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Sensorielles/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Adhésion/ })).not.toBeInTheDocument();
    expect(screen.getByText(/4 contradictions, dont 0 bloquante/)).toBeInTheDocument();

    const toolbar = screen.getByRole('toolbar', { name: 'Filtrer les contradictions' });
    const versionFilter = within(toolbar).getByRole('button', { name: 'Impliquant la version' });
    await user.click(versionFilter);
    expect(versionFilter).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText('Aucune contradiction : la version tient pour l’instant.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Placez une hypothèse pour que le moteur la vérifie.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Temporelles/ })).not.toBeInTheDocument();

    // Navigation clavier dans la barre de filtres
    versionFilter.focus();
    await user.keyboard('{ArrowRight}');
    expect(within(toolbar).getByRole('button', { name: 'Témoignages' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: /Temporelles/ })).toBeInTheDocument();
  });

  it('liste la contradiction temporelle de la version, rend ses étapes et pilote curseur / zones / sélection', async () => {
    const user = userEvent.setup();
    placeMalik();
    render(<ContradictionInspector />);

    await user.click(screen.getByRole('button', { name: 'Impliquant la version' }));
    const temporal = screen.getByRole('heading', { name: /Temporelles/ }).closest('section');
    if (!temporal) throw new Error('groupe absent');
    const item = within(temporal).getByRole('button', {
      name: /Malik Bensaïd ne peut pas être à deux endroits/,
    });
    expect(item).toHaveTextContent('critique');
    expect(item).toHaveTextContent('temporelle');
    expect(item).toHaveTextContent('bloquante');

    await user.click(item);
    const store = useGameStore.getState();
    expect(store.selection).toEqual({ kind: 'contradiction', id: MALIK_VERSION_ID });
    expect(store.inspectorTab).toBe('contradictions');
    expect(item).toHaveAttribute('aria-current', 'true');

    const d = detail();
    expect(
      within(d).getByRole('heading', { name: 'Malik Bensaïd ne peut pas être à deux endroits' }),
    ).toBeInTheDocument();
    expect(within(d).getByText("Emplacements concernés : Origine de l'écart.")).toBeInTheDocument();

    const steps = d.querySelectorAll('.ci-steps > li');
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent(/Hypothèse « Vol par Malik » — acteur : Malik Bensaïd/);
    expect(steps[1]).toHaveTextContent(/Malik Bensaïd se trouve à Rayon 2/);
    expect(steps[3]).toHaveTextContent(/L'hypothèse place Malik Bensaïd dans une zone/);

    // « Voir » une étape : curseur, zones mises en évidence, zone sélectionnée
    await user.click(within(d).getByRole('button', { name: /Voir l’étape 2/ }));
    expect(useGameStore.getState().cursor).toBe(357);
    expect(useGameStore.getState().highlightIds).toEqual(['aisle_two']);
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'aisle_two' });
    expect(useGameStore.getState().liveMessage).toMatch(/curseur placé à 20:54:57/);

    // La sélection est partagée (« Voir » a sélectionné la zone) : on rouvre la contradiction
    // pour tester les boutons « Examiner ».
    act(() => {
      useGameStore.getState().select('contradiction', MALIK_VERSION_ID);
      useGameStore.getState().setCursor(0);
    });
    await user.click(screen.getByRole('button', { name: 'Aller à 20:54:57' }));
    expect(useGameStore.getState().cursor).toBe(357);

    act(() => {
      useGameStore.getState().select('contradiction', MALIK_VERSION_ID);
    });
    await user.click(screen.getByRole('button', { name: 'Zones : Rayon 1, Rayon 2' }));
    expect(useGameStore.getState().highlightIds).toEqual(['aisle_one', 'aisle_two']);

    act(() => {
      useGameStore.getState().select('contradiction', MALIK_VERSION_ID);
    });
    await user.click(screen.getByRole('button', { name: 'Pièce : Journal vidéo' }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'evidence', id: 'e_camera_gap' });

    // Éléments impliqués : puces résolues en libellés joueur
    act(() => {
      useGameStore.getState().select('contradiction', MALIK_VERSION_ID);
    });
    const chips = detail().querySelectorAll('.ci-chips .chip');
    expect([...chips].map((c) => c.textContent)).toEqual([
      'Journal vidéo',
      'Hypothèse « Vol par Malik »',
      'Malik Bensaïd',
    ]);
    await user.click(within(detail()).getByRole('button', { name: 'Malik Bensaïd' }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'character', id: 'malik' });
  });

  it('présente les résistances sociales à part, jamais comptées comme incohérences', async () => {
    const user = userEvent.setup();
    placeMalik();
    render(<ContradictionInspector />);

    expect(screen.getByText(/1 bloquante ; 2 résistances sociales/)).toBeInTheDocument();
    const social = screen.getByRole('heading', { name: /Adhésion/ }).closest('section');
    if (!social) throw new Error('section absente');
    expect(social).toHaveClass('ci-social');
    expect(within(social).getByText('résistance sociale')).toBeInTheDocument();
    expect(within(social).getByText(/jamais sur la cohérence/)).toBeInTheDocument();
    const malik = within(social).getByRole('button', { name: /Malik Bensaïd ne signe pas/ });
    expect(malik).not.toHaveTextContent('bloquante');
    await user.click(malik);
    const d = detail();
    expect(within(d).getByText('résistance sociale')).toBeInTheDocument();
    expect(within(d).getByText(/pèse sur l’adhésion, pas sur la cohérence/)).toBeInTheDocument();
    expect(d.querySelectorAll('.ci-steps > li').length).toBeGreaterThanOrEqual(2);

    // Le filtre « Témoignages » masque la section Adhésion
    await user.click(screen.getByRole('button', { name: 'Témoignages' }));
    expect(screen.queryByRole('heading', { name: /Adhésion/ })).not.toBeInTheDocument();
  });

  it('ouvre automatiquement la contradiction sélectionnée depuis un autre volet et suit le retrait', () => {
    placeMalik();
    render(<ContradictionInspector />);
    expect(document.querySelector('.ci-detail')).toBeNull();

    act(() => {
      useGameStore.getState().select('contradiction', MALIK_VERSION_ID);
    });
    expect(detail().getAttribute('data-contradiction-id')).toBe(MALIK_VERSION_ID);
    expect(within(detail()).getByText('bloquante')).toBeInTheDocument();

    // Retirer la claim : la contradiction disparaît de la liste et du détail
    act(() => {
      useGameStore.getState().dispatch({ type: 'clear-claim', slotId: claimSlotId('cash_origin') });
    });
    expect(document.querySelector('.ci-detail')).toBeNull();
    expect(screen.queryByText('bloquante')).not.toBeInTheDocument();
    expect(screen.getByText(/4 contradictions, dont 0 bloquante/)).toBeInTheDocument();
  });
});
