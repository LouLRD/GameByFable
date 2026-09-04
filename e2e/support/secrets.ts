/**
 * Chaînes qui ne doivent JAMAIS apparaître dans le DOM avant leur révélation :
 * libellés des faits canonical-only, textes des déclarations et pièces non débloquées,
 * valeurs privées des personnages. Dérivées du scénario embarqué au moment du test.
 */
import fs from 'node:fs';
import path from 'node:path';

interface RawScenario {
  canonicalFacts: { id: string; secrecy: string }[];
  statements: { id: string; publicText: string; availableAtStart: boolean }[];
  evidence: { id: string; playerText: string; label: string; availableAtStart: boolean }[];
  characters: { values: string[]; privateCosts: Record<string, number> }[];
}

export function loadForbiddenAtStart(): string[] {
  const root = process.cwd();
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'src/scenario/la-veilleuse.json'), 'utf8')) as RawScenario;
  // L'extension est un module TS ; ses libellés de faits sont lus par expression régulière (sans transpilation).
  const extSource = fs.readFileSync(path.join(root, 'src/scenario/la-veilleuse.extension.ts'), 'utf8');
  const factLabels = new Map<string, string>();
  const reportedAtStart = new Set<string>();
  const startStatements = new Set(raw.statements.filter((s) => s.availableAtStart).map((s) => s.id));
  for (const m of extSource.matchAll(/factId: '([a-z_]+)', label: '([^']+)'[^\n]*reportedByStatementIds: \[([^\]]*)\]/g)) {
    factLabels.set(m[1] ?? '', m[2] ?? '');
    const reporters = (m[3] ?? '').split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
    if (reporters.some((r) => startStatements.has(r))) reportedAtStart.add(m[1] ?? '');
  }
  const out: string[] = [];
  for (const f of raw.canonicalFacts) {
    if (f.secrecy !== 'canonical-only') continue;
    if (reportedAtStart.has(f.id)) continue; // rapporté d'emblée par une déclaration initiale : visible comme « rapporté »
    const label = factLabels.get(f.id);
    if (label) out.push(label);
    out.push(f.id);
  }
  for (const s of raw.statements) if (!s.availableAtStart) out.push(s.publicText);
  for (const e of raw.evidence) if (!e.availableAtStart) out.push(e.playerText);
  for (const c of raw.characters) out.push(...c.values);
  out.push('internalReasons', 'signs-silently', 'canonicalHypothesisId', 'movementTracks', 'privateCosts');
  return out;
}

/** Textes secrets thématiques (formulations libres) à ne pas trouver avant révélation. */
export const THEMATIC_SECRETS = ['bouilloire', 'justificatif rose', 'fiche d’entretien', "fiche d'entretien", 'paper-only', 'protect-ana'];
