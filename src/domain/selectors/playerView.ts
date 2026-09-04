/**
 * Vue joueur : tout ce que l'interface a le droit d'afficher. Aucun fait `canonical-only`
 * non révélé, aucune raison interne, aucun alignement canonique avant l'épilogue,
 * aucune valeur privée de personnage.
 */
import type { Contradiction } from '../model/contradiction';
import type { SlotEvaluation } from '../model/evaluation';
import type { CharacterId, EvidenceId, FactId, HypothesisId, StatementId } from '../model/ids';
import type {
  ClaimSlot,
  Hypothesis,
  LoadedScenario,
  Obstruction,
  OnboardingStep,
} from '../model/scenario';
import type { GameState, JournalEntry } from '../model/state';
import type { PlayerClaim } from '../model/version';
import type { Interval } from '../model/time';
import { formatClock } from '../model/time';
import { evaluateVersion } from '../engine/evaluate';
import type { PositionModel } from '../engine/positions';
import { positionAt } from '../engine/positions';
import { availableHypothesisIds, knownWorld } from '../engine/context';
import { renderExplanation, type RenderedStep } from '../contradictions/render';
import { trustState } from '../endings/signatures';
import { findConfrontation } from '../dialogue/confrontation';
import {
  roundTableBlockers,
  roundTableBlockerMessage,
  structuringRevelations,
} from '../replay/reducer';

export type Degree = 'established' | 'reported' | 'deduced' | 'proposed';

export interface EvidenceView {
  id: EvidenceId;
  label: string;
  degree: Degree;
  playerText: string;
  attached: boolean;
  mandatory: boolean;
  marker: { zoneId?: string; at?: number; interval?: Interval; label: string } | null;
  supportsLabels: string[];
  excludesLabels: string[];
}

export interface StatementView {
  id: StatementId;
  speakerId: CharacterId;
  speakerName: string;
  text: string;
  propositionLabel: string;
  standing: boolean;
  supersededById: StatementId | null;
  degree: Degree;
}

export interface PerceptionView {
  id: string;
  observerId: CharacterId;
  modality: string;
  fidelity: string;
  perceivedTags: string[];
  factLabel: string | null;
}

export interface CharacterView {
  id: CharacterId;
  name: string;
  role: string;
  pronouns: string;
  portraitSeed: number;
  accentColor: string;
  trustState: ReturnType<typeof trustState>;
  statementIds: StatementId[];
  perceptions: PerceptionView[];
  admittedLabels: string[];
  confrontationsResolved: number;
}

export interface FactView {
  id: FactId;
  label: string;
  degree: Degree;
  zoneId: string | null;
  interval: Interval;
  participantIds: CharacterId[];
}

export interface HypothesisView extends Hypothesis {
  accusatory: boolean;
  hasWorldEffect: boolean;
}

export interface ContradictionView extends Contradiction {
  steps: RenderedStep[];
}

export interface AdhesionView {
  characterId: CharacterId;
  verdict: 'signs' | 'refuses' | 'requests-change';
  publicReasons: string[];
  requestedSlotId?: string;
}

export interface VersionView {
  claims: Record<string, PlayerClaim>;
  slots: SlotEvaluation[];
  completeness: number;
  coherenceStatus: string;
  blockingIds: string[];
  noticeIds: string[];
  disclosure: {
    establishedExplained: number;
    explainedEvidenceIds: string[];
    unexplainedEvidenceIds: string[];
    canonicalAlignment: number | null;
  };
  adhesion: AdhesionView[];
  signatureCount: number;
  roundTableAvailable: boolean;
  roundTableMessage: string | null;
  revelations: number;
  revelationsRequired: number;
  canSeal: boolean;
}

export interface ConfrontationOptionView {
  characterId: CharacterId;
  targetId: string;
  supportId: string | undefined;
  valid: boolean;
  cost: number | null;
  requiresTrustAtLeast: number | null;
  message: string | null;
}

