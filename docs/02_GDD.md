# LA VERSION ACCEPTABLE

## Game Design Document — version 1.0

## 1. Promesse

**LA VERSION ACCEPTABLE** est un jeu d'enquête systémique court dans lequel le joueur ne choisit pas seulement ce qu'il croit : il construit une version des événements, puis observe si le monde humain et matériel peut la supporter.

Un écart de caisse de 300 € est découvert après la fermeture du magasin **La Veilleuse**. Six personnes étaient encore sur place. Pendant les vingt-trois minutes précédant sa découverte, une caméra s'est interrompue, une palette a obstrué un passage et plusieurs personnes ont menti — pas nécessairement pour la même raison.

Le joueur dispose des traces, des paroles et d'une maquette temporelle du lieu. Il doit proposer une chaîne d'événements cohérente. Chaque hypothèse modifie ce que les protagonistes auraient pu percevoir, ce qu'ils peuvent croire et ce qu'ils sont prêts à accepter publiquement.

La question centrale n'est pas seulement « qui a pris l'argent ? », mais :

> Quelle différence reste-t-il entre une vérité, une explication et une version sur laquelle tout le monde accepte de signer ?

## 2. Format et périmètre

- Jeu web solo, entièrement local.
- Session : 30 à 50 minutes.
- Un scénario complet.
- Six protagonistes.
- Fenêtre simulée : 20 h 49 à 21 h 15.
- Un plan de magasin compact, composé de zones et de connexions.
- Quatre familles de conclusion au minimum.
- Rejouabilité fondée sur les versions alternatives, pas sur du contenu aléatoire massif.

## 3. Piliers

### 3.1. Causalité lisible

Toute contradiction importante doit pouvoir être expliquée. Le jeu ne répond jamais seulement « incorrect » : il indique quelles propositions entrent en conflit et par quelle règle — temps, espace, perception, trace matérielle, connaissance ou intérêt.

### 3.2. Vérités humaines

Un mensonge ne prouve pas un vol. Une personne peut mentir pour protéger quelqu'un, cacher une faute sans rapport, préserver sa dignité ou répéter sincèrement une mauvaise déduction.

### 3.3. Manipulation concrète

Le joueur agit sur une frise, un plan et des cartes. Les panneaux ne sont pas de simples menus : déplacer une hypothèse dans le temps ou changer son lieu transforme le résultat de la simulation.

### 3.4. Ambiguïté maîtrisée

La vérité canonique existe et le moteur la connaît. Plusieurs versions peuvent néanmoins être physiquement possibles ou socialement acceptables. Le jeu distingue explicitement cohérence, vérité révélée et adhésion collective.

## 4. Boucle principale

1. **Observer** une trace ou une déclaration.
2. **Formuler** une hypothèse en choisissant acteur, action, lieu et intervalle parmi les possibilités débloquées.
3. **Rejouer** la période concernée sur la maquette.
4. **Lire** les perceptions possibles et les contradictions calculées.
5. **Confronter** un protagoniste avec une trace, une déclaration ou une contradiction.
6. **Obtenir** une réaction : clarification, résistance, nouvelle information, perte ou gain de confiance.
7. **Réviser** la version jusqu'à pouvoir demander une signature finale.

Le joueur doit pouvoir revenir sur ses choix sans recommencer la partie. Les confrontations consommées et les révélations obtenues restent acquises dans la sauvegarde, sauf retour explicite à une sauvegarde antérieure.

## 5. Les cinq couches d'information

Ces couches ne doivent jamais être fusionnées :

1. **Fait** : événement canonique réellement arrivé dans le scénario.
2. **Perception** : signal visuel ou sonore accessible à une personne à un instant donné.
3. **Croyance** : interprétation interne, possiblement fausse, dérivée des perceptions et informations reçues.
4. **Déclaration** : ce que la personne choisit de dire selon sa croyance, ses secrets, son stress et son objectif.
5. **Version proposée** : hypothèses assemblées par le joueur afin d'expliquer les traces.

Exemple abstrait : une porte claque réellement ; une personne entend un choc étouffé ; elle croit que la réserve a été ouverte ; elle déclare avoir « vu quelqu'un entrer » pour rendre son récit convaincant ; le joueur propose qu'une caisse soit tombée.

## 6. Ressources du joueur

### 6.1. Le dossier

Contient les éléments découverts :

- traces matérielles ;
- logs techniques ;
- déclarations ;
- fiches des protagonistes ;
- contradictions déjà expliquées ;
- concepts d'hypothèses débloqués.

Chaque élément indique sa provenance et son degré : **établi**, **rapporté**, **déduit** ou **proposé**. Ces degrés utilisent icône, libellé et texture, jamais la couleur seule.

### 6.2. Le canevas de version

La version finale est composée de cinq emplacements causaux :

