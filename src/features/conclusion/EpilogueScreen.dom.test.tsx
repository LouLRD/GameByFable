// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PlayerAction } from '@/domain/model/actions';
import { characterId, claimSlotId, hypothesisId } from '@/domain/model/ids';
import { useGameStore } from '@/state';

import { EpilogueScreen } from './EpilogueScreen';

/** Séquence menant à la table ronde (deux révélations structurantes, cinq emplacements remplis). */
const ROUND_TABLE_ACTIONS: PlayerAction[] = [
  {
    type: 'confront',
    characterId: characterId('jo'),
    targetId: 's_jo_initial',
    supportId: 'e_camera_gap',
    approach: 'neutral',
  },
  {
    type: 'confront',
    characterId: characterId('ines'),
    targetId: 's_ines_initial',
    supportId: 'e_pallet_scan',
    approach: 'empathetic',
  },
  ...(
    [
      ['cash_origin', 'h_counting_error'],
      ['video_outage', 'h_scheduled_reboot'],
      ['receipt_path', 'h_no_receipt'],
      ['noise_source', 'h_freezer_alarm'],
      ['manager_knowledge', 'h_ana_unaware'],
    ] as const
  ).map(([slot, hypothesis]): PlayerAction => ({
    type: 'set-claim',
    slotId: claimSlotId(slot),
    hypothesisId: hypothesisId(hypothesis),
  })),
  { type: 'request-round-table' },
];

function prepare(seal: boolean): void {
  const store = useGameStore.getState();
  store.bootstrap();
  store.newGame();
  const actions = seal
    ? [...ROUND_TABLE_ACTIONS, { type: 'seal-report' } as const]
    : ROUND_TABLE_ACTIONS;
  for (const action of actions) {
    const result = useGameStore.getState().dispatch(action);
    if (!result.ok)
      throw new Error(`Préparation impossible (${action.type}) : ${result.error.message}`);
  }
}

