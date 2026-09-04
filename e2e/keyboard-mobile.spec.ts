import { expect, test } from '@playwright/test';
import { confront, goToSpace, isMobile, openFreshGame, placeClaim } from './support/game';

test.describe('Parcours 5 — mobile 390 × 844 et clavier', () => {
  test('sélectionner une preuve, déplacer le temps, ajouter une hypothèse, lire une contradiction, confronter, sauvegarder', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await openFreshGame(page);
    const mobile = isMobile(page);
    // Aucun débordement horizontal
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Sélectionner une preuve
    await goToSpace(page, 'Dossier');
    await page
      .getByRole('toolbar', { name: 'Filtrer le dossier' })
      .getByRole('button', { name: /^Pièces/ })
      .click();
    await page.locator('.casefile-item').filter({ hasText: 'Journal vidéo' }).first().click();
    await expect(page.getByText(/Le flux des zones centrales est absent/)).toBeVisible();

    // Déplacer le temps
    await goToSpace(page, 'Temps');
    await page.getByRole('button', { name: 'Aller à la coupure' }).click();
    await page.getByRole('button', { name: 'Avancer de 10 secondes' }).click();
    await expect(page.getByText('20:57:30').first()).toBeVisible();

    // Ajouter une hypothèse impossible et lire sa contradiction
    await placeClaim(page, 'Interruption vidéo', 'Débranchement volontaire', {
      actor: 'Malik Bensaïd — Caissier',
    });
    await page.getByRole('tab', { name: 'Contradictions' }).click();
    await page
      .locator('.space[data-space="inspector"]')
      .getByRole('button', { name: /Malik Bensaïd ne peut pas être à deux endroits/ })
      .first()
      .click();
    await expect(
      page
        .locator('.space[data-space="inspector"]')
        .getByText(/Rayon 2/)
        .first(),
    ).toBeVisible();

    // Confronter
    await confront(
      page,
      'Malik Bensaïd',
      /posée directement sur son bureau/,
      'Journal vidéo',
      'neutre',
    );

    // Sauvegarder
    if (mobile) await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Sauvegardes' }).click();
    const saves = page.getByRole('dialog', { name: 'Sauvegardes' });
    await saves.getByRole('button', { name: 'Sauvegarder ici (Emplacement 2)' }).click();
    await expect(saves.getByText(/Emplacement 2/).first()).toBeVisible();
    const overflowAfter = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflowAfter).toBeLessThanOrEqual(0);
  });

  test('raccourcis clavier : espaces, curseur, aide', async ({ page }) => {
    test.skip(isMobile(page), 'raccourcis desktop');
    await openFreshGame(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('20:49:02').first()).toBeVisible();
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.getByText('20:49:12').first()).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.getByText('21:15:00').first()).toBeVisible();
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: /Aide/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /Aide/ })).toBeHidden();
  });
});
