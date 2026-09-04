/**
 * Validation en ligne de commande du scénario embarqué : `npm run validate:scenario`.
 * Code de sortie 1 en cas d'erreur ; les avertissements sont listés.
 */
import rawScenario from '../src/scenario/la-veilleuse.json';
import { laVeilleuseExtension } from '../src/scenario/la-veilleuse.extension';
import { loadScenario } from '../src/scenario/loader';

const result = loadScenario(rawScenario, laVeilleuseExtension);
if (!result.ok) {
  console.error(`✗ Scénario invalide (${result.issues.length} problème(s)) :`);
  for (const i of result.issues)
    console.error(`  [${i.severity}] ${i.code} @ ${i.path} — ${i.message}`);
  process.exit(1);
}
console.log(
  `✓ Scénario « ${result.scenario.data.scenario.title} » valide : ${result.scenario.data.zones.length} zones, ${result.scenario.data.characters.length} personnages, ${result.scenario.data.canonicalFacts.length} faits, ${result.scenario.data.hypotheses.length} hypothèses, ${result.scenario.data.endings.length} fins.`,
);
for (const w of result.warnings)
  console.log(`  [avertissement] ${w.code} @ ${w.path} — ${w.message}`);
