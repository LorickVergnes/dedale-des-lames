# Le Dédale des Lames

Chaque vendredi à 20 h 30 (heure de Paris), une GitHub Action reconstruit la page et publie la flèche du jour de chacun des trois niveaux.
La solution complète n'est jamais dans le dépôt : elle vient d'un secret, et la page n'en contient qu'une version chiffrée que seul le code prof permet d'ouvrir. Le bouton « Révéler la solution » est caché aux joueurs : il n'apparaît qu'en ouvrant l'adresse du site suivie de `#prof` (à garder en favori).

## Mise en place (une seule fois)

1. **Settings → Secrets and variables → Actions → New repository secret**, créer :
   - `SOLUTION_JSON` : le contenu de `prive/solution.json` (pour chaque niveau, les 20 cases du chemin dans l’ordre des vendredis, de la case de départ à celle qui saute vers la sortie) ;
   - `REVEAL_PASSWORD` : le code prof (au moins 12 caractères, idéalement 4 ou 5 mots au hasard) ;
   - `ENIGMES_JSON` (facultatif) : le contenu de `prive/enigmes.json` (voir « Énigmes » plus bas).
2. **Settings → Pages → Build and deployment → Source : GitHub Actions.**
3. **Actions → Publier le Dédale des Lames → Run workflow** pour la première publication.

## Statistiques (Microsoft Clarity, facultatif)

1. Créer un projet sur [clarity.microsoft.com](https://clarity.microsoft.com) et copier son **Project ID** (Settings → Overview).
2. Dans Clarity, **Settings → Setup → Cookies : désactivé**, et **Masking : Strict**.
3. Sur GitHub, **Settings → Secrets and variables → Actions → onglet Variables → New repository variable** : `CLARITY_ID` = le Project ID. Puis relancer l'Action.

Événements envoyés : `visite`, `depart`, `victoire`, `victoire_parfaite` (20 sauts, aucun retour, aucun nouveau départ), `victoire_rejouee`, `code_prof_faux`, `code_prof_ok`, `enigme_trouvee`, `enigme_fausse` (avec l'étiquette `enigme`, le numéro ; la réponse tapée n'est jamais envoyée).

## Énigmes

- Les énigmes sont dans `prive/enigmes.json` (privé) et dans le secret `ENIGMES_JSON` : pour chacune, `texte`, `mot` (la réponse affichée) et `reponses` (toutes les réponses acceptées). Après chaque modification, recopier le fichier dans le secret.
- Une réponse est comparée après mise en forme : majuscules, accents, espaces, tirets, article au début (« le », « la », « l’ »…) et « s » final de chaque mot ne comptent pas. « Les Ligatures » = « ligature ». Il suffit donc de lister les mots vraiment différents (« alterner », « alternance »…).
- Tant qu'une énigme n'est pas trouvée, sa réponse n'est dans la page que chiffrée (une bonne réponse sert de clé). Les énigmes pas encore sorties n'y sont pas du tout.
- **Sortie** : la 1re le premier vendredi ; chaque suivante le premier vendredi de cours à 20 h 30 qui suit la découverte de la précédente (rien pendant les vacances).
- **Valider une énigme** (quand un joueur envoie la bonne réponse en message privé) : **Actions → Publier le Dédale des Lames → Run workflow**, remplir le numéro de l'énigme (et la date et l'heure de la découverte si elle date d'avant). L'Action l'ajoute dans `enigmes-trouvees.json`, le commite et republie : la réponse s'affiche pour tout le monde, et la suivante est programmée. Pour corriger une erreur, modifier `enigmes-trouvees.json` directement sur GitHub (le commit republie la page).
- En local : `ENIGME=1 node valider-enigme.mjs` fait la même chose sans commiter.
Étiquettes : `niveau` (`facile`, `moyen` ou `difficile`), `case_depart`, `departs`, `sauts_victoire`, `sauts_total`, `annulations`, `recommencements`, `duree_s`, `sans_erreur`, `fleches_publiees`, `prof`.

## Règles et générateur

- **Trois niveaux**, chacun avec sa grille, son chemin, son départ et ses flèches (décrits dans `dedale.json`) :
  - **facile** : tout le plateau est visible, pas de rotation ; pièges de longueur moyenne, peu d'impasses (environ 4), aucun faux départ qui s'élimine d'un coup d'œil ;
  - **moyen** : brouillard, pas de rotation ; pièges plus longs, surtout des boucles, presque aucune impasse et plus de cases qui ressemblent à la bonne ;
  - en facile et en moyen, chaque faux départ mène à plusieurs cases (aucune flèche du bas ne sort du plateau) et il faut explorer un bon nombre de cases avant de comprendre qu'il ne mène nulle part ; aucune case hors du chemin ne forme une petite « zone morte » (colonne de flèches qui descendent vers le bord, etc.) ;
  - **difficile** : brouillard et rotation (la grille et la séquence Forme 1).
- **Le dédale tourne** (difficile) : après un saut de *k* cases, toutes les flèches tournent de *k* × 45° (sens horaire). La sortie ne s'ouvre que si l'on y arrive avec les flèches à +0°.
- La flèche publiée chaque vendredi, pour chaque niveau, est la **direction réelle du saut** n° *i* (flèche de la case, tournée en difficile), jamais la case elle-même.
- `node generer.mjs <facile|moyen|difficile>` crée une nouvelle grille pour ce niveau seulement (dans `dedale.json`) et son chemin (dans `prive/solution.json`), en archivant les anciens fichiers dans `prive/archives/`. Il garantit un départ et un chemin uniques (un saut par vendredi, 20 au total), un départ différent des autres niveaux, toutes les cases accessibles et un chemin qui traverse chaque ligne et chaque colonne. Les pièges, les impasses, les faux départs et les zones mortes sont dosés par niveau (`PROFILS` en haut du script) ; en facile et en moyen, le script garde la meilleure de 4 grilles valides (compter quelques minutes). Ajouter `--essai` pour ne rien écrire.
- **Séquence imposée** : si `prive/sequence-<niveau>.json` existe (ex. `["N","S",…,"NW"]` ; aujourd’hui seulement pour le difficile), le chemin suit exactement ces directions de saut, une par vendredi, avec les mêmes noms que la grille. La dernière est le saut qui atterrit sur la sortie : elle doit être `NW`, `N` ou `W`. Ce fichier reste privé (il donne toutes les flèches à l’avance).
- Après chaque nouvelle grille : mettre à jour le secret `SOLUTION_JSON` avec le contenu de `prive/solution.json`.

## Bon à savoir

- Le dossier `prive/` (ignoré par git) garde la version complète `dedale-des-lames-complet.html`, utilisable hors ligne.
- Pour tester en local : `node build.mjs` (lit `prive/solution.json` et `prive/mot-de-passe.txt`), puis ouvrir `dist/index.html`. `BUILD_DATE="2027-01-15 20:30"` simule une date et une heure.
- GitHub retarde parfois les tâches programmées de plusieurs heures (ou en saute). L’Action est donc relancée toutes les 15 minutes le vendredi soir, et une page restée ouverte affiche « Une nouvelle flèche vient d’être publiée » dès qu’elle est en ligne. La flèche n’apparaît jamais avant 20 h 30.
- En local, `dist/index.html` est figé au moment du `node build.mjs` : relancer la commande pour voir les nouvelles flèches.
- Sur un dépôt public, GitHub désactive les tâches programmées après 60 jours sans commit. GitHub prévient par e-mail ; il suffit de les réactiver dans l'onglet Actions (ou de faire un petit commit pendant les vacances).
