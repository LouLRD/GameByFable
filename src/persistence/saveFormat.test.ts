import { describe, expect, it } from 'vitest';
import type { PlayerAction } from '@/domain/model/actions';
import { asId } from '@/domain/model/ids';
import { interval } from '@/domain/model/time';
import { parseImport, serializeSave } from './exportImport';
import saveV1 from './fixtures/save-v1.json';
import {
  CURRENT_SAVE_VERSION,
  LEGACY_APP_VERSION,
  LEGACY_LABEL,
  MAX_LABEL_LENGTH,
  SAVE_KIND,
  SaveFileV1Schema,
  createSaveFile,
  migrateV1toV2,
  parseSave,
  toReplayEnvelope,
} from './saveFormat';
import { ALL_ACTIONS, EXPECTED, makeSave } from './testFixtures';

describe('aller-retour v2', () => {
  it('sérialise puis relit une sauvegarde à l’identique, ordre des actions compris', () => {
    const save = makeSave();
    const text = serializeSave(save);
    const result = parseImport(text, EXPECTED);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBeNull();
    expect(result.save).toEqual(save);
    expect(result.save.actions.map((a) => a.type)).toEqual(ALL_ACTIONS.map((a) => a.type));
    expect(result.save.actions).toStrictEqual(ALL_ACTIONS);
  });

  it('importer puis réexporter produit exactement le même texte', () => {
    const text = serializeSave(makeSave());
    const result = parseImport(text, EXPECTED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(serializeSave(result.save)).toBe(text);
  });

  it('ignore les clés inconnues sans échouer', () => {
    const save = makeSave();
    const input: unknown = { ...save, extra: 'ignorée', ui: { ...save.ui, futureField: 1 } };
    const result = parseSave(input, EXPECTED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save).toEqual(save);
  });

  it('createSaveFile copie les actions et tronque le libellé', () => {
    const actions: PlayerAction[] = [{ type: 'seal-report' }];
    const save = createSaveFile({
      scenarioId: 's',
      scenarioVersion: 3,
      seed: 'x',
      actions,
      ui: { cursor: 1, selectedId: null, activeSpace: null },
      label: 'a'.repeat(MAX_LABEL_LENGTH + 20),
      savedAt: '2026-09-04T19:12:00.000Z',
      appVersion: '1.0.0',
    });
    expect(save.kind).toBe(SAVE_KIND);
    expect(save.formatVersion).toBe(CURRENT_SAVE_VERSION);
    expect(save.label).toHaveLength(MAX_LABEL_LENGTH);
    expect(save.actions).not.toBe(actions);
    expect(save.actions).toEqual(actions);
  });

  it('toReplayEnvelope ne garde que les données sémantiques', () => {
    const save = makeSave();
    const envelope = toReplayEnvelope(save);
    expect(envelope).toEqual({
      schemaVersion: 1,
      scenarioId: save.scenarioId,
      scenarioVersion: save.scenarioVersion,
      seed: save.seed,
      actions: save.actions,
    });
    expect(envelope.actions).not.toBe(save.actions);
  });
});

describe('migration v1 → v2', () => {
  it('la fixture v1 couvre les neuf types d’action historiques', () => {
    const types = new Set(saveV1.actions.map((a) => a.type));
    expect([...types].sort()).toEqual(
      [
        'attachEvidence',
        'clearClaim',
        'confront',
        'dismissOnboarding',
        'leaveRoundTable',
        'probe',
        'requestRoundTable',
        'seal',
        'setClaim',
      ].sort(),
    );
  });

  it('convertit chaque action en préservant l’ordre et transforme from/to en interval', () => {
    const result = parseSave(saveV1, EXPECTED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(1);
    expect(result.save.kind).toBe(SAVE_KIND);
    expect(result.save.formatVersion).toBe(2);
    expect(result.save.scenarioId).toBe(saveV1.scenarioId);
    expect(result.save.scenarioVersion).toBe(saveV1.scenarioVersion);
    expect(result.save.seed).toBe(saveV1.seed);
    expect(result.save.label).toBe(saveV1.label);
    expect(result.save.savedAt).toBe(saveV1.savedAt);
    expect(result.save.appVersion).toBe(LEGACY_APP_VERSION);
    expect(result.save.ui).toEqual({ cursor: 11, selectedId: null, activeSpace: null });

    const expected: PlayerAction[] = [
      { type: 'dismiss-onboarding', onboardingId: asId<'onboarding'>('intro-map') },
      {
        type: 'set-claim',
        slotId: asId<'claim-slot'>('who'),
        hypothesisId: asId<'hypothesis'>('h-manager-present'),
        actorId: asId<'character'>('manager'),
        zoneId: asId<'zone'>('back_office'),
        interval: interval(120, 360),
      },
      {
        type: 'set-evidence-attached',
        evidenceId: asId<'evidence'>('receipt-21h07'),
        attached: false,
      },
      {
        type: 'probe',
        characterId: asId<'character'>('cashier'),
        targetId: 'st-cashier-01',
        approach: 'empathetic',
      },
      {
        type: 'confront',
        characterId: asId<'character'>('manager'),
        targetId: 'st-manager-02',
        supportId: 'receipt-21h07',
        approach: 'direct',
      },
      {
        type: 'confront',
        characterId: asId<'character'>('guard'),
        targetId: 'st-guard-01',
        approach: 'neutral',
      },
      { type: 'clear-claim', slotId: asId<'claim-slot'>('who') },
      {
        type: 'set-claim',
        slotId: asId<'claim-slot'>('when'),
        hypothesisId: asId<'hypothesis'>('h-after-closing'),
      },
      {
        type: 'set-evidence-attached',
        evidenceId: asId<'evidence'>('receipt-21h07'),
        attached: true,
      },
      { type: 'request-round-table' },
      { type: 'leave-round-table' },
      { type: 'seal-report' },
    ];
    expect(result.save.actions).toStrictEqual(expected);
  });

  it('une sauvegarde migrée se réexporte et se réimporte comme une v2 native', () => {
    const migrated = parseSave(saveV1, EXPECTED);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const reimported = parseImport(serializeSave(migrated.save), EXPECTED);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.migratedFrom).toBeNull();
    expect(reimported.save).toEqual(migrated.save);
  });

  it('applique des valeurs par défaut et conserve le curseur temporel quand la v1 est minimale', () => {
    const v1 = SaveFileV1Schema.parse({
      formatVersion: 1,
      scenarioId: 'la-veilleuse-300',
      scenarioVersion: 1,
      seed: '',
      cursor: 99,
      actions: [{ type: 'seal' }],
    });
    const v2 = migrateV1toV2(v1);
    expect(v2.ui.cursor).toBe(99);
    expect(v2.label).toBe(LEGACY_LABEL);
    expect(v2.savedAt).toBe('');
    expect(v2.actions).toEqual([{ type: 'seal-report' }]);
  });

  it('refuse une action v1 setClaim avec `from` sans `to`', () => {
    const broken = {
      ...saveV1,
      actions: [{ type: 'setClaim', slot: 'who', hypothesis: 'h', from: 10 }],
    };
    const result = parseSave(broken, EXPECTED);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-schema');
    expect(result.issues.join(' | ')).toContain('from');
  });
});

describe('refus non destructifs', () => {
  it('refuse un format plus récent', () => {
    const result = parseSave({ ...makeSave(), formatVersion: 3 }, EXPECTED);
    expect(result).toMatchObject({ ok: false, reason: 'newer-format' });
    if (!result.ok) expect(result.issues[0]).toContain('3');
  });

  it('refuse un scénario inconnu', () => {
    const result = parseSave(makeSave({ scenarioId: 'autre-magasin' }), EXPECTED);
    expect(result).toMatchObject({ ok: false, reason: 'unknown-scenario' });
    if (!result.ok) expect(result.issues[0]).toContain('autre-magasin');
  });

  it('refuse une version de scénario plus récente mais accepte une plus ancienne', () => {
    const newer = parseSave(makeSave({ scenarioVersion: 2 }), EXPECTED);
    expect(newer).toMatchObject({ ok: false, reason: 'scenario-version-newer' });

    const older = parseSave(makeSave({ scenarioVersion: 0 }), { ...EXPECTED, scenarioVersion: 1 });
    expect(older.ok).toBe(true);
  });

  it('refuse un type de fichier inconnu', () => {
    const result = parseSave({ ...makeSave(), kind: 'autre-jeu' }, EXPECTED);
    expect(result).toMatchObject({ ok: false, reason: 'unknown-kind' });
  });

  it('refuse une forme invalide avec des motifs localisés', () => {
    const noKind: Record<string, unknown> = { ...makeSave() };
    delete noKind.kind;
    expect(parseSave(noKind, EXPECTED)).toMatchObject({ ok: false, reason: 'invalid-schema' });

    const base = makeSave();
    const withBadAction = { ...base, actions: [...base.actions, { type: 'teleport' }] };
    const result = parseSave(withBadAction, EXPECTED);
    expect(result).toMatchObject({ ok: false, reason: 'invalid-schema' });
    if (!result.ok) expect(result.issues.some((i) => i.startsWith('actions.12'))).toBe(true);

    const cursorTooFar = makeSave({ ui: { cursor: 999_999, selectedId: null, activeSpace: null } });
    const cursorResult = parseSave(cursorTooFar, EXPECTED);
    expect(cursorResult).toMatchObject({ ok: false, reason: 'invalid-schema' });
    if (!cursorResult.ok) expect(cursorResult.issues[0]).toContain('ui.cursor');
    // un curseur temporel plausible (secondes simulées) est accepté quel que soit le nombre d'actions
    expect(parseSave(makeSave({ ui: { cursor: 1_500, selectedId: null, activeSpace: null } }), EXPECTED).ok).toBe(true);

    expect(parseSave({ formatVersion: 0, scenarioId: 'x' }, EXPECTED)).toMatchObject({
      ok: false,
      reason: 'invalid-schema',
    });
    expect(parseSave({ formatVersion: '2' }, EXPECTED)).toMatchObject({
      ok: false,
      reason: 'invalid-schema',
    });
  });

  it('ne lève jamais, quelle que soit la forme de l’entrée', () => {
    const inputs: unknown[] = [null, undefined, 42, 'texte', [], [1, 2], () => 1, Symbol('s'), {}];
    for (const input of inputs) {
      const result = parseSave(input, EXPECTED);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('invalid-schema');
    }
  });
});
