/**
 * Contexte d'évaluation : tout ce dont les détecteurs ont besoin, calculé une fois par version.
 * Le scénario canonique n'est jamais muté ; le monde proposé est une vue dérivée.
 */
import type { EvaluationContextLike } from '../model/contradiction';
import type {
  CharacterId,
  EvidenceId,
  ObstructionId,
  PropositionId,
  StatementId,
} from '../model/ids';
import type {
  Evidence,
  Hypothesis,
  HypothesisExtension,
  LoadedScenario,
  Statement,
} from '../model/scenario';
import type { GameState } from '../model/state';
import type { PlayerClaim } from '../model/version';
import type { Interval } from '../model/time';
import {
  buildPositionModel,
  deriveCameraSegments,
  presenceFromClaim,
  presencesFromSemantics,
  type PositionModel,
  type PositionSegment,
} from './positions';
import type { WorldState } from './spatial';

export interface ClaimEvent {
  claim: PlayerClaim;
  hypothesis: Hypothesis;
  extension: HypothesisExtension | undefined;
  actorId: CharacterId | undefined;
  zoneId: PlayerClaim['zoneId'];
  interval: Interval | undefined;
  presence: PositionSegment | null;
  /** La claim porte des paramètres spatiaux/temporels évaluables. */
  parameterized: boolean;
}

export interface EvaluationContext extends EvaluationContextLike {
  scenario: LoadedScenario;
  state: GameState;
  world: WorldState;
  claims: PlayerClaim[];
  claimEvents: ClaimEvent[];
  versionPropositions: PropositionId[];
  versionPropositionSet: ReadonlySet<PropositionId>;
  standingStatements: Statement[];
  unlockedStatementIds: ReadonlySet<StatementId>;
  unlockedEvidence: Evidence[];
  attachedEvidence: Evidence[];
  detachedEvidence: Evidence[];
  positions: PositionModel;
  cameraEvidenceId: EvidenceId;
  /** Propositions connues du joueur (via déclarations, pièces et hypothèses disponibles). */
  playerKnownPropositions: ReadonlySet<PropositionId>;
  /** Hypothèses disponibles (au départ ou débloquées). */
  availableHypothesisIds: ReadonlySet<string>;
}

/** Obstructions connues du joueur (publiques ou révélées par une pièce débloquée). */
export function knownWorld(
  scenario: LoadedScenario,
  unlockedEvidenceIds: readonly EvidenceId[],
): WorldState {
  const unlocked = new Set(unlockedEvidenceIds);
  const ids = new Set<ObstructionId>();
  for (const o of scenario.data.obstructions) {
    if (!o.publicAfterEvidenceId || unlocked.has(o.publicAfterEvidenceId)) ids.add(o.id);
  }
  return { activeObstructionIds: ids };
}

export function availableHypothesisIds(
  scenario: LoadedScenario,
  unlockedEvidenceIds: readonly EvidenceId[],
): Set<string> {
  const unlocked = new Set(unlockedEvidenceIds);
  const out = new Set<string>();
  for (const h of scenario.data.hypotheses) {
    if (h.availableAtStart || h.unlockEvidenceIds.every((e) => unlocked.has(e))) out.add(h.id);
  }
  return out;
}

