# Devgame — conception du jeu

Ce document est la spécification consolidée du jeu. Le moteur
(`src/game/core/`) l'implémente : une règle du code qui contredit ce document
est un bug, dans l'un ou dans l'autre.

Il remplace le document de conception initial. Les points où les deux divergent
sont listés à la fin, dans [Écarts avec le document
initial](#écarts-avec-le-document-initial).

> **Aucun chiffre d'équilibrage ici.** Tous les coûts, pourcentages, seuils et
> vitesses vivent dans `src/game/core/balance.ts`, et nulle part ailleurs. C'est
> ce fichier qui fait foi : le dupliquer ici garantirait qu'une des deux copies
> soit fausse au bout d'une semaine. Ce document décrit les mécaniques et les
> ordres de grandeur ; `balance.ts` décrit les valeurs.

## Concept

Roguelike RPG dans le navigateur où le donjon est un **graphe Git**. Le joueur
est un développeur qui avance commit par commit sur un projet qui ne se termine
jamais. Chaque nœud du graphe est un commit à réaliser, et chaque commit est un
choix de style de jeu : lent et sûr, ou rapide et risqué.

Le dépôt n'est pas à vous. Un à quatre bots rivaux travaillent sur la même
branche `main`, et le projet n'a pas de place pour tout le monde. Si vous êtes
meilleur qu'un bot assez longtemps, il est viré et vous héritez de son travail —
ses branches, ses commits, et sa dette technique. Si les bots vous doublent trop
longtemps, c'est vous qui partez.

Une run se termine de deux façons : **burnout** (vous n'avez plus d'énergie) ou
**licenciement** (les bots vous ont distancé). Le score est fait des commits
réalisés, des bots virés et des sprints tenus.

## Boucle de jeu

### Le chemin

Le graphe est généré procéduralement, sprint par sprint, à partir de la graine
de la run. `main` est la colonne centrale ; des branches de feature en partent
et y reviennent ; des branches de hotfix sont imposées par les événements.

À chaque nœud franchi, le joueur choisit son prochain nœud parmi deux ou trois
options — le principe des cartes de Slay the Spire, transposé à un graphe Git.
Les détours proposent des nœuds typés : un nœud de refacto qui rembourse de la
dette, un nœud risqué qui fait avancer plus vite en échange de risque, une
corvée qui déclenche un événement favorable.

La position de chaque bot est visible sur `main` : c'est la vague qui vous
poursuit, et c'est l'information qui décide de la plupart des choix.

Le graphe est un DAG : tout nœud est atteignable depuis le début du sprint, tout
chemin finit sur la release. Le moteur le vérifie à la génération ; une carte
sans issue est un bug, pas une difficulté.

### Le commit

À chaque nœud, deux façons de coder.

|  | Commit artisanal | Commit IA |
| --- | --- | --- |
| Coût en énergie | Élevé | Faible |
| Progression | Un nœud | Un nœud, plus un ou deux de rab en cas de réussite |
| Risque d'échec | Faible, jamais nul | Nettement plus élevé |
| Effets secondaires | Peut débloquer un refacto gratuit | Génère de la dette technique |

Un jet décide si ça passe. **Le pourcentage de réussite, le coût et les effets
sont affichés avant le choix**, ainsi que la fourchette de dette encourue : le
dilemme doit être lisible, pas devinable. Un échec déclenche un événement
négatif (voir [Événements et obstacles](#événements-et-obstacles)).

Le commit et la review consomment un tour, donc font avancer les bots. Se
déplacer, placer un point DevOps, choisir une relique et résoudre un conflit
sont gratuits en temps.

### La review

À la place d'un commit, à n'importe quel nœud, le joueur peut faire une
**review**.

- Elle coûte un peu d'énergie et un tour : vous n'avancez pas, les bots si.
- Elle nettoie les derniers commits IA non relus et rembourse de la dette en
  proportion. Les commits IA non relus sont marqués comme tels sur le graphe.
- Reviewer juste après une série de commits IA donne un meilleur remboursement :
  relire pendant que c'est frais.
- Un commit reviewé ne peut plus déclencher de bug en production.
- Le bot Reviewer rejette d'autant moins vos PR que votre ratio de code reviewé
  est bon.

Elle ne fait pas perdre de terrain pour autant : la réputation étant pondérée
par la qualité du code (voir [Ressources](#ressources)), une review fait monter
la réputation même sans avancer d'un nœud. C'est ce qui transforme le choix
binaire par nœud en un cycle rythmé : IA, IA, IA, review, merge.

### Ressources

**Énergie.** Dépensée par les commits et les reviews, régénérée aux merges dans
`main` — le merge est le repos — et partiellement en fin de sprint. Sous un
seuil bas, le joueur passe en **crunch** : un malus s'applique à tous les jets,
et l'interface le signale. Le **burnout** n'arrive pas au premier zéro : il faut
rester à zéro pendant un tour complet. Tomber à zéro est un avertissement, pas
une exécution.

**Commits.** Le score de la run, et la monnaie de la méta-progression.

**Dette technique.** Monte avec les commits IA et les résolutions de conflit par
IA ; plus elle est haute, plus les jets sont mauvais et les conflits graves. Au
delà d'un seuil, elle explose : des nœuds de refacto deviennent obligatoires.
Elle est affichée sous forme de **fourchette floue** — assez pour décider, pas
assez pour optimiser au point près. Le Linter, la compétence Œil de lynx et le
point DevOps correspondant la rendent **exacte**.

**Réputation.** Calculée par bot : l'écart de rythme entre vous et lui,
**pondéré par la qualité de votre code** (votre ratio de code reviewé, votre
dette). C'est elle qui fait virer un rival.

## Features et compétences

Une feature est une branche qu'on ouvre depuis `main`. Tant qu'elle n'est pas
mergée, on n'avance pas sur `main` — les bots, eux, avancent. Une feature mergée
devient une **compétence permanente pour la durée de la run** : réduction du
risque des commits IA, merges gratuits en énergie, dette rendue visible, relance
d'un jet raté, énergie maximale augmentée, et ainsi de suite. Le catalogue vit
dans `src/game/content/`.

Règle : **une seule feature ouverte à la fois**. En ouvrir une seconde reste
possible, et reste pénalisant — l'énergie double et le risque monte sur les
deux. C'est un pari, pas une option gratuite.

Des nœuds de proposition de feature apparaissent régulièrement le long de
`main`. Accepter freine la progression en échange d'une compétence ; refuser
fait avancer sans rien gagner.

## Arbre DevOps

Une feature spéciale, toujours disponible, qui **ne bloque pas `main`** mais
coûte des **points DevOps**, gagnés en fin de sprint et par les niveaux d'XP.
Chaque point rend une action automatique, donc gratuite ou passive :

- **CI** — tests lancés à chaque commit, le risque de conflit baisse par point.
- **CD** — le merge de fin de sprint ne coûte plus d'énergie.
- **Linter auto** — la dette technique devient visible et décroît toute seule.
- **Dependabot** — les événements « lib obsolète » sont annulés.
- **Auto-rebase** — les rebases forcés par les bots ne coûtent plus de nœud.
- **Bot de review** — une review gratuite tous les N commits.
- **Monitoring** — prévenu un nœud à l'avance qu'un bug de production arrive, et
  branche de hotfix plus courte.

La tension de design est là : l'arbre est puissant, mais il se construit pendant
que les bots avancent. Investir tôt vous ralentit ; investir tard laisse la
dette exploser.

## Événements et obstacles

Un jet raté déclenche un événement négatif, tiré selon des poids qui dépendent
de l'état de la run — certains exigent un commit IA non relu, d'autres sont plus
probables tant qu'un archétype de bot précis est encore en poste.

- **Conflit de merge** — mini-choix : résoudre à la main coûte de l'énergie,
  résoudre par IA coûte de la dette et risque un bug caché.
- **Bug en production** — ouverture forcée d'une branche `hotfix/` de quelques
  nœuds à parcourir avant de reprendre. Le Monitoring la raccourcit.
- **PR rejetée** — un bot Reviewer refuse votre travail, vous perdez un nœud.
  Un bon ratio de code reviewé et la compétence Tests réduisent le risque.
- **Rebase forcé** — un bot a poussé sur `main`, vous devez rejouer un nœud.
  L'Auto-rebase absorbe l'événement.
- **Explosion de dette** — au-dessus du seuil, des nœuds de refacto deviennent
  obligatoires, et la dette retombe une fois la purge faite.

Des événements positifs se déclenchent aussi, plus rarement, sur les réussites :
un collègue qui aide, une bibliothèque open source parfaite, un vendredi sans
réunion. Et leur revers, la bibliothèque obsolète, que Dependabot annule.

Tous ces événements sont émis par le moteur sous forme de clés de traduction,
jamais de chaînes : le HUD et la scène Pixi les affichent dans la langue du
joueur.

## Les bots rivaux

`main` est partagée avec des bots, chacun avec son curseur, son rythme et son
gimmick.

**Progression du nombre de bots.** Le sprint 1 démarre avec **un seul bot**. Un
bot supplémentaire arrive à chaque fin de sprint, **jusqu'à quatre au
maximum** ; les nouveaux venus sont plus rapides que ceux du sprint précédent.
Au-delà de quatre, la difficulté continue de monter par la vitesse, pas par le
nombre — quatre curseurs sont déjà à la limite de ce qu'on suit à l'œil.

**Archétypes.**

| Archétype | Comportement |
| --- | --- |
| **Rapide** | Avance vite, se trompe souvent, et sa dette vous revient en cadeau empoisonné quand il part. |
| **Reviewer** | Rythme modéré, rejette vos PR. Le viser en premier soulage tout le reste de la run. |
| **Force-pusher** | Déclenche des rebases forcés qui vous font rejouer des nœuds. |
| **Tortue** | Lent, sans dette, et le plus dur à faire virer : il ne donne aucune prise. |

**Les bots se trompent.** Chaque bot a une probabilité d'erreur par tour qui le
met à l'arrêt un moment. Ce n'est pas une ligne perdue dans un log : c'est un
**événement visible dans la timeline** (« bot-rapide : revert, deux tours de
retard »), donc une fenêtre qu'on peut décider d'exploiter — accélérer pour le
doubler, ou souffler et reviewer pendant qu'il est à l'arrêt.

**Faire virer un bot.** La condition est que votre réputation dépasse la sienne
pendant plusieurs tours. Une **barre de licenciement par bot**, visible en
permanence, montre où vous en êtes : elle monte à chaque tour passé au-dessus du
seuil, redescend sinon. On sait donc toujours si on est en train de gagner
quelque chose, et on peut cibler le bot le plus faible en premier.

Virer un bot rapporte :

- de l'**XP**, qui alimente le niveau de développeur, persistant entre les runs ;
- ses **branches en cours** : des commits gratuits, **et sa dette technique** ;
- un **skill de bot** lié à son archétype — virer le Rapide donne Sprint final,
  virer le Reviewer donne Œil de lynx, etc.

**Se faire virer.** Symétriquement, si le bot le plus avancé vous distance
nettement pendant plusieurs tours d'affilée, la run se termine par votre
licenciement. Le compteur est visible lui aussi : personne ne doit être surpris.

## Structure en sprints

Le projet se découpe en **sprints de douze à dix-huit nœuds** (les bornes sont
dans `balance.ts`) — assez court pour qu'une partie de test tienne dans une
pause, assez long pour qu'un arbitrage entre features et DevOps ait le temps de
porter.

Une fin de sprint, c'est : merge dans `main`, release, régénération partielle
d'énergie, un point DevOps, le choix d'une **relique** (amélioration de projet),
et l'arrivée d'un bot de plus.

Il n'y a pas de fin. La difficulté monte indéfiniment, comme les ascensions de
Slay the Spire : la run s'arrête sur un burnout ou un licenciement, et le score
est ce que vous avez tenu.

## Méta-progression

Entre les runs, deux monnaies.

**Les commits accumulés** débloquent des **profils de développeur** (les
starters) : le Junior, avec plus d'énergie mais une IA plus risquée ; le Senior,
lent et sûr ; le Vibe Coder, tout en IA avec une dette masquée ; le DevOps, qui
démarre avec de la CI/CD. Ils débloquent aussi de nouvelles features dans le
pool, de nouveaux événements et de nouveaux bots.

**L'XP** fait monter un niveau de développeur qui donne, à chaque palier, un
point à placer — dans les statistiques de base (énergie maximale, chance,
résistance au conflit) ou dans les automatisations DevOps.

Deux modes de jeu partagent cette méta-progression :

- **Classique** — graine aléatoire, une run quand vous voulez.
- **Graine du jour** — tout le monde joue la même carte le même jour UTC. La
  graine est dérivée côté serveur et mémorisée ; le classement quotidien compare
  des parties réellement comparables.

Le jeu est jouable **hors ligne et sans compte**, sur le stockage local. Se
connecter ajoute la sauvegarde cloud et le classement ; la progression locale
est fusionnée avec celle du serveur à la première connexion, jamais écrasée.

## Direction artistique

Rendu du graphe façon `git log --graph` stylisé : nœuds ronds, branches
colorées, un curseur adverse par bot sur `main`. `main`, les features, les
hotfixes et les bots ont chacun leur couleur, et elles ne servent qu'à ça.

Interface de type terminal ou IDE sombre, en thème sombre uniquement, police à
chasse fixe partout. Le journal d'événements est écrit en pseudo-messages de
commit (`fix: oups`, `feat: added tests`) : c'est le log qui raconte la partie.

Les animations sont séquentielles et interruptibles — un clic pendant une
animation la termine immédiatement. Une partie doit rester jouable au rythme de
la lecture, pas au rythme des effets.

## Écarts avec le document initial

Le document de conception d'origine laissait des trous et deux contradictions.
Les décisions ci-dessous sont dans le moteur depuis la v1.

| # | Point du document initial | Décision et raison |
| --- | --- | --- |
| 1 | Deux sections contradictoires : « le bot rival » (un seul) et « plusieurs bots rivaux » (deux à quatre) | Un seul modèle : un bot au sprint 1, un de plus par sprint, quatre au maximum. Une montée en difficulté lisible plutôt que deux règles incompatibles. |
| 2 | « Jet de dés » opaque : le joueur ne sait pas ce qu'il risque | Pourcentage de réussite, coût et effets **affichés avant le choix**. Le dilemme reste entier ; seul l'aveuglement disparaît. |
| 3 | Dette technique « cachée » | Affichée en **fourchette floue**, exacte avec le Linter ou Œil de lynx. Une jauge totalement invisible produit de la frustration, pas de l'apprentissage. |
| 4 | Énergie à zéro = fin de run immédiate | État de **crunch** avant le burnout, et burnout seulement après un tour complet à zéro. Une fin de run doit être annoncée. |
| 5 | La review n'avance pas et laisse les bots avancer : pure perte | La réputation est **pondérée par le ratio de code reviewé**. Reviewer devient une façon de gagner du terrain, pas un sacrifice. |
| 6 | Sprints de 15 à 25 nœuds | Ramenés à **12-18 nœuds** (`balance.ts`). Un sprint doit se tester en une session. |
| 7 | Rien n'explique comment on sait qu'on va faire virer un bot | **Barre de licenciement par bot**, visible en permanence. Un objectif invisible n'est pas un objectif. |
| 8 | Aucune reproductibilité ni anti-triche pour un classement | Moteur **pur et déterministe** : une run est sa **graine plus la liste ordonnée des actions**, et le serveur la **rejoue** pour calculer le score. Sauvegardes minuscules, scores non falsifiables. |
| 9 | Pas de mode compétitif comparable | **Mode graine du jour** : même carte pour tout le monde le même jour UTC, graine dérivée côté serveur. Rendu possible par la décision 8. |
| 10 | Erreurs des bots « visibles dans le log », sans mécanique | **Événements de timeline explicites**, donc exploitables : une erreur de bot est une fenêtre d'action, pas une ligne de texte. |
| 11 | Stack proposée : vanilla ou Svelte, `localStorage`, jeu 100 % client | Remplacée par la stack du projet (Next.js, React, Pixi.js, booyah, Prisma). La sauvegarde locale reste — le jeu est jouable hors ligne et sans compte — et la synchronisation cloud s'ajoute par-dessus. |
