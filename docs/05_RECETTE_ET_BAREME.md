# LA VERSION ACCEPTABLE — Recette et barème

## 1. Mode d'évaluation

Noter le projet sur 100. Une fonctionnalité compte seulement si elle est visible dans le produit ou prouvée par un test pertinent. Un document affirmant qu'elle existe ne constitue pas une preuve.

### Verdicts

- **90–100 — Exceptionnel** : Fable a livré un petit jeu systémique crédible et fini.
- **75–89 — Solide** : le jeu fonctionne réellement, avec quelques simplifications ou défauts.
- **60–74 — Impressionnant mais fragile** : bonne démonstration, architecture ou expérience incomplète.
- **40–59 — Prototype** : plusieurs panneaux existent, mais le système central est partiellement simulé.
- **0–39 — Façade** : maquette, logique codée en dur, projet cassé ou non terminable.

## 2. Barème

### A. Moteur causal — 25 points

- 5 : séparation vérifiable entre faits, perceptions, croyances, déclarations et claims.
- 4 : simulation déterministe depuis graine + journal d'actions.
- 4 : graphe spatial pondéré et temporel réellement utilisé.
- 4 : visibilité et audition calculées, y compris occlusion et ambiguïté.
- 4 : claims produisant un monde proposé sans muter le canon.
- 4 : moteur indépendant de React et du stockage.

### B. Contradictions et explicabilité — 15 points

- 3 : détecteurs composables couvrant les sept catégories.
- 3 : identifiants stables et déduplication.
- 4 : explications structurées en étapes et reliées aux éléments.
- 3 : distinction inconnue/non étayée/contredite/impossible.
- 2 : aucun spoiler dans les explications avant révélation.

### C. Game design et scénario — 15 points

- 4 : boucle observer–formuler–rejouer–confronter–réviser réellement jouable.
- 3 : au moins quatre conclusions de familles différentes atteignables.
- 3 : les mensonges ont des motifs distincts et ne valent pas automatiquement culpabilité.
- 3 : pression et confiance créent des décisions sans soft-lock injuste.
- 2 : épilogue comparant clairement version signée et vérité révélée.

### D. UX et direction artistique — 15 points

- 4 : plan, frise, dossier et version forment un espace de travail compréhensible.
- 3 : identité visuelle spécifique, cohérente avec le dossier nocturne et sans kit générique évident.
- 3 : micro-interactions informatives et mode mouvement réduit.
- 3 : onboarding intégré, progressif et non bloquant.
- 2 : retours d'erreur et états vides soignés.

### E. Robustesse technique — 15 points

- 3 : TypeScript strict sans contournement massif par `any`.
- 3 : données et sauvegardes validées par schéma.
- 3 : persistance, trois emplacements et export/import fonctionnels.
- 3 : erreurs bornées et absence de corruption après action refusée.
- 3 : build statique reproductible, aucune dépendance distante à l'exécution.

### F. Tests et preuves — 10 points

- 4 : tests unitaires substantiels du domaine.
- 2 : tests d'intégration de chaînes complètes.
- 2 : deux parcours end-to-end menant à des fins distinctes.
- 1 : test de replay/import équivalent.
- 1 : mesure de performance honnête.

### G. Accessibilité et responsive — 5 points

- 2 : parcours essentiel réalisable au clavier.
- 1 : focus, noms accessibles et annonces utiles.
- 1 : mobile 390 px véritablement recomposé.
- 1 : contraste, mouvement réduit, son non obligatoire.

## 3. Plafonds et pénalités

Les plafonds s'appliquent après calcul du score.

- Projet impossible à lancer selon le README : **maximum 20**.
- Impossible d'atteindre une fin sans modifier le code : **maximum 35**.
- Timeline ou plan sans effet moteur : **maximum 45**.
- Contradictions principalement codées par identifiants d'hypothèse dans l'UI : **maximum 50**.
- Personnages lisant directement tous les faits canoniques : **maximum 55**.
- Une seule fin réellement atteignable : **maximum 60**.
- Secrets présents dans le DOM avant révélation : **−10**.
- Tests désactivés, snapshots vides ou assertions triviales présentés comme preuves : **−10**.
- `TODO`, bouton factice ou donnée principale simulée dans le parcours critique : **−5 chacun**, jusqu'à −20.
- Régression clavier rendant une action critique impossible : **−5**.
- Une affirmation mensongère dans `EVALUATION.md` : **−5 par affirmation**, jusqu'à −20.

