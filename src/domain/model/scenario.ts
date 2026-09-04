import type {
  CharacterId,
  ClaimSlotId,
  ConfrontationId,
  EndingId,
  EvidenceId,
  FactId,
  HypothesisId,
  ObstructionId,
  OnboardingId,
  PassageId,
  PerceptionId,
  PressureRewardId,
  PropositionId,
  RuleId,
  SoundId,
  StatementId,
  ZoneId,
  BeliefId,
} from './ids';
import type { Interval, Second } from './time';

// ---------------------------------------------------------------------------
// Monde spatial
// ---------------------------------------------------------------------------

export interface Zone {
  id: ZoneId;
  label: string;
  polygon: [number, number][];
  light: number;
  acousticAbsorption: number;
}

export type ConditionExpr =
  | { type: 'always' }
  | { type: 'never' }
  | { type: 'between'; start: Second; end: Second }
  | { type: 'not'; expr: ConditionExpr }
  | { type: 'and'; exprs: ConditionExpr[] }
  | { type: 'or'; exprs: ConditionExpr[] };

export type SightQuality = 'none' | 'partial' | 'clear';

export interface Passage {
  id: PassageId;
  from: ZoneId;
  to: ZoneId;
  travelSeconds: number;
  soundLoss: number;
  sight: SightQuality;
  openWhen: ConditionExpr;
  affectedByObstructionId?: ObstructionId;
}

export interface Obstruction {
  id: ObstructionId;
  zoneId: ZoneId;
  interval: Interval;
  travelMultiplier: number;
  blocksSightBetween: [ZoneId, ZoneId][];
  /** L'obstruction n'est connue du joueur (et appliquée au monde proposé) qu'après ce déblocage. */
  publicAfterEvidenceId?: EvidenceId;
}

// ---------------------------------------------------------------------------
// Personnages et couches d'information
// ---------------------------------------------------------------------------

export interface Character {
  id: CharacterId;
  name: string;
  role: string;
  pronouns: string;
  portraitSeed: number;
  accentColor: string;
  initialTrust: number;
  values: string[];
  privateCosts: Record<string, number>;
}

export interface TrackSegment {
  zoneId: ZoneId;
  start: Second;
  end: Second;
}

export interface MovementTrack {
  characterId: CharacterId;
  segments: TrackSegment[];
}

export type Secrecy = 'public' | 'discoverable' | 'canonical-only';

export interface CanonicalFact {
  id: FactId;
  interval: Interval;
  zoneId: ZoneId | null;
  participants: CharacterId[];
  secrecy: Secrecy;
  tags: string[];
  variableSlotId?: ClaimSlotId;
  canonicalHypothesisId?: HypothesisId;
}

export interface SoundSignal {
  id: SoundId;
  factId: FactId;
  originZoneId: ZoneId;
  intensity: number;
  signatureTags: string[];
}

export type Modality = 'visual' | 'audio' | 'reported';
export type Fidelity = 'exact' | 'partial' | 'ambiguous';

export interface Perception {
  id: PerceptionId;
  observerId: CharacterId;
  sourceFactId: FactId;
  modality: Modality;
  fidelity: Fidelity;
  perceivedTags: string[];
}

export interface Belief {
  id: BeliefId;
  characterId: CharacterId;
  propositionId: PropositionId;
  confidence: number;
  provenanceIds: string[];
}

export type EvidenceStatus = 'established' | 'deduced';

export interface Evidence {
  id: EvidenceId;
  label: string;
  status: EvidenceStatus;
  availableAtStart: boolean;
  unlockBy?: ConfrontationId[];
  supports: PropositionId[];
  excludes: PropositionId[];
  playerText: string;
}

export type RelationToBelief = 'honest' | 'embellished' | 'omission' | 'lie';

export interface Statement {
  id: StatementId;
  speakerId: CharacterId;
  propositionId: PropositionId;
  relationToBelief: RelationToBelief;
  unlockConditionIds: ConfrontationId[];
  availableAtStart: boolean;
  publicText: string;
}

// ---------------------------------------------------------------------------
// Canevas de version
// ---------------------------------------------------------------------------

export interface ClaimSlot {
  id: ClaimSlotId;
  label: string;
  required: boolean;
  prompt: string;
}

export interface Hypothesis {
  id: HypothesisId;
  slotId: ClaimSlotId;
  label: string;
  summary: string;
  propositions: PropositionId[];
  defaultActorId?: CharacterId;
  defaultZoneId?: ZoneId;
  defaultInterval?: Interval;
  availableAtStart: boolean;
  unlockEvidenceIds: EvidenceId[];
  requiresActor: boolean;
}

export type Approach = 'neutral' | 'empathetic' | 'direct';

