# EVALUATION — recette et barème (05_RECETTE_ET_BAREME.md)

Format : `[OK | PARTIEL | ÉCHEC] Critère` puis **Preuve** (commande, fichier/fonction ou procédure manuelle exacte) et, si nécessaire, **Limite connue**. Toutes les commandes s'exécutent depuis la racine après `npm ci`. Les preuves marquées « E2E » se rejouent avec `npm run test:e2e` (Chromium Playwright requis : `npx playwright install chromium`).

À COMPLÉTER : les sections D, G et les parcours manuels seront finalisés après l'intégration de l'interface.

## A. Moteur causal — 25 points

[OK] Séparation vérifiable entre faits, perceptions, croyances, déclarations et claims.
Preuve : types distincts dans `src/domain/model/scenario.ts` (`CanonicalFact`, `Perception`, `Belief`/`KnowledgeEntry`, `Statement`) et `src/domain/model/version.ts` (`PlayerClaim`) ; `src/domain/knowledge/knowledge.test.ts` (« une déclaration mensongère ne remplace pas la croyance du personnage », « une perception propre n'est pas une certitude ») ; `src/domain/selectors/playerView.test.ts` (les couches non révélées ne traversent pas la vue joueur).

[OK] Simulation déterministe depuis graine + journal d'actions.
Preuve : `src/domain/replay/reducer.test.ts` (« deux replays identiques sont profondément égaux », « l'état est dérivable de l'enveloppe », « les identifiants du journal dérivent de la graine et de l'index d'action ») ; règles ESLint interdisant `Math.random`, `Date.now` et `new Date` dans `src/domain` (`eslint.config.js`).

[OK] Graphe spatial pondéré et temporel réellement utilisé.
Preuve : `src/domain/engine/spatial.ts` (`traceRoute` : Dijkstra dépendant du temps, passages fermés avec attente, obstruction ×2,2) ; `src/domain/engine/spatial.test.ts` (« respecte les trajectoires canoniques », « l'obstruction active multiplie la durée », « borne exclusive ») ; `src/domain/engine/positions.test.ts` (« une obstruction révélée change l'issue d'un trajet »).

[OK] Visibilité et audition calculées, y compris occlusion et ambiguïté.
Preuve : `canSee` / `hearSignal` dans `src/domain/engine/spatial.ts` ; tests « vue partielle à travers plusieurs sauts », « la palette occulte la vue », « bloque explicitement les paires », « l'intensité diminue avec la perte acoustique cumulée », « donne la direction sans la source », « deux sources proches sont confondables » (`spatial.test.ts`) ; `detectors.test.ts` (« vue partielle puis identification impossible après la révélation de la palette »).

[OK] Claims produisant un monde proposé sans muter le canon.
Preuve : `src/domain/engine/context.ts` (`buildContext`, positions établies/rapportées/proposées) ; `positions.test.ts` (« une claim ajoute une présence proposée sans muter le canon » compare la sérialisation du scénario avant/après).

[OK] Moteur indépendant de React et du stockage.
Preuve : règle `no-restricted-imports`/`no-restricted-globals` sur `src/domain/**` et `src/scenario/**` dans `eslint.config.js` (`npm run lint`) ; `src/domain` n'importe que `zod` indirectement via `src/scenario` (validation), jamais React, DOM, Zustand ou stockage.

## B. Contradictions et explicabilité — 15 points

[OK] Détecteurs composables couvrant les sept catégories.
Preuve : `src/domain/contradictions/registry.ts` (cinq détecteurs factuels, kinds physique/temporel/sensoriel/matériel/épistémique/discursif) + motivationnel dérivé des signatures dans `src/domain/engine/evaluate.ts` ; `detectors.test.ts` « les sept familles de contradiction » (un test par famille).

[OK] Identifiants stables et déduplication.
Preuve : `makeContradictionId` = genre + règle + éléments triés (`common.ts`) ; tests « les identifiants sont stables et la déduplication conserve la sévérité la plus haute », « deux évaluations du même état renvoient les mêmes identifiants », « identifiant stable : la contradiction se transforme, elle ne clignote pas ».

[OK] Explications structurées en étapes et reliées aux éléments.
Preuve : `ExplanationStep` (union discriminée, `src/domain/model/contradiction.ts`), rendu par gabarits dans `src/domain/contradictions/render.ts` avec `refIds`, `at`, `zoneIds` par étape ; `detectors.test.ts` vérifie le contenu des étapes (« Trajet Rayon 2 → Bureau… », « ne peut atteindre… »).

[OK] Distinction inconnue/non étayée/contredite/impossible.
Preuve : `ClaimStatus` (`src/domain/model/version.ts`), calcul par slot dans `evaluate.ts` ; test « les détecteurs distinguent inconnu / non étayé / contredit / impossible ».

[OK] Aucun spoiler dans les explications avant révélation.
Preuve : `detectors.test.ts` « aucun spoiler avant révélation » (aucun libellé de fait secret, aucune déclaration non débloquée, aucun identifiant de fait `canonical-only` dans les éléments impliqués) ; détecteur épistémique en mode `player` (`knowledgePath(..., 'player')`).

## C. Game design et scénario — 15 points

[OK] Boucle observer–formuler–rejouer–confronter–réviser réellement jouable.
Preuve : `src/test/integration.test.ts` (« claim → simulation → contradiction → explication », « confrontation → révélation → nouvelle option », « conclusion refusée puis corrigée ») ; `npm run walkthroughs` rejoue quatre parties complètes ; E2E (à compléter).

[OK] Au moins quatre conclusions de familles différentes atteignables.
Preuve : `src/domain/endings/signatures.test.ts` « quatre fins de familles différentes sont atteignables par les données » (truth, consensus, accusation, incomplete) + « la fin de repli s'applique quand rien ne tient » (rejected) ; `npm run walkthroughs`.

[OK] Les mensonges ont des motifs distincts et ne valent pas automatiquement culpabilité.
Preuve : données `relationToBelief` + coûts privés ; `signatures.test.ts` « une vérité coûteuse est signée en silence… » (Ana ment pour protéger la procédure, Mina pour protéger Ana) ; la version canonique ne désigne aucun voleur et atteint `ending_transparent`.

[OK] Pression et confiance créent des décisions sans soft-lock injuste.
Preuve : `reducer.test.ts` (« une confrontation invalide n'est jamais consommée », récompenses de pression) ; `signatures.test.ts` « une approche directe ferme un personnage… sans soft-lock » (la fin protectrice reste atteignable avec 5 signatures) ; `dialogue/confrontation.test.ts` (messages d'échec informatifs sans révéler la bonne pièce).

[OK] Épilogue comparant clairement version signée et vérité révélée.
Preuve : `src/domain/selectors/epilogue.ts` (`slots[]` chosen/canonical/matches, `facts[]` révélés/caviardés, `canonicalAlignment`) ; tests « le parcours protecteur ne révèle pas l'emplacement réel du justificatif », « l'alignement canonique reste caché avant l'épilogue et visible après » ; écran `EpilogueScreen` (E2E à compléter).

## D. UX et direction artistique — 15 points

À COMPLÉTER après intégration.

## E. Robustesse technique — 15 points

[OK] TypeScript strict sans contournement massif par `any`.
Preuve : `tsconfig.app.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) ; ESLint `no-explicit-any: error`, `no-non-null-assertion: error` hors tests ; `npm run typecheck`.

[OK] Données et sauvegardes validées par schéma.
Preuve : `src/scenario/schema.ts` + `validate.ts` (unicité, références, intervalles, connexité, états, fin atteignable, compatibilité slots, confrontations) ; `src/scenario/loader.test.ts` ; `src/persistence/saveFormat.ts` (`parseSave`) et ses tests.

[OK] Persistance, trois emplacements et export/import fonctionnels.
Preuve : `src/persistence/repository.ts` (`auto`, `slot-1..3`), `exportImport.ts` ; `src/state/store.test.ts` (« trois emplacements manuels… », « export puis import : état sémantiquement équivalent ; import invalide non destructif », « restaure la sauvegarde automatique au redémarrage ») ; E2E parcours 3 (à compléter).

[OK] Erreurs bornées et absence de corruption après action refusée.
Preuve : `reducer.test.ts` « une action refusée ne modifie pas le hash sémantique de l'état », « renvoie des codes typés distincts » ; `integration.test.ts` « les actions rejetées au replay sont signalées sans casser la partie ».

[OK] Build statique reproductible, aucune dépendance distante à l'exécution.
Preuve : `npm run build` (base `./`), aucune URL distante dans `src/` (test `src/styles/tokens.test.ts` interdit `@import url(` et `fonts.googleapis`), polices système uniquement.

## F. Tests et preuves — 10 points

[OK] Tests unitaires substantiels du domaine. Preuve : `npm test` — fichiers `src/domain/**/*.test.ts`, `src/scenario/*.test.ts`.
[OK] Tests d'intégration de chaînes complètes. Preuve : `src/test/integration.test.ts`.
[À COMPLÉTER] Deux parcours end-to-end menant à des fins distinctes.
[OK] Test de replay/import équivalent. Preuve : `integration.test.ts` « export/import : état sémantiquement équivalent… », `reducer.test.ts` « l'état est dérivable de l'enveloppe ».
[OK] Mesure de performance honnête. Preuve : `src/domain/engine/evaluate.bench.test.ts` (1 000 évaluations complètes sans cache, médiane affichée dans la sortie de test, seuil 20 ms).

## G. Accessibilité et responsive — 5 points

À COMPLÉTER après intégration.

## Invariants automatisables (§4)

| # | Invariant | Test |
| --- | --- | --- |
| 1 | Deux replays identiques sont profondément égaux | `reducer.test.ts` |
| 2 | Une action refusée ne modifie pas le hash sémantique | `reducer.test.ts` |
| 3 | Aucune connaissance sans provenance | `knowledge.test.ts` |
| 4 | Pas deux zones incompatibles au même instant | `positions.test.ts` (canOccupy, checkPairCompatibility) |
| 5 | Trajet proposé ≥ plus court chemin ouvert | `positions.test.ts` « un trajet proposé ne peut être plus court… » |
| 6 | Une obstruction active modifie un chemin ou une ligne de vue | `spatial.test.ts`, `positions.test.ts` |
| 7 | Perception auditive décroissante avec la perte cumulée | `spatial.test.ts` |
| 8 | Une déclaration mensongère ne remplace pas la croyance | `knowledge.test.ts` |
| 9 | Contradiction motivationnelle non bloquante | `detectors.test.ts` |
| 10 | Retirer une claim supprime ses contradictions | `detectors.test.ts` |
| 11 | Aucune information canonical-only non révélée dans les sélecteurs UI | `playerView.test.ts` |
| 12 | Import invalide laisse la sauvegarde intacte | `integration.test.ts`, `store.test.ts` |
| 13 | Conclusion verrouillée non modifiable | `reducer.test.ts` |
| 14 | Vérité canonique → `ending_transparent` | `detectors.test.ts`, `signatures.test.ts` |
| 15 | `ending_protective` ne révèle pas le justificatif | `signatures.test.ts` |

## Parcours manuels (§5)

À COMPLÉTER après intégration (chaque parcours sera doublé d'un test E2E).

## Score revendiqué, plafonds, risques

À COMPLÉTER.
