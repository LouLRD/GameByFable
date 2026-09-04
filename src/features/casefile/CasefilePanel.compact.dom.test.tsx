// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStore, stubViewport } from '@/app/testing';
import { asId } from '@/domain/model/ids';
import { useGameStore, type SelectionKind } from '@/state';
import { CasefilePanel } from './CasefilePanel';
import { PINS_KEY } from './pins';

const ana = asId<'character'>('ana');

function selectInStore(kind: SelectionKind, id: string): void {
  act(() => {
    useGameStore.getState().select(kind, id);
  });
}

function listButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button.casefile-item'));
}

function listButton(id: string): HTMLButtonElement {
  const button = listButtons().find((b) => b.dataset.id === id);
  if (!button) throw new Error(`Élément « ${id} » absent de la liste`);
  return button;
}

function storedPins(): string[] {
  const raw = window.localStorage.getItem(PINS_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

beforeEach(() => {
  resetStore();
  stubViewport(390);
  useGameStore.getState().setCasefileFilter('all');
});

afterEach(() => {
  cleanup();
});

describe('<CasefilePanel compact /> — en-tête, recherche, filtres, prémisse', () => {
  it('masque le grand titre (présent pour l’accessibilité) et replie la recherche derrière « Rechercher »', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel compact />);
    const title = screen.getByRole('heading', { name: 'Dossier' });
    expect(title).toHaveClass('visually-hidden');
    expect(document.querySelector('.casefile')?.getAttribute('data-compact')).toBe('true');

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Rechercher' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const search = screen.getByRole('searchbox', { name: 'Rechercher dans le dossier' });
    expect(search).toHaveFocus();

    await user.type(search, 'video');
    const labels = listButtons().map((b) => b.textContent ?? '');
    expect(labels.some((l) => l.includes('Journal vidéo'))).toBe(true);
    expect(labels.every((l) => !l.includes('Ana Sorel'))).toBe(true);

    // Échap vide la recherche, puis la replie en rendant le focus au bouton.
    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
    expect(listButtons().length).toBeGreaterThan(10);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();

    // Refermer avec une requête en cours l'annule.
    await user.click(toggle);
    await user.type(screen.getByRole('searchbox'), 'zzzz');
    expect(listButtons()).toHaveLength(0);
    await user.click(toggle);
    expect(listButtons().length).toBeGreaterThan(10);
  });

  it('replie la prémisse sous « Situation » et garde la rangée de filtres avec « Épinglés (n) »', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel compact />);
    expect(screen.queryByText(/écart de 300 €/)).not.toBeInTheDocument();
    const situation = screen.getByRole('button', { name: 'Situation' });
    expect(situation).toHaveAttribute('aria-expanded', 'false');
    await user.click(situation);
    expect(situation).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/écart de 300 €/)).toBeInTheDocument();
    await user.click(situation);
    expect(screen.queryByText(/écart de 300 €/)).not.toBeInTheDocument();

    const toolbar = screen.getByRole('toolbar', { name: 'Filtrer le dossier' });
    const chips = within(toolbar).getAllByRole('button');
    expect(chips.map((c) => c.textContent?.replace(/\s*\(\d+\)\s*$/, '').trim())).toEqual([
      'Tout',
      'Pièces',
      'Déclarations',
      'Personnes',
      'Faits',
      'Hypothèses',
      'Contradictions',
      'Journal',
      'Épinglés',
    ]);
    expect(within(toolbar).getByRole('button', { name: /^Épinglés/ })).toHaveTextContent('(0)');
    // Les flèches circulent aussi jusqu'à la puce « Épinglés ».
    chips[0]?.focus();
    await user.keyboard('{End}');
    expect(within(toolbar).getByRole('button', { name: /^Épinglés/ })).toHaveFocus();
  });
});

