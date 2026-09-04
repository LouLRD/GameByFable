import { describe, expect, it } from 'vitest';
import {
  EXPORT_MIME,
  buildExportFilename,
  parseImport,
  serializeSave,
  triggerDownload,
} from './exportImport';
import { EXPECTED, makeSave } from './testFixtures';

describe('buildExportFilename', () => {
  it('inclut le scénario et la date locale au format attendu', () => {
    const date = new Date(2026, 8, 4, 21, 12, 45);
    expect(buildExportFilename('la-veilleuse-300', date)).toBe(
      'la-veilleuse-300_2026-09-04_21h12.json',
    );
  });

  it('complète les composantes sur deux chiffres', () => {
    const date = new Date(2027, 0, 9, 7, 5);
    expect(buildExportFilename('s', date)).toBe('s_2027-01-09_07h05.json');
  });

  it('neutralise les caractères interdits, les accents et les séparateurs', () => {
    const date = new Date(2026, 8, 4, 21, 12);
    expect(buildExportFilename('Épicerie Nuit/Été: v2?*', date)).toBe(
      'Epicerie-Nuit-Ete-v2_2026-09-04_21h12.json',
    );
    expect(buildExportFilename('...///', date)).toBe('scenario_2026-09-04_21h12.json');
    expect(buildExportFilename('x'.repeat(200), date).length).toBeLessThan(100);
  });
});

describe('serializeSave / parseImport', () => {
  it('produit un JSON indenté à deux espaces avec le type MIME JSON', () => {
    const text = serializeSave(makeSave());
    expect(EXPORT_MIME).toBe('application/json');
    const lines = text.split('\n');
    expect(lines[0]).toBe('{');
    expect(lines[1]).toBe('  "kind": "la-version-acceptable-save",');
    expect(lines[2]).toBe('  "formatVersion": 2,');
    expect(JSON.parse(text)).toEqual(makeSave());
  });

  it('transforme un texte illisible en refus invalid-schema sans lever', () => {
    for (const text of ['', '{', 'pas du json', ' ']) {
      const result = parseImport(text, EXPECTED);
      expect(result).toMatchObject({ ok: false, reason: 'invalid-schema' });
      if (!result.ok) expect(result.issues[0]).toContain('JSON illisible');
    }
  });

  it('accepte un JSON valide et le délègue à parseSave', () => {
    const result = parseImport('"chaîne"', EXPECTED);
    expect(result).toMatchObject({ ok: false, reason: 'invalid-schema' });
    if (!result.ok) expect(result.issues[0]).not.toContain('JSON illisible');
  });
});

describe('triggerDownload hors navigateur', () => {
  it('ne fait rien quand document est indisponible', () => {
    expect(typeof document).toBe('undefined');
    expect(() => {
      triggerDownload('x.json', '{}');
    }).not.toThrow();
  });
});
