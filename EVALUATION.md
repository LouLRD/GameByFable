# EVALUATION — recette et barème (05_RECETTE_ET_BAREME.md)

Format : `[OK | PARTIEL | ÉCHEC] Critère` puis **Preuve** (commande, fichier/fonction ou procédure manuelle exacte) et, si nécessaire, **Limite connue**. Toutes les commandes s'exécutent depuis la racine après `npm ci`. Les preuves marquées « E2E » se rejouent avec `npm run test:e2e` (Chromium Playwright requis : `npx playwright install chromium`).

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

[OK] Plan, frise, dossier et version forment un espace de travail compréhensible.
Preuve : `src/app/Workbench.tsx` (grille desktop bandeau / dossier / plan + frise / version, mode focus, poignées clavier) ; `src/app/App.dom.test.tsx` (« rend le bureau après bootstrap : titre, quatre espaces, horloge et pression », « mode focus… », « onglets Version | Contradictions ») ; un seul curseur temporel partagé (`useGameStore.cursor`) : `src/features/timeline/TimelinePanel.dom.test.tsx` (« cliquer sur un marqueur… déplace le curseur et met la zone en évidence »), `src/features/map/MapPanel.dom.test.tsx` (« déplacer le curseur à 600 retire les jetons… »). Procédure : `npm run dev`, largeur ≥ 1024 px.

[OK] Identité visuelle spécifique, cohérente avec le dossier nocturne et sans kit générique évident.
Preuve : `src/styles/tokens.css` (palette imposée, piles de polices système, texture papier thermique `.ticket`, annotations `.hand-note`, ruban `.tape`), aucune dépendance d'interface (`package.json`), portraits SVG génératifs (`src/components/portrait`). Contraste WCAG AA vérifié par `src/styles/tokens.test.ts` (ratios ≥ 4,5 calculés).

[OK] Micro-interactions informatives et mode mouvement réduit.
Preuve : propagation à la pose d'une hypothèse et fissure du fil causal (`src/features/version-board/VersionBoard.dom.test.tsx` « place « Vol par Malik » … fissure »), pulsation des zones (`MapPanel.dom.test.tsx` « placer une hypothèse fait pulser la zone et l’acteur… sans classe d’animation en mouvement réduit »), frise (`TimelinePanel.dom.test.tsx` « en mouvement réduit, aucune classe d’animation »), annotations manuscrites (`src/features/casefile`, `JournalEntry.handwritten`), sous-titres des sons (`src/app/AmbienceProvider.tsx`) ; neutralisation CSS sous `prefers-reduced-motion` et `html[data-reduced-motion="true"]` (`src/styles/motion.css`, testé dans `tokens.test.ts`).

[OK] Onboarding intégré, progressif et non bloquant.
Preuve : `src/domain/selectors/playerView.ts` (`selectOnboarding`, déclencheurs de données), `src/domain/selectors/playerView.test.ts` (« l’onboarding progresse sans bloquer »), `src/features/onboarding/OnboardingCallout.dom.test.tsx` (« Compris » / « Tout passer » / bulle non bloquante ; aide progressive après trois impasses, désactivable).

[OK] Retours d'erreur et états vides soignés.
Preuve : refus du moteur rendus comme remarques de l'outil (`VersionBoard.dom.test.tsx` « affiche l’erreur du moteur comme remarque de l’outil, sans fermer le formulaire », `ConfrontationDialog.dom.test.tsx` « Non recevable »), écran d'erreur de scénario (`App.dom.test.tsx` « écran d’erreur de scénario : diagnostic listé en développement, jamais présenté comme le jeu »), `ErrorBoundary` ; états vides du dossier, de l'inspecteur (« Placez une hypothèse pour que le moteur la vérifie. ») et de la fiche de zone.

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

[OK] Parcours essentiel réalisable au clavier.
Preuve : E2E `e2e/onboarding-first-claim.spec.ts` (onboarding et première hypothèse au clavier), `App.dom.test.tsx` (raccourcis), `MapPanel.dom.test.tsx` (« Entrée et Espace sélectionnent la zone focalisée ; les flèches déplacent le focus »), `RoundTableDialog.dom.test.tsx` (« la confirmation se fait aussi au clavier »), `TimelinePanel.dom.test.tsx` (PageUp/PageDown, range natif). Aucun glisser-déposer : toute opération a un bouton ou un formulaire.

[OK] Focus, noms accessibles et annonces utiles.
Preuve : `:focus-visible` renforcé (`src/styles/base.css`), noms accessibles sur zones, passages, jetons, marqueurs (`MapPanel.dom.test.tsx`, `TimelinePanel.dom.test.tsx`), région `aria-live` alimentée par `announce` (`App.dom.test.tsx` « la région aria-live reflète les annonces du store »), dialogues `role="dialog"` avec piège de focus (`src/components/ui/Dialog.tsx`).

[OK] Mobile 390 px véritablement recomposé.
Preuve : `src/styles/layout.css` (pile d'espaces + barre persistante à quatre onglets ≤ 1023 px, aucun zoom), `App.dom.test.tsx` (« en mobile (≤ 1023 px), la barre d’espaces change l’espace actif »), E2E projet `mobile` (`e2e/keyboard-mobile.spec.ts`, 390 × 844, vérifie l'absence de débordement horizontal).

[OK] Contraste, mouvement réduit, son non obligatoire.
Preuve : `src/styles/tokens.test.ts` (ratios ≥ 4,5), `src/styles/motion.css`, son opt-in uniquement par bouton (`src/app/AmbienceProvider.tsx`), sous-titres toujours publiés (`src/audio/ambience.test.ts` « playCue publie un sous-titre même désactivé »).

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
