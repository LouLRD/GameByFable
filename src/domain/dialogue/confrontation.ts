/**
 * Résolution déterministe des confrontations et des sondages (« probe »).
 * Aucune sélection aléatoire : l'issue dépend des données, de la confiance, de la pression et de l'approche.
 */
import type { ActionError } from '../model/actions';
import type {
  CharacterId,
  ConfrontationId,
  EvidenceId,
  PropositionId,
  StatementId,
} from '../model/ids';
import type { Approach, ConfrontationDef, LoadedScenario } from '../model/scenario';
import type { GameState } from '../model/state';
import { certainties, isSelfProposition } from '../knowledge/knowledge';
import { trustState } from '../endings/signatures';

export interface ConfrontationResolution {
  def: ConfrontationDef;
  approach: Approach;
  text: string;
  trustDelta: number;
  unlockEvidenceIds: EvidenceId[];
  unlockStatementIds: StatementId[];
  retractsStatementIds: StatementId[];
  admitsCostKeys: Partial<Record<CharacterId, string[]>>;
  beliefUpdates: { characterId: CharacterId; propositionId: PropositionId; confidence: number }[];
  learnedPropositionIds: PropositionId[];
  annotation: string | null;
}

export type ConfrontationOutcome =
  { ok: true; resolution: ConfrontationResolution } | { ok: false; error: ActionError };

const fail = (
  code: ActionError['code'],
  message: string,
  details?: ActionError['details'],
): ConfrontationOutcome => ({
  ok: false,
  error: details ? { code, message, details } : { code, message },
});

function pieceUnlocked(scenario: LoadedScenario, state: GameState, id: string): boolean {
  if (scenario.index.evidence.has(id as EvidenceId))
    return state.unlockedEvidenceIds.includes(id as EvidenceId);
  if (scenario.index.statements.has(id as StatementId))
    return state.unlockedStatementIds.includes(id as StatementId);
  return false;
}

/** Trouve la confrontation correspondant à (personnage, cible, appui) ou explique l'échec de façon informative. */
export function findConfrontation(
  scenario: LoadedScenario,
  state: GameState,
  characterId: CharacterId,
  targetId: string,
  supportId: string | undefined,
): { ok: true; def: ConfrontationDef } | { ok: false; error: ActionError } {
  const character = scenario.index.characters.get(characterId);
  if (!character)
    return { ok: false, error: { code: 'unknown-character', message: 'Personne inconnue.' } };
  const name = character.name;
  if (
    !scenario.index.evidence.has(targetId as EvidenceId) &&
    !scenario.index.statements.has(targetId as StatementId)
  ) {
    return { ok: false, error: { code: 'unknown-target', message: 'Cette pièce n’existe pas.' } };
  }
  if (!pieceUnlocked(scenario, state, targetId)) {
    return {
      ok: false,
      error: { code: 'target-locked', message: 'Cette pièce n’est pas dans le dossier.' },
    };
  }
  if (supportId !== undefined && !pieceUnlocked(scenario, state, supportId)) {
    return {
      ok: false,
      error: {
        code: 'support-locked',
        message: 'Cette pièce d’appui n’est pas encore dans le dossier.',
      },
    };
  }
  const forCharacter = scenario.data.confrontations.filter((c) => c.characterId === characterId);
  const forTarget = forCharacter.filter((c) => c.targetIds.includes(targetId as never));
  if (forTarget.length === 0) {
    return {
      ok: false,
      error: {
        code: 'no-matching-confrontation',
        message: `${name} n’a rien à ajouter à propos de cette pièce : ce n’est pas un point sur lequel ${character.pronouns === 'il' ? 'il' : character.pronouns === 'elle' ? 'elle' : 'iel'} peut être mis·e en difficulté.`,
      },
    };
  }
  const withSupport = forTarget.filter(
    (c) =>
      c.supportIds.length === 0 ||
      (supportId !== undefined && c.supportIds.includes(supportId as never)),
  );
  if (withSupport.length === 0) {
    return {
      ok: false,
      error: {
        code: 'no-matching-confrontation',
        message:
          supportId === undefined
            ? `Sans pièce d’appui, ${name} maintient sa version. Il faut une trace ou une déclaration qui la contredise directement.`
            : `Cette pièce n’entame pas la position de ${name} sur ce point. Il faut une pièce qui contredise directement sa déclaration.`,
      },
    };
  }
  const resolved = new Set(state.resolvedConfrontationIds);
  const unresolved = withSupport.filter((c) => !resolved.has(c.id));
  if (unresolved.length === 0) {
    return {
      ok: false,
      error: {
        code: 'confrontation-already-resolved',
        message: `${name} a déjà répondu sur ce point.`,
      },
    };
  }
  const def = unresolved[0];
  if (!def)
    return {
      ok: false,
      error: {
        code: 'confrontation-already-resolved',
        message: `${name} a déjà répondu sur ce point.`,
      },
    };
  return { ok: true, def };
}