describe('<EpilogueScreen />', () => {
  afterEach(() => {
    cleanup();
  });

  it('n’est pas rendu tant que le rapport n’est pas scellé', () => {
    prepare(false);
    render(<EpilogueScreen />);
    expect(screen.queryByRole('main')).toBeNull();
    expect(useGameStore.getState().game?.phase).toBe('round-table');
  });

  describe('après scellement', () => {
    beforeEach(() => {
      prepare(true);
    });

    it('affiche le sceau : titre de la fin, famille traduite, épilogue et signatures', () => {
      render(<EpilogueScreen />);
      const main = screen.getByRole('main');
      expect(
        within(main).getByRole('heading', { level: 1, name: 'Personne ne signe' }),
      ).toBeInTheDocument();
      expect(within(main).getByText(/famille : Rejet/)).toBeInTheDocument();
      expect(within(main).getByText(/La table ronde se défait/)).toBeInTheDocument();
      expect(within(main).getByText('0 signature sur 6')).toBeInTheDocument();

      const signatures = within(main).getByRole('list', { name: 'Signatures' });
      const rows = within(signatures)
        .getAllByRole('listitem')
        .filter((li) => li.classList.contains('sig-row'));
      expect(rows).toHaveLength(6);
      expect(within(signatures).getByText(/Changez ça, et on en reparle/)).toBeInTheDocument();
      expect(within(signatures).getAllByText('demande une modification')).toHaveLength(6);
    });

    it('compare la version signée aux faits dans un tableau à en-têtes, 5 lignes et un total', () => {
      render(<EpilogueScreen />);
      const table = screen.getByRole('table');
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent);
      expect(headers).toEqual(['Emplacement', 'Version signée', 'Faits', 'Accord']);

      const body = table.querySelector('tbody');
      const rows = within(table).getAllByRole('row').slice(1);
      expect(rows).toHaveLength(5);
      expect(body).not.toBeNull();

      const video = within(table).getByRole('row', { name: /Interruption vidéo/ });
      expect(within(video).getByText('Redémarrage programmé')).toBeInTheDocument();
      expect(within(video).getByText('Surcharge locale')).toBeInTheDocument();
      expect(within(video).getByText('diffère')).toBeInTheDocument();

      const cash = within(table).getByRole('row', { name: /Origine de l'écart/ });
      expect(within(cash).getByText(/resté dans l’ombre/)).toBeInTheDocument();

      expect(screen.getByText('0 emplacement sur 5 correspond aux faits.')).toBeInTheDocument();
    });

    it('déroule la soirée : faits révélés détaillés, faits non élucidés caviardés', () => {
      render(<EpilogueScreen />);
      const revealed = screen.getByText('Comptage de fermeture : 300 € manquants').closest('li');
      expect(revealed).not.toBeNull();
      expect(revealed).toHaveAttribute('data-revealed', 'true');
      expect(within(revealed as HTMLElement).getByText('Caisses')).toBeInTheDocument();
      expect(
        within(revealed as HTMLElement).getByText(/Ana Sorel, Malik Bensaïd/),
      ).toBeInTheDocument();
      expect(within(revealed as HTMLElement).getByText(/21:09:40 – 21:12:00/)).toBeInTheDocument();

      const shadow = screen.getAllByText(/fait non élucidé/);
      expect(shadow.length).toBeGreaterThan(0);
      expect(
        screen.getByText(/fait non élucidé — lié à « Parcours du justificatif »/),
      ).toBeInTheDocument();
      const shadowItems = document.querySelectorAll('li[data-revealed="false"]');
      expect(shadowItems).toHaveLength(11);
      for (const item of Array.from(shadowItems)) {
        // Aucune heure, aucun lieu, aucun participant dans une entrée caviardée.
        expect(item.textContent).not.toMatch(/\d{2}:\d{2}:\d{2}/);
      }
      expect(screen.getByText(/11 faits restent dans l’ombre/)).toBeInTheDocument();
      expect(screen.queryByText('Pièces omises du rapport')).toBeNull();
    });

    it('le curseur des trajectoires déplace les jetons et la liste textuelle suit', () => {
      const { container } = render(<EpilogueScreen />);
      const range = screen.getByRole('slider', { name: 'Heure de la soirée' });
      expect(range).toHaveValue('0');
      expect(range).toHaveAttribute('aria-valuetext', '20:49:00');

      const tokenAt = (id: string): string | null =>
        container.querySelector(`.traj-token[data-character="${id}"]`)?.getAttribute('data-zone') ??
        null;
      const listed = (id: string): string =>
        container.querySelector(`.traj-list li[data-character="${id}"]`)?.textContent ?? '';

      expect(tokenAt('ana')).toBe('checkout');
      expect(listed('ana')).toMatch(/Caisses/);

      fireEvent.change(range, { target: { value: '400' } });
      expect(range).toHaveAttribute('aria-valuetext', '20:55:40');
      expect(tokenAt('ana')).toBe('office');
      expect(listed('ana')).toMatch(/Bureau/);
      expect(tokenAt('mina')).toBe('stockroom');

      // Entre deux segments : le jeton disparaît, la liste dit « en déplacement ».
      fireEvent.change(range, { target: { value: '250' } });
      expect(tokenAt('ana')).toBeNull();
      expect(listed('ana')).toMatch(/en déplacement/);

      // Après la fin de sa trajectoire, Noé a quitté le plan.
      fireEvent.change(range, { target: { value: '1500' } });
      expect(tokenAt('noe')).toBeNull();
      expect(listed('noe')).toMatch(/a quitté le plan/);
      expect(container.querySelectorAll('.traj-token')).toHaveLength(5);
    });

    it('les boutons ± 30 s bornent le curseur au début et à la fin', async () => {
      const user = userEvent.setup();
      render(<EpilogueScreen />);
      const range = screen.getByRole('slider', { name: 'Heure de la soirée' });
      await user.click(screen.getByRole('button', { name: '− 30 s' }));
      expect(range).toHaveValue('0');
      await user.click(screen.getByRole('button', { name: '+ 30 s' }));
      expect(range).toHaveValue('30');
      await user.click(screen.getByRole('button', { name: 'Fin' }));
      expect(range).toHaveValue('1560');
      await user.click(screen.getByRole('button', { name: '+ 30 s' }));
      expect(range).toHaveValue('1560');
    });

    it('liste les autres fins avec un indice, sans la fin obtenue ni ses conditions', () => {
      render(<EpilogueScreen />);
      const list = screen.getByRole('list', { name: 'Autres fins' });
      const titles = within(list)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent);
      expect(titles).toEqual([
        'Tout écrire',
        'Réparer sans exposer',
        'Une histoire simple',
        "Classer l'écart",
      ]);
      expect(titles).not.toContain('Personne ne signe');
      expect(within(list).getByText(/sans inventer de coupable/)).toBeInTheDocument();
      expect(within(list).queryByText(/signatures? minimum|requiert|condition/i)).toBeNull();
    });

    it('ne propose aucun bouton d’édition ; « Nouvelle partie », « Exporter » et « Relire » agissent', async () => {
      const user = userEvent.setup();
      render(<EpilogueScreen />);
      const names = screen.getAllByRole('button').map((b) => b.textContent ?? '');
      expect(names.some((n) => /sceller|retravailler|placer|modifier|confront/i.test(n))).toBe(
        false,
      );

      await user.click(screen.getByRole('button', { name: 'Nouvelle partie' }));
      expect(useGameStore.getState().dialog).toBe('new-game');
      act(() => {
        useGameStore.getState().closeDialog();
      });

      await user.click(screen.getByRole('button', { name: 'Exporter cette partie' }));
      const toasts = useGameStore.getState().toasts;
      expect(toasts.length).toBeGreaterThan(0);
      expect(toasts[toasts.length - 1]?.text).toMatch(/export/i);

      const reread = screen.getByRole('button', { name: 'Relire le dossier' });
      expect(reread).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('list', { name: 'Journal du dossier' })).toBeNull();
      await user.click(reread);
      expect(reread).toHaveAttribute('aria-expanded', 'true');
      const journal = screen.getByRole('list', { name: 'Journal du dossier' });
      const entries = within(journal).getAllByRole('listitem');
      expect(entries.length).toBe(useGameStore.getState().game?.journal.length);
      expect(within(journal).getByText(/Table ronde ouverte/)).toBeInTheDocument();
      expect(within(journal).getAllByText('sceau').length).toBeGreaterThan(0);
      // Le rapport reste scellé : aucune action n'a modifié la partie.
      expect(useGameStore.getState().game?.phase).toBe('sealed');
    });
  });
});
