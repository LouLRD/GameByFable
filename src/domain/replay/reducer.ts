/**
 * Réducteur principal : `reduceGame(initial, actions)`. Toute l'histoire de la partie découle
 * de la graine et du journal d'actions. Une action refusée retourne une erreur typée sans
 * modifier l'état.
 */
import type { ActionError, ActionResult, PlayerAction } from '../model/actions';
import type { CharacterId, EvidenceId, FactId, PerceptionId, StatementId } from '../model/ids';
import type { Approach, ContradictionKind, LoadedScenario } from '../model/scenario';
import type { CharacterState, GameState, JournalEntry, ReplayEnvelope } from '../model/state';
import type { PlayerClaim } from '../model/version';
import { intervalContains, interval, sec } from '../model/time';
import { initialKnowledge, learn } from '../knowledge/knowledge';
import { availableHypothesisIds } from '../engine/context';
import { evaluateVersion } from '../engine/evaluate';
import { resolveConfrontation, probe } from '../dialogue/confrontation';
import { resolveEnding } from '../endings/endings';
import { seededId } from './hash';

export const REPLAY_SCHEMA_VERSION = 1;
const TRUST_MIN = -3;
const TRUST_MAX = 4;

export function createInitialState(
  scenario: LoadedScenario,
  seed: string = scenario.data.scenario.seed,
): GameState {
  const characters: Record<string, CharacterState> = {};
  for (const c of scenario.data.characters) {
    characters[c.id] = {
      trust: c.initialTrust,
      knowledge: initialKnowledge(scenario, c.id),
      admittedCostKeys: [],
    };
  }
  const unlockedEvidenceIds = scenario.data.evidence
    .filter((e) => e.availableAtStart)
    .map((e) => e.id);
  const unlockedStatementIds = scenario.data.statements
    .filter((s) => s.availableAtStart)
    .map((s) => s.id);
  const base: GameState = {
    scenarioId: scenario.data.scenario.id,
    scenarioVersion: scenario.data.scenario.version,
    seed,
    actionCount: 0,
    phase: 'investigation',
    claims: {},
    detachedEvidenceIds: [],
    unlockedEvidenceIds: [],
    unlockedStatementIds: [],
    retractedStatementIds: [],
    revealedPerceptionIds: [],
    establishedFactIds: scenario.data.canonicalFacts
      .filter((f) => f.secrecy === 'public')
      .map((f) => f.id),
    reportedFactIds: [],
    pressure: scenario.data.initialPressure,
    characters,
    resolvedConfrontationIds: [],
    confrontationHistory: [],
    probeHistory: [],
    claimedPressureRewardIds: [],
    seenContradictionIds: [],
    resolvedContradictionKinds: [],
    dismissedOnboardingIds: [],
    journal: [],
    endingId: null,
    sealedContradictionIds: [],
  };
  let state = unlockEvidence(scenario, base, unlockedEvidenceIds);
  state = unlockStatements(scenario, state, unlockedStatementIds);
  return state;
}

// ---------------------------------------------------------------------------
// Effets élémentaires (purs)
// ---------------------------------------------------------------------------

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

function unlockEvidence(
  scenario: LoadedScenario,
  state: GameState,
  ids: readonly EvidenceId[],
): GameState {
  const fresh = ids.filter(
    (id) => !state.unlockedEvidenceIds.includes(id) && scenario.index.evidence.has(id),
  );
  if (fresh.length === 0) return state;
  const established: FactId[] = [];
  for (const pres of scenario.data.extension.facts) {
    if (pres.revealedByEvidenceIds.some((e) => fresh.includes(e))) established.push(pres.factId);
  }
  return {
    ...state,
    unlockedEvidenceIds: [...state.unlockedEvidenceIds, ...fresh],
    establishedFactIds: uniq([...state.establishedFactIds, ...established]),
  };
}

