import { describe, expect, expectTypeOf, it } from 'vitest';
import type { PlayerAction } from '@/domain/model/actions';
import { PlayerActionSchema, toPlayerAction } from './actionSchema';
import type { PlayerActionInput } from './actionSchema';
import { ALL_ACTIONS } from './testFixtures';

describe('PlayerActionSchema', () => {
  it('accepte toute action du domaine et la restitue à l’identique après conversion', () => {
    for (const action of ALL_ACTIONS) {
      const parsed = PlayerActionSchema.safeParse(action);
      expect(parsed.success, `action ${action.type}`).toBe(true);
      if (parsed.success) expect(toPlayerAction(parsed.data)).toEqual(action);
    }
  });

  it('couvre les neuf types d’action', () => {
    const types = new Set(ALL_ACTIONS.map((a) => a.type));
    expect([...types].sort()).toEqual(
      [
        'clear-claim',
        'confront',
        'dismiss-onboarding',
        'leave-round-table',
        'probe',
        'request-round-table',
        'seal-report',
        'set-claim',
        'set-evidence-attached',
      ].sort(),
    );
  });

  it('refuse un type inconnu, un identifiant vide ou une approche hors liste', () => {
    expect(PlayerActionSchema.safeParse({ type: 'setClaim', slot: 'who' }).success).toBe(false);
    expect(PlayerActionSchema.safeParse({ type: 'clear-claim', slotId: '' }).success).toBe(false);
    expect(
      PlayerActionSchema.safeParse({
        type: 'probe',
        characterId: 'c',
        targetId: 't',
        approach: 'aggressive',
      }).success,
    ).toBe(false);
    expect(
      PlayerActionSchema.safeParse({ type: 'set-evidence-attached', evidenceId: 'e' }).success,
    ).toBe(false);
  });

  it('n’émet pas de propriété optionnelle absente (compatibilité exactOptionalPropertyTypes)', () => {
    const parsed = PlayerActionSchema.parse({
      type: 'set-claim',
      slotId: 'who',
      hypothesisId: 'h',
    });
    const action = toPlayerAction(parsed);
    expect(Object.keys(action).sort()).toEqual(['hypothesisId', 'slotId', 'type']);
  });

  it('le type PlayerAction du domaine est accepté par le schéma (vérification statique)', () => {
    expectTypeOf<PlayerAction>().toExtend<PlayerActionInput>();
    expectTypeOf<PlayerAction['type']>().toEqualTypeOf<PlayerActionInput['type']>();
  });
});
