import type { CharacterId, EvidenceId, HypothesisId, ZoneId } from './ids';
import type { ContradictionKind } from './scenario';
import type { Interval, Second } from './time';

export type Severity = 'notice' | 'major' | 'critical';

/**
 * Étape d'explication structurée. Le rendu textuel est produit à partir de gabarits ;
 * les références permettent à l'interface de sélectionner l'élément ou de déplacer le curseur.
 */
export type ExplanationStep =
  | { type: 'claim'; hypothesisId: HypothesisId; actorId?: CharacterId; zoneId?: ZoneId; interval?: Interval }
  | { type: 'statement'; statementId: string; speakerId: CharacterId }
  | { type: 'evidence'; evidenceId: EvidenceId }
  | { type: 'position'; characterId: CharacterId; zoneId: ZoneId; interval: Interval; source: 'camera' | 'evidence' | 'fact' | 'statement' | 'claim' }
  | { type: 'absent-from-camera'; characterId: CharacterId; interval: Interval }
  | { type: 'travel'; characterId: CharacterId; from: ZoneId; to: ZoneId; departure: Second; seconds: number; via: ZoneId[]; obstructed: boolean }
  | { type: 'arrival-too-late'; characterId: CharacterId; zoneId: ZoneId; earliest: Second; required: Second }
  | { type: 'departure-too-late'; characterId: CharacterId; zoneId: ZoneId; latest: Second; required: Second }
  | { type: 'overlap'; characterId: CharacterId; a: { zoneId: ZoneId; interval: Interval }; b: { zoneId: ZoneId; interval: Interval } }
  | { type: 'sight'; observer: CharacterId; from: ZoneId; to: ZoneId; at: Second; quality: number; via: ZoneId[]; occludedBy?: string }
  | { type: 'sound'; from: ZoneId; to: ZoneId; intensity: number; via: ZoneId[]; threshold: number }
  | { type: 'signature-mismatch'; expected: string[]; claimed: string[]; shared: string[] }
  | { type: 'timing-mismatch'; expected: Interval; claimed: Interval }
  | { type: 'requires'; evidenceId: EvidenceId; anyOf: string[] }
  | { type: 'excludes'; sourceId: string; propositionId: string }
  | { type: 'proposition-conflict'; a: string; b: string; reason: 'explicit' | 'space-time' | 'same-slot' }
  | { type: 'knowledge-gap'; characterId: CharacterId; missingTags: string[]; availableTags: string[] }
  | { type: 'discredited'; statementId: string; byIds: string[] }
  | { type: 'text'; text: string }
  | { type: 'conclusion'; text: string };

export interface Contradiction {
  id: string;
  kind: ContradictionKind;
  severity: Severity;
  title: string;
  ruleId: string;
  involvedIds: string[];
  /** Emplacements du canevas concernés (vide pour une contradiction entre déclarations). */
  slotIds: string[];
  explanation: ExplanationStep[];
  inspectableAt?: Second;
  inspectableZoneIds: ZoneId[];
  suggestedEvidenceIds: EvidenceId[];
  /** Vrai si la contradiction implique au moins une claim du joueur (elle compte pour la cohérence). */
  involvesVersion: boolean;
}

export interface ContradictionDetector {
  id: string;
  detect(context: EvaluationContextLike): Contradiction[];
}

/** Type structurel minimal ; le contexte complet est défini dans le moteur. */
export interface EvaluationContextLike {
  readonly __evaluationContext: true;
}
