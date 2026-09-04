/**
 * Identifiants de marque (branded types). Ils évitent de confondre un identifiant
 * de zone avec un identifiant de personnage tout en restant des chaînes à l'exécution.
 */
export type Id<T extends string> = string & { readonly __brand: T };

export type ZoneId = Id<'zone'>;
export type PassageId = Id<'passage'>;
export type ObstructionId = Id<'obstruction'>;
export type CharacterId = Id<'character'>;
export type FactId = Id<'fact'>;
export type SoundId = Id<'sound'>;
export type PerceptionId = Id<'perception'>;
export type BeliefId = Id<'belief'>;
export type EvidenceId = Id<'evidence'>;
export type StatementId = Id<'statement'>;
export type PropositionId = Id<'proposition'>;
export type ClaimSlotId = Id<'claim-slot'>;
export type HypothesisId = Id<'hypothesis'>;
export type ConfrontationId = Id<'confrontation'>;
export type RuleId = Id<'rule'>;
export type EndingId = Id<'ending'>;
export type OnboardingId = Id<'onboarding'>;
export type PressureRewardId = Id<'pressure-reward'>;

/** Conversion explicite depuis une chaîne validée. À n'utiliser qu'après validation Zod ou dans les tests. */
export const asId = <T extends string>(value: string): Id<T> => value as Id<T>;

export const zoneId = (v: string): ZoneId => asId<'zone'>(v);
export const characterId = (v: string): CharacterId => asId<'character'>(v);
export const factId = (v: string): FactId => asId<'fact'>(v);
export const evidenceId = (v: string): EvidenceId => asId<'evidence'>(v);
export const statementId = (v: string): StatementId => asId<'statement'>(v);
export const propositionId = (v: string): PropositionId => asId<'proposition'>(v);
export const claimSlotId = (v: string): ClaimSlotId => asId<'claim-slot'>(v);
export const hypothesisId = (v: string): HypothesisId => asId<'hypothesis'>(v);
export const confrontationId = (v: string): ConfrontationId => asId<'confrontation'>(v);
export const endingId = (v: string): EndingId => asId<'ending'>(v);
export const perceptionId = (v: string): PerceptionId => asId<'perception'>(v);
export const onboardingId = (v: string): OnboardingId => asId<'onboarding'>(v);
