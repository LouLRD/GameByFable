/**
 * Parcours mobile complet (390 × 844) — le téléphone comme terminal d'enquête.
 * Chaque test joue de vraies interactions ; les contrôles automatisés (débordement, recouvrement,
 * cibles tactiles, modales fermables) s'exécutent aux étapes clés.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { dismissOnboarding, escapeRegExp, openFreshGame } from './support/game';
import { loadForbiddenAtStart, THEMATIC_SECRETS } from './support/secrets';

test.skip(({ viewport }) => (viewport?.width ?? 1440) >= 1024, 'parcours mobile');

async function nav(page: Page, space: 'Plan' | 'Temps' | 'Dossier' | 'Version'): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Espaces de travail' })
    .getByRole('button', { name: new RegExp(`^${space}`) })
    .click();
}

async function openMenu(page: Page, item: RegExp): Promise<void> {
  await page.getByRole('button', { name: /^Menu/ }).click();
  await page.getByRole('dialog', { name: 'La Version Acceptable' }).getByRole('button', { name: item }).click();
}

/** Aucun débordement horizontal de la page. */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'débordement horizontal').toBeLessThanOrEqual(0);
}

/** L'élément est visible, entièrement dans l'écran, et n'est pas recouvert par la navigation. */
async function expectReachable(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const size = locator.page().viewportSize();
  expect(box, 'boîte de l’élément').not.toBeNull();
  if (!box || !size) return;
  expect(box.x, 'bord gauche').toBeGreaterThanOrEqual(-1);
  expect(box.y, 'bord haut').toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, 'bord droit').toBeLessThanOrEqual(size.width + 1);
  expect(box.y + box.height, 'bord bas').toBeLessThanOrEqual(size.height + 1);
  const covered = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top ? !(el === top || el.contains(top) || top.contains(el)) : true;
  });
  expect(covered, 'élément recouvert par un autre').toBe(false);
}

async function expectTapTarget(locator: Locator, min = 44): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.height, 'hauteur de cible tactile').toBeGreaterThanOrEqual(min - 0.5);
    expect(box.width, 'largeur de cible tactile').toBeGreaterThanOrEqual(min - 0.5);
  }
}

