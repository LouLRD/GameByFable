/**
 * Schémas Zod du scénario canonique (forme du JSON) et de la couche d'extension.
 * La validation sémantique croisée (références, intervalles, graphe…) est dans `validate.ts`.
 */
import { z } from 'zod';

const id = z.string().min(1);
const tags = z.array(z.string()).default([]);

export const IntervalSchema = z.object({ start: z.number(), end: z.number() });

export const ConditionExprSchema: z.ZodType<
  | { type: 'always' }
  | { type: 'never' }
  | { type: 'between'; start: number; end: number }
  | { type: 'not'; expr: unknown }
  | { type: 'and'; exprs: unknown[] }
  | { type: 'or'; exprs: unknown[] }
> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('always') }),
    z.object({ type: z.literal('never') }),
    z.object({ type: z.literal('between'), start: z.number(), end: z.number() }),
    z.object({ type: z.literal('not'), expr: ConditionExprSchema }),
    z.object({ type: z.literal('and'), exprs: z.array(ConditionExprSchema) }),
    z.object({ type: z.literal('or'), exprs: z.array(ConditionExprSchema) }),
  ]),
);

export const ZoneSchema = z.object({
  id,
  label: z.string().min(1),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3),
  light: z.number().min(0).max(1),
  acousticAbsorption: z.number().min(0).max(1),
});

export const PassageSchema = z.object({
  id,
  from: id,
  to: id,
  travelSeconds: z.number().positive(),
  soundLoss: z.number().min(0).max(1),
  sight: z.enum(['none', 'partial', 'clear']),
  openWhen: ConditionExprSchema,
  affectedByObstructionId: id.optional(),
});

export const ObstructionSchema = z.object({
  id,
  zoneId: id,
  interval: IntervalSchema,
  travelMultiplier: z.number().min(1),
  blocksSightBetween: z.array(z.tuple([id, id])).default([]),
  publicAfterEvidenceId: id.optional(),
});