function unlockStatements(
  scenario: LoadedScenario,
  state: GameState,
  ids: readonly StatementId[],
): GameState {
  const fresh = ids.filter(
    (id) => !state.unlockedStatementIds.includes(id) && scenario.index.statements.has(id),
  );
  if (fresh.length === 0) return state;
  let retracted = [...state.retractedStatementIds];
  let perceptions: PerceptionId[] = [...state.revealedPerceptionIds];
  const reported: FactId[] = [];
  const characters = { ...state.characters };
  for (const id of fresh) {
    const ext = scenario.index.statementExtensions.get(id);
    const statement = scenario.index.statements.get(id);
    if (ext) {
      retracted = uniq([...retracted, ...ext.supersedes]);
      perceptions = uniq([...perceptions, ...ext.revealsPerceptionIds]);
      if (statement && ext.admitsCostKeys.length > 0) {
        const cs = characters[statement.speakerId];
        if (cs)
          characters[statement.speakerId] = {
            ...cs,
            admittedCostKeys: uniq([...cs.admittedCostKeys, ...ext.admitsCostKeys]),
          };
      }
    }
    for (const pres of scenario.data.extension.facts)
      if (pres.reportedByStatementIds.includes(id)) reported.push(pres.factId);
  }
  return {
    ...state,
    unlockedStatementIds: [...state.unlockedStatementIds, ...fresh],
    retractedStatementIds: retracted,
    revealedPerceptionIds: perceptions,
    reportedFactIds: uniq([...state.reportedFactIds, ...reported]),
    characters,
  };
}

function adjustTrust(state: GameState, characterId: CharacterId, delta: number): GameState {
  const cs = state.characters[characterId];
  if (!cs || delta === 0) return state;
  const trust = Math.max(TRUST_MIN, Math.min(TRUST_MAX, cs.trust + delta));
  return { ...state, characters: { ...state.characters, [characterId]: { ...cs, trust } } };
}

function journal(
  state: GameState,
  actionIndex: number,
  entry: Omit<JournalEntry, 'id' | 'actionIndex'>,
): GameState {
  const id = seededId(state.seed, actionIndex, `j${state.journal.length}`);
  return { ...state, journal: [...state.journal, { id, actionIndex, ...entry }] };
}

function applyPressureRewards(
  scenario: LoadedScenario,
  state: GameState,
  actionIndex: number,
): GameState {
  let next = state;
  for (const reward of scenario.data.pressureRewards) {
    if (reward.once && next.claimedPressureRewardIds.includes(reward.id)) continue;
    let met = false;
    if (reward.condition.type === 'evidence-unlocked')
      met = reward.condition.all.every((e) => next.unlockedEvidenceIds.includes(e));
    else met = next.resolvedContradictionKinds.includes(reward.condition.kind);
    if (!met) continue;
    const pressure = Math.min(scenario.data.maximumPressure, next.pressure + reward.amount);
    if (pressure === next.pressure && reward.once) {
      next = { ...next, claimedPressureRewardIds: [...next.claimedPressureRewardIds, reward.id] };
      continue;
    }
    next = {
      ...next,
      pressure,
      claimedPressureRewardIds: reward.once
        ? [...next.claimedPressureRewardIds, reward.id]
        : next.claimedPressureRewardIds,
    };
    next = journal(next, actionIndex, {
      kind: 'pressure',
      text: `Pression +${reward.amount} : ${rewardLabel(reward.id)}.`,
      refIds: [reward.id],
    });
  }
  return next;
}

function rewardLabel(id: string): string {
  const labels: Record<string, string> = {
    pr_pallet_verified: 'la palette est vérifiée',
    pr_circuit_explained: 'le circuit est expliqué',
    pr_refund_trace: 'une trace du remboursement apparaît',
    pr_noise_grounded: 'le bruit trouve une origine matérielle',
    pr_first_physical_resolution: 'première contradiction physique résolue',
    pr_first_epistemic_resolution: 'première contradiction épistémique résolue',
    pr_truth_pair: 'deux vérités techniques se recoupent',
  };
  return labels[id] ?? 'observation nouvelle';
}

