import type {
  CharacterId,
  ConfrontationId,
  EndingId,
  EvidenceId,
  FactId,
  OnboardingId,
  PerceptionId,
  PropositionId,
  StatementId,
} from './ids';
import type { Approach, ContradictionKind } from './scenario';
import type { PlayerAction } from './actions';
import type { PlayerClaim } from './version';

export type GamePhase = 'investigation' | 'round-table' | 'sealed';

/** Connaissance d'un personnage : proposition + confiance + provenance explicite. */
export interface KnowledgeEntry {
  propositionId: PropositionId;
  confidence: number;
  provenanceIds: string[];
  /** 'self' : action propre ; 'belief' : croyance initiale ; 'perception' ; 'public' ; 'learned' */
  origin: 'self' | 'belief' | 'perception' | 'public' | 'learned';
}

export interface CharacterState {
  trust: number;
  knowledge: KnowledgeEntry[];
  /** Clés de coût assumées publiquement. */
  admittedCostKeys: string[];
}

export interface JournalEntry {
  id: string;
  actionIndex: number;
  kind:
    | 'claim'
    | 'clear'
    | 'attach'
    | 'confrontation'
    | 'probe'
    | 'revelation'
    | 'round-table'
    | 'seal'
    | 'annotation'
    | 'pressure';
  text: string;
  refIds: string[];
  /** Annotation manuscrite (révélation importante). */
  handwritten?: boolean;
}

export interface ConfrontationRecord {
  confrontationId: ConfrontationId;
  characterId: CharacterId;
  targetId: string;
  supportId?: string;
  approach: Approach;
  actionIndex: number;
  responseText: string;
  trustDelta: number;
  unlockedEvidenceIds: EvidenceId[];
  unlockedStatementIds: StatementId[];
}

export interface ProbeRecord {
  characterId: CharacterId;
  targetId: string;
  approach: Approach;
  actionIndex: number;
  text: string;
}

export interface GameState {
  scenarioId: string;
  scenarioVersion: number;
  seed: string;
  /** Nombre d'actions appliquées avec succès. */
  actionCount: number;
  phase: GamePhase;
  claims: Readonly<Record<string, PlayerClaim>>;
  detachedEvidenceIds: readonly EvidenceId[];
  unlockedEvidenceIds: readonly EvidenceId[];
  unlockedStatementIds: readonly StatementId[];
  /** Déclarations remplacées ou rétractées (restent visibles comme historique). */
  retractedStatementIds: readonly StatementId[];
  revealedPerceptionIds: readonly PerceptionId[];
  /** Faits établis par pièce ou confrontation. */
  establishedFactIds: readonly FactId[];
  /** Faits rapportés par une déclaration. */
  reportedFactIds: readonly FactId[];
  pressure: number;
  characters: Readonly<Record<string, CharacterState>>;
  resolvedConfrontationIds: readonly ConfrontationId[];
  confrontationHistory: readonly ConfrontationRecord[];
  probeHistory: readonly ProbeRecord[];
  claimedPressureRewardIds: readonly string[];
  /** Genres de contradiction déjà vus impliquant la version, puis résolus. */
  seenContradictionIds: readonly string[];
  resolvedContradictionKinds: readonly ContradictionKind[];
  dismissedOnboardingIds: readonly OnboardingId[];
  journal: readonly JournalEntry[];
  endingId: EndingId | null;
  /** Identifiants des contradictions présentes au moment du scellement (figées). */
  sealedContradictionIds: readonly string[];
}

export interface ReplayEnvelope {
  schemaVersion: number;
  scenarioId: string;
  scenarioVersion: number;
  seed: string;
  actions: PlayerAction[];
}