export const CharacterSchema = z.object({
  id,
  name: z.string().min(1),
  role: z.string().min(1),
  pronouns: z.string().min(1),
  portraitSeed: z.number().int(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  initialTrust: z.number().int(),
  values: z.array(z.string()).default([]),
  privateCosts: z.record(z.string(), z.number().min(0)).default({}),
});

export const MovementTrackSchema = z.object({
  characterId: id,
  segments: z.array(z.object({ zoneId: id, start: z.number(), end: z.number() })).min(1),
});

export const CanonicalFactSchema = z.object({
  id,
  interval: IntervalSchema,
  zoneId: id.nullable(),
  participants: z.array(id).default([]),
  secrecy: z.enum(['public', 'discoverable', 'canonical-only']),
  tags,
  variableSlotId: id.optional(),
  canonicalHypothesisId: id.optional(),
});

export const SoundSignalSchema = z.object({
  id,
  factId: id,
  originZoneId: id,
  intensity: z.number().min(0).max(1),
  signatureTags: z.array(z.string()).min(1),
});

export const PerceptionSchema = z.object({
  id,
  observerId: id,
  sourceFactId: id,
  modality: z.enum(['visual', 'audio', 'reported']),
  fidelity: z.enum(['exact', 'partial', 'ambiguous']),
  perceivedTags: tags,
});

export const BeliefSchema = z.object({
  id,
  characterId: id,
  propositionId: id,
  confidence: z.number().min(0).max(1),
  provenanceIds: z.array(z.string()).min(1),
});

export const EvidenceSchema = z.object({
  id,
  label: z.string().min(1),
  status: z.enum(['established', 'deduced']),
  availableAtStart: z.boolean(),
  unlockBy: z.array(id).optional(),
  supports: z.array(id).default([]),
  excludes: z.array(id).default([]),
  playerText: z.string().min(1),
});

export const StatementSchema = z.object({
  id,
  speakerId: id,
  propositionId: id,
  relationToBelief: z.enum(['honest', 'embellished', 'omission', 'lie']),
  unlockConditionIds: z.array(id).default([]),
  availableAtStart: z.boolean(),
  publicText: z.string().min(1),
});

export const ClaimSlotSchema = z.object({
  id,
  label: z.string().min(1),
  required: z.boolean(),
  prompt: z.string().min(1),
});

export const HypothesisSchema = z.object({
  id,
  slotId: id,
  label: z.string().min(1),
  summary: z.string().min(1),
  propositions: z.array(id).min(1),
  defaultActorId: id.optional(),
  defaultZoneId: id.optional(),
  defaultInterval: IntervalSchema.optional(),
  unlockEvidenceIds: z.array(id).default([]),
  availableAtStart: z.boolean().optional(),
  requiresActor: z.boolean().default(false),
});

const ApproachOutcomeSchema = z.object({
  trustDelta: z.number().int(),
  unlockEvidenceIds: z.array(id).default([]),
  unlockStatementIds: z.array(id).default([]),
});

export const ConfrontationSchema = z.object({
  id,
  characterId: id,
  targetIds: z.array(id).min(1),
  supportIds: z.array(id).default([]),
  pressureCost: z.number().int().min(0),
  requiresTrustAtLeast: z.number().int().optional(),
  approaches: z.object({
    neutral: ApproachOutcomeSchema,
    empathetic: ApproachOutcomeSchema,
    direct: ApproachOutcomeSchema,
  }),
  responseText: z.string().min(1),
});

export const ContradictionKindSchema = z.enum([
  'physical',
  'temporal',
  'sensory',
  'material',
  'epistemic',
  'discursive',
  'motivational',
]);

export const GenericRuleSchema = z.object({
  id,
  kind: ContradictionKindSchema,
  ifEvidenceId: id.optional(),
  ifProposition: id.optional(),
  requireAnyProposition: z.array(id).optional(),
  excludeProposition: id.optional(),
  conflictsWithEvidenceId: id.optional(),
  explanation: z.string().optional(),
  statementId: id.optional(),
  evaluateLineOfSight: z.boolean().optional(),
  applyToAllParameterizedClaims: z.boolean().optional(),
  evaluateTravel: z.boolean().optional(),
  evaluateOverlap: z.boolean().optional(),
  applyToAllStatements: z.boolean().optional(),
  requireKnowledgePath: z.boolean().optional(),
  applyToUnlockedStatements: z.boolean().optional(),
  comparePropositions: z.boolean().optional(),
});

export const PressureRewardSchema = z.object({
  id,
  amount: z.number().int().min(0),
  once: z.boolean(),
  condition: z.discriminatedUnion('type', [
    z.object({ type: z.literal('evidence-unlocked'), all: z.array(id).min(1) }),
    z.object({ type: z.literal('resolved-kind'), kind: ContradictionKindSchema }),
  ]),
});

export const EndingSchema = z.object({
  id,
  family: z.enum(['truth', 'consensus', 'accusation', 'incomplete', 'rejected']),
  title: z.string().min(1),
  priority: z.number(),
  requiresHypotheses: z.array(id).default([]),
  requiresEvidence: z.array(id).default([]),
  forbidsEvidenceInReport: z.array(id).default([]),
  forbidsEvidenceUnlocked: z.array(id).default([]),
  maxBlockingContradictions: z.number().int().min(0).optional(),
  minimumSignatures: z.number().int().min(0).default(0),
  specialSignatureRule: z.string().optional(),
  fallback: z.boolean().default(false),
  epilogue: z.string().min(1),
});

export const SignatureRuleSchema = z.object({
  characterId: id,
  rejectsPropositions: z.array(id).default([]),
  acceptsTruthIfTrustAtLeast: z.number().int(),
});

export const OnboardingStepSchema = z.object({
  id,
  trigger: z.string().min(1),
  focus: z.string().min(1),
  text: z.string().min(1),
});

export const RevealPolicySchema = z.object({
  canonicalFactsBeforeEnding: z.enum(['only-if-evidence-unlocked', 'never', 'always']),
  canonicalAlignmentBeforeEnding: z.boolean(),
  showOtherEndingTitlesAfterEnding: z.boolean(),
  showOtherEndingRequirementsAfterEnding: z.boolean(),
});

export const RawScenarioSchema = z.object({
  schemaVersion: z.literal(1),
  scenario: z.object({
    id,
    version: z.number().int().min(1),
    title: z.string().min(1),
    subtitle: z.string().min(1),
    locale: z.string().min(2),
    seed: z.string().min(1),
    timeline: z.object({
      startClock: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
      endClock: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
      durationSeconds: z.number().int().positive(),
      incidentClock: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
      currency: z.string().min(1),
      discrepancy: z.number(),
    }),
    publicPremise: z.string().min(1),
    themes: z.array(z.string()).default([]),
  }),
  zones: z.array(ZoneSchema).min(2),
  passages: z.array(PassageSchema).min(1),
  obstructions: z.array(ObstructionSchema).default([]),
  characters: z.array(CharacterSchema).min(1),
  movementTracks: z.array(MovementTrackSchema),
  canonicalFacts: z.array(CanonicalFactSchema),
  soundSignals: z.array(SoundSignalSchema).default([]),
  perceptions: z.array(PerceptionSchema).default([]),
  initialBeliefs: z.array(BeliefSchema).default([]),
  evidence: z.array(EvidenceSchema).min(1),
  statements: z.array(StatementSchema).min(1),
  claimSlots: z.array(ClaimSlotSchema).min(1),
  hypotheses: z.array(HypothesisSchema).min(1),
  confrontations: z.array(ConfrontationSchema).default([]),
  genericRules: z.array(GenericRuleSchema).default([]),
  initialPressure: z.number().int().min(0),
  maximumPressure: z.number().int().min(1),
  pressureRewards: z.array(PressureRewardSchema).default([]),
  endings: z.array(EndingSchema).min(1),
  signatureRules: z.array(SignatureRuleSchema).default([]),
  onboarding: z.array(OnboardingStepSchema).default([]),
  revealPolicy: RevealPolicySchema,
});

export type RawScenario = z.infer<typeof RawScenarioSchema>;

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export const PropositionSemanticsSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('presence'), characterId: id, zoneId: id, interval: IntervalSchema }),
  z.object({
    type: z.literal('continuous-presence'),
    characterId: id,
    zoneId: id,
    interval: IntervalSchema,
  }),
  z.object({ type: z.literal('absence'), characterId: id, zoneId: id, interval: IntervalSchema }),
  z.object({
    type: z.literal('event'),
    tags: z.array(z.string()).min(1),
    actorId: id.optional(),
    zoneId: id.optional(),
    interval: IntervalSchema.optional(),
    requiresPresence: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('sound'),
    signatureTags: z.array(z.string()).min(1),
    intensity: z.number().min(0).max(1),
    zoneId: id.optional(),
    interval: IntervalSchema.optional(),
    actorId: id.optional(),
  }),
  z.object({
    type: z.literal('perceived'),
    observerId: id,
    modality: z.enum(['visual', 'audio']),
    observerZoneId: id.optional(),
    target: z.object({
      characterId: id.optional(),
      zoneId: id,
      interval: IntervalSchema,
      claimedTags: z.array(z.string()).default([]),
      identityClaimed: z.boolean().optional(),
      soundTags: z.array(z.string()).optional(),
    }),
  }),
  z.object({
    type: z.literal('object-location'),
    objectTag: z.string(),
    zoneId: id,
    interval: IntervalSchema,
  }),
  z.object({
    type: z.literal('assertion'),
    tags: z.array(z.string()).default([]),
    subjectId: id.optional(),
  }),
]);

