# Devgame — conception du jeu

Ce document est la spécification consolidée du jeu. Le moteur
(`src/game/core/`) l'implémente : une règle du code qui contredit ce document
est un bug, dans l'un ou dans l'autre.

Il remplace le document de conception initial. Les points où les deux divergent
sont listés à la fin, dans [Écarts avec le document
initial](#écarts-avec-le-document-initial).

> **Aucun chiffre d'équilibrage ici.** Tous les coûts, pourcentages, seuils et
> cadences vivent dans `src/game/core/balance.ts`, et nulle part ailleurs. C'est
> ce fichier qui fait foi : le dupliquer ici garantirait qu'une des deux copies
> soit fausse au bout d'une semaine. Ce document décrit les mécaniques et les
> ordres de grandeur ; `balance.ts` décrit les valeurs.

## Concept

Roguelike RPG dans le navigateur où le donjon est un **graphe Git**. Le joueur
est un développeur qui avance commit par commit sur un projet qui ne se termine
jamais. Chaque commit est un choix de style de jeu : lent et sûr, ou rapide et
risqué.

Le dépôt est à vous. Le backlog, non. Chaque sprint apporte des **tickets** —
des features à livrer, avec des points de story à remplir — et le projet en
apporte de plus en plus. Un ticket plein part en **review**, et la review
trouve ce que la machine a écrit sans relecture. Un ticket laissé en attente
finit par vous être assigné ; un ticket refusé en fait arriver un autre en
parallèle ; un ticket ouvert de plus, c'est chaque commit plus cher et chaque
jet plus mauvais. Et ce qui part en production sans avoir été relu finit par y
casser quelque chose.

Une run se termine de deux façons : **burnout** (vous n'avez plus d'énergie) ou
**licenciement** (la production a perdu patience). Le score est fait des
commits réalisés, des points de story livrés et des sprints tenus.

## Boucle de jeu

### Le graphe

Le graphe n'est pas généré d'avance. **Rien n'existe avant d'être écrit** : un
ticket est une demande, pas un chemin, et chaque commit est créé au moment où
il est écrit, à la rangée suivante, dans la colonne de son ticket, pointant
vers ce sur quoi il a été construit. C'est un DAG lu par les parents, comme
`git log` le lit.

**Deux branches au long cours, et rien ne s'écrit sur l'une ni sur l'autre.**

- **`dev`** est la branche d'intégration. Elle s'ouvre sur un back-merge de
  `main` et reçoit ensuite **un merge par ticket livré**.
- **`main`** ne reçoit que deux nœuds par sprint : le merge `dev → main` qui le
  livre, et la **release** qui le tague. La colonne la plus à gauche raconte
  donc l'histoire des sprints, pas celle des commits.

Tout le travail se fait dans la colonne d'un ticket, qui part de `dev` et y
revient. Un ticket prend la colonne libre la plus à gauche quand on l'ouvre et
la rend quand il merge. **Un merge est la fin d'un ticket, jamais un commit de
plus.**

### Le ticket

Un ticket, c'est :

- des **points de story** à remplir — chaque commit qui atterrit en remplit,
  un à la main, deux par la machine ;
- parfois une **compétence**, payée en points de story supplémentaires : le
  ticket qui donne quelque chose coûte strictement plus que celui qui ne donne
  rien, sinon il n'y a pas de décision.

Points pleins, le ticket n'est pas livré : il est **soumis**. Quelqu'un lit la
pull request, et ce qu'il trouve est exactement ce que le jeu punit : chaque
commit IA non relu peut être attrapé comme un bug, et un code au-dessus de son
plafond de dette ne prend rien de plus. La modale de review lit le ticket à
voix haute — les commits, ce que personne n'a relu, la dette — puis tranche.

- **Acceptée** : le ticket merge sur `dev` dans le même tour, et livre sa
  compétence.
- **Refusée** : les bugs trouvés reviennent en points de correctif, et le
  joueur choisit — **recommencer** (les commits sont jetés, `git reset --hard`,
  la branche repart de `dev`) ou **continuer** (garder les commits, corriger).
  Dans les deux cas **un nouveau ticket s'ouvre en parallèle** : le sprint
  n'attend pas.

**Démarrer** un ticket depuis le tableau du projet et **basculer** d'un ticket
ouvert à l'autre sont gratuits en temps. Ce qui coûte, c'est d'en tenir
plusieurs : chaque ticket ouvert au-delà du premier majore l'énergie de chaque
commit et retire des points à chaque jet. Un hotfix ou une refacto imposée
comptent dedans — c'est le but.

**Le backlog s'impose.** Un ticket resté en attente au-delà d'un sprint de
grâce est ouvert d'office au sprint suivant. C'est la pression du jeu : plus on
reste sur le projet, plus il arrive de tickets, et plus on en tient à la fois.

Plus tard : embaucher des développeurs avec les revenus du programme, qui
prendront les tickets en trop — un à la fois pour un junior, deux pour un
intermédiaire, trois pour un senior.

### Le commit

À chaque tour, deux façons de coder le ticket en main.

|  | Commit artisanal | Commit IA |
| --- | --- | --- |
| Coût en énergie | Celui du type de commit, plus la main | **Un point, quoi qu'elle écrive** |
| Points de story | Un | **Deux** |
| Risque d'échec | Faible, jamais nul | Nettement plus élevé |
| Effets secondaires | Peut débloquer un refacto gratuit | Génère de la dette ; non relu, finit en production |

La machine est meilleure sur les points : c'est ce qui compense sa dette et ses
bugs, et ce qui fait de la relecture une décision plutôt qu'une taxe. Un jet
décide si ça passe ; **le pourcentage de réussite, le coût, les points et la
dette sont sur la carte**, pas dans une infobulle. Un échec déclenche un
événement négatif (voir [Événements et obstacles](#événements-et-obstacles)).

**Un détour n'est pas une bifurcation.** Écrire un commit en refacto, en
documentation, en squash ou en rebase est une décision sur *ce commit-là* :
il coûte un tour comme les autres et laisse le graphe en chaîne. Les détours
sont toujours proposés, sauf deux qui sont situationnels :

- **Refacto** — rembourse de la dette.
- **Commit risqué** — un point de story de plus contre un jet nettement moins
  sûr.
- **Corvée** — déclenche un événement du quotidien, souvent favorable.
- **Documentation** — les prochains commits IA n'ajoutent aucune dette.
- **Squash** — proposé dès que le ticket porte assez de commits IA non relus :
  leur dette part avec eux, et eux partent du score. La seule façon d'effacer
  de la dette **sans savoir reviewer**.
- **Rebase** — proposé seulement quand **`dev` a bougé sous le ticket** : un
  merge a atterri depuis son ouverture. Chaque merge de retard renchérit le
  merge du ticket ; le rebase efface ce retard. Ses chances ne dépendent pas de
  la chance mais de la dette : quasi gratuit sur un historique propre, pile ou
  face à soixante.

Un **hotfix** ou une **refacto imposée** est un ticket ouvert de force, qui
n'accepte qu'un seul type de commit tant que ses points ne sont
pas pleins.

Le commit, la review et le merge consomment un tour. Démarrer un ticket,
basculer, placer un point DevOps, choisir une relique et résoudre un conflit
sont gratuits en temps.

### La review

À la place d'un commit, le joueur peut **relire** le ticket en main — mais
seulement s'il a appris à le faire, et seulement s'il y reste un commit IA non
relu.

**La review s'apprend.** L'action n'existe pas tant qu'un ticket livré ne l'a
pas accordée : Revue de code, ou Pair programming, qui est la même habitude
sous un autre nom. Une run qui ne croise ni l'une ni l'autre n'a que le squash
pour faire disparaître un commit IA avant la pull request.

- Elle coûte un peu d'énergie et un tour.
- Elle nettoie les derniers commits IA non relus du ticket, du plus récent au
  plus ancien, et rembourse de la dette en proportion. Relire pendant que c'est
  frais en lit plus.
- Un commit relu ne peut plus casser la production, ni faire refuser la PR.
- Le **bot de review** DevOps relit tout seul, à sa cadence — le ticket en
  main, puis ce qui a déjà été livré sur `dev` sans relecture. C'est la seule
  façon de relire du code déjà mergé avant que la release ne le juge.

### Ressources

**Énergie.** Dépensée par les commits et les reviews, régénérée aux merges — le
merge est le repos — et partiellement en fin de sprint. Sous un seuil bas, le
joueur passe en **crunch** : un malus s'applique à tous les jets, et l'interface
le signale. Le **burnout** n'arrive pas au premier zéro : il faut rester à zéro
pendant un tour complet. Tomber à zéro est un avertissement, pas une exécution.

**Commits et points.** Le score de la run, et la monnaie de la
méta-progression. Chaque point de story livré rapporte aussi de l'XP, d'autant
plus que le sprint est avancé.

**Dette technique.** Monte avec les commits IA et les résolutions de conflit par
IA ; plus elle est haute, plus les jets sont mauvais et les merges risqués. Au
delà d'un seuil, elle explose : une **refacto imposée** s'ouvre, une à la fois,
et la dette retombe quand elle merge. Elle est affichée sous forme de
**fourchette floue** — assez pour décider, pas assez pour optimiser au point
près. Le Linter, Œil de lynx et le point DevOps correspondant la rendent exacte.

**Production.** Une jauge, visible en permanence : chaque incident la remplit,
un sprint sans incident la fait baisser, et pleine, c'est le licenciement.
Personne ne doit être surpris.

## Compétences

Une compétence est la récompense d'un ticket livré, permanente pour la durée
de la run : réduction du risque des commits IA, merges qui rendent plus
d'énergie, dette rendue visible, relance d'un jet raté, énergie maximale
augmentée, dette IA remisée, et ainsi de suite. Le catalogue vit dans
`src/game/content/`. Une compétence n'est jamais promise par deux tickets à la
fois, et le premier ticket de chaque sprint en porte une tant qu'il en reste.

## Arbre DevOps

Une feature spéciale, toujours disponible, qui ne coûte aucun tour mais des
**points DevOps**, gagnés en fin de sprint et par les niveaux d'XP. Chaque
point rend une action automatique, donc gratuite ou passive :

- **CI** — tests lancés à chaque commit, tous les jets s'améliorent.
- **CD** — les merges rendent plus d'énergie.
- **Linter auto** — la dette technique devient visible et décroît toute seule.
- **Dependabot** — les événements « lib obsolète », « montée de version » et
  « migration de lib » sont annulés.
- **Auto-rebase** — un rebase raté ne coûte plus de dette.
- **Bot de review** — une review gratuite tous les N tours, qui relit aussi ce
  qui est déjà sur `dev`. C'est la seconde route vers la relecture.
- **Monitoring** — le premier bug d'une run est un avertissement plutôt qu'un
  incident, et les hotfixes sont plus courts.

La tension de design est là : l'arbre est puissant, mais il se construit
pendant que le backlog grossit. Investir tôt vous ralentit ; investir tard
laisse la dette exploser.

## Événements et obstacles

**Un jet de commit raté** déclenche un événement négatif, tiré selon des poids
qui dépendent de l'état de la run :

- **Bug en production** — exige un commit IA non relu sur le ticket. Un
  incident : la jauge de production monte, un ticket `hotfix` s'ouvre de
  force. Le Monitoring absorbe le premier.
- **PR rejetée** — le ticket perd un point de story. La compétence Tests la
  contre.
- **Build cassé** — le CI est rouge pour rien : de l'énergie perdue, rien
  d'écrit.
- **Conflit de merge** — seulement sur un rebase : deux historiques doivent
  réellement se rencontrer.

**Livrer un ticket** tire son propre jet, d'autant plus probable que la dette
est haute, qu'il reste du code IA non relu dedans et que `dev` a bougé depuis
son ouverture. Si quelque chose se passe, une table décide quoi :

- **Conflit de merge** — la branche est à moitié appliquée, la question reste
  posée jusqu'à ce qu'on tranche : à la main, contre de l'énergie ; par l'IA,
  contre de la dette et un risque de bug caché que la release trouvera.
- **Migration de lib** — ça coûte de l'énergie, ça endette, et ça merge.
- **CI capricieuse** — un point d'énergie pour rien.
- **Review pointilleuse** — le merge passe, mais ne repose pas.

**La release fait remonter les bugs.** À la fin du sprint, chaque commit IA
non relu livré sur `dev` — et chaque conflit que la machine a résolu avec un
bug caché — tire un jet d'incident. Les commits d'un hotfix en sont exempts :
un correctif qui engendre son propre correctif serait une spirale, pas une
tension.

Des événements positifs se déclenchent aussi, plus rarement, sur les réussites :
un collègue qui aide, une bibliothèque open source parfaite, un vendredi sans
réunion. Et leur revers, la bibliothèque obsolète et la montée de version, que
Dependabot annule.

Tous ces événements sont émis par le moteur sous forme de clés de traduction,
jamais de chaînes : le HUD et la scène Pixi les affichent dans la langue du
joueur.

## Structure en sprints

Un sprint est une **boîte de tours** (le nombre est dans `balance.ts`). Quand
elle est vide — ou quand plus rien n'est ouvert ni en attente — le travail
part : `dev` mergée dans `main`, la release taguée, les bugs remontés. Puis le
week-end : régénération partielle d'énergie, un point DevOps, le choix d'une
**relique** (amélioration de projet), l'assignation des tickets restés en
attente, et l'arrivée des tickets du sprint suivant — un peu plus nombreux
tous les quelques sprints, jusqu'à un plafond.

Un ticket entamé est reporté : il garde ses commits, ses points et son retard
sur `dev`.

Il n'y a pas de fin. La difficulté monte indéfiniment, comme les ascensions de
Slay the Spire : la run s'arrête sur un burnout ou un licenciement, et le score
est ce que vous avez tenu.

## Méta-progression

Entre les runs, deux monnaies.

**Les commits accumulés** débloquent des **profils de développeur** (les
starters) : le Junior, avec plus d'énergie mais une IA plus risquée ; le Senior,
lent et sûr ; le Vibe Coder, tout en IA avec une dette masquée ; le DevOps, qui
démarre avec de la CI/CD. Ils débloquent aussi de nouvelles compétences dans le
pool et de nouveaux événements.

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

Rendu du graphe façon client git de bureau : colonnes étroites, rangées
courtes, petits disques, et **une ligne continue par branche tant qu'elle
vit** — `main` et `dev` ne finissent jamais, la ligne d'un ticket court de son
fork à son tip et jusqu'au présent tant qu'il est ouvert. Les commits de tronc
sont creux. Les refs — `main`, `dev`, `HEAD`, `feat/t3` — sont des pastilles
dans une gouttière entre le graphe et les sujets, sur le commit qu'elles
pointent ; les sujets (`feat: Commit`) s'alignent dans une colonne à part.
`main`, `dev`, les tickets et les hotfixes ont chacun leur couleur, et elles ne
servent qu'à ça.

Interface de type terminal ou IDE sombre, en thème sombre uniquement, police à
chasse fixe partout. Le journal d'événements est écrit en pseudo-messages de
commit (`fix: oups`, `feat: added tests`) : c'est le log qui raconte la partie.

**Le graphe s'écrit au rythme des effets.** Le moteur écrit un tour d'un coup ;
le canvas le raconte dans l'ordre : le commit apparaît, ce qu'il a coûté se
pose dessus, la production casse, le hotfix s'ouvre. La caméra suit chaque
chose qui apparaît. Les modales — conflit, relique, fin de run — attendent la
fin de la séquence, sinon la question tombe sur sa propre cause. Un clic
pendant la séquence révèle tout et débloque tout de suite : une partie doit
rester jouable au rythme de la lecture, pas au rythme des effets.

### Ce que le graphe montre, et ce qu'il ne montre pas

Six règles, et elles tiennent ensemble. Le moteur ne connaît aucun commit avant
qu'il soit écrit — un ticket est une demande — et le graphe ne montre que ce
que le moteur sait.

1. **Le graphe s'écrit, il ne se dévoile pas.** Seuls les commits écrits sont
   dessinés. Ce qui vient n'existe pas encore, ni dans l'état, ni à l'écran.
2. **`HEAD` est sur le dernier commit écrit**, jamais sur le suivant. En git on
   se tient sur l'histoire, pas sur un plan. `HEAD` est le tip du ticket en
   main, ou `dev` quand il n'en a pas encore.
3. **L'histoire se lit de bas en haut**, du premier commit vers le dernier,
   comme dans tout client git. C'est le seul rôle du signe dans `nodeY`.
4. **Le graphe ne se clique pas.** On n'agit pas sur le passé : toute décision
   se prend dans le panneau, qui a la place de dire ce que chaque option coûte.
5. **Rien n'est dessiné au-dessus de la tête.** Pas de nœud à venir, pas même
   un moignon de lane. La colonne d'un ticket apparaît avec son premier commit.
6. **Un ticket est une colonne le temps qu'il est ouvert.** Il la prend en
   s'ouvrant, la rend en mergeant, et le suivant la reprend. Les rangées sont
   globales : chaque commit prend la suivante, quel que soit le ticket, et le
   graphe se lit dans l'ordre où il a été écrit.

Un choix est nommé par ce qu'il **fait**, pas par le nom que le moteur donne au
nœud : ouvrir un ticket est « Démarrer », soumettre est « Ouvrir la PR », et
écrire un commit en refacto est « Refacto · à la main ».

Le HUD a quatre places, une par rôle : la barre de ressources dit où on en est
et combien de tours il reste au sprint ; la barre de tickets, au-dessus du
graphe, tient les tickets en main sous forme d'onglets ; le panneau de droite
est la décision du tour et rien d'autre ; le journal se replie sous le graphe.
Le tableau du projet est une modale — démarrer un ticket est une décision de
projet, pas un coup.

Survoler un commit l'explique dans une infobulle **DOM**, pas dans le canvas :
traduite par next-intl, lisible par un lecteur d'écran, nette à tout zoom.

La caméra ne se déplace que sur l'axe vertical. L'arbre est centré
horizontalement à toutes les échelles — un graphe git est une colonne étroite,
et rien ne se trouve sur les côtés. Le zoom va de 40 % à 240 % et n'est jamais
remis à zéro, y compris par le bouton de recentrage. Verticalement, la caméra
glisse vers ce qui apparaît. Faire glisser le graphe la libère le temps de lire
son historique ; la prochaine action la reprend.

## Écarts avec le document initial

Le document de conception d'origine laissait des trous et deux contradictions.
Les décisions ci-dessous sont dans le moteur.

| # | Point du document initial | Décision et raison |
| --- | --- | --- |
| 1 | Des bots rivaux poussent sur `main` et le joueur est viré s'ils le distancent | **Retirés.** L'ennemi est le backlog : des tickets qui s'accumulent, s'imposent et passent en review. Une course contre des bots faisait perdre sans rien enseigner ; un ticket qu'on n'arrive pas à livrer dit exactement pourquoi. Les bots pourront revenir comme aides ponctuelles. |
| 2 | « Jet de dés » opaque : le joueur ne sait pas ce qu'il risque | Pourcentage de réussite, coût, points et dette **sur la carte**. Le dilemme reste entier ; seul l'aveuglement disparaît. |
| 3 | Dette technique « cachée » | Affichée en **fourchette floue**, exacte avec le Linter ou Œil de lynx. Une jauge totalement invisible produit de la frustration, pas de l'apprentissage. |
| 4 | Énergie à zéro = fin de run immédiate | État de **crunch** avant le burnout, et burnout seulement après un tour complet à zéro. Une fin de run doit être annoncée. |
| 5 | La review n'avance pas : pure perte | La review fait passer la pull request, rembourse de la dette et retire le commit du jet de la release. Elle est une façon de livrer, pas un sacrifice. |
| 6 | Sprints de 15 à 25 nœuds | Une **boîte de tours** (`balance.ts`). Un sprint doit se tester en une session, et sa longueur ne dépend plus d'un graphe généré. |
| 7 | Rien n'explique comment on perd | **Jauge de production**, visible en permanence, remplie par les incidents. Un objectif invisible n'est pas un objectif. |
| 8 | Aucune reproductibilité ni anti-triche pour un classement | Moteur **pur et déterministe** : une run est sa **graine plus la liste ordonnée des actions**, et le serveur la **rejoue** pour calculer le score. Sauvegardes minuscules, scores non falsifiables. |
| 9 | Pas de mode compétitif comparable | **Mode graine du jour** : même carte pour tout le monde le même jour UTC, graine dérivée côté serveur. Rendu possible par la décision 8. |
| 10 | Un commit IA avance de plusieurs nœuds d'un coup | **Un jet, un commit.** La machine remplit deux points de story au lieu d'un : l'avantage est chiffré sur la carte, et le joueur choisit à chaque commit. |
| 11 | Stack proposée : vanilla ou Svelte, `localStorage`, jeu 100 % client | Remplacée par la stack du projet (Next.js, React, Pixi.js, booyah, Prisma). La sauvegarde locale reste — le jeu est jouable hors ligne et sans compte — et la synchronisation cloud s'ajoute par-dessus. |
