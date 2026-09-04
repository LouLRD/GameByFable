// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asId } from '@/domain/model/ids';
import { selectPlayerView } from '@/domain/selectors/playerView';
import { useGameStore } from '@/state';
import { CasefilePanel } from './CasefilePanel';

const malik = asId<'character'>('malik');
const ana = asId<'character'>('ana');

function resetGame(): void {
  const store = useGameStore.getState();
  store.bootstrap();
  store.newGame();
  store.setCasefileFilter('all');
  store.clearSelection();
  store.setConfrontationDraft({ characterId: null, targetId: null, supportId: null, approach: 'neutral' });
  store.closeDialog();
  store.setCursor(0);
}

function currentView() {
  const { scenario, game } = useGameStore.getState();
  if (!scenario || !game) throw new Error('Partie non chargée');
  return selectPlayerView(scenario, game);
}

function listButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button.casefile-item'));
}

beforeEach(() => {
  resetGame();
});

afterEach(() => {
  cleanup();
});

describe('<CasefilePanel /> — liste et filtres', () => {
  it('affiche la prémisse, le titre « Dossier » et des groupes par type', () => {
    render(<CasefilePanel />);
    expect(screen.getByRole('heading', { name: 'Dossier' })).toBeInTheDocument();
    expect(screen.getByText(/écart de 300 €/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Pièces \(3\)/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Déclarations \(6\)/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Personnes \(6\)/ })).toBeInTheDocument();
    const kinds = new Set(listButtons().map((b) => b.dataset.kind));
    expect(kinds).toEqual(new Set(['evidence', 'statement', 'character', 'fact', 'hypothesis', 'contradiction']));
  });

  it("le filtre « Déclarations » n'affiche que des déclarations et met à jour le store", async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    const toolbar = screen.getByRole('toolbar', { name: 'Filtrer le dossier' });
    await user.click(within(toolbar).getByRole('button', { name: /^Déclarations/ }));
    expect(useGameStore.getState().casefileFilter).toBe('statements');
    expect(within(toolbar).getByRole('button', { name: /^Déclarations/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(toolbar).getByRole('button', { name: /^Tout/ })).toHaveAttribute('aria-pressed', 'false');
    const buttons = listButtons();
    expect(buttons).toHaveLength(6);
    expect(buttons.every((b) => b.dataset.kind === 'statement')).toBe(true);
    expect(screen.queryByRole('heading', { name: /Pièces/ })).not.toBeInTheDocument();
  });

  it('la recherche filtre par libellé et par texte, et Échap la vide', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    const search = screen.getByRole('searchbox', { name: 'Rechercher dans le dossier' });
    await user.type(search, 'video');
    const labels = listButtons().map((b) => b.textContent ?? '');
    expect(labels.some((l) => l.includes('Journal vidéo'))).toBe(true);
    expect(labels.every((l) => !l.includes('Ana Sorel'))).toBe(true);
    await user.type(search, 'zzzz');
    expect(screen.getByRole('status', { name: '' })).toBeInTheDocument();
    expect(screen.getByText(/Aucun élément ne correspond à « videozzzz »/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
    expect(listButtons().length).toBeGreaterThan(10);
  });

  it('les flèches déplacent le focus entre les éléments de la liste', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    const buttons = listButtons();
    buttons[0]?.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(buttons[1]);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(buttons[0]);
  });
});

