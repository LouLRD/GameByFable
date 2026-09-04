/**
 * Connaissance des personnages : provenance explicite, certitudes, chemins de connaissance.
 *
 * Deux modes d'évaluation :
 * - 'canonical' : tout ce que le personnage sait réellement (usage interne : signatures, réactions) ;
 * - 'player'    : uniquement ce que le joueur peut savoir de cette connaissance (perceptions révélées,
 *                 faits établis) — utilisé par les détecteurs dont l'explication est affichée.
 */
import type { CharacterId, PropositionId } from '../model/ids';
import type { LoadedScenario, PropositionDef, PropositionSemantics } from '../model/scenario';
import type { GameState, KnowledgeEntry } from '../model/state';

export const CERTAIN_TRUE = 0.9;
export const CERTAIN_FALSE = 0.1;

/** Le personnage est-il le sujet de la proposition (action propre, position propre, perception propre) ? */
export function isSelfProposition(sem: PropositionSemantics, characterId: CharacterId): boolean {
  switch (sem.type) {
    case 'presence':
    case 'continuous-presence':
    case 'absence':
      return sem.characterId === characterId;
    case 'event':
    case 'sound':
      return sem.actorId === characterId;
    case 'perceived':
      // Une perception propre peut se tromper sur ce qu'elle identifie : pas une certitude.
      return false;
    case 'assertion':
      return sem.subjectId === characterId;
    case 'object-location':
      return false;
  }
}

/** Propositions rendues publiques dès le départ (pièces disponibles au début). */
export function publicPropositions(scenario: LoadedScenario): PropositionId[] {
  const out = new Set<PropositionId>();
  for (const e of scenario.data.evidence) if (e.availableAtStart) for (const p of e.supports) out.add(p);
  return [...out].sort();
}

/** Connaissance initiale d'un personnage : soi-même, croyances de départ, informations publiques. */
export function initialKnowledge(scenario: LoadedScenario, characterId: CharacterId): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  const seen = new Set<PropositionId>();
  for (const p of scenario.data.extension.propositions) {
    if (p.truth === null) continue;
    if (!isSelfProposition(p.semantics, characterId)) continue;
    entries.push({ propositionId: p.id, confidence: p.truth ? 1 : 0, provenanceIds: [`self:${characterId}`], origin: 'self' });
    seen.add(p.id);
  }
  for (const b of scenario.data.initialBeliefs) {
    if (b.characterId !== characterId || seen.has(b.propositionId)) continue;
    entries.push({ propositionId: b.propositionId, confidence: b.confidence, provenanceIds: [...b.provenanceIds], origin: 'belief' });
    seen.add(b.propositionId);
  }
  for (const pid of publicPropositions(scenario)) {
    if (seen.has(pid)) continue;
    const def = scenario.index.propositions.get(pid);
    const truth = def?.truth ?? true;
    entries.push({ propositionId: pid, confidence: truth ? 1 : 0, provenanceIds: ['public'], origin: 'public' });
    seen.add(pid);
  }
  return entries.sort((a, b) => (a.propositionId < b.propositionId ? -1 : 1));
}

/** Ajoute ou renforce une connaissance apprise, sans écraser une certitude propre. */
export function learn(entries: readonly KnowledgeEntry[], entry: KnowledgeEntry): KnowledgeEntry[] {
  const existing = entries.find((e) => e.propositionId === entry.propositionId);
  if (!existing) return [...entries, entry].sort((a, b) => (a.propositionId < b.propositionId ? -1 : 1));
  if (existing.origin === 'self') return [...entries];
  return entries.map((e) =>
    e.propositionId === entry.propositionId
      ? { ...e, confidence: entry.confidence, provenanceIds: [...new Set([...e.provenanceIds, ...entry.provenanceIds])], origin: entry.origin }
      : e,
  );
}

/** Propositions tenues pour certaines (vraies ou fausses). */
export function certainties(entries: readonly KnowledgeEntry[]): Map<PropositionId, boolean> {
  const out = new Map<PropositionId, boolean>();
  for (const e of entries) {
    if (e.confidence >= CERTAIN_TRUE) out.set(e.propositionId, true);
    else if (e.confidence <= CERTAIN_FALSE) out.set(e.propositionId, false);
  }
  return out;
}

export type KnowledgePathStatus = 'self' | 'full' | 'partial' | 'none';

export interface KnowledgePath {
  status: KnowledgePathStatus;
  requiredTags: string[];
  availableTags: string[];
  missingTags: string[];
  sourceIds: string[];
}

/**
 * Le personnage dispose-t-il d'un chemin de connaissance vers la proposition ?
 * En mode 'player', seules les perceptions révélées et les faits établis comptent.
 */
export function knowledgePath(
  scenario: LoadedScenario,
  state: GameState,
  characterId: CharacterId,
  proposition: PropositionDef,
  mode: 'player' | 'canonical',
): KnowledgePath {
  const required = [...new Set(proposition.knowledgeTags)].sort();
  if (isSelfProposition(proposition.semantics, characterId)) {
    return { status: 'self', requiredTags: required, availableTags: required, missingTags: [], sourceIds: [`self:${characterId}`] };
  }
  const available = new Set<string>();
  const sources: string[] = [];
  const revealed = new Set(state.revealedPerceptionIds);
  for (const p of scenario.data.perceptions) {
    if (p.observerId !== characterId) continue;
    if (mode === 'player' && !revealed.has(p.id)) continue;
    for (const t of p.perceivedTags) available.add(t);
    sources.push(p.id);
  }
  const established = new Set(state.establishedFactIds);
  for (const f of scenario.data.canonicalFacts) {
    if (!f.participants.includes(characterId)) continue;
    if (mode === 'player' && !established.has(f.id) && f.secrecy !== 'public') continue;
    for (const t of f.tags) available.add(t);
    sources.push(f.id);
  }
  const knowledge = state.characters[characterId]?.knowledge ?? [];
  for (const k of knowledge) {
    if (k.origin !== 'learned' && k.origin !== 'public') continue;
    const def = scenario.index.propositions.get(k.propositionId);
    if (!def) continue;
    for (const t of def.knowledgeTags) available.add(t);
    sources.push(...k.provenanceIds);
  }
  const availableTags = [...available].sort();
  const missing = required.filter((t) => !available.has(t));
  const status: KnowledgePathStatus = required.length === 0 || missing.length === 0 ? 'full' : missing.length < required.length ? 'partial' : 'none';
  return { status, requiredTags: required, availableTags, missingTags: missing, sourceIds: [...new Set(sources)].sort() };
}