export const PropositionDefSchema = z.object({
  id,
  label: z.string().min(1),
  semantics: PropositionSemanticsSchema,
  excludes: z.array(id).default([]),
  knowledgeTags: z.array(z.string()).default([]),
  costKeys: z.record(z.string(), z.array(z.string())).default({}),
  truth: z.boolean().nullable().default(null),
});

export const ExtensionSchema = z.object({
  propositions: z.array(PropositionDefSchema).min(1),
  evidenceMarkers: z
    .array(
      z.object({
        evidenceId: id,
        zoneId: id.optional(),
        at: z.number().optional(),
        interval: IntervalSchema.optional(),
        label: z.string().min(1),
      }),
    )
    .default([]),
  facts: z
    .array(
      z.object({
        factId: id,
        label: z.string().min(1),
        revealedByEvidenceIds: z.array(id).default([]),
        reportedByStatementIds: z.array(id).default([]),
        revealedByConfrontationIds: z.array(id).default([]),
      }),
    )
    .default([]),
  hypotheses: z
    .array(
      z.object({
        hypothesisId: id,
        accusatory: z.boolean().default(false),
        worldEffect: z
          .discriminatedUnion('type', [
            z.object({
              type: z.literal('event'),
              tags: z.array(z.string()).min(1),
              requiresPresence: z.boolean(),
            }),
            z.object({
              type: z.literal('sound'),
              signatureTags: z.array(z.string()).min(1),
              intensity: z.number().min(0).max(1),
            }),
            z.object({ type: z.literal('none') }),
          ])
          .optional(),
        costKeys: z.record(z.string(), z.array(z.string())).default({}),
        actorCostKeys: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  statements: z
    .array(
      z.object({
        statementId: id,
        supersedes: z.array(id).default([]),
        revealsPerceptionIds: z.array(id).default([]),
        admitsCostKeys: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  confrontations: z
    .array(
      z.object({
        confrontationId: id,
        responseVariants: z.object({
          neutral: z.string().min(1),
          empathetic: z.string().min(1),
          direct: z.string().min(1),
        }),
        guardedVariant: z.string().optional(),
        retractsStatementIds: z.array(id).default([]),
        admitsCostKeys: z.record(z.string(), z.array(z.string())).default({}),
        beliefUpdates: z
          .array(
            z.object({ characterId: id, propositionId: id, confidence: z.number().min(0).max(1) }),
          )
          .default([]),
        annotation: z.string().optional(),
      }),
    )
    .default([]),
  characters: z
    .array(
      z.object({
        characterId: id,
        costLabels: z.record(z.string(), z.string()).default({}),
        reactions: z.object({
          signs: z.string(),
          refusesAccusation: z.string(),
          refusesBelief: z.string(),
          signsSilently: z.string(),
          requestsChange: z.string(),
          probeNeutral: z.string(),
          probeDirectAccused: z.string(),
          probeEvidenceUnknown: z.string(),
        }),
      }),
    )
    .default([]),
  endings: z.array(z.object({ endingId: id, hint: z.string().min(1) })).default([]),
  cameraCoverage: z.object({
    zoneIds: z.array(id).min(1),
    gapEvidenceId: id,
    label: z.string().min(1),
  }),
  canonicalHypothesisBySlot: z.record(z.string(), id).default({}),
  roundTableRevelations: z.number().int().min(0).default(2),
  hintAfterImpasses: z.number().int().min(1).default(3),
});

export type RawExtension = z.infer<typeof ExtensionSchema>;
