# LA VERSION ACCEPTABLE — Spécification technique

## 1. Stack imposée

- Vite
- React
- TypeScript en mode `strict`
- CSS moderne avec variables de design ; CSS Modules ou feuilles structurées, sans kit d'interface générique
- Zod pour valider les données externes et les sauvegardes
- Zustand autorisé pour l'état d'interface et de partie, mais jamais comme emplacement de la logique métier
- Vitest pour les tests unitaires et d'intégration
- Testing Library pour les comportements React
- Playwright pour les parcours end-to-end
- ESLint et Prettier

Versions stables compatibles entre elles. Aucun backend. Build statique.

## 2. Architecture cible

```text
src/
  app/                 # composition React, navigation, error boundaries
  domain/
    model/             # types et schémas métier
    engine/            # simulation pure et règles
    contradictions/    # détecteurs et explications
    dialogue/          # résolution déterministe des confrontations
    endings/           # signatures et conclusions
    replay/            # journal d'actions et réduction déterministe
  scenario/
    schema.ts
    loader.ts
    la-veilleuse.json
  state/               # adaptation moteur <-> interface, persistance
  components/
  features/
    map/
    timeline/
    casefile/
    version-board/
    confrontation/
    conclusion/
  accessibility/
  persistence/
  styles/
  test/
```

Les noms peuvent légèrement varier, mais les frontières doivent rester visibles. `domain/` ne doit importer ni React, ni DOM, ni Zustand, ni API de stockage.

## 3. Modèle minimal

Les types suivants expriment les contrats conceptuels. Ils peuvent être raffinés, mais pas aplatis en chaînes non typées.

```ts
type Id<T extends string> = string & { readonly __brand: T };
type Second = number & { readonly __brand: 'Second' };

interface Interval {
  start: Second;
  end: Second;
}

interface CanonicalFact {
  id: Id<'fact'>;
  interval: Interval;
  zoneId: Id<'zone'> | null;
  participants: Id<'character'>[];
  secrecy: 'public' | 'discoverable' | 'canonical-only';
  tags: string[];
}

interface Perception {
  id: Id<'perception'>;
  observerId: Id<'character'>;
  sourceFactId: Id<'fact'>;
  modality: 'visual' | 'audio' | 'reported';
  fidelity: 'exact' | 'partial' | 'ambiguous';
  perceivedTags: string[];
}

interface Belief {
  id: Id<'belief'>;
  characterId: Id<'character'>;
  propositionId: Id<'proposition'>;
  confidence: number;
  provenanceIds: string[];
}

interface Statement {
  id: Id<'statement'>;
  speakerId: Id<'character'>;
  propositionId: Id<'proposition'>;
  relationToBelief: 'honest' | 'embellished' | 'omission' | 'lie';
  unlockConditionIds: string[];
}

interface PlayerClaim {
  slotId: Id<'claim-slot'>;
  hypothesisId: Id<'hypothesis'>;
  actorId?: Id<'character'>;
  zoneId?: Id<'zone'>;
  interval?: Interval;
}
```

## 4. État et réduction

L'état de partie doit être dérivable de :

```ts
interface ReplayEnvelope {
  schemaVersion: number;
  scenarioId: string;
  scenarioVersion: number;
  seed: string;
  actions: PlayerAction[];
}
```

Le réducteur principal suit la forme :

```ts
reduceGame(initial: InitialGameState, actions: readonly PlayerAction[]): GameState
```

Contraintes :

- aucune lecture de l'heure système dans le domaine ;
- aucun `Math.random()` direct ;
- les identifiants produits dérivent de la graine et de l'index d'action ;
- une action refusée retourne une erreur typée sans modifier l'état ;
- importer puis réexporter une sauvegarde préserve la sémantique et l'ordre des actions ;
- les états dérivés lourds peuvent être mémorisés, mais le cache ne fait pas partie de la vérité sauvegardée.

## 5. Scénario et validation

`04_SCENARIO_CONFIDENTIEL.json` doit devenir la source de données du scénario, éventuellement après transformation mécanique de chemin ou de format. Les secrets ne doivent pas être dupliqués dans les composants.

