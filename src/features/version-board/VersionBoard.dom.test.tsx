// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { claim, confront } from '@/test/helpers';
import { useGameStore, type GameStore } from '@/state';
import { ClaimFormDialog } from './ClaimFormDialog';
import { VersionBoard } from './VersionBoard';

const SLOT_LABEL = "Origine de l'écart";

function resetGame(): void {
  localStorage.clear();
  const store = useGameStore.getState();
  store.bootstrap();
  store.newGame();
}

function renderBoard(): void {
  render(
    <>
      <VersionBoard />
      <ClaimFormDialog />
    </>,
  );
}

function card(slotId: string): HTMLElement {
  const el = document.getElementById(`slot-card-${slotId}`);
  if (!el) throw new Error(`Carte ${slotId} absente`);
  return el;
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: `Hypothèse — ${SLOT_LABEL}` });
}

describe('<VersionBoard /> + <ClaimFormDialog />', () => {
  const initial = useGameStore.getInitialState();

  beforeEach(() => {
    resetGame();
  });

  afterEach(() => {
    useGameStore.setState({ dispatch: (action) => initial.dispatch(action) });
    useGameStore.getState().closeDialog();
    useGameStore.getState().setPref('reducedMotion', 'system');
  });

  it('place « Vol par Malik » depuis le formulaire : statut impossible, annonce, mise en évidence, fissure', async () => {
    const user = userEvent.setup();
    renderBoard();

    expect(screen.getByText('Version incomplète')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Choisir une hypothèse pour/ })).toHaveLength(5);

    await user.click(
      screen.getByRole('button', { name: `Choisir une hypothèse pour « ${SLOT_LABEL} »` }),
    );
    const dlg = dialog();
    expect(useGameStore.getState().dialog).toBe('claim-form');

    const hypothesisSelect = within(dlg).getByLabelText('Hypothèse');
    await user.selectOptions(hypothesisSelect, 'h_malik_theft');

    // Pré-remplissage par les défauts de l'hypothèse (acteur, lieu, intervalle en horloge)
    expect(within(dlg).getByLabelText(/^Acteur/)).toHaveValue('malik');
    expect(within(dlg).getByLabelText('Lieu')).toHaveValue('aisle_one');
    expect(within(dlg).getByLabelText('Début (horloge)')).toHaveValue('20:54:20');
    expect(within(dlg).getByLabelText('Fin (horloge)')).toHaveValue('20:55:10');
    expect(within(dlg).getByText('= 320 s')).toBeInTheDocument();
    expect(within(dlg).getByText(/Durée : 50 s/)).toBeInTheDocument();

    const before = useGameStore.getState().actions.length;
    await user.click(within(dlg).getByRole('button', { name: 'Placer dans la version' }));

    const store = useGameStore.getState();
    expect(store.actions).toHaveLength(before + 1);
    expect(store.game?.claims.cash_origin?.hypothesisId).toBe('h_malik_theft');
    expect(store.game?.claims.cash_origin?.interval).toEqual({ start: 320, end: 370 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const c = card('cash_origin');
    expect(within(c).getByText('Vol par Malik')).toBeInTheDocument();
    expect(within(c).getByText('impossible')).toBeInTheDocument();
    expect(c.getAttribute('data-status')).toBe('impossible');
    expect(c.getAttribute('data-blocking')).toBe('true');
    expect(within(c).getByText(/1 contradiction liée — fil causal fissuré/)).toBeInTheDocument();
    expect(c.classList.contains('anim-crack')).toBe(true);

    // Fil causal : le segment sous la première carte est fissuré (motif + glyphe + texte)
    const cracked = document.querySelectorAll('.vb-thread[data-cracked="true"]');
    expect(cracked).toHaveLength(1);
    expect(cracked[0]).toHaveTextContent('fil causal fissuré');

    expect(screen.getByText('Version impossible')).toBeInTheDocument();
    expect(store.liveMessage).toMatch(/Hypothèse placée : « Vol par Malik » — statut impossible/);
    expect(store.liveMessage).toMatch(
      /Version réévaluée : cohérence impossible, 1 contradiction bloquante/,
    );
    expect(store.highlightIds).toEqual(['aisle_one', 'malik']);
    // La sélection n'est pas touchée par le placement
    expect(store.selection).toBeNull();
  });

  it('modifier l’intervalle (20:54:26 → 20:54:50) change le statut de l’emplacement', async () => {
    const user = userEvent.setup();
    act(() => {
      useGameStore.getState().dispatch(claim('cash_origin', 'h_malik_theft'));
    });
    renderBoard();
    expect(within(card('cash_origin')).getByText('impossible')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: `Modifier l’hypothèse de « ${SLOT_LABEL} »` }),
    );
    const dlg = dialog();
    expect(within(dlg).getByLabelText('Hypothèse')).toHaveValue('h_malik_theft');
    const start = within(dlg).getByLabelText('Début (horloge)');
    const end = within(dlg).getByLabelText('Fin (horloge)');
    await user.clear(start);
    await user.type(start, '20:54:26');
    await user.clear(end);
    await user.type(end, '20:54:50');
    expect(within(dlg).getByText('= 326 s')).toBeInTheDocument();
    expect(within(dlg).getByText('= 350 s')).toBeInTheDocument();
    expect(within(dlg).getByText(/Durée : 24 s/)).toBeInTheDocument();

    await user.click(within(dlg).getByRole('button', { name: 'Placer dans la version' }));

    const store = useGameStore.getState();
    expect(store.game?.claims.cash_origin?.interval).toEqual({ start: 326, end: 350 });
    const c = card('cash_origin');
    expect(within(c).queryByText('impossible')).not.toBeInTheDocument();
    expect(within(c).getByText('non étayé')).toBeInTheDocument();
    expect(within(c).getByText('20:54:26 – 20:54:50')).toBeInTheDocument();
    expect(store.liveMessage).toMatch(/statut non étayé/);
  });

  it('un intervalle inversé affiche une erreur de validation sans dispatch', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(
      screen.getByRole('button', { name: `Choisir une hypothèse pour « ${SLOT_LABEL} »` }),
    );
    const dlg = dialog();
    await user.selectOptions(within(dlg).getByLabelText('Hypothèse'), 'h_malik_theft');
    const start = within(dlg).getByLabelText('Début (horloge)');
    const end = within(dlg).getByLabelText('Fin (horloge)');
    await user.clear(start);
    await user.type(start, '20:55:00');
    await user.clear(end);
    await user.type(end, '20:54:00');

    const before = useGameStore.getState().actions.length;
    await user.click(within(dlg).getByRole('button', { name: 'Placer dans la version' }));

    expect(within(dlg).getByText('La fin doit être postérieure au début.')).toBeInTheDocument();
    expect(end).toHaveAttribute('aria-invalid', 'true');
    expect(end).toHaveFocus();
    expect(useGameStore.getState().actions).toHaveLength(before);
    expect(useGameStore.getState().game?.claims.cash_origin).toBeUndefined();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Hors fenêtre du scénario
    await user.clear(end);
    await user.type(end, '21:30:00');
    expect(
      within(dlg).getByText(/La fin doit être comprise entre 20:49:00 et 21:15:00/),
    ).toBeInTheDocument();
    // Format invalide
    await user.clear(start);
    await user.type(start, 'abc');
    expect(within(dlg).getByText(/Heure de début invalide/)).toBeInTheDocument();
    expect(useGameStore.getState().actions).toHaveLength(before);
  });

  it('un acteur manquant sur une hypothèse qui l’exige est refusé localement', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(
      screen.getByRole('button', { name: 'Choisir une hypothèse pour « Interruption vidéo »' }),
    );
    const dlg = screen.getByRole('dialog', { name: 'Hypothèse — Interruption vidéo' });
    await user.selectOptions(within(dlg).getByLabelText('Hypothèse'), 'h_deliberate_unplug');
    expect(within(dlg).getByLabelText('Acteur (requis)')).toBeInTheDocument();
    const before = useGameStore.getState().actions.length;
    await user.click(within(dlg).getByRole('button', { name: 'Placer dans la version' }));
    expect(
      within(dlg).getByText('Cette hypothèse exige de désigner un acteur.'),
    ).toBeInTheDocument();
    expect(useGameStore.getState().actions).toHaveLength(before);

    await user.selectOptions(within(dlg).getByLabelText('Acteur (requis)'), 'ines');
    await user.click(within(dlg).getByRole('button', { name: 'Placer dans la version' }));
    expect(useGameStore.getState().game?.claims.video_outage?.actorId).toBe('ines');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('affiche l’erreur du moteur comme remarque de l’outil, sans fermer le formulaire', async () => {
    const user = userEvent.setup();
    const refusing: GameStore['dispatch'] = () => ({
      ok: false,
      error: { code: 'hypothesis-locked', message: 'Message technique du moteur.' },
      state: null,
    });
    useGameStore.setState({ dispatch: refusing });
    renderBoard();
    await user.click(
      screen.getByRole('button', { name: `Choisir une hypothèse pour « ${SLOT_LABEL} »` }),
    );
    const dlg = dialog();
    await user.click(within(dlg).getByRole('button', { name: 'Placer dans la version' }));
    const alert = within(dlg).getByRole('alert');
    expect(alert).toHaveTextContent('action refusée');
    expect(alert).toHaveTextContent('Message technique du moteur.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(useGameStore.getState().dialog).toBe('claim-form');
  });

  it('« Retirer » vide l’emplacement, réévalue et annonce', async () => {
    const user = userEvent.setup();
    act(() => {
      useGameStore.getState().dispatch(claim('cash_origin', 'h_malik_theft'));
    });
    renderBoard();
    expect(screen.getByText('Version impossible')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: `Retirer l’hypothèse de « ${SLOT_LABEL} »` }),
    );
    const store = useGameStore.getState();
    expect(store.game?.claims.cash_origin).toBeUndefined();
    expect(within(card('cash_origin')).getByText('Aucune hypothèse')).toBeInTheDocument();
    expect(screen.getByText('Version incomplète')).toBeInTheDocument();
    expect(document.querySelectorAll('.vb-thread[data-cracked="true"]')).toHaveLength(0);
    expect(store.liveMessage).toMatch(new RegExp(`Emplacement « ${SLOT_LABEL} » vidé`));
    expect(store.liveMessage).toMatch(/0 contradiction bloquante/);
  });

  it('présente trois axes séparés et un lien vers l’emplacement demandé', async () => {
    const user = userEvent.setup();
    act(() => {
      useGameStore.getState().dispatch(claim('cash_origin', 'h_malik_theft'));
    });
    renderBoard();
    const axes = screen.getByRole('group', { name: 'Trois axes d’évaluation' });
    expect(within(axes).getByRole('heading', { name: 'Cohérence' })).toBeInTheDocument();
    expect(within(axes).getByRole('heading', { name: 'Dévoilement' })).toBeInTheDocument();
    expect(within(axes).getByRole('heading', { name: 'Adhésion' })).toBeInTheDocument();
    expect(within(axes).getByText(/1 contradiction bloquante, 4 remarques/)).toBeInTheDocument();

    const meter = within(axes).getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '0');
    expect(within(axes).getByText('0 pièce expliquée sur 2')).toBeInTheDocument();
    await user.click(within(axes).getByRole('button', { name: /Journal vidéo/ }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'evidence', id: 'e_camera_gap' });

    expect(within(axes).getByText('4/6 signeraient')).toBeInTheDocument();
    expect(within(axes).getByText('Malik Bensaïd')).toBeInTheDocument();
    expect(within(axes).getByText('demande une modification')).toBeInTheDocument();
    expect(within(axes).getByText('refuse de signer')).toBeInTheDocument();
    expect(within(axes).getAllByText('signerait')).toHaveLength(4);
    // Jamais d'alignement canonique dans le volet
    expect(screen.queryByText(/alignement/i)).not.toBeInTheDocument();

    await user.click(
      within(axes).getByRole('button', { name: `Emplacement demandé : ${SLOT_LABEL}` }),
    );
    expect(card('cash_origin')).toHaveFocus();
    expect(useGameStore.getState().liveMessage).toMatch(/mis en avant/);
  });

  it('verrouille les pièces initiales et marque une pièce retirée comme omission', async () => {
    const user = userEvent.setup();
    act(() => {
      useGameStore.getState().dispatch(confront('jo', 's_jo_initial', 'e_camera_gap', 'neutral'));
    });
    renderBoard();

    const mandatory = screen.getByRole('checkbox', { name: /Rapport de caisse/ });
    expect(mandatory).toBeDisabled();
    expect(mandatory).toBeChecked();
    expect(mandatory).toHaveAccessibleDescription(/dossier initial/);
    expect(mandatory).toHaveAttribute('title', expect.stringMatching(/dossier initial/));

    const pallet = screen.getByRole('checkbox', { name: /Scan de la palette/ });
    expect(pallet).toBeEnabled();
    expect(screen.queryByText('omission')).not.toBeInTheDocument();
    await user.click(pallet);
    expect(useGameStore.getState().game?.detachedEvidenceIds).toEqual(['e_pallet_scan']);
    expect(pallet).not.toBeChecked();
    expect(screen.getByText('omission')).toBeInTheDocument();
    expect(useGameStore.getState().liveMessage).toMatch(/retirée du rapport \(omission\)/);

    await user.click(pallet);
    expect(useGameStore.getState().game?.detachedEvidenceIds).toEqual([]);
    expect(screen.queryByText('omission')).not.toBeInTheDocument();
    expect(useGameStore.getState().liveMessage).toMatch(/jointe au rapport/);
  });

  it('désactive la table ronde avec message et compteur tant que la version est incomplète', async () => {
    const user = userEvent.setup();
    renderBoard();
    const button = screen.getByRole('button', { name: 'Demander la table ronde' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      /tous les emplacements de la version doivent être remplis/,
    );
    expect(screen.getByText(/au moins 2 révélations structurantes/)).toBeInTheDocument();
    expect(screen.getByText('révélations 0/2')).toBeInTheDocument();
    expect(screen.getByText('emplacements 0/5')).toBeInTheDocument();
    expect(useGameStore.getState().dialog).toBeNull();
    await user.click(button);
    expect(useGameStore.getState().dialog).toBeNull();
    expect(useGameStore.getState().game?.phase).toBe('investigation');
  });

  it('ouvre la table ronde quand elle est possible, puis propose de la reprendre', async () => {
    const user = userEvent.setup();
    act(() => {
      const store = useGameStore.getState();
      store.dispatch(confront('malik', 's_malik_initial', 'e_camera_gap', 'empathetic'));
      store.dispatch(confront('jo', 's_jo_initial', 'e_camera_gap', 'neutral'));
      store.dispatch(claim('cash_origin', 'h_counting_error'));
      store.dispatch(claim('video_outage', 'h_scheduled_reboot'));
      store.dispatch(claim('receipt_path', 'h_no_receipt'));
      store.dispatch(claim('noise_source', 'h_freezer_alarm'));
      store.dispatch(claim('manager_knowledge', 'h_ana_unaware'));
    });
    renderBoard();
    const button = screen.getByRole('button', { name: 'Demander la table ronde' });
    expect(button).toBeEnabled();
    await user.click(button);
    const store = useGameStore.getState();
    expect(store.game?.phase).toBe('round-table');
    expect(store.dialog).toBe('round-table');
    expect(store.liveMessage).toMatch(/Table ronde ouverte/);

    act(() => {
      useGameStore.getState().closeDialog();
    });
    await user.click(screen.getByRole('button', { name: 'Reprendre la table ronde' }));
    expect(useGameStore.getState().dialog).toBe('round-table');
  });

  it('respecte le mouvement réduit : aucune classe d’animation', () => {
    useGameStore.getState().setPref('reducedMotion', 'on');
    renderBoard();
    act(() => {
      useGameStore.getState().dispatch(claim('cash_origin', 'h_malik_theft'));
    });
    const c = card('cash_origin');
    expect(c.getAttribute('data-status')).toBe('impossible');
    expect(c.classList.contains('anim-crack')).toBe(false);
    expect(c.classList.contains('anim-propagate')).toBe(false);
  });
});
