// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { resetStore, stubViewport } from '@/app/testing';
import { useGameStore } from '@/state';

describe('<MobileShell /> — terminal d’enquête tenu en main (390 px)', () => {
  beforeEach(() => {
    stubViewport(390);
    resetStore();
  });
  afterEach(cleanup);

  it('rend la coquille mobile : en-tête compact, un seul espace monté, navigation à quatre onglets', () => {
    render(<App />);
    expect(screen.getByTestId('mobile-shell')).toBeInTheDocument();
    expect(screen.queryByText('LA VERSION ACCEPTABLE')).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Espaces de travail' });
    expect(within(nav).getAllByRole('button')).toHaveLength(4);
    expect(within(nav).getByRole('button', { name: /^Dossier/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // un seul espace est monté
    expect(screen.getByRole('region', { name: 'Espace Dossier' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Espace Plan' })).not.toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Pression' })).toHaveAttribute('aria-valuenow', '4');
  });

  it('la navigation change d’espace, annonce le changement et conserve la sélection', async () => {
    const user = userEvent.setup();
    render(<App />);
    useGameStore.getState().select('evidence', 'e_camera_gap');
    const nav = screen.getByRole('navigation', { name: 'Espaces de travail' });
    await user.click(within(nav).getByRole('button', { name: /^Plan/ }));
    expect(useGameStore.getState().activeSpace).toBe('map');
    expect(screen.getByRole('region', { name: 'Espace Plan' })).toBeInTheDocument();
    expect(useGameStore.getState().liveMessage).toMatch(/Espace Plan/);
    expect(useGameStore.getState().selection?.id).toBe('e_camera_gap');
    await user.click(within(nav).getByRole('button', { name: /^Version/ }));
    expect(screen.getByRole('tab', { name: 'Version' })).toHaveAttribute('aria-selected', 'true');
  });

  it('l’horloge de l’en-tête ouvre l’espace Temps ; le bandeau temporel du Plan déplace le curseur unique', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Heure simulée 20:49:00/ }));
    expect(useGameStore.getState().activeSpace).toBe('timeline');
    act(() => useGameStore.getState().setActiveSpace('map'));
    const strip = screen.getByRole('group', { name: 'Curseur temporel (plan)' });
    await user.click(within(strip).getByRole('button', { name: 'Avancer de 10 secondes' }));
    await user.click(within(strip).getByRole('button', { name: 'Avancer d’une seconde' }));
    expect(useGameStore.getState().cursor).toBe(11);
    expect(screen.getByRole('button', { name: /Heure simulée 20:49:11/ })).toBeInTheDocument();
    await user.click(within(strip).getByRole('button', { name: 'Lancer la relecture' }));
    expect(useGameStore.getState().playing).toBe(true);
    await user.click(within(strip).getByRole('button', { name: 'Mettre la relecture en pause' }));
    expect(useGameStore.getState().playing).toBe(false);
  });

  it('le menu est une feuille de fond qui ouvre sauvegardes, options et aide, puis rend le focus', async () => {
    const user = userEvent.setup();
    render(<App />);
    const menuBtn = screen.getByRole('button', { name: /^Menu/ });
    await user.click(menuBtn);
    const sheet = screen.getByRole('dialog', { name: 'La Version Acceptable' });
    expect(document.body.dataset.scrollLocked).toBe('true');
    await user.click(within(sheet).getByRole('button', { name: /^Sauvegardes/ }));
    expect(useGameStore.getState().dialog).toBe('saves');
    expect(screen.getByRole('dialog', { name: 'Sauvegardes' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(useGameStore.getState().dialog).toBeNull();
    expect(document.body.dataset.scrollLocked).toBeUndefined();
    await user.click(menuBtn);
    await user.click(screen.getByRole('button', { name: /^Aide/ }));
    expect(screen.getByRole('dialog', { name: /Aide/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(menuBtn);
  });

  it('le guide mobile est ancré au-dessus de la navigation : « Y aller » active l’espace visé, « Compris » journalise', async () => {
    const user = userEvent.setup();
    render(<App />);
    const strip = screen.getByTestId('guide-strip');
    expect(strip).toHaveTextContent(/Repère/);
    // l'étape 1 vise le dossier (espace courant) : pas de bouton « Y aller »
    expect(within(strip).queryByRole('button', { name: 'Y aller' })).toBeNull();
    await user.click(within(strip).getByRole('button', { name: 'Compris' }));
    expect(useGameStore.getState().game?.dismissedOnboardingIds).toEqual(['o1']);
    // l'étape suivante (o3, canevas) propose « Y aller » vers Version
    const next = screen.getByTestId('guide-strip');
    await user.click(within(next).getByRole('button', { name: 'Y aller' }));
    expect(useGameStore.getState().activeSpace).toBe('inspector');
    await user.click(screen.getByRole('button', { name: 'Tout passer' }));
    expect(screen.queryByTestId('guide-strip')).toBeNull();
    expect(useGameStore.getState().game?.dismissedOnboardingIds.length).toBe(5);
  });

  it('segments Version | Contradictions : flèches et badge de contradictions bloquantes', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => {
      useGameStore.getState().setActiveSpace('inspector');
      useGameStore.getState().dispatch({
        type: 'set-claim',
        slotId: 'video_outage' as never,
        hypothesisId: 'h_deliberate_unplug' as never,
        actorId: 'malik' as never,
      });
    });
    const contra = screen.getByRole('tab', { name: /Contradictions/ });
    expect(contra).toHaveTextContent(/1 contradiction bloquante/);
    screen.getByRole('tab', { name: 'Version' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(useGameStore.getState().inspectorTab).toBe('contradictions');
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      /Malik Bensaïd ne peut pas être à deux endroits/,
    );
  });

  it('au-delà de 1023 px, le bureau desktop est rendu (aucune régression)', () => {
    stubViewport(1440);
    resetStore();
    render(<App />);
    expect(screen.queryByTestId('mobile-shell')).toBeNull();
    expect(screen.getByRole('heading', { name: 'LA VERSION ACCEPTABLE' })).toBeInTheDocument();
  });
});
