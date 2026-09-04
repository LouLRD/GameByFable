// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStore, stubViewport } from '@/app/testing';
import { useGameStore } from '@/state';
import { MapPanel } from './MapPanel';

function setupCompact(): void {
  stubViewport(390);
  resetStore();
  useGameStore.setState({ activeSpace: 'map' });
  useGameStore.getState().setPref('reducedMotion', 'off');
}

function zoneButton(label: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^Zone ${label},`) });
}

function layerTransform(): string {
  return screen.getByTestId('map-viewport-layer').style.transform;
}

function viewportScale(): number {
  const viewport = screen.getByTestId('map-viewport-stage').parentElement;
  if (!viewport) throw new Error('Fenêtre du plan introuvable');
  return Number(viewport.getAttribute('data-scale'));
}

/** jsdom ne mesure rien : on donne à la fenêtre du plan une taille de 390 × 390 px. */
function mockStageRect(size = 390): void {
  const stage = screen.getByTestId('map-viewport-stage');
  stage.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: size,
    bottom: size,
    width: size,
    height: size,
    toJSON: () => ({}),
  });
}

interface TouchInit {
  pointerId: number;
  pointerType: 'touch';
  isPrimary: boolean;
  clientX: number;
  clientY: number;
  button: number;
  buttons: number;
}

function touch(id: number, x: number, y: number): TouchInit {
  return {
    pointerId: id,
    pointerType: 'touch',
    isPrimary: id === 1,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: 1,
  };
}

/** Tap bref et immobile : pointerdown → pointerup → click, comme un navigateur tactile. */
function tap(el: HTMLElement, x: number, y: number): void {
  fireEvent.pointerDown(el, touch(1, x, y));
  fireEvent.pointerUp(el, touch(1, x, y));
  fireEvent.click(el, { clientX: x, clientY: y });
}

function pan(el: HTMLElement, from: [number, number], to: [number, number]): void {
  fireEvent.pointerDown(el, touch(1, from[0], from[1]));
  const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  fireEvent.pointerMove(el, touch(1, mid[0], mid[1]));
  fireEvent.pointerMove(el, touch(1, to[0], to[1]));
  fireEvent.pointerUp(el, touch(1, to[0], to[1]));
  fireEvent.click(el, { clientX: to[0], clientY: to[1] });
}

describe('<MapPanel compact /> — coquille mobile (390 px)', () => {
  beforeEach(() => {
    setupCompact();
  });

  it('masque le grand en-tête (titre présent), pose les contrôles de zoom, la barre d’outils et le tray ; aucune fiche dans le flux', () => {
    render(<MapPanel compact />);
    const panel = screen.getByTestId('map-panel');
    expect(panel).toHaveAttribute('data-compact', 'true');
    const title = screen.getByRole('heading', { level: 2, name: 'Plan — La Veilleuse' });
    expect(title).toHaveClass('visually-hidden');
    expect(panel.querySelector('.panel-header')).toBeNull();

    const zoom = screen.getByRole('group', { name: 'Zoom du plan' });
    expect(within(zoom).getByRole('button', { name: 'Zoom avant' })).toBeInTheDocument();
    expect(within(zoom).getByRole('button', { name: 'Zoom arrière' })).toBeInTheDocument();
    expect(within(zoom).getByRole('button', { name: 'Recadrer' })).toBeInTheDocument();
    expect(screen.getByTestId('map-zoom-level')).toHaveTextContent('×1');

    expect(screen.getByRole('button', { name: 'Légende' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ouvrir la fiche (aucune sélection)' }),
    ).toBeDisabled();
    expect(screen.getByRole('group', { name: /Hors champ à cet instant/ })).toBeInTheDocument();
    expect(screen.getByText('20:49:00')).toBeInTheDocument();

    // La fiche n'est pas rendue sous le plan : pas de double défilement.
    expect(screen.queryByText('Sélectionnez une zone ou un jeton.')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Plan du magasin à 20:49:00' })).toHaveAttribute(
      'data-compact',
      'true',
    );
    // Les noms de zone étroits sont coupés sur deux lignes en compact.
    const coldAisle = zoneButton('Allée froide');
    expect(coldAisle.querySelector('.map-zone-name')).toHaveAttribute('data-lines', '2');
    expect(zoneButton('Caisses').querySelector('.map-zone-name')).toHaveAttribute(
      'data-lines',
      '1',
    );
  });

  it('un tap bref sur une zone la sélectionne et ouvre la fiche en feuille : bouton Fermer, Échap ; la sélection reste ; « Fiche » la rouvre', async () => {
    const user = userEvent.setup();
    render(<MapPanel compact />);

    tap(zoneButton('Caisses'), 100, 100);

    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'checkout' });
    const dialog = screen.getByRole('dialog', { name: 'Caisses' });
    expect(within(dialog).getByRole('list', { name: /^Passages \(4\)/ })).toBeInTheDocument();
    expect(within(dialog).getByText('→ Rayon 1')).toBeInTheDocument();
    // Le plan reste rendu derrière la feuille.
    expect(screen.getByRole('group', { name: /^Plan du magasin/ })).toBeInTheDocument();

    const close = within(dialog).getByRole('button', { name: 'Fermer la fenêtre' });
    expect(close).toBeVisible();
    await user.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Cohérence inter-espaces : la sélection du store n'est pas touchée par la fermeture.
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'checkout' });
    expect(zoneButton('Caisses')).toHaveAttribute('aria-pressed', 'true');

    // Le bouton « Fiche » de la barre d'outils rouvre la feuille de la sélection courante.
    const reopen = screen.getByRole('button', { name: 'Ouvrir la fiche — Caisses' });
    expect(reopen).toBeEnabled();
    await user.click(reopen);
    expect(screen.getByRole('dialog', { name: 'Caisses' })).toBeInTheDocument();

    // Échap ferme la feuille.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'checkout' });

    // Un nouveau tap sur la même zone rouvre la feuille.
    tap(zoneButton('Caisses'), 100, 100);
    expect(screen.getByRole('dialog', { name: 'Caisses' })).toBeInTheDocument();
  });

  it('naviguer dans la feuille (« Ouvrir la zone », « Sélectionner ») la fait suivre la sélection', async () => {
    const user = userEvent.setup();
    render(<MapPanel compact />);
    act(() => useGameStore.getState().setCursor(100));

    tap(zoneButton('Caisses'), 100, 100);
    await user.click(screen.getByRole('button', { name: 'Ouvrir la zone Rayon 1' }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'aisle_one' });
    expect(screen.getByRole('dialog', { name: 'Rayon 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ouvrir la zone Caisses' }));
    await user.click(screen.getByRole('button', { name: 'Sélectionner Ana Sorel' }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'character', id: 'ana' });
    const sheet = screen.getByRole('dialog', { name: 'Ana Sorel' });
    // La fiche d'une personne positionnée décrit sa zone et ses lignes de vue.
    expect(within(sheet).getByRole('list', { name: /^Passages \(4\)/ })).toBeInTheDocument();
    expect(
      within(sheet).getByRole('list', { name: 'Lignes de vue — Ana Sorel' }),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Sélectionner Ana Sorel' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('une personne hors champ choisie dans le tray ouvre une feuille à son nom, position inconnue', async () => {
    const user = userEvent.setup();
    render(<MapPanel compact />);
    act(() => useGameStore.getState().setCursor(100));

    const tray = screen.getByRole('group', { name: /Hors champ à cet instant \(2\)/ });
    await user.click(within(tray).getByRole('button', { name: /Noé Rami/ }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'character', id: 'noe' });
    const sheet = screen.getByRole('dialog', { name: 'Noé Rami' });
    expect(within(sheet).getByText('Position inconnue à 20:50:40.')).toBeInTheDocument();
    expect(
      within(sheet).getByText(/Lignes de vue indisponibles : la position de Noé Rami est inconnue/),
    ).toBeInTheDocument();
    expect(within(sheet).queryByText('Sélectionnez une zone ou un jeton.')).toBeNull();
  });

  it('un glissement de 20 px sur une zone ne sélectionne rien (à 1× comme à 1,5×), et déplace la vue une fois zoomée', async () => {
    const user = userEvent.setup();
    render(<MapPanel compact />);
    mockStageRect();

    // À 1× : aucun déplacement possible, mais surtout aucune sélection.
    pan(zoneButton('Caisses'), [100, 100], [120, 100]);
    expect(useGameStore.getState().selection).toBeNull();
    expect(layerTransform()).toBe('translate(0px, 0px) scale(1)');

    await user.click(screen.getByRole('button', { name: 'Zoom avant' }));
    expect(layerTransform()).toBe('translate(-97.5px, -97.5px) scale(1.5)');

    pan(zoneButton('Caisses'), [100, 100], [120, 100]);
    expect(useGameStore.getState().selection).toBeNull();
    expect(layerTransform()).toBe('translate(-77.5px, -97.5px) scale(1.5)');

    // Un tap bref juste après reste une sélection.
    tap(zoneButton('Caisses'), 200, 250);
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'checkout' });
  });

  it('les boutons Zoom avant / arrière / Recadrer changent la transformation, annoncent chaque palier et signalent les bornes', async () => {
    const user = userEvent.setup();
    render(<MapPanel compact />);
    mockStageRect();
    const zoomIn = screen.getByRole('button', { name: 'Zoom avant' });
    const zoomOut = screen.getByRole('button', { name: 'Zoom arrière' });
    const reset = screen.getByRole('button', { name: 'Recadrer' });
    const state = () => useGameStore.getState();

    expect(zoomOut).toHaveAttribute('aria-disabled', 'true');
    await user.click(zoomIn);
    expect(layerTransform()).toBe('translate(-97.5px, -97.5px) scale(1.5)');
    expect(state().liveMessage).toBe('Zoom ×1,5.');
    expect(screen.getByTestId('map-zoom-level')).toHaveTextContent('×1,5');
    expect(zoomOut).not.toHaveAttribute('aria-disabled');

    await user.click(zoomIn);
    expect(layerTransform()).toBe('translate(-195px, -195px) scale(2)');
    expect(state().liveMessage).toBe('Zoom ×2.');

    await user.click(zoomOut);
    expect(layerTransform()).toBe('translate(-97.5px, -97.5px) scale(1.5)');
    expect(state().liveMessage).toBe('Zoom ×1,5.');

    await user.click(reset);
    expect(layerTransform()).toBe('translate(0px, 0px) scale(1)');
    expect(state().liveMessage).toBe('Plan recadré, zoom ×1.');
    await user.click(reset);
    expect(state().liveMessage).toBe('Plan déjà recadré.');

    // Jusqu'au maximum : 1,5 → 2 → 3 → 4, puis la borne est annoncée.
    await user.click(zoomIn);
    await user.click(zoomIn);
    await user.click(zoomIn);
    await user.click(zoomIn);
    expect(viewportScale()).toBe(4);
    expect(zoomIn).toHaveAttribute('aria-disabled', 'true');
    await user.click(zoomIn);
    expect(viewportScale()).toBe(4);
    expect(state().liveMessage).toBe('Zoom maximal (×4).');
    // Aucune sélection n'a été produite par les boutons.
    expect(state().selection).toBeNull();
  });

  it('raccourcis clavier : + / − / 0 quand une zone du plan a le focus', () => {
    render(<MapPanel compact />);
    mockStageRect();
    const zone = zoneButton('Caisses');
    zone.focus();

    fireEvent.keyDown(zone, { key: '+' });
    expect(viewportScale()).toBe(1.5);
    expect(useGameStore.getState().liveMessage).toBe('Zoom ×1,5.');
    fireEvent.keyDown(zone, { key: '=' });
    expect(viewportScale()).toBe(2);
    fireEvent.keyDown(zone, { key: '-' });
    expect(viewportScale()).toBe(1.5);
    fireEvent.keyDown(zone, { key: '0' });
    expect(viewportScale()).toBe(1);
    expect(layerTransform()).toBe('translate(0px, 0px) scale(1)');
    expect(useGameStore.getState().liveMessage).toBe('Plan recadré, zoom ×1.');
    // Les raccourcis ne sélectionnent rien ; Entrée sélectionne toujours.
    expect(useGameStore.getState().selection).toBeNull();
    fireEvent.keyDown(zone, { key: 'Enter' });
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'checkout' });
    expect(screen.getByRole('dialog', { name: 'Caisses' })).toBeInTheDocument();
  });

  it('un pincement à deux doigts zoome autour du point médian sans jamais sélectionner', () => {
    render(<MapPanel compact />);
    mockStageRect();
    const zone = zoneButton('Caisses');

    fireEvent.pointerDown(zone, touch(1, 100, 200));
    fireEvent.pointerDown(zone, touch(2, 200, 200));
    fireEvent.pointerMove(zone, touch(1, 50, 200));
    fireEvent.pointerMove(zone, touch(2, 250, 200));
    fireEvent.pointerUp(zone, touch(1, 50, 200));
    fireEvent.pointerUp(zone, touch(2, 250, 200));
    fireEvent.click(zone, { clientX: 250, clientY: 200 });

    expect(useGameStore.getState().selection).toBeNull();
    expect(viewportScale()).toBeCloseTo(2, 6);
    expect(screen.getByTestId('map-viewport-stage').parentElement).toHaveAttribute(
      'data-phase',
      'idle',
    );
  });

  it('un double-tap zoome ×2 centré sur le point ; le premier tap a sélectionné, le second ne re-sélectionne pas', () => {
    render(<MapPanel compact />);
    mockStageRect();
    const zone = zoneButton('Caisses');
    // Horloge maîtrisée : le second tap suit le premier de 200 ms, quelle que soit la charge.
    let clock = 10_000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);

    tap(zone, 100, 100);
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'checkout' });
    expect(viewportScale()).toBe(1);
    // Le second tap arrive dans la foulée (la feuille est ouverte, mais le geste est le même).
    act(() => useGameStore.getState().clearSelection());
    clock += 200;
    tap(zone, 100, 100);
    expect(viewportScale()).toBe(2);
    expect(layerTransform()).toBe('translate(-100px, -100px) scale(2)');
    expect(useGameStore.getState().liveMessage).toBe('Zoom ×2.');
    // Le click du second tap a été neutralisé : pas de nouvelle sélection.
    expect(useGameStore.getState().selection).toBeNull();

    // Un troisième tap, 600 ms plus tard, n'est plus un double-tap : il sélectionne à nouveau.
    clock += 600;
    tap(zone, 100, 100);
    expect(viewportScale()).toBe(2);
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'checkout' });
    nowSpy.mockRestore();
  });

  it('la légende s’ouvre en feuille (jetons, caméra, obstruction, lignes de vue, sons) et se ferme par Échap', async () => {
    const user = userEvent.setup();
    render(<MapPanel compact />);
    const toggle = screen.getByRole('button', { name: 'Légende' });
    expect(toggle).toHaveAttribute('aria-haspopup', 'dialog');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/jeton plein/)).toBeNull();

    await user.click(toggle);
    const legend = screen.getByRole('dialog', { name: 'Légende du plan' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(legend).getByText(/jeton plein : caméra, pièce ou fait révélé/)).toBeVisible();
    expect(within(legend).getByText(/contour pointillé : déclaration debout/)).toBeVisible();
    expect(within(legend).getByText(/losange surligné : votre version/)).toBeVisible();
    expect(within(legend).getByText(/hors champ : la personne figure/)).toBeVisible();
    expect(within(legend).getByText(/zone filmée par la caméra/)).toBeVisible();
    expect(within(legend).getByText(/palette connue/)).toBeVisible();
    expect(within(legend).getByText(/traits ambre depuis la personne sélectionnée/)).toBeVisible();
    expect(within(legend).getByText(/propagation d’un son/)).toBeVisible();
    expect(within(legend).getByRole('button', { name: 'Fermer la fenêtre' })).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('une sélection venue d’un autre espace n’ouvre pas la feuille d’elle-même ; « Fiche » l’ouvre', async () => {
    const user = userEvent.setup();
    render(<MapPanel compact />);
    act(() => useGameStore.getState().select('zone', 'office'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(zoneButton('Bureau')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Ouvrir la fiche — Bureau' }));
    expect(screen.getByRole('dialog', { name: 'Bureau' })).toBeInTheDocument();

    // Une sélection d'une autre nature (pièce) referme la feuille : elle ne concerne plus le plan.
    act(() => useGameStore.getState().select('evidence', 'e_door_exit'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Ouvrir la fiche (aucune sélection)' }),
    ).toBeDisabled();
  });
});

describe('<MapPanel /> — bureau (1440 px) inchangé', () => {
  beforeEach(() => {
    stubViewport(1440);
    resetStore();
    useGameStore.getState().setPref('reducedMotion', 'off');
  });

  it('garde son en-tête, sa légende repliable et sa fiche sous le plan ; aucune feuille', async () => {
    const user = userEvent.setup();
    render(<MapPanel />);
    const panel = screen.getByTestId('map-panel');
    expect(panel).not.toHaveAttribute('data-compact');
    const title = screen.getByRole('heading', { level: 2, name: 'Plan — La Veilleuse' });
    expect(title).toHaveClass('panel-title');
    expect(screen.getByText('Sélectionnez une zone ou un jeton.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Légende' })).toHaveAttribute('aria-controls');
    expect(screen.queryByRole('button', { name: /Ouvrir la fiche/ })).toBeNull();
    expect(zoneButton('Allée froide').querySelector('.map-zone-name')).toHaveAttribute(
      'data-lines',
      '1',
    );

    await user.click(zoneButton('Caisses'));
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'checkout' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Caisses' })).toBeVisible();
    expect(panel.querySelector('aside.map-sheet')).toHaveAttribute('data-zone', 'checkout');

    // Les contrôles de zoom existent aussi au bureau, sans changer la disposition.
    const zoom = screen.getByRole('group', { name: 'Zoom du plan' });
    await user.click(within(zoom).getByRole('button', { name: 'Zoom avant' }));
    expect(useGameStore.getState().liveMessage).toBe('Zoom ×1,5.');
    expect(layerTransform()).toContain('scale(1.5)');
  });
});