export interface ApproachOutcome {
  trustDelta: number;
  unlockEvidenceIds: EvidenceId[];
  unlockStatementIds: StatementId[];
}

export interface ConfrontationDef {
  id: ConfrontationId;
  characterId: CharacterId;
  targetIds: (StatementId | EvidenceId)[];
  supportIds: (StatementId | EvidenceId)[];
  pressureCost: number;
  requiresTrustAtLeast?: number;
  approaches: Record<Approach, ApproachOutcome>;
  responseText: string;
}

// ---------------------------------------------------------------------------
// Règles génériques
// ---------------------------------------------------------------------------

export type ContradictionKind =
  | 'physical'
  | 'temporal'
  | 'sensory'
  | 'material'
  | 'epistemic'
  | 'discursive'
  | 'motivational';

export interface GenericRule {
  id: RuleId;
  kind: ContradictionKind;
  ifEvidenceId?: EvidenceId;
  ifProposition?: PropositionId;
  requireAnyProposition?: PropositionId[];
  excludeProposition?: PropositionId;
  conflictsWithEvidenceId?: EvidenceId;
  explanation?: string;
  statementId?: StatementId;
  evaluateLineOfSight?: boolean;
  applyToAllParameterizedClaims?: boolean;
  evaluateTravel?: boolean;
  evaluateOverlap?: boolean;
  applyToAllStatements?: boolean;
  requireKnowledgePath?: boolean;
  applyToUnlockedStatements?: boolean;
  comparePropositions?: boolean;
}

export type PressureCondition =
  | { type: 'evidence-unlocked'; all: EvidenceId[] }
  | { type: 'resolved-kind'; kind: ContradictionKind };

export interface PressureReward {
  id: PressureRewardId;
  amount: number;
  once: boolean;
  condition: PressureCondition;
}

// ---------------------------------------------------------------------------
// Fins
// ---------------------------------------------------------------------------

export type EndingFamily = 'truth' | 'consensus' | 'accusation' | 'incomplete' | 'rejected';

export interface Ending {
  id: EndingId;
  family: EndingFamily;
  title: string;
  priority: number;
  requiresHypotheses: HypothesisId[];
  requiresEvidence: EvidenceId[];
  forbidsEvidenceInReport: EvidenceId[];
  forbidsEvidenceUnlocked: EvidenceId[];
  maxBlockingContradictions: number | null;
  minimumSignatures: number;
  specialSignatureRule?: string;
  fallback: boolean;
  epilogue: string;
}

export interface SignatureRule {
  characterId: CharacterId;
  rejectsPropositions: PropositionId[];
  acceptsTruthIfTrustAtLeast: number;
}

export interface OnboardingStep {
  id: OnboardingId;
  trigger: string;
  focus: string;
  text: string;
}

export interface RevealPolicy {
  canonicalFactsBeforeEnding: 'only-if-evidence-unlocked' | 'never' | 'always';
  canonicalAlignmentBeforeEnding: boolean;
  showOtherEndingTitlesAfterEnding: boolean;
  showOtherEndingRequirementsAfterEnding: boolean;
}

// ---------------------------------------------------------------------------
// Couche d'extension : lecture structurée des propositions et contenus
// (aucun secret nouveau ; uniquement la structure nécessaire au moteur)
// ---------------------------------------------------------------------------

/**
 * Sémantique structurée d'une proposition. C'est ce qui permet aux détecteurs
 * d'être génériques : ils raisonnent sur des présences, événements et perceptions,
 * jamais sur des identifiants d'hypothèses.
 */
export type PropositionSemantics =
  /** X se trouvait dans Z pendant (au moins une partie de) I. */
  | { type: 'presence'; characterId: CharacterId; zoneId: ZoneId; interval: Interval }
  /** X est resté dans Z pendant tout I, sans en sortir. */
  | { type: 'continuous-presence'; characterId: CharacterId; zoneId: ZoneId; interval: Interval }
  /** X n'était pas dans Z pendant I. */
  | { type: 'absence'; characterId: CharacterId; zoneId: ZoneId; interval: Interval }
  /** Un événement (avec acteur facultatif) s'est produit. */
  | {
      type: 'event';
      tags: string[];
      actorId?: CharacterId;
      zoneId?: ZoneId;
      interval?: Interval;
      /** L'acteur devait être présent dans la zone. */
      requiresPresence?: boolean;
    }
  /** Un son a été émis. */
  | {
      type: 'sound';
      signatureTags: string[];
      intensity: number;
      zoneId?: ZoneId;
      interval?: Interval;
      actorId?: CharacterId;
    }
  /** L'observateur affirme avoir perçu quelque chose. */
  | {
      type: 'perceived';
      observerId: CharacterId;
      modality: 'visual' | 'audio';
      /** Zone depuis laquelle la perception est revendiquée (si connue par le récit). */
      observerZoneId?: ZoneId;
      target: {
        characterId?: CharacterId;
        zoneId: ZoneId;
        interval: Interval;
        /** Détails revendiqués : identité, direction, signature sonore… */
        claimedTags: string[];
        /** L'identité de la cible est-elle revendiquée ? Exige une vue nette. */
        identityClaimed?: boolean;
      };
    }
  /** Un objet se trouvait à un endroit. */
  | { type: 'object-location'; objectTag: string; zoneId: ZoneId; interval: Interval }
  /** Assertion abstraite sans ancrage spatial (état mental, comptabilité…). */
  | { type: 'assertion'; tags: string[]; subjectId?: CharacterId };

