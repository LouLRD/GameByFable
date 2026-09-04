// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useGameStore } from '@/state';
import { claim, confront } from '@/test/helpers';
import { MapPanel } from './MapPanel';

function resetGame(): void {
  localStorage.clear();
  const store = useGameStore.getState();
  store.bootstrap();
  store.newGame();
  store.setPref('reducedMotion', 'off');
}

function zoneButton(label: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^Zone ${label},`) });
}

function zoneElement(container: HTMLElement, zoneId: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`.map-zone[data-zone="${zoneId}"]`);
  if (!el) throw new Error(`Zone introuvable : ${zoneId}`);
  return el;
}

describe('<MapPanel />', () => {
  beforeEach(() => {
    resetGame();
  });

  it('rend les neuf zones comme des boutons focusables, nommés, dans un groupe horodaté', () => {
    render(<MapPanel />);
    expect(screen.getByRole('group', { name: 'Plan du magasin à 20:49:00' })).toBeInTheDocument();
    const zones = screen.getAllByRole('button', { name: /^Zone / });
    expect(zones).toHaveLength(9);
    for (const z of zones) {
      expect(z.tagName.toLowerCase()).toBe('g');
      expect(z).toHaveAttribute('tabindex', '0');
      expect(z).toHaveAttribute('aria-pressed', 'false');
    }
    expect(zoneButton('Caisses')).toHaveAccessibleName(
      'Zone Caisses, 2 personnes présentes, filmée, éclairée',
    );
    expect(zoneButton('Réserve')).toHaveAccessibleName(
      'Zone Réserve, aucune personne présente, non filmée, tamisée',
    );
    // État vide de la fiche
    expect(screen.getByText('Sélectionnez une zone ou un jeton.')).toBeInTheDocument();
  });

  it('un clic sur une zone la sélectionne et la fiche liste ses passages avec leurs durées', async () => {
    const user = userEvent.setup();
    render(<MapPanel />);

    await user.click(zoneButton('Caisses'));

    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'checkout' });
    expect(zoneButton('Caisses')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 3, name: 'Caisses' })).toBeInTheDocument();

    const passages = screen.getByRole('list', { name: /^Passages \(4\)/ });
    const rows = within(passages).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(within(passages).getByText('→ Entrée')).toBeInTheDocument();
    expect(within(passages).getByText(/^5 s · vue nette · perte sonore 8 %/)).toBeInTheDocument();
    expect(within(passages).getByText('→ Rayon 1')).toBeInTheDocument();
    expect(within(passages).getByText(/^8 s · vue nette · perte sonore 10 %/)).toBeInTheDocument();
    expect(within(passages).getByText('→ Bureau')).toBeInTheDocument();
    expect(
      within(passages).getByText(/^18 s · vue partielle · perte sonore 38 %/),
    ).toBeInTheDocument();
    expect(within(passages).getByText('→ Salle de pause')).toBeInTheDocument();
    expect(
      within(passages).getByText(/^22 s · aucune vue · perte sonore 42 %/),
    ).toBeInTheDocument();

    // Le bouton « Ouvrir » d'un passage navigue vers la zone voisine.
    await user.click(screen.getByRole('button', { name: 'Ouvrir la zone Rayon 1' }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'aisle_one' });
    expect(screen.getByRole('heading', { level: 3, name: 'Rayon 1' })).toBeInTheDocument();
  });

  it('Entrée et Espace sélectionnent la zone focalisée ; les flèches déplacent le focus', () => {
    const { container } = render(<MapPanel />);
    const entrance = zoneButton('Entrée');
    fireEvent.keyDown(entrance, { key: 'Enter' });
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'entrance' });

    const aisle = zoneButton('Rayon 1');
    fireEvent.keyDown(aisle, { key: ' ' });
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'aisle_one' });

    // Depuis les Caisses, flèche haut → Rayon 1 ; flèche droite → Rayon 2 depuis Rayon 1.
    const checkout = zoneButton('Caisses');
    fireEvent.keyDown(checkout, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(zoneElement(container, 'aisle_one'));
    fireEvent.keyDown(zoneElement(container, 'aisle_one'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(zoneElement(container, 'aisle_two'));
    // La sélection n'a pas changé avec les flèches.
    expect(useGameStore.getState().selection).toEqual({ kind: 'zone', id: 'aisle_one' });
  });

  it('à t=100, Ana est placée aux Caisses (établi par la caméra) ; Inès est rapportée ; Jo et Noé sont hors champ', () => {
    const { container } = render(<MapPanel />);
    act(() => useGameStore.getState().setCursor(100));

    expect(screen.getByRole('group', { name: 'Plan du magasin à 20:50:40' })).toBeInTheDocument();
    const ana = screen.getByRole('img', { name: 'Ana Sorel — Caisses (établi par la caméra)' });
    expect(ana).toHaveAttribute('data-status', 'established');
    expect(ana).toHaveAttribute('data-zone', 'checkout');
    expect(ana.querySelector('circle.map-token-shape')).toHaveAttribute('fill', '#E3A857');

    const ines = screen.getByRole('img', {
      name: 'Inès Vidal — Allée froide (rapporté par une déclaration)',
    });
    expect(ines).toHaveAttribute('data-status', 'reported');

    const tray = screen.getByRole('group', { name: /Hors champ à cet instant \(2\)/ });
    expect(within(tray).getByRole('button', { name: /Jo Harel/ })).toBeInTheDocument();
    expect(within(tray).getByRole('button', { name: /Noé Rami/ })).toBeInTheDocument();
    expect(within(tray).queryByRole('button', { name: /Ana Sorel/ })).toBeNull();

    // Deux jetons distincts dans la même zone : positions déterministes différentes.
    const tokens = container.querySelectorAll(
      '.map-token[data-zone="checkout"] circle.map-token-shape',
    );
    expect(tokens).toHaveLength(2);
    const [a, b] = Array.from(tokens);
    expect(`${a?.getAttribute('cx')},${a?.getAttribute('cy')}`).not.toBe(
      `${b?.getAttribute('cx')},${b?.getAttribute('cy')}`,
    );
  });

  it('déplacer le curseur à 600 (coupure caméra) retire les jetons des Caisses et affiche « hors champ »', () => {
    const { container } = render(<MapPanel />);
    act(() => useGameStore.getState().setCursor(100));
    expect(screen.getByRole('img', { name: /^Ana Sorel — / })).toBeInTheDocument();

    act(() => useGameStore.getState().setCursor(600));

    expect(screen.getByRole('group', { name: 'Plan du magasin à 20:59:00' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Ana Sorel — / })).toBeNull();
    expect(screen.queryByRole('img', { name: /^Malik Bensaïd — / })).toBeNull();
    const checkout = zoneElement(container, 'checkout');
    expect(checkout).toHaveAttribute('data-off-camera', 'true');
    expect(checkout).toHaveAccessibleName(
      'Zone Caisses, aucune personne présente, filmée, éclairée, hors champ à cet instant',
    );
    expect(within(checkout).getByText('HORS CHAMP')).toBeInTheDocument();
    // La Réserve n'est pas filmée : pas de bandeau.
    expect(zoneElement(container, 'stockroom')).toHaveAttribute('data-off-camera', 'false');
    // Ana rejoint le tray.
    const tray = screen.getByRole('group', { name: /Hors champ à cet instant/ });
    expect(within(tray).getByRole('button', { name: /Ana Sorel/ })).toBeInTheDocument();
  });

  it('obstruction inconnue au départ : aucun symbole palette ; connue après le déblocage de la palette : symbole et durée ×2,2', async () => {
    const user = userEvent.setup();
    const { container } = render(<MapPanel />);
    act(() => useGameStore.getState().setCursor(500));

    expect(screen.queryByRole('img', { name: /Obstruction connue/ })).toBeNull();
    const p05 = container.querySelector('.map-passage[data-passage="p05"]');
    const p05Tag = container.querySelector('.map-passage-tag[data-passage="p05"]');
    expect(p05).toHaveAttribute('data-state', 'open');
    expect(p05Tag).toHaveTextContent('9 s');

    act(() => {
      const r = useGameStore.getState().dispatch(confront('jo', 's_jo_initial', 'e_camera_gap'));
      expect(r.ok).toBe(true);
    });

    const pallet = screen.getByRole('img', {
      name: 'Obstruction connue dans Allée froide : palette, trajets ×2,2',
    });
    expect(pallet).toBeInTheDocument();
    expect(p05).toHaveAttribute('data-state', 'obstructed');
    expect(p05Tag).toHaveTextContent('20 s ×2,2');
    expect(p05).toHaveAccessibleName(/obstrué \(×2,2\)/);

    await user.click(zoneButton('Allée froide'));
    expect(container.querySelector('.map-sheet-obstruction')).toHaveTextContent(
      'Obstruction connue — palette, de 20:56:00 à 21:03:10 : trajets ×2,2 ; bloque la vue entre Caisses et Allée froide, Rayon 1 et Réserve.',
    );
    const passages = screen.getByRole('list', { name: /^Passages/ });
    expect(within(passages).getByText(/^20 s \(9 s ×2,2\) · vue partielle/)).toBeInTheDocument();

    // Hors de l'intervalle de l'obstruction, la palette disparaît.
    act(() => useGameStore.getState().setCursor(900));
    expect(screen.queryByRole('img', { name: /Obstruction connue/ })).toBeNull();
    expect(p05).toHaveAttribute('data-state', 'open');
  });

  it('« Aller à l’instant » d’un marqueur déplace le curseur et fait apparaître l’étiquette sur le plan', async () => {
    const user = userEvent.setup();
    render(<MapPanel />);

    await user.click(zoneButton('Entrée'));
    const markers = screen.getByRole('list', { name: /^Pièces et faits localisés ici \(1\)/ });
    expect(within(markers).getByText('Sortie non salariée')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Pièce : Sortie non salariée/ })).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Aller à l’instant 20:52:00 — Sortie non salariée' }),
    );

    expect(useGameStore.getState().cursor).toBe(180);
    expect(useGameStore.getState().liveMessage).toBe('Curseur placé à 20:52:00.');
    expect(
      screen.getByRole('img', { name: 'Pièce : Sortie non salariée (établi), Entrée' }),
    ).toBeInTheDocument();
    expect(within(markers).getByText(/en cours à cet instant/)).toBeInTheDocument();

    // « Fiche » ouvre la pièce dans la sélection partagée.
    await user.click(screen.getByRole('button', { name: 'Fiche — Sortie non salariée' }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'evidence', id: 'e_door_exit' });
  });

  it('un personnage sélectionné et positionné trace ses lignes de vue, avec équivalent textuel', async () => {
    const user = userEvent.setup();
    const { container } = render(<MapPanel />);
    act(() => useGameStore.getState().setCursor(100));

    // Sélection depuis le tray (Noé, hors champ) : pas de lignes, mais une explication.
    await user.click(screen.getByRole('button', { name: /Noé Rami/ }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'character', id: 'noe' });
    expect(container.querySelectorAll('.map-sight-line')).toHaveLength(0);
    expect(
      screen.getByText(/Lignes de vue indisponibles : la position de Noé Rami est inconnue/),
    ).toBeInTheDocument();

    // Sélection d'Ana depuis la fiche des Caisses.
    await user.click(zoneButton('Caisses'));
    await user.click(screen.getByRole('button', { name: 'Sélectionner Ana Sorel' }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'character', id: 'ana' });

    const lines = container.querySelectorAll('.map-sight-line');
    expect(lines.length).toBeGreaterThan(0);
    const overlay = screen.getByRole('img', {
      name: /^Lignes de vue de Ana Sorel depuis Caisses à 20:50:40/,
    });
    expect(overlay).toBeInTheDocument();
    const section = screen.getByRole('list', { name: 'Lignes de vue — Ana Sorel' });
    expect(within(section).getByText('Entrée')).toBeInTheDocument();
    expect(within(section).getByText(/^Entrée/).parentElement).toHaveTextContent(
      /Entrée : nette \(100 %\)/,
    );
    expect(within(section).getByText(/^Salle de pause/).parentElement).toHaveTextContent(
      /aucune vue/,
    );
    // Le jeton d'Ana est marqué comme sélectionné.
    expect(screen.getByRole('img', { name: /^Ana Sorel — / })).toHaveAttribute(
      'data-highlight',
      'true',
    );
  });

  it('une hypothèse « son » placée affiche les anneaux d’atténuation et la propagation par zone', () => {
    const { container } = render(<MapPanel />);
    act(() => {
      const r = useGameStore.getState().dispatch(claim('noise_source', 'h_bottle_noise'));
      expect(r.ok).toBe(true);
      useGameStore.getState().setCursor(340);
    });

    const sound = screen.getByRole('img', {
      name: /^Propagation sonore — Hypothèse : Bouteille cassée, depuis Rayon 2/,
    });
    expect(sound).toBeInTheDocument();
    expect(container.querySelectorAll('.map-sound-ring')).toHaveLength(3);
    const labels = container.querySelectorAll('.map-sound-label');
    expect(labels.length).toBeGreaterThan(0);
    const list = screen.getByRole('list', {
      name: 'Propagation sonore — Hypothèse : Bouteille cassée',
    });
    expect(within(list).getByText('Rayon 2').parentElement).toHaveTextContent(
      /Rayon 2 : \d+ % — net/,
    );
    expect(within(list).getByText('Rayon 1').parentElement).toHaveTextContent(/arrive par Rayon 2/);

    // Hors de l'intervalle de la claim (338–350), le son n'est plus affiché.
    act(() => useGameStore.getState().setCursor(800));
    expect(screen.queryByRole('img', { name: /^Propagation sonore/ })).toBeNull();
  });

  it('placer une hypothèse fait pulser la zone et l’acteur impliqués, sans classe d’animation en mouvement réduit', () => {
    const { container } = render(<MapPanel />);
    act(() => useGameStore.getState().setCursor(100));

    act(() => {
      const r = useGameStore
        .getState()
        .dispatch(claim('cash_origin', 'h_malik_theft', { actorId: 'malik' as never }));
      expect(r.ok).toBe(true);
    });
    const aisleOne = zoneElement(container, 'aisle_one');
    expect(aisleOne).toHaveAttribute('data-pulse', 'true');
    expect(aisleOne.classList.contains('anim-propagate')).toBe(true);
    expect(zoneElement(container, 'checkout')).not.toHaveAttribute('data-pulse');
    const malik = screen.getByRole('img', { name: /^Malik Bensaïd — / });
    expect(malik).toHaveAttribute('data-pulse', 'true');

    act(() => useGameStore.getState().setPref('reducedMotion', 'on'));
    act(() => {
      const r = useGameStore.getState().dispatch(claim('video_outage', 'h_scheduled_reboot'));
      expect(r.ok).toBe(true);
    });
    const office = zoneElement(container, 'office');
    expect(office).toHaveAttribute('data-pulse', 'true');
    expect(office.classList.contains('anim-propagate')).toBe(false);
    expect(aisleOne).not.toHaveAttribute('data-pulse');
  });

  it('`highlight` met en évidence les zones et personnages listés', () => {
    const { container } = render(<MapPanel />);
    act(() => useGameStore.getState().setCursor(100));
    act(() => useGameStore.getState().highlight(['stockroom', 'mina']));

    expect(zoneElement(container, 'stockroom')).toHaveAttribute('data-highlight', 'true');
    expect(zoneElement(container, 'checkout')).not.toHaveAttribute('data-highlight');
    expect(screen.getByRole('img', { name: /^Mina Koenig — / })).toHaveAttribute(
      'data-highlight',
      'true',
    );
  });

  it('la légende est repliée par défaut et se déplie au clic', async () => {
    const user = userEvent.setup();
    render(<MapPanel />);
    const toggle = screen.getByRole('button', { name: 'Légende' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/jeton plein/)).not.toBeVisible();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/jeton plein : caméra, pièce ou fait révélé/)).toBeVisible();
    expect(screen.getByText(/losange surligné : votre version/)).toBeVisible();
  });
});