Au chargement de développement et dans les tests, Zod doit vérifier :

- unicité de tous les identifiants dans leur namespace ;
- validité des références ;
- intervalles bornés à la fenêtre du scénario ;
- connexions de zones cohérentes ;
- états de personnages définis ;
- au moins une sortie de jeu atteignable ;
- absence de texte joueur provenant d'un champ `canonical-only` avant sa révélation ;
- claims et options compatibles avec leurs slots ;
- actions de confrontation référant à des pièces existantes.

Une erreur de scénario produit un écran de diagnostic en développement et un écran d'échec sobre en production, jamais une partie partiellement cassée.

## 6. Graphe spatial

Le magasin est un graphe pondéré et temporel.

```ts
interface Passage {
  from: ZoneId;
  to: ZoneId;
  travelSeconds: number;
  openWhen: ConditionExpr;
  soundLoss: number;
  sight: 'none' | 'partial' | 'clear';
}
```

Le moteur doit fournir au minimum :

- `shortestTravelTime(from, to, atTime, worldState)` ;
- `canOccupy(character, zone, interval, version)` ;
- `canSee(observer, targetFact, atTime, version)` ;
- `hearSignal(observer, soundFact, version)` avec intensité et ambiguïté ;
- `traceRoute(character, from, to, departure, version)`.

Les chemins doivent tenir compte des passages obstrués à l'instant considéré. Une simple matrice fixe n'est pas suffisante.

## 7. Monde canonique et monde proposé

Le scénario canonique ne doit jamais être muté par le joueur. Le moteur construit un `ProposedWorld` en appliquant les hypothèses aux emplacements explicitement remplaçables.

Le calcul suit ce pipeline :

```text
Scenario canonique
  -> éléments établis et éléments variables
  -> claims du joueur
  -> monde proposé
  -> simulation positions/signaux
  -> perceptions possibles
  -> compatibilité avec preuves et déclarations
  -> contradictions expliquées
  -> réactions et signatures
```

Une claim absente donne un monde incomplet, pas un monde faux. Les détecteurs doivent différencier `unknown`, `unsupported`, `contradicted` et `impossible`.

## 8. Moteur de contradiction

Interface attendue :

```ts
interface Contradiction {
  id: string;
  kind: 'physical' | 'temporal' | 'sensory' | 'material' | 'epistemic' | 'discursive' | 'motivational';
  severity: 'notice' | 'major' | 'critical';
  involvedIds: string[];
  explanation: ExplanationStep[];
  inspectableAt?: Second;
  suggestedEvidenceIds: string[];
}

interface ContradictionDetector {
  id: string;
  detect(context: EvaluationContext): Contradiction[];
}
```

Exigences :

- détecteurs composables et testables isolément ;
- identifiants stables afin qu'une même contradiction ne clignote pas comme nouvelle à chaque rendu ;
- déduplication fondée sur type + éléments + règle ;
- explication générée depuis des gabarits structurés, pas depuis une phrase opaque ;
- aucune information canonique secrète dans une explication avant déblocage ;
- une contradiction motivationnelle ne doit pas faire baisser la cohérence physique.

## 9. Connaissance et dialogue

Les connaissances initiales d'un personnage sont explicites. Les nouvelles connaissances proviennent seulement :

- d'une perception simulée ;
- d'une information publique ;
- d'une confrontation résolue ;
- d'une règle de partage déclarée par le scénario.

Le dialogue utilise des `responseVariants` conditionnelles et déterministes. Sélectionner une approche change confiance, pression, informations révélées ou formulation, selon les règles de données.

Il est interdit de choisir une réponse avec `Math.random()` ou de révéler automatiquement tous les secrets quand la confiance dépasse un seuil.

## 10. Évaluation et signatures

Le moteur expose séparément :

```ts
interface VersionEvaluation {
  completeness: number;
  coherence: { status: string; blocking: Contradiction[]; notices: Contradiction[] };
  disclosure: { establishedExplained: number; canonicalAlignment: number | null };
  adhesion: SignatureDecision[];
  reachableEndingIds: string[];
}
```