describe('<CasefilePanel /> — fiche de pièce', () => {
  it('un clic sur une pièce la sélectionne dans le store et ouvre sa fiche', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    const item = listButtons().find((b) => b.dataset.id === 'e_camera_gap');
    expect(item).toBeDefined();
    if (!item) return;
    await user.click(item);
    expect(useGameStore.getState().selection).toEqual({ kind: 'evidence', id: 'e_camera_gap' });
    expect(item).toHaveAttribute('aria-current', 'true');
    const sheet = screen.getByRole('region', { name: 'Fiche : Journal vidéo' });
    expect(within(sheet).getByRole('heading', { level: 3, name: 'Journal vidéo' })).toBeInTheDocument();
    expect(within(sheet).getByText(/Le flux des zones centrales est absent/)).toBeInTheDocument();
    expect(within(sheet).getByText('Flux vidéo absent')).toBeInTheDocument();
  });

  it('« Voir sur le plan / la frise » place le curseur sur le marqueur', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    useGameStore.getState().select('evidence', 'e_camera_gap');
    const sheet = await screen.findByRole('region', { name: 'Fiche : Journal vidéo' });
    await user.click(within(sheet).getByRole('button', { name: 'Voir sur le plan / la frise' }));
    expect(useGameStore.getState().cursor).toBe(500);
    expect(useGameStore.getState().highlightIds).toEqual(['office']);
    expect(useGameStore.getState().liveMessage).toMatch(/Journal vidéo/);
  });

  it('la case « Jointe au rapport » est désactivée et expliquée pour une pièce initiale', () => {
    render(<CasefilePanel />);
    useGameStore.getState().select('evidence', 'e_till_report');
    const sheet = screen.getByRole('region', { name: 'Fiche : Rapport de caisse' });
    const checkbox = within(sheet).getByRole('checkbox', { name: 'Jointe au rapport' });
    expect(checkbox).toBeDisabled();
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAccessibleDescription(/Pièce initiale du dossier/);
    expect(checkbox).toHaveAttribute('title', expect.stringMatching(/ne peut pas en être retirée/));
  });

  it('décocher « Jointe au rapport » sur une pièce débloquée dispatch set-evidence-attached', async () => {
    const user = userEvent.setup();
    const r = useGameStore.getState().dispatch({
      type: 'confront',
      characterId: ana,
      targetId: 's_ana_initial',
      supportId: 'e_till_report',
      approach: 'neutral',
    });
    expect(r.ok).toBe(true);
    render(<CasefilePanel />);
    useGameStore.getState().select('evidence', 'e_drawer_log');
    const sheet = screen.getByRole('region', { name: 'Fiche : Ouverture manuelle' });
    const checkbox = within(sheet).getByRole('checkbox', { name: 'Jointe au rapport' });
    expect(checkbox).toBeEnabled();
    await user.click(checkbox);
    expect(useGameStore.getState().game?.detachedEvidenceIds).toContain('e_drawer_log');
    expect(within(sheet).getByRole('checkbox', { name: 'Jointe au rapport' })).not.toBeChecked();
    expect(within(sheet).getByText('hors rapport')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('checkbox', { name: 'Jointe au rapport' }));
    expect(useGameStore.getState().game?.detachedEvidenceIds).not.toContain('e_drawer_log');
  });

  it('« Utiliser dans une confrontation » ouvre le dialogue avec la pièce en appui', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    useGameStore.getState().select('evidence', 'e_camera_gap');
    const sheet = screen.getByRole('region', { name: 'Fiche : Journal vidéo' });
    await user.click(within(sheet).getByRole('button', { name: 'Utiliser dans une confrontation' }));
    expect(useGameStore.getState().dialog).toBe('confrontation');
    expect(useGameStore.getState().confrontationDraft.supportId).toBe('e_camera_gap');
  });
});

