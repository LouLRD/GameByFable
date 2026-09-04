/**
 * Validation sémantique croisée du scénario (spécification §5).
 * Toutes les vérifications produisent des `ScenarioIssue` ; aucune n'interrompt les autres.
 */
import type { RawExtension, RawScenario } from './schema';

export interface ScenarioIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
}

type Issues = ScenarioIssue[];

const err = (issues: Issues, code: string, path: string, message: string) =>
  issues.push({ severity: 'error', code, path, message });
const warn = (issues: Issues, code: string, path: string, message: string) =>
  issues.push({ severity: 'warning', code, path, message });

function checkUnique(issues: Issues, ns: string, ids: string[]): Set<string> {
  const seen = new Set<string>();
  ids.forEach((v, i) => {
    if (seen.has(v)) err(issues, 'duplicate-id', `${ns}[${i}]`, `Identifiant dupliqué « ${v} » dans ${ns}.`);
    seen.add(v);
  });
  return seen;
}

export function validateScenario(raw: RawScenario, ext: RawExtension): Issues {
  const issues: Issues = [];
  const duration = raw.scenario.timeline.durationSeconds;

  // --- unicité par namespace -------------------------------------------------
  const zoneIds = checkUnique(issues, 'zones', raw.zones.map((z) => z.id));
  checkUnique(issues, 'passages', raw.passages.map((p) => p.id));
  const obstructionIds = checkUnique(issues, 'obstructions', raw.obstructions.map((o) => o.id));
  const characterIds = checkUnique(issues, 'characters', raw.characters.map((c) => c.id));
  const factIds = checkUnique(issues, 'canonicalFacts', raw.canonicalFacts.map((f) => f.id));
  checkUnique(issues, 'soundSignals', raw.soundSignals.map((s) => s.id));
  const perceptionIds = checkUnique(issues, 'perceptions', raw.perceptions.map((p) => p.id));
  checkUnique(issues, 'initialBeliefs', raw.initialBeliefs.map((b) => b.id));
  const evidenceIds = checkUnique(issues, 'evidence', raw.evidence.map((e) => e.id));
  const statementIds = checkUnique(issues, 'statements', raw.statements.map((s) => s.id));
  const slotIds = checkUnique(issues, 'claimSlots', raw.claimSlots.map((s) => s.id));
  const hypothesisIds = checkUnique(issues, 'hypotheses', raw.hypotheses.map((h) => h.id));
  const confrontationIds = checkUnique(issues, 'confrontations', raw.confrontations.map((c) => c.id));
  checkUnique(issues, 'genericRules', raw.genericRules.map((r) => r.id));
  checkUnique(issues, 'pressureRewards', raw.pressureRewards.map((r) => r.id));
  const endingIds = checkUnique(issues, 'endings', raw.endings.map((e) => e.id));
  checkUnique(issues, 'onboarding', raw.onboarding.map((o) => o.id));
  const propositionIds = checkUnique(issues, 'extension.propositions', ext.propositions.map((p) => p.id));

  const refZone = (path: string, v: string) => {
    if (!zoneIds.has(v)) err(issues, 'unknown-zone', path, `Zone inconnue « ${v} ».`);
  };
  const refChar = (path: string, v: string) => {
    if (!characterIds.has(v)) err(issues, 'unknown-character', path, `Personnage inconnu « ${v} ».`);
  };
  const refProp = (path: string, v: string) => {
    if (!propositionIds.has(v)) err(issues, 'unknown-proposition', path, `Proposition non définie « ${v} ».`);
  };
  const refEvidence = (path: string, v: string) => {
    if (!evidenceIds.has(v)) err(issues, 'unknown-evidence', path, `Pièce inconnue « ${v} ».`);
  };
  const refStatement = (path: string, v: string) => {
    if (!statementIds.has(v)) err(issues, 'unknown-statement', path, `Déclaration inconnue « ${v} ».`);
  };
  const refHypothesis = (path: string, v: string) => {
    if (!hypothesisIds.has(v)) err(issues, 'unknown-hypothesis', path, `Hypothèse inconnue « ${v} ».`);
  };
  const refConfrontation = (path: string, v: string) => {
    if (!confrontationIds.has(v)) err(issues, 'unknown-confrontation', path, `Confrontation inconnue « ${v} ».`);
  };
  const refFact = (path: string, v: string) => {
    if (!factIds.has(v)) err(issues, 'unknown-fact', path, `Fait inconnu « ${v} ».`);
  };
  const checkInterval = (path: string, i: { start: number; end: number }) => {
    if (i.start < 0 || i.end > duration || i.start > i.end) {
      err(issues, 'interval-out-of-window', path, `Intervalle [${i.start}, ${i.end}] hors fenêtre [0, ${duration}].`);
    }
  };

  // --- graphe spatial ----------------------------------------------------------
  const adjacency = new Map<string, Set<string>>();
  raw.zones.forEach((z) => adjacency.set(z.id, new Set()));
  raw.passages.forEach((p, i) => {
    refZone(`passages[${i}].from`, p.from);
    refZone(`passages[${i}].to`, p.to);
    if (p.from === p.to) err(issues, 'self-passage', `passages[${i}]`, `Le passage « ${p.id} » relie une zone à elle-même.`);
    if (p.affectedByObstructionId && !obstructionIds.has(p.affectedByObstructionId)) {
      err(issues, 'unknown-obstruction', `passages[${i}].affectedByObstructionId`, `Obstruction inconnue « ${p.affectedByObstructionId} ».`);
    }
    adjacency.get(p.from)?.add(p.to);
    adjacency.get(p.to)?.add(p.from);
  });
  // Connexité
  const first = raw.zones[0]?.id;
  if (first) {
    const seen = new Set<string>([first]);
    const stack = [first];
    while (stack.length > 0) {
      const z = stack.pop();
      if (z === undefined) break;
      for (const n of adjacency.get(z) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    raw.zones.forEach((z) => {
      if (!seen.has(z.id)) err(issues, 'disconnected-zone', `zones.${z.id}`, `La zone « ${z.label} » n'est reliée à aucune autre.`);
    });
  }
  raw.obstructions.forEach((o, i) => {
    refZone(`obstructions[${i}].zoneId`, o.zoneId);
    checkInterval(`obstructions[${i}].interval`, o.interval);
    o.blocksSightBetween.forEach(([a, b], j) => {
      refZone(`obstructions[${i}].blocksSightBetween[${j}][0]`, a);
      refZone(`obstructions[${i}].blocksSightBetween[${j}][1]`, b);
    });
    if (o.publicAfterEvidenceId) refEvidence(`obstructions[${i}].publicAfterEvidenceId`, o.publicAfterEvidenceId);
    const affected = raw.passages.some((p) => p.affectedByObstructionId === o.id);
    const blocks = o.blocksSightBetween.length > 0;
    if (!affected && !blocks) warn(issues, 'inert-obstruction', `obstructions[${i}]`, `L'obstruction « ${o.id} » n'affecte ni chemin ni ligne de vue.`);
  });

  // --- personnages -----------------------------------------------------------
  raw.characters.forEach((c, i) => {
    if (!Number.isInteger(c.initialTrust)) err(issues, 'invalid-trust', `characters[${i}].initialTrust`, 'Confiance initiale non entière.');
    if (!raw.movementTracks.some((t) => t.characterId === c.id)) {
      err(issues, 'missing-track', `characters[${i}]`, `Aucune trajectoire pour « ${c.name} ».`);
    }
    if (!raw.signatureRules.some((r) => r.characterId === c.id)) {
      err(issues, 'missing-signature-rule', `characters[${i}]`, `Aucune règle de signature pour « ${c.name} ».`);
    }
  });
  raw.movementTracks.forEach((t, i) => {
    refChar(`movementTracks[${i}].characterId`, t.characterId);
    let prevEnd = -1;
    t.segments.forEach((sgm, j) => {
      refZone(`movementTracks[${i}].segments[${j}].zoneId`, sgm.zoneId);
      checkInterval(`movementTracks[${i}].segments[${j}]`, sgm);
      if (sgm.start < prevEnd) err(issues, 'track-overlap', `movementTracks[${i}].segments[${j}]`, `Segments qui se chevauchent pour « ${t.characterId} ».`);
      prevEnd = sgm.end;
    });
  });

  // --- faits, sons, perceptions, croyances ------------------------------------
  const hypothesisById = new Map(raw.hypotheses.map((h) => [h.id, h]));
  raw.canonicalFacts.forEach((f, i) => {
    checkInterval(`canonicalFacts[${i}].interval`, f.interval);
    if (f.zoneId !== null) refZone(`canonicalFacts[${i}].zoneId`, f.zoneId);
    f.participants.forEach((p, j) => refChar(`canonicalFacts[${i}].participants[${j}]`, p));
    if (f.variableSlotId && !slotIds.has(f.variableSlotId)) err(issues, 'unknown-slot', `canonicalFacts[${i}].variableSlotId`, `Slot inconnu « ${f.variableSlotId} ».`);
    if (f.canonicalHypothesisId) {
      refHypothesis(`canonicalFacts[${i}].canonicalHypothesisId`, f.canonicalHypothesisId);
      const h = hypothesisById.get(f.canonicalHypothesisId);
      if (h && f.variableSlotId && h.slotId !== f.variableSlotId) {
        err(issues, 'slot-mismatch', `canonicalFacts[${i}]`, `L'hypothèse canonique « ${h.id} » n'appartient pas au slot « ${f.variableSlotId} ».`);
      }
    }
    // Aucun texte joueur ne doit être porté par un fait canonical-only.
    const record = f as Record<string, unknown>;
    if (f.secrecy === 'canonical-only' && ('playerText' in record || 'label' in record)) {
      err(issues, 'secret-player-text', `canonicalFacts[${i}]`, `Le fait secret « ${f.id} » porte un texte joueur.`);
    }
  });
  raw.soundSignals.forEach((s, i) => {
    refFact(`soundSignals[${i}].factId`, s.factId);
    refZone(`soundSignals[${i}].originZoneId`, s.originZoneId);
  });
  raw.perceptions.forEach((p, i) => {
    refChar(`perceptions[${i}].observerId`, p.observerId);
    refFact(`perceptions[${i}].sourceFactId`, p.sourceFactId);
  });
  const knownProvenance = new Set<string>([...factIds, ...perceptionIds, ...evidenceIds, ...statementIds]);
  raw.initialBeliefs.forEach((b, i) => {
    refChar(`initialBeliefs[${i}].characterId`, b.characterId);
    refProp(`initialBeliefs[${i}].propositionId`, b.propositionId);
    b.provenanceIds.forEach((pid, j) => {
      if (!knownProvenance.has(pid)) err(issues, 'unknown-provenance', `initialBeliefs[${i}].provenanceIds[${j}]`, `Provenance inconnue « ${pid} ».`);
    });
  });

  // --- pièces et déclarations ---------------------------------------------------
  raw.evidence.forEach((e, i) => {
    e.supports.forEach((p, j) => refProp(`evidence[${i}].supports[${j}]`, p));
    e.excludes.forEach((p, j) => refProp(`evidence[${i}].excludes[${j}]`, p));
    (e.unlockBy ?? []).forEach((c, j) => refConfrontation(`evidence[${i}].unlockBy[${j}]`, c));
    if (!e.availableAtStart && (e.unlockBy ?? []).length === 0) {
      err(issues, 'unreachable-evidence', `evidence[${i}]`, `La pièce « ${e.id} » n'est ni disponible au départ ni déblocable.`);
    }
  });
  raw.statements.forEach((s, i) => {
    refChar(`statements[${i}].speakerId`, s.speakerId);
    refProp(`statements[${i}].propositionId`, s.propositionId);
    s.unlockConditionIds.forEach((c, j) => refConfrontation(`statements[${i}].unlockConditionIds[${j}]`, c));
    if (!s.availableAtStart && s.unlockConditionIds.length === 0) {
      err(issues, 'unreachable-statement', `statements[${i}]`, `La déclaration « ${s.id} » n'est ni disponible au départ ni déblocable.`);
    }
  });

  // --- canevas -----------------------------------------------------------------
  raw.hypotheses.forEach((h, i) => {
    if (!slotIds.has(h.slotId)) err(issues, 'unknown-slot', `hypotheses[${i}].slotId`, `Slot inconnu « ${h.slotId} ».`);
    h.propositions.forEach((p, j) => refProp(`hypotheses[${i}].propositions[${j}]`, p));
    if (h.defaultActorId) refChar(`hypotheses[${i}].defaultActorId`, h.defaultActorId);
    if (h.defaultZoneId) refZone(`hypotheses[${i}].defaultZoneId`, h.defaultZoneId);
    if (h.defaultInterval) checkInterval(`hypotheses[${i}].defaultInterval`, h.defaultInterval);
    h.unlockEvidenceIds.forEach((e, j) => refEvidence(`hypotheses[${i}].unlockEvidenceIds[${j}]`, e));
    const available = h.availableAtStart ?? h.unlockEvidenceIds.length === 0;
    if (!available && h.unlockEvidenceIds.length === 0) {
      err(issues, 'unreachable-hypothesis', `hypotheses[${i}]`, `L'hypothèse « ${h.id} » n'est ni disponible ni déblocable.`);
    }
    if (h.availableAtStart === true && h.unlockEvidenceIds.length > 0) {
      err(issues, 'hypothesis-unlock-conflict', `hypotheses[${i}]`, `« ${h.id} » est disponible au départ ET conditionnée par des pièces.`);
    }
    if (h.requiresActor && h.defaultActorId) {
      warn(issues, 'actor-default-with-required', `hypotheses[${i}]`, `« ${h.id} » exige un acteur mais en propose un par défaut.`);
    }
  });
  raw.claimSlots.forEach((slot, i) => {
    if (!raw.hypotheses.some((h) => h.slotId === slot.id)) err(issues, 'empty-slot', `claimSlots[${i}]`, `Aucune hypothèse pour le slot « ${slot.id} ».`);
  });

  // --- confrontations -----------------------------------------------------------
  const pieceIds = new Set<string>([...evidenceIds, ...statementIds]);
  raw.confrontations.forEach((c, i) => {
    refChar(`confrontations[${i}].characterId`, c.characterId);
    c.targetIds.forEach((t, j) => {
      if (!pieceIds.has(t)) err(issues, 'unknown-piece', `confrontations[${i}].targetIds[${j}]`, `Cible inconnue « ${t} ».`);
    });
    c.supportIds.forEach((t, j) => {
      if (!pieceIds.has(t)) err(issues, 'unknown-piece', `confrontations[${i}].supportIds[${j}]`, `Pièce d'appui inconnue « ${t} ».`);
    });
    (['neutral', 'empathetic', 'direct'] as const).forEach((a) => {
      c.approaches[a].unlockEvidenceIds.forEach((e, j) => refEvidence(`confrontations[${i}].approaches.${a}.unlockEvidenceIds[${j}]`, e));
      c.approaches[a].unlockStatementIds.forEach((s, j) => refStatement(`confrontations[${i}].approaches.${a}.unlockStatementIds[${j}]`, s));
    });
  });

  // --- règles, récompenses, fins ---------------------------------------------------
  raw.genericRules.forEach((r, i) => {
    if (r.ifEvidenceId) refEvidence(`genericRules[${i}].ifEvidenceId`, r.ifEvidenceId);
    if (r.conflictsWithEvidenceId) refEvidence(`genericRules[${i}].conflictsWithEvidenceId`, r.conflictsWithEvidenceId);
    if (r.ifProposition) refProp(`genericRules[${i}].ifProposition`, r.ifProposition);
    if (r.excludeProposition) refProp(`genericRules[${i}].excludeProposition`, r.excludeProposition);
    r.requireAnyProposition?.forEach((p, j) => refProp(`genericRules[${i}].requireAnyProposition[${j}]`, p));
    if (r.statementId) refStatement(`genericRules[${i}].statementId`, r.statementId);
  });
  raw.pressureRewards.forEach((r, i) => {
    if (r.condition.type === 'evidence-unlocked') r.condition.all.forEach((e, j) => refEvidence(`pressureRewards[${i}].condition.all[${j}]`, e));
  });
  raw.endings.forEach((e, i) => {
    e.requiresHypotheses.forEach((h, j) => refHypothesis(`endings[${i}].requiresHypotheses[${j}]`, h));
    e.requiresEvidence.forEach((v, j) => refEvidence(`endings[${i}].requiresEvidence[${j}]`, v));
    e.forbidsEvidenceInReport.forEach((v, j) => refEvidence(`endings[${i}].forbidsEvidenceInReport[${j}]`, v));
    e.forbidsEvidenceUnlocked.forEach((v, j) => refEvidence(`endings[${i}].forbidsEvidenceUnlocked[${j}]`, v));
    if (e.specialSignatureRule) {
      const m = /^(.+)-never-signs$/.exec(e.specialSignatureRule);
      if (!m || !characterIds.has(m[1] ?? '')) err(issues, 'unknown-special-rule', `endings[${i}].specialSignatureRule`, `Règle spéciale non reconnue « ${e.specialSignatureRule} ».`);
    }
    const slotsCovered = new Set(e.requiresHypotheses.map((h) => hypothesisById.get(h)?.slotId));
    if (slotsCovered.size !== e.requiresHypotheses.length) {
      err(issues, 'ending-slot-collision', `endings[${i}]`, `La fin « ${e.id} » exige deux hypothèses du même slot.`);
    }
  });
  if (!raw.endings.some((e) => e.fallback)) err(issues, 'no-fallback-ending', 'endings', 'Aucune fin de repli.');
  raw.signatureRules.forEach((r, i) => {
    refChar(`signatureRules[${i}].characterId`, r.characterId);
    r.rejectsPropositions.forEach((p, j) => refProp(`signatureRules[${i}].rejectsPropositions[${j}]`, p));
  });

  // --- Au moins une fin non-fallback atteignable structurellement -----------------
  // Fermeture des déblocages : pièces et déclarations atteignables via confrontations
  // dont les pièces d'appui sont elles-mêmes atteignables.
  const reachableEvidence = new Set(raw.evidence.filter((e) => e.availableAtStart).map((e) => e.id));
  const reachableStatements = new Set(raw.statements.filter((s) => s.availableAtStart).map((s) => s.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of raw.confrontations) {
      const targetOk = c.targetIds.some((t) => reachableEvidence.has(t) || reachableStatements.has(t));
      const supportOk = c.supportIds.length === 0 || c.supportIds.some((t) => reachableEvidence.has(t) || reachableStatements.has(t));
      if (!targetOk || !supportOk) continue;
      for (const a of ['neutral', 'empathetic', 'direct'] as const) {
        for (const e of c.approaches[a].unlockEvidenceIds) {
          if (!reachableEvidence.has(e)) {
            reachableEvidence.add(e);
            changed = true;
          }
        }
        for (const s of c.approaches[a].unlockStatementIds) {
          if (!reachableStatements.has(s)) {
            reachableStatements.add(s);
            changed = true;
          }
        }
      }
    }
  }
  const reachableHypotheses = new Set(
    raw.hypotheses
      .filter((h) => (h.availableAtStart ?? h.unlockEvidenceIds.length === 0) || h.unlockEvidenceIds.every((e) => reachableEvidence.has(e)))
      .map((h) => h.id),
  );
  const reachableEndings = raw.endings.filter(
    (e) => !e.fallback && e.requiresHypotheses.every((h) => reachableHypotheses.has(h)) && e.requiresEvidence.every((v) => reachableEvidence.has(v)),
  );
  if (reachableEndings.length === 0) err(issues, 'no-reachable-ending', 'endings', 'Aucune fin n\'est structurellement atteignable.');
  raw.evidence.forEach((e) => {
    if (!reachableEvidence.has(e.id)) warn(issues, 'unreachable-evidence-chain', `evidence.${e.id}`, `La pièce « ${e.id} » n'est jamais déblocable par une chaîne de confrontations.`);
  });

  // --- Extension -------------------------------------------------------------------
  ext.propositions.forEach((p, i) => {
    p.excludes.forEach((x, j) => refProp(`extension.propositions[${i}].excludes[${j}]`, x));
    Object.keys(p.costKeys).forEach((c) => refChar(`extension.propositions[${i}].costKeys.${c}`, c));
    const sem = p.semantics;
    switch (sem.type) {
      case 'presence':
      case 'continuous-presence':
      case 'absence':
        refChar(`extension.propositions[${i}].semantics.characterId`, sem.characterId);
        refZone(`extension.propositions[${i}].semantics.zoneId`, sem.zoneId);
        checkInterval(`extension.propositions[${i}].semantics.interval`, sem.interval);
        break;
      case 'event':
      case 'sound':
        if (sem.actorId) refChar(`extension.propositions[${i}].semantics.actorId`, sem.actorId);
        if (sem.zoneId) refZone(`extension.propositions[${i}].semantics.zoneId`, sem.zoneId);
        if (sem.interval) checkInterval(`extension.propositions[${i}].semantics.interval`, sem.interval);
        break;
      case 'perceived':
        refChar(`extension.propositions[${i}].semantics.observerId`, sem.observerId);
        if (sem.observerZoneId) refZone(`extension.propositions[${i}].semantics.observerZoneId`, sem.observerZoneId);
        if (sem.target.characterId) refChar(`extension.propositions[${i}].semantics.target.characterId`, sem.target.characterId);
        refZone(`extension.propositions[${i}].semantics.target.zoneId`, sem.target.zoneId);
        checkInterval(`extension.propositions[${i}].semantics.target.interval`, sem.target.interval);
        break;
      case 'object-location':
        refZone(`extension.propositions[${i}].semantics.zoneId`, sem.zoneId);
        checkInterval(`extension.propositions[${i}].semantics.interval`, sem.interval);
        break;
      case 'assertion':
        if (sem.subjectId) refChar(`extension.propositions[${i}].semantics.subjectId`, sem.subjectId);
        break;
    }
  });
  // Toute proposition référencée par le JSON doit être définie (déjà via refProp) ; et symétrie des exclusions.
  const propById = new Map(ext.propositions.map((p) => [p.id, p]));
  ext.propositions.forEach((p) => {
    p.excludes.forEach((x) => {
      const other = propById.get(x);
      if (other && !other.excludes.includes(p.id)) warn(issues, 'asymmetric-exclusion', `extension.propositions.${p.id}`, `Exclusion non symétrique entre « ${p.id} » et « ${x} » (rendue symétrique au chargement).`);
    });
  });
  ext.evidenceMarkers.forEach((m, i) => {
    refEvidence(`extension.evidenceMarkers[${i}].evidenceId`, m.evidenceId);
    if (m.zoneId) refZone(`extension.evidenceMarkers[${i}].zoneId`, m.zoneId);
    if (m.interval) checkInterval(`extension.evidenceMarkers[${i}].interval`, m.interval);
    if (m.at !== undefined && (m.at < 0 || m.at > duration)) err(issues, 'interval-out-of-window', `extension.evidenceMarkers[${i}].at`, 'Instant hors fenêtre.');
  });
  ext.facts.forEach((f, i) => {
    refFact(`extension.facts[${i}].factId`, f.factId);
    f.revealedByEvidenceIds.forEach((e, j) => refEvidence(`extension.facts[${i}].revealedByEvidenceIds[${j}]`, e));
    f.reportedByStatementIds.forEach((s, j) => refStatement(`extension.facts[${i}].reportedByStatementIds[${j}]`, s));
    f.revealedByConfrontationIds.forEach((c, j) => refConfrontation(`extension.facts[${i}].revealedByConfrontationIds[${j}]`, c));
  });
  raw.canonicalFacts.forEach((f) => {
    if (!ext.facts.some((x) => x.factId === f.id)) err(issues, 'missing-fact-label', `extension.facts`, `Aucun libellé joueur pour le fait « ${f.id} ».`);
  });
  ext.hypotheses.forEach((h, i) => {
    refHypothesis(`extension.hypotheses[${i}].hypothesisId`, h.hypothesisId);
    Object.keys(h.costKeys).forEach((c) => refChar(`extension.hypotheses[${i}].costKeys.${c}`, c));
  });
  ext.statements.forEach((s, i) => {
    refStatement(`extension.statements[${i}].statementId`, s.statementId);
    s.supersedes.forEach((x, j) => refStatement(`extension.statements[${i}].supersedes[${j}]`, x));
    s.revealsPerceptionIds.forEach((p, j) => {
      if (!perceptionIds.has(p)) err(issues, 'unknown-perception', `extension.statements[${i}].revealsPerceptionIds[${j}]`, `Perception inconnue « ${p} ».`);
    });
  });
  ext.confrontations.forEach((c, i) => {
    refConfrontation(`extension.confrontations[${i}].confrontationId`, c.confrontationId);
    c.retractsStatementIds.forEach((s, j) => refStatement(`extension.confrontations[${i}].retractsStatementIds[${j}]`, s));
    Object.keys(c.admitsCostKeys).forEach((k) => refChar(`extension.confrontations[${i}].admitsCostKeys.${k}`, k));
    c.beliefUpdates.forEach((b, j) => {
      refChar(`extension.confrontations[${i}].beliefUpdates[${j}].characterId`, b.characterId);
      refProp(`extension.confrontations[${i}].beliefUpdates[${j}].propositionId`, b.propositionId);
    });
  });
  raw.confrontations.forEach((c) => {
    if (!ext.confrontations.some((x) => x.confrontationId === c.id)) err(issues, 'missing-variants', 'extension.confrontations', `Aucune variante de réponse pour « ${c.id} ».`);
  });
  ext.characters.forEach((c, i) => refChar(`extension.characters[${i}].characterId`, c.characterId));
  raw.characters.forEach((c) => {
    if (!ext.characters.some((x) => x.characterId === c.id)) err(issues, 'missing-character-extension', 'extension.characters', `Aucune réaction définie pour « ${c.id} ».`);
  });
  ext.endings.forEach((e, i) => {
    if (!endingIds.has(e.endingId)) err(issues, 'unknown-ending', `extension.endings[${i}].endingId`, `Fin inconnue « ${e.endingId} ».`);
  });
  ext.cameraCoverage.zoneIds.forEach((z, i) => refZone(`extension.cameraCoverage.zoneIds[${i}]`, z));
  refEvidence('extension.cameraCoverage.gapEvidenceId', ext.cameraCoverage.gapEvidenceId);
  if (!ext.evidenceMarkers.some((m) => m.evidenceId === ext.cameraCoverage.gapEvidenceId && m.interval)) {
    err(issues, 'camera-gap-marker', 'extension.cameraCoverage', 'La pièce de coupure caméra doit avoir un marqueur avec intervalle.');
  }
  Object.entries(ext.canonicalHypothesisBySlot).forEach(([slot, h]) => {
    if (!slotIds.has(slot)) err(issues, 'unknown-slot', `extension.canonicalHypothesisBySlot.${slot}`, `Slot inconnu « ${slot} ».`);
    refHypothesis(`extension.canonicalHypothesisBySlot.${slot}`, h);
    const hyp = hypothesisById.get(h);
    if (hyp && hyp.slotId !== slot) err(issues, 'slot-mismatch', `extension.canonicalHypothesisBySlot.${slot}`, `« ${h} » n'appartient pas au slot « ${slot} ».`);
  });
  // Chaque slot doit avoir une hypothèse canonique (fait variable ou extension)
  raw.claimSlots.forEach((slot) => {
    const viaFact = raw.canonicalFacts.some((f) => f.variableSlotId === slot.id && f.canonicalHypothesisId);
    const viaExt = slot.id in ext.canonicalHypothesisBySlot;
    if (!viaFact && !viaExt) err(issues, 'no-canonical-hypothesis', `claimSlots.${slot.id}`, `Aucune hypothèse canonique connue pour le slot « ${slot.id} ».`);
  });

  return issues;
}

/**
 * Dérive la table de vérité canonique des propositions à partir du JSON
 * (déclarations honnêtes/mensongères, hypothèses canoniques, pièces) et la confronte
 * aux valeurs déclarées dans l'extension. Retourne la table fusionnée et les conflits.
 */
export function deriveTruth(
  raw: RawScenario,
  ext: RawExtension,
  canonicalBySlot: ReadonlyMap<string, string>,
): { truth: Map<string, boolean>; issues: ScenarioIssue[] } {
  const issues: ScenarioIssue[] = [];
  const derived = new Map<string, { value: boolean; source: string }>();
  const set = (prop: string, value: boolean, source: string) => {
    const prev = derived.get(prop);
    if (prev && prev.value !== value) {
      issues.push({
        severity: 'error',
        code: 'truth-conflict',
        path: `truth.${prop}`,
        message: `Vérité contradictoire pour « ${prop} » : ${prev.source} ⇒ ${prev.value}, ${source} ⇒ ${value}.`,
      });
      return;
    }
    if (!prev) derived.set(prop, { value, source });
  };
  const hypById = new Map(raw.hypotheses.map((h) => [h.id, h]));
  // Hypothèses canoniques ⇒ vraies
  for (const hid of canonicalBySlot.values()) {
    for (const p of hypById.get(hid)?.propositions ?? []) set(p, true, `hypothèse canonique ${hid}`);
  }
  // Pièces : supports ⇒ vrai, excludes ⇒ faux
  for (const e of raw.evidence) {
    for (const p of e.supports) set(p, true, `pièce ${e.id} (supports)`);
    for (const p of e.excludes) set(p, false, `pièce ${e.id} (excludes)`);
  }
  // Déclarations : honnête ⇒ vrai ; mensonge/embelli ⇒ faux
  for (const s of raw.statements) {
    if (s.relationToBelief === 'honest') set(s.propositionId, true, `déclaration honnête ${s.id}`);
    if (s.relationToBelief === 'lie' || s.relationToBelief === 'embellished') set(s.propositionId, false, `déclaration ${s.relationToBelief} ${s.id}`);
  }
  // Hypothèses non canoniques : propositions fausses sauf si déjà établies vraies
  for (const h of raw.hypotheses) {
    if (canonicalBySlot.get(h.slotId) === h.id) continue;
    for (const p of h.propositions) if (!derived.has(p)) set(p, false, `hypothèse non canonique ${h.id}`);
  }
  const truth = new Map<string, boolean>();
  for (const p of ext.propositions) {
    const d = derived.get(p.id);
    if (d && p.truth !== null && p.truth !== d.value) {
      issues.push({
        severity: 'error',
        code: 'truth-conflict',
        path: `extension.propositions.${p.id}.truth`,
        message: `Vérité déclarée (${p.truth}) contredite par ${d.source} (${d.value}).`,
      });
    }
    const value = d?.value ?? p.truth;
    if (value === null || value === undefined) {
      issues.push({ severity: 'warning', code: 'truth-unknown', path: `extension.propositions.${p.id}.truth`, message: `Vérité indéterminée pour « ${p.id} ».` });
    } else {
      truth.set(p.id, value);
    }
  }
  return { truth, issues };
}