`canonicalAlignment` reste `null` ou caché dans l'interface avant l'épilogue. Il ne doit pas servir de détecteur de chaud/froid pendant la partie.

Chaque décision de signature contient des raisons publiques et, si nécessaire, des raisons internes uniquement accessibles au moteur.

## 11. Interface et synchronisation

Un seul curseur temporel fait autorité pour le plan, la frise et l'inspecteur. Sélectionner un événement sur la frise :

- déplace le curseur ;
- met en évidence les zones et personnes concernées ;
- ouvre sa fiche accessible ;
- ne modifie pas la version proposée.

Ajouter ou éditer une claim :

- produit une action journalisée ;
- réévalue le monde ;
- annonce les changements importants via une région `aria-live` concise ;
- conserve la sélection si elle reste valide.

Le glisser-déposer est un raccourci. Tous ses résultats doivent être réalisables au clavier via « Ajouter à la version », choix du slot et formulaire typé.

## 12. Persistance

Utiliser un adaptateur de stockage séparé. `localStorage` est acceptable si la taille reste bornée ; IndexedDB est autorisé. Les tests utilisent un adaptateur mémoire.

Format exporté :

- type MIME JSON ;
- nom incluant scénario et date locale ;
- schéma validé à l'import ;
- migration explicite au moins de version 1 vers version courante, même si la version courante est 1 via un test de fixture future ;
- refus non destructif d'un scénario inconnu ou d'une version plus récente.

## 13. Sécurité narrative

Les informations `canonical-only` peuvent se trouver dans le bundle statique, mais :

- ne doivent pas être copiées dans l'état UI initial ;
- ne doivent pas être rendues dans le DOM caché ;
- ne doivent pas apparaître dans `aria-label`, logs ou messages d'erreur destinés au joueur ;
- les outils de debug narratif doivent être exclus ou désactivés dans le build de production ;
- l'épilogue accède aux faits par un sélecteur dédié après verrouillage de la conclusion.

## 14. Performance

Cibles sur machine de développement normale :

- interaction UI visible en moins de 100 ms hors animation ;
- évaluation complète du scénario médiane sous 20 ms dans un benchmark Vitest de 1 000 évaluations ;
- pas de recalcul du moteur à chaque mouvement du curseur si les claims n'ont pas changé ;
- aucune fuite de listeners lors des relectures répétées ;
- build initial raisonnable et pas de dépendance de visualisation disproportionnée.

La cible de 20 ms est indicative : si elle n'est pas atteinte dans l'environnement, documenter mesure, cause et optimisation, sans falsifier le résultat.

## 15. Tests minimum

### Unitaires

- graphe temporel et chemins obstrués ;
- visibilité claire, partielle et bloquée ;
- propagation et confusion sonore ;
- conflits d'intervalles ;
- provenance des croyances ;
- six familles de contradiction factuelle/sociale ;
- déterminisme et replay ;
- décision de signature ;
- validation et migration des sauvegardes.

### Intégration

- chargement complet du scénario ;
- claim -> simulation -> contradiction -> explication ;
- confrontation -> révélation -> nouvelle option ;
- conclusion refusée puis corrigée ;
- export/import avec état équivalent.

### End-to-end

- onboarding et première hypothèse ;
- résolution physique cohérente jusqu'à une fin ;
- autre parcours vers une fin distincte ;
- sauvegarde/rechargement ;
- parcours clavier essentiel ;
- viewport mobile.

## 16. Qualité d'implémentation interdite

Échecs explicites :

- scores calculés uniquement par nombre de cartes choisies ;
- contradictions listées dans un tableau `if hypothesisId === ...` côté UI ;
- personnages omniscients ;
- timeline sans impact sur la simulation ;
- « rejouer » qui ne fait qu'animer des positions prédéfinies sans évaluer les claims ;
- une seule combinaison menant à la fin ;
- tests qui vérifient seulement que des composants se rendent ;
- secrets rendus avec `display: none` ;
- interface mobile réduite par simple zoom.