describe('<CasefilePanel /> — déclarations et personnes', () => {
  it('« Utiliser comme appui » ouvre le dialogue de confrontation avec supportId', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    await user.click(screen.getByRole('button', { name: /^Déclarations/ }));
    const item = listButtons().find((b) => b.dataset.id === 's_malik_initial');
    expect(item).toBeDefined();
    if (!item) return;
    await user.click(item);
    const sheet = screen.getByRole('region', { name: /^Fiche : / });
    expect(within(sheet).getByText(/Ana m'a donné une pochette/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Utiliser comme appui' }));
    expect(useGameStore.getState().dialog).toBe('confrontation');
    expect(useGameStore.getState().confrontationDraft.supportId).toBe('s_malik_initial');
  });

  it('« Confronter à ce sujet » prépare le brouillon avec locuteur et cible', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    useGameStore.getState().select('statement', 's_malik_initial');
    const sheet = screen.getByRole('region', { name: /^Fiche : / });
    await user.click(within(sheet).getByRole('button', { name: 'Confronter à ce sujet' }));
    const draft = useGameStore.getState().confrontationDraft;
    expect(draft.characterId).toBe('malik');
    expect(draft.targetId).toBe('s_malik_initial');
    expect(useGameStore.getState().dialog).toBe('confrontation');
  });

  it('après une confrontation, la précision apparaît (« nouveau ») et l’ancienne déclaration est rétractée', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    const before = listButtons().map((b) => b.dataset.id);
    expect(before).not.toContain('s_malik_clarified');
    const r = useGameStore.getState().dispatch({
      type: 'confront',
      characterId: malik,
      targetId: 's_malik_initial',
      supportId: 'e_camera_gap',
      approach: 'empathetic',
    });
    expect(r.ok).toBe(true);
    const fresh = await screen.findAllByText('nouveau');
    expect(fresh.length).toBeGreaterThanOrEqual(1);
    const clarified = listButtons().find((b) => b.dataset.id === 's_malik_clarified');
    expect(clarified).toBeDefined();
    expect(clarified?.textContent).toContain('nouveau');
    const initial = listButtons().find((b) => b.dataset.id === 's_malik_initial');
    expect(initial?.textContent).toContain('rétractée');
    expect(initial?.querySelector('.casefile-item-label-historic')).not.toBeNull();

    const malikItem = listButtons().find((b) => b.dataset.id === 'malik');
    if (!malikItem) throw new Error('Malik absent de la liste');
    await user.click(malikItem);
    const sheet = screen.getByRole('region', { name: 'Fiche : Malik Bensaïd' });
    expect(within(sheet).getByRole('heading', { level: 3, name: 'Malik Bensaïd' })).toBeInTheDocument();
    expect(within(sheet).getByRole('img', { name: 'Portrait de Malik Bensaïd' })).toHaveAttribute(
      'data-portrait-state',
      'available',
    );
    expect(within(sheet).getByText(/Confiance/)).toHaveTextContent('disponible');
    const rows = within(sheet).getAllByRole('listitem').filter((li) => li.classList.contains('casefile-statement-row'));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.dataset.historic).toBeUndefined();
    expect(rows[1]?.dataset.historic).toBe('true');
    expect(rows[1]?.querySelector('s')).not.toBeNull();
    expect(rows[1]?.textContent).toContain('rétractée');
    expect(within(sheet).getByText('admettre avoir laissé la pochette sans surveillance')).toBeInTheDocument();
    expect(within(sheet).getByText('Aucune perception révélée.')).toBeInTheDocument();

    // La déclaration rétractée mène à sa précision.
    await user.click(rows[1]?.querySelector('button') as HTMLButtonElement);
    expect(useGameStore.getState().selection).toEqual({ kind: 'statement', id: 's_malik_initial' });
    const statementSheet = screen.getByRole('region', { name: /^Fiche : / });
    expect(within(statementSheet).getByText('rétractée')).toBeInTheDocument();
    await user.click(within(statementSheet).getByRole('button', { name: /Lire la précision/ }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'statement', id: 's_malik_clarified' });
  });

  it('sonder Malik avec « Vol par Malik » dispatch un probe et affiche sa réaction', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    useGameStore.getState().select('character', 'malik');
    const sheet = screen.getByRole('region', { name: 'Fiche : Malik Bensaïd' });
    const toggle = within(sheet).getByRole('button', { name: 'Sonder avec une hypothèse' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    await user.selectOptions(within(sheet).getByRole('combobox', { name: 'Hypothèse à soumettre' }), 'h_malik_theft');
    await user.click(within(sheet).getByRole('radio', { name: 'directe' }));
    await user.click(within(sheet).getByRole('button', { name: 'Sonder Malik Bensaïd' }));
    const history = useGameStore.getState().game?.probeHistory ?? [];
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ characterId: 'malik', targetId: 'h_malik_theft', approach: 'direct' });
    const reaction = within(sheet).getByRole('region', { name: 'Réaction de Malik Bensaïd' });
    expect(reaction).toHaveTextContent(history[0]?.text ?? '∅');
    expect(reaction).toHaveTextContent(/Vol par Malik/);
    expect(useGameStore.getState().liveMessage).toContain('Malik Bensaïd réagit');
  });

  it('« Confronter » depuis la fiche personne prépare le brouillon et ouvre le dialogue', async () => {
    const user = userEvent.setup();
    useGameStore.getState().setConfrontationDraft({ targetId: 's_ana_initial' });
    render(<CasefilePanel />);
    useGameStore.getState().select('character', 'malik');
    const sheet = screen.getByRole('region', { name: 'Fiche : Malik Bensaïd' });
    await user.click(within(sheet).getByRole('button', { name: 'Confronter' }));
    expect(useGameStore.getState().confrontationDraft.characterId).toBe('malik');
    expect(useGameStore.getState().confrontationDraft.targetId).toBeNull();
    expect(useGameStore.getState().dialog).toBe('confrontation');
  });
});

