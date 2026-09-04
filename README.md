# LA VERSION ACCEPTABLE

Jeu d'enquête systémique court, entièrement local, en français. Un écart de caisse de 300 € est découvert après la fermeture du magasin **La Veilleuse**. Le joueur assemble une _version_ des événements sur un canevas à cinq emplacements, la rejoue sur un plan et une frise, lit les contradictions calculées par le moteur, confronte les six protagonistes, puis demande une table ronde et scelle un rapport. Plusieurs fins sont distinguées par les données : vérité, consensus, accusation, classement, rejet.

Aucun backend, aucun compte, aucune API distante, aucun appel à un LLM, aucune télémétrie.

## Installation et commandes

Prérequis : Node.js ≥ 20.19 (testé avec Node 22) et npm.

```bash
npm ci
```

| Commande                                  | Effet                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                             | serveur de développement Vite (http://localhost:5173)                                                                                                                                                                                                                                                                             |
| `npm run build`                           | vérification TypeScript puis build statique dans `dist/`                                                                                                                                                                                                                                                                          |
| `npm run preview`                         | sert `dist/` sur http://localhost:4173                                                                                                                                                                                                                                                                                            |
| `npm run typecheck`                       | `tsc -b --noEmit`                                                                                                                                                                                                                                                                                                                 |
| `npm run lint`                            | ESLint (config plate, règles typées, a11y, frontières du domaine)                                                                                                                                                                                                                                                                 |
| `npm run format:check` / `npm run format` | Prettier                                                                                                                                                                                                                                                                                                                          |
| `npm test`                                | tests unitaires et d'intégration (Vitest, dont le benchmark d'évaluation)                                                                                                                                                                                                                                                         |
| `npm run test:coverage`                   | idem avec couverture V8 du domaine, du scénario, de la persistance et de l'état                                                                                                                                                                                                                                                   |
| `npm run test:e2e`                        | parcours Playwright : projet `desktop` (1440 × 900 : onboarding et première contradiction, perception de Noé, trois fins, persistance, secrets, raccourcis) projets `mobile` (390 × 844) et `tablet` (768 × 1024) : pièce, temps, hypothèse, contradiction, confrontation, sauvegarde — construit et sert `dist/` automatiquement |
| `npm run validate:scenario`               | valide le scénario embarqué et affiche les avertissements                                                                                                                                                                                                                                                                         |
| `npm run walkthroughs`                    | rejoue quatre parcours complets depuis la graine et affiche contradictions, adhésion et fin atteinte                                                                                                                                                                                                                              |
| `npm run check`                           | typecheck + lint + tests + build                                                                                                                                                                                                                                                                                                  |

Première exécution des tests end-to-end : `npx playwright install chromium`.

Le fichier `.npmrc` active `legacy-peer-deps` : sans lui, npm 9/10 échoue sur un bug d'arborist provoqué par les pairs optionnels de Vitest (voir DECISIONS.md, § Technique).

## Déploiement statique

