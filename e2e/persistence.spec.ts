import { expect, test } from '@playwright/test';
import { confront, openFreshGame, placeClaim, pressure } from './support/game';

test.describe('Parcours 3 — persistance', () => {
  test('sauvegarde manuelle, rechargement, export puis import équivalent', async ({ page }) => {
    test.setTimeout(180_000);
    await openFreshGame(page);
    await placeClaim(page, "Origine de l'écart", 'Erreur de comptage');
    await placeClaim(page, 'Interruption vidéo', 'Redémarrage programmé');
    await placeClaim(page, 'Bruit de la réserve', 'Bouteille cassée');
    await confront(page, 'Malik Bensaïd', /pochette directement sur son bureau/, 'Journal vidéo', 'empathique');
    await page.getByRole('button', { name: 'Placer le curseur au début de la coupure (20:57:20)' }).click();
    const pressureBefore = await pressure(page);

    await page.getByRole('button', { name: 'Sauvegardes' }).click();
    const saves = page.getByRole('dialog', { name: 'Sauvegardes' });
    await saves.getByRole('button', { name: 'Sauvegarder ici (Emplacement 1)' }).click();
    await expect(saves.getByText(/Emplacement 1/).first()).toBeVisible();
    await saves.getByRole('button', { name: 'Fermer la fenêtre' }).click();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Version proposée' })).toBeVisible();
    await expect(page.getByText('Erreur de comptage').first()).toBeVisible();
    await expect(page.getByText('Redémarrage programmé').first()).toBeVisible();
    await expect(page.getByText('Bouteille cassée').first()).toBeVisible();
    expect(await pressure(page)).toBe(pressureBefore);
    await expect(page.getByText('20:57:20').first()).toBeVisible();
    await page.getByRole('toolbar', { name: 'Filtrer le dossier' }).getByRole('button', { name: /^Personnes/ }).click();
    await expect(page.locator('.casefile-item').filter({ hasText: 'Malik Bensaïd' }).first()).toContainText(/disponible/i);

    // Export
    await page.getByRole('button', { name: 'Sauvegardes' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('dialog', { name: 'Sauvegardes' }).getByRole('button', { name: 'Exporter (JSON)' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^la-veilleuse-300_\d{4}-\d{2}-\d{2}_\d{2}h\d{2}\.json$/);
    const path = await download.path();
    const fs = await import('node:fs');
    const json = fs.readFileSync(path ?? '', 'utf8');
    expect(JSON.parse(json)).toMatchObject({ kind: 'la-version-acceptable-save', formatVersion: 2 });
    await page.getByRole('dialog', { name: 'Sauvegardes' }).getByRole('button', { name: 'Fermer la fenêtre' }).click();

    // Nouvelle partie puis import
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Commencer une nouvelle partie/ }).click();
    await page.getByRole('button', { name: 'Ouvrir le dossier' }).click().catch(() => undefined);
    await expect(page.getByText(/0\/5 emplacements remplis/)).toBeVisible();
    await page.getByRole('button', { name: 'Sauvegardes' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sauvegardes' });
    await dialog.getByLabel('Ou coller le JSON').fill(json);
    await dialog.getByRole('button', { name: 'Importer le texte' }).click();
    await expect(dialog.getByText(/Partie restaurée/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Fermer la fenêtre' }).click();
    await expect(page.getByText('Erreur de comptage').first()).toBeVisible();
    expect(await pressure(page)).toBe(pressureBefore);

    // Import invalide : non destructif
    await page.getByRole('button', { name: 'Sauvegardes' }).click();
    const again = page.getByRole('dialog', { name: 'Sauvegardes' });
    await again.getByLabel('Ou coller le JSON').fill('{"kind":"autre"}');
    await again.getByRole('button', { name: 'Importer le texte' }).click();
    await expect(again.getByRole('alert')).toContainText(/Import refusé/);
    await again.getByRole('button', { name: 'Fermer la fenêtre' }).click();
    await expect(page.getByText('Erreur de comptage').first()).toBeVisible();
  });
});