- origine de l'écart comptable ;
- cause de l'interruption vidéo ;
- parcours du justificatif ;
- origine du bruit entendu ;
- intention ou niveau de connaissance de la responsable.

Chaque emplacement accepte plusieurs hypothèses du scénario. Certaines hypothèses demandent de préciser acteur, zone ou heure. Une version peut être incomplète, possible, incohérente ou signable.

### 6.3. La pression

La pression est une ressource de confrontation, de 0 à 6. Une confrontation forte en consomme ; une observation nouvelle ou la résolution d'une contradiction critique peut en rendre. Elle empêche de tester aveuglément toutes les combinaisons, sans rendre une partie irrécupérable.

Une confrontation invalide n'est jamais consommée. Le joueur peut toujours produire une conclusion minimale, même après de mauvaises décisions.

### 6.4. La confiance

Chaque protagoniste possède une confiance visible envers l'enquêteur, exprimée par un état textuel : fermé, prudent, disponible, engagé. Les valeurs numériques peuvent exister dans le moteur mais ne doivent pas devenir un tableau d'optimisation brut.

La confiance influence :

- les variantes de réaction ;
- la volonté de préciser une déclaration ;
- l'acceptation de la version finale ;
- certaines fins.

## 7. Simulation spatiale et temporelle

### 7.1. Plan

Le plan est un SVG interactif. Les zones sont reliées par des passages ayant :

- durée minimale de traversée ;
- état ouvert, fermé ou obstrué selon le temps ;
- transmission sonore ;
- visibilité éventuelle entre deux zones.

Les protagonistes sont affichés sous forme de jetons. La relecture peut être lancée, mise en pause et déplacée seconde par seconde ou par événements.

### 7.2. Perception visuelle

Une perception visuelle exige :

- présence simultanée ;
- ligne de vue autorisée par le graphe du plan ;
- absence d'occlusion active ;
- intensité suffisante ;
- attention compatible avec l'action du témoin.

Le moteur peut produire une perception partielle : silhouette, couleur, direction, objet sans identité.

### 7.3. Perception sonore

Un son possède une intensité et une signature. Il se propage à travers les connexions avec atténuation. Le témoin peut en connaître la direction sans connaître la source. Deux sources proches peuvent être confondues si leurs signatures partagent des tags.

### 7.4. Temps

Les événements utilisent des intervalles, pas seulement un ordre. Une même personne ne peut accomplir deux actions incompatibles qui se chevauchent. Tout déplacement doit tenir compte de la durée entre zones.

## 8. Confrontations

Une confrontation combine :

- un protagoniste ;
- une cible : déclaration, trace ou hypothèse ;
- facultativement une seconde pièce servant de contradiction ;
- une approche : neutre, empathique ou directe.

Le résultat est déterministe. Il dépend des connaissances du personnage, de ses secrets, de sa confiance, de la solidité de la contradiction et de l'approche.

Une bonne confrontation doit pouvoir :

- révéler une précision ;
- corriger une croyance sincère ;
- provoquer un aveu partiel ;
- exposer un mensonge sans révéler sa raison ;
- échouer de façon informative.

Les textes sont écrits à partir de variantes présentes dans les données. Aucun texte génératif distant n'est nécessaire.

## 9. Contradictions

Le moteur classe les contradictions :

- **physique** : position ou trajet impossible ;
- **temporelle** : chevauchement ou ordre impossible ;
- **sensorielle** : perception revendiquée inaccessible ;
- **matérielle** : incompatibilité avec une trace établie ;
- **épistémique** : une personne affirme savoir quelque chose qu'elle ne pouvait apprendre ;
- **discursive** : deux déclarations incompatibles ;
- **motivationnelle** : résistance sociale à une version, sans impossibilité factuelle.

Les six premières affectent la cohérence. La dernière affecte l'acceptabilité et doit être présentée différemment.

Chaque contradiction comporte :

- un titre court ;
- une sévérité ;
- les identifiants des éléments impliqués ;
- une explication en plusieurs étapes ;
- un ou plusieurs moyens possibles de l'examiner, sans donner automatiquement la solution.

## 10. Évaluation d'une version

Le jeu affiche trois axes séparés :

- **Cohérence** : la proposition respecte-t-elle les contraintes matérielles ?
- **Dévoilement** : quelle part des faits canoniques établis la proposition explique-t-elle ?
- **Adhésion** : combien de protagonistes sont prêts à signer cette formulation ?

Ne pas les réduire à une note globale permanente. Au moment de conclure, un sceau final peut résumer le type de version obtenu.

Un protagoniste signe si :

- aucune proposition ne contredit directement un fait qu'il tient pour certain ;
- la version ne franchit pas son seuil de coût personnel non compensé ;
- sa confiance et les confrontations permettent cette décision ;
- les règles particulières du scénario sont satisfaites.

