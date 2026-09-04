/**
 * Chargement du scénario : parsing Zod, validation croisée, dérivation de la vérité,
 * construction de l'index. Ne mute jamais les données d'entrée.
 */
import type {
  CanonicalFact,
  Character,
  ClaimSlot,
  ConfrontationDef,
  Ending,
  Evidence,
  Hypothesis,
  LoadedScenario,
  Passage,
  PropositionDef,
  Scenario,
  ScenarioExtension,
  ScenarioIndex,
  SoundSignal,
  Statement,
  Zone,
} from '@/domain/model/scenario';
import type { CharacterId, ClaimSlotId, FactId, HypothesisId, ZoneId } from '@/domain/model/ids';
import { ExtensionSchema, RawScenarioSchema, type RawExtension, type RawScenario } from './schema';
import { deriveTruth, validateScenario, type ScenarioIssue } from './validate';

export type LoadResult =
  | { ok: true; scenario: LoadedScenario; warnings: ScenarioIssue[] }
  | { ok: false; issues: ScenarioIssue[] };

function zodIssues(
  prefix: string,
  error: { issues: { path: PropertyKey[]; message: string }[] },
): ScenarioIssue[] {
  return error.issues.map((i) => ({
    severity: 'error' as const,
    code: 'schema',
    path: `${prefix}.${i.path.map(String).join('.')}`,
    message: i.message,
  }));
}

function toMap<T extends { id: string }, K extends string>(items: readonly T[]): Map<K, T> {
  return new Map(items.map((i) => [i.id as K, i]));
}

function buildIndex(data: Scenario): ScenarioIndex {
  const hypothesesBySlot = new Map<ClaimSlotId, Hypothesis[]>();
  for (const h of data.hypotheses) {
    const list = hypothesesBySlot.get(h.slotId) ?? [];
    list.push(h);
    hypothesesBySlot.set(h.slotId, list);
  }
  const adjacency = new Map<ZoneId, Passage[]>();
  for (const z of data.zones) adjacency.set(z.id, []);
  for (const p of data.passages) {
    adjacency.get(p.from)?.push(p);
    adjacency.get(p.to)?.push(p);
  }
  const canonicalBySlot = new Map<ClaimSlotId, HypothesisId>();
  for (const f of data.canonicalFacts) {
    if (f.variableSlotId && f.canonicalHypothesisId)
      canonicalBySlot.set(f.variableSlotId, f.canonicalHypothesisId);
  }
  for (const [slot, h] of Object.entries(data.extension.canonicalHypothesisBySlot)) {
    if (h) canonicalBySlot.set(slot as ClaimSlotId, h);
  }
  const soundsByFact = new Map<FactId, SoundSignal>();
  for (const s of data.soundSignals) soundsByFact.set(s.factId, s);

  return {
    zones: toMap<Zone, ZoneId>(data.zones),
    passages: toMap(data.passages),
    obstructions: toMap(data.obstructions),
    characters: toMap<Character, CharacterId>(data.characters),
    tracks: new Map(data.movementTracks.map((t) => [t.characterId, t])),
    facts: toMap<CanonicalFact, FactId>(data.canonicalFacts),
    sounds: toMap(data.soundSignals),
    soundsByFact,
    perceptions: toMap(data.perceptions),
    evidence: toMap<Evidence, never>(data.evidence),
    statements: toMap<Statement, never>(data.statements),
    slots: toMap<ClaimSlot, ClaimSlotId>(data.claimSlots),
    hypotheses: toMap<Hypothesis, HypothesisId>(data.hypotheses),
    hypothesesBySlot,
    confrontations: toMap<ConfrontationDef, never>(data.confrontations),
    endings: toMap<Ending, never>(data.endings),
    propositions: toMap<PropositionDef, never>(data.extension.propositions),
    evidenceMarkers: new Map(data.extension.evidenceMarkers.map((m) => [m.evidenceId, m])),
    factPresentations: new Map(data.extension.facts.map((f) => [f.factId, f])),
    hypothesisExtensions: new Map(data.extension.hypotheses.map((h) => [h.hypothesisId, h])),
    statementExtensions: new Map(data.extension.statements.map((s) => [s.statementId, s])),
    confrontationExtensions: new Map(
      data.extension.confrontations.map((c) => [c.confrontationId, c]),
    ),
    characterExtensions: new Map(data.extension.characters.map((c) => [c.characterId, c])),
    endingExtensions: new Map(data.extension.endings.map((e) => [e.endingId, e])),
    signatureRules: new Map(data.signatureRules.map((r) => [r.characterId, r])),
    canonicalBySlot,
    adjacency,
  };
}

/** Normalise le JSON validé vers le modèle typé (valeurs par défaut, exclusions symétriques, vérité). */
function normalize(raw: RawScenario, ext: RawExtension, truth: Map<string, boolean>): Scenario {
  const excludesMap = new Map<string, Set<string>>();
  for (const p of ext.propositions) excludesMap.set(p.id, new Set(p.excludes));
  for (const p of ext.propositions) {
    for (const x of p.excludes) excludesMap.get(x)?.add(p.id);
  }
  const extension: ScenarioExtension = {
    ...(ext as unknown as ScenarioExtension),
    propositions: ext.propositions.map(
      (p) =>
        ({
          ...p,
          excludes: [...(excludesMap.get(p.id) ?? [])].sort(),
          truth: truth.get(p.id) ?? null,
        }) as unknown as PropositionDef,
    ),
  };
  const hypotheses: Hypothesis[] = raw.hypotheses.map(
    (h) =>
      ({
        ...h,
        availableAtStart: h.availableAtStart ?? h.unlockEvidenceIds.length === 0,
        requiresActor: h.requiresActor,
      }) as unknown as Hypothesis,
  );
  const endings: Ending[] = raw.endings.map(
    (e) =>
      ({
        ...e,
        maxBlockingContradictions: e.maxBlockingContradictions ?? null,
      }) as unknown as Ending,
  );
  return {
    ...(raw as unknown as Omit<Scenario, 'extension' | 'hypotheses' | 'endings'>),
    hypotheses,
    endings,
    extension,
  };
}

export function loadScenario(rawInput: unknown, extensionInput: unknown): LoadResult {
  const rawParsed = RawScenarioSchema.safeParse(rawInput);
  const extParsed = ExtensionSchema.safeParse(extensionInput);
  const issues: ScenarioIssue[] = [];
  if (!rawParsed.success) issues.push(...zodIssues('scenario', rawParsed.error));
  if (!extParsed.success) issues.push(...zodIssues('extension', extParsed.error));
  if (!rawParsed.success || !extParsed.success) return { ok: false, issues };

  const raw = rawParsed.data;
  const ext = extParsed.data;
  issues.push(...validateScenario(raw, ext));

  const canonicalBySlot = new Map<string, string>();
  for (const f of raw.canonicalFacts) {
    if (f.variableSlotId && f.canonicalHypothesisId)
      canonicalBySlot.set(f.variableSlotId, f.canonicalHypothesisId);
  }
  for (const [slot, h] of Object.entries(ext.canonicalHypothesisBySlot))
    canonicalBySlot.set(slot, h);
  const { truth, issues: truthIssues } = deriveTruth(raw, ext, canonicalBySlot);
  issues.push(...truthIssues);

  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { ok: false, issues };

  const data = normalize(raw, ext, truth);
  const index = buildIndex(data);
  return { ok: true, scenario: { data, index }, warnings: issues };
}