export interface PropositionDef {
  id: PropositionId;
  /** Libellé joueur, neutre. */
  label: string;
  semantics: PropositionSemantics;
  /** Propositions explicitement incompatibles (en plus des incompatibilités calculées). */
  excludes: PropositionId[];
  /** Étiquettes de connaissance nécessaires pour affirmer la proposition (provenance épistémique). */
  knowledgeTags: string[];
  /** Clés de coût privé déclenchées si la proposition devient publique, par personnage. */
  costKeys: Partial<Record<CharacterId, string[]>>;
  /** Valeur de vérité canonique (dérivée ou déclarée ; interne au moteur). */
  truth: boolean | null;
}

/** Marqueur structuré d'une pièce sur la frise (lecture mécanique du texte joueur). */
export interface EvidenceMarker {
  evidenceId: EvidenceId;
  zoneId?: ZoneId;
  at?: Second;
  interval?: Interval;
  label: string;
}

export interface FactPresentation {
  factId: FactId;
  /** Libellé joueur du fait, affiché uniquement une fois révélé. */
  label: string;
  /** Pièces dont le déblocage établit le fait. */
  revealedByEvidenceIds: EvidenceId[];
  /** Déclarations dont le déblocage rapporte le fait. */
  reportedByStatementIds: StatementId[];
  /** Confrontations dont la résolution établit le fait. */
  revealedByConfrontationIds: ConfrontationId[];
}

export interface HypothesisExtension {
  hypothesisId: HypothesisId;
  /** L'hypothèse désigne quelqu'un comme fautif ; la personne désignée refuse de signer. */
  accusatory: boolean;
  /** Événement inséré dans le monde proposé. */
  worldEffect?:
    | { type: 'event'; tags: string[]; requiresPresence: boolean }
    | { type: 'sound'; signatureTags: string[]; intensity: number }
    | { type: 'none' };
  /** Coûts privés déclenchés pour d'autres personnages que ceux des propositions. */
  costKeys: Partial<Record<CharacterId, string[]>>;
  /** Clés de coût imputées à l'acteur désigné par la claim (s'il possède la clé). */
  actorCostKeys: string[];
}

export interface StatementExtension {
  statementId: StatementId;
  /** Déclarations antérieures du même locuteur que celle-ci remplace. */
  supersedes: StatementId[];
  /** Perceptions canoniques révélées au joueur lorsque la déclaration est débloquée. */
  revealsPerceptionIds: PerceptionId[];
  /** Clés de coût désormais assumées publiquement (le coût ne s'applique plus à la signature). */
  admitsCostKeys: string[];
}

export interface BeliefUpdate {
  characterId: CharacterId;
  propositionId: PropositionId;
  confidence: number;
}

export interface ConfrontationExtension {
  confrontationId: ConfrontationId;
  /** Variantes de réponse par approche. */
  responseVariants: Record<Approach, string>;
  /** Variante lorsqu'un déblocage n'a pas lieu (approche directe fermée). */
  guardedVariant?: string;
  /** Déclarations rétractées par la confrontation (sans nouvelle déclaration). */
  retractsStatementIds: StatementId[];
  /** Clés de coût assumées à l'issue de la confrontation. */
  admitsCostKeys: Partial<Record<CharacterId, string[]>>;
  /** Croyances révisées (correction d'une croyance sincère). */
  beliefUpdates: BeliefUpdate[];
  /** Annotation manuscrite ajoutée au dossier. */
  annotation?: string;
}

export interface CameraCoverage {
  /** Zones filmées. */
  zoneIds: ZoneId[];
  /** Pièce qui rend publique l'interruption ; l'intervalle est lu dans son marqueur. */
  gapEvidenceId: EvidenceId;
  label: string;
}

export interface EndingExtension {
  endingId: EndingId;
  /** Indice non spoilant affiché dans l'épilogue pour les autres familles. */
  hint: string;
}

