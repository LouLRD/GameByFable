/**
 * Aides Playwright : parcours réels dans l'interface (aucun raccourci par l'état interne).
 */
import { expect, type Page } from '@playwright/test';

export async function openFreshGame(page: Page): Promise<void> {
  // Partie neuve : on vide le stockage APRÈS un premier chargement, puis on recharge
  // (un script d'initialisation viderait aussi le stockage à chaque rechargement du test).
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: /Bienvenue dans le dossier/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir le dossier' }).click();
  await dismissOnboarding(page);
}

export async function dismissOnboarding(page: Page): Promise<void> {
  const skipAll = page.getByRole('button', { name: 'Tout passer' });
  await skipAll.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined);
  if (await skipAll.isVisible().catch(() => false)) {
    await skipAll.click();
    await expect(skipAll).toBeHidden();
  }
}

export const isMobile = (page: Page): boolean => (page.viewportSize()?.width ?? 1440) < 1024;

export async function goToSpace(
  page: Page,
  space: 'Plan' | 'Temps' | 'Dossier' | 'Version',
): Promise<void> {
  if (!isMobile(page)) return;
  await page
    .getByRole('navigation', { name: /Espaces de travail/ })
    .getByRole('button', { name: new RegExp(`^${space}`) })
    .click();
}

export interface ClaimOptions {
  actor?: string;
  start?: string;
  end?: string;
  zone?: string;
}

/** Place ou remplace une hypothèse dans un emplacement via le formulaire typé. */
export async function placeClaim(
  page: Page,
  slotLabel: string,
  hypothesisLabel: string,
  opts: ClaimOptions = {},
): Promise<void> {
  await goToSpace(page, 'Version');
  await page.getByRole('tab', { name: 'Version' }).click();
  const choose = page.getByRole('button', { name: `Choisir une hypothèse pour « ${slotLabel} »` });
  const edit = page.getByRole('button', {
    name: new RegExp(`^Modifier .*${escapeRegExp(slotLabel)}`),
  });
  if (await choose.isVisible().catch(() => false)) await choose.click();
  else await edit.first().click();
  const dialog = page.getByRole('dialog', {
    name: new RegExp(`Hypothèse — ${escapeRegExp(slotLabel)}`),
  });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Hypothèse', { exact: true }).selectOption({ label: hypothesisLabel });
  if (opts.actor) await dialog.getByLabel(/^Acteur/).selectOption({ label: opts.actor });
  if (opts.zone)
    await dialog.getByLabel('Lieu', { exact: true }).selectOption({ label: opts.zone });
  if (opts.start) await dialog.getByLabel('Début (horloge)').fill(opts.start);
  if (opts.end) await dialog.getByLabel('Fin (horloge)').fill(opts.end);
  await dialog.getByRole('button', { name: 'Placer dans la version' }).click();
  await expect(dialog).toBeHidden();
}

/** Mène une confrontation par le dialogue : personnage, déclaration ciblée, pièce d'appui, approche. */
export async function confront(
  page: Page,
  character: string,
  targetText: RegExp,
  support: string | null,
  approach: 'neutre' | 'empathique' | 'directe',
): Promise<void> {
  await goToSpace(page, 'Dossier');
  await backToList(page);
  await page
    .getByRole('toolbar', { name: 'Filtrer le dossier' })
    .getByRole('button', { name: /^Personnes/ })
    .click();
  await page.locator('.casefile-item').filter({ hasText: character }).first().click();
  await page.getByRole('button', { name: 'Confronter', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confrontation' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: targetText }).check();
  const supportSelect = dialog.getByLabel(/Pièce d’appui|Pièce d'appui/);
  if (support) await supportSelect.selectOption({ label: support });
  await dialog.getByRole('radio', { name: new RegExp(`^${approach}`, 'i') }).check();
  await expect(dialog.getByText(/Recevable/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Confronter', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: /Réponse de/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole('toolbar', { name: 'Filtrer le dossier' })
    .getByRole('button', { name: /^Tout/ })
    .click();
}

/** En mode compact, une fiche ouverte remplace la liste : revenir à la liste si nécessaire. */
export async function backToList(page: Page): Promise<void> {
  const back = page.getByRole('button', { name: 'Retour à la liste' });
  if (await back.isVisible().catch(() => false)) await back.click();
}

export async function pressure(page: Page): Promise<number> {
  const meter = page.getByRole('meter', { name: /Pression/ });
  const value = await meter.getAttribute('aria-valuenow');
  return Number(value);
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Toutes les confrontations menant à la version transparente. */
export async function runCanonicalConfrontations(page: Page): Promise<void> {
  await confront(
    page,
    'Malik Bensaïd',
    /posée directement sur son bureau/,
    'Journal vidéo',
    'empathique',
  );
  await confront(page, 'Jo Harel', /palette n'est entrée/, 'Journal vidéo', 'neutre');
  await confront(
    page,
    'Inès Vidal',
    /restée dans l'allée froide/,
    'Scan de la palette',
    'empathique',
  );
  await confront(page, 'Noé Rami', /vu Inès y entrer/, 'Scan de la palette', 'neutre');
  await confront(page, 'Ana Sorel', /rien fait d'inhabituel/, 'Rapport de caisse', 'empathique');
  await confront(page, 'Ana Sorel', /rien fait d'inhabituel/, 'Ouverture manuelle', 'neutre');
  await confront(
    page,
    'Mina Koenig',
    /ni argent ni document/,
    'Empreinte du duplicata',
    'empathique',
  );
}

export async function requestRoundTableAndSeal(page: Page): Promise<void> {
  await goToSpace(page, 'Version');
  await page.getByRole('tab', { name: 'Version' }).click();
  await page.getByRole('button', { name: 'Demander la table ronde' }).click();
  const dialog = page.getByRole('dialog', { name: 'Table ronde' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Sceller le rapport' }).click();
  await dialog.getByRole('button', { name: 'Sceller définitivement' }).click();
  await expect(page.getByRole('main')).toContainText(/famille :/i);
}
