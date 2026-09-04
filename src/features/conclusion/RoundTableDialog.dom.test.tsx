// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PlayerAction } from '@/domain/model/actions';
import { useGameStore } from '@/state';

import { RoundTableDialog } from './RoundTableDialog';

const ROUND_TABLE_ACTIONS: PlayerAction[] = [
  { type: 'confront', characterId: 'jo', targetId: 's_jo_initial', supportId: 'e_camera_gap', approach: 'neutral' },
  { type: 'confront', characterId: 'ines', targetId: 's_ines_initial', supportId: 'e_pallet_scan', approach: 'empathetic' },
  { type: 'set-claim', slotId: 'cash_origin', hypothesisId: 'h_counting_error' },
  { type: 'set-claim', slotId: 'video_outage', hypothesisId: 'h_scheduled_reboot' },
  { type: 'set-claim', slotId: 'receipt_path', hypothesisId: 'h_no_receipt' },
  { type: 'set-claim', slotId: 'noise_source', hypothesisId: 'h_freezer_alarm' },
  { type: 'set-claim', slotId: 'manager_knowledge', hypothesisId: 'h_ana_unaware' },
  { type: 'request-round-table' },
];

function prepareRoundTable(): void {
  const store = useGameStore.getState();
  store.bootstrap();
  store.newGame();
  for (const action of ROUND_TABLE_ACTIONS) {
    const result = useGameStore.getState().dispatch(action);
    if (!result.ok) throw new Error(`Préparation impossible (${action.type}) : ${result.error.message}`);
  }
  useGameStore.getState().openDialog('round-table');
}

describe('<RoundTableDialog />', () => {
  beforeEach(() => {
    prepareRoundTable();
  });
  afterEach(() => {
    cleanup();
  });

  it('liste la version (5 emplacements) et les six réactions avec verdict, sans révéler la fin', () => {
    render(<RoundTableDialog />);
    const dialog = screen.getByRole('dialog', { name: 'Table ronde' });

    const version = within(dialog).getByRole('list', { name: 'Version proposée' });
    expect(within(version).getAllByRole('listitem')).toHaveLength(5);
    expect(within(version).getByText('Interruption vidéo')).toBeInTheDocument();
    expect(within(version).getByText('Redémarrage programmé')).toBeInTheDocument();

    const reactions = within(dialog).getByRole('list', { name: 'Réactions' });
    const rows = within(reactions).getAllByRole('listitem').filter((li) => li.classList.contains('sig-row'));
    expect(rows).toHaveLength(6);
    expect(within(reactions).getByText('Ana Sorel')).toBeInTheDocument();
    expect(within(reactions).getAllByText('demande une modification')).toHaveLength(6);
    expect(within(reactions).getAllByRole('img', { name: /^Portrait de / })).toHaveLength(6);

    expect(within(dialog).getByText('0 signature sur 6')).toBeInTheDocument();
    expect(within(dialog).getByText(/Version impossible/)).toBeInTheDocument();

    // Rien sur la fin atteignable : ni titre ni famille.
    expect(screen.queryByText(/Personne ne signe|Tout écrire|Une histoire simple/)).toBeNull();
    expect(screen.queryByText(/\b(Rejet|Vérité|Consensus|Accusation|Classement)\b/)).toBeNull();
  });

  it('n’est pas rendu si la table ronde n’est pas ouverte dans le moteur', () => {
    act(() => {
      useGameStore.getState().dispatch({ type: 'leave-round-table' });
    });
    render(<RoundTableDialog />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('« Retravailler la version » repasse en investigation, ferme le dialogue et annonce', async () => {
    const user = userEvent.setup();
    render(<RoundTableDialog />);
    await user.click(screen.getByRole('button', { name: 'Retravailler la version' }));

    const state = useGameStore.getState();
    expect(state.game?.phase).toBe('investigation');
    expect(state.dialog).toBeNull();
    expect(state.liveMessage).toMatch(/retravaillée/);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('« Sceller le rapport » exige une confirmation, qui peut être annulée', async () => {
    const user = userEvent.setup();
    render(<RoundTableDialog />);
    const seal = screen.getByRole('button', { name: 'Sceller le rapport' });
    expect(seal).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Le rapport ne pourra plus être modifié.')).toBeNull();

    await user.click(seal);
    expect(seal).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Le rapport ne pourra plus être modifié.')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Sceller définitivement' });
    expect(confirm).toHaveFocus();
    expect(useGameStore.getState().game?.phase).toBe('round-table');

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('button', { name: 'Sceller définitivement' })).toBeNull();
    expect(seal).toHaveFocus();
    expect(useGameStore.getState().game?.phase).toBe('round-table');
  });

  it('« Sceller définitivement » scelle le rapport, ferme le dialogue et annonce', async () => {
    const user = userEvent.setup();
    render(<RoundTableDialog />);
    await user.click(screen.getByRole('button', { name: 'Sceller le rapport' }));
    await user.click(screen.getByRole('button', { name: 'Sceller définitivement' }));

    const state = useGameStore.getState();
    expect(state.game?.phase).toBe('sealed');
    expect(state.dialog).toBeNull();
    expect(state.liveMessage).toMatch(/Rapport scellé/);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('la confirmation se fait aussi au clavier (Tab / Entrée)', async () => {
    const user = userEvent.setup();
    render(<RoundTableDialog />);
    const seal = screen.getByRole('button', { name: 'Sceller le rapport' });
    seal.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Sceller définitivement' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(useGameStore.getState().game?.phase).toBe('sealed');
  });

  it('« Voir l’emplacement » ferme le dialogue et sélectionne l’hypothèse du slot dans l’inspecteur', async () => {
    const user = userEvent.setup();
    useGameStore.getState().setActiveSpace('casefile');
    render(<RoundTableDialog />);
    const buttons = screen.getAllByRole('button', { name: /Voir l’emplacement « Interruption vidéo »/ });
    expect(buttons.length).toBeGreaterThan(0);
    await user.click(buttons[0] as HTMLElement);

    const state = useGameStore.getState();
    expect(state.dialog).toBeNull();
    expect(state.selection).toEqual({ kind: 'hypothesis', id: 'h_scheduled_reboot' });
    expect(state.activeSpace).toBe('inspector');
    expect(state.game?.phase).toBe('round-table');
    expect(state.liveMessage).toMatch(/Interruption vidéo/);
  });

  it('Échap ferme le dialogue sans quitter la table ronde', async () => {
    const user = userEvent.setup();
    render(<RoundTableDialog />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(useGameStore.getState().dialog).toBeNull();
    expect(useGameStore.getState().game?.phase).toBe('round-table');
  });
});