describe('<CasefilePanel compact /> — épinglage', () => {
  it('« Épingler » (aria-pressed) place l’élément en tête dans « Épinglés », persiste dans localStorage et alimente le filtre', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<CasefilePanel compact />);
    expect(screen.getByRole('heading', { name: /Pièces \(3\)/ })).toBeInTheDocument();

    await user.click(listButton('e_camera_gap'));
    const sheet = screen.getByRole('region', { name: 'Fiche : Journal vidéo' });
    const pin = within(sheet).getByRole('button', { name: 'Épingler' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    await user.click(pin);
    const unpin = within(sheet).getByRole('button', { name: 'Désépingler' });
    expect(unpin).toHaveAttribute('aria-pressed', 'true');
    expect(storedPins()).toEqual(['e_camera_gap']);
    expect(useGameStore.getState().liveMessage).toMatch(/épinglé en tête du dossier/);

    await user.click(within(sheet).getByRole('button', { name: 'Retour à la liste' }));
    const pinnedHeading = screen.getByRole('heading', { name: /Épinglés \(1\)/ });
    const pinnedGroup = pinnedHeading.closest('section');
    if (!pinnedGroup) throw new Error('Section « Épinglés » absente');
    expect(pinnedGroup.dataset.group).toBe('pinned');
    expect(within(pinnedGroup).getByRole('button', { name: /Journal vidéo/ })).toBeInTheDocument();
    // Le premier élément de la liste est l'épinglé ; le groupe Pièces n'en compte plus que 2.
    expect(listButtons()[0]?.dataset.id).toBe('e_camera_gap');
    expect(screen.getByRole('heading', { name: /Pièces \(2\)/ })).toBeInTheDocument();

    // Filtre « Épinglés (1) » : seul l'épinglé reste, les autres puces se relâchent.
    const toolbar = screen.getByRole('toolbar', { name: 'Filtrer le dossier' });
    const pinnedChip = within(toolbar).getByRole('button', { name: /^Épinglés/ });
    expect(pinnedChip).toHaveTextContent('(1)');
    await user.click(pinnedChip);
    expect(pinnedChip).toHaveAttribute('aria-pressed', 'true');
    expect(within(toolbar).getByRole('button', { name: /^Tout/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(listButtons().map((b) => b.dataset.id)).toEqual(['e_camera_gap']);
    expect(useGameStore.getState().casefileFilter).toBe('all');
    await user.click(within(toolbar).getByRole('button', { name: /^Tout/ }));
    expect(pinnedChip).toHaveAttribute('aria-pressed', 'false');
    expect(listButtons().length).toBeGreaterThan(10);

    // Persistance : un nouveau montage relit le stockage.
    unmount();
    render(<CasefilePanel compact />);
    expect(screen.getByRole('heading', { name: /Épinglés \(1\)/ })).toBeInTheDocument();

    // Désépingler depuis la fiche vide la section.
    await user.click(listButton('e_camera_gap'));
    await user.click(screen.getByRole('button', { name: 'Désépingler' }));
    expect(storedPins()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Retour à la liste' }));
    expect(screen.queryByRole('heading', { name: /Épinglés/ })).not.toBeInTheDocument();
  });

  it('lit des épingles déjà stockées et affiche un message vide explicite pour le filtre sans épingle', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(PINS_KEY, JSON.stringify(['malik', 42, 'inconnu']));
    render(<CasefilePanel compact />);
    const group = screen.getByRole('heading', { name: /Épinglés \(1\)/ }).closest('section');
    if (!group) throw new Error('Section « Épinglés » absente');
    expect(within(group).getByRole('button', { name: /Malik Bensaïd/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Personnes \(5\)/ })).toBeInTheDocument();

    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: PINS_KEY }));
    });
    expect(screen.queryByRole('heading', { name: /Épinglés/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Épinglés/ }));
    expect(screen.getByText(/Aucun élément épinglé/)).toBeInTheDocument();
  });
});