## 11. Structure de partie

### Acte I — Les traces

Onboarding intégré : navigation dans le dossier, déplacement sur la frise, première relecture. Le joueur découvre l'écart de caisse, l'interruption vidéo et trois déclarations initiales.

### Acte II — Les versions

Le canevas se débloque. Le joueur place ses premières hypothèses, fait apparaître des contradictions et mène des confrontations.

### Acte III — Les signatures

Après deux révélations structurantes, le joueur peut demander une table ronde. Chaque personne réagit à la version, signe, refuse ou demande une modification. Le joueur peut repartir travailler tant qu'il n'a pas scellé le rapport.

### Épilogue

Une fois le rapport scellé, le jeu montre :

- les conséquences humaines ;
- les zones de vérité révélées ou laissées dans l'ombre ;
- la différence entre faits canoniques et version signée ;
- les autres familles de fin, uniquement sous forme d'indices non spoilants.

## 12. Interface

### 12.1. Bureau principal — grand écran

- **Bandeau supérieur** : titre, heure simulée, pression, sauvegarde et options.
- **Colonne gauche** : dossier filtrable.
- **Centre haut** : plan interactif.
- **Centre bas** : frise et commandes de relecture.
- **Colonne droite** : canevas de version ou inspecteur de contradiction selon le contexte.

Les panneaux sont redimensionnables dans une limite raisonnable. Un mode focus permet d'agrandir le plan, la frise ou le dossier.

### 12.2. Tablette et mobile

À 768 px et moins, l'interface devient une pile de quatre espaces accessibles par une barre persistante : Plan, Temps, Dossier, Version. La sélection active reste partagée. Aucun glisser-déposer n'est obligatoire : toute opération possède une alternative par boutons ou menus.

### 12.3. Retours d'action

- Une hypothèse nouvellement placée déclenche une propagation visuelle brève vers ses conséquences.
- Une contradiction fait vibrer ou se fissurer le fil causal concerné, sauf mouvement réduit.
- Une révélation importante laisse une annotation manuscrite dans le dossier.
- Les erreurs techniques ne sont jamais présentées comme des réponses du jeu.

## 13. Direction artistique

Le jeu évoque un dossier nocturne fabriqué avec les outils du magasin : papier thermique, surligneur, ruban de caisse, plan de sécurité, annotations au feutre.

### Palette

- Nuit encre : `#11151C`
- Papier froid : `#E8E3D7`
- Néon sauge : `#A8C7A0`
- Ambre ticket : `#E3A857`
- Corail alerte : `#D66B5D`
- Bleu caméra : `#6D8FA8`

Le contraste doit respecter WCAG AA. Les états critiques utilisent forme, mot et motif en plus de la couleur.

### Typographie

- Interface : sans-serif lisible et légèrement étroite.
- Pièces et tickets : monospace.
- Annotations : style manuscrit utilisé avec parcimonie et jamais pour un long texte.

Aucune image externe n'est requise. Les portraits peuvent être des collages SVG abstraits et expressifs, générés localement à partir de formes simples.

## 14. Son

Le jeu doit fonctionner sans son. Une ambiance discrète peut être synthétisée avec Web Audio après interaction explicite : ronronnement de frigo, néon, caisse et rideau. Les indices sonores importants possèdent toujours un équivalent visuel et textuel.

## 15. Accessibilité

- Navigation complète au clavier.
- Focus visible.
- Labels accessibles pour le plan et la frise.
- Alternative aux gestes de glisser-déposer.
- Mode mouvement réduit.
- Réglage de taille de texte.
- Sous-titres descriptifs pour les sons simulés.
- Pas de limite de temps réelle.
- Possibilité d'afficher une aide progressive après plusieurs impasses, désactivable.

## 16. Sauvegarde et reprise

- Sauvegarde automatique locale après toute action structurante.
- Trois emplacements manuels.
- Export JSON et import avec validation de schéma et migration de version.
- Nouvelle partie protégée par confirmation si une progression non exportée existe.
- Un journal d'actions interne permet de reproduire l'état depuis la graine et les décisions.

## 17. Hors périmètre

- Multijoueur.
- Backend ou compte utilisateur.
- Génération procédurale de nouveaux scénarios.
- Éditeur public de scénario.
- Modèles 3D.
- Synthèse vocale.
- Appel à une IA pour produire les dialogues.
- Monde ouvert ou déplacement libre d'un avatar.

## 18. Critère de réussite créative

Le joueur doit connaître au moins une fois l'expérience suivante : formuler une explication qui paraît évidente, la voir se briser pour une raison spatiale ou épistémique compréhensible, puis découvrir qu'un mensonge apparent protégeait une vérité différente de celle qu'il cherchait.
