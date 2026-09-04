// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/state';
import type { ClaimSlotId, HypothesisId } from '@/domain/model/ids';
import { App } from './App';
import { firstClaimAction, resetStore, stubViewport } from './testing';

// Le bureau complet (quatre panneaux métier) est lourd sous jsdom : marge confortable.
vi.setConfig({ testTimeout: 30_000 });

function topbarClock(): string | null {
  return document.querySelector('.topbar-clock time')?.textContent ?? null;
}

function dispatchFirstClaim(): void {
  const a = firstClaimAction();
  const r = useGameStore.getState().dispatch({
    type: 'set-claim',
    slotId: a.slotId as ClaimSlotId,
    hypothesisId: a.hypothesisId as HypothesisId,
  });
  expect(r.ok).toBe(true);
}

describe('<App /> — coquille du bureau', () => {
  beforeEach(() => {
    stubViewport(1280);
    resetStore();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('rend le bureau après bootstrap : titre, quatre espaces, horloge et pression', () => {
    useGameStore.setState({ scenario: null, game: null, loadIssues: null });
    render(<App />);
    expect(useGameStore.getState().scenario).not.toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'LA VERSION ACCEPTABLE' }),
    ).toBeInTheDocument();
    const spaces = document.querySelectorAll('main.workbench > .space[data-space]');
    expect(
      Array.from(spaces)
        .map((s) => s.getAttribute('data-space'))
        .sort(),
    ).toEqual(['casefile', 'inspector', 'map', 'timeline']);
    spaces.forEach((s) => expect(s).toHaveAttribute('data-active', 'true'));
    expect(topbarClock()).toBe('20:49:00');
    const meter = document.querySelector('[role="meter"]');
    expect(meter).toHaveAttribute('aria-valuenow', String(useGameStore.getState().game?.pressure));
    expect(meter).toHaveTextContent(/Pression \d\/6/);
    expect(document.querySelector('.topbar-act')).toHaveTextContent('Acte I — Les traces');
    expect(screen.getByRole('link', { name: 'Aller au dossier' })).toHaveAttribute(
      'href',
      '#space-casefile',
    );
  });

  it('en mobile (≤ 1023 px), la barre d’espaces change l’espace actif', async () => {
    stubViewport(390);
    const user = userEvent.setup();
    render(<App />);
    expect(document.querySelector('.space[data-space="casefile"]')).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(document.querySelector('.space[data-space="inspector"]')).toHaveAttribute(
      'data-active',
      'false',
    );
    const nav = screen.getByRole('navigation', { name: 'Espaces de travail' });
    await user.click(within(nav).getByRole('button', { name: /^Version/ }));
    expect(useGameStore.getState().activeSpace).toBe('inspector');
    expect(document.querySelector('.space[data-space="inspector"]')).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(document.querySelector('.space[data-space="casefile"]')).toHaveAttribute(
      'data-active',
      'false',
    );
    expect(within(nav).getByRole('button', { name: /^Version/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Pas de bouton « Agrandir » sur petit écran ; les commandes sont derrière « Menu ».
    expect(screen.queryByRole('button', { name: /Agrandir/ })).toBeNull();
    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(screen.queryByRole('button', { name: 'Options' })).toBeNull();
    await user.click(menu);
    expect(screen.getByRole('button', { name: 'Options' })).toBeVisible();
  });

  it('raccourcis : → et Maj+→ déplacent le curseur, Fin va au bout, ? ouvre l’aide, inactifs dialogue ouvert', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{ArrowRight}');
    expect(useGameStore.getState().cursor).toBe(1);
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(useGameStore.getState().cursor).toBe(11);
    await user.keyboard('{End}');
    expect(useGameStore.getState().cursor).toBe(1560);
    expect(topbarClock()).toBe('21:15:00');
    await user.keyboard(' ');
    expect(useGameStore.getState().playing).toBe(true);
    await user.keyboard('2');
    expect(useGameStore.getState().activeSpace).toBe('timeline');
    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Aide' })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(useGameStore.getState().cursor).toBe(1560);
  });

  it('Options : la taille de texte et le mouvement réduit se reflètent sur <html>', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(document.documentElement.dataset.textSize).toBe('m');
    await user.click(screen.getByRole('button', { name: 'Options' }));
    const dialog = screen.getByRole('dialog', { name: 'Options' });
    await user.click(within(dialog).getByLabelText(/Grande/));
    expect(useGameStore.getState().prefs.textSize).toBe('l');
    expect(document.documentElement.dataset.textSize).toBe('l');
    expect(document.documentElement.dataset.reducedMotion).toBeUndefined();
    await user.click(within(dialog).getByLabelText(/^Activé/));
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
    await user.click(within(dialog).getByLabelText(/Aide progressive/));
    expect(useGameStore.getState().prefs.hintsEnabled).toBe(false);
    expect(within(dialog).getByLabelText(/Son d’ambiance/)).toBeDisabled();
  });

  it('mode focus : « Agrandir » cible un espace, Échap le quitte ; la poignée se règle au clavier', async () => {
    const user = userEvent.setup();
    render(<App />);
    const workbench = document.querySelector<HTMLElement>('main.workbench');
    expect(workbench).not.toHaveAttribute('data-focus');
    await user.click(screen.getByRole('button', { name: 'Agrandir l’espace Plan' }));
    expect(useGameStore.getState().focusPanel).toBe('map');
    expect(workbench).toHaveAttribute('data-focus', 'map');
    expect(screen.getByRole('button', { name: 'Réduire l’espace Plan' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.keyboard('{Escape}');
    expect(useGameStore.getState().focusPanel).toBeNull();
    expect(workbench).not.toHaveAttribute('data-focus');

    const handle = screen.getByRole('slider', { name: 'Largeur du dossier' });
    expect(handle).toHaveAttribute('aria-valuenow', '320');
    handle.focus();
    await user.keyboard('{ArrowRight}');
    expect(handle).toHaveAttribute('aria-valuenow', '336');
    expect(workbench?.style.getPropertyValue('--casefile-width')).toBe('336px');
    await user.keyboard('{Home}');
    expect(handle).toHaveAttribute('aria-valuenow', '240');
    // Le curseur temporel n'a pas bougé : les flèches appartenaient à la poignée.
    expect(useGameStore.getState().cursor).toBe(0);
  });

  it('onglets Version | Contradictions de l’espace Version', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tablist = screen.getByRole('tablist', { name: 'Contenu de l’espace Version' });
    const versionTab = within(tablist).getByRole('tab', { name: 'Version' });
    const contradictionsTab = within(tablist).getByRole('tab', { name: /^Contradictions/ });
    expect(versionTab).toHaveAttribute('aria-selected', 'true');
    await user.click(contradictionsTab);
    expect(useGameStore.getState().inspectorTab).toBe('contradictions');
    expect(contradictionsTab).toHaveAttribute('aria-selected', 'true');
    const panel = document.getElementById(contradictionsTab.getAttribute('aria-controls') ?? '');
    expect(panel).toHaveAttribute('role', 'tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', contradictionsTab.id);
    contradictionsTab.focus();
    await user.keyboard('{ArrowLeft}');
    expect(useGameStore.getState().inspectorTab).toBe('version');
    expect(document.activeElement).toBe(versionTab);
  });

  it('Nouvelle partie : confirmation si progression non exportée, démarrage direct sinon', async () => {
    const user = userEvent.setup();
    dispatchFirstClaim();
    expect(useGameStore.getState().actions).toHaveLength(1);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Nouvelle partie' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle partie' });
    expect(dialog).toHaveTextContent(/progression non exportée/);
    expect(useGameStore.getState().actions).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useGameStore.getState().actions).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Nouvelle partie' }));
    await user.click(screen.getByRole('button', { name: 'Commencer une nouvelle partie' }));
    expect(useGameStore.getState().actions).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Sans progression : démarre directement, sans dialogue.
    const nonce = useGameStore.getState().actionNonce;
    await user.click(screen.getByRole('button', { name: 'Nouvelle partie' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useGameStore.getState().actionNonce).toBe(nonce + 1);
    expect(useGameStore.getState().liveMessage).toMatch(/Nouvelle partie/);
  });

  it('notifications : les erreurs persistent, les autres disparaissent après 6 s, toutes se ferment', () => {
    vi.useFakeTimers();
    render(<App />);
    act(() => {
      useGameStore.getState().pushToast('Sauvegarde exportée : x.json', 'success');
      useGameStore.getState().pushToast('Import refusé : fichier illisible', 'error');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Import refusé');
    expect(screen.getByText('Sauvegarde exportée : x.json')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6100);
    });
    expect(screen.queryByText('Sauvegarde exportée : x.json')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Import refusé');
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la notification' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(useGameStore.getState().toasts).toHaveLength(0);
  });

  it('la région aria-live reflète les annonces du store', () => {
    render(<App />);
    act(() => useGameStore.getState().announce('Hypothèse posée.'));
    expect(screen.getByTestId('live-region')).toHaveTextContent('Hypothèse posée.');
  });

  it('écran d’erreur de scénario : diagnostic listé en développement, jamais présenté comme le jeu', () => {
    useGameStore.setState({
      scenario: null,
      game: null,
      loadIssues: [
        {
          severity: 'error',
          code: 'schema',
          path: 'scenario.zones.0.polygon',
          message: 'Polygone invalide',
        },
      ],
    });
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Le dossier ne peut pas être ouvert' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ceci n’est pas une réponse du jeu/)).toBeInTheDocument();
    expect(screen.getByText('scenario.zones.0.polygon')).toBeInTheDocument();
    expect(screen.getByText('Polygone invalide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recharger la page' })).toBeInTheDocument();
    expect(document.querySelector('.workbench')).toBeNull();
  });

  it('carte de bienvenue à la première partie, fermée par « Ouvrir le dossier »', async () => {
    const user = userEvent.setup();
    useGameStore.setState((s) => ({ prefs: { ...s.prefs, seenIntro: false } }));
    render(<App />);
    const heading = screen.getByRole('heading', { name: 'Bienvenue dans le dossier' });
    const card = heading.closest('section');
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent(/écart de 300 €/);
    expect(card?.querySelector('.intro-premise')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Ouvrir le dossier' }));
    expect(useGameStore.getState().prefs.seenIntro).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Bienvenue dans le dossier' })).toBeNull();
  });
});