export function resolveConfrontation(
  scenario: LoadedScenario,
  state: GameState,
  characterId: CharacterId,
  targetId: string,
  supportId: string | undefined,
  approach: Approach,
): ConfrontationOutcome {
  const found = findConfrontation(scenario, state, characterId, targetId, supportId);
  if (!found.ok) return found;
  const def = found.def;
  const character = scenario.index.characters.get(characterId);
  const name = character?.name ?? characterId;
  const trust = state.characters[characterId]?.trust ?? 0;
  if (state.pressure < def.pressureCost) {
    return fail(
      'insufficient-pressure',
      `Il vous manque de la pression pour cette confrontation (coût ${def.pressureCost}, disponible ${state.pressure}). Une observation nouvelle ou une contradiction résolue peut en rendre.`,
      { cost: def.pressureCost, pressure: state.pressure },
    );
  }
  if (def.requiresTrustAtLeast !== undefined && trust < def.requiresTrustAtLeast) {
    return fail(
      'insufficient-trust',
      `${name} est ${trustState(trust)} : trop fermé·e pour une confrontation de cette importance. Gagnez d’abord sa confiance.`,
      { required: def.requiresTrustAtLeast },
    );
  }
  const outcome = def.approaches[approach];
  const ext = scenario.index.confrontationExtensions.get(def.id);
  const someApproachUnlocksStatements = (['neutral', 'empathetic', 'direct'] as const).some(
    (a) => def.approaches[a].unlockStatementIds.length > 0,
  );
  const guarded =
    someApproachUnlocksStatements &&
    outcome.unlockStatementIds.length === 0 &&
    ext?.guardedVariant !== undefined;
  const text = guarded
    ? (ext?.guardedVariant ?? def.responseText)
    : (ext?.responseVariants[approach] ?? def.responseText);
  const learned: PropositionId[] = [];
  if (supportId && scenario.index.evidence.has(supportId as EvidenceId)) {
    for (const p of scenario.index.evidence.get(supportId as EvidenceId)?.supports ?? [])
      learned.push(p);
  }
  return {
    ok: true,
    resolution: {
      def,
      approach,
      text,
      trustDelta: outcome.trustDelta,
      unlockEvidenceIds: [...outcome.unlockEvidenceIds],
      unlockStatementIds: [...outcome.unlockStatementIds],
      retractsStatementIds: [...(ext?.retractsStatementIds ?? [])],
      admitsCostKeys: ext?.admitsCostKeys ?? {},
      beliefUpdates: [...(ext?.beliefUpdates ?? [])],
      learnedPropositionIds: learned,
      annotation: ext?.annotation ?? null,
    },
  };
}

export interface ProbeResult {
  text: string;
  trustDelta: number;
  stance: 'neutral' | 'refuses' | 'acknowledges' | 'unknown';
}

/**
 * Sonder un protagoniste avec une hypothèse (disponible) ou une pièce (débloquée) : réaction publique,
 * sans coût de pression. Une approche directe et accusatrice coûte de la confiance.
 * N'utilise jamais une connaissance non révélée au joueur.
 */