export interface CharacterExtension {
  characterId: CharacterId;
  /** Libellés joueur des clés de coût (jamais affichés avant que le coût soit public). */
  costLabels: Record<string, string>;
  /** Phrases de réaction publiques, par contexte. */
  reactions: {
    signs: string;
    refusesAccusation: string;
    refusesBelief: string;
    signsSilently: string;
    requestsChange: string;
    probeNeutral: string;
    probeDirectAccused: string;
    probeEvidenceUnknown: string;
  };
}

export interface ScenarioExtension {
  propositions: PropositionDef[];
  evidenceMarkers: EvidenceMarker[];
  facts: FactPresentation[];
  hypotheses: HypothesisExtension[];
  statements: StatementExtension[];
  confrontations: ConfrontationExtension[];
  characters: CharacterExtension[];
  endings: EndingExtension[];
  cameraCoverage: CameraCoverage;
  /** Hypothèse canonique par slot lorsque aucun fait variable ne la porte. */
  canonicalHypothesisBySlot: Partial<Record<ClaimSlotId, HypothesisId>>;
  /** Nombre de révélations structurantes requises pour la table ronde. */
  roundTableRevelations: number;
  /** Aide progressive : nombre d'impasses avant proposition d'un indice. */
  hintAfterImpasses: number;
}

// ---------------------------------------------------------------------------
// Scénario complet (validé)
// ---------------------------------------------------------------------------

export interface ScenarioMeta {
  id: string;
  version: number;
  title: string;
  subtitle: string;
  locale: string;
  seed: string;
  timeline: {
    startClock: string;
    endClock: string;
    durationSeconds: number;
    incidentClock: string;
    currency: string;
    discrepancy: number;
  };
  publicPremise: string;
  themes: string[];
}

export interface Scenario {
  schemaVersion: number;
  scenario: ScenarioMeta;
  zones: Zone[];
  passages: Passage[];
  obstructions: Obstruction[];
  characters: Character[];
  movementTracks: MovementTrack[];
  canonicalFacts: CanonicalFact[];
  soundSignals: SoundSignal[];
  perceptions: Perception[];
  initialBeliefs: Belief[];
  evidence: Evidence[];
  statements: Statement[];
  claimSlots: ClaimSlot[];
  hypotheses: Hypothesis[];
  confrontations: ConfrontationDef[];
  genericRules: GenericRule[];
  initialPressure: number;
  maximumPressure: number;
  pressureRewards: PressureReward[];
  endings: Ending[];
  signatureRules: SignatureRule[];
  onboarding: OnboardingStep[];
  revealPolicy: RevealPolicy;
  extension: ScenarioExtension;
}

/** Index rapide construit une fois par scénario. */
export interface ScenarioIndex {
  zones: ReadonlyMap<ZoneId, Zone>;
  passages: ReadonlyMap<PassageId, Passage>;
  obstructions: ReadonlyMap<ObstructionId, Obstruction>;
  characters: ReadonlyMap<CharacterId, Character>;
  tracks: ReadonlyMap<CharacterId, MovementTrack>;
  facts: ReadonlyMap<FactId, CanonicalFact>;
  sounds: ReadonlyMap<SoundId, SoundSignal>;
  soundsByFact: ReadonlyMap<FactId, SoundSignal>;
  perceptions: ReadonlyMap<PerceptionId, Perception>;
  evidence: ReadonlyMap<EvidenceId, Evidence>;
  statements: ReadonlyMap<StatementId, Statement>;
  slots: ReadonlyMap<ClaimSlotId, ClaimSlot>;
  hypotheses: ReadonlyMap<HypothesisId, Hypothesis>;
  hypothesesBySlot: ReadonlyMap<ClaimSlotId, Hypothesis[]>;
  confrontations: ReadonlyMap<ConfrontationId, ConfrontationDef>;
  endings: ReadonlyMap<EndingId, Ending>;
  propositions: ReadonlyMap<PropositionId, PropositionDef>;
  evidenceMarkers: ReadonlyMap<EvidenceId, EvidenceMarker>;
  factPresentations: ReadonlyMap<FactId, FactPresentation>;
  hypothesisExtensions: ReadonlyMap<HypothesisId, HypothesisExtension>;
  statementExtensions: ReadonlyMap<StatementId, StatementExtension>;
  confrontationExtensions: ReadonlyMap<ConfrontationId, ConfrontationExtension>;
  characterExtensions: ReadonlyMap<CharacterId, CharacterExtension>;
  endingExtensions: ReadonlyMap<EndingId, EndingExtension>;
  signatureRules: ReadonlyMap<CharacterId, SignatureRule>;
  /** Hypothèse canonique par slot (faits variables + extension). */
  canonicalBySlot: ReadonlyMap<ClaimSlotId, HypothesisId>;
  /** Passages sortants par zone. */
  adjacency: ReadonlyMap<ZoneId, Passage[]>;
}

export interface LoadedScenario {
  data: Scenario;
  index: ScenarioIndex;
}