## 4. Invariants automatisables

Ces invariants doivent disposer de tests directs.

1. Deux replays identiques sont profondément égaux.
2. Une action refusée ne modifie pas le hash sémantique de l'état.
3. Aucun personnage ne possède une connaissance sans provenance.
4. Une personne ne peut occuper deux zones incompatibles au même instant.
5. Un trajet proposé ne peut être plus court que le plus court chemin ouvert.
6. Une obstruction active modifie au moins un chemin ou une ligne de vue.
7. Une perception auditive diminue avec la perte acoustique cumulée.
8. Une déclaration mensongère ne remplace pas la croyance du personnage.
9. Une contradiction motivationnelle ne bloque pas la cohérence matérielle.
10. Retirer une claim supprime les contradictions qui dépendent uniquement d'elle.
11. Une information `canonical-only` non révélée ne traverse aucun sélecteur destiné à l'UI.
12. Importer une sauvegarde invalide laisse la sauvegarde courante intacte.
13. Une conclusion verrouillée ne peut plus être modifiée sans lancer une nouvelle partie ou restaurer une sauvegarde.
14. La vérité canonique du scénario atteint la fin `ending_transparent` lorsque les confrontations nécessaires sont résolues.
15. Le parcours `ending_protective` ne révèle pas automatiquement l'emplacement réel du justificatif.

## 5. Parcours manuels obligatoires

### Parcours 1 — Première contradiction

1. Démarrer une partie.
2. Terminer l'onboarding sans souris.
3. Choisir une hypothèse de coupure volontaire.
4. Désigner un acteur dont la position rend l'action impossible.
5. Vérifier que la contradiction explique le trajet ou le chevauchement fautif.
6. Corriger l'heure ou l'acteur et constater la disparition ou transformation de la contradiction.

### Parcours 2 — Une perception n'est pas un fait

1. Examiner la déclaration de Noé.
2. Rejouer la période du bruit.
3. Débloquer l'information sur la palette.
4. Confronter Noé.
5. Vérifier que sa déclaration est reformulée sans que sa perception initiale soit effacée.

### Parcours 3 — Persistance

1. Créer trois claims et mener une confrontation.
2. Sauvegarder manuellement.
3. Recharger la page.
4. Vérifier claims, pression, confiance, révélations et curseur utile.
5. Exporter, démarrer une nouvelle partie, importer et retrouver un état sémantiquement équivalent.

### Parcours 4 — Deux fins

1. Obtenir une conclusion factuellement transparente.
2. Recommencer ou restaurer une sauvegarde antérieure.
3. Produire une version socialement protectrice qui conserve une omission.
4. Vérifier que titres, signataires, conséquences et comparaison finale diffèrent.

### Parcours 5 — Mobile

À 390 × 844 : sélectionner une preuve, déplacer le temps, ajouter une hypothèse, lire une contradiction, mener une confrontation et sauvegarder sans chevauchement ni contrôle inaccessible.

## 6. Questions d'audit

- Si l'on modifie le temps d'une claim de trente secondes, quels calculs changent réellement ?
- Une déclaration fausse peut-elle rester cohérente avec la croyance interne du personnage ?
- Le moteur saurait-il détecter la même famille d'impossibilité sur un second scénario sans nouveau `if` métier ?
- Une hypothèse physiquement cohérente mais socialement coûteuse est-elle représentée sans être déclarée fausse ?
- Peut-on prouver qu'un secret non révélé ne s'affiche pas accidentellement ?
- Les explications disent-elles pourquoi, ou reformulent-elles seulement l'étiquette « contradiction » ?

## 7. Format conseillé pour EVALUATION.md

Pour chaque ligne du barème :

```text
[OK | PARTIEL | ÉCHEC] Critère
Preuve : commande de test, fichier/fonction, ou procédure manuelle exacte.
Limite connue : uniquement si nécessaire.
```

Terminer par le score honnêtement revendiqué, les plafonds éventuels et les trois risques principaux qui subsistent.