export function probe(
  scenario: LoadedScenario,
  state: GameState,
  characterId: CharacterId,
  targetId: string,
  approach: Approach,
): { ok: true; result: ProbeResult } | { ok: false; error: ActionError } {
  const character = scenario.index.characters.get(characterId);
  const ext = scenario.index.characterExtensions.get(characterId);
  if (!character || !ext)
    return { ok: false, error: { code: 'unknown-character', message: 'Personne inconnue.' } };
  const hypothesis = scenario.index.hypotheses.get(targetId as never);
  const evidence = scenario.index.evidence.get(targetId as EvidenceId);
  if (hypothesis) {
    const unlocked = new Set(state.unlockedEvidenceIds);
    if (!(
      hypothesis.availableAtStart || hypothesis.unlockEvidenceIds.every((e) => unlocked.has(e))
    )) {
      return {
        ok: false,
        error: {
          code: 'hypothesis-locked',
          message: 'Cette hypothèse n’est pas encore formulable.',
        },
      };
    }
    const rule = scenario.index.signatureRules.get(characterId);
    const hext = scenario.index.hypothesisExtensions.get(hypothesis.id);
    const rejects = (rule?.rejectsPropositions ?? []).some((p) =>
      hypothesis.propositions.includes(p),
    );
    const accused =
      Boolean(hext?.accusatory) &&
      (hypothesis.defaultActorId === characterId ||
        (hypothesis.requiresActor && !hypothesis.defaultActorId));
    if (rejects || (hext?.accusatory && hypothesis.defaultActorId === characterId)) {
      const delta = approach === 'direct' ? -1 : 0;
      return {
        ok: true,
        result: {
          text:
            approach === 'direct'
              ? ext.reactions.probeDirectAccused
              : ext.reactions.refusesAccusation,
          trustDelta: delta,
          stance: 'refuses',
        },
      };
    }
    // Certitudes connues du joueur (déclarations débloquées de cette personne)
    const certain = certainties(state.characters[characterId]?.knowledge ?? []);
    const knownByPlayer = new Set(
      state.unlockedStatementIds.map((id) => scenario.index.statements.get(id)?.propositionId),
    );
    for (const p of hypothesis.propositions) {
      const def = scenario.index.propositions.get(p);
      if (!def) continue;
      for (const [c, value] of certain) {
        if (!knownByPlayer.has(c)) continue;
        const cdef = scenario.index.propositions.get(c);
        if (!cdef) continue;
        const conflict =
          (c === p && !value) || (value && (def.excludes.includes(c) || cdef.excludes.includes(p)));
        if (conflict)
          return {
            ok: true,
            result: { text: ext.reactions.refusesBelief, trustDelta: 0, stance: 'refuses' },
          };
      }
    }
    if (accused && approach === 'direct') {
      return {
        ok: true,
        result: { text: ext.reactions.probeDirectAccused, trustDelta: -1, stance: 'refuses' },
      };
    }
    return {
      ok: true,
      result: { text: ext.reactions.probeNeutral, trustDelta: 0, stance: 'neutral' },
    };
  }
  if (evidence) {
    if (!state.unlockedEvidenceIds.includes(evidence.id))
      return {
        ok: false,
        error: { code: 'evidence-locked', message: 'Cette pièce n’est pas dans le dossier.' },
      };
    const self = evidence.supports.some((p) => {
      const def = scenario.index.propositions.get(p);
      return def ? isSelfProposition(def.semantics, characterId) : false;
    });
    if (self)
      return {
        ok: true,
        result: {
          text: `${character.name} ne conteste pas ce que cette pièce montre de ses propres gestes.`,
          trustDelta: 0,
          stance: 'acknowledges',
        },
      };
    return {
      ok: true,
      result: { text: ext.reactions.probeEvidenceUnknown, trustDelta: 0, stance: 'unknown' },
    };
  }
  return { ok: false, error: { code: 'unknown-target', message: 'Cible inconnue.' } };
}

export function confrontationCost(def: ConfrontationDef): number {
  return def.pressureCost;
}

export const confrontationIds = (scenario: LoadedScenario): ConfrontationId[] =>
  scenario.data.confrontations.map((c) => c.id);
