import { expect, test } from '@playwright/test';
import { openFreshGame, placeClaim, requestRoundTableAndSeal, runCanonicalConfrontations, confront } from './support/game';

test.describe('Parcours 4 — deux fins distinctes', () => {
  test('résolution physique cohérente jusqu’à « Tout écrire »', async ({ page }) => {
    test.setTimeout(180_000);
    await openFreshGame(page);
    await runCanonicalConfrontations(page);
    await placeClaim(page, "Origine de l'écart", 'Remboursement manuel');
    await placeClaim(page, 'Interruption vidéo', 'Surcharge locale');
    await placeClaim(page, 'Parcours du justificatif', 'Justificatif caché');
    await placeClaim(page, 'Bruit de la réserve', 'Chariot sur le seuil');
    await placeClaim(page, "Connaissance d'Ana", 'Décision improvisée');
    await expect(page.getByText(/Version cohérente/i).first()).toBeVisible();
    await requestRoundTableAndSeal(page);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Tout écrire' })).toBeVisible();
    await expect(main).toContainText(/famille : Vérité/i);
    await expect(main).toContainText(/5 emplacements sur 5 correspondent aux faits/);
    await expect(main).toContainText(/6 signature/);
  });

  test('version socialement protectrice qui conserve une omission', async ({ page }) => {
    test.setTimeout(180_000);
    await openFreshGame(page);
    await confront(page, 'Malik Bensaïd', /pochette directement sur son bureau/, 'Journal vidéo', 'empathique');
    await confront(page, 'Jo Harel', /palette n'est entrée/, 'Journal vidéo', 'neutre');
    await confront(page, 'Inès Vidal', /restée dans l'allée froide/, 'Scan de la palette', 'empathique');
    await confront(page, 'Noé Rami', /vu Inès y entrer/, 'Scan de la palette', 'neutre');
    await confront(page, 'Ana Sorel', /rien fait d'inhabituel/, 'Rapport de caisse', 'empathique');
    await confront(page, 'Ana Sorel', /rien fait d'inhabituel/, 'Ouverture manuelle', 'neutre');
    await placeClaim(page, "Origine de l'écart", 'Remboursement manuel');
    await placeClaim(page, 'Interruption vidéo', 'Surcharge locale');
    await placeClaim(page, 'Parcours du justificatif', 'Document perdu');
    await placeClaim(page, 'Bruit de la réserve', 'Chariot sur le seuil');
    await placeClaim(page, "Connaissance d'Ana", 'Décision improvisée');
    await requestRoundTableAndSeal(page);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Réparer sans exposer' })).toBeVisible();
    await expect(main).toContainText(/famille : Consensus/i);
    await expect(main).toContainText(/resté dans l’ombre/);
    await expect(main).toContainText(/4 emplacements sur 5/);
    // Mina a signé sans un mot ; l'emplacement réel du justificatif n'est pas révélé.
    await expect(main).toContainText(/Mina Koenig a signé sans un mot/);
    await expect(main).not.toContainText(/fiche d’entretien/);
  });

  test('classer l’écart : une version non étayée mais signable', async ({ page }) => {
    test.setTimeout(180_000);
    await openFreshGame(page);
    await confront(page, 'Jo Harel', /palette n'est entrée/, 'Journal vidéo', 'directe');
    await confront(page, 'Malik Bensaïd', /pochette directement sur son bureau/, 'Journal vidéo', 'directe');
    await placeClaim(page, "Origine de l'écart", 'Erreur de comptage');
    await placeClaim(page, 'Interruption vidéo', 'Redémarrage programmé');
    await placeClaim(page, 'Parcours du justificatif', 'Aucun justificatif');
    await placeClaim(page, 'Bruit de la réserve', 'Alarme froide');
    await placeClaim(page, "Connaissance d'Ana", "Responsable dans l'ignorance");
    await requestRoundTableAndSeal(page);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: "Classer l'écart" })).toBeVisible();
    await expect(main).toContainText(/famille : Classement/i);
  });
});
