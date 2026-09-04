/**
 * Schéma Zod des actions du joueur, conforme au type `PlayerAction` du domaine.
 * Les identifiants sont validés comme chaînes puis convertis en identifiants marqués.
 */
import { z } from 'zod';
import type { PlayerAction } from '@/domain/model/actions';
import { asId } from '@/domain/model/ids';
import { interval } from '@/domain/model/time';

const id = z.string().min(1);

export const ApproachSchema = z.enum(['neutral', 'empathetic', 'direct']);

export const IntervalSchema = z.object({ start: z.number(), end: z.number() });

export const PlayerActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('set-claim'),
    slotId: id,
    hypothesisId: id,
    actorId: id.optional(),
    zoneId: id.optional(),
    interval: IntervalSchema.optional(),
  }),
  z.object({ type: z.literal('clear-claim'), slotId: id }),
  z.object({ type: z.literal('set-evidence-attached'), evidenceId: id, attached: z.boolean() }),
  z.object({
    type: z.literal('confront'),
    characterId: id,
    targetId: id,
    supportId: id.optional(),
    approach: ApproachSchema,
  }),
  z.object({ type: z.literal('probe'), characterId: id, targetId: id, approach: ApproachSchema }),
  z.object({ type: z.literal('request-round-table') }),
  z.object({ type: z.literal('leave-round-table') }),
  z.object({ type: z.literal('seal-report') }),
  z.object({ type: z.literal('dismiss-onboarding'), onboardingId: id }),
]);

export type PlayerActionInput = z.infer<typeof PlayerActionSchema>;

/**
 * Convertit une action validée en action du domaine : identifiants marqués et propriétés
 * optionnelles absentes (jamais `undefined`, cf. `exactOptionalPropertyTypes`).
 */
export function toPlayerAction(input: PlayerActionInput): PlayerAction {
  switch (input.type) {
    case 'set-claim':
      return {
        type: 'set-claim',
        slotId: asId<'claim-slot'>(input.slotId),
        hypothesisId: asId<'hypothesis'>(input.hypothesisId),
        ...(input.actorId !== undefined ? { actorId: asId<'character'>(input.actorId) } : {}),
        ...(input.zoneId !== undefined ? { zoneId: asId<'zone'>(input.zoneId) } : {}),
        ...(input.interval !== undefined
          ? { interval: interval(input.interval.start, input.interval.end) }
          : {}),
      };
    case 'clear-claim':
      return { type: 'clear-claim', slotId: asId<'claim-slot'>(input.slotId) };
    case 'set-evidence-attached':
      return {
        type: 'set-evidence-attached',
        evidenceId: asId<'evidence'>(input.evidenceId),
        attached: input.attached,
      };
    case 'confront':
      return {
        type: 'confront',
        characterId: asId<'character'>(input.characterId),
        targetId: input.targetId,
        ...(input.supportId !== undefined ? { supportId: input.supportId } : {}),
        approach: input.approach,
      };
    case 'probe':
      return {
        type: 'probe',
        characterId: asId<'character'>(input.characterId),
        targetId: input.targetId,
        approach: input.approach,
      };
    case 'request-round-table':
      return { type: 'request-round-table' };
    case 'leave-round-table':
      return { type: 'leave-round-table' };
    case 'seal-report':
      return { type: 'seal-report' };
    case 'dismiss-onboarding':
      return { type: 'dismiss-onboarding', onboardingId: asId<'onboarding'>(input.onboardingId) };
  }
}
