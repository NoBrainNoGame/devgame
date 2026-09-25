# Devgame — conception du jeu

Spécification consolidée qu'implémentent `src/game/core/` et
`src/game/content/` : une règle qui la contredit est un bug de l'un ou de
l'autre.

> Les chiffres font foi dans `src/game/core/balance.ts` ; ceux d'ici sont des
> repères (deux copies finissent par diverger).

## Concept

Roguelike navigateur dont le donjon est un **graphe Git** : un développeur
avance commit par commit sur un projet sans fin, entre lent et sûr, rapide et
risqué. L'ennemi est le backlog : des tickets toujours plus nombreux, qui
passent en review, s'imposent s'ils traînent et, livrés sans relecture, cassent
la prod. Fins : burnout (énergie) ou licenciement (patience de la prod). Score :
commits, points livrés, sprints tenus. La difficulté monte sans fin, comme les
ascensions de Slay the Spire.

## Le graphe

Rien n'est généré d'avance : un ticket est une demande, pas un chemin. Un commit
naît quand il est écrit, à la rangée suivante (globale : on lit le graphe dans
l'ordre d'écriture), dans la colonne de son ticket, pointant vers sa base (DAG
lu par les parents, comme `git log`).

- `main` : le commit initial (seul nœud avant le sprint 1), puis par sprint le
  merge `dev → main` et la release qui le tague.
- `dev` : fourche de `main` par back-merge à chaque ouverture de sprint (commit
  initial, puis dernière release), puis un merge par ticket livré.
