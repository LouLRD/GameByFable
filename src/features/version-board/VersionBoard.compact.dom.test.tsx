// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStore, stubViewport } from '@/app/testing';
import { claim, confront, PROCEDURAL_CLAIMS } from '@/test/helpers';
import { useGameStore } from '@/state';
import { VersionBoard } from './VersionBoard';

function card(slotId: string): HTMLElement {
  const el = document.getElementById(`slot-card-${slotId}`);
  if (!el) throw new Error(`Carte ${slotId} absente`);
  return el;
}

function fillVersion(): void {
  act(() => {
    const store = useGameStore.getState();
    store.dispatch(confront('malik', 's_malik_initial', 'e_camera_gap', 'empathetic'));
    store.dispatch(confront('jo', 's_jo_initial', 'e_camera_gap', 'neutral'));
    for (const action of PROCEDURAL_CLAIMS) store.dispatch(action);
  });
}

beforeEach(() => {
  resetStore();
  stubViewport(390);
});

afterEach(() => {
  cleanup();
});

describe('<VersionBoard compact />', () => {
  it('en-tête compact : titre masqué mais présent, statut sur une ligne « Version incomplète — 0/5 »', () => {
    render(<VersionBoard compact />);
    const region = screen.getByRole('region', { name: 'Version proposée' });
    expect(region.getAttribute('data-compact')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Version proposée' })).toHaveClass(
      'visually-hidden',
    );
    const status = region.querySelector('.vb-status');
    expect(status?.textContent?.replace(/\s+/g, ' ')).toMatch(/Version incomplète — 0\/5/);
    expect(status?.getAttribute('data-status')).toBe('incomplete');
    expect(screen.getByText('Version incomplète')).toBeInTheDocument();
    expect(screen.queryByText('0/5 emplacements remplis')).not.toBeInTheDocument();
  });

  it('replie les trois axes sous « Cohérence · Dévoilement · Adhésion » tant que la version est incomplète, puis les déplie', async () => {
    const user = userEvent.setup();
    render(<VersionBoard compact />);
    const fold = screen.getByRole('button', { name: 'Cohérence · Dévoilement · Adhésion' });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('group', { name: 'Trois axes d’évaluation' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Évaluation' })).not.toBeInTheDocument();

    await user.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(fold).toHaveAttribute('aria-controls');
    const axes = screen.getByRole('group', { name: 'Trois axes d’évaluation' });
    expect(within(axes).getByRole('heading', { name: 'Cohérence' })).toBeInTheDocument();
    expect(within(axes).getByRole('heading', { name: 'Dévoilement' })).toBeInTheDocument();
    expect(within(axes).getByRole('heading', { name: 'Adhésion' })).toBeInTheDocument();

    await user.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('group', { name: 'Trois axes d’évaluation' }),
    ).not.toBeInTheDocument();
  });

  it('ouvre les axes par défaut quand les cinq emplacements sont remplis', () => {
    fillVersion();
    render(<VersionBoard compact />);
    expect(
      screen.getByRole('button', { name: 'Cohérence · Dévoilement · Adhésion' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Trois axes d’évaluation' })).toBeInTheDocument();
    expect(
      screen.getByText(/Version (cohérente|non étayée|contestée|impossible)/),
    ).toHaveTextContent(/Version/);
    expect(document.querySelector('.vb-status')?.textContent).toMatch(/5\/5/);
  });

  it('replie « Pièces jointes au rapport (n/m) » par défaut et montre les cases une fois déplié', async () => {
    const user = userEvent.setup();
    render(<VersionBoard compact />);
    const fold = screen.getByRole('button', { name: /^Pièces jointes au rapport \(\d+\/\d+\)$/ });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    await user.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
    expect(screen.getByRole('checkbox', { name: /Rapport de caisse/ })).toBeDisabled();
  });

  it('place « Demander la table ronde » dans une barre collante, désactivé avec le message et les compteurs visibles', async () => {
    const user = userEvent.setup();
    render(<VersionBoard compact />);
    const bar = document.querySelector<HTMLElement>('.vb-round-table');
    if (!bar) throw new Error('Barre de table ronde absente');
    expect(bar).toHaveClass('vb-round-table-compact');
    expect(screen.getByRole('heading', { name: 'Table ronde' })).toHaveClass('visually-hidden');
    const button = within(bar).getByRole('button', { name: 'Demander la table ronde' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('vb-btn-block');
    expect(button).toHaveAccessibleDescription(
      /tous les emplacements de la version doivent être remplis/,
    );
    expect(
      within(bar).getByText(/tous les emplacements de la version doivent être remplis/),
    ).toBeVisible();
    expect(within(bar).getByText('emplacements 0/5')).toBeInTheDocument();
    expect(within(bar).getByText('révélations 0/2')).toBeInTheDocument();
    await user.click(button);
    expect(useGameStore.getState().dialog).toBeNull();

    cleanup();
    fillVersion();
    render(<VersionBoard compact />);
    const enabled = screen.getByRole('button', { name: 'Demander la table ronde' });
    expect(enabled).toBeEnabled();
    expect(screen.queryByText(/tous les emplacements/)).not.toBeInTheDocument();
    await user.click(enabled);
    expect(useGameStore.getState().game?.phase).toBe('round-table');
    expect(useGameStore.getState().dialog).toBe('round-table');
    act(() => {
      useGameStore.getState().closeDialog();
    });
    expect(screen.getByRole('button', { name: 'Reprendre la table ronde' })).toHaveClass(
      'vb-btn-block',
    );
  });

  it('cartes compactes : « Choisir » pleine largeur si vide, sinon paramètres sur une ligne et Modifier / Retirer', async () => {
    const user = userEvent.setup();
    act(() => {
      useGameStore.getState().dispatch(claim('cash_origin', 'h_malik_theft'));
    });
    render(<VersionBoard compact />);
    const filled = card('cash_origin');
    expect(filled.getAttribute('data-compact')).toBe('true');
    expect(within(filled).getByText('Vol par Malik')).toBeInTheDocument();
    expect(within(filled).getByText('impossible')).toBeInTheDocument();
    const line = filled.querySelector('.slot-card-params-line');
    expect(line?.textContent).toContain('Malik · Rayon 1 · 20:54:20 → 20:55:10');
    expect(filled.querySelector('.slot-card-summary')).toBeNull();
    expect(filled.querySelector('dl')).toBeNull();
    expect(
      within(filled).getByRole('button', {
        name: "Modifier l’hypothèse de « Origine de l'écart »",
      }),
    ).toBeInTheDocument();
    expect(
      within(filled).getByRole('button', { name: "Retirer l’hypothèse de « Origine de l'écart »" }),
    ).toBeInTheDocument();

    const empty = card('video_outage');
    const choose = within(empty).getByRole('button', { name: /^Choisir une hypothèse pour/ });
    expect(choose).toHaveClass('vb-btn-block');
    await user.click(choose);
    expect(useGameStore.getState().dialog).toBe('claim-form');
    expect(useGameStore.getState().claimForm?.slotId).toBe('video_outage');
  });

  it('sans la prop, le bureau garde son en-tête, ses sections dépliées et sa table ronde en bloc', () => {
    stubViewport(1280);
    render(<VersionBoard />);
    const region = screen.getByRole('region', { name: 'Version proposée' });
    expect(region.hasAttribute('data-compact')).toBe(false);
    expect(screen.getByRole('heading', { name: 'Version proposée' })).toHaveClass('vb-title');
    expect(screen.getByRole('heading', { name: 'Évaluation' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Trois axes d’évaluation' })).toBeInTheDocument();
    expect(screen.getByText('0/5 emplacements remplis')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
    expect(document.querySelector('.vb-fold')).toBeNull();
    expect(document.querySelector('.vb-round-table-compact')).toBeNull();
  });
});