/** Compare les contradictions avant/après pour mémoriser celles vues et celles résolues (par genre). */
function trackContradictions(
  scenario: LoadedScenario,
  before: GameState,
  after: GameState,
): GameState {
  const prev = evaluateVersion(scenario, before).evaluation.contradictions;
  const next = evaluateVersion(scenario, after).evaluation.contradictions;
  const nextIds = new Set(next.map((c) => c.id));
  const seen = uniq([...after.seenContradictionIds, ...next.map((c) => c.id)]);
  const resolvedKinds: ContradictionKind[] = [...after.resolvedContradictionKinds];
  for (const c of prev) {
    if (!nextIds.has(c.id) && !resolvedKinds.includes(c.kind)) resolvedKinds.push(c.kind);
  }
  return { ...after, seenContradictionIds: seen, resolvedContradictionKinds: resolvedKinds };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const refuse = <S>(
  state: S,
  code: ActionError['code'],
  message: string,
  details?: ActionError['details'],
): ActionResult<S> => ({
  ok: false,
  state,
  error: details ? { code, message, details } : { code, message },
});

export function applyAction(
  scenario: LoadedScenario,
  state: GameState,
  action: PlayerAction,
): ActionResult<GameState> {
  const actionIndex = state.actionCount;
  if (state.phase === 'sealed' && action.type !== 'dismiss-onboarding') {
    return refuse(
      state,
      'sealed',
      'Le rapport est scellé : plus aucune modification n’est possible. Lancez une nouvelle partie ou restaurez une sauvegarde.',
    );
  }
  const finish = (next: GameState): ActionResult<GameState> => ({
    ok: true,
    state: { ...next, actionCount: actionIndex + 1 },
  });
  const duration = scenario.data.scenario.timeline.durationSeconds;

  switch (action.type) {
    case 'set-claim': {
      const slot = scenario.index.slots.get(action.slotId);
      if (!slot) return refuse(state, 'unknown-slot', 'Emplacement inconnu.');
      const hypothesis = scenario.index.hypotheses.get(action.hypothesisId);
      if (!hypothesis) return refuse(state, 'unknown-hypothesis', 'Hypothèse inconnue.');
      if (hypothesis.slotId !== slot.id)
        return refuse(
          state,
          'hypothesis-slot-mismatch',
          'Cette hypothèse ne répond pas à cette question.',
        );
      if (!availableHypothesisIds(scenario, state.unlockedEvidenceIds).has(hypothesis.id))
        return refuse(
          state,
          'hypothesis-locked',
          'Cette hypothèse n’est pas encore formulable : il manque des pièces.',
        );
      const actorId =
        action.actorId ?? (hypothesis.requiresActor ? undefined : hypothesis.defaultActorId);
      if (hypothesis.requiresActor && !actorId)
        return refuse(state, 'actor-required', 'Cette hypothèse exige de désigner un acteur.');
      if (actorId && !scenario.index.characters.has(actorId))
        return refuse(state, 'unknown-actor', 'Acteur inconnu.');
      const zoneId = action.zoneId ?? hypothesis.defaultZoneId;
      if (zoneId && !scenario.index.zones.has(zoneId))
        return refuse(state, 'unknown-zone', 'Zone inconnue.');
      const iv = action.interval ?? hypothesis.defaultInterval;
      if (iv) {
        const ok =
          Number.isFinite(iv.start) &&
          Number.isFinite(iv.end) &&
          iv.start < iv.end &&
          intervalContains(interval(0, duration), iv);
        if (!ok)
          return refuse(
            state,
            'invalid-interval',
            `L’intervalle doit être compris dans la fenêtre du scénario et avoir une durée positive.`,
          );
      }
      const claim: PlayerClaim = { slotId: slot.id, hypothesisId: hypothesis.id };
      if (actorId) claim.actorId = actorId;
      if (zoneId) claim.zoneId = zoneId;
      if (iv) claim.interval = interval(iv.start, iv.end);
      let next: GameState = { ...state, claims: { ...state.claims, [slot.id]: claim } };
      next = journal(next, actionIndex, {
        kind: 'claim',
        text: `Version — ${slot.label} : « ${hypothesis.label} ».`,
        refIds: [hypothesis.id, slot.id],
      });
      next = trackContradictions(scenario, state, next);
      next = applyPressureRewards(scenario, next, actionIndex);
      return finish(next);
    }
    case 'clear-claim': {
      const slot = scenario.index.slots.get(action.slotId);
      if (!slot) return refuse(state, 'unknown-slot', 'Emplacement inconnu.');
      const rest = Object.fromEntries(Object.entries(state.claims).filter(([k]) => k !== slot.id));
      let next: GameState = { ...state, claims: rest };
      next = journal(next, actionIndex, {
        kind: 'clear',
        text: `Version — ${slot.label} : emplacement vidé.`,
        refIds: [slot.id],
      });
      next = trackContradictions(scenario, state, next);
      next = applyPressureRewards(scenario, next, actionIndex);
      return finish(next);
    }
    case 'set-evidence-attached': {
      const evidence = scenario.index.evidence.get(action.evidenceId);
      if (!evidence) return refuse(state, 'unknown-evidence', 'Pièce inconnue.');
      if (!state.unlockedEvidenceIds.includes(evidence.id))
        return refuse(state, 'evidence-locked', 'Cette pièce n’est pas dans le dossier.');
      if (evidence.availableAtStart && !action.attached)
        return refuse(
          state,
          'evidence-mandatory',
          'Les pièces du dossier initial font toujours partie du rapport.',
        );
      const detached = action.attached
        ? state.detachedEvidenceIds.filter((id) => id !== evidence.id)
        : uniq([...state.detachedEvidenceIds, evidence.id]);
      let next: GameState = { ...state, detachedEvidenceIds: detached };
      next = journal(next, actionIndex, {
        kind: 'attach',
        text: action.attached
          ? `« ${evidence.label} » rejointe au rapport.`
          : `« ${evidence.label} » retirée du rapport.`,
        refIds: [evidence.id],
      });
      next = trackContradictions(scenario, state, next);
      return finish(next);
    }
    case 'confront': {
      const outcome = resolveConfrontation(
        scenario,
        state,
        action.characterId,
        action.targetId,
        action.supportId,
        action.approach,
      );
      if (!outcome.ok) return { ok: false, state, error: outcome.error };
      const r = outcome.resolution;
      let next: GameState = { ...state, pressure: state.pressure - r.def.pressureCost };
      next = adjustTrust(next, action.characterId, r.trustDelta);
      next = unlockEvidence(scenario, next, r.unlockEvidenceIds);
      next = unlockStatements(scenario, next, r.unlockStatementIds);
      if (r.retractsStatementIds.length > 0)
        next = {
          ...next,
          retractedStatementIds: uniq([...next.retractedStatementIds, ...r.retractsStatementIds]),
        };
      const established: FactId[] = [];
      for (const pres of scenario.data.extension.facts)
        if (pres.revealedByConfrontationIds.includes(r.def.id)) established.push(pres.factId);
      if (established.length > 0)
        next = { ...next, establishedFactIds: uniq([...next.establishedFactIds, ...established]) };
      // Connaissance : aveux et apprentissage des pièces d'appui
      const characters = { ...next.characters };
      for (const [cid, keys] of Object.entries(r.admitsCostKeys)) {
        const cs = characters[cid];
        if (cs && keys)
          characters[cid] = { ...cs, admittedCostKeys: uniq([...cs.admittedCostKeys, ...keys]) };
      }
      const target = characters[action.characterId];
      if (target) {
        let knowledge = target.knowledge;
        for (const p of r.learnedPropositionIds) {
          const def = scenario.index.propositions.get(p);
          knowledge = learn(knowledge, {
            propositionId: p,
            confidence: def?.truth === false ? 0 : 1,
            provenanceIds: [r.def.id, ...(action.supportId ? [action.supportId] : [])],
            origin: 'learned',
          });
        }
        characters[action.characterId] = { ...target, knowledge };
      }
      for (const u of r.beliefUpdates) {
        const cs = characters[u.characterId];
        if (!cs) continue;
        characters[u.characterId] = {
          ...cs,
          knowledge: learn(cs.knowledge, {
            propositionId: u.propositionId,
            confidence: u.confidence,
            provenanceIds: [r.def.id],
            origin: 'learned',
          }),
        };
      }
      next = { ...next, characters };
      const record = {
        confrontationId: r.def.id,
        characterId: action.characterId,
        targetId: action.targetId,
        approach: action.approach,
        actionIndex,
        responseText: r.text,
        trustDelta: r.trustDelta,
        unlockedEvidenceIds: r.unlockEvidenceIds,
        unlockedStatementIds: r.unlockStatementIds,
        ...(action.supportId ? { supportId: action.supportId } : {}),
      };
      next = {
        ...next,
        resolvedConfrontationIds: [...next.resolvedConfrontationIds, r.def.id],
        confrontationHistory: [...next.confrontationHistory, record],
      };
      const name = scenario.index.characters.get(action.characterId)?.name ?? action.characterId;
      next = journal(next, actionIndex, {
        kind: 'confrontation',
        text: `Confrontation avec ${name} (${approachLabel(action.approach)}) : ${r.text}`,
        refIds: [
          action.characterId,
          action.targetId,
          ...(action.supportId ? [action.supportId] : []),
        ],
      });
      for (const e of r.unlockEvidenceIds) {
        const label = scenario.index.evidence.get(e)?.label ?? e;
        next = journal(next, actionIndex, {
          kind: 'revelation',
          text: `Nouvelle pièce : « ${label} ».`,
          refIds: [e],
        });
      }
      for (const s of r.unlockStatementIds) {
        next = journal(next, actionIndex, {
          kind: 'revelation',
          text: `${name} précise sa déclaration.`,
          refIds: [s],
        });
      }
      if (r.annotation)
        next = journal(next, actionIndex, {
          kind: 'annotation',
          text: r.annotation,
          refIds: [r.def.id],
          handwritten: true,
        });
      next = trackContradictions(scenario, state, next);
      next = applyPressureRewards(scenario, next, actionIndex);
      return finish(next);
    }
    case 'probe': {
      const res = probe(scenario, state, action.characterId, action.targetId, action.approach);
      if (!res.ok) return { ok: false, state, error: res.error };
      let next = adjustTrust(state, action.characterId, res.result.trustDelta);
      next = {
        ...next,
        probeHistory: [
          ...next.probeHistory,
          {
            characterId: action.characterId,
            targetId: action.targetId,
            approach: action.approach,
            actionIndex,
            text: res.result.text,
          },
        ],
      };
      const name = scenario.index.characters.get(action.characterId)?.name ?? action.characterId;
      next = journal(next, actionIndex, {
        kind: 'probe',
        text: `${name}, sondé·e : ${res.result.text}`,
        refIds: [action.characterId, action.targetId],
      });
      return finish(next);
    }
    case 'request-round-table': {
      if (state.phase !== 'investigation')
        return refuse(state, 'round-table-unavailable', 'La table ronde est déjà ouverte.');
      const blockers = roundTableBlockers(scenario, state);
      if (blockers.length > 0)
        return refuse(
          state,
          blockers.includes('version-incomplete')
            ? 'version-incomplete'
            : 'round-table-unavailable',
          roundTableBlockerMessage(scenario, blockers),
        );
      // Règle de partage : les pièces jointes au rapport deviennent connues de tous.
      const characters = { ...state.characters };
      const detached = new Set(state.detachedEvidenceIds);
      for (const c of scenario.data.characters) {
        const cs = characters[c.id];
        if (!cs) continue;
        let knowledge = cs.knowledge;
        for (const eid of state.unlockedEvidenceIds) {
          if (detached.has(eid)) continue;
          const e = scenario.index.evidence.get(eid);
          for (const p of e?.supports ?? []) {
            const def = scenario.index.propositions.get(p);
            knowledge = learn(knowledge, {
              propositionId: p,
              confidence: def?.truth === false ? 0 : 1,
              provenanceIds: ['round-table', eid],
              origin: 'learned',
            });
          }
        }
        characters[c.id] = { ...cs, knowledge };
      }
      let next: GameState = { ...state, phase: 'round-table', characters };
      next = journal(next, actionIndex, {
        kind: 'round-table',
        text: 'Table ronde ouverte : chacun réagit à la version proposée.',
        refIds: [],
      });
      return finish(next);
    }
    case 'leave-round-table': {
      if (state.phase !== 'round-table')
        return refuse(state, 'not-at-round-table', 'La table ronde n’est pas ouverte.');
      let next: GameState = { ...state, phase: 'investigation' };
      next = journal(next, actionIndex, {
        kind: 'round-table',
        text: 'Retour au dossier : la version peut encore être retravaillée.',
        refIds: [],
      });
      return finish(next);
    }
    case 'seal-report': {
      if (state.phase !== 'round-table')
        return refuse(
          state,
          'not-at-round-table',
          'Le rapport ne peut être scellé qu’à la table ronde.',
        );
      const { evaluation, context } = evaluateVersion(scenario, state);
      const ending = resolveEnding(context, evaluation.coherence.blocking, evaluation.adhesion);
      let next: GameState = {
        ...state,
        phase: 'sealed',
        endingId: ending.id,
        sealedContradictionIds: evaluation.contradictions.map((c) => c.id),
      };
      next = journal(next, actionIndex, {
        kind: 'seal',
        text: `Rapport scellé : « ${ending.title} ».`,
        refIds: [ending.id],
      });
      return finish(next);
    }
    case 'dismiss-onboarding': {
      if (!scenario.data.onboarding.some((o) => o.id === action.onboardingId))
        return refuse(state, 'unknown-onboarding', 'Étape inconnue.');
      if (state.dismissedOnboardingIds.includes(action.onboardingId)) return finish(state);
      return finish({
        ...state,
        dismissedOnboardingIds: [...state.dismissedOnboardingIds, action.onboardingId],
      });
    }
  }
}

function approachLabel(a: Approach): string {
  return a === 'neutral' ? 'neutre' : a === 'empathetic' ? 'empathique' : 'directe';
}

/** Révélations structurantes : pièces et déclarations obtenues après le départ. */
export function structuringRevelations(scenario: LoadedScenario, state: GameState): number {
  const ev = state.unlockedEvidenceIds.filter(
    (id) => scenario.index.evidence.get(id)?.availableAtStart === false,
  ).length;
  const st = state.unlockedStatementIds.filter(
    (id) => scenario.index.statements.get(id)?.availableAtStart === false,
  ).length;
  return ev + st;
}

export type RoundTableBlocker = 'version-incomplete' | 'revelations';

export function roundTableBlockers(
  scenario: LoadedScenario,
  state: GameState,
): RoundTableBlocker[] {
  const out: RoundTableBlocker[] = [];
  const required = scenario.data.claimSlots.filter((s) => s.required);
  if (!required.every((s) => state.claims[s.id])) out.push('version-incomplete');
  if (structuringRevelations(scenario, state) < scenario.data.extension.roundTableRevelations)
    out.push('revelations');
  return out;
}

export function roundTableBlockerMessage(
  scenario: LoadedScenario,
  blockers: readonly RoundTableBlocker[],
): string {
  const parts: string[] = [];
  if (blockers.includes('version-incomplete'))
    parts.push('tous les emplacements de la version doivent être remplis');
  if (blockers.includes('revelations'))
    parts.push(
      `au moins ${scenario.data.extension.roundTableRevelations} révélations structurantes (pièces ou précisions obtenues par confrontation) sont nécessaires`,
    );
  return `La table ronde n’est pas encore possible : ${parts.join(' ; ')}.`;
}

export interface ReduceResult {
  state: GameState;
  rejected: { index: number; action: PlayerAction; error: ActionError }[];
}

export function reduceGame(
  scenario: LoadedScenario,
  initial: GameState,
  actions: readonly PlayerAction[],
): ReduceResult {
  let state = initial;
  const rejected: ReduceResult['rejected'] = [];
  actions.forEach((action, index) => {
    const result = applyAction(scenario, state, action);
    if (result.ok) state = result.state;
    else rejected.push({ index, action, error: result.error });
  });
  return { state, rejected };
}

export function reduceEnvelope(
  scenario: LoadedScenario,
  envelope: ReplayEnvelope,
): ReduceResult | { error: string } {
  if (envelope.scenarioId !== scenario.data.scenario.id)
    return { error: `Scénario inconnu : ${envelope.scenarioId}` };
  if (envelope.scenarioVersion > scenario.data.scenario.version)
    return { error: `Version de scénario plus récente (${envelope.scenarioVersion}).` };
  if (envelope.schemaVersion > REPLAY_SCHEMA_VERSION)
    return { error: `Version de journal plus récente (${envelope.schemaVersion}).` };
  return reduceGame(scenario, createInitialState(scenario, envelope.seed), envelope.actions);
}

export function toEnvelope(state: GameState, actions: readonly PlayerAction[]): ReplayEnvelope {
  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    scenarioId: state.scenarioId,
    scenarioVersion: state.scenarioVersion,
    seed: state.seed,
    actions: [...actions],
  };
}

export { sec };