test.describe('Terminal mobile — parcours de bout en bout', () => {
  test('onboarding, preuve, plan, temps, hypothèse, contradiction, confrontation, sauvegardes', async ({ page }) => {
    test.setTimeout(240_000);
    // 1. Situation initiale et onboarding ---------------------------------------------------
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('mobile-shell')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole('heading', { name: /Bienvenue dans le dossier/ })).toBeVisible();
    await page.getByRole('button', { name: 'Ouvrir le dossier' }).click();
    const guide = page.getByTestId('guide-strip');
    await expect(guide).toBeVisible();
    await expectReachable(guide.getByRole('button', { name: 'Compris' }));
    await guide.getByRole('button', { name: 'Compris' }).click();
    // Le guide suivant vise le canevas : « Y aller » puis retour
    await expect(page.getByTestId('guide-strip')).toContainText(/Repère/);
    await page.getByTestId('guide-strip').getByRole('button', { name: 'Y aller' }).click();
    expect(await page.getByRole('tab', { name: 'Version' }).getAttribute('aria-selected')).toBe('true');
    await page.getByRole('button', { name: 'Tout passer' }).click();
    await expect(page.getByTestId('guide-strip')).toBeHidden();

    // Cibles tactiles de la navigation
    const navButtons = page.getByRole('navigation', { name: 'Espaces de travail' }).getByRole('button');
    for (let i = 0; i < 4; i += 1) await expectTapTarget(navButtons.nth(i));
    await expectTapTarget(page.getByRole('button', { name: /^Menu/ }));

    // 2. Consulter une preuve ------------------------------------------------------------------
    await nav(page, 'Dossier');
    await page.getByRole('toolbar', { name: 'Filtrer le dossier' }).getByRole('button', { name: /^Pièces/ }).click();
    await page.locator('.casefile-item').filter({ hasText: 'Journal vidéo' }).first().click();
    await expect(page.getByText(/Le flux des zones centrales est absent/)).toBeVisible();
    await expectReachable(page.getByRole('button', { name: 'Retour à la liste' }));
    await page.getByRole('button', { name: 'Retour à la liste' }).click();

    // 3. Sélectionner une zone et un personnage sur le plan ------------------------------------
    await nav(page, 'Plan');
    const map = page.getByRole('group', { name: /Plan du magasin à/ });
    await expect(map).toBeVisible();
    await map.getByRole('button', { name: /^Zone Caisses/ }).tap();
    await expect(page.getByRole('dialog', { name: /Caisses/ })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /Caisses/ })).toContainText(/Ana Sorel/);
    await page.getByRole('dialog', { name: /Caisses/ }).getByRole('button', { name: 'Fermer la fenêtre' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const jo = page.getByRole('button', { name: /Jo Harel/ }).first();
    await jo.tap();
    await expect(page.getByRole('dialog', { name: /Jo Harel/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // 4. Manipuler le temps précisément depuis le plan -------------------------------------------
    const strip = page.getByRole('group', { name: 'Curseur temporel (plan)' });
    await expectReachable(strip.getByRole('button', { name: 'Avancer de 10 secondes' }));
    for (let i = 0; i < 3; i += 1) await strip.getByRole('button', { name: 'Avancer de 10 secondes' }).click();
    await strip.getByRole('button', { name: 'Avancer d’une seconde' }).click();
    await expect(page.getByRole('button', { name: /Heure simulée 20:49:31/ })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Plan du magasin à 20:49:31' })).toBeVisible();
    // Espace Temps : aller à la coupure, puis pas fins
    await nav(page, 'Temps');
    await page.getByRole('button', { name: 'Aller à la coupure' }).click();
    await page.getByRole('button', { name: 'Avancer de 10 secondes' }).first().click();
    await expect(page.getByRole('button', { name: /Heure simulée 20:57:30/ })).toBeVisible();
    // 5. Suivre les déplacements : le plan reflète la coupure
    await nav(page, 'Plan');
    await expect(page.getByText(/Hors champ à cet instant/)).toBeVisible();

    // 6. Formuler puis remplacer une hypothèse -------------------------------------------------
    await nav(page, 'Version');
    await page.getByRole('tab', { name: 'Version' }).click();
    await page.getByRole('button', { name: 'Choisir une hypothèse pour « Interruption vidéo »' }).click();
    const form = page.getByRole('dialog', { name: /Hypothèse — Interruption vidéo/ });
    await form.getByLabel('Hypothèse', { exact: true }).selectOption({ label: 'Débranchement volontaire' });
    await form.getByLabel(/^Acteur/).selectOption({ label: 'Malik Bensaïd — Caissier' });
    await expectReachable(form.getByRole('button', { name: 'Placer dans la version' }));
    await form.getByRole('button', { name: 'Placer dans la version' }).click();
    await expect(form).toBeHidden();
    await expect(page.locator('.space, .mobile-space').getByText('Débranchement volontaire').first()).toBeVisible();

    // 7. Lire une contradiction et son raisonnement --------------------------------------------
    await page.getByRole('tab', { name: /Contradictions/ }).click();
    await page
      .getByRole('tabpanel')
      .getByRole('button', { name: /Malik Bensaïd ne peut pas être à deux endroits/ })
      .first()
      .click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText(/Rayon 2/).first()).toBeVisible();
    await expect(panel.getByText(/caméra/).first()).toBeVisible();
    // Remplacer l'hypothèse : Ana rend la version possible
    await page.getByRole('tab', { name: 'Version' }).click();
    await page.getByRole('button', { name: /^Modifier/ }).first().click();
    const form2 = page.getByRole('dialog', { name: /Hypothèse — Interruption vidéo/ });
    await form2.getByLabel(/^Acteur/).selectOption({ label: 'Ana Sorel — Responsable de fermeture' });
    await form2.getByRole('button', { name: 'Placer dans la version' }).click();
    await expect(page.getByRole('tab', { name: /Contradictions/ })).not.toContainText(/bloquante/);

    // 8. Confronter -------------------------------------------------------------------------------
    await nav(page, 'Dossier');
    await page.getByRole('toolbar', { name: 'Filtrer le dossier' }).getByRole('button', { name: /^Personnes/ }).click();
    await page.locator('.casefile-item').filter({ hasText: 'Malik Bensaïd' }).first().click();
    await expectReachable(page.getByRole('button', { name: 'Confronter', exact: true }));
    await page.getByRole('button', { name: 'Confronter', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Confrontation' });
    await dialog.getByRole('radio', { name: /posée directement sur son bureau/ }).check();
    await dialog.getByLabel(/Pièce d’appui/).selectOption({ label: 'Journal vidéo' });
    await dialog.getByRole('radio', { name: /^Empathique/ }).check();
    await expect(dialog.getByText(/Recevable/)).toBeVisible();
    await expectReachable(dialog.getByRole('button', { name: 'Confronter', exact: true }));
    await dialog.getByRole('button', { name: 'Confronter', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: /Réponse de Malik Bensaïd/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
    await expect(page.getByRole('meter', { name: 'Pression' })).toHaveAttribute('aria-valuenow', '3');

    // 9. Sauvegarder puis restaurer ---------------------------------------------------------------
    await openMenu(page, /^Sauvegardes/);
    const saves = page.getByRole('dialog', { name: 'Sauvegardes' });
    await expectReachable(saves.getByRole('button', { name: 'Fermer la fenêtre' }));
    await saves.getByRole('button', { name: 'Sauvegarder ici (Emplacement 1)' }).click();
    await expect(saves.getByText(/Emplacement 1/).first()).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await saves.getByRole('button', { name: 'Exporter (JSON)' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const fs = await import('node:fs');
    const json = fs.readFileSync(path ?? '', 'utf8');
    await saves.getByRole('button', { name: 'Fermer la fenêtre' }).click();
    await page.reload();
    await expect(page.getByTestId('mobile-shell')).toBeVisible();
    await expect(page.getByRole('meter', { name: 'Pression' })).toHaveAttribute('aria-valuenow', '3');
    await expect(page.getByText(/1\/5 emplacements remplis|1 \/ 5|1\/5/).first()).toBeVisible();

    // 10. Import invalide rejeté atomiquement, puis import valide ---------------------------------
    await openMenu(page, /^Sauvegardes/);
    const again = page.getByRole('dialog', { name: 'Sauvegardes' });
    await again.getByLabel('Ou coller le JSON').fill('{"kind":"la-version-acceptable-save","formatVersion":9}');
    await again.getByRole('button', { name: 'Importer le texte' }).click();
    await expect(again.getByRole('alert')).toContainText(/Import refusé/);
    await expect(page.getByRole('meter', { name: 'Pression' })).toHaveAttribute('aria-valuenow', '3');
    await again.getByRole('button', { name: 'Fermer la fenêtre' }).click();
    await openMenu(page, /^Nouvelle partie/);
    const confirm = page.getByRole('dialog').getByRole('button', { name: /Commencer une nouvelle partie/ });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await dismissOnboarding(page);
    await expect(page.getByRole('meter', { name: 'Pression' })).toHaveAttribute('aria-valuenow', '4');
    await openMenu(page, /^Sauvegardes/);
    const importSheet = page.getByRole('dialog', { name: 'Sauvegardes' });
    await importSheet.getByLabel('Ou coller le JSON').fill(json);
    await importSheet.getByRole('button', { name: 'Importer le texte' }).click();
    await expect(importSheet).toBeHidden();
    await expect(page.getByRole('meter', { name: 'Pression' })).toHaveAttribute('aria-valuenow', '3');
    await expectNoHorizontalOverflow(page);
  });

  test('version complète menant à une fin existante, sans recours au desktop', async ({ page }) => {
    test.setTimeout(240_000);
    await openFreshGame(page);
    // Deux confrontations (révélations structurantes) puis cinq hypothèses de classement
    await mobileConfront(page, 'Jo Harel', /palette n'est entrée/, 'Journal vidéo', /^Directe/);
    await mobileConfront(page, 'Malik Bensaïd', /posée directement sur son bureau/, 'Journal vidéo', /^Directe/);
    for (const [slot, hyp] of [
      ["Origine de l'écart", 'Erreur de comptage'],
      ['Interruption vidéo', 'Redémarrage programmé'],
      ['Parcours du justificatif', 'Aucun justificatif'],
      ['Bruit de la réserve', 'Alarme froide'],
      ["Connaissance d'Ana", "Responsable dans l'ignorance"],
    ] as const) {
      await nav(page, 'Version');
      await page.getByRole('tab', { name: 'Version' }).click();
      await page.getByRole('button', { name: `Choisir une hypothèse pour « ${slot} »` }).click();
      const form = page.getByRole('dialog', { name: new RegExp(`Hypothèse — ${escapeRegExp(slot)}`) });
      await form.getByLabel('Hypothèse', { exact: true }).selectOption({ label: hyp });
      await form.getByRole('button', { name: 'Placer dans la version' }).click();
      await expect(form).toBeHidden();
    }
    const roundTable = page.getByRole('button', { name: 'Demander la table ronde' });
    await expectReachable(roundTable);
    await roundTable.click();
    const rt = page.getByRole('dialog', { name: 'Table ronde' });
    await expect(rt).toBeVisible();
    await expectReachable(rt.getByRole('button', { name: 'Sceller le rapport' }));
    await rt.getByRole('button', { name: 'Sceller le rapport' }).click();
    await rt.getByRole('button', { name: 'Sceller définitivement' }).click();
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: "Classer l'écart" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('aucun secret dans le DOM mobile avant révélation', async ({ page }) => {
    await openFreshGame(page);
    for (const space of ['Plan', 'Temps', 'Version', 'Dossier'] as const) await nav(page, space);
    const html = await page.content();
    for (const forbidden of loadForbiddenAtStart()) expect(html, forbidden).not.toContain(forbidden);
    for (const t of THEMATIC_SECRETS) expect(html.toLowerCase(), t).not.toContain(t.toLowerCase());
  });

  test('les fonctions essentielles au clavier seul (mobile)', async ({ page }) => {
    await openFreshGame(page);
    // Navigation par raccourcis puis Tab/Entrée
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('1');
    await expect(page.getByRole('region', { name: 'Espace Plan' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.getByRole('button', { name: /Heure simulée 20:49:11/ })).toBeVisible();
    await page.keyboard.press('4');
    await page.getByRole('button', { name: 'Choisir une hypothèse pour « Bruit de la réserve »' }).focus();
    await page.keyboard.press('Enter');
    const form = page.getByRole('dialog', { name: /Hypothèse — Bruit de la réserve/ });
    await form.getByLabel('Hypothèse', { exact: true }).focus();
    await form.getByLabel('Hypothèse', { exact: true }).selectOption({ label: 'Bouteille cassée' });
    await form.getByRole('button', { name: 'Placer dans la version' }).focus();
    await page.keyboard.press('Enter');
    await expect(form).toBeHidden();
    await expect(page.getByRole('tabpanel').getByText('Bouteille cassée').first()).toBeVisible();
    await page.keyboard.press('?');
    const help = page.getByRole('dialog', { name: /Aide/ });
    await expect(help).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
  });
});

async function mobileConfront(page: Page, who: string, target: RegExp, support: string, approach: RegExp): Promise<void> {
  await nav(page, 'Dossier');
  const back = page.getByRole('button', { name: 'Retour à la liste' });
  if (await back.isVisible().catch(() => false)) await back.click();
  await page.getByRole('toolbar', { name: 'Filtrer le dossier' }).getByRole('button', { name: /^Personnes/ }).click();
  await page.locator('.casefile-item').filter({ hasText: who }).first().click();
  await page.getByRole('button', { name: 'Confronter', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confrontation' });
  await dialog.getByRole('radio', { name: target }).check();
  await dialog.getByLabel(/Pièce d’appui/).selectOption({ label: support });
  await dialog.getByRole('radio', { name: approach }).check();
  await dialog.getByRole('button', { name: 'Confronter', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: /Réponse de/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(dialog).toBeHidden();
}