`npm run build` produit un site statique dans `dist/` (`base: './'`, donc servable depuis n'importe quel sous-dossier). Le workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) construit et déploie `dist/` sur GitHub Pages à chaque push sur `main` (après typecheck, lint et tests) ; il suffit d'activer une fois « Settings → Pages → Source : GitHub Actions ». Le jeu est alors jouable sur téléphone à l'adresse du dépôt Pages, sans installation. Copiez `dist/` sur n'importe quel hébergement de fichiers (GitHub Pages, Netlify, un serveur nginx, un dossier partagé) ; aucune variable d'environnement ni configuration serveur n'est requise. La sauvegarde utilise `localStorage` du navigateur ; l'export/import JSON permet de transporter une partie.

## Comment jouer

- **Dossier** (colonne gauche) : pièces, déclarations, personnes, faits, hypothèses, contradictions, journal. Chaque élément porte son degré — _établi_, _rapporté_, _déduit_, _proposé_ — par icône, libellé et texture.
- **Plan** : les zones du magasin, les passages (durées, visibilité, obstruction), les jetons des personnes à l'instant du curseur (plein = établi par la caméra, pointillé = rapporté, losange = proposé). Les personnes hors champ sont listées à part.
- **Frise** : le curseur temporel unique (20:49 → 21:15), les pistes par personne, les pièces et faits, les intervalles de la version, la coupure vidéo. Lecture, pause, pas de 1 s / 10 s, saut d'événement.
- **Version** : cinq emplacements à remplir avec des hypothèses paramétrables (acteur, lieu, intervalle). Trois axes séparés : cohérence, dévoilement, adhésion. L'onglet **Contradictions** explique chaque conflit étape par étape et propose quoi examiner.
- **Confronter** (depuis la fiche d'une personne ou d'une déclaration) : un protagoniste, une cible (sa déclaration), une pièce d'appui facultative, une approche (neutre, empathique, directe). Le résultat est déterministe ; une confrontation non recevable ne coûte jamais de pression. « Sonder » présente une hypothèse à quelqu'un sans rien consommer.
- **Sauvegardes** : sauvegarde automatique après chaque action, trois emplacements manuels, export JSON et import (validation de schéma, migration, refus non destructif). Sur mobile, ces commandes sont sous « Menu ».
- **Table ronde** puis **Sceller** : chacun signe, refuse ou demande une modification ; le rapport scellé ouvre l'épilogue qui compare version signée et faits.

Raccourcis : `1`–`4` espaces, `Espace` lecture/pause, `←`/`→` curseur (±1 s, `Maj` ±10 s), `Début`/`Fin`, `?` aide, `Échap` fermer.


## Sur téléphone et tablette étroite (≤ 1023 px)

Sous 1024 px, le jeu bascule sur une coquille mobile dédiée (`src/app/mobile/`) qui partage le même store, les mêmes actions et les mêmes sélecteurs que le bureau : rien n'est dupliqué, seule la présentation change.

- **En-tête compact** : acte, horloge simulée (toucher → espace Temps), pression, bouton Menu (sauvegardes, options, aide, son, nouvelle partie) en feuille de fond.
- **Navigation au pouce** : quatre onglets persistants — Plan, Temps, Dossier, Version — avec compteurs (éléments au dossier, contradictions bloquantes). Touches `1`–`4` au clavier.
- **Plan** : pincer pour zoomer, glisser pour déplacer, double-toucher pour zoomer ×2 ; boutons « Zoom avant / arrière / Recadrer » et touches `+` `−` `0` pour la même chose. Toucher une zone ou un jeton ouvre sa fiche en feuille de fond sans quitter le plan ; la légende est une feuille. Un **bandeau temporel** reste sous le plan : −10 s, −1 s, curseur, +1 s, +10 s, lecture.
- **Temps** : heure en grand, lecture/pause, vitesse, zoom ; rangée du pouce (−10 / −1 / +1 / +10, appui long pour répéter), événement précédent/suivant, « Aller à la coupure », « Aller au comptage » ; la frise défile horizontalement.
- **Dossier** : filtres en rangée défilante, recherche dépliable, prémisse repliée, épinglage des éléments, groupes repliables ; une fiche ouverte remplace la liste avec « Retour à la liste » et une barre d'actions collée en bas (Confronter, Ajouter à la version, Utiliser comme appui…).
- **Version** : segments Version | Contradictions ; cartes d'emplacement compactes ; axes et pièces jointes repliables ; table ronde en barre collée en bas ; une contradiction s'ouvre en détail plein écran avec son raisonnement numéroté et des boutons « Voir » qui replacent le curseur sur le plan.
- **Guide** : les repères d'onboarding s'affichent dans une bande ancrée au-dessus de la navigation (jamais sur leur cible), avec « Y aller », « Compris », « Tout passer » ; ils restent consultables dans l'Aide.
- Les feuilles verrouillent le défilement d'arrière-plan, se ferment par bouton visible et Échap, respectent les `safe-area-inset-*` ; aucune opération n'exige un glisser-déposer ni un survol.

Formats vérifiés par Playwright : 390 × 844 (référence), 320 × 568, 844 × 390 (paysage), 768 × 1024 (tablette), plus le bureau à 1440 × 900.

## Architecture

```
src/
  domain/                pur TypeScript, sans React, DOM, Zustand ni stockage (règle ESLint)
    model/               types de marque, couches fait / perception / croyance / déclaration / claim
    engine/              graphe spatial temporel, positions (caméra, rapporté, proposé), contexte, évaluation
    contradictions/      détecteurs composables (physique, temporel, sensoriel, matériel, épistémique, discursif), gabarits d'explication, déduplication
    knowledge/           connaissance des personnages, provenance, chemins de connaissance
    dialogue/            résolution déterministe des confrontations et des sondages
    endings/             décisions de signature (raisons publiques / internes), fins
    replay/              réducteur `reduceGame(initial, actions)`, hachage déterministe
    selectors/           vue joueur (filtre les secrets), épilogue
  scenario/              JSON canonique (copie de 04_SCENARIO_CONFIDENTIEL.json), extension structurelle, schémas Zod, validation croisée
  state/                 store Zustand : adaptation moteur ↔ interface, sauvegarde automatique, état d'interface
  persistence/           adaptateur de stockage, format de sauvegarde versionné, migration v1→v2, export/import
  features/              plan, frise, dossier, canevas + inspecteur, confrontation, conclusion, onboarding, options
  app/                   composition, bureau, bandeau, barre mobile, erreurs
  components/            portraits SVG génératifs, dialogue accessible, badges
  audio/                 ambiance Web Audio synthétisée (opt-in) et sous-titres
  styles/                jetons de design, base, degrés/statuts, mouvement, layout
  test/                  aides de test, intégration
e2e/                     parcours Playwright
```

### Pipeline d'évaluation

```
Scénario canonique → éléments établis (caméra, pièces, faits révélés) + variables (slots)
  → claims du joueur → monde proposé (positions établies / rapportées / proposées, obstructions connues)
  → simulation (trajets dépendants du temps, lignes de vue, propagation sonore)
  → détecteurs → contradictions expliquées (identifiants stables, déduplication)
  → signatures (raisons publiques et internes) → fins atteignables
```

L'état de partie est intégralement dérivable de `{ seed, actions }` : deux replays identiques sont profondément égaux, une action refusée ne modifie pas l'état, les identifiants du journal dérivent de la graine et de l'index d'action. L'évaluation est mémoïsée sur un hash sémantique des parties pertinentes de l'état ; déplacer le curseur ne recalcule rien.

### Cinq couches jamais fusionnées

| Couche                  | Où                                                   | Qui la voit                                                                       |
| ----------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Fait canonique          | `canonicalFacts`                                     | le moteur ; le joueur seulement une fois révélé (pièce) ou rapporté (déclaration) |
| Perception              | `perceptions` + calculs `canSee` / `hearSignal`      | le moteur ; le joueur quand le personnage la révèle                               |
| Croyance / connaissance | `characters[].knowledge` avec provenance             | le moteur (signatures, sondages)                                                  |
| Déclaration             | `statements` (honnête, embellie, omission, mensonge) | le joueur, avec statut debout / rétractée                                         |
| Version proposée        | `claims`                                             | le joueur ; évaluée par le moteur                                                 |

## Choix notables

Voir [DECISIONS.md](DECISIONS.md) pour la liste complète. Les plus structurants : les positions ne sont _établies_ que par la caméra des zones centrales et les pièces ; la palette n'affecte le monde proposé qu'une fois connue ; une personne qui sait la version fausse mais à qui la vérité coûterait quelque chose signe en silence ; les contradictions matérielles portent sur les pièces _jointes_ au rapport, une pièce retirée devenant une omission visible.

## Vérification

[EVALUATION.md](EVALUATION.md) reprend chaque critère de la recette avec sa preuve locale (test, fichier ou procédure).
