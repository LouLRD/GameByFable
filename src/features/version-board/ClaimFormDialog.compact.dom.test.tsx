// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStore, stubViewport } from '@/app/testing';
import { useGameStore } from '@/state';
import { ClaimFormDialog } from './ClaimFormDialog';

const NUDGE_LABELS = ['−10 s', '−1 s', '+1 s', '+10 s'];

function openMalik(): HTMLElement {
  act(() => {
    useGameStore.getState().openClaimForm('cash_origin', 'h_malik_theft');
  });
  return screen.getByRole('dialog', { name: "Hypothèse — Origine de l'écart" });
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  act(() => {
    useGameStore.getState().closeDialog();
  });
  cleanup();
});

describe('<ClaimFormDialog /> — mode compact (viewport < 1024 px ou prop compact)', () => {
  it('ajoute « −10 s / −1 s / +1 s / +10 s » sous chaque heure et garde la saisie HH:MM:SS numérique', async () => {
    const user = userEvent.setup();
    stubViewport(390);
    render(<ClaimFormDialog />);
    const dlg = openMalik();
    expect(dlg.querySelector('form.claim-form')?.getAttribute('data-compact')).toBe('true');

    const start = within(dlg).getByLabelText('Début (horloge)');
    const end = within(dlg).getByLabelText('Fin (horloge)');
    expect(start).toHaveAttribute('inputmode', 'numeric');
    expect(end).toHaveAttribute('inputmode', 'numeric');
    expect(start).toHaveValue('20:54:20');
    expect(end).toHaveValue('20:55:10');

    const startGroup = within(dlg).getByRole('group', { name: 'Ajuster le début' });
    const endGroup = within(dlg).getByRole('group', { name: 'Ajuster la fin' });
    expect(
      within(startGroup)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(NUDGE_LABELS);
    expect(
      within(endGroup)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(NUDGE_LABELS);

    await user.click(within(startGroup).getByRole('button', { name: '+10 s' }));
    expect(start).toHaveValue('20:54:30');
    await user.click(within(startGroup).getByRole('button', { name: '−1 s' }));
    expect(start).toHaveValue('20:54:29');
    expect(within(dlg).getByText('= 329 s')).toBeInTheDocument();
    await user.click(within(endGroup).getByRole('button', { name: '−10 s' }));
    expect(end).toHaveValue('20:55:00');
    await user.click(within(endGroup).getByRole('button', { name: '+1 s' }));
    expect(end).toHaveValue('20:55:01');
    expect(within(dlg).getByText(/Durée : 32 s/)).toBeInTheDocument();

    // La saisie clavier reste possible et les boutons repartent de la valeur saisie.
    await user.clear(start);
    await user.type(start, '20:50:00');
    await user.click(within(startGroup).getByRole('button', { name: '−10 s' }));
    expect(start).toHaveValue('20:49:50');

    // Le bouton de validation reste présent et fonctionnel.
    const before = useGameStore.getState().actions.length;
    await user.click(within(dlg).getByRole('button', { name: 'Placer dans la version' }));
    expect(useGameStore.getState().actions).toHaveLength(before + 1);
    expect(useGameStore.getState().game?.claims.cash_origin?.interval).toEqual({
      start: 50,
      end: 361,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('borne les ajustements à la fenêtre du scénario et repart d’une valeur sûre après une saisie invalide', async () => {
    const user = userEvent.setup();
    stubViewport(390);
    render(<ClaimFormDialog />);
    const dlg = openMalik();
    const start = within(dlg).getByLabelText('Début (horloge)');
    const end = within(dlg).getByLabelText('Fin (horloge)');
    const startGroup = within(dlg).getByRole('group', { name: 'Ajuster le début' });
    const endGroup = within(dlg).getByRole('group', { name: 'Ajuster la fin' });

    await user.clear(start);
    await user.type(start, 'abc');
    await user.click(within(startGroup).getByRole('button', { name: '+1 s' }));
    expect(start).toHaveValue('20:49:01');
    await user.click(within(startGroup).getByRole('button', { name: '−10 s' }));
    expect(start).toHaveValue('20:49:00');

    await user.clear(end);
    await user.type(end, '21:14:55');
    await user.click(within(endGroup).getByRole('button', { name: '+10 s' }));
    expect(end).toHaveValue('21:15:00');
    await user.click(within(endGroup).getByRole('button', { name: '+10 s' }));
    expect(end).toHaveValue('21:15:00');

    // Fin invalide : on repart du début saisi.
    await user.clear(end);
    await user.type(end, '??');
    await user.click(within(endGroup).getByRole('button', { name: '+10 s' }));
    expect(end).toHaveValue('20:49:10');
  });

  it('la prop compact force le mode sur grand écran ; sans prop, le bureau n’a pas de boutons ±', () => {
    stubViewport(1280);
    render(<ClaimFormDialog compact />);
    const dlg = openMalik();
    expect(within(dlg).getByRole('group', { name: 'Ajuster le début' })).toBeInTheDocument();
    act(() => {
      useGameStore.getState().closeDialog();
    });
    cleanup();

    render(<ClaimFormDialog />);
    const desktop = openMalik();
    expect(desktop.querySelector('form.claim-form')?.hasAttribute('data-compact')).toBe(false);
    expect(
      within(desktop).queryByRole('group', { name: 'Ajuster le début' }),
    ).not.toBeInTheDocument();
    expect(within(desktop).queryByRole('button', { name: '+10 s' })).not.toBeInTheDocument();
    expect(within(desktop).getByLabelText('Début (horloge)')).toHaveAttribute(
      'inputmode',
      'numeric',
    );
  });
});
