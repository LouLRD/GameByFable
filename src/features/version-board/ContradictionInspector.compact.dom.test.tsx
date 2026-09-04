// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStore, stubViewport } from '@/app/testing';
import { claimSlotId } from '@/domain/model/ids';
import { claim } from '@/test/helpers';
import { useGameStore } from '@/state';
import { ContradictionInspector } from './ContradictionInspector';

const MALIK_VERSION_ID = 'temporal:r_actor_overlap:e_camera_gap+h_malik_theft+malik';
const MALIK_TITLE = 'Malik Bensaïd ne peut pas être à deux endroits';

function placeMalik(): void {
  act(() => {
    useGameStore.getState().dispatch(claim('cash_origin', 'h_malik_theft'));
  });
}

function detail(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.ci-detail-compact');
  if (!el) throw new Error('Détail compact absent');
  return el;
}

function stages(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ci-progression > .ci-stage'));
}

/** Élément de liste de la contradiction temporelle de la version (filtre « Version » activé). */
async function malikItem(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  const versionChip = screen.getByRole('button', { name: 'Version' });
  if (versionChip.getAttribute('aria-pressed') !== 'true') await user.click(versionChip);
  const temporal = screen.getByRole('heading', { name: /Temporelles/ }).closest('section');
  if (!temporal) throw new Error('Groupe temporel absent');
  return within(temporal).getByRole('button', { name: new RegExp(MALIK_TITLE) });
}

function stage(title: string): HTMLElement {
  const el = stages().find((s) => s.querySelector('.ci-stage-title')?.textContent?.includes(title));
  if (!el) throw new Error(`Étape « ${title} » absente`);
  return el;
}

beforeEach(() => {
  resetStore();
  stubViewport(390);
});

afterEach(() => {
  cleanup();
});