/** Déclarations débloquées et non rétractées/remplacées. */
export function standingStatements(scenario: LoadedScenario, state: GameState): Statement[] {
  const retracted = new Set(state.retractedStatementIds);
  return state.unlockedStatementIds
    .map((id) => scenario.index.statements.get(id))
    .filter((s): s is Statement => s !== undefined && !retracted.has(s.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Cache des segments caméra par scénario (dérivation purement mécanique, indépendante de l'état). */
const cameraCache = new WeakMap<LoadedScenario, ReturnType<typeof deriveCameraSegments>>();
export function cameraSegments(scenario: LoadedScenario): ReturnType<typeof deriveCameraSegments> {
  let c = cameraCache.get(scenario);
  if (!c) {
    c = deriveCameraSegments(scenario);
    cameraCache.set(scenario, c);
  }
  return c;
}

/** Présences établies par des faits révélés (cohérentes avec la trajectoire canonique). */
export function factSegments(scenario: LoadedScenario, state: GameState): PositionSegment[] {
  const out: PositionSegment[] = [];
  const established = new Set(state.establishedFactIds);
  for (const f of scenario.data.canonicalFacts) {
    if (!f.zoneId) continue;
    if (!(f.secrecy === 'public' || established.has(f.id))) continue;
    for (const c of f.participants) {
      const track = scenario.index.tracks.get(c);
      const consistent =
        track?.segments.some(
          (s) => s.zoneId === f.zoneId && s.start <= f.interval.start && f.interval.end <= s.end,
        ) ?? false;
      if (!consistent) continue;
      out.push({
        characterId: c,
        zoneId: f.zoneId,
        interval: f.interval,
        status: 'established',
        source: 'fact',
        sourceIds: [f.id],
        transit: false,
        continuous: false,
      });
    }
  }
  return out;
}

export function buildClaimEvents(scenario: LoadedScenario, claims: PlayerClaim[]): ClaimEvent[] {
  const events: ClaimEvent[] = [];
  for (const claim of claims) {
    const hypothesis = scenario.index.hypotheses.get(claim.hypothesisId);
    if (!hypothesis) continue;
    const extension = scenario.index.hypothesisExtensions.get(claim.hypothesisId);
    const effect = extension?.worldEffect;
    const requiresPresence =
      effect?.type === 'event'
        ? effect.requiresPresence
        : effect?.type === 'sound'
          ? Boolean(claim.actorId)
          : false;
    const presence = presenceFromClaim(claim, requiresPresence);
    events.push({
      claim,
      hypothesis,
      extension,
      actorId: claim.actorId,
      zoneId: claim.zoneId,
      interval: claim.interval,
      presence,
      parameterized: Boolean(claim.zoneId && claim.interval),
    });
  }
  return events;
}

export function buildContext(scenario: LoadedScenario, state: GameState): EvaluationContext {
  const world = knownWorld(scenario, state.unlockedEvidenceIds);
  const slotOrder = scenario.data.claimSlots.map((s) => s.id as string);
  const claims = Object.values(state.claims).sort(
    (a, b) => slotOrder.indexOf(a.slotId) - slotOrder.indexOf(b.slotId),
  );
  const claimEvents = buildClaimEvents(scenario, claims);
  const versionPropositionSet = new Set<PropositionId>();
  for (const ev of claimEvents)
    for (const p of ev.hypothesis.propositions) versionPropositionSet.add(p);
  const versionPropositions = [...versionPropositionSet].sort();

  const standing = standingStatements(scenario, state);
  const unlockedEvidence = state.unlockedEvidenceIds
    .map((id) => scenario.index.evidence.get(id))
    .filter((e): e is Evidence => e !== undefined)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const detached = new Set(state.detachedEvidenceIds);
  const attachedEvidence = unlockedEvidence.filter((e) => !detached.has(e.id));
  const detachedEvidence = unlockedEvidence.filter((e) => detached.has(e.id));

  const reported: PositionSegment[] = [];
  for (const s of standing) {
    const def = scenario.index.propositions.get(s.propositionId);
    if (def) reported.push(...presencesFromSemantics(def.semantics, s.id, s.speakerId));
  }
  const proposed = claimEvents
    .map((e) => e.presence)
    .filter((p): p is PositionSegment => p !== null);
  const positions = buildPositionModel(scenario, cameraSegments(scenario), [
    ...factSegments(scenario, state),
    ...reported,
    ...proposed,
  ]);

  const known = new Set<PropositionId>();
  for (const id of state.unlockedStatementIds) {
    const s = scenario.index.statements.get(id);
    if (s) known.add(s.propositionId);
  }
  for (const e of unlockedEvidence) {
    for (const p of e.supports) known.add(p);
    for (const p of e.excludes) known.add(p);
  }
  const available = availableHypothesisIds(scenario, state.unlockedEvidenceIds);
  for (const h of scenario.data.hypotheses)
    if (available.has(h.id)) for (const p of h.propositions) known.add(p);

  return {
    __evaluationContext: true,
    scenario,
    state,
    world,
    claims,
    claimEvents,
    versionPropositions,
    versionPropositionSet,
    standingStatements: standing,
    unlockedStatementIds: new Set(state.unlockedStatementIds),
    unlockedEvidence,
    attachedEvidence,
    detachedEvidence,
    positions,
    cameraEvidenceId: scenario.data.extension.cameraCoverage.gapEvidenceId,
    playerKnownPropositions: known,
    availableHypothesisIds: available,
  };
}