describe('<CasefilePanel compact /> — fiche : en-tête collant, barre d’actions, retour', () => {
  it('regroupe les actions d’une déclaration dans une barre « Actions » et déplace le focus liste ⇄ fiche', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel compact />);
    await user.click(listButton('s_malik_initial'));
    const sheet = screen.getByRole('region', { name: /^Fiche : / });
    const back = within(sheet).getByRole('button', { name: 'Retour à la liste' });
    expect(back).toHaveFocus();
    expect(sheet.querySelector('.casefile-sheet-bar .casefile-sheet-bar-title')).not.toBeNull();

    const actions = within(sheet).getByRole('group', { name: 'Actions' });
    expect(actions).toHaveClass('casefile-actionbar');
    expect(
      within(actions)
        .getAllByRole('button')
        .map((b) => b.textContent?.trim()),
    ).toEqual(['Confronter à ce sujet', 'Utiliser comme appui', '☆ Épingler']);
    await user.click(within(actions).getByRole('button', { name: 'Utiliser comme appui' }));
    expect(useGameStore.getState().confrontationDraft.supportId).toBe('s_malik_initial');

    await user.click(back);
    expect(screen.queryByRole('region', { name: /^Fiche : / })).not.toBeInTheDocument();
    expect(listButton('s_malik_initial')).toHaveFocus();
  });

  it('fiche de pièce : « Jointe au rapport » devient un bouton pressé de la barre ; la fiche survit au passage par le plan', async () => {
    const user = userEvent.setup();
    act(() => {
      const r = useGameStore.getState().dispatch({
        type: 'confront',
        characterId: ana,
        targetId: 's_ana_initial',
        supportId: 'e_till_report',
        approach: 'neutral',
      });
      expect(r.ok).toBe(true);
    });
    render(<CasefilePanel compact />);
    selectInStore('evidence', 'e_drawer_log');
    const sheet = screen.getByRole('region', { name: 'Fiche : Ouverture manuelle' });
    expect(within(sheet).queryByRole('checkbox')).not.toBeInTheDocument();
    const actions = within(sheet).getByRole('group', { name: 'Actions' });
    expect(
      within(actions).getByRole('button', { name: 'Voir sur le plan / la frise' }),
    ).toBeEnabled();
    expect(
      within(actions).getByRole('button', { name: 'Utiliser dans une confrontation' }),
    ).toBeInTheDocument();
    const attach = within(actions).getByRole('button', { name: 'Jointe au rapport' });
    expect(attach).toHaveAttribute('aria-pressed', 'true');
    await user.click(attach);
    expect(useGameStore.getState().game?.detachedEvidenceIds).toContain('e_drawer_log');
    expect(within(actions).getByRole('button', { name: 'Jointe au rapport' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(sheet).getByText('hors rapport')).toBeInTheDocument();

    // « Voir sur le plan / la frise » bascule sur le plan ; au retour au Dossier la fiche reste ouverte.
    selectInStore('evidence', 'e_camera_gap');
    const videoSheet = screen.getByRole('region', { name: 'Fiche : Journal vidéo' });
    await user.click(
      within(videoSheet).getByRole('button', { name: 'Voir sur le plan / la frise' }),
    );
    const state = useGameStore.getState();
    expect(state.activeSpace).toBe('map');
    expect(state.cursor).toBe(500);
    expect(state.selection).toEqual({ kind: 'evidence', id: 'e_camera_gap' });
    act(() => {
      useGameStore.getState().setActiveSpace('casefile');
    });
    expect(screen.getByRole('region', { name: 'Fiche : Journal vidéo' })).toBeInTheDocument();
    expect(document.querySelector('.casefile')?.getAttribute('data-sheet-open')).toBe('true');
  });

  it('une pièce initiale garde « Jointe au rapport » désactivé et expliqué dans la barre', () => {
    render(<CasefilePanel compact />);
    selectInStore('evidence', 'e_till_report');
    const sheet = screen.getByRole('region', { name: 'Fiche : Rapport de caisse' });
    const attach = within(sheet).getByRole('button', { name: 'Jointe au rapport' });
    expect(attach).toBeDisabled();
    expect(attach).toHaveAttribute('aria-pressed', 'true');
    expect(attach).toHaveAccessibleDescription(/Pièce initiale du dossier/);
  });

  it('fiche personne : Confronter, Sonder (aria-expanded) et Épingler dans la barre, formulaire au-dessus', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel compact />);
    selectInStore('character', 'malik');
    const sheet = screen.getByRole('region', { name: 'Fiche : Malik Bensaïd' });
    const actions = within(sheet).getByRole('group', { name: 'Actions' });
    const probe = within(actions).getByRole('button', { name: 'Sonder avec une hypothèse' });
    expect(probe).toHaveAttribute('aria-expanded', 'false');
    await user.click(probe);
    expect(probe).toHaveAttribute('aria-expanded', 'true');
    const form = sheet.querySelector('form.casefile-probe');
    if (!form) throw new Error('Formulaire de sondage absent');
    // Le formulaire précède la barre d'actions dans le flux (la barre reste collée en bas).
    expect(form.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(actions).getByRole('button', { name: 'Confronter' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Épingler' })).toBeInTheDocument();
  });
});

describe('<CasefilePanel compact /> — liste : groupes repliables', () => {
  it('chaque groupe se replie via son en-tête (aria-expanded) en conservant son compteur', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel compact />);
    const groups = document.querySelector<HTMLElement>('.casefile-groups');
    if (!groups) throw new Error('Liste absente');
    const toggle = within(groups).getByRole('button', { name: /^Pièces \(3\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls');
    expect(listButtons().filter((b) => b.dataset.kind === 'evidence')).toHaveLength(3);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Pièces (3)');
    expect(listButtons().filter((b) => b.dataset.kind === 'evidence')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: /Pièces \(3\)/ })).toBeInTheDocument();
    expect(listButtons().filter((b) => b.dataset.kind === 'statement')).toHaveLength(6);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(listButtons().filter((b) => b.dataset.kind === 'evidence')).toHaveLength(3);
  });
});

describe('<CasefilePanel /> — bureau inchangé sans la prop', () => {
  it('ne rend ni bouton Rechercher, ni puce Épinglés, ni en-têtes repliables', () => {
    stubViewport(1280);
    render(<CasefilePanel />);
    expect(document.querySelector('.casefile')?.hasAttribute('data-compact')).toBe(false);
    expect(screen.getByRole('heading', { name: 'Dossier' })).toHaveClass('panel-title');
    expect(
      screen.getByRole('searchbox', { name: 'Rechercher dans le dossier' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechercher' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Situation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Épinglés/ })).not.toBeInTheDocument();
    expect(screen.getByText(/écart de 300 €/)).toBeInTheDocument();
    expect(document.querySelector('.casefile-group-toggle')).toBeNull();
    selectInStore('character', 'malik');
    const sheet = screen.getByRole('region', { name: 'Fiche : Malik Bensaïd' });
    expect(within(sheet).queryByRole('group', { name: 'Actions' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Épingler' })).not.toBeInTheDocument();
  });
});
