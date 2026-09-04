// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { characterId, statementId } from '@/domain/model/ids';
import { useGameStore, type ConfrontationDraft, type GameStore } from '@/state';
import { ConfrontationDialog } from './ConfrontationDialog';

const DRAFT_MALIK: ConfrontationDraft = {
  characterId: 'malik',
  targetId: 's_malik_initial',
  supportId: 'e_camera_gap',
  approach: 'neutral',
};

function resetGame(): void {
  localStorage.clear();
  const store = useGameStore.getState();
  store.bootstrap();
  store.newGame();
}

function openWith(draft: Partial<ConfrontationDraft>): void {
  const store = useGameStore.getState();
  store.setConfrontationDraft({
    characterId: null,
    targetId: null,
    supportId: null,
    approach: 'neutral',
    ...draft,
  });
  store.openDialog('confrontation');
}

function statementText(id: string): string {
  const scenario = useGameStore.getState().scenario;
  return scenario?.index.statements.get(statementId(id))?.publicText ?? '';
}

function submitButton(name: 'Confronter' | 'Sonder'): HTMLButtonElement {
  const button = screen.getByRole('button', { name });
  expect(button).toBeInstanceOf(HTMLButtonElement);
  return button as HTMLButtonElement;
}

describe('<ConfrontationDialog />', () => {
  beforeEach(() => {
    resetGame();
  });

  afterEach(() => {
    // Restaure l'état initial (dont les actions d'origine si l'une a été remplacée).
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('affiche le coût et active « Confronter » pour un brouillon recevable (Malik + déclaration + journal vidéo)', () => {
    openWith(DRAFT_MALIK);
    render(<ConfrontationDialog />);

    expect(screen.getByRole('dialog', { name: 'Confrontation' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Malik Bensaïd/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Ana m'a donné une pochette/ })).toBeChecked();

    const support = screen.getByLabelText(/Pièce d’appui/);
    expect(support).toBeInstanceOf(HTMLSelectElement);
    expect((support as HTMLSelectElement).value).toBe('e_camera_gap');

    expect(screen.getByText(/Recevable/)).toBeInTheDocument();
    expect(screen.getByText(/Coût : 1 — disponible 4\/6/)).toBeInTheDocument();
    expect(submitButton('Confronter')).toBeEnabled();
  });

  it('confronte Malik avec l’approche empathique : réponse, précision, confiance et pression mises à jour', async () => {
    const user = userEvent.setup();
    openWith(DRAFT_MALIK);
    render(<ConfrontationDialog />);

    await user.click(screen.getByRole('radio', { name: /Empathique/ }));
    expect(useGameStore.getState().confrontationDraft.approach).toBe('empathetic');

    await user.click(submitButton('Confronter'));

    const game = useGameStore.getState().game;
    const record = game?.confrontationHistory.at(-1);
    expect(record?.approach).toBe('empathetic');
    expect(record?.characterId).toBe('malik');
    expect(record?.supportId).toBe('e_camera_gap');
    expect(game?.pressure).toBe(3);

    // Réponse sur ticket
    expect(screen.getByText(record?.responseText ?? '__absent__')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Réponse de Malik Bensaïd/ })).toBeInTheDocument();

    // Effets : confiance prudent → disponible (0 + 2), pression 4 → 3, précision listée
    const trustLine = screen.getByText(/^Confiance :/);
    expect(trustLine).toHaveTextContent(/prudent/);
    expect(trustLine).toHaveTextContent(/disponible/);
    expect(screen.getByText(/Pression : 4 → 3 sur 6/)).toBeInTheDocument();
    const clarified = statementText('s_malik_clarified');
    expect(clarified).not.toBe('');
    const statementLink = screen.getByRole('button', {
      name: new RegExp(clarified.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    });
    expect(statementLink).toBeInTheDocument();

    // Annotation manuscrite
    const note = document.querySelector('.hand-note');
    expect(note).not.toBeNull();
    expect(note).toHaveTextContent(/Malik/);

    // Annonce aria-live
    expect(useGameStore.getState().liveMessage).toMatch(/Malik Bensaïd répond/);
    expect(useGameStore.getState().liveMessage).toMatch(/1 précision/);

    // Un lien de précision ouvre la déclaration dans le dossier et ferme le dialogue
    await user.click(statementLink);
    expect(useGameStore.getState().selection).toEqual({ kind: 'statement', id: 's_malik_clarified' });
    expect(useGameStore.getState().dialog).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('signale une combinaison non recevable (Noé sans appui), désactive le bouton et note une impasse une seule fois', async () => {
    const user = userEvent.setup();
    const before = useGameStore.getState().impasseCount;
    openWith({ characterId: 'noe', targetId: 's_noe_initial', supportId: null });
    render(<ConfrontationDialog />);

    expect(screen.getByText(/Non recevable/)).toBeInTheDocument();
    expect(screen.getByText(/Sans pièce d’appui, Noé Rami maintient sa version/)).toBeInTheDocument();

    const button = submitButton('Confronter');
    expect(button).toBeDisabled();
    const describedBy = button.getAttribute('aria-describedby') ?? '';
    expect(describedBy).not.toBe('');
    expect(document.getElementById(describedBy)).toHaveTextContent(/Sans pièce d’appui/);

    // Une impasse pour cette combinaison, et une seule malgré les re-rendus
    expect(useGameStore.getState().impasseCount).toBe(before + 1);
    await user.click(screen.getByRole('radio', { name: /Directe/ }));
    expect(useGameStore.getState().impasseCount).toBe(before + 1);

    // Une autre combinaison invalide compte une nouvelle impasse…
    await user.selectOptions(screen.getByLabelText(/Pièce d’appui/), 'e_camera_gap');
    expect(screen.getByText(/Non recevable/)).toBeInTheDocument();
    expect(useGameStore.getState().impasseCount).toBe(before + 2);

    // …mais revenir à la première n'en compte pas une de plus.
    await user.selectOptions(screen.getByLabelText(/Pièce d’appui/), '');
    expect(useGameStore.getState().impasseCount).toBe(before + 2);
  });

  it('indique qu’un protagoniste a déjà répondu sur un point résolu', () => {
    const first = useGameStore.getState().dispatch({
      type: 'confront',
      characterId: characterId('malik'),
      targetId: 's_malik_initial',
      supportId: 'e_camera_gap',
      approach: 'neutral',
    });
    expect(first.ok).toBe(true);

    openWith(DRAFT_MALIK);
    render(<ConfrontationDialog />);

    expect(screen.getByText(/Non recevable/)).toBeInTheDocument();
    expect(screen.getByText(/Malik Bensaïd a déjà répondu sur ce point/)).toBeInTheDocument();
    expect(submitButton('Confronter')).toBeDisabled();
  });

  it('sonde Malik avec « Vol par Malik » : la réaction s’affiche sans consommer de pression', async () => {
    const user = userEvent.setup();
    openWith({ characterId: 'malik' });
    render(<ConfrontationDialog />);

    // Sans cible : à compléter
    expect(screen.getByText(/À compléter/)).toBeInTheDocument();
    expect(submitButton('Confronter')).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: /^Hypothèse/ }));
    const hypothesisSelect = screen.getByLabelText('Hypothèse à sonder');
    expect(screen.getByLabelText(/Pièce d’appui/)).toBeDisabled();
    expect(submitButton('Sonder')).toBeDisabled();

    await user.selectOptions(hypothesisSelect, 'h_malik_theft');
    expect(useGameStore.getState().confrontationDraft.targetId).toBe('h_malik_theft');
    expect(screen.getByText(/Sondage/)).toBeInTheDocument();
    expect(screen.getByText(/Vol par Malik/, { selector: 'p *' })).toBeInTheDocument();
    expect(submitButton('Sonder')).toBeEnabled();

    await user.click(submitButton('Sonder'));

    const game = useGameStore.getState().game;
    const probe = game?.probeHistory.at(-1);
    expect(probe?.targetId).toBe('h_malik_theft');
    expect(probe?.characterId).toBe('malik');
    expect(game?.pressure).toBe(4);
    expect(game?.confrontationHistory).toHaveLength(0);

    expect(screen.getByRole('heading', { name: /Réaction de Malik Bensaïd/ })).toBeInTheDocument();
    expect(screen.getByText(probe?.text ?? '__absent__')).toBeInTheDocument();
    expect(screen.getByText(/un sondage ne consomme rien/)).toBeInTheDocument();
    expect(useGameStore.getState().liveMessage).toMatch(/réagit au sondage/);
  });

  it('changer de protagoniste réinitialise une cible qui ne lui appartient pas et conserve la pièce d’appui', async () => {
    const user = userEvent.setup();
    openWith(DRAFT_MALIK);
    render(<ConfrontationDialog />);

    await user.click(screen.getByRole('radio', { name: /Ana Sorel/ }));
    expect(useGameStore.getState().confrontationDraft).toEqual({
      characterId: 'ana',
      targetId: null,
      supportId: 'e_camera_gap',
      approach: 'neutral',
    });
    expect(screen.getByText(/Choisissez une déclaration de Ana Sorel/)).toBeInTheDocument();
    expect(submitButton('Confronter')).toBeDisabled();

    const anaStatement = screen.getByRole('radio', { name: /Je n'ai rien fait d'inhabituel/ });
    expect(anaStatement).not.toBeChecked();
    await user.click(anaStatement);
    expect(useGameStore.getState().confrontationDraft.targetId).toBe('s_ana_initial');

    // Le rapport de caisse rend la confrontation d'Ana recevable.
    await user.selectOptions(screen.getByLabelText(/Pièce d’appui/), 'e_till_report');
    expect(screen.getByText(/Coût : 1 — disponible 4\/6/)).toBeInTheDocument();
    expect(submitButton('Confronter')).toBeEnabled();
  });

  it('présente une erreur du moteur comme une alerte informative et conserve le formulaire', async () => {
    const user = userEvent.setup();
    const failing: GameStore['dispatch'] = () => ({
      ok: false,
      error: { code: 'sealed', message: 'Erreur simulée du moteur.' },
      state: null,
    });
    useGameStore.setState({ dispatch: failing });
    openWith(DRAFT_MALIK);
    render(<ConfrontationDialog />);

    await user.click(submitButton('Confronter'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Action refusée par le moteur/);
    expect(alert).toHaveTextContent(/Erreur simulée du moteur\./);
    expect(submitButton('Confronter')).toBeEnabled();
    expect(screen.queryByRole('heading', { name: /Réponse de/ })).not.toBeInTheDocument();
    expect(useGameStore.getState().game?.pressure).toBe(4);
  });

  it('ferme sans vider le brouillon ; « Autre confrontation » conserve le protagoniste et vide le reste', async () => {
    const user = userEvent.setup();
    openWith(DRAFT_MALIK);
    render(<ConfrontationDialog />);

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useGameStore.getState().confrontationDraft).toEqual(DRAFT_MALIK);

    useGameStore.getState().openDialog('confrontation');
    await user.click(submitButton('Confronter'));
    expect(screen.getByRole('heading', { name: /Réponse de Malik Bensaïd/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Autre confrontation' }));
    expect(useGameStore.getState().confrontationDraft).toEqual({
      characterId: 'malik',
      targetId: null,
      supportId: null,
      approach: 'neutral',
    });
    expect(screen.getByRole('radio', { name: /Malik Bensaïd/ })).toBeChecked();
    expect(screen.getByText(/À compléter/)).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Cible/)).toHaveFocus();
  });

  it('les approches se choisissent au clavier et les cartes exposent leur rappel', async () => {
    const user = userEvent.setup();
    openWith(DRAFT_MALIK);
    render(<ConfrontationDialog />);

    expect(screen.getByText(/Directe : peut fermer la personne/)).toBeInTheDocument();
    const direct = screen.getByRole('radio', { name: /Directe/ });
    direct.focus();
    await user.keyboard(' ');
    expect(direct).toBeChecked();
    expect(useGameStore.getState().confrontationDraft.approach).toBe('direct');

    // Le curseur de pression est visible et libellé.
    expect(screen.getByLabelText('Pression disponible : 4 sur 6')).toBeInTheDocument();
  });
});