export interface PlayerView {
  title: string;
  subtitle: string;
  premise: string;
  startClock: string;
  durationSeconds: number;
  incidentAt: number;
  phase: GameState['phase'];
  act: 'I' | 'II' | 'III' | 'Épilogue';
  pressure: number;
  pressureMax: number;
  evidence: EvidenceView[];
  statements: StatementView[];
  characters: CharacterView[];
  facts: FactView[];
  hypotheses: HypothesisView[];
  slots: ClaimSlot[];
  contradictions: ContradictionView[];
  motivational: ContradictionView[];
  version: VersionView;
  journal: JournalEntry[];
  onboarding: OnboardingStep | null;
  obstructions: Obstruction[];
  positions: PositionModel;
  clock: (t: number) => string;
  isSealed: boolean;
}

export function selectAct(scenario: LoadedScenario, state: GameState): PlayerView['act'] {
  if (state.phase === 'sealed') return 'Épilogue';
  if (state.phase === 'round-table' || roundTableBlockers(scenario, state).length === 0)
    return 'III';
  if (Object.keys(state.claims).length > 0) return 'II';
  return 'I';
}

export function selectEvidence(scenario: LoadedScenario, state: GameState): EvidenceView[] {
  const detached = new Set(state.detachedEvidenceIds);
  return state.unlockedEvidenceIds
    .map((id) => scenario.index.evidence.get(id))
    .filter((e): e is NonNullable<typeof e> => e !== undefined)
    .map((e) => {
      const marker = scenario.index.evidenceMarkers.get(e.id);
      return {
        id: e.id,
        label: e.label,
        degree: e.status === 'established' ? 'established' : 'deduced',
        playerText: e.playerText,
        attached: !detached.has(e.id),
        mandatory: e.availableAtStart,
        marker: marker
          ? {
              label: marker.label,
              ...(marker.zoneId ? { zoneId: marker.zoneId } : {}),
              ...(marker.at !== undefined ? { at: marker.at } : {}),
              ...(marker.interval ? { interval: marker.interval } : {}),
            }
          : null,
        supportsLabels: e.supports.map((p) => scenario.index.propositions.get(p)?.label ?? p),
        excludesLabels: e.excludes.map((p) => scenario.index.propositions.get(p)?.label ?? p),
      };
    });
}

