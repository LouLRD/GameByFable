// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimSlotId, HypothesisId } from '@/domain/model/ids';
import { useGameStore } from '@/state';
import { firstClaimAction, resetStore, stubViewport } from '@/app/testing';
import { SavesDialog } from './SavesDialog';

vi.setConfig({ testTimeout: 30_000 });

function dispatchFirstClaim(): void {
  const a = firstClaimAction();
  const r = useGameStore.getState().dispatch({ type: 'set-claim', slotId: a.slotId as ClaimSlotId, hypothesisId: a.hypothesisId as HypothesisId });
  expect(r.ok).toBe(true);
}

function openSaves(): HTMLElement {
  useGameStore.getState().openDialog('saves');
  render(<SavesDialog />);
  return screen.getByRole('dialog', { name: 'Sauvegardes' });
}

describe('<SavesDialog />', () => {
  beforeEach(() => {
    stubViewport(1280);
    resetStore();
  });
  afterEach(cleanup);

  it('sauvegarder dans un emplacement puis le lister (libellé, date, actions)', async () => {
    const user = userEvent.setup();
    dispatchFirstClaim();
    const dialog = openSaves();
    expect(within(dialog).getAllByText('Vide.')).toHaveLength(3);
    expect(within(dialog).getByRole('button', { name: 'Sauvegarder ici (Sauvegarde automatique)' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Libellé de la sauvegarde'), 'Avant la table ronde');
    await user.click(within(dialog).getByRole('button', { name: 'Sauvegarder ici (Emplacement 1)' }));
    expect(within(dialog).getByRole('status')).toHaveTextContent('Partie sauvegardée.');
    const slot = within(dialog).getByRole('heading', { name: 'Emplacement 1' }).closest('li');
    expect(slot).not.toBeNull();
    expect(slot).toHaveTextContent('Avant la table ronde');
    expect(slot).toHaveTextContent(/1 action/);
    expect(slot?.querySelector('time')).not.toBeNull();
    expect(within(dialog).getAllByText('Vide.')).toHaveLength(2);
    const summary = useGameStore.getState().listSlots().find((s) => s.slotId === 'slot-1');
    expect(summary?.empty).toBe(false);
    expect(summary?.label).toBe('Avant la table ronde');
    expect(summary?.actionCount).toBe(1);
  });

  it('importer un JSON invalide affiche un refus (role="alert") et laisse la partie inchangée', async () => {
    const user = userEvent.setup();
    dispatchFirstClaim();
    const before = useGameStore.getState().game;
    const dialog = openSaves();
    await user.type(within(dialog).getByLabelText('Ou coller le JSON'), '{{"kind":"bidon"}');
    await user.click(within(dialog).getByRole('button', { name: 'Importer le texte' }));
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent(/Import refusé/);
    expect(alert).toHaveTextContent(/La partie en cours est conservée/);
    expect(useGameStore.getState().game).toBe(before);
    expect(useGameStore.getState().actions).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Sauvegardes' })).toBeInTheDocument();
  });

  it('charger demande confirmation quand la progression n’est pas exportée, puis restaure', async () => {
    const user = userEvent.setup();
    dispatchFirstClaim();
    const dialog = openSaves();
    await user.click(within(dialog).getByRole('button', { name: 'Sauvegarder ici (Emplacement 2)' }));
    // Nouvelle action non exportée après la sauvegarde.
    useGameStore.getState().dispatch({ type: 'dismiss-onboarding', onboardingId: 'o1' as never });
    expect(useGameStore.getState().actions).toHaveLength(2);
    await user.click(within(dialog).getByRole('button', { name: 'Charger (Emplacement 2)' }));
    const confirm = within(dialog).getByRole('group', { name: 'Confirmation — Emplacement 2' });
    expect(confirm).toHaveTextContent(/remplacera la progression en cours/);
    expect(useGameStore.getState().actions).toHaveLength(2);
    await user.click(within(confirm).getByRole('button', { name: 'Confirmer le chargement' }));
    expect(useGameStore.getState().actions).toHaveLength(1);
    expect(useGameStore.getState().restoredFrom).toBe('slot');
    expect(useGameStore.getState().dialog).toBeNull();
    expect(useGameStore.getState().toasts.at(-1)?.text).toMatch(/Partie restaurée/);
  });

  it('effacer demande confirmation ; exporter notifie le nom du fichier', async () => {
    const user = userEvent.setup();
    dispatchFirstClaim();
    const dialog = openSaves();
    await user.click(within(dialog).getByRole('button', { name: 'Sauvegarder ici (Emplacement 3)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Effacer (Emplacement 3)' }));
    expect(useGameStore.getState().listSlots().find((s) => s.slotId === 'slot-3')?.empty).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer l’effacement' }));
    expect(useGameStore.getState().listSlots().find((s) => s.slotId === 'slot-3')?.empty).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Charger (Emplacement 3)' })).toBeDisabled();

    expect(useGameStore.getState().unsavedSinceExport).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Exporter (JSON)' }));
    const toast = useGameStore.getState().toasts.at(-1);
    expect(toast?.tone).toBe('success');
    expect(toast?.text).toMatch(/Sauvegarde exportée : la-veilleuse-300_\d{4}-\d{2}-\d{2}_\d{2}h\d{2}\.json/);
    expect(useGameStore.getState().unsavedSinceExport).toBe(false);
  });

  it('signale un stockage local indisponible', () => {
    useGameStore.setState({ storageAvailable: false });
    const dialog = openSaves();
    expect(within(dialog).getByRole('note')).toHaveTextContent(/stockage local est indisponible/);
  });
});
