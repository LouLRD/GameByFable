import { expect, test } from '@playwright/test';
import { placeClaim } from './support/game';

test.describe('Parcours 1 — onboarding au clavier et première contradiction', () => {
  test('onboarding sans souris, hypothèse impossible expliquée, puis corrigée', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    // Onboarding au clavier : Tab jusqu'à « Ouvrir le dossier », Entrée, puis « Compris » à chaque repère.
    const open = page.getByRole('button', { name: 'Ouvrir le dossier' });
    await expect(open).toBeVisible();
    await open.focus();
    await page.keyboard.press('Enter');
    for (let i = 0; i < 6; i += 1) {
      const compris = page.getByRole('button', { name: 'Compris' });
      if (!(await compris.isVisible().catch(() => false))) break;
      await compris.focus();
      await page.keyboard.press('Enter');
    }
    // Première hypothèse : coupure volontaire par Malik (au bureau pendant la coupure) → impossible.
    await page
      .getByRole('button', { name: 'Choisir une hypothèse pour « Interruption vidéo »' })
      .focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: /Hypothèse — Interruption vidéo/ });
    await dialog
      .getByLabel('Hypothèse', { exact: true })
      .selectOption({ label: 'Débranchement volontaire' });
    await dialog.getByLabel(/^Acteur/).selectOption({ label: 'Malik Bensaïd — Caissier' });
    await dialog.getByRole('button', { name: 'Placer dans la version' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();

    await page.getByRole('tab', { name: 'Contradictions' }).click();
    const inspector = page.getByRole('region', { name: /Version|Contradictions/ }).first();
    await expect(
      page
        .locator('.space[data-space="inspector"]')
        .getByText(/Malik Bensaïd ne peut pas être à deux endroits/)
        .first(),
    ).toBeVisible();
    await page
      .locator('.space[data-space="inspector"]')
      .getByRole('button', { name: /Malik Bensaïd ne peut pas être à deux endroits/ })
      .first()
      .click();
    // L'explication cite la position établie par la caméra et le chevauchement.
    await expect(
      page
        .locator('.space[data-space="inspector"]')
        .getByText(/Rayon 2/)
        .first(),
    ).toBeVisible();
    await expect(
      page
        .locator('.space[data-space="inspector"]')
        .getByText(/caméra/)
        .first(),
    ).toBeVisible();
    inspector;

    // Correction : Ana (au bureau, hors champ) rend l'hypothèse possible → la contradiction disparaît.
    await placeClaim(page, 'Interruption vidéo', 'Débranchement volontaire', {
      actor: 'Ana Sorel — Responsable de fermeture',
    });
    await page.getByRole('tab', { name: 'Contradictions' }).click();
    await expect(
      page.locator('.space[data-space="inspector"]').getByRole('button', {
        name: /critique.*Malik Bensaïd ne peut pas être à deux endroits|Malik Bensaïd ne peut pas être à deux endroits.*critique/,
      }),
    ).toHaveCount(0);
    await page.getByRole('tab', { name: 'Version' }).click();
    await expect(
      page.locator('.space[data-space="inspector"] [data-status="unknown"]').first(),
    ).toBeVisible();
  });
});