describe('<CasefilePanel /> — faits, hypothèses, contradictions, journal', () => {
  it('« Rejouer ce moment » place le curseur au début du fait et sélectionne le fait', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    const fact = currentView().facts.find((f) => f.id === 'f_count_complete');
    if (!fact) throw new Error('Fait public absent');
    const item = listButtons().find((b) => b.dataset.id === 'f_count_complete');
    if (!item) throw new Error('Fait absent de la liste');
    await user.click(item);
    const sheet = screen.getByRole('region', { name: `Fiche : ${fact.label}` });
    expect(within(sheet).getByText('Ana Sorel')).toBeInTheDocument();
    expect(within(sheet).getByText('Caisses')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Rejouer ce moment' }));
    expect(useGameStore.getState().cursor).toBe(fact.interval.start);
    expect(useGameStore.getState().selection).toEqual({ kind: 'fact', id: 'f_count_complete' });
    expect(useGameStore.getState().highlightIds).toEqual(['checkout', 'ana', 'malik']);
  });

  it('« Ajouter à la version » ouvre le formulaire de claim pour l’emplacement de l’hypothèse', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    useGameStore.getState().select('hypothesis', 'h_malik_theft');
    const sheet = screen.getByRole('region', { name: 'Fiche : Vol par Malik' });
    expect(within(sheet).getByText("Origine de l'écart")).toBeInTheDocument();
    expect(within(sheet).getByText('désigne une personne')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter à la version' }));
    expect(useGameStore.getState().dialog).toBe('claim-form');
    expect(useGameStore.getState().claimForm).toEqual({ slotId: 'cash_origin', hypothesisId: 'h_malik_theft' });
  });

  it('un clic sur une contradiction bascule l’inspecteur sur l’onglet contradictions', async () => {
    const user = userEvent.setup();
    useGameStore.getState().setInspectorTab('version');
    render(<CasefilePanel />);
    const item = listButtons().find((b) => b.dataset.kind === 'contradiction');
    if (!item) throw new Error('Aucune contradiction dans la liste');
    await user.click(item);
    const state = useGameStore.getState();
    expect(state.selection?.kind).toBe('contradiction');
    expect(state.selection?.id).toBe(item.dataset.id);
    expect(state.inspectorTab).toBe('contradictions');
    expect(state.liveMessage).toMatch(/ouverte dans l’inspecteur/);
    const sheet = screen.getByRole('region', { name: /^Fiche : / });
    expect(within(sheet).getByRole('button', { name: 'Ouvrir dans l’inspecteur' })).toBeInTheDocument();
  });

  it('le journal liste les entrées, rend l’annotation manuscrite et ses références naviguent', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    await user.click(screen.getByRole('button', { name: /^Journal/ }));
    expect(screen.getByText(/Le journal est vide/)).toBeInTheDocument();
    const r = useGameStore.getState().dispatch({
      type: 'confront',
      characterId: malik,
      targetId: 's_malik_initial',
      supportId: 'e_camera_gap',
      approach: 'empathetic',
    });
    expect(r.ok).toBe(true);
    const entries = await screen.findAllByRole('listitem');
    expect(entries).toHaveLength(3);
    expect(entries[0]?.dataset.kind).toBe('confrontation');
    expect(entries[2]?.dataset.kind).toBe('annotation');
    expect(entries[2]?.querySelector('.hand-note')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^Journal/ })).toHaveTextContent('(3)');
    await user.click(within(entries[0] as HTMLElement).getByRole('button', { name: /Journal vidéo/ }));
    expect(useGameStore.getState().selection).toEqual({ kind: 'evidence', id: 'e_camera_gap' });
    expect(screen.getByRole('region', { name: 'Fiche : Journal vidéo' })).toBeInTheDocument();
  });

  it('« Retour à la liste » referme la fiche sans perdre la sélection', async () => {
    const user = userEvent.setup();
    render(<CasefilePanel />);
    useGameStore.getState().select('character', 'ana');
    expect(screen.getByRole('region', { name: 'Fiche : Ana Sorel' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retour à la liste' }));
    expect(screen.queryByRole('region', { name: 'Fiche : Ana Sorel' })).not.toBeInTheDocument();
    expect(useGameStore.getState().selection).toEqual({ kind: 'character', id: 'ana' });
    expect(document.querySelector('.casefile')?.getAttribute('data-sheet-open')).toBe('false');
    useGameStore.getState().select('character', 'malik');
    expect(await screen.findByRole('region', { name: 'Fiche : Malik Bensaïd' })).toBeInTheDocument();
  });
});
