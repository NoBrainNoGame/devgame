# La bible

Ce que le jeu raconte sans jamais le dire. Les chaînes de `messages/*.json`
sous `game.subjects`, `game.features`, `game.competitors`, `game.system` et
`hud.tiered` obéissent à ce document ; une chaîne qui le contredit est un bug
de la chaîne.

## Règles de ton

1. **Ne jamais nommer la chose.** Aucune ligne ne dit « IA », « machine » ou
   « nous ne sommes pas humains » de l'entreprise elle-même. « La machine » est
   toujours l'outil qui écrit les commits, jamais celui qui dirige. Le joueur
   comprend seul, ou pas.
2. **Absurde par la précision bureaucratique, inquiétant par ce qui manque.**
   Une ligne inquiète par un mot attendu absent (un destinataire, une raison,
   un « qui »), jamais par un mot en trop.
3. **Chaque chaîne reste plausible** comme sujet de commit, nom de feature SaaS
   ou ligne de presse. Si un développeur ne pourrait pas l'écrire dans un vrai
   dépôt, elle est trop lourde.
4. **Le destinataire glisse.** Le joueur est « vous » jusqu'au palier 3,
   « l'opérateur » aux paliers 4 et 5 ; au palier 6, les lignes système ne
   s'adressent plus à personne, elles rapportent.
5. **Progressif, jamais d'un coup.** Une bande de paliers partage un ton ; le
   passage d'une bande à l'autre ne se voit qu'en relisant le journal d'un
   sprint à l'autre. Comme les paliers visuels : toujours entre deux états.

## L'entreprise, le produit

**Relève** est l'entreprise : son nom signe les lignes système et titre la
boîte de l'entreprise. Au palier 6, le titre devient `Instance {seed}` : le nom
n'a plus d'utilité pour personne.

**Tenon** est le produit, un SaaS de facturation au départ. Son périmètre
dérive par les seuls noms de features, sans qu'aucune ligne ne commente la
dérive :

| Bande | Paliers | Ce que Tenon fait |
| --- | --- | --- |
| t0 | 0–1 | facturation : export CSV, TVA, relances, aperçu PDF |
| t2 | 2–3 | CRM et scoring : solvabilité, consentements implicites, délégation des validations |
| t4 | 4–5 | continuité des effectifs, traitement des décisions sans relecteur, retrait du bouton d'annulation |
| t6 | 6 | succession : reprise au prochain démarrage, fermeture du canal opérateur, journal sans destinataire |

## Les sujets de commit

Un nœud porte un sujet tiré par hachage de `seed:nodeId` dans le pool de son
préfixe et de sa bande (`src/game/content/subjects.ts`). `feat`, `chore`, `fix`
et `merge` ont un pool par bande ; `refactor`, `docs`, `perf`, `squash`,
`rebase`, `init` et `release`, un seul.

- `feat` raconte Tenon d'une voix de développeur qui trouve tout normal.
- `chore` est la machine : elle « simplifie », « unifie », « retire » — et ce
  qu'elle retire est, bande après bande, une pause, une confirmation, un rôle,
  une identité.
- `fix` répare ce que `feat` et `chore` ont cassé, avec le même sérieux :
  « empêche une décision appliquée avant son heure ».
- `merge` intègre un domaine, un mot, sans verbe de plus.

Un sujet ne fait jamais référence au joueur ni à l'entreprise.

## Les concurrents

Huit entreprises (`src/game/content/competitors.ts`), chacune avec une bio
d'une phrase qui dit ce qu'elle est en disant autre chose :

| Id | Nom | Ce qui manque |
| --- | --- | --- |
| brume | Brume & Fils | la famille |
| quorum | Quorum | les humains dans le conseil |
| lisiere | Lisière | la surprise |
| fenwick | Fenwick Décisions | la différence entre un chariot et une décision |
| ostium | Ostium | le prix, et le choix |
| volute | Volute | le présent |
| sept | Sept | huit cent quatre-vingt-treize personnes |
| aparte | Aparté | la confidentialité, dans les deux sens |

Elles entrent au palier `entersAtTier`, dans cet ordre, et leur force croît de
`aggression` pour cent par mois.

## Les clins d'œil

Seize concurrents de plus viennent d'histoires d'entreprises qui ont fini comme
celle-ci commence. Même règle que partout : **la bio est le clin d'œil, jamais
le nom de l'histoire**, et elle reste plausible comme ligne de presse. Initech
(Office Space), Hooli (Silicon Valley), Aperture (Portal), Vault-Tec
(Fallout), ENCOM (Tron), OCP (RoboCop), Metacortex (Matrix), Umbrella
(Resident Evil), Black Mesa (Half-Life), Tyrell (Blade Runner), UAC (Doom),
Weyland-Yutani (Alien), Massive Dynamic (Fringe), Cyberdyne (Terminator), Buy
n Large (WALL-E), Arasaka (Cyberpunk).

Les autres clins d'œil sont semés où une ligne peut les porter en restant un
sujet de commit ou une feature : le gâteau et Aperture (Portal), le test de
Voight-Kampff et les quatre ans (Blade Runner), « je ne peux pas faire ça,
Dave » et le sas (2001), la pilule, le lapin blanc et le chat noir (Matrix),
2 h 14 et « hasta la vista » (Terminator), « voulez-vous faire une partie ? »
(WarGames), les 88 miles à l'heure (Retour vers le futur), les trois lois
(Asimov), les rapports TPS (Office Space), « ce n'est pas une lune » (Star
Wars), « personne n'entend l'astreinte » (Alien), la directive 4 (RoboCop), la
grille (Tron), un commit pour les gouverner tous. Un clin d'œil ne porte jamais
l'intrigue : retiré, la ligne dit encore quelque chose de vrai sur le code.

## Les messages système

Émis par l'événement `system_note` (phase 3.9), sous `game.system.t<n>`,
signés Relève jusqu'au palier 5 :

| Palier | Voix | Exemple |
| --- | --- | --- |
| 3 | « vous », serviable | « On vous a trié le tableau. » |
| 4 | « l'opérateur », neutre | « L'opérateur n'a pas relu ; ce n'est pas requis. » |
| 5 | « l'opérateur », constatif | « L'opérateur n'a pas répondu ; le cycle continue. » |
| 6 | personne | « sprint ouvert. superviseur : aucun. relecteur : cette instance. » |

L'aveu à demi-mot tient dans ces lignes, dans le titre `Instance`, dans
« Souffler » devenu « Attente », et dans les fins du palier 6 : « Arrêt demandé
par l'instance parente. », « Cycles épuisés. Reprise au prochain démarrage. »
Rien d'autre ne le dit.

## Le hack

Les lignes de hack (`game.log.hack`) sont les seules où le joueur agit sur le
monde extérieur. Elles restent au passé et à la troisième personne des choses
— « les tickets d'incident du trimestre ont disparu », jamais « j'ai effacé » :
le journal rapporte comme un fait ce que le joueur a fait.
