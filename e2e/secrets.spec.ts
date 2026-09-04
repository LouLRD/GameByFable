import { expect, test } from '@playwright/test';
import { openFreshGame } from './support/game';
import { loadForbiddenAtStart, THEMATIC_SECRETS } from './support/secrets';

test.describe('Sécurité narrative — aucun secret dans le DOM avant révélation', () => {
  test('le DOM initial ne contient ni fait secret, ni déclaration ou pièce verrouillée, ni donnée interne', async ({
    page,
  }) => {
    await openFreshGame(page);
    await page.getByRole('tab', { name: 'Contradictions' }).click();
    const html = await page.content();
    for (const forbidden of loadForbiddenAtStart()) {
      expect(html, `secret trouvé dans le DOM : ${forbidden}`).not.toContain(forbidden);
    }
    for (const t of THEMATIC_SECRETS) expect(html.toLowerCase(), t).not.toContain(t.toLowerCase());
  });
});