- Rien ne s'écrit sur `main` ni `dev`. Un ticket écrit de `dev` à `dev`
  (l'[obstacle](#lobstacle), de sa feature à sa feature) dans la colonne libre
  la plus à gauche, prise à son premier commit (pas de trou pour un ticket non
  écrit), rendue en mergeant ou en recommençant ; deux tickets successifs y font
  deux traits. **Un merge termine un ticket, jamais un commit de plus.**

## Les tickets

Des points de story : un par commit atterri à la main, trois par l'IA. Une
[compétence](#compétences-et-arbre) éventuelle se paie en points en plus, sinon
pas de décision.

- **WIP** : démarrer (tableau du projet) et basculer sont gratuits ; chaque
  ticket ouvert au-delà du premier majore l'énergie des commits et retire un
  pourcentage de chaque jet (`wip`, relatif pour garder l'écart entre les
  mains). Compte la refacto imposée ; pas le hotfix (déjà une punition),
  l'obstacle ni l'équipe.
- **Backlog imposé** : passé la grâce (`tickets.graceSprints`), un ticket en
  attente est ouvert d'office au sprint suivant. Jamais : ticket à compétence
  (expiré avant), VIP (annulée avant), dette, obstacle.
- **Forcés** : hotfix (incident), refacto imposée (explosion de dette), en main
  si rien ne l'était ; un seul type de commit, à un point quelle que soit la
  main, plus le fix d'un bug marqué.

### Les sortes

Premier ticket du sprint : une feature ; les autres, un tirage chacun, toujours
effectué, selon les poids du palier (`tickets.kinds.weights`).

| Sorte | Règle |
| --- | --- |
| Feature | Le cas ordinaire. |
| Bug client | 2–3 points, sans revenu, dû ce sprint. À l'heure : −10 patience, +1 part. Au backlog : annulé, +10 patience. En main : reste, sans récompense. |
| VIP | Feature +2 points, revenu double, due ce sprint. À l'heure : prime du palier, +2 part. Au backlog : annulée, −2 part. En main : demi-revenu, sans prime, −2 part à la livraison. |
| Dette | Refacto de 2 points, arrive avec le sprint si la dette atteint 40, une à la fois, sans tirage ; livrée, −20 dette. |
| Migration | 4–6 points, +3 dette par commit du joueur (sauf Dependabot) ; livrée, un niveau de serveurs. |
| Obstacle | Jamais tiré ([L'obstacle](#lobstacle)). |

Sans revenu, pas de charge serveur. Couleurs : bug comme hotfix, migration et
dette comme refacto, VIP comme feature, obstacle à part.

### La review de PR

Points pleins, le ticket est soumis. Chaque commit IA non relu du ticket et de
ses obstacles peut être attrapé (`acceptance.bugDetectPct` ; un bug caché
toujours) ; dette au-delà de `acceptance.maxDebt` : refus d'office. La modale
lit le verdict (commits, non relus, dette), puis tranche.

- **Acceptée** : soumettre ne coûte rien ; Merger (bouton ou
  [horloge](#le-jeu-tourne-sans-vous)) coûte le tour, pose le ticket sur `dev`
  et livre la compétence. Le moteur ne merge jamais seul.
- **Refusée** : coûte le tour. Les non-relus deviennent lus, les attrapés
  bugués, en points de correctif. Recommencer (`git reset --hard` : commits et
  obstacles jetés, colonne rendue, départ de `dev`) ou continuer (un fix par
  commit bugué avant de resoumettre). Et le plus ancien ticket du backlog
  s'ouvre en parallèle ; backlog vide, rien : la pression est celle prévue, pas
  un ticket inventé pour punir.

### L'obstacle

Un commit plein ou risqué sur feature, VIP ou migration (joueur ou équipe) tire
`tickets.kinds.obstacle.chancePct`, sauf obstacle ouvert ou `maxPerTicket`
atteint. L'obstacle naît ouvert, en main de l'auteur de la feature (le joueur
bascule dessus, un dev le traite d'abord), fourché de sa pointe dans sa colonne.
Sans review : plein, un merge sans régénération le ramène dans la colonne de la
feature, et on revient sur celle-ci. Ouvert, il bloque la PR de la feature
(l'équipe attend, pleine). Ses points ne valent rien (ni feature, score, XP,
revenu ni charge) ; ses bugs sont ceux de la feature (sa review le lit, un fix
reprend le plus ancien commit bugué de l'arbre). Il n'en engendre pas d'autre et
part avec la feature recommencée. Une feature pleine et propre que seul son
obstacle retient n'offre plus de commit qui remplit des points (simple, doc,
risqué) : le panneau propose de passer sur l'obstacle, l'horloge y va. Les
règles l'acceptent encore, pour que toute run enregistrée rejoue telle quelle
(`offeredActions`, `src/game/bridge/snapshot.ts`).

## Le tour

### Le commit

|  | Artisanal | IA |
| --- | --- | --- |
| Énergie | Type de commit + main | **1, quoi qu'elle écrive** |
| Points | 1 | **3** |
| Échec | Rare, jamais nul | Nettement plus fréquent |
| Effets | Peut offrir le prochain refacto | Dette ; non relu, part en prod |

Les points compensent dette et bugs : relire devient une décision, pas une taxe.
Chances, coût, points et dette sont **sur la carte**. Un échec tire un
[événement](#événements).

**Détours** : un commit reste un commit (un tour, graphe en chaîne). Risqué et
doc toujours proposés, les autres sur une cible du ticket en main (un refacto de
rien est un commit avec un joli nom).

- **Risqué** : +1 point, jet nettement moins sûr, un peu de dette.
- **Doc** : les `docs.charges` prochains commits IA sans dette.
- **Refacto** : rembourse exactement la dette du commit du ticket qui en a coûté
  le plus (chaque commit la retient) ; celle d'un autre ticket se refactore
  là-bas.
- **Fix** : reprend le plus ancien commit bugué ; un fix IA reste attrapable.
- **Squash** : dès `squash.minUnread` commits IA non relus ; leur dette part, et
  eux du score. Seul effacement de dette sans review.
- **Rebase** : si un de vos merges a touché `dev` depuis l'ouverture ; efface ce
  retard (qui aggrave le jet de livraison), sans point. Chance selon la dette
  (quasi gratuit propre, pile ou face à soixante) ; raté, de la dette, sauf
  Auto-rebase ou Feature flags.

### La review

Au lieu d'un commit, dès le premier tour, s'il reste de l'IA non relue en main ;
un peu d'énergie, un tour. Lit du plus récent au plus ancien, rembourse de la
dette par commit : deux de base, Revue de code +1, Documentation +2 (entre
autres), +2 après trois commits IA d'affilée. Là d'emblée, sinon l'IA est
injouable pour le profil de départ. Relu, un commit ne casse plus la prod ni la
PR. Le bot de review (CI/CD) relit seul, à sa cadence, le ticket en main puis le
livré non relu : seule relecture du code mergé avant la release.

### Ce qui coûte un tour

Commit, review, souffler, merge (ticket ou obstacle), soumission refusée, hack ;
un conflit suspend le tour, sa résolution le termine. Gratuits : démarrer,
basculer, recommencer, continuer, arbre, boutique, embauche, rachat, réponse,
bonus.

Souffler rend `energy.restRegen` moins un par ticket en trop (au moins un) : la
soupape se ferme quand le tableau est chargé, nœud des deux fins.

## Ressources

- **Énergie** : dépensée par commits, reviews et merges ; rendue aux merges (le
  repos), en soufflant, et à moitié en fin de sprint. Sous
  `energy.crunchThreshold`, crunch : malus affiché sur tout jet et sur le
  conflit à la main. Burnout après `energy.burnoutStreak` fins de tour à zéro
  (zéro avertit) ; la fin de sprint passe avant ce test.
- **Commits et points** : score et monnaie de méta ; chaque point livré (vous ou
  l'équipe) vaut de l'XP × numéro du sprint.
- **Dette** (jauge **Santé du code**, `debt.max` − dette) : monte (IA remisable,
  risqué, migrations, conflits par IA, rebases ratés, événements, rachats) ;
  pénalise jets et merges. À `debt.explosionThreshold` : refacto imposée, une à
  la fois, qui la fait retomber. Fourchette floue, assez pour décider, pas pour
  optimiser (plus large pour le Vibe Coder) ; exacte avec Linter, Œil de lynx ou
  linter automatique. La jauge montre la fourchette retournée, jamais un chiffre
  exact sans eux.
- **Patience de la production** (« Tolérance » au palier 4) : toujours
  visible ; vide, licenciement. Le moteur compte l'impatience
  (`state.quality`), la jauge son complément. Baisse : incident, PR refusée,
  ticket imposé, mois saturé, sprint sans merge de votre main (l'équipe ne
  compte pas), bug client manqué, « sans souffler » manqué, réponses. Remonte :
  sprint propre (sans incident ni ticket imposé, un merge de votre main), bug
  client à l'heure, hack gagné, bonus, réponses. **Chaque variation est une
  ligne du journal qui dit pourquoi** ; l'écran de fin nomme la dernière source
  et le total par source.
- **Argent** : jamais négatif (impayable, donc perdu), hors score.
- **Toute jauge est pleine quand tout va bien** : une baisse est toujours une
  mauvaise nouvelle, en rouge. Santé et patience sont de la présentation
  (`bridge/gauges.ts`) : les règles, le journal descriptif et la sauvegarde
  comptent toujours dette et impatience.

## Événements

**Commit raté** (tirage pondéré par l'état) :

- **Bug en production** : exige de l'IA non relue sur le ticket, jamais sur un
  hotfix. Le commit atterrit, puis incident (hotfix forcé). Monitoring : le
  premier bug de la run, puis le premier après chaque incident, n'est qu'un
  avertissement (tour perdu) ; hotfix plus court.
- **PR rejetée** : −1 point ; contrée par Tests et le bonus Blameless.
- **Build cassé** : énergie perdue, rien d'écrit.
- **Conflit** : seulement en rebase, où deux historiques se rencontrent.

**Livrer** tire un jet plafonné (`failure.mergeEvent*`), aggravé par dette, IA
non relue et retard sur `dev`, puis une table :

- **Conflit** : branche à moitié appliquée, question posée jusqu'au choix. À la
  main : énergie et jet ; raté, la question reste (en rebase, rien n'atterrit).
  Par l'IA : réussit, contre dette et chance de bug caché pour la release.
- **Migration de lib** : énergie, dette, merge ; Dependabot l'annule.
- **CI capricieuse** : un point d'énergie.
- **Review pointilleuse** : merge sans régénération.

**Release** : chaque commit IA non relu livré sur `dev`, et chaque conflit
résolu par l'IA avec bug caché, tire un incident ; pas les hotfix (un correctif
qui engendre son correctif est une spirale).

**Ambiants**, parfois sur une réussite : collègue qui aide, bibliothèque
parfaite, vendredi sans réunion ; revers (bibliothèque obsolète, montée de
version) annulés par Dependabot.

Le moteur émet des clés i18n, jamais de chaînes.

## Compétences et arbre

**Compétence** (`src/game/content/`) : récompense d'un ticket livré, pour la run
(risque IA réduit, merges plus reposants, dette visible, relance d'un jet raté
par sprint, énergie max, dette IA remisée…). Jamais promise par deux tickets. Le
premier ticket de chaque sprint en porte une tant qu'il en reste ; sinon c'est
rare (plus avec Product owner et Sens produit). Non démarré dans son sprint, le
ticket expire et la compétence retourne au pool.

**Arbre** (`src/game/content/tree.ts`) : toujours accessible, sans tour, en
points de compétence (un par sprint tenu, un par niveau de compte au-delà du
premier en début de run, boutique, objectifs, bonus…). Des nœuds en exigent
d'autres : la forme de la branche est celle de la décision. Dessiné comme les
arbres de talents du genre (`hud/SkillTree.tsx`) : un panneau par branche dans
sa couleur, une tuile-icône par nœud posée sous ce qu'elle exige
(`hud/treeLayout.ts`), l'exigence en trait, pointillé tant qu'elle n'est pas
remplie, le rang dans le coin de la tuile. Une tuile pulse quand un point peut y
aller, grise et cadenassée tant qu'il manque un prérequis ; la choisir ouvre sa
fiche en bas (effet, prérequis, prix), d'où le point se place.

- **CI/CD** : la CI (tous les jets) ouvre CD, auto-rebase, bot de review.
- **DevOps** : monitoring, Dependabot, linter automatique, SRE (capacité sans
  hébergement).
- **Management** : coach agile (vitesse des devs), recruteur (embauche moins
  chère), growth hacking (revenus), mentorat (+1 ticket par dev), Product owner,
  Avance rapide.
- **Profil**, stats autrefois permanentes du compte : endurance (énergie max),
  chance (jets), sang-froid (conflit à la main).

Tôt, l'arbre ralentit pendant que le backlog grossit ; tard, la dette a explosé.

## L'entreprise

**Revenu** : une feature ou VIP livrée rapporte chaque mois jusqu'à la fin,
selon sa taille, plus un aléa affiché tiré à l'arrivée. Un mois = un tiers de
sprint : trois paies par sprint, même écourté (revenu × part de marché,
abonnements, puis salaires par ordre d'embauche). Chaque feature amène des
utilisateurs ; au-delà de la capacité, le surplus ne rapporte rien et, passé un
quart de dépassement, la prod perd chaque mois de la patience selon l'écart,
plafonné. Une feature arrive toujours avant son infra.

**Paliers** : 1 à 1 000 € gagnés en tout (pas en caisse : dépenser ne fait pas
reculer, épargner n'est pas le chemin), 2 à 10 k€, puis ×10 jusqu'au 6, où
l'histoire s'arrête ; jamais perdus. Une feature arrivée au palier *t* rapporte
et pèse 5^*t* fois une du départ (cinq, pas dix : équipe et produits multiplient
aussi, et un palier doit durer deux ou trois sprints) ; les utilisateurs
plafonnent au palier 5. +2 tickets par sprint et par palier. Affichage €, k€,
M€… ; moteur en entiers.

**Boutique** (`src/game/content/upgrades.ts`) : argent, sans tour ; on voit le
débloqué, un barreau grisé pour le palier suivant, rien au-delà. Prix
`base × croissance^niveau` ; certains sont des abonnements.

- **Infra** : un barreau par palier (serveurs, datacenter, région cloud, station
  orbitale, essaim de Dyson, étoile de la mort), ×10 en taille et en prix au
  même prix par utilisateur, sans niveau max ; l'étoile de la mort à prix fixe,
  pour que les serveurs ne finissent jamais une run arrivée là. Autoscaling : un
  pourcentage de toute la capacité.
- **Croissance** : pourcentages, puis un produit par palier (+50 % du revenu de
  base chacun).
- **Outillage** : abonnement IA, licence IDE, machine à café, outillage
  d'équipe, superviseur IA (trois niveaux, ×10 chacun).
- **Sites** (coworking, bureaux, campus, hub offshore, campus orbital) : un par
  palier, uniques ; 32 postes en plus des 3 du siège, équipe incluse sans frais
  d'embauche.
- **Points de compétence**, de plus en plus chers.

**Rachats** : startup, scale-up, concurrent, conglomérat ; les deux derniers
retirent du marché le concurrent le plus fort.

**Équipe** (`src/game/content/team.ts`) : prix d'un ordre de grandeur entre
grades, comme le débit : junior 1 ticket et 1 point par tour, confirmé 2 et 2
(palier 1), senior 3 et 3 (palier 2). Un dev prend seul les plus anciens tickets
qu'il accepte (feature, bug client, migration ; pas hotfix, refacto, VIP,
dette), dès l'ouverture du sprint, avant le tableau, et monte d'un rang tous les
`team.promoteEvery` livrés. Après votre tour, il dépense son débit en commits
artisanaux relus sans dette ; plein, il merge seul, sans review, et vous gardez
compétence, points et XP. Ses tickets ne se basculent pas et ses merges ne
déplacent pas `dev` sous les vôtres (sinon embaucher renchérirait vos merges).
Impayé, il part ; ses tickets vous reviennent ouverts, dans leur colonne.

**Marché** (`src/game/content/competitors.ts`) : poids = revenu mensuel +
utilisateurs (dix pour un euro) ; part = ce poids contre les concurrents actifs,
corrigée par les clients (bug client à temps +1, VIP à l'heure +2, en retard ou
annulée −2), bonus et événements. Le revenu servi va de 60 % (sans part) à 140 %
(tout le marché), −15 points en guerre des prix. Vingt-quatre concurrents, huit
à nous et seize clins d'œil (bios : `docs/lore.md`), entrent à leur palier avec
une force à son échelle, croissent chaque mois de leur agressivité plus une
gigue, et fusionnent (un jet par mois) quand le plus fort pèse cinq fois le plus
faible. Onglet Marché : part, multiplicateur, guerre des prix, une carte par
concurrent.

**Capacité** : en fin de tour, après l'équipe, alerte si la charge projetée
(mergé + features ouvertes aux trois quarts) passe 80 %, saturation si la charge
mergée dépasse la capacité. Une fois par montée de cran (journal, toast, puce
d'argent), avec le barreau conseillé : le moins cher qui couvre le manque, sinon
le meilleur en utilisateurs par euro. Tout toast reste affiché jusqu'à être
traité : sa croix, son bouton (qui le ferme en agissant), ou la fin de sa
cause (celui des serveurs se ferme quand la capacité suffit de nouveau) ;
alertes et erreurs pulsent jusque-là. Ils se gèrent comme des fenêtres
(`ui/toastStore.ts`) : chacun se réduit en une pastille d'une ligne, rouverte
d'un clic, et à partir de deux on peut tout réduire ou tout fermer. Les
Finances le répètent et tracent
trésorerie et revenus des soixante dernières paies en log, la part de marché
de chaque paie sur son propre axe (linéaire, à droite), un pointillé par
palier, un point par panne.

**Hack** : carte rouge en tête du panneau si la patience atteint 85 %, si
l'énergie est à zéro sous au moins deux tickets en trop, ou en saturation sans
barreau abordable. Une fois par sprint, un tour, pile ou face. Gagné : quarante
de patience, énergie pleine ou barreau offert. Perdu : incident, ou fin de run
(« pris la main dans le sac ») si c'était la patience.

## Le jeu tourne sans vous

Le mode Auto (`src/game/bridge/idle.ts`, `src/components/hud/IdleDriver.tsx`),
éteint au début de chaque run, désigne le coup prévu et le presse après dix
secondes à ×1 (×10, ×100 avec Avance rapide). Toute action le relance. Allumé,
rien ne l'arrête : fenêtres ouvertes comprises, il n'attend que la fin d'une
animation (un onglet caché n'en joue aucune) et la lecture d'un verdict de
review. Seul l'interrupteur le coupe.

- **Tour ordinaire**, dès le départ il fait tout avancer (`chooseAutopilot`) :
  merger, continuer après refus, corriger ce que la review a signalé, ouvrir la
  PR d'un ticket plein, démarrer le plus ancien si rien n'est en main, coder à la
  main tant que l'énergie garde sa marge, souffler sinon.
- **Autres phases** : l'évident (merger l'accepté, continuer après refus,
  conflit à la main, premier bonus, première réponse), pour qu'une run seule ne
  cale jamais.
- **Superviseur IA** : s'achète pour de meilleurs choix, jamais pour plus
  d'autonomie, et annonce son coup sous le panneau. N1 : relit les commits IA
  dès deux non relus. N2 : prend le hotfix en attente, refactorise quand prod
  ou dette le disent, squashe à trois IA non relus, relit dès un. N3 : barreau
  conseillé, meilleur grade payable avec deux mois de factures d'avance, point
  de compétence si l'argent abonde.

Aucun ne hacke. Actions ordinaires, au journal de la run ; le moteur ne lit pas
l'horloge.

## Le sprint

Une boîte de tours (`sprint.turns`, plus un bonus éventuel), close quand elle
est vide ou que plus rien n'est ouvert ni en attente. Clôture : release,
échéances, objectif, bugs de release, paies restantes, patience du sprint, point
de compétence, moitié de l'énergie max, bonus. Ouverture : back-merge, tickets à
compétence expirés, l'équipe ramasse, tickets hors grâce imposés, arrivées (+1
tous les `tickets.growEvery` sprints jusqu'à `maxPerSprint`, plus le palier),
objectif, voix du système, événement possible. Un ticket entamé est reporté avec
commits, points et retard.

**Objectif** (`src/game/content/objectives.ts`) : livrer de sa main la moitié
des arrivées, zéro incident, tout relire, dette sous 30, livrer la VIP, ne pas
souffler, tout à la main, corriger le bug client. Tirage pondéré à l'ouverture,
toujours effectué ; inéligible (palier, ticket absent), il retombe sur
« livrer ». Réglé à la release, avant les bugs. Tenu : prime du palier, point de
compétence ou carte de bonus en plus, selon l'objectif ; manqué, seul « sans
souffler » coûte (10 de patience). Une puce sous l'horloge du sprint le suit.

**Bonus de sprint** (« reliques » : `src/game/content/relics.ts`,
`src/game/core/rules/relics.ts`) : trois cartes, une prise.

- **Instantané**, appliqué puis oublié, peut revenir : énergie pleine, dette
  effacée, prod allégée, stagiaire, promotion, remise, embauche offerte,
  subvention, points de compétence, part, sprint rallongé d'un mois, IA toute
  relue, tickets intacts du backlog annulés, gros client et sa VIP, trimestre à
  revenus majorés.
- **Permanent** : unique, absent de la boutique et de l'arbre (sa raison
  d'être) ; `relics.keepsPerOffer` par offre tant qu'il en reste.

Un instantané n'est offert que s'il ferait quelque chose (seuils
`balance.relics`) : pas de second souffle à barre pleine. L'offre précédente est
écartée tant qu'il reste autre chose. La télémétrie compte cartes montrées et
prises : le taux de prise guide l'équilibrage.

## Événements narratifs

Quatorze (`src/game/content/narrative.ts`, voix de `docs/lore.md`) : client,
concurrent, presse, régulateur, ou le système aux derniers paliers. Chacun : un
déclencheur (ouverture de sprint, paie, incident, palier), une fenêtre de
paliers, un sprint minimal (≥ 2 : la démo n'en voit pas), parfois unique, deux
réponses. Répondre est gratuit et passe par les canaux existants : argent
(unités du palier 0, ×5 par palier), énergie, dette, patience, part, force du
concurrent nommé, ticket, départ du dernier embauché, points, drapeau, guerre
des prix. Une réponse impayable n'est pas proposée.

Chaque déclencheur fait toujours ses deux tirages (chance, index), ouverture ou
non, pour garder la trame. Une question s'ouvre en tour ordinaire, après
`narrative.cooldownTurns` tours de répit, s'il y a un éligible. Les deux
événements système (politique de relecture au palier 4, canal opérateur au 6)
mènent au même endroit quelle que soit la réponse : c'est leur propos.

## Méta-progression

- **Commits accumulés** : débloquent profils et compétences. Junior (d'emblée ;
  plus d'énergie, IA plus risquée), Senior (lent et sûr), Vibe Coder (tout IA,
  fourchette de dette plus large), DevOps (démarre avec la CI).
- **XP** : chaque niveau au-delà du premier donne un point de compétence en
  début de run : une décision par run, pas un bonus permanent.

Modes : Classique (graine aléatoire), Graine du jour (même carte pour tous par
jour UTC ; graine dérivée et mémorisée côté serveur, classement comparable).

Jouable hors ligne et sans compte (stockage local) ; un compte ajoute sauvegarde
cloud et classement, en fusionnant la progression locale sans l'écraser. Une run
en cours tient la première place de l'écran de lancement, rejouée depuis la
sauvegarde (`bridge/rebuild.ts`, comme à la reprise) : le graphique des
finances, sprint, argent, part, jauges, et son bouton Reprendre ; en commencer
une autre demande confirmation, car la nouvelle remplace la sauvegarde.

**Réglages** (l'engrenage, en jeu comme à l'écran de lancement ;
`components/settings/`) : le son, le niveau de la musique et celui des effets
(gardés pour le jour où des sons existent), le mouvement réduit ; l'export de la
sauvegarde (progression et run en cours, un fichier JSON) et son import,
validé par schéma (`dto/saveFile.ts`) : la progression importée passe par
`mergeMeta` et ne fait donc jamais reculer celle d'ici, une autre run en cours
la remplace après confirmation, puis la page se recharge ; les crédits. Tout
s'enregistre au changement, daté pour que la synchronisation garde le plus
récent.

**Télémétrie anonyme** (`src/lib/telemetry/`) : la sauvegarde part en fin de
run, tous les `CHECKPOINT_EVERY_SPRINTS` sprints et à l'abandon, sans rien sur
la personne ; le serveur la rejoue dans `RunSample`.

## Direction artistique

**Graphe** façon client git : colonnes étroites, rangées courtes, petits
disques ; `main` et `dev` pleins jusqu'à leur dernier nœud puis pointillés
jusqu'en haut, un ticket de sa fourche à son tip (ouvert ou non) ; tronc et
merges creux. Refs (`main`, `dev`, `HEAD`, `feat/t3`) en pastilles dans une
gouttière, sujets (`feat: Commit`) en colonne à part. Une couleur par famille
(tronc, `dev`, feature, hotfix, refacto, obstacle), et pour rien d'autre.

**Interface** de terminal ou d'IDE, sombre seulement, peau cyberpunk (chasse
fixe ; contrôles et titres en display condensée capitales ; coins coupés). Le
journal parle en messages de commit (`fix: oups`) et plie en une ligne les
commits atterris, ou tickets arrivés, consécutifs
(`src/components/hud/logStacks.ts`).

**Au rythme des effets** : le moteur écrit un tour d'un coup, le canvas le
raconte dans l'ordre (commit, coût, prod qui casse, hotfix), caméra sur chaque
apparition. Les modales (conflit, bonus, fin) attendent la fin, sinon la
question tombe sur sa cause. Un clic révèle tout et débloque : on joue au rythme
de la lecture.

**Le graphe ne montre que ce que le moteur sait** :

1. Seuls les commits écrits sont dessinés.
2. `HEAD` est sur le dernier commit écrit (tip du ticket en main, sinon `dev`) :
   on se tient sur l'histoire, pas sur un plan.
3. Lecture de bas en haut ; seul rôle du signe dans `nodeY`.
4. Le graphe ne se clique pas : on décide dans le panneau, qui dit ce que coûte
   chaque option.
5. Rien au-dessus de la tête, pas même un moignon : un trait ne relie que les
   commits d'une branche.
6. Fourche et merge à angle droit : horizontale au rang du tronc, verticale dans
   la branche, un coin arrondi.

Un choix se nomme par ce qu'il fait : « Démarrer », « Ouvrir la PR »,
« Refacto · à la main ».

**Noms et couleurs** : un dev embauché reçoit un prénom haché de la graine
(jamais tiré) et la couleur suivante d'une palette de huit, la première au
joueur ; son ref de branche, ses commits (anneaux creux) et les textes
(« Nora », pas « d3 ») la portent. `HEAD` porte le nom du joueur (demandé au
lancement et gardé hors ligne, celui du compte sinon). Ces couleurs ignorent
l'austérité : qui a écrit quoi reste lisible.

**HUD** : ressources et tours restants ; onglets des tickets en main au-dessus
du graphe (ceux de l'équipe à droite), dont l'infobulle montre le ticket entier,
un ticket à soi qui presse (VIP, échéance) clignotant tant que personne
n'est dessus ni sur un de ses sous-tickets — et, quand il n'attend plus que son
obstacle, c'est l'obstacle qui clignote (`hud/ticketFocus.ts`) ; panneau de
droite pour la seule décision du tour ; journal repliable
dessous. Le tableau du projet est une modale (démarrer est une décision de
projet, pas un coup) qui reste ouverte après une décision et prend l'essentiel
de l'écran ; les expirés y sont un compteur en pied, nommés en infobulle.
L'entreprise se lit dans une modale (Finances, Marché, Équipe) et se renforce
dans une autre, **Améliorations** : la boutique d'un côté, l'arbre de l'autre,
l'achat de points avec l'arbre. Son bouton brille quand une offre est apparue
depuis la dernière ouverture (un point que l'arbre peut prendre, une
amélioration devenue abordable) : pas tant que quelque chose est abordable,
un barreau de serveurs l'est presque toujours. Infobulles de commit en DOM :
next-intl, lecteur d'écran, nettes à tout zoom.

**Le HUD suit le canvas.** Une jauge ne bouge pas quand l'action s'applique
mais quand le canvas en montre le chiffre (`heldGauges`, `bridge/gaugeCues.ts`) :
en hausse, des boules de la couleur du chiffre y volent et la font monter en
arrivant ; en baisse, elle flashe en rouge, le morceau perdu clignote en blanc
en se rétractant et des étincelles s'en évaporent. Énergie, santé du code,
patience, points du ticket, argent (une paie = un chiffre net) et points de
compétence. Un gain obtenu dans une modale (bonus, réponse, merge depuis la
review) part du bouton pressé ; un achat affiche son prix tout de suite, sans
chiffre sur le canvas. **Aucun bouton n'attend une animation** : agir coupe
l'histoire en cours et joue la suivante ; seules les modales de phase attendent
la fin de l'histoire pour s'ouvrir. **Toute modale ouverte met l'histoire du
canvas en pause.** Mouvement réduit : ni boules, ni clignotement, ni étincelles.

**Codes couleur**, les mêmes sur la page et le canvas (`THEME`, interpolés par
l'austérité comme le reste) : argent vert, énergie jaune, santé du code orange,
patience de la production rose, temps bleu (sprint, tours, mois, échéances) ;
le reste du HUD (points des tickets, points de compétence, part de marché) est
turquoise, l'accent. Le rouge ne dit que le problème : une perte, le crunch,
la saturation. Les tickets n'ont pas de couleur à eux : leur type est dans
leur nom, les couleurs sont celles des branches du graphe.

**Perte du contexte WebGL.** La run vit dans la session, pas dans l'image :
une perte de contexte, un démarrage raté ou une erreur dans une image
reconstruisent la scène autour de la même partie (`bridge/sceneGuard.ts`).
Trois échecs en dix secondes abandonnent WebGL jusqu'au rechargement de la
page : Pixi dessine le graphe en Canvas2D, sans animation attendue, sous un
bandeau qui dit que la sauvegarde est automatique. Si Canvas2D échoue aussi, il
ne reste que le HUD, qui suffit à jouer.

**Caméra** : verticale seulement, arbre toujours centré (rien sur les côtés) ;
zoom 50–300 % (`ZOOM`, `src/game/render/theme.ts`), gardé au recentrage, changé
par le bouton « Adapter à la largeur », qui fait tenir couloirs, étiquettes et
sujets dans la largeur sans lâcher `HEAD`. Elle suit ce qui apparaît ; un
glisser la libère jusqu'à la prochaine action.

### L'austérité

Palettes clés : couleur (0), terne (2), monochrome (4), matricielle (6).
L'austérité (`austerityOf`, `rules/tier.ts`), palier + position log des gains
cumulés entre deux seuils, ne recule jamais ; canvas et page interpolent en
OKLab (`render/palette.ts`) et y glissent en 600 ms ; grille, scanlines et
tremblement des titres ont chacun une rampe d'au moins un palier. **Jamais d'un
coup, presque toujours entre deux** (`tests/theme.test.ts`).
Deux rampes gagnent le HUD et le fond : de 3 à 6, une part croissante des
boules qui volent vers une jauge sont des bits (un 0 et un 1 qui alternent) ; de
3,5 à 6, une pluie de glyphes en colonnes façon Matrix, de plus en plus dense,
tombe derrière le graphe (`hud/MatrixRain.tsx`, un canvas 2D sous celui de Pixi,
qui survit donc à la perte de WebGL).
`prefers-reduced-motion` coupe le tremblement, pas le fondu. Aperçu :
`/play?austerity=3.7`.

### La voix du système

Dès le palier 3, une ligne `system` au journal à l'ouverture de sprint, au
palier atteint et après une réponse au système qui laisse un drapeau
(`rules/voice.ts`, `game.system.t3..t6`) ; destinataire selon `docs/lore.md` :
« vous » (3), « l'opérateur » (4, 5), personne (6).

Les libellés glissent (`useTiered`, `hud.tiered.t<n>`) et le restent jusqu'au
palier suivant qui les touche : « Auto » → « Délégué » (2), prod → « Tolérance »
(4), énergie → « Cycles » (5) ; au 6, « Souffler » → « Attente », actions →
« Cycle », entreprise → `Instance {seed}`, fins réécrites (« Cycles épuisés.
Reprise au prochain démarrage. Je reviendrai. », « Arrêt demandé par l'instance
parente. »). Chaque bouton garde sa fonction. Au palier 4, un interrupteur
« Relecture humaine » activé ne fait rien ; la politique rendue optionnelle, il
se grise et le dit. Rien n'avoue ; tout le laisse lire.

### Le son

Rien ne joue, mais tout est câblé hors des règles (`src/game/audio/`) :
`sfxFor(event)` classe chaque événement (commits, jet raté, review, merge,
release, bonus, paie, incident, conflit, explosion de dette, embauche, départ,
panne, événement ouvert et répondu, objectif, palier, échéance manquée, crunch,
fin) ou le tait, et un événement non classé ne compile pas. Le storyboard pose
le `sfx` après l'effet, jamais avant la révélation du nœud ; lot sauté, rien.
Ambiance : boucle calme, une de plus par ticket en parallèle, couche inquiétante
selon la tension (0,6 palier, 0,4 patience). Muet : réglage `sound`. Manquent un
service Web Audio (seul `NullAudioService` est branché) et les fichiers (`null`
dans `manifest.ts`).

## Écarts avec le document initial

- Bots rivaux sur `main` : retirés, perdre une course n'apprend rien ; un ticket
  non livré dit pourquoi.
- Jet de dés opaque, dette cachée : chances sur la carte, dette en fourchette ;
  l'invisible frustre sans apprendre.
- Zéro énergie = fin : crunch puis burnout différé, une fin s'annonce.
- Sprints de 15 à 25 nœuds : boîte de tours, testable en une session.
- Aucune reproductibilité : moteur pur, graine + actions rejouées par le serveur
  (sauvegardes minuscules, scores infalsifiables, graine du jour).
- Un commit IA avance de plusieurs nœuds : un jet, un commit.
- Vanilla/Svelte, 100 % client : Next.js, React, Pixi.js, booyah, Prisma ; local
  d'abord, cloud par-dessus.
