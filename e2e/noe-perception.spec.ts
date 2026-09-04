import { expect, test } from '@playwright/test';
import { confront, openFreshGame } from './support/game';

test.describe('Parcours 2 — une perception n’est pas un fait', () => {
  test('la déclaration de Noé est reformulée sans que sa perception soit effacée', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFreshGame(page);
    // Examiner la déclaration de Noé
    await page
      .getByRole('toolbar', { name: 'Filtrer le dossier' })
      .getByRole('button', { name: /^Déclarations/ })
      .click();
    await page
      .locator('.casefile-item')
      .filter({ hasText: 'Inès est entrée dans la réserve' })
      .first()
      .click();
    await expect(page.getByText(/J'ai entendu la porte de la réserve claquer/)).toBeVisible();
    // Rejouer la période du bruit
    await page.getByRole('button', { name: 'Aller à la coupure' }).click();
    for (let i = 0; i < 3; i += 1)
      await page.getByRole('button', { name: 'Avancer de 10 secondes' }).click();
    await expect(page.getByRole('group', { name: /Plan du magasin à 20:57:50/ })).toBeVisible();
    // Débloquer l'information sur la palette, puis confronter Noé
    await confront(page, 'Jo Harel', /palette n'est entrée/, 'Journal vidéo', 'neutre');
    await confront(page, 'Noé Rami', /vu Inès y entrer/, 'Scan de la palette', 'neutre');
    // Sa déclaration est reformulée ; l'initiale reste visible, rétractée ; sa perception est conservée
    await page
      .getByRole('toolbar', { name: 'Filtrer le dossier' })
      .getByRole('button', { name: /^Personnes/ })
      .click();
    await page.locator('.casefile-item').filter({ hasText: 'Noé Rami' }).first().click();
    await expect(page.getByText(/Je n'ai pas vu le visage/)).toBeVisible();
    await expect(page.getByText(/rétractée/).first()).toBeVisible();
    await expect(page.getByText(/silhouette/).first()).toBeVisible();
  });
});