export function selectStatements(scenario: LoadedScenario, state: GameState): StatementView[] {
  const retracted = new Set(state.retractedStatementIds);
  const unlocked = new Set(state.unlockedStatementIds);
  return state.unlockedStatementIds
    .map((id) => scenario.index.statements.get(id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined)
    .map((s) => {
      const successor = [...scenario.index.statementExtensions.values()].find(
        (x) => x.supersedes.includes(s.id) && unlocked.has(x.statementId),
      );
      return {
        id: s.id,
        speakerId: s.speakerId,
        speakerName: scenario.index.characters.get(s.speakerId)?.name ?? s.speakerId,
        text: s.publicText,
        propositionLabel:
          scenario.index.propositions.get(s.propositionId)?.label ?? s.propositionId,
        standing: !retracted.has(s.id),
        supersededById: successor ? successor.statementId : null,
        degree: 'reported',
      };
    });
}

export function selectFacts(scenario: LoadedScenario, state: GameState): FactView[] {
  const established = new Set(state.establishedFactIds);
  const reported = new Set(state.reportedFactIds);
  const out: FactView[] = [];
  for (const f of scenario.data.canonicalFacts) {
    const isEstablished = f.secrecy === 'public' || established.has(f.id);
    const isReported = reported.has(f.id);
    if (!isEstablished && !isReported) continue;
    const pres = scenario.index.factPresentations.get(f.id);
    out.push({
      id: f.id,
      label: pres?.label ?? f.id,
      degree: isEstablished ? 'established' : 'reported',
      zoneId: f.zoneId,
      interval: f.interval,
      participantIds: [...f.participants],
    });
  }
  return out.sort((a, b) => a.interval.start - b.interval.start);
}

export function selectCharacters(scenario: LoadedScenario, state: GameState): CharacterView[] {
  const revealed = new Set(state.revealedPerceptionIds);
  const established = new Set(state.establishedFactIds);
  const reported = new Set(state.reportedFactIds);
  return scenario.data.characters.map((c) => {
    const cs = state.characters[c.id];
    const ext = scenario.index.characterExtensions.get(c.id);
    const perceptions: PerceptionView[] = scenario.data.perceptions
      .filter((p) => p.observerId === c.id && revealed.has(p.id))
      .map((p) => {
        const fact = scenario.index.facts.get(p.sourceFactId);
        const visible =
          fact && (fact.secrecy === 'public' || established.has(fact.id) || reported.has(fact.id));
        return {
          id: p.id,
          observerId: p.observerId,
          modality: p.modality,
          fidelity: p.fidelity,
          perceivedTags: [...p.perceivedTags],
          factLabel: visible
            ? (scenario.index.factPresentations.get(p.sourceFactId)?.label ?? null)
            : null,
        };
      });
    return {
      id: c.id,
      name: c.name,
      role: c.role,
      pronouns: c.pronouns,
      portraitSeed: c.portraitSeed,
      accentColor: c.accentColor,
      trustState: trustState(cs?.trust ?? c.initialTrust),
      statementIds: state.unlockedStatementIds.filter(
        (id) => scenario.index.statements.get(id)?.speakerId === c.id,
      ),
      perceptions,
      admittedLabels: (cs?.admittedCostKeys ?? []).map((k) => ext?.costLabels[k] ?? k),
      confrontationsResolved: state.confrontationHistory.filter((h) => h.characterId === c.id)
        .length,
    };
  });
}

export function selectHypotheses(scenario: LoadedScenario, state: GameState): HypothesisView[] {
  const available = availableHypothesisIds(scenario, state.unlockedEvidenceIds);
  return scenario.data.hypotheses
    .filter((h) => available.has(h.id))
    .map((h) => {
      const ext = scenario.index.hypothesisExtensions.get(h.id);
      return {
        ...h,
        accusatory: ext?.accusatory ?? false,
        hasWorldEffect: (ext?.worldEffect?.type ?? 'none') !== 'none',
      };
    });
}

export function selectOnboarding(
  scenario: LoadedScenario,
  state: GameState,
  ui: { selectedId: string | null },
): OnboardingStep | null {
  const dismissed = new Set(state.dismissedOnboardingIds);
  const { evaluation } = evaluateVersion(scenario, state);
  for (const step of scenario.data.onboarding) {
    if (dismissed.has(step.id)) continue;
    const t = step.trigger;
    let met = false;
    if (t === 'new-game') met = true;
    else if (t.startsWith('evidence-selected:'))
      met = ui.selectedId === t.slice('evidence-selected:'.length);
    else if (t === 'first-claim-available') met = state.dismissedOnboardingIds.length >= 1;
    else if (t === 'first-contradiction')
      met = evaluation.contradictions.some((c) => c.involvesVersion);
    else if (t === 'first-confrontation-ready')
      met = scenario.data.confrontations.some((c) =>
        c.targetIds.some(
          (tid) => findConfrontation(scenario, state, c.characterId, tid, c.supportIds[0]).ok,
        ),
      );
    if (met) return step;
  }
  return null;
}

export function selectConfrontationOption(
  scenario: LoadedScenario,
  state: GameState,
  characterId: CharacterId,
  targetId: string,
  supportId: string | undefined,
): ConfrontationOptionView {
  const found = findConfrontation(scenario, state, characterId, targetId, supportId);
  if (!found.ok)
    return {
      characterId,
      targetId,
      supportId,
      valid: false,
      cost: null,
      requiresTrustAtLeast: null,
      message: found.error.message,
    };
  return {
    characterId,
    targetId,
    supportId,
    valid: true,
    cost: found.def.pressureCost,
    requiresTrustAtLeast: found.def.requiresTrustAtLeast ?? null,
    message: null,
  };
}

export function selectPlayerView(
  scenario: LoadedScenario,
  state: GameState,
  ui: { selectedId: string | null } = { selectedId: null },
): PlayerView {
  const { evaluation, context } = evaluateVersion(scenario, state);
  const start = scenario.data.scenario.timeline.startClock;
  const withSteps = (c: Contradiction): ContradictionView => ({
    ...c,
    steps: renderExplanation(c.explanation, scenario),
  });
  const blockers = roundTableBlockers(scenario, state);
  const world = knownWorld(scenario, state.unlockedEvidenceIds);
  const adhesion: AdhesionView[] = evaluation.adhesion.map((d) => ({
    characterId: d.characterId,
    verdict: d.verdict === 'signs' || d.verdict === 'signs-silently' ? 'signs' : d.verdict,
    publicReasons:
      d.verdict === 'signs-silently'
        ? [
            `${scenario.index.characters.get(d.characterId)?.name ?? d.characterId} n’a pas d’objection à formuler.`,
          ]
        : [...d.publicReasons],
    ...(d.requestedSlotId ? { requestedSlotId: d.requestedSlotId } : {}),
  }));
  return {
    title: scenario.data.scenario.title,
    subtitle: scenario.data.scenario.subtitle,
    premise: scenario.data.scenario.publicPremise,
    startClock: start,
    durationSeconds: scenario.data.scenario.timeline.durationSeconds,
    incidentAt: parseIncident(scenario),
    phase: state.phase,
    act: selectAct(scenario, state),
    pressure: state.pressure,
    pressureMax: scenario.data.maximumPressure,
    evidence: selectEvidence(scenario, state),
    statements: selectStatements(scenario, state),
    characters: selectCharacters(scenario, state),
    facts: selectFacts(scenario, state),
    hypotheses: selectHypotheses(scenario, state),
    slots: scenario.data.claimSlots,
    contradictions: evaluation.contradictions.map(withSteps),
    motivational: evaluation.motivational.map(withSteps),
    version: {
      claims: { ...state.claims },
      slots: evaluation.slots,
      completeness: evaluation.completeness,
      coherenceStatus: evaluation.coherence.status,
      blockingIds: evaluation.coherence.blocking.map((c) => c.id),
      noticeIds: evaluation.coherence.notices.map((c) => c.id),
      disclosure: {
        ...evaluation.disclosure,
        canonicalAlignment:
          state.phase === 'sealed' ? evaluation.disclosure.canonicalAlignment : null,
      },
      adhesion,
      signatureCount: evaluation.signatureCount,
      roundTableAvailable: blockers.length === 0,
      roundTableMessage: blockers.length > 0 ? roundTableBlockerMessage(scenario, blockers) : null,
      revelations: structuringRevelations(scenario, state),
      revelationsRequired: scenario.data.extension.roundTableRevelations,
      canSeal: state.phase === 'round-table',
    },
    journal: [...state.journal],
    onboarding: selectOnboarding(scenario, state, ui),
    obstructions: scenario.data.obstructions.filter((o) => world.activeObstructionIds.has(o.id)),
    positions: context.positions,
    clock: (t: number) => formatClock(start, t),
    isSealed: state.phase === 'sealed',
  };
}

function parseIncident(scenario: LoadedScenario): number {
  const [h = 0, m = 0, s = 0] = scenario.data.scenario.timeline.incidentClock
    .split(':')
    .map(Number);
  const [h0 = 0, m0 = 0, s0 = 0] = scenario.data.scenario.timeline.startClock
    .split(':')
    .map(Number);
  return h * 3600 + m * 60 + s - (h0 * 3600 + m0 * 60 + s0);
}

export { positionAt };
export type { HypothesisId };
