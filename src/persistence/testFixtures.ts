/** Données de test partagées par les tests de persistance (pas de logique métier). */
import type { PlayerAction } from '@/domain/model/actions';
import { asId } from '@/domain/model/ids';
import { interval } from '@/domain/model/time';
import type { ExpectedScenario, SaveFileV2 } from './saveFormat';
import { createSaveFile } from './saveFormat';

export const EXPECTED: ExpectedScenario = { scenarioId: 'la-veilleuse-300', scenarioVersion: 1 };

/** Une action de chaque type, avec et sans propriétés optionnelles. */
export const ALL_ACTIONS: PlayerAction[] = [
  { type: 'dismiss-onboarding', onboardingId: asId<'onboarding'>('intro-map') },
  {
    type: 'set-claim',
    slotId: asId<'claim-slot'>('who'),
    hypothesisId: asId<'hypothesis'>('h-manager-present'),
    actorId: asId<'character'>('manager'),
    zoneId: asId<'zone'>('back_office'),
    interval: interval(120, 360),
  },
  { type: 'set-evidence-attached', evidenceId: asId<'evidence'>('receipt-21h07'), attached: false },
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
  { type: 'set-evidence-attached', evidenceId: asId<'evidence'>('receipt-21h07'), attached: true },
  { type: 'request-round-table' },
  { type: 'leave-round-table' },
  { type: 'seal-report' },
];

export function makeSave(overrides: Partial<SaveFileV2> = {}): SaveFileV2 {
  return {
    ...createSaveFile({
      scenarioId: EXPECTED.scenarioId,
      scenarioVersion: EXPECTED.scenarioVersion,
      seed: 'nuit-0042',
      actions: ALL_ACTIONS,
      ui: { cursor: ALL_ACTIONS.length, selectedId: 'receipt-21h07', activeSpace: 'casefile' },
      label: 'Dossier de test',
      savedAt: '2026-09-04T19:12:00.000Z',
      appVersion: '1.0.0',
    }),
    ...overrides,
  };
}