describe('<ContradictionInspector compact />', () => {
  it('liste (chips Toutes / Version / Témoignages) → tap → détail plein panneau → « ← Contradictions » → liste', async () => {
    const user = userEvent.setup();
    placeMalik();
    render(<ContradictionInspector compact />);
    const root = screen.getByRole('region', { name: 'Contradictions' });
    expect(root.getAttribute('data-compact')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Contradictions' })).toHaveClass('visually-hidden');
    const toolbar = screen.getByRole('toolbar', { name: 'Filtrer les contradictions' });
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Toutes', 'Version', 'Témoignages']);
    expect(document.querySelector('.ci-detail')).toBeNull();
    expect(screen.getByRole('heading', { name: /Temporelles/ })).toBeInTheDocument();

    const item = await malikItem(user);
    await user.click(item);
    expect(useGameStore.getState().selection).toEqual({
      kind: 'contradiction',
      id: MALIK_VERSION_ID,
    });
    const d = detail();
    expect(d.getAttribute('data-contradiction-id')).toBe(MALIK_VERSION_ID);
    // La liste a disparu : le détail occupe le panneau.
    expect(screen.queryByRole('heading', { name: /Temporelles/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    const back = within(d).getByRole('button', { name: 'Contradictions' });
    expect(back).toHaveFocus();
    const bar = d.querySelector('.ci-detail-bar');
    if (!bar) throw new Error('En-tête collant absent');
    expect(within(bar as HTMLElement).getByRole('heading', { level: 3, name: MALIK_TITLE }));
    expect(bar).toHaveTextContent('critique');
    expect(bar).toHaveTextContent('temporelle');
    expect(bar).toHaveTextContent('bloquante');

    await user.click(back);
    expect(document.querySelector('.ci-detail')).toBeNull();
    expect(screen.getByRole('heading', { name: /Temporelles/ })).toBeInTheDocument();
    // La sélection partagée est conservée ; l'élément courant reprend le focus.
    expect(useGameStore.getState().selection).toEqual({
      kind: 'contradiction',
      id: MALIK_VERSION_ID,
    });
    const current = await malikItem(user);
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(current).toHaveFocus();
    await user.click(current);
    expect(detail()).toBeInTheDocument();
  });

  it('présente l’explication comme une progression numérotée : éléments, données, raisonnement, instant, conséquences', async () => {
    const user = userEvent.setup();
    placeMalik();
    render(<ContradictionInspector compact />);
    await user.click(await malikItem(user));

    const list = screen.getByRole('list', { name: 'Explication pas à pas' });
    expect(list.tagName).toBe('OL');
    const titles = stages().map((s) => s.querySelector('.ci-stage-title')?.textContent ?? '');
    expect(titles[0]).toMatch(/^1Éléments incompatibles$/);
    expect(titles.at(-2)).toMatch(/Instant ou condition$/);
    expect(titles.at(-1)).toMatch(/Conséquences pour la version$/);
    // Numérotation continue.
    expect(stages().map((s) => s.querySelector('.ci-stage-num')?.textContent)).toEqual(
      stages().map((_, i) => String(i + 1)),
    );

    const elements = stage('Éléments incompatibles');
    const chips = [...elements.querySelectorAll('.ci-chips .chip')].map((c) => c.textContent);
    expect(chips).toEqual(['Hypothèse « Vol par Malik »', 'Malik Bensaïd']);
    expect(elements).toHaveTextContent(/Hypothèse « Vol par Malik » — acteur : Malik Bensaïd/);

    const data = stage('Données utilisées');
    expect(data).toHaveTextContent(/Malik Bensaïd se trouve à Rayon 2/);
    expect(
      within(data).getByRole('button', { name: /Voir l’étape 2 à 20:54:57/ }),
    ).toBeInTheDocument();

    const instant = stage('Instant ou condition');
    expect(within(instant).getByRole('button', { name: 'Voir à 20:54:57' })).toBeInTheDocument();
    expect(
      within(instant).getByRole('button', { name: 'Zones : Rayon 1, Rayon 2' }),
    ).toBeInTheDocument();
    expect(
      within(instant).getByRole('button', { name: 'Pièce : Journal vidéo' }),
    ).toBeInTheDocument();

    const consequences = stage('Conséquences pour la version');
    expect(consequences).toHaveTextContent(/L'hypothèse place Malik Bensaïd dans une zone/);
    expect(consequences).toHaveTextContent("Origine de l'écart");
    expect(within(consequences).getByText('impossible')).toBeInTheDocument();
    expect(consequences).toHaveTextContent('bloque la cohérence');
    expect(consequences).toHaveTextContent('implique la version');

    // Rien d'autre que les étapes du domaine : le nombre de lignes rendues égale le nombre d'étapes.
    const view = useGameStore.getState();
    const contradiction = view.game && view.scenario ? MALIK_VERSION_ID : null;
    expect(contradiction).not.toBeNull();
    const rendered = document.querySelectorAll('.ci-stage .ci-step-text, .ci-stage .ci-conclusion');
    expect(rendered).toHaveLength(4);
  });

  it('« Voir à HH:MM:SS » place le curseur, bascule sur le plan et met les zones en évidence sans fermer le détail', async () => {
    const user = userEvent.setup();
    placeMalik();
    render(<ContradictionInspector compact />);
    await user.click(await malikItem(user));
    await user.click(screen.getByRole('button', { name: 'Voir à 20:54:57' }));
    const store = useGameStore.getState();
    expect(store.cursor).toBe(357);
    expect(store.activeSpace).toBe('map');
    expect(store.highlightIds).toEqual(['aisle_one', 'aisle_two']);
    expect(store.selection).toEqual({ kind: 'contradiction', id: MALIK_VERSION_ID });
    expect(store.liveMessage).toMatch(/Plan ouvert : curseur placé à 20:54:57/);
    expect(detail()).toBeInTheDocument();

    act(() => {
      useGameStore.getState().setActiveSpace('inspector');
      useGameStore.getState().setCursor(0);
    });
    await user.click(screen.getByRole('button', { name: /Voir l’étape 2 à 20:54:57/ }));
    expect(useGameStore.getState().cursor).toBe(357);
    expect(useGameStore.getState().activeSpace).toBe('map');
    expect(useGameStore.getState().highlightIds).toEqual(['aisle_two']);

    // Puce d'élément : ouvre la fiche dans le Dossier.
    await user.click(within(detail()).getByRole('button', { name: 'Malik Bensaïd' }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'character', id: 'malik' });
    expect(useGameStore.getState().activeSpace).toBe('casefile');
  });

  it('une contradiction sélectionnée depuis un autre espace ouvre directement le détail ; son retrait rend la liste', () => {
    placeMalik();
    render(<ContradictionInspector compact />);
    expect(document.querySelector('.ci-detail')).toBeNull();
    act(() => {
      useGameStore.getState().select('contradiction', MALIK_VERSION_ID);
    });
    expect(detail().getAttribute('data-contradiction-id')).toBe(MALIK_VERSION_ID);
    act(() => {
      useGameStore.getState().dispatch({ type: 'clear-claim', slotId: claimSlotId('cash_origin') });
    });
    expect(document.querySelector('.ci-detail')).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Filtrer les contradictions' })).toBeInTheDocument();
  });

  it('résistance sociale : détail compact sans « Voir à », note d’adhésion dans les conséquences', async () => {
    const user = userEvent.setup();
    placeMalik();
    render(<ContradictionInspector compact />);
    await user.click(screen.getByRole('button', { name: /Malik Bensaïd ne signe pas/ }));
    const d = detail();
    expect(d.getAttribute('data-kind')).toBe('motivational');
    expect(within(d).getByText('résistance sociale')).toBeInTheDocument();
    expect(stage('Conséquences pour la version')).toHaveTextContent(
      /pèse sur l’adhésion, pas sur la cohérence/,
    );
    expect(screen.queryByRole('button', { name: /^Voir à/ })).not.toBeInTheDocument();
  });

  it('sans la prop, le bureau garde liste et détail côte à côte', () => {
    stubViewport(1280);
    placeMalik();
    render(<ContradictionInspector />);
    expect(screen.getByRole('heading', { name: 'Contradictions' })).toHaveClass('vb-title');
    expect(document.querySelector('.ci-detail-slot')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Impliquant la version' })).toBeInTheDocument();
    act(() => {
      useGameStore.getState().select('contradiction', MALIK_VERSION_ID);
    });
    expect(document.querySelector('.ci-detail-compact')).toBeNull();
    expect(document.querySelector('.ci-detail')).not.toBeNull();
    expect(screen.getByRole('heading', { name: /Temporelles/ })).toBeInTheDocument();
  });
});
